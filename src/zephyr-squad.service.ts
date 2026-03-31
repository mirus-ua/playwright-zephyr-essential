import type { PathLike } from 'fs';
import type { AxiosError } from 'axios';

import { createHmac, createHash } from 'crypto';
import axios from 'axios';
import { getBorderCharacters, table } from 'table';
import { inspect } from 'util';
import { createReadStream } from 'fs';
import { bold, green, gray } from 'picocolors';
import FormData from 'form-data';
import { validateSquadOptions } from './validate-squad-options';

export interface ZephyrSquadOptions {
  accessKey: string;
  secretKey: string;
  accountId: string;
  projectKey: string;
  testCycle?: ZephyrSquadTestCycle;
}

export type ZephyrSquadTestCycle = {
  name?: string;
  versionName?: string;
  folderName?: string;
  createNewCycle?: boolean;
  createNewFolder?: boolean;
};

function isAxiosError(error: any): error is AxiosError {
  return error.isAxiosError === true;
}

/**
 * Generates a per-request JWT token for Zephyr Squad Cloud (formerly Zephyr for Jira Cloud).
 *
 * Algorithm (HMAC-SHA256):
 *   1. Build the canonical query string hash (qsh):
 *      canonical = "<METHOD>&<url_path>&<query_string>"
 *      qsh = SHA-256(canonical).hex()
 *   2. Build JWT payload: { sub, qsh, iss, iat, exp }
 *   3. Sign: HMAC-SHA256(secretKey, base64url(header) + "." + base64url(payload))
 *
 * References:
 *   https://zephyrdocs.atlassian.net/wiki/spaces/ZFJCLOUD/pages/2000060602
 *   https://zephyrdocs.atlassian.net/wiki/spaces/ZFJCLOUD/pages/1925120024/REST+API
 */
export function generateSquadJwt(
  method: string,
  urlPath: string,
  queryString: string,
  accessKey: string,
  secretKey: string,
  accountId: string,
): string {
  const canonical = `${method.toUpperCase()}&${urlPath}&${queryString}`;
  const qsh = createHash('sha256').update(canonical).digest('hex');

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: accountId,
    qsh,
    iss: accessKey,
    iat: now,
    exp: now + 3600,
  };

  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${b64Header}.${b64Payload}`;
  const signature = createHmac('sha256', secretKey).update(signingInput).digest('base64url');

  return `${signingInput}.${signature}`;
}

export class ZephyrSquadService {
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly accountId: string;
  private readonly projectKey: string;
  private readonly testCycle: ZephyrSquadTestCycle | undefined;
  private readonly baseUrl = 'https://prod-vortexapi.zephyr4jiracloud.com';
  private readonly defaultRunName = `Automated Playwright run - [${new Date().toUTCString()}]`;

  constructor(options: ZephyrSquadOptions) {
    validateSquadOptions(options);

    this.accessKey = options.accessKey;
    this.secretKey = options.secretKey;
    this.accountId = options.accountId;
    this.projectKey = options.projectKey;
    this.testCycle = options.testCycle;
  }

  async createRun(testResults: PathLike) {
    const urlPath = '/api/v1/automation/job/create';
    const jwt = generateSquadJwt('POST', urlPath, '', this.accessKey, this.secretKey, this.accountId);

    const cycleOptions = this.testCycle ?? {};
    const data = new FormData();
    data.append('file', createReadStream(testResults));
    data.append('jobName', cycleOptions.name ?? this.defaultRunName);
    data.append('automationFramework', 'Playwright');
    data.append('projectKey', this.projectKey);
    data.append('cycleName', cycleOptions.name ?? this.defaultRunName);
    data.append('versionName', cycleOptions.versionName ?? 'Unscheduled');
    data.append('createNewCycle', String(cycleOptions.createNewCycle ?? true));
    data.append('createNewFolder', String(cycleOptions.createNewFolder ?? false));
    data.append('accountId', this.accountId);

    if (cycleOptions.folderName) {
      data.append('folderName', cycleOptions.folderName);
    }

    try {
      const response = await axios({
        url: `${this.baseUrl}${urlPath}`,
        method: 'POST',
        headers: {
          accessKey: this.accessKey,
          jwt,
          ...data.getHeaders(),
        },
        data,
      });

      if (response.status !== 200) throw new Error(`${response.status} - Failed to create automation job`);

      const { message } = response.data as { message: string };
      this.printReportDetails(message);

      return response.data;
    } catch (error) {
      this.handleAxiosError(error);
    }
  }

  printReportDetails(message: string): void {
    const tableData = [[bold(green(`✅ ${message}`))], [bold(gray('Check your Zephyr Squad project for the test cycle results.'))]];

    const report = table(tableData, {
      border: getBorderCharacters('norc'),
      singleLine: true,
    });

    console.log(bold('\n📋 Zephyr Squad Report details:'));
    console.log(report);
  }

  handleAxiosError(error: unknown): void {
    if (isAxiosError(error)) {
      console.error(`Config: ${inspect(error.config)}`);

      if (error.response) {
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
