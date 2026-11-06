import { getConfigJsonSchema } from "../lib/config.js";
import {
  getConfigView,
  scopeFromFlags,
  setConfigValue,
} from "../lib/config-ops.js";
import { log } from "../lib/log.js";
import { CliError, runHuman, runJson } from "../lib/output.js";
import { useProjectDir } from "../lib/project-option.js";

interface Flags {
  global?: boolean;
  local?: boolean;
  json?: boolean;
  projectDir?: string;
}

/** JSON mode → envelope; human mode → log CliError then exit 1 via runHuman. */
async function run<T>(
  json: boolean | undefined,
  fn: () => T,
  print: (data: T) => void,
): Promise<void> {
  if (json) {
    await runJson(fn);
    return;
  }
  await runHuman(() => {
    try {
      print(fn());
    } catch (err) {
      if (err instanceof CliError) log.error(err.message);
      throw err;
    }
  });
}

export async function configGetCommand(
  key: string | undefined,
  opts: Flags,
): Promise<void> {
  await run(
    opts.json,
    () => {
      const project = useProjectDir(opts.projectDir);
      const view = getConfigView(key, scopeFromFlags(opts));
      return project ? { ...view, project } : view;
    },
    (view) => {
      if ("source" in view) {
        console.log(
          view.source === null
            ? `${view.key} is not set`
            : `${view.key} = ${JSON.stringify(view.value)} (${view.source})`,
        );
      } else {
        const obj = "effective" in view ? view.effective : view.config;
        console.log(JSON.stringify(obj, null, 2));
      }
    },
  );
}

export async function configSetCommand(
  key: string,
  value: string,
  opts: Flags,
): Promise<void> {
  await run(
    opts.json,
    () => {
      const project = useProjectDir(opts.projectDir);
      const res = setConfigValue(scopeFromFlags(opts), key, value);
      return project ? { ...res, project } : res;
    },
    (res) => {
      for (const w of res.warnings) log.warn(w);
      log.success(
        res.value === null
          ? `Deleted ${res.key} from ${res.path}`
          : `Set ${res.key} = ${JSON.stringify(res.value)} in ${res.path}`,
      );
    },
  );
}

export async function configSchemaCommand(opts: Flags): Promise<void> {
  await run(opts.json, getConfigJsonSchema, (schema) =>
    console.log(JSON.stringify(schema, null, 2)),
  );
}
