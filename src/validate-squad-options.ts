import type { ZephyrSquadOptions } from './zephyr-squad.service';

export function validateSquadOptions(options: ZephyrSquadOptions): ZephyrSquadOptions {
  if (!options.projectKey) throw new Error('"projectKey" option is missing in the config');
  if (!options.token) throw new Error('"token" option is missing in the config');

  return options;
}
