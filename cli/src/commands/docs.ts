import { listDocs, readDoc, resolveProjectDocsDir } from "../lib/docs-tree.js";
import { log } from "../lib/log.js";
import { CliError, runHuman, runJson } from "../lib/output.js";
import { useProjectDir } from "../lib/project-option.js";

interface Flags {
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

export async function docsListCommand(opts: Flags): Promise<void> {
  await run(
    opts.json,
    () => {
      const project = useProjectDir(opts.projectDir) ?? process.cwd();
      return { project, ...listDocs(resolveProjectDocsDir()) };
    },
    (res) => {
      if (!res.exists) {
        log.warn(`No docs directory at ${res.docsDir}`);
        return;
      }
      for (const f of res.files) console.log(f.path);
      if (res.truncated) log.warn("List truncated");
    },
  );
}

export async function docsShowCommand(
  relpath: string,
  opts: Flags,
): Promise<void> {
  await run(
    opts.json,
    () => {
      const project = useProjectDir(opts.projectDir) ?? process.cwd();
      return { project, ...readDoc(resolveProjectDocsDir(), relpath) };
    },
    (doc) => process.stdout.write(doc.content),
  );
}
