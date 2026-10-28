import type { AxiosAdapter } from 'axios';
import type { Readable } from 'stream';

import { test, expect } from '@playwright/test';
import axios from 'axios';
import { writeFileSync } from 'fs';

import { ZephyrSquadService, type ZephyrSquadOptions } from '../../src/zephyr-squad.service';

let originalAdapter: typeof axios.defaults.adapter;
let originalLog: typeof console.log;
let warnings: string[];
let originalWarn: typeof console.warn;

// Answer the upload locally and keep the multipart body it would have sent
let sentBody: string;

test.beforeEach(() => {
  sentBody = '';
  originalAdapter = axios.defaults.adapter;
  const adapter: AxiosAdapter = async (config) => {
    // form-data is a classic stream, not async iterable
    const form = config.data as Readable;
    sentBody = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      form.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      form.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      form.on('error', reject);
      form.resume();
    });
    return { data: { message: 'ok' }, status: 200, statusText: 'OK', headers: {}, config };
  };
  axios.defaults.adapter = adapter;

  originalLog = console.log;
  console.log = () => {};
  warnings = [];
  originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.join(' '));
});

test.afterEach(() => {
  axios.defaults.adapter = originalAdapter;
  console.log = originalLog;
  console.warn = originalWarn;
});

async function sentTestCycle(options: Partial<ZephyrSquadOptions>, testInfo: { outputPath(name: string): string }) {
  const report = testInfo.outputPath('report.xml');
  writeFileSync(report, '<testsuites/>');

  await new ZephyrSquadService({ token: 'token', projectKey: 'PDT', cycleName: 'Nightly', ...options }).createRun(report);

  const part = sentBody.match(/name="testCycle"[^]*?\r\n\r\n(.*?)\r\n/);
  expect(part, 'testCycle form part').not.toBeNull();
  return JSON.parse(part![1]!);
}

test.describe('testCycle form part', () => {
  test('includes folderId when it is set', async ({}, testInfo) => {
    expect(await sentTestCycle({ folderId: 1234 }, testInfo)).toEqual({ name: 'Nightly', folderId: 1234 });
  });

  test('leaves folderId out when it is not set', async ({}, testInfo) => {
    expect(await sentTestCycle({}, testInfo)).toEqual({ name: 'Nightly' });
  });

  test('leaves folderId out and warns when it is not a number', async ({}, testInfo) => {
    // What Number(process.env.ZEPHYR_FOLDER_ID) gives when the variable is unset
    expect(await sentTestCycle({ folderId: NaN }, testInfo)).toEqual({ name: 'Nightly' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('folderId NaN');
  });
});
