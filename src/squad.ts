import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import type { ZephyrSquadOptions } from './zephyr-squad.service';

import { gray } from 'picocolors';

import { archiveReport } from './archive-report';
import { convertStatus } from './convert-status';
import { createJsonReport } from './create-report-file';
import { validateSquadOptions } from './validate-squad-options';
import { ZephyrSquadService } from './zephyr-squad.service';

type ZephyrSquadTestResult = {
  result: string;
  testCase: {
    key: string;
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
          comment,
        },
      });
    }
  }

  async onEnd() {
    if (this.testResults.length > 0) {
      const testResultsPath = 'test-results/zephyr';
      const zephyrReportName = `zephyr-squad-report-${new Date().getTime()}.json`;
      createJsonReport(zephyrReportName, testResultsPath, this.testResults);

      const zephyrReportPath = archiveReport(zephyrReportName, testResultsPath);

      await this.zephyrService.createRun(zephyrReportPath);
    } else {
      console.log(gray(`[zephyr squad reporter]: There's no Zephyr test case id in this spec file`));
    }
  }
}
