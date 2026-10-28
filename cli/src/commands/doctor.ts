import chalk from "chalk";
import {
  collectDoctor,
  type DoctorCheck,
  type DoctorData,
} from "../lib/doctor.js";
import { runJson } from "../lib/output.js";

const GROUP_TITLES: Record<string, string> = {
  cli: "CLI",
  plugin: "Plugin",
  memory: "Memory MCP",
  learn: "Learn MCP",
  hosts: "Hosts",
  supervisor: "Supervisor",
  registry: "Projects",
};

function printCheck(c: DoctorCheck): void {
  const detail = c.detail ? `: ${c.detail}` : "";
  const line = `${c.label}${detail}`;
  if (c.status === "ok") console.log(chalk.green(`  ✓ ${line}`));
  else if (c.status === "warn") console.log(chalk.yellow(`  ⚠ ${line}`));
  else console.log(chalk.red(`  ✗ ${line}`));
  if (c.status === "ok") return;
  if (c.fix) {
    const cmd = ["cf", ...c.fix.argv.filter((a) => a !== "--json")].join(" ");
    console.log(chalk.dim(`    → ${c.fix.label}: ${cmd}`));
  } else if (c.hint) {
    console.log(chalk.dim(`    → ${c.hint}`));
  }
}

function printDoctor(data: DoctorData): void {
  console.log(
    `Coding Friend CLI ${data.cli.version} (node ${data.cli.node}, ${data.cli.path})`,
  );
  const groups = [...new Set(data.checks.map((c) => c.group))];
  for (const group of groups) {
    console.log();
    console.log(chalk.bold(GROUP_TITLES[group] ?? group));
    for (const c of data.checks.filter((x) => x.group === group)) printCheck(c);
  }
  const count = (s: DoctorCheck["status"]) =>
    data.checks.filter((c) => c.status === s).length;
  console.log();
  console.log(
    `${count("ok")} ok, ${count("warn")} warn, ${count("fail")} fail`,
  );
}

export async function doctorCommand(
  cliVersion: string,
  opts: { json?: boolean },
): Promise<void> {
  if (opts.json) {
    // ok:true whenever doctor ran; per-check status lives in data.
    await runJson(() => collectDoctor(cliVersion));
    return;
  }
  const data = await collectDoctor(cliVersion);
  printDoctor(data);
  if (data.checks.some((c) => c.status === "fail")) process.exitCode = 1;
}
