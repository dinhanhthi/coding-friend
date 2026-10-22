import { execFile as nodeExecFile } from "child_process";

/** Narrow execFile shape so tests can inject a double. */
export type NotifyExecFile = (
  file: string,
  args: string[],
  opts: { timeout: number },
  cb: (err: Error | null) => void,
) => void;

export interface NotifyResult {
  sent: boolean;
  error?: string;
}

const OSASCRIPT = "/usr/bin/osascript";
const TITLE_MAX = 64;
const MESSAGE_MAX = 256;
const TIMEOUT_MS = 5000;

// Text arrives via argv only, never concatenated into the script.
const SCRIPT = [
  "on run argv",
  "display notification (item 1 of argv) with title (item 2 of argv)",
  "end run",
].join("\n");

function clean(text: string, max: number): string {
  const flat = text
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(flat).slice(0, max).join("");
}

/**
 * Show a macOS notification. No-op off darwin or when disabled.
 * Never throws: failures are returned in `error` for the caller to log.
 */
export function notifyUser(opts: {
  title: string;
  message: string;
  enabled: boolean;
  execFile?: NotifyExecFile;
  platform?: NodeJS.Platform;
}): Promise<NotifyResult> {
  const platform = opts.platform ?? process.platform;
  if (!opts.enabled || platform !== "darwin") {
    return Promise.resolve({ sent: false });
  }
  const run = opts.execFile ?? (nodeExecFile as unknown as NotifyExecFile);
  // "--" ends osascript option parsing, so text starting with "-" (e.g. "-e") stays argv.
  const args = [
    "-e",
    SCRIPT,
    "--",
    clean(opts.message, MESSAGE_MAX),
    clean(opts.title, TITLE_MAX),
  ];
  return new Promise((resolve) => {
    try {
      run(OSASCRIPT, args, { timeout: TIMEOUT_MS }, (err) => {
        resolve(err ? { sent: false, error: err.message } : { sent: true });
      });
    } catch (err) {
      resolve({ sent: false, error: (err as Error).message });
    }
  });
}
