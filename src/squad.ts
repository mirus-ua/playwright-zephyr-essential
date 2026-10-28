import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import type { ZephyrSquadOptions } from './zephyr-squad.service';

import { gray, yellow } from 'picocolors';

import { convertStatus } from './convert-status';
import { createJUnitXmlReport } from './create-report-file';
import { validateSquadOptions } from './validate-squad-options';
import { ZephyrSquadService } from './zephyr-squad.service';
import { join } from 'path';

type ZephyrSquadTestResult = {
  result: string;
  testCase: {
    key: string;
    title: string;
    comment: string | undefined;
  };
};

export default class ZephyrSquadReporter implements Reporter {
  private zephyrService!: ZephyrSquadService;
  // Keyed by test.id: each retry overwrites the previous attempt, so only the final one is reported
  private testResults = new Map<string, ZephyrSquadTestResult>();
  private projectKey!: string;
  private testCaseKeyPattern = /\[(.*?)\]/;
  private options: ZephyrSquadOptions;

  constructor(options: ZephyrSquadOptions) {
    this.options = validateSquadOptions(options);
  }

  async onBegin() {
    this.projectKey = this.options.projectKey;
    this.zephyrService = new ZephyrSquadService(this.options);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (test.title.match(this.testCaseKeyPattern) && test.title.match(this.testCaseKeyPattern)!.length > 1) {
      const [, testCaseId] = test.title.match(this.testCaseKeyPattern)!;
      // Accept both [T123] and [PROJ-T123]; don't prefix an id that already carries the project key
      const testCaseKey = testCaseId!.startsWith(`${this.projectKey}-`) ? testCaseId! : `${this.projectKey}-${testCaseId}`;
      // Strip the leading [suffix] bracket from the title for a clean display name
      const title = test.title.replace(this.testCaseKeyPattern, '').trim();
      const status = convertStatus(result.status);
      const comment = result.error
        ? `<b>❌ Error Message: </b> <br> <span style="color: rgb(226, 80, 65);">${result.error?.message?.replaceAll(
            '\n',
            '<br>',
          )}</span> <br> <br> <b>🧱 Stack Trace:</b> <br> <span style="color: rgb(226, 80, 65);">${result.error?.stack?.replaceAll(
            '\n',
            '<br>',
          )}</span>`
        : undefined;

      this.testResults.set(test.id, {
        result: status,
        testCase: {
          key: testCaseKey,
          title,
          comment,
        },
      });
    }
  }

  async onEnd() {
    const testResults = [...this.testResults.values()];

    if (testResults.length > 0) {
      this.warnAboutSharedKeys(testResults);

      const testResultsPath = 'test-results/zephyr';
      const reportName = `zephyr-squad-report-${new Date().getTime()}.xml`;
      createJUnitXmlReport(reportName, testResultsPath, testResults);

      const reportPath = join(process.cwd(), testResultsPath, reportName);
      await this.zephyrService.createRun(reportPath);
    } else {
      console.log(gray(`[zephyr squad reporter]: There's no Zephyr test case id in this spec file`));
    }
  }

  // Zephyr rejects the whole JUnit upload ("Test Case Key <key> is missing") when one key appears under different names
  private warnAboutSharedKeys(testResults: ZephyrSquadTestResult[]) {
    const titlesByKey = new Map<string, Set<string>>();
    for (const { testCase } of testResults) {
      const titles = titlesByKey.get(testCase.key) ?? new Set<string>();
      titles.add(testCase.title);
      titlesByKey.set(testCase.key, titles);
    }

    for (const [key, titles] of titlesByKey) {
      if (titles.size > 1) {
        const list = [...titles].map((title) => `  - "${title}"`).join('\n');
        console.warn(
          yellow(
            `[zephyr squad reporter]: Test case key ${key} is used by ${titles.size} tests with different titles:\n${list}\n` +
              `Zephyr Squad will likely reject the whole upload with "Test Case Key ${key} is missing". Give each test its own key.`,
          ),
        );
      }
    }
  }
}
