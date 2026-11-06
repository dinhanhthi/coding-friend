import {
  getCliVersion,
  getLatestCliVersion,
  getLatestVersion,
  getStatuslineVersion,
  isCliGlobalLinked,
  semverCompare,
} from "../commands/update.js";
import type { Host } from "./host.js";
import { collectVersionInfo } from "./version-info.js";

export interface HostUpdateCheck {
  host: Host;
  installed: boolean;
  current: string | null;
  updateAvailable: boolean | null;
}

export interface UpdateCheck {
  cli: {
    current: string;
    latest: string | null;
    updateAvailable: boolean | null;
    linked: boolean;
  };
  plugin: { latest: string | null };
  hosts: HostUpdateCheck[];
  statusline: { current: string | null };
}

/** null when either side is unknown (not installed, or latest unreachable). */
function isBehind(
  current: string | null,
  latest: string | null,
): boolean | null {
  if (!current || !latest) return null;
  return semverCompare(current.replace(/^v/, ""), latest.replace(/^v/, "")) < 0;
}

/** Read-only update check: compares installed versions with the latest releases. No side effects. */
export function collectUpdateCheck(cliVersion?: string): UpdateCheck {
  const current = cliVersion ?? getCliVersion();
  const latestCli = getLatestCliVersion();
  const latestPlugin = getLatestVersion();
  const { hosts } = collectVersionInfo(current);

  return {
    cli: {
      current,
      latest: latestCli,
      updateAvailable: isBehind(current, latestCli),
      linked: isCliGlobalLinked(),
    },
    plugin: { latest: latestPlugin },
    hosts: (Object.keys(hosts) as Host[]).map((host) => ({
      host,
      installed: hosts[host].installed,
      current: hosts[host].version,
      updateAvailable: isBehind(hosts[host].version, latestPlugin),
    })),
    statusline: { current: getStatuslineVersion() },
  };
}
