import type { TestCase, TestResult } from '@playwright/test/reporter';

import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync } from 'fs';

import ZephyrSquadReporter from '../../src/squad';

type Status = TestResult['status'];

function fakeTest(id: string, title: string): TestCase {
  return { id, title } as TestCase;
}

function fakeResult(status: Status): TestResult {
  return { status, error: status === 'passed' ? undefined : { message: 'boom', stack: 'at spec.ts:1' } } as TestResult;
}

// Runs the reporter end to end with the upload stubbed and returns the JUnit XML it would have sent
async function report(results: [TestCase, Status][]): Promise<string> {
  const reporter = new ZephyrSquadReporter({ token: 'token', projectKey: 'PDT' });
  await reporter.onBegin();

  let xml = '';
  (reporter as unknown as { zephyrService: { createRun(path: string): Promise<void> } }).zephyrService = {
    createRun: async (path) => {
      xml = readFileSync(path, 'utf8');
    },
  };

  for (const [testCase, status] of results) reporter.onTestEnd(testCase, fakeResult(status));
  await reporter.onEnd();
  return xml;
}

function testcases(xml: string): string[] {
  return [...xml.matchAll(/<testcase name="([^"]*)"/g)].map((match) => match[1]!);
}

let originalCwd: string;

// The reporter writes its XML under the working directory, so give each test its own
test.beforeEach(async ({}, testInfo) => {
  originalCwd = process.cwd();
  mkdirSync(testInfo.outputDir, { recursive: true });
  process.chdir(testInfo.outputDir);
});

test.afterEach(async () => {
  process.chdir(originalCwd);
});

test.describe('test case key', () => {
  test('prefixes a bare id with the project key', async () => {
    const xml = await report([[fakeTest('a', '[T286] bare id'), 'passed']]);

    expect(testcases(xml)).toEqual(['PDT-T286 bare id']);
  });

  test('keeps an id that already carries the project key', async () => {
    const xml = await report([[fakeTest('a', '[PDT-T286] prefixed id'), 'passed']]);

    expect(testcases(xml)).toEqual(['PDT-T286 prefixed id']);
    expect(xml).not.toContain('PDT-PDT-');
  });

  test('still prefixes an id that only starts with the project key letters', async () => {
    const xml = await report([[fakeTest('a', '[PDTX-1] other project'), 'passed']]);

    expect(testcases(xml)).toEqual(['PDT-PDTX-1 other project']);
  });
});

test.describe('retries', () => {
  test('reports only the final attempt of a test that keeps failing', async () => {
    const flaky = fakeTest('a', '[T1] always fails');
    const xml = await report([
      [flaky, 'failed'],
      [flaky, 'failed'],
      [flaky, 'timedOut'],
    ]);

    expect(testcases(xml)).toEqual(['PDT-T1 always fails']);
    expect(xml).toContain('tests="1" failures="1"');
  });

  test('reports a test that passes on retry as passed', async () => {
    const flaky = fakeTest('a', '[T1] flaky');
    const xml = await report([
      [flaky, 'failed'],
      [flaky, 'passed'],
    ]);

    expect(testcases(xml)).toEqual(['PDT-T1 flaky']);
    expect(xml).toContain('tests="1" failures="0"');
    expect(xml).not.toContain('<failure');
  });

  test('keeps distinct tests apart', async () => {
    const xml = await report([
      [fakeTest('a', '[T1] first'), 'passed'],
      [fakeTest('b', '[T2] second'), 'failed'],
      [fakeTest('b', '[T2] second'), 'passed'],
    ]);

    expect(testcases(xml)).toEqual(['PDT-T1 first', 'PDT-T2 second']);
  });
});

test.describe('shared key warning', () => {
  let warnings: string[];
  let originalWarn: typeof console.warn;

  test.beforeEach(() => {
    warnings = [];
    originalWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args.join(' '));
  });

  test.afterEach(() => {
    console.warn = originalWarn;
  });

  test('names both titles when one key is used by two different tests', async () => {
    await report([
      [fakeTest('a', '[T2569] Amazon connects'), 'passed'],
      [fakeTest('b', '[PDT-T2569] Microsoft connects'), 'passed'],
      [fakeTest('c', '[T1] unrelated'), 'passed'],
    ]);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('PDT-T2569');
    expect(warnings[0]).toContain('"Amazon connects"');
    expect(warnings[0]).toContain('"Microsoft connects"');
  });

  test('stays quiet for retries of the same test', async () => {
    const flaky = fakeTest('a', '[T1] flaky');
    await report([
      [flaky, 'failed'],
      [flaky, 'passed'],
    ]);

    expect(warnings).toEqual([]);
  });
});
