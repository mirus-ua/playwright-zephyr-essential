import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import type { ZephyrSquadOptions } from './zephyr-squad.service';

import { gray } from 'picocolors';

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
  private testResults: ZephyrSquadTestResult[] = [];
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
      const testCaseKey = `${this.projectKey}-${testCaseId}`;
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

      this.testResults.push({
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
    if (this.testResults.length > 0) {
      const testResultsPath = 'test-results/zephyr';
      const reportName = `zephyr-squad-report-${new Date().getTime()}.xml`;
      createJUnitXmlReport(reportName, testResultsPath, this.testResults);

      const reportPath = join(process.cwd(), testResultsPath, reportName);
      await this.zephyrService.createRun(reportPath);
    } else {
      console.log(gray(`[zephyr squad reporter]: There's no Zephyr test case id in this spec file`));
    }
  }
}
