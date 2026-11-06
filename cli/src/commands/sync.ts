import { log } from "../lib/log.js";
import { readJson } from "../lib/json.js";
import { globalConfigPath } from "../lib/paths.js";
import { runHuman, runJson } from "../lib/output.js";
import { syncStatus, type SyncKindStatus } from "../lib/sync-status.js";
import type { CodingFriendConfig } from "../types.js";

/** Sync status of the stores set in the global config (never the merged one). */
function globalSyncStatus() {
  return syncStatus(readJson<CodingFriendConfig>(globalConfigPath()));
}

function formatKind(k: SyncKindStatus): string {
  const where = k.cloud ? `${k.cloud.provider} (${k.cloud.root})` : "local";
  const dir = `${k.dir}${k.exists ? "" : " (missing)"}`;
  const counts = `${k.files} files, ${k.placeholders} placeholders, ${k.conflicts} conflicts`;
  return `${k.kind}: ${dir}  ${where}  ${counts}${k.truncated ? " (truncated)" : ""}`;
}

export async function syncStatusCommand(
  opts: { json?: boolean } = {},
): Promise<void> {
  if (opts.json) {
    await runJson(() => globalSyncStatus());
    return;
  }
  await runHuman(() => {
    const s = globalSyncStatus();
    for (const k of s.kinds) log.info(formatKind(k));
    log.dim(
      "  Not synced: the global config and the project list stay on this machine.",
    );
  });
}
