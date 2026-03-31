# playwright-zephyr-essential

Playwright test reporter for **Zephyr Squad (Essential)**, **Zephyr Scale Cloud**, and **Zephyr Server/DC**.

This is a fork of [playwright-zephyr](https://github.com/elaichenkov/playwright-zephyr) that adds support for **Zephyr Squad** (formerly Zephyr for Jira Cloud / Zephyr Essential) — a separate product from Zephyr Scale with its own API and authentication scheme.

## Install

```sh
npm install playwright-zephyr-essential
```

---

## Reporters

| Reporter                         | Product                                      | Import path                         |
| -------------------------------- | -------------------------------------------- | ----------------------------------- |
| [Squad](#zephyr-squad-essential) | Zephyr Squad (Essential) — Jira Cloud add-on | `playwright-zephyr-essential/squad` |
| [Cloud](#zephyr-scale-cloud)     | Zephyr Scale Cloud (SmartBear)               | `playwright-zephyr-essential/cloud` |
| [Server](#zephyr-serverdc)       | Zephyr Scale Server / Data Center            | `playwright-zephyr-essential`       |

---

## Zephyr Squad (Essential)

**Zephyr Squad** (formerly "Zephyr for Jira Cloud") is a Jira Cloud app by SmartBear. Its API is at `prod-vortexapi.zephyr4jiracloud.com` and uses a different authentication scheme than Zephyr Scale.

### Prerequisites

1. In Jira, go to your project → **Zephyr** → **API Keys** → click **Generate**.
2. Copy both the **Access Key** and **Secret Key**.
3. Get your **Atlassian Account ID** from your Jira profile URL:
   `https://yourcompany.atlassian.net/people/YOUR_ACCOUNT_ID`

### Configuration

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    [
      'playwright-zephyr-essential/squad',
      {
        accessKey: process.env.ZEPHYR_ACCESS_KEY, // from Jira → Zephyr → API Keys
        secretKey: process.env.ZEPHYR_SECRET_KEY, // from Jira → Zephyr → API Keys
        accountId: process.env.JIRA_ACCOUNT_ID, // your Atlassian account ID
        projectKey: 'MYPROJ',
        testCycle: {
          name: `Playwright run - ${new Date().toISOString()}`,
          versionName: 'Unscheduled', // Jira release/version name
          createNewCycle: true,
          // folderName:  'Regression',   // optional folder within the cycle
        },
      },
    ],
  ],
});
```

### Test titles

Include the Zephyr test case ID inside square brackets anywhere in the test title:

```typescript
test('[123] login page renders correctly', async ({ page }) => {
  await page.goto('https://example.com/login');
  await expect(page.locator('h1')).toBeVisible();
});
```

The number `123` maps to test case `MYPROJ-123` in Zephyr Squad.

### Output

```
Zephyr Squad Report details:
╔══════════════════════════════════════════════════════════════════╗
║ ✅ Job has been successfully created, Job id is : 726FAE2BD1...  ║
║ Check your Zephyr Squad project for the test cycle results.      ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## Zephyr Scale Cloud

**Zephyr Scale Cloud** (by SmartBear) uses a long-lived bearer token from `https://smartbear.com`.

### Prerequisites

Get your API token from: **Zephyr Scale** → **Settings** → **API Access Tokens**
([docs](https://tm4j-cloud.elevio.help/en/articles/164))

### Configuration

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    [
      'playwright-zephyr-essential/cloud',
      {
        projectKey: 'MYPROJ',
        authorizationToken: process.env.ZEPHYR_AUTH_TOKEN,
        testCycle: {
          name: `Playwright run - ${new Date().toISOString()}`,
          // description: 'Automated regression run',
          // jiraProjectVersion: 10001,
          // folderId: 1234,
          // customFields: { Browser: 'Chrome', Device: 'macOS' },
        },
      },
    ],
  ],
});
```

### Test titles

```typescript
test('[J79] basic test', async ({ page }) => {
  await page.goto('https://playwright.dev/');
  await expect(page.locator('.navbar__title')).toHaveText('Playwright');
});
```

---

## Zephyr Server/DC

**Zephyr Scale Server** and **Data Center** use a Jira-hosted API with basic auth or a personal access token.

### Configuration

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    [
      'playwright-zephyr-essential',
      {
        host: 'https://jira.your-company.com',
        authorizationToken: process.env.ZEPHYR_AUTH_TOKEN,
        projectKey: 'MYPROJ',
      },
    ],
  ],
});
```

---

## Publishing this package (maintainer notes)

### 1. Create the GitHub repository

```sh
# Create https://github.com/mirus-ua/playwright-zephyr-essential on GitHub, then:
git remote set-url origin https://github.com/mirus-ua/playwright-zephyr-essential.git
git push -u origin main
```

### 2. Log in to npm

```sh
npm login
# Enter your npm username, password, and OTP if 2FA is enabled
```

### 3. Build and publish

```sh
npm run build    # compiles TypeScript → lib/src/
npm publish      # publishes to npm registry
```

> If your npm account requires 2FA for publishing: `npm publish --otp=<your-otp>`

### 4. Subsequent releases

Bump the version in `package.json`, then:

```sh
npm run build && npm publish
```

Or use the built-in release script:

```sh
npm run release:patch   # 1.0.0 → 1.0.1
npm run release:minor   # 1.0.0 → 1.1.0
npm run release:major   # 1.0.0 → 2.0.0
```

---

## License

MIT — see [LICENSE](./LICENSE).

Original work by [Yevhen Laichenkov](https://github.com/elaichenkov/playwright-zephyr).
Zephyr Squad support added by [mirus-ua](https://github.com/mirus-ua).
