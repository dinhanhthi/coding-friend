import { runJson } from "../lib/output.js";
import { collectVersionInfo, type HostVersion } from "../lib/version-info.js";

function hostLabel(host: HostVersion): string {
  if (host.version) return host.version;
  return host.installed ? "(installed)" : "(not installed)";
}

export async function versionCommand(
  cliVersion: string,
  opts: { json?: boolean },
): Promise<void> {
  if (opts.json) {
    await runJson(() => collectVersionInfo(cliVersion));
    return;
  }
  const info = collectVersionInfo(cliVersion);
  console.log(`CLI    ${info.cli}`);
  for (const [name, host] of Object.entries(info.hosts)) {
    console.log(`${name.padEnd(6)} ${hostLabel(host)}`);
  }
}
