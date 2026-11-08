import { ChevronDown, ChevronRight, FolderOpen, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CommandLine } from "@/components/CommandLine";
import {
  NoteEditor,
  NoteGroup,
  NoteItem,
  NoteListSkeleton,
  NoteOutcome,
  groupByCategory,
  noteIdOf,
  useNotes,
  type NoteBackend,
  type NoteNotice,
} from "@/components/NoteEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DETAIL, LIST, SPLIT, VIEW } from "@/components/ui/layout";
import { PaneHeader } from "@/components/ui/pane-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  chooseLearnDir,
  describeCfError,
  isCancelled,
  learnDelete,
  learnEdit,
  learnList,
  learnShow,
  learnStatus,
  openUrl,
  setLearnDir,
  toCfError,
  type CfError,
  type CloudProvider,
  type LearnDeleteResult,
  type LearnEditResult,
  type LearnStatus,
} from "@/lib/cf";
import { describePending, type PendingRun, type StartRun } from "@/lib/runs";
import { useCfQuery, useDelayed, type CfQuery } from "@/lib/use-cf-query";
import { cn } from "@/lib/utils";

export const CLOUD_LABELS: Record<CloudProvider, string> = {
  icloud: "iCloud Drive",
  "google-drive": "Google Drive",
  dropbox: "Dropbox",
  onedrive: "OneDrive",
  other: "a cloud folder",
};

/** `PendingRun.key` of "Choose folder…" (a suggestion uses its path). */
const CHOOSE_KEY = "choose";

function describeError(e: CfError): string {
  return e.kind === "cliTooOld"
    ? "This cf is too old for the Learn view. Update it from the Version view."
    : describeCfError(e);
}

/** What a git-mode save or delete did about the commit; folder mode never commits. */
function commitNotice(
  text: string,
  result: LearnEditResult | LearnDeleteResult,
): NoteNotice {
  if (result.mode !== "git") return { text };
  if (result.commitError)
    return {
      text: `${text} Not committed: ${result.commitError}`,
      danger: true,
    };
  return result.committed
    ? { text: `${text} Committed to the learn repo.` }
    : { text };
}

/**
 * The global learn notes (`learn.outputDir`): where they live, the notes by category, and
 * the selected note. Every save, delete and folder change goes through Rust's native confirm.
 */
export function LearnView({
  pending,
  run,
  openStorage = false,
}: {
  pending: PendingRun | null;
  run: StartRun;
  /** Start with the storage card open (arriving from "Open Learn"). */
  openStorage?: boolean;
}) {
  const status = useCfQuery("learn-status", learnStatus);
  const list = useCfQuery("learn-list", learnList);
  const [selected, setSelected] = useState<string | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [dirError, setDirError] = useState<string | null>(null);
  // Collapsed by default like Sessions' storage card, so the notes come first.
  const [storageOpen, setStorageOpen] = useState(openStorage);
  const note = useCfQuery(
    selected === null ? null : `learn-note:${selected}`,
    () => learnShow(selected ?? ""),
  );
  const showRefreshing = useDelayed(list.refreshing || status.refreshing);

  // A run can end after the user moved on: refresh what is shown then, not what was.
  const latest = useRef({ selected, note });
  useEffect(() => {
    latest.current = { selected, note };
  });

  const backend: NoteBackend<LearnEditResult, LearnDeleteResult> = {
    editOp: "learnEdit",
    deleteOp: "learnDelete",
    runKey: (id) => `learn:${id}`,
    editCommand: (id, sha) =>
      `cf learn edit --stdin --if-match ${sha} -- ${JSON.stringify(id)}`,
    deleteCommand: (id, sha) =>
      `cf learn delete --yes --if-match ${sha} -- ${JSON.stringify(id)}`,
    edit: learnEdit,
    remove: learnDelete,
    saved: (id, result) => commitNotice(`Saved ${id}.`, result),
    deleted: (id, result) => commitNotice(`Deleted ${id}.`, result),
  };
  const notes = useNotes(backend, run, pending, {
    saved: (id) => {
      if (latest.current.selected === id) latest.current.note.refetch();
      list.refetch();
    },
    deleted: (id) => {
      if (latest.current.selected === id) setSelected(null);
      list.refetch();
    },
    conflict: (id) => {
      if (latest.current.selected === id) latest.current.note.refetch();
    },
  });
  const { dismiss, clearDrafts } = notes;

  const notesData = list.data?.notes;
  const known = useMemo(
    () => new Set(notesData?.map((n) => n.id)),
    [notesData],
  );
  const groups = useMemo(() => groupByCategory(notesData ?? []), [notesData]);

  const select = useCallback(
    (id: string) => {
      setSelected(id);
      setMissing(null);
      setLinkError(null);
      dismiss();
    },
    [dismiss],
  );

  const navigate = useCallback(
    (path: string) => {
      const id = noteIdOf(path);
      if (known.has(id)) select(id);
      else setMissing(path);
    },
    [known, select],
  );

  const openExternal = useCallback((url: string) => {
    setLinkError(null);
    openUrl(url).catch((e: unknown) => {
      if (!isCancelled(e)) setLinkError(describeCfError(toCfError(e)));
    });
  }, []);

  // Another folder holds other notes: ids and drafts of the old one mean nothing there.
  const changeDir = (key: string, action: () => Promise<unknown>) => {
    if (pending) return;
    setDirError(null);
    run(
      {
        op: "learnDir",
        key,
        command:
          key === CHOOSE_KEY
            ? "cf config set --global -- learn.outputDir <folder>"
            : `cf config set --global -- "learn.outputDir" ${JSON.stringify(key)}`,
        ...(key === CHOOSE_KEY && { picker: true }),
      },
      action,
      () => {
        setSelected(null);
        clearDrafts();
        dismiss();
        status.refetch();
        list.refetch();
      },
      (message) => setDirError(message),
    );
  };

  const refresh = () => {
    status.refetch();
    list.refetch();
  };

  return (
    <article aria-labelledby="learn-title" className={VIEW}>
      <PaneHeader
        title="Learn"
        titleId="learn-title"
        actions={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Reload the learn notes"
            onClick={refresh}
            disabled={list.refreshing || status.refreshing}
          >
            <RefreshCw
              aria-hidden
              className={showRefreshing ? "animate-spin" : ""}
            />
          </Button>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex max-h-[45%] shrink-0 flex-col gap-3 overflow-y-auto border-b border-rule px-4 py-3">
          <p className="text-xs text-muted">
            Learn notes are global: every project writes to the same folder.
          </p>
          <StorageCard
            open={storageOpen}
            onOpen={setStorageOpen}
            status={status}
            pending={pending}
            error={dirError}
            onChoose={() => changeDir(CHOOSE_KEY, chooseLearnDir)}
            onUse={(path) => changeDir(path, () => setLearnDir(path))}
          />
        </div>

        {list.error ? (
          <div className={SPLIT}>
            <div className={DETAIL}>
              <div className="flex flex-col items-start gap-2">
                <p role="alert" className="text-sm break-words text-danger">
                  Could not load the learn notes: {describeError(list.error)}
                </p>
                <Button variant="outline" size="sm" onClick={list.refetch}>
                  Try again
                </Button>
              </div>
            </div>
          </div>
        ) : !list.data ? (
          <div className={SPLIT}>
            <div className={cn(LIST, "w-60")}>
              <NoteListSkeleton
                label="Loading the learn notes"
                showSpinner={list.showSpinner}
              />
            </div>
            <div className={DETAIL} />
          </div>
        ) : list.data.notes.length === 0 &&
          list.data.placeholders.length === 0 ? (
          <div className={SPLIT}>
            <div className={DETAIL}>
              <NoteOutcome notice={notes.outcome} />
              <p className="text-sm text-muted">
                No learn notes in this folder yet.
              </p>
            </div>
          </div>
        ) : (
          <div className={SPLIT}>
            <nav aria-label="Learn notes" className={cn(LIST, "w-60")}>
              {groups.map(([category, entries]) => (
                <NoteGroup
                  key={category}
                  category={category}
                  count={entries.length}
                >
                  {entries.map((n) => (
                    <NoteItem
                      key={n.id}
                      id={n.id}
                      title={n.title}
                      selected={n.id === selected}
                      hasDraft={notes.drafts.has(n.id)}
                      badge={
                        n.possibleConflictOf && (
                          <Badge
                            variant="danger"
                            title={`Looks like a sync conflict copy of ${n.possibleConflictOf}`}
                          >
                            conflict
                          </Badge>
                        )
                      }
                      onSelect={select}
                    />
                  ))}
                </NoteGroup>
              ))}
              {list.data.placeholders.length > 0 && (
                <p
                  className="px-2 py-1 text-xs text-muted"
                  title={list.data.placeholders.map((p) => p.id).join("\n")}
                >
                  {list.data.placeholders.length} not downloaded. The cloud app
                  has not downloaded these files yet; they are never opened
                  here.
                </p>
              )}
            </nav>

            {/* Keyed: another note starts at the top, not at the last one's scroll. */}
            <div key={selected ?? ""} className={DETAIL}>
              <NoteOutcome notice={notes.outcome} />
              {missing && (
                <p role="alert" className="text-xs break-all text-danger">
                  {missing} is not in the learn folder.
                </p>
              )}
              {linkError && (
                <p role="alert" className="text-xs break-words text-danger">
                  Could not open the link: {linkError}
                </p>
              )}
              {selected === null ? (
                <p className="text-sm text-muted">Choose a note to read it.</p>
              ) : (
                <NoteEditor
                  key={selected}
                  id={selected}
                  note={note}
                  draft={notes.drafts.get(selected)}
                  onDraft={(draft) => notes.setDraft(selected, draft)}
                  status={notes.statusOf(selected)}
                  disabled={pending !== null}
                  onSave={(draft) => notes.save(selected, draft)}
                  onDelete={(sha) => notes.remove(selected, sha)}
                  onNavigate={navigate}
                  onOpenExternal={openExternal}
                  describeError={describeError}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

/** Where learn notes live, and the two ways to change it (both confirmed by Rust). */
function StorageCard({
  open,
  onOpen,
  status,
  pending,
  error,
  onChoose,
  onUse,
}: {
  open: boolean;
  onOpen: (open: boolean) => void;
  status: CfQuery<LearnStatus>;
  pending: PendingRun | null;
  error: string | null;
  onChoose: () => void;
  onUse: (path: string) => void;
}) {
  const dirRun = pending?.op === "learnDir" ? pending : null;
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
          Could not read where learn notes live: {describeError(status.error)}
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
            <Spinner label="Reading where learn notes live" />
          )}
        </div>
        <Skeleton className="h-3.5 w-56" />
        <Skeleton className="h-7 w-32" />
      </div>
    );
  } else {
    const s = status.data;
    const chooseStatus = runStatus(CHOOSE_KEY);
    content = (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 font-mono text-sm break-all">{s.outputDir}</p>
          <Badge variant="default">{s.mode}</Badge>
          {s.cloud && (
            <Badge variant="outline">{CLOUD_LABELS[s.cloud.provider]}</Badge>
          )}
          {!s.exists && <Badge variant="outline">not created yet</Badge>}
        </div>
        <p className="text-xs text-muted">
          {s.mode === "git"
            ? `Git repo at ${s.git?.root ?? s.outputDir}. ${
                s.autoCommit
                  ? "Each save or delete commits that one note (learn.autoCommit)."
                  : "Saves are not committed (learn.autoCommit is off)."
              }`
            : "Plain folder: saves only write files. A cloud app, if any, syncs them."}
        </p>
        {s.mode === "git" && s.cloud && (
          <p role="alert" className="text-xs break-words text-danger">
            This git repo is inside {CLOUD_LABELS[s.cloud.provider]}. Cloud sync
            and git can damage each other's files: use a plain folder in the
            cloud, or a git repo outside it.
          </p>
        )}
        {s.mode === "git" && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted">
              The app never pushes. To push the learn repo, run in a terminal:
            </p>
            <CommandLine command="cf learn push" />
          </div>
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
                const current = suggestion.path === s.outputDir;
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
                          Will be created on the first note.
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
            Could not change the learn folder: {error}
          </p>
        )}
      </>
    );
  }

  return (
    <section
      aria-labelledby="learn-storage-title"
      className="flex flex-col gap-3"
    >
      <h3 id="learn-storage-title">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => onOpen(!open)}
          className="flex w-full items-center gap-1.5 rounded-sm text-left text-xs font-medium tracking-wide text-muted uppercase outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Chevron aria-hidden className="size-3.5" />
          Where learn notes live
          {!open && status.data && (
            <span className="min-w-0 flex-1 truncate font-mono tracking-normal normal-case">
              {status.data.outputDir}
            </span>
          )}
        </button>
      </h3>
      {content}
    </section>
  );
}
