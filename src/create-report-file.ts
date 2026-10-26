import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Cloud (Zephyr Scale) reporter — custom JSON format
// ---------------------------------------------------------------------------
export function createJsonReport(filename: string, filePath: string, executionResults: unknown): void {
  const jsonReport = JSON.stringify({ version: 1, executions: executionResults }, null, 2);
  const jsonReportPath = join(process.cwd(), filePath, filename);

  try {
    createDirectory(filePath);
    writeFileSync(jsonReportPath, jsonReport);
  } catch (error) {
    console.log(`Something went wrong while creating the report. ${error}`);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Squad reporter — JUnit XML format
// ---------------------------------------------------------------------------

export type JUnitTestResult = {
  result: string;
  testCase: {
    key: string;
    title: string;
    comment: string | undefined;
  };
};

// ANSI escape sequences (CSI, e.g. colour codes, and OSC, e.g. hyperlinks) that Playwright puts in error messages
const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
// Anything outside the XML 1.0 Char production; one such character makes the whole report unparseable
const INVALID_XML_CHARS = /[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]/gu;

function sanitizeXml(text: string): string {
  return text.replace(ANSI_PATTERN, '').replace(INVALID_XML_CHARS, '');
}

function escapeXml(text: string): string {
  return sanitizeXml(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cdata(text: string): string {
  // A literal "]]>" would end the section early, so split it across two CDATA sections
  return `<![CDATA[${sanitizeXml(text).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

export function createJUnitXmlReport(filename: string, filePath: string, testResults: JUnitTestResult[]): void {
  const total = testResults.length;
  const failures = testResults.filter((r) => r.result === 'Failed' || r.result === 'Blocked').length;
  const skipped = testResults.filter((r) => r.result === 'Not Executed').length;

  const testcases = testResults
    .map((r) => {
      const name = escapeXml(`${r.testCase.key} ${r.testCase.title}`);
      const classname = escapeXml(r.testCase.key);
      const open = `    <testcase name="${name}" classname="${classname}" time="0">`;
      const close = `    </testcase>`;

      if (r.result === 'Failed' || r.result === 'Blocked') {
        const msg = escapeXml(r.testCase.comment ?? r.result);
        return `${open}\n      <failure message="${msg}">${cdata(r.testCase.comment ?? '')}</failure>\n${close}`;
      }

      if (r.result === 'Not Executed') {
        return `${open}\n      <skipped/>\n${close}`;
      }

      // Passed
      return `${open}\n${close}`;
    })
    .join('\n');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites>`,
    `  <testsuite name="Playwright E2E" tests="${total}" failures="${failures}" errors="0" skipped="${skipped}" time="0">`,
    testcases,
    `  </testsuite>`,
    `</testsuites>`,
  ].join('\n');

  const reportPath = join(process.cwd(), filePath, filename);

  try {
    createDirectory(filePath);
    writeFileSync(reportPath, xml, 'utf8');
  } catch (error) {
    console.log(`Something went wrong while creating the report. ${error}`);
    throw error;
  }
}

function createDirectory(filePath: string) {
  if (!existsSync(filePath)) {
    mkdirSync(filePath, { recursive: true });
  }
}
