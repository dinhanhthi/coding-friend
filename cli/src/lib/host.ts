import { commandExists, run } from "./exec.js";

export type Host = "claude" | "codex";

export interface HostFlags {
  agent?: string;
  codex?: boolean;
}

const CODEX_MIN_VERSION = "0.130.0";

export function detectHostsAvailable(): Host[] {
  const hosts: Host[] = [];
  if (commandExists("claude")) hosts.push("claude");
  if (commandExists("codex")) hosts.push("codex");
  return hosts;
}

export function resolveHost(opts: HostFlags = {}): Host {
  const agent = opts.agent?.trim().toLowerCase();
  const codexAlias = opts.codex === true;

  if (agent && agent !== "claude" && agent !== "codex") {
    throw new Error(
      `Unsupported agent "${opts.agent}". Use "claude" or "codex".`,
    );
  }

  if (codexAlias && agent === "claude") {
    throw new Error("Use either --agent claude or --codex, not both.");
  }

  if (codexAlias) return "codex";
  if (agent === "codex") return "codex";
  return "claude";
}

export function getCodexMinVersion(): string {
  return CODEX_MIN_VERSION;
}

export interface CodexVersionCheck {
  ok: boolean;
  actual?: string;
  min: string;
}

export function checkCodexVersion(): CodexVersionCheck {
  const min = getCodexMinVersion();
  const output = run("codex", ["--version"]);
  const actual = output ? extractVersion(output) : undefined;

  return {
    ok: actual ? compareVersions(actual, min) >= 0 : false,
    actual,
    min,
  };
}

export function extractVersion(input: string): string | undefined {
  return input.match(/\b(\d+\.\d+\.\d+)\b/)?.[1];
}

export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] > right[i]) return 1;
    if (left[i] < right[i]) return -1;
  }
  return 0;
}

function parseVersion(version: string): [number, number, number] {
  const parts = version.split(".").map((part) => Number.parseInt(part, 10));
  return [
    Number.isFinite(parts[0]) ? parts[0] : 0,
    Number.isFinite(parts[1]) ? parts[1] : 0,
    Number.isFinite(parts[2]) ? parts[2] : 0,
  ];
}
