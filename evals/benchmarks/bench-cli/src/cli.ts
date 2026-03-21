import { readFileSync, writeFileSync } from "node:fs";
import { flattenJson, filterKeys, sortByField } from "./transform";
import { toCSV, toTable } from "./format";

interface CliArgs {
  input: string;
  output: string;
  format: "csv" | "table";
  keys?: string[];
  sortBy?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = {};
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case "--input":
        args.input = argv[++i];
        break;
      case "--output":
        args.output = argv[++i];
        break;
      case "--format":
        args.format = argv[++i] as "csv" | "table";
        break;
      case "--keys":
        args.keys = argv[++i].split(",");
        break;
      case "--sort-by":
        args.sortBy = argv[++i];
        break;
    }
  }
  if (!args.input || !args.output || !args.format) {
    console.error(
      "Usage: bench-cli --input <file> --output <file> --format csv|table",
    );
    process.exit(1);
  }
  return args as CliArgs;
}

function main() {
  const args = parseArgs(process.argv);
  const raw = JSON.parse(readFileSync(args.input, "utf-8"));

  let data: Record<string, unknown>[] = Array.isArray(raw)
    ? raw.map((item) => flattenJson(item))
    : [flattenJson(raw)];

  if (args.keys) {
    data = data.map((item) => filterKeys(item, args.keys!));
  }

  if (args.sortBy) {
    data = sortByField(data, args.sortBy);
  }

  const formatted = args.format === "csv" ? toCSV(data) : toTable(data);
  writeFileSync(args.output, formatted, "utf-8");
  console.log(`Written ${data.length} rows to ${args.output}`);
}

main();
