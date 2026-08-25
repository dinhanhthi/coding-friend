import { commandExists, run } from "./exec.js";

export type Host = "claude" | "codex" | "omp" | "agy";

export interface HostFlags {
  agent?: string;
  codex?: boolean;
  omp?: boolean;
  agy?: boolean;
}

const CODEX_MIN_VERSION = "0.130.0";
const OMP_MIN_VERSION = "0.1.0";
const AGY_MIN_VERSION = "1.1.0";

export function detectHostsAvailable(): Host[] {
  const hosts: Host[] = [];
  if (commandExists("claude")) hosts.push("claude");
  if (commandExists("codex")) hosts.push("codex");
  if (commandExists("omp")) hosts.push("omp");
  if (commandExists("agy")) hosts.push("agy");
  return hosts;
}

export function resolveHost(opts: HostFlags = {}): Host {
  const agent = opts.agent?.trim().toLowerCase();
  const codexAlias = opts.codex === true;
  const ompAlias = opts.omp === true;
  const agyAlias = opts.agy === true;

  if (
    agent &&
    agent !== "claude" &&
    agent !== "codex" &&
    agent !== "omp" &&
    agent !== "agy"
  ) {
    throw new Error(
      `Unsupported agent "${opts.agent}". Use "claude", "codex", "omp", or "agy".`,
    );
  }

  if (codexAlias && ompAlias) {
    throw new Error("Use either --codex or --omp, not both.");
  }

  if (agyAlias && codexAlias) {
    throw new Error("Use either --agy or --codex, not both.");
  }

  if (agyAlias && ompAlias) {
    throw new Error("Use either --agy or --omp, not both.");
  }

  if (codexAlias && agent === "claude") {
    throw new Error("Use either --agent claude or --codex, not both.");
  }

  if (ompAlias && agent === "claude") {
    throw new Error("Use either --agent claude or --omp, not both.");
  }

  if (agyAlias && agent === "claude") {
    throw new Error("Use either --agent claude or --agy, not both.");
  }

  if (ompAlias && agent === "codex") {
    throw new Error("Use either --agent codex or --omp, not both.");
  }

  if (agyAlias && agent === "codex") {
    throw new Error("Use either --agent codex or --agy, not both.");
  }

  if (codexAlias && agent === "omp") {
    throw new Error("Use either --agent omp or --codex, not both.");
  }

  if (agyAlias && agent === "omp") {
    throw new Error("Use either --agent omp or --agy, not both.");
  }

  if (codexAlias && agent === "agy") {
    throw new Error("Use either --agent agy or --codex, not both.");
  }

  if (ompAlias && agent === "agy") {
    throw new Error("Use either --agent agy or --omp, not both.");
  }

  if (agyAlias) return "agy";
  if (agent === "agy") return "agy";
  if (ompAlias) return "omp";
  if (agent === "omp") return "omp";
  if (codexAlias) return "codex";
  if (agent === "codex") return "codex";
  return "claude";
}

export function getCodexMinVersion(): string {
  return CODEX_MIN_VERSION;
}

export function getOmpMinVersion(): string {
  return OMP_MIN_VERSION;
}

export function getAgyMinVersion(): string {
  return AGY_MIN_VERSION;
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

export function checkOmpVersion(): CodexVersionCheck {
  const min = getOmpMinVersion();
  const output = run("omp", ["--version"]);
  const actual = output ? extractVersion(output) : undefined;

  return {
    ok: actual ? compareVersions(actual, min) >= 0 : false,
    actual,
    min,
  };
}

export function checkAgyVersion(): CodexVersionCheck {
  const min = getAgyMinVersion();
  const output = run("agy", ["--version"]);
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
