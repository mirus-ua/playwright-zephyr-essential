import type { ZephyrSquadOptions } from './zephyr-squad.service';

export function validateSquadOptions(options: ZephyrSquadOptions): ZephyrSquadOptions {
  if (!options.projectKey) throw new Error('"projectKey" option is missing in the config');
  if (!options.accessKey) throw new Error('"accessKey" option is missing in the config');
  if (!options.secretKey) throw new Error('"secretKey" option is missing in the config');
  if (!options.accountId) throw new Error('"accountId" option is missing in the config');

  return options;
}
