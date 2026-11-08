import { ChevronRight } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { DETAIL, LIST, SPLIT } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  describeCfError,
  docsList,
  docsShow,
  isCancelled,
  openUrl,
  splitFrontmatter,
  toCfError,
  type CfError,
  type DocContent,
  type DocEntry,
} from "@/lib/cf";
import { useCfQuery, type CfQuery } from "@/lib/use-cf-query";
import { cn } from "@/lib/utils";

/** Folders Coding Friend writes, first and in this order; other folders follow by name. */
const FOLDER_ORDER = ["plans", "memory", "research", "context", "later"];

interface Group {
  /** First path segment; `""` for files directly in the docs folder. */
  folder: string;
  files: DocEntry[];
}

function folderOf(path: string): string {
  const slash = path.indexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

function rank(folder: string): number {
  if (folder === "") return -1;
  const i = FOLDER_ORDER.indexOf(folder);
  return i === -1 ? FOLDER_ORDER.length : i;
}

/** Files by top-level folder (each group keeps the CLI's path order). */
function groupDocs(files: DocEntry[]): Group[] {
  const groups = new Map<string, DocEntry[]>();
  for (const file of files) {
    const folder = folderOf(file.path);
    const group = groups.get(folder);
    if (group) group.push(file);
    else groups.set(folder, [file]);
  }
  return [...groups]
    .map(([folder, list]) => ({ folder, files: list }))
    .sort(
      (a, b) =>
        rank(a.folder) - rank(b.folder) || a.folder.localeCompare(b.folder),
    );
}

function describeError(e: CfError): string {
  return e.kind === "cliTooOld"
    ? "This cf is too old for the docs viewer. Update it from the Version view."
    : describeCfError(e);
}

function Failed({
  what,
  error,
  onRetry,
}: {
  what: string;
  error: CfError;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p role="alert" className="text-sm break-words text-danger">
        Could not load {what}: {describeError(error)}
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/**
 * A project's docs folder: a file tree on the left, the selected file on the right. Docs
 * are read-only; `.md` links move within the tree, `https:` links go through Rust's confirm.
 */
export function DocsView({ project }: { project: string }) {
  const list = useCfQuery(`docs:${project}`, () => docsList(project));
  const [selected, setSelected] = useState<string | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const doc = useCfQuery(
    selected === null ? null : `doc:${project}:${selected}`,
    () => docsShow(project, selected ?? ""),
  );

  const files = list.data?.files;
  const known = useMemo(() => new Set(files?.map((f) => f.path)), [files]);
  const groups = useMemo(() => groupDocs(files ?? []), [files]);

  // Only state updates: the new key reads `loading` in this same render.
  const select = useCallback((path: string) => {
    setSelected(path);
    setMissing(null);
    setLinkError(null);
  }, []);

  const toggle = (folder: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(folder)) next.add(folder);
      return next;
    });

  const navigate = useCallback(
    (path: string) => {
      if (!known.has(path)) {
        setMissing(path);
        return;
      }
      const folder = folderOf(path);
      setCollapsed((prev) => {
        if (!prev.has(folder)) return prev;
        const next = new Set(prev);
        next.delete(folder);
        return next;
      });
      select(path);
    },
    [known, select],
  );

  const openExternal = useCallback((url: string) => {
    setLinkError(null);
    openUrl(url).catch((e: unknown) => {
      if (!isCancelled(e)) setLinkError(describeCfError(toCfError(e)));
    });
  }, []);

  if (list.error)
    return (
      <Whole>
        <Failed what="the docs" error={list.error} onRetry={list.refetch} />
      </Whole>
    );

  const data = list.data;
  if (!data) {
    return (
      <div aria-busy="true" className={SPLIT}>
        <div className={TREE}>
          <div className="flex items-center gap-2 px-2 py-1">
            <Skeleton className="h-3.5 w-20" />
            {list.showSpinner && <Spinner label="Loading the docs" />}
          </div>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="mx-2 my-2 h-3.5" />
          ))}
        </div>
        <div className={DETAIL} />
      </div>
    );
  }

  if (!data.exists)
    return (
      <Whole>
        <p className="text-sm break-all text-muted">
          No docs folder at {data.docsDir}.
        </p>
      </Whole>
    );
  if (data.files.length === 0)
    return (
      <Whole>
        <p className="text-sm break-all text-muted">
          No markdown files in {data.docsDir}.
        </p>
      </Whole>
    );

  return (
    <div className={SPLIT}>
      <nav aria-label="Docs files" className={TREE}>
        {groups.map(({ folder, files: groupFiles }) => {
          const items = (
            <ul className="flex flex-col">
              {groupFiles.map((file) => (
                <li key={file.path}>
                  <button
                    type="button"
                    aria-current={file.path === selected ? "true" : undefined}
                    title={file.path}
                    onClick={() => select(file.path)}
                    className={cn(
                      // Wrap, not truncate: nested plan paths share a long date prefix.
                      "w-full rounded-md px-2 py-1 text-left font-mono text-xs break-words text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-focus",
                      folder !== "" && "pl-6",
                      file.path === selected &&
                        "bg-paper-3 font-medium text-ink",
                    )}
                  >
                    {folder === ""
                      ? file.path
                      : file.path.slice(folder.length + 1)}
                  </button>
                </li>
              ))}
            </ul>
          );
          if (folder === "") return <div key="">{items}</div>;
          const open = !collapsed.has(folder);
          return (
            <div key={folder}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggle(folder)}
                className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-xs font-medium text-muted outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-focus"
              >
                <ChevronRight
                  aria-hidden
                  className={cn(
                    "size-3.5 shrink-0 transition-transform",
                    open && "rotate-90",
                  )}
                />
                <span className="truncate">{folder}</span>
                <span className="ml-auto font-mono">{groupFiles.length}</span>
              </button>
              {open && items}
            </div>
          );
        })}
        {data.truncated && (
          <p className="px-2 py-1 text-xs text-muted">
            Only the first {data.files.length} files are listed.
          </p>
        )}
      </nav>

      {/* Keyed: another file starts at the top, not at the last one's scroll. */}
      <div key={selected ?? ""} className={DETAIL}>
        {missing && (
          <p role="alert" className="text-xs break-all text-danger">
            {missing} is not in the docs folder.
          </p>
        )}
        {linkError && (
          <p role="alert" className="text-xs break-words text-danger">
            Could not open the link: {linkError}
          </p>
        )}
        {selected === null ? (
          <p className="text-sm text-muted">Choose a file to read it.</p>
        ) : (
          <DocPane
            path={selected}
            doc={doc}
            onNavigate={navigate}
            onOpenExternal={openExternal}
          />
        )}
      </div>
    </div>
  );
}

const TREE = cn(LIST, "w-60 gap-0.5");

/** A state that takes the whole tab (error, no docs): the detail column without a list. */
function Whole({ children }: { children: ReactNode }) {
  return (
    <div className={SPLIT}>
      <div className={DETAIL}>{children}</div>
    </div>
  );
}

function DocPane({
  path,
  doc,
  onNavigate,
  onOpenExternal,
}: {
  path: string;
  doc: CfQuery<DocContent>;
  onNavigate: (path: string) => void;
  onOpenExternal: (url: string) => void;
}) {
  const content = doc.data?.content;
  const parts = useMemo(
    () => (content === undefined ? null : splitFrontmatter(content)),
    [content],
  );

  let body: ReactNode;
  if (doc.error) {
    body = <Failed what={path} error={doc.error} onRetry={doc.refetch} />;
  } else if (!parts) {
    body = (
      <div aria-busy="true" className="flex flex-col gap-3">
        <Skeleton className="h-5 w-48" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-3.5 w-full" />
        ))}
        <Skeleton className="h-3.5 w-2/3" />
      </div>
    );
  } else {
    body = (
      <>
        {parts.frontmatter !== null && (
          <pre className="overflow-x-auto rounded-lg border border-rule bg-paper-2 p-3 font-mono text-xs whitespace-pre-wrap text-muted">
            {parts.frontmatter}
          </pre>
        )}
        <Markdown
          content={parts.body}
          currentPath={path}
          onNavigate={onNavigate}
          onOpenExternal={onOpenExternal}
        />
      </>
    );
  }

  return (
    <article aria-label={path} className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <p
          className="min-w-0 flex-1 truncate font-mono text-xs text-muted"
          title={path}
        >
          {path}
        </p>
        {doc.showSpinner && <Spinner label={`Loading ${path}`} />}
      </div>
      {body}
    </article>
  );
}
