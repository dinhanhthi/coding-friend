import { ChevronDown, ChevronRight, FolderOpen, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { CommandLine } from "@/components/CommandLine";
import { CLOUD_LABELS } from "@/components/LearnView";
import { Markdown } from "@/components/Markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  chooseSessionDir,
  describeCfError,
  isCancelled,
  isConflict,
  openUrl,
  sessionExport,
  sessionExportPreview,
  sessionList,
  sessionLoad,
  sessionSave,
  sessionShow,
  sessionStatus,
  setSessionDir,
  syncStatus,
  toCfError,
  type CfError,
  type RegisteredProject,
  type SessionExportResult,
  type SessionListProvider,
  type SessionLoadResult,
  type SessionSaveResult,
  type SessionShow,
  type SessionStatus,
  type SessionSummary,
  type SessionTurn,
  type SyncStatus,
} from "@/lib/cf";
import { describePending, type PendingRun, type StartRun } from "@/lib/runs";
import { useCfQuery, useDelayed, type CfQuery } from "@/lib/use-cf-query";
import { cn } from "@/lib/utils";

type ProviderFilter = "all" | SessionListProvider;

const PROVIDERS: { id: ProviderFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "claude", label: "Claude" },
  { id: "codex", label: "Codex" },
  { id: "saved", label: "Saved" },
];

const LAYOUT = "flex items-start gap-6";
const LIST =
  "sticky top-4 flex max-h-[calc(100vh-2rem)] w-80 shrink-0 flex-col gap-1 overflow-y-auto";
const PANE = "flex min-w-0 flex-1 flex-col gap-4";
const CONTROL =
  "h-7 rounded-md border border-rule bg-paper px-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50";

/** `PendingRun.key` of "Choose folder…" (a suggestion uses its path). */
const CHOOSE_KEY = "choose";

/** The export preview shows at most this many characters; the saved file is complete. */
const PREVIEW_CHARS = 200 * 1024;

const CONFLICT_MESSAGE =
  "A transcript with this id already exists in that project.";

/** `session-YYYY-MM-DD` in local time. */
function defaultLabel(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `session-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function describeError(e: CfError): string {
  return e.kind === "cliTooOld"
    ? "This cf is too old for the Sessions view. Update it from the Version view."
    : describeCfError(e);
}

/** The last two folders of `cwd` (`…/a/b`); the full path goes in the tooltip. */
function shortCwd(cwd: string): string {
  const parts = cwd.replace(/\/+$/, "").split("/").filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : cwd;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return iso === "" || Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString();
}

/** Provider, then `saved`/`legacy` (a live session needs no second badge). */
function SessionBadges({ summary }: { summary: SessionSummary }) {
  return (
    <>
      <Badge variant="default">{summary.provider}</Badge>
      {summary.source !== "live" && (
        <Badge variant="outline">{summary.source}</Badge>
      )}
      {summary.status !== "ok" && (
        <Badge variant="danger" title={summary.reason}>
          {summary.status}
        </Badge>
      )}
    </>
  );
}

/**
 * Claude and Codex sessions on this Mac, plus the saved ones: the list on the left, the
 * selected transcript (redacted by the CLI) on the right. Every export, save, load and
 * folder change goes through Rust's native dialog and confirm.
 */
export function SessionsView({
  projects,
  pending,
  run,
}: {
  projects: RegisteredProject[];
  pending: PendingRun | null;
  run: StartRun;
}) {
  const [provider, setProvider] = useState<ProviderFilter>("all");
  const [chosenProject, setChosenProject] = useState<string | null>(null);
  const [selected, setSelected] = useState<SessionSummary | null>(null);
  const [includeToolOutput, setIncludeToolOutput] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [dirError, setDirError] = useState<string | null>(null);

  // A project removed from the registry falls back to all projects.
  const project = projects.some((p) => p.path === chosenProject)
    ? chosenProject
    : null;

  const list = useCfQuery(`sessions:${provider}:${project ?? ""}`, () =>
    sessionList({
      provider: provider === "all" ? undefined : provider,
      project: project ?? undefined,
    }),
  );
  const status = useCfQuery("session-status", sessionStatus);
  // `sync status` scans both folders: only while the storage panel is open.
  const sync = useCfQuery(storageOpen ? "sync-status" : null, syncStatus);
  const showRefreshing = useDelayed(list.refreshing);

  // A run can end after the filters changed: refresh the queries of then, not of the click.
  const latest = useRef({ list, status, sync });
  useEffect(() => {
    latest.current = { list, status, sync };
  });
  const refreshList = useCallback(() => latest.current.list.refetch(), []);

  // Another folder holds other saved sessions: the open one may be gone.
  const changeDir = (key: string, action: () => Promise<unknown>) => {
    if (pending) return;
    setDirError(null);
    run(
      {
        op: "sessionDir",
        key,
        command:
          key === CHOOSE_KEY
            ? "cf config set --global -- session.dir <folder>"
            : `cf config set --global -- session.dir ${JSON.stringify(key)}`,
        ...(key === CHOOSE_KEY && { picker: true }),
      },
      action,
      () => {
        setSelected(null);
        latest.current.status.refetch();
        latest.current.sync.refetch();
        latest.current.list.refetch();
      },
      (message) => setDirError(message),
    );
  };

  const refresh = () => {
    list.refetch();
    status.refetch();
    sync.refetch();
  };

  // Another filter shows other sessions: the open one may not be among them.
  const changeProvider = (next: ProviderFilter) => {
    setProvider(next);
    setSelected(null);
  };
  const changeProject = (next: string | null) => {
    setChosenProject(next);
    setSelected(null);
  };

  return (
    <article
      aria-labelledby="sessions-title"
      className="mx-auto flex max-w-6xl flex-col gap-6 px-8 py-7"
    >
      <header className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2
              id="sessions-title"
              className="text-lg font-semibold tracking-tight"
            >
              Sessions
            </h2>
            <p className="text-xs text-muted">
              Claude and Codex sessions on this Mac, and saved ones. Titles and
              transcripts are redacted by cf.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Reload the sessions"
            onClick={refresh}
            disabled={list.refreshing}
          >
            <RefreshCw
              aria-hidden
              className={showRefreshing ? "animate-spin" : ""}
            />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="radiogroup"
            aria-label="Provider"
            className="flex shrink-0 overflow-hidden rounded-md border border-rule"
          >
            {PROVIDERS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={provider === id}
                onClick={() => provider !== id && changeProvider(id)}
                className={cn(
                  "h-7 px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset",
                  provider === id
                    ? "bg-accent text-accent-ink"
                    : "bg-paper text-ink-2",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <select
            aria-label="Project"
            value={project ?? ""}
            onChange={(e) => changeProject(e.target.value || null)}
            className={cn(CONTROL, "max-w-xs")}
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.path} value={p.path}>
                {p.path}
              </option>
            ))}
          </select>
          {project === null && (
            <p className="text-xs text-muted">
              Choose a project to also see its legacy saved sessions.
            </p>
          )}
        </div>
      </header>

      <StorageCard
        open={storageOpen}
        onOpen={setStorageOpen}
        status={status}
        sync={sync}
        pending={pending}
        error={dirError}
        onChoose={() => changeDir(CHOOSE_KEY, chooseSessionDir)}
        onUse={(path) => changeDir(path, () => setSessionDir(path))}
      />

      {list.error ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-sm break-words text-danger">
            Could not list the sessions: {describeError(list.error)}
          </p>
          <Button variant="outline" size="sm" onClick={list.refetch}>
            Try again
          </Button>
        </div>
      ) : !list.data ? (
        <div className={LAYOUT}>
          <div className={LIST}>
            <SessionListSkeleton showSpinner={list.showSpinner} />
          </div>
          <div className={PANE} />
        </div>
      ) : list.data.sessions.length === 0 ? (
        <p className="text-sm text-muted">No sessions found.</p>
      ) : (
        <div className={LAYOUT}>
          <nav aria-label="Sessions" className={LIST}>
            <ul className="flex flex-col gap-0.5">
              {list.data.sessions.map((s) => (
                <SessionItem
                  key={s.ref}
                  summary={s}
                  selected={s.ref === selected?.ref}
                  onSelect={setSelected}
                />
              ))}
            </ul>
            {list.data.truncated && (
              <p className="px-2 py-1 text-xs text-muted">
                More sessions exist; not all files were scanned.
              </p>
            )}
          </nav>

          <div className={PANE}>
            {selected === null ? (
              <p className="text-sm text-muted">Choose a session to read it.</p>
            ) : (
              <SessionDetail
                key={selected.ref}
                summary={selected}
                project={project}
                projects={projects}
                includeToolOutput={includeToolOutput}
                onIncludeToolOutput={setIncludeToolOutput}
                pending={pending}
                run={run}
                onChanged={refreshList}
              />
            )}
          </div>
        </div>
      )}
    </article>
  );
}

/**
 * Where saved sessions live (`session.dir`), the two ways to change it (both confirmed by
 * Rust), and what `sync status` sees in the learn and session folders. Collapsed by default.
 */
function StorageCard({
  open,
  onOpen,
  status,
  sync,
  pending,
  error,
  onChoose,
  onUse,
}: {
  open: boolean;
  onOpen: (open: boolean) => void;
  status: CfQuery<SessionStatus>;
  sync: CfQuery<SyncStatus>;
  pending: PendingRun | null;
  error: string | null;
  onChoose: () => void;
  onUse: (path: string) => void;
}) {
  const dirRun = pending?.op === "sessionDir" ? pending : null;
  const runStatus = (key: string) =>
    dirRun?.key !== key
      ? null
      : dirRun.started
        ? "Saving…"
        : key === CHOOSE_KEY
          ? "Waiting for a folder choice…"
          : "Waiting for confirmation…";
  const Chevron = open ? ChevronDown : ChevronRight;

  let content;
  if (!open) {
    content = null;
  } else if (status.error) {
    content = (
      <div className="flex flex-col items-start gap-2">
        <p role="alert" className="text-sm break-words text-danger">
          Could not read where sessions live: {describeError(status.error)}
        </p>
        <Button variant="outline" size="sm" onClick={status.refetch}>
          Try again
        </Button>
      </div>
    );
  } else if (!status.data) {
    content = (
      <div aria-busy="true" className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-72" />
          {status.showSpinner && (
            <Spinner label="Reading where sessions live" />
          )}
        </div>
        <Skeleton className="h-7 w-32" />
      </div>
    );
  } else {
    const s = status.data;
    const chooseStatus = runStatus(CHOOSE_KEY);
    content = (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 font-mono text-sm break-all">{s.dir}</p>
          {s.cloud && (
            <Badge variant="outline">{CLOUD_LABELS[s.cloud.provider]}</Badge>
          )}
          {!s.exists && <Badge variant="outline">not created yet</Badge>}
        </div>
        <p className="text-xs text-muted">
          Save copies a transcript here verbatim. A cloud app, if any, syncs the
          folder.
        </p>
        {s.gitRepo && (
          <p role="alert" className="text-xs break-words text-danger">
            This folder is inside a git work tree: saved transcripts are
            verbatim, not redacted. Do not commit or push them.
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onChoose}
            disabled={pending !== null}
          >
            <FolderOpen aria-hidden />
            Choose folder…
          </Button>
          {chooseStatus && (
            <p role="status" className="text-xs text-muted">
              {chooseStatus}
            </p>
          )}
        </div>

        {s.suggestions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted">Cloud folders on this Mac:</p>
            <ul className="flex flex-col divide-y divide-rule rounded-lg border border-rule">
              {s.suggestions.map((suggestion) => {
                const current = suggestion.path === s.dir;
                const useStatus = runStatus(suggestion.path);
                return (
                  <li
                    key={suggestion.path}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className="text-sm">{suggestion.label}</p>
                      <p className="font-mono text-xs break-all text-muted">
                        {suggestion.path}
                      </p>
                      {!suggestion.exists && (
                        <p className="text-xs text-muted">
                          Will be created on the first save.
                        </p>
                      )}
                      {useStatus && (
                        <p role="status" className="text-xs text-muted">
                          {useStatus}
                        </p>
                      )}
                    </div>
                    {current ? (
                      <Badge variant="success">current</Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onUse(suggestion.path)}
                        disabled={pending !== null}
                      >
                        Use
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {pending && !dirRun && (
          <p className="text-xs text-muted">{describePending(pending)}</p>
        )}
        {error && (
          <p role="alert" className="text-xs break-words text-danger">
            Could not change the session folder: {error}
          </p>
        )}

        <SyncCard sync={sync} />
      </>
    );
  }

  return (
    <section
      aria-labelledby="sessions-storage-title"
      className="flex flex-col gap-3 rounded-lg border border-rule p-4"
    >
      <h3 id="sessions-storage-title">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => onOpen(!open)}
          className="flex w-full items-center gap-1.5 rounded-sm text-left text-xs font-medium tracking-wide text-muted uppercase outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Chevron aria-hidden className="size-3.5" />
          Where sessions live
          {!open && status.data && (
            <span className="min-w-0 flex-1 truncate font-mono tracking-normal normal-case">
              {status.data.dir}
            </span>
          )}
        </button>
      </h3>
      {content}
    </section>
  );
}

/** `sync status` for the learn and session folders: what a cloud app syncs, never synced here. */
function SyncCard({ sync }: { sync: CfQuery<SyncStatus> }) {
  let content;
  if (sync.error) {
    content = (
      <div className="flex flex-col items-start gap-2">
        <p role="alert" className="text-xs break-words text-danger">
          Could not read the sync status: {describeError(sync.error)}
        </p>
        <Button variant="outline" size="sm" onClick={sync.refetch}>
          Try again
        </Button>
      </div>
    );
  } else if (!sync.data) {
    content = (
      <div aria-busy="true" className="flex flex-col gap-2">
        {sync.showSpinner && <Spinner label="Reading the sync status" />}
        <Skeleton className="h-3.5 w-64" />
        <Skeleton className="h-3.5 w-64" />
      </div>
    );
  } else {
    content = (
      <>
        <ul className="flex flex-col divide-y divide-rule rounded-lg border border-rule">
          {sync.data.kinds.map((k) => (
            <li key={k.kind} className="flex flex-col gap-0.5 px-3 py-2">
              <p className="text-sm">
                {k.kind === "learn" ? "Learn notes" : "Sessions"}
              </p>
              <p className="font-mono text-xs break-all text-muted">{k.dir}</p>
              <p className="text-xs text-muted">
                {k.cloud ? CLOUD_LABELS[k.cloud.provider] : "Local folder"}
                {k.exists
                  ? ` · ${k.files} ${k.kind === "learn" ? "notes" : "sessions"} · ${k.placeholders} not downloaded · ${k.conflicts} conflict copies`
                  : " · not created yet"}
                {k.truncated && " · scan stopped early"}
              </p>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">
          The global config and the project list are not synced.
        </p>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted">Sync status:</p>
      {content}
    </div>
  );
}

function SessionListSkeleton({ showSpinner }: { showSpinner: boolean }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-1">
      {showSpinner && (
        <Spinner label="Loading the sessions" className="px-2 py-1" />
      )}
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex flex-col gap-1.5 px-2 py-1.5">
          <Skeleton className="h-3.5" />
          <Skeleton className="h-3 w-40" />
        </div>
      ))}
    </div>
  );
}

/** One row; selecting it only changes state, so it reacts at once. */
function SessionItem({
  summary,
  selected,
  onSelect,
}: {
  summary: SessionSummary;
  selected: boolean;
  onSelect: (summary: SessionSummary) => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        title={summary.ref}
        onClick={() => onSelect(summary)}
        className={cn(
          "flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-left text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-focus",
          selected && "bg-paper-3 text-ink hover:bg-paper-3",
        )}
      >
        <span
          className={cn("truncate text-sm", selected && "font-medium")}
          title={summary.title || summary.ref}
        >
          {summary.title || summary.ref}
        </span>
        <span className="flex flex-wrap items-center gap-1">
          <SessionBadges summary={summary} />
        </span>
        <span className="flex items-center gap-2 text-[0.6875rem] text-muted">
          <span
            className="min-w-0 flex-1 truncate font-mono"
            title={summary.cwd}
          >
            {shortCwd(summary.cwd)}
          </span>
          <span className="shrink-0">{formatTime(summary.updatedAt)}</span>
        </span>
        {summary.status !== "ok" && summary.reason && (
          <span className="text-[0.6875rem] break-words text-muted">
            {summary.reason}
          </span>
        )}
      </button>
    </li>
  );
}

/** Pages fetched with "Load more" after the first one, for one detail key. */
interface MorePages {
  key: string;
  pages: SessionShow[];
  loading: boolean;
  error: CfError | null;
}

/**
 * One session. The header comes from the list row, so it shows in the frame of the click;
 * the turns load behind a placeholder of the same shape. `unsupported` and `placeholder`
 * sessions are never opened: their reason replaces the turns.
 */
function SessionDetail({
  summary: listed,
  project,
  projects,
  includeToolOutput,
  onIncludeToolOutput,
  pending,
  run,
  onChanged,
}: {
  summary: SessionSummary;
  /** The project filter: a `legacy:` ref resolves only with it. */
  project: string | null;
  projects: RegisteredProject[];
  includeToolOutput: boolean;
  onIncludeToolOutput: (include: boolean) => void;
  pending: PendingRun | null;
  run: StartRun;
  /** A save or load wrote a session: the list may have a new row. */
  onChanged: () => void;
}) {
  const ref = listed.ref;
  const readable = listed.status === "ok";
  const showKey = readable
    ? `session:${ref}:${project ?? ""}:${includeToolOutput}`
    : null;
  const first = useCfQuery(showKey, () =>
    sessionShow(ref, { project: project ?? undefined, includeToolOutput }),
  );
  const [more, setMore] = useState<MorePages | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);

  const extra = more !== null && more.key === showKey ? more : null;
  const pages = first.data ? [first.data, ...(extra?.pages ?? [])] : [];
  const last = pages.at(-1);
  const summary = first.data?.summary ?? listed;

  const loadMore = () => {
    if (showKey === null || !last || last.nextOffset === null) return;
    if (extra?.loading) return;
    const key = showKey;
    const offset = last.nextOffset;
    setMore({ key, pages: extra?.pages ?? [], loading: true, error: null });
    // A response for another key (the toggle changed meanwhile) is dropped.
    const settle = (update: (prev: MorePages) => MorePages) =>
      setMore((prev) => (prev?.key === key ? update(prev) : prev));
    sessionShow(ref, {
      project: project ?? undefined,
      offset,
      includeToolOutput,
    }).then(
      (page) =>
        settle((prev) => ({
          ...prev,
          pages: [...prev.pages, page],
          loading: false,
        })),
      (e: unknown) =>
        settle((prev) => ({ ...prev, loading: false, error: toCfError(e) })),
    );
  };

  // A transcript is no file tree: a relative `.md` link has nothing to open.
  const navigate = useCallback(() => {}, []);
  const openExternal = useCallback((url: string) => {
    setLinkError(null);
    openUrl(url).catch((e: unknown) => {
      if (!isCancelled(e)) setLinkError(describeCfError(toCfError(e)));
    });
  }, []);

  const claude = summary.provider === "claude" && summary.status === "ok";
  const panels: { id: Panel; label: string }[] = [
    ...(summary.status === "ok"
      ? [{ id: "export" as const, label: "Export" }]
      : []),
    ...(claude && summary.source === "live"
      ? [{ id: "save" as const, label: "Save" }]
      : []),
    ...(claude && summary.source !== "live"
      ? [{ id: "load" as const, label: "Load" }]
      : []),
  ];
  // The first page can turn the row unreadable: its panels go with it.
  const shown = panels.some((p) => p.id === panel) ? panel : null;

  let body;
  // `summary` is the list row until the first page arrives; `session show` can still find
  // a file it cannot read (`unsupported`, no turns).
  if (summary.status !== "ok") {
    body = (
      <p className="text-sm break-words text-muted">
        {summary.status === "placeholder"
          ? "Not downloaded: the cloud app has not downloaded this file yet, so it is never opened here."
          : "This session cannot be read."}
        {summary.reason && ` ${summary.reason}`}
      </p>
    );
  } else if (first.error) {
    body = (
      <div className="flex flex-col items-start gap-2">
        <p role="alert" className="text-sm break-words text-danger">
          Could not load the session: {describeError(first.error)}
        </p>
        <Button variant="outline" size="sm" onClick={first.refetch}>
          Try again
        </Button>
      </div>
    );
  } else if (!first.data) {
    body = (
      <div aria-busy="true" className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        ))}
      </div>
    );
  } else {
    const turns = pages.flatMap((p) => p.turns);
    // Every page also counts the summary's title and cwd, and a page cut early counted the
    // turns the next page shows again: a sum would overcount, so show the latest page's.
    const redactions = last?.redactions.total ?? 0;
    const truncated = pages.some((p) => p.truncated);
    body = (
      <>
        {linkError && (
          <p role="alert" className="text-xs break-words text-danger">
            Could not open the link: {linkError}
          </p>
        )}
        {turns.length === 0 ? (
          <p className="text-sm text-muted">No turns in this session.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {turns.map((turn, i) => (
              <Turn
                key={i}
                turn={turn}
                onNavigate={navigate}
                onOpenExternal={openExternal}
              />
            ))}
          </ol>
        )}
        <div className="flex flex-col items-start gap-1.5 text-xs text-muted">
          <p>
            {turns.length} of {first.data.total} turns.{" "}
            {redactions === 1
              ? "1 item redacted in this page."
              : `${redactions} items redacted in this page.`}
          </p>
          {truncated && (
            <p>
              Some turns were shortened or a page stopped early to stay under
              the size limit.
            </p>
          )}
          {last && last.nextOffset !== null && (
            <Button
              variant="outline"
              size="sm"
              onClick={loadMore}
              disabled={extra?.loading}
            >
              Load more
            </Button>
          )}
          {extra?.loading && (
            <p role="status" className="text-xs text-muted">
              Loading more turns…
            </p>
          )}
          {extra?.error && (
            <p role="alert" className="break-words text-danger">
              Could not load more turns: {describeError(extra.error)}
            </p>
          )}
        </div>
      </>
    );
  }

  return (
    <article aria-label={summary.title || ref} className="flex flex-col gap-4">
      <header className="flex flex-col gap-2 rounded-lg border border-rule p-4">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 text-base font-semibold break-words">
            {summary.title || ref}
          </h3>
          {first.showSpinner && <Spinner label="Loading the session" />}
          <div className="flex shrink-0 items-center gap-2">
            {panels.map(({ id, label }) => (
              <Button
                key={id}
                variant={shown === id ? "default" : "outline"}
                size="sm"
                aria-expanded={shown === id}
                onClick={() => setPanel(shown === id ? null : id)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <SessionBadges summary={summary} />
          {summary.formatVersion && (
            <Badge variant="outline">format {summary.formatVersion}</Badge>
          )}
        </div>
        <p className="font-mono text-xs break-all text-muted">{summary.cwd}</p>
        <p className="text-xs text-muted">
          Started {formatTime(summary.startedAt)} · Updated{" "}
          {formatTime(summary.updatedAt)}
        </p>
        {summary.warning && (
          <p className="text-xs break-words text-muted">{summary.warning}</p>
        )}
        {summary.status === "ok" && (
          <label className="flex w-fit items-center gap-2 text-xs text-ink-2">
            <input
              type="checkbox"
              checked={includeToolOutput}
              onChange={(e) => onIncludeToolOutput(e.target.checked)}
            />
            Include tool output
          </label>
        )}
      </header>
      {shown === "export" && (
        <ExportPanel
          sessionRef={ref}
          project={project}
          includeToolOutput={includeToolOutput}
          pending={pending}
          run={run}
        />
      )}
      {shown === "save" && (
        <SavePanel
          sessionRef={ref}
          project={project}
          pending={pending}
          run={run}
          onChanged={onChanged}
        />
      )}
      {shown === "load" && (
        <LoadPanel
          sessionRef={ref}
          legacy={summary.source === "legacy"}
          project={project}
          projects={projects}
          pending={pending}
          run={run}
          onChanged={onChanged}
        />
      )}
      {body}
    </article>
  );
}

type Panel = "export" | "save" | "load";

const PANEL = "flex flex-col gap-3 rounded-lg border border-rule p-4";

/**
 * What the panel's own run is doing (Rust's dialog or confirm is up, or `cf` runs), or why
 * its button is disabled while another run is pending.
 */
function RunNote({
  pending,
  op,
  sessionRef,
  waiting,
  running,
}: {
  pending: PendingRun | null;
  op: PendingRun["op"];
  sessionRef: string;
  waiting: string;
  running: string;
}) {
  if (!pending) return null;
  const mine = pending.op === op && pending.key === sessionRef;
  return (
    <p role="status" className="text-xs text-muted">
      {mine ? (pending.started ? running : waiting) : describePending(pending)}
    </p>
  );
}

/**
 * The redacted Markdown `session export` would write, as plain text (it can be 4 MiB:
 * never through react-markdown), then "Save as…": Rust shows the save dialog and the confirm.
 */
function ExportPanel({
  sessionRef,
  project,
  includeToolOutput,
  pending,
  run,
}: {
  sessionRef: string;
  project: string | null;
  includeToolOutput: boolean;
  pending: PendingRun | null;
  run: StartRun;
}) {
  const preview = useCfQuery(
    `session-export:${sessionRef}:${project ?? ""}:${includeToolOutput}`,
    () =>
      sessionExportPreview(sessionRef, project ?? undefined, includeToolOutput),
  );
  const [result, setResult] = useState<SessionExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (pending) return;
    setResult(null);
    setError(null);
    run(
      {
        op: "sessionExport",
        key: sessionRef,
        command: `cf session export --out=<file> -- ${sessionRef}`,
      },
      () => sessionExport(sessionRef, project ?? undefined, includeToolOutput),
      setResult,
      (message) => setError(message),
    );
  };

  let content;
  if (preview.error) {
    content = (
      <div className="flex flex-col items-start gap-2">
        <p role="alert" className="text-sm break-words text-danger">
          Could not build the export: {describeError(preview.error)}
        </p>
        <Button variant="outline" size="sm" onClick={preview.refetch}>
          Try again
        </Button>
      </div>
    );
  } else if (!preview.data) {
    content = (
      <div aria-busy="true" className="flex flex-col gap-2">
        {preview.showSpinner && <Spinner label="Building the export" />}
        <Skeleton className="h-3.5 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  } else {
    const p = preview.data;
    const cut = p.markdown.length > PREVIEW_CHARS;
    content = (
      <>
        <p className="text-xs text-muted">
          {p.bytes} bytes ·{" "}
          {p.redactions.total === 1
            ? "1 item redacted"
            : `${p.redactions.total} items redacted`}
        </p>
        <p role="note" className="text-xs font-medium text-danger">
          Read it before sharing — redaction is regex-based and can miss
          secrets.
        </p>
        <pre className="max-h-96 overflow-auto rounded-lg border border-rule bg-paper-2 p-3 font-mono text-xs whitespace-pre-wrap text-ink-2">
          {cut ? p.markdown.slice(0, PREVIEW_CHARS) : p.markdown}
        </pre>
        {(cut || p.truncated) && (
          <p className="text-xs text-muted">
            Preview truncated; the saved file is complete.
          </p>
        )}
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={save} disabled={pending !== null}>
            Save as…
          </Button>
          <RunNote
            pending={pending}
            op="sessionExport"
            sessionRef={sessionRef}
            waiting="Waiting for the save dialog or its confirmation…"
            running="Exporting…"
          />
        </div>
      </>
    );
  }

  return (
    <section aria-label="Export" className={PANEL}>
      {content}
      {result && (
        <p role="status" className="text-xs break-all text-ink-2">
          Saved {result.bytes} bytes to{" "}
          <span className="font-mono">{result.out}</span>.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs break-words text-danger">
          Could not export the session: {error}
        </p>
      )}
    </section>
  );
}

/** `session save` of a live Claude session: a verbatim copy into `session.dir`. */
function SavePanel({
  sessionRef,
  project,
  pending,
  run,
  onChanged,
}: {
  sessionRef: string;
  project: string | null;
  pending: PendingRun | null;
  run: StartRun;
  onChanged: () => void;
}) {
  const [label, setLabel] = useState(defaultLabel);
  const [result, setResult] = useState<SessionSaveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionId = sessionRef.replace(/^claude:/, "");
  const trimmed = label.trim();

  const save = () => {
    if (pending || trimmed === "") return;
    setResult(null);
    setError(null);
    run(
      {
        op: "sessionSave",
        key: sessionRef,
        command: `cf session save --session-id ${sessionId} -- ${JSON.stringify(label)}`,
      },
      () => sessionSave(sessionId, label, project ?? undefined),
      (saved) => {
        setResult(saved);
        onChanged();
      },
      (message) => setError(message),
    );
  };

  return (
    <section aria-label="Save" className={PANEL}>
      <div className="flex flex-wrap items-center gap-3">
        <input
          aria-label="Label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className={cn(CONTROL, "w-64")}
        />
        <Button
          size="sm"
          onClick={save}
          disabled={pending !== null || trimmed === ""}
        >
          Save
        </Button>
        <p className="text-xs text-muted">
          Saved verbatim, not redacted. Use Export to share.
        </p>
      </div>
      <RunNote
        pending={pending}
        op="sessionSave"
        sessionRef={sessionRef}
        waiting="Waiting for confirmation…"
        running="Saving…"
      />
      {result && (
        <p role="status" className="text-xs break-all text-ink-2">
          Saved as <span className="font-mono">{result.ref}</span>.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs break-words text-danger">
          Could not save the session: {error}
        </p>
      )}
    </section>
  );
}

/**
 * `session load` of a saved or legacy Claude session into a registered project, then the
 * `claude --resume` command to copy. A legacy ref also needs the project filter it came from.
 */
function LoadPanel({
  sessionRef,
  legacy,
  project,
  projects,
  pending,
  run,
  onChanged,
}: {
  sessionRef: string;
  legacy: boolean;
  project: string | null;
  projects: RegisteredProject[];
  pending: PendingRun | null;
  run: StartRun;
  onChanged: () => void;
}) {
  const [chosen, setChosen] = useState(project ?? "");
  const [result, setResult] = useState<SessionLoadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A project removed from the registry is no target any more.
  const target = projects.some((p) => p.path === chosen) ? chosen : "";
  const needsProject = legacy && project === null;

  const load = () => {
    if (pending || target === "" || needsProject) return;
    setResult(null);
    setError(null);
    run(
      {
        op: "sessionLoad",
        key: sessionRef,
        command: `cf session load --yes --target=${JSON.stringify(target)} -- ${sessionRef}`,
      },
      () =>
        sessionLoad(
          sessionRef,
          target,
          legacy ? (project ?? undefined) : undefined,
        ),
      (loaded) => {
        setResult(loaded);
        onChanged();
      },
      (message, e) => setError(isConflict(e) ? CONFLICT_MESSAGE : message),
    );
  };

  return (
    <section aria-label="Load" className={PANEL}>
      {projects.length === 0 ? (
        <p className="text-xs text-muted">
          Add a project first: a session loads into a registered project.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Target project"
            value={target}
            onChange={(e) => setChosen(e.target.value)}
            className={cn(CONTROL, "max-w-xs")}
          >
            <option value="">Choose a target project…</option>
            {projects.map((p) => (
              <option key={p.path} value={p.path}>
                {p.path}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            onClick={load}
            disabled={pending !== null || target === "" || needsProject}
          >
            Load
          </Button>
        </div>
      )}
      {needsProject && (
        <p className="text-xs text-muted">
          Choose the project of this legacy session in the filter above to load
          it.
        </p>
      )}
      <RunNote
        pending={pending}
        op="sessionLoad"
        sessionRef={sessionRef}
        waiting="Waiting for confirmation…"
        running="Loading…"
      />
      {result && (
        <div className="flex flex-col gap-1.5">
          <p role="status" className="text-xs break-all text-ink-2">
            Loaded into <span className="font-mono">{result.target}</span>.
            Resume it in a terminal:
          </p>
          <CommandLine command={result.resumeCommand} />
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs break-words text-danger">
          Could not load the session: {error}
        </p>
      )}
    </section>
  );
}

export function Turn({
  turn,
  onNavigate,
  onOpenExternal,
}: {
  turn: SessionTurn;
  onNavigate: (path: string) => void;
  onOpenExternal: (url: string) => void;
}) {
  if (turn.kind === "tool") {
    const line = `tool: ${turn.name} ${turn.args}`.trimEnd();
    return (
      <li className="flex flex-col gap-1.5">
        <p className="truncate font-mono text-xs text-muted" title={line}>
          {line}
        </p>
        {turn.output !== undefined && (
          <pre className="max-h-64 overflow-auto rounded-lg border border-rule bg-paper-2 p-3 font-mono text-xs whitespace-pre-wrap text-ink-2">
            {turn.output}
          </pre>
        )}
      </li>
    );
  }
  return (
    <li
      className={cn(
        "flex flex-col gap-1.5 rounded-lg p-3",
        turn.kind === "user" ? "border border-rule bg-paper-2" : "",
      )}
    >
      <p className="text-[0.6875rem] font-medium tracking-wide text-muted uppercase">
        {turn.kind === "user" ? "User" : "Assistant"}
      </p>
      <Markdown
        content={turn.text}
        currentPath="transcript.md"
        onNavigate={onNavigate}
        onOpenExternal={onOpenExternal}
      />
    </li>
  );
}
