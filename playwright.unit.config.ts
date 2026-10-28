// Unit tests for the reporters themselves; no browser is launched
import { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  testDir: './tests/unit',
  reporter: 'list',
};
export default config;
