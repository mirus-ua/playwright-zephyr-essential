import type { PathLike } from 'fs';
import type { AxiosError } from 'axios';

import axios from 'axios';
import { getBorderCharacters, table } from 'table';
import { inspect } from 'util';
import { createReadStream } from 'fs';
import { bold, green, gray, yellow } from 'picocolors';
import FormData from 'form-data';
import { validateSquadOptions } from './validate-squad-options';

export interface ZephyrSquadOptions {
  token: string;
  projectKey: string;
  /** Override the auto-generated test cycle name.
   *  Defaults to "Automated Playwright run - <UTC timestamp>". */
  cycleName?: string;
}

function isAxiosError(error: unknown): error is AxiosError {
  return (error as AxiosError).isAxiosError === true;
}

function maskToken(token: string): string {
  if (token.length <= 14) return '***';
  return `${token.slice(0, 10)}...${token.slice(-4)} (${token.length} chars)`;
}

function isErrorBody(data: unknown): boolean {
  if (data == null || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (typeof d['error'] === 'string') return true;
  if (typeof d['message'] === 'string' && /token|unauthorized|invalid|forbidden|error/i.test(d['message'])) return true;
  return false;
}

export class ZephyrSquadService {
  private readonly token: string;
  private readonly projectKey: string;
  private readonly cycleName: string;
  private readonly baseUrl = 'https://prod-api.zephyr4jiracloud.com/v2';

  constructor(options: ZephyrSquadOptions) {
    validateSquadOptions(options);

    this.token = options.token.trim();
    this.projectKey = options.projectKey;
    this.cycleName = options.cycleName ?? `Automated Playwright run - [${new Date().toUTCString()}]`;
  }

  async createRun(testResults: PathLike) {
    const url = `${this.baseUrl}/automations/executions/junit?projectKey=${this.projectKey}&autoCreateTestCases=false`;

    const data = new FormData();
    data.append('file', createReadStream(testResults), {
      contentType: 'application/xml',
      filename: 'results.xml',
    });
    data.append('testCycle', JSON.stringify({ name: this.cycleName }), {
      contentType: 'application/json',
      filename: 'blob',
    });

    console.log(bold(yellow('\n[zephyr] ── request ──────────────────────────────────')));
    console.log(`[zephyr] POST ${url}`);
    console.log(`[zephyr] Authorization: Bearer ${maskToken(this.token)}`);
    console.log(`[zephyr] projectKey: ${this.projectKey}`);
    console.log(`[zephyr] cycleName:  ${this.cycleName}`);

    try {
      const response = await axios({
        url,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...data.getHeaders(),
        },
        data,
      });

      console.log(bold(yellow('\n[zephyr] ── response ─────────────────────────────────')));
      console.log(`[zephyr] HTTP ${response.status}`);
      console.log(`[zephyr] body: ${inspect(response.data, { depth: 5, colors: true })}`);

      if (response.status < 200 || response.status >= 300 || isErrorBody(response.data)) {
        throw new Error(`API error (HTTP ${response.status}): ${inspect(response.data)}`);
      }

      this.printReportDetails(response.data);
      return response.data;
    } catch (error) {
      this.handleAxiosError(error);
    }
  }

  printReportDetails(data: unknown): void {
    const summary = data && typeof data === 'object' && 'message' in data ? String((data as { message: string }).message) : inspect(data);

    const tableData = [[bold(green(`✅ ${summary}`))], [bold(gray('Check your Zephyr Essential project for the test cycle results.'))]];

    const report = table(tableData, {
      border: getBorderCharacters('norc'),
      singleLine: true,
    });

    console.log(bold('\n📋 Zephyr Essential Report details:'));
    console.log(report);
  }

  handleAxiosError(error: unknown): void {
    if (isAxiosError(error)) {
      console.log(bold(yellow('\n[zephyr] ── axios error ──────────────────────────────')));
      console.error(`[zephyr] message: ${error.message}`);

      if (error.response) {
        console.error(`[zephyr] HTTP ${error.response.status}`);
        console.error(`[zephyr] headers: ${inspect(error.response.headers)}`);
        console.error(`[zephyr] body:    ${inspect(error.response.data)}`);
        throw new Error(
          `\nStatus: ${error.response.status} \nHeaders: ${inspect(error.response.headers)} \nData: ${inspect(error.response.data)}`,
        );
      } else if (error.request) {
        throw new Error(`The request was made but no response was received. \n Error: ${inspect(error.toJSON())}`);
      } else {
        throw new Error(`Something happened in setting up the request that triggered an Error\n : ${inspect(error.message)}`);
      }
    }

    throw new Error(`\nUnknown error: ${error}`);
  }
}
