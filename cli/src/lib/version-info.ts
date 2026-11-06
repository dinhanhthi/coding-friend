import { getInstalledVersion } from "./statusline.js";
import { getCodexInstalledVersion } from "./codex-config.js";
import { readAgyPluginVersion } from "./agy-config.js";
import { readDevinPluginVersion } from "./devin-config.js";
import { isOmpAgentInstalled } from "./omp-config.js";
import { CONTRACT_VERSION } from "./output.js";

export interface HostVersion {
  installed: boolean;
  version: string | null;
}

export interface VersionInfo {
  cli: string;
  contractVersion: typeof CONTRACT_VERSION;
  hosts: {
    claude: HostVersion;
    codex: HostVersion;
    omp: HostVersion;
    agy: HostVersion;
    devin: HostVersion;
  };
}

const NOT_INSTALLED: HostVersion = { installed: false, version: null };

/** A host is installed when its helper reports a version; a throw counts as not installed. */
function fromVersion(read: () => string | null): HostVersion {
  try {
    const version = read();
    return version ? { installed: true, version } : { ...NOT_INSTALLED };
  } catch {
    return { ...NOT_INSTALLED };
  }
}

function ompVersion(): HostVersion {
  try {
    const installed =
      isOmpAgentInstalled("user") || isOmpAgentInstalled("project");
    return { installed, version: null };
  } catch {
    return { ...NOT_INSTALLED };
  }
}

/** Read-only snapshot of the CLI and per-host plugin versions. Never prompts or exits. */
export function collectVersionInfo(cliVersion: string): VersionInfo {
  return {
    cli: cliVersion,
    contractVersion: CONTRACT_VERSION,
    hosts: {
      claude: fromVersion(getInstalledVersion),
      codex: fromVersion(() => getCodexInstalledVersion()),
      omp: ompVersion(),
      agy: fromVersion(readAgyPluginVersion),
      devin: fromVersion(readDevinPluginVersion),
    },
  };
}
