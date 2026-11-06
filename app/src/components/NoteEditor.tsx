import { Check, Copy, Pencil, Trash2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { CommandLine } from "@/components/CommandLine";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { isConflict, type CfError } from "@/lib/cf";
import type { PendingRun, RunOp, StartRun } from "@/lib/runs";
import type { CfQuery } from "@/lib/use-cf-query";
import { cn } from "@/lib/utils";

/** What `memory show` and `learn show` both return. */
export interface NoteData {
  path: string;
  frontmatter: Record<string, unknown>;
  /** The body after the frontmatter block. */
  content: string;
  sha256: string;
}

/** An edit in progress: the body, and the `sha256` of the note when the edit began. */
export interface NoteDraft {
  body: string;
  sha: string;
  /** The last save hit `CONFLICT`: the note changed on disk since `sha`. */
  conflict: boolean;
}

/** What a save or delete left to say; `command` is a copyable hint, never run. */
export interface NoteNotice {
  text: string;
  command?: string;
  danger?: boolean;
}

/** The commands behind one kind of note (memory of a project, or learn). */
export interface NoteBackend<E, D> {
  editOp: RunOp;
  deleteOp: RunOp;
  /** `PendingRun.key` of this note's save and delete. */
  runKey: (id: string) => string;
  /** The command line as the native confirm will show it. */
  editCommand: (id: string, sha: string) => string;
  deleteCommand: (id: string, sha: string) => string;
  edit: (id: string, sha: string, body: string) => Promise<E>;
  remove: (id: string, sha: string) => Promise<D>;
  saved: (id: string, result: E) => NoteNotice;
  deleted: (id: string, result: D) => NoteNotice;
}

/**
 * Drafts (one per note id, so switching notes keeps them), the last outcome, and save and
 * delete through the Dashboard's one pending run. `after` refreshes the view.
 */
export function useNotes<E, D>(
  backend: NoteBackend<E, D>,
  run: StartRun,
  pending: PendingRun | null,
  after: {
    saved: (id: string) => void;
    deleted: (id: string) => void;
    /** A delete hit `CONFLICT`: reload the note so the next delete sends its new `sha256`. */
    conflict: (id: string) => void;
  },
) {
  const [drafts, setDrafts] = useState<ReadonlyMap<string, NoteDraft>>(
    () => new Map(),
  );
  const [outcome, setOutcome] = useState<NoteNotice | null>(null);

  const setDraft = useCallback((id: string, draft: NoteDraft | null) => {
    setDrafts((prev) => {
      const next = new Map(prev);
      if (draft) next.set(id, draft);
      else next.delete(id);
      return next;
    });
  }, []);

  const clearDrafts = useCallback(() => setDrafts(new Map()), []);
  const dismiss = useCallback(() => setOutcome(null), []);

  const save = (id: string, draft: NoteDraft) => {
    if (pending) return;
    setOutcome(null);
    run(
      {
        op: backend.editOp,
        key: backend.runKey(id),
        command: backend.editCommand(id, draft.sha),
      },
      () => backend.edit(id, draft.sha, draft.body),
      (result) => {
        setDraft(id, null);
        setOutcome(backend.saved(id, result));
        after.saved(id);
      },
      (message, error: CfError) => {
        if (isConflict(error)) {
          setDraft(id, { ...draft, conflict: true });
          return;
        }
        setOutcome({ text: `Could not save ${id}: ${message}`, danger: true });
      },
    );
  };

  const remove = (id: string, sha: string) => {
    if (pending) return;
    setOutcome(null);
    run(
      {
        op: backend.deleteOp,
        key: backend.runKey(id),
        command: backend.deleteCommand(id, sha),
      },
      () => backend.remove(id, sha),
      (result) => {
        setDraft(id, null);
        setOutcome(backend.deleted(id, result));
        after.deleted(id);
      },
      (message, error: CfError) => {
        if (isConflict(error)) {
          setOutcome({
            text: `${id} changed since you opened it, so it was not deleted. It was reloaded; try again.`,
            danger: true,
          });
          after.conflict(id);
          return;
        }
        setOutcome({
          text: `Could not delete ${id}: ${message}`,
          danger: true,
        });
      },
    );
  };

  /** "Waiting for confirmation…", "Saving…" or "Deleting…" while this note's run is pending. */
  const statusOf = (id: string): string | null => {
    if (!pending || pending.key !== backend.runKey(id)) return null;
    if (pending.op !== backend.editOp && pending.op !== backend.deleteOp)
      return null;
    if (!pending.started) return "Waiting for confirmation…";
    return pending.op === backend.deleteOp ? "Deleting…" : "Saving…";
  };

  return {
    drafts,
    setDraft,
    clearDrafts,
    outcome,
    dismiss,
    save,
    remove,
    statusOf,
  };
}

/** The last save or delete outcome, above the note pane. */
export function NoteOutcome({ notice }: { notice: NoteNotice | null }) {
  if (!notice) return null;
  return (
    <div className="flex flex-col gap-2">
      <p
        role={notice.danger ? "alert" : "status"}
        className={cn(
          "text-xs break-words",
          notice.danger ? "text-danger" : "text-muted",
        )}
      >
        {notice.text}
      </p>
      {notice.command && <CommandLine command={notice.command} />}
    </div>
  );
}

/** Frontmatter as `key: value` lines (plain text, never parsed as markdown). */
function frontmatterText(frontmatter: Record<string, unknown>): string | null {
  const lines = Object.entries(frontmatter).map(
    ([key, value]) =>
      `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
  );
  return lines.length > 0 ? lines.join("\n") : null;
}

const CONTROL =
  "rounded-md border border-rule bg-paper px-3 py-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50";

/**
 * One memory or learn note: rendered markdown (view) or its body in a textarea (edit). Save
 * sends the draft with the `sha256` the edit began from; `CONFLICT` keeps the draft. Rust
 * confirms every save and delete.
 */
export function NoteEditor({
  id,
  note,
  draft,
  onDraft,
  status,
  disabled,
  onSave,
  onDelete,
  onNavigate,
  onOpenExternal,
  describeError,
}: {
  id: string;
  note: CfQuery<NoteData>;
  draft: NoteDraft | undefined;
  onDraft: (draft: NoteDraft | null) => void;
  /** This note's pending run, if any. */
  status: string | null;
  /** Any mutation is pending. */
  disabled: boolean;
  onSave: (draft: NoteDraft) => void;
  onDelete: (sha: string) => void;
  /** A relative `.md` link, as a path relative to the notes folder. */
  onNavigate: (path: string) => void;
  onOpenExternal: (url: string) => void;
  describeError: (e: CfError) => string;
}) {
  const data = note.data;
  const frontmatter = useMemo(
    () => (data ? frontmatterText(data.frontmatter) : null),
    [data],
  );
  const busy = status !== null;
  const unchanged =
    draft !== undefined &&
    data !== undefined &&
    draft.sha === data.sha256 &&
    draft.body === data.content;

  let body: ReactNode;
  if (note.error) {
    body = (
      <div className="flex flex-col items-start gap-2">
        <p role="alert" className="text-sm break-words text-danger">
          Could not load {id}: {describeError(note.error)}
        </p>
        <Button variant="outline" size="sm" onClick={note.refetch}>
          Try again
        </Button>
      </div>
    );
  } else if (draft) {
    body = (
      <textarea
        aria-label={`Body of ${id}`}
        value={draft.body}
        disabled={busy}
        onChange={(e) => onDraft({ ...draft, body: e.target.value })}
        className={cn(CONTROL, "min-h-[60vh] w-full font-mono text-xs")}
      />
    );
  } else if (!data) {
    body = (
      <div aria-busy="true" className="flex flex-col gap-3">
        <Skeleton className="h-16 w-full" />
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
        {frontmatter !== null && (
          <pre className="overflow-x-auto rounded-lg border border-rule bg-paper-2 p-3 font-mono text-xs whitespace-pre-wrap text-muted">
            {frontmatter}
          </pre>
        )}
        <Markdown
          content={data.content}
          currentPath={`${id}.md`}
          onNavigate={onNavigate}
          onOpenExternal={onOpenExternal}
        />
      </>
    );
  }

  return (
    <article aria-label={id} className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <p
          className="min-w-0 flex-1 truncate font-mono text-xs text-muted"
          title={data?.path ?? id}
        >
          {id}
        </p>
        {note.showSpinner && <Spinner label={`Loading ${id}`} />}
        {draft ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => onDraft(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={
                disabled ||
                draft.conflict ||
                unchanged ||
                draft.body.trim() === ""
              }
              onClick={() => onSave(draft)}
            >
              Save
            </Button>
          </>
        ) : (
          data && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() =>
                  onDraft({
                    body: data.content,
                    sha: data.sha256,
                    conflict: false,
                  })
                }
              >
                <Pencil aria-hidden />
                Edit
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={disabled}
                onClick={() => onDelete(data.sha256)}
              >
                <Trash2 aria-hidden />
                Delete
              </Button>
            </>
          )
        )}
      </div>
      {status && (
        <p role="status" className="text-xs text-muted">
          {status}
        </p>
      )}
      {draft?.conflict && (
        <Conflict
          draft={draft.body}
          onReload={() => {
            onDraft(null);
            note.refetch();
          }}
        />
      )}
      {body}
    </article>
  );
}

function Conflict({
  draft,
  onReload,
}: {
  draft: string;
  onReload: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    navigator.clipboard?.writeText(draft).then(
      () => setCopied(true),
      () => {},
    );
  };

  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-lg border border-danger/40 p-3"
    >
      <p className="text-sm text-danger">
        This note changed on disk since you opened it, so it was not saved. Your
        draft is still here. Copy it, then reload the latest version (that
        discards the draft).
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy draft"}
        </Button>
        <Button variant="outline" size="sm" onClick={onReload}>
          Reload latest
        </Button>
      </div>
    </div>
  );
}

// ─── Shared by the Memory tab and the Learn view ────────────────────────

export const NOTES_LAYOUT = "flex items-start gap-6";
export const NOTES_LIST =
  "sticky top-4 flex max-h-[calc(100vh-2rem)] w-56 shrink-0 flex-col gap-1 overflow-y-auto";
export const NOTES_PANE = "flex min-w-0 flex-1 flex-col gap-4";

/** Notes by category, categories by name (each keeps the CLI's order). */
export function groupByCategory<T extends { category: string }>(
  items: T[],
): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(item.category);
    if (group) group.push(item);
    else groups.set(item.category, [item]);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b));
}

/** The note id a relative `.md` link points at (`<category>/<slug>`). */
export function noteIdOf(path: string): string {
  return path.replace(/\.(md|markdown)$/i, "");
}

/** One row of a notes list; selecting it only changes state, so it reacts at once. */
export function NoteItem({
  id,
  title,
  detail,
  selected,
  hasDraft,
  badge,
  onSelect,
}: {
  id: string;
  title: string;
  /** A second line (mono), e.g. the category of a search hit. */
  detail?: string;
  selected: boolean;
  hasDraft: boolean;
  badge?: ReactNode;
  onSelect: (id: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        title={id}
        onClick={() => onSelect(id)}
        className={cn(
          "flex w-full flex-col rounded-md px-2 py-1 text-left text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-focus",
          selected && "bg-paper-3 font-medium text-ink hover:bg-paper-3",
        )}
      >
        <span className="flex items-center gap-1.5 text-xs">
          <span className="truncate">{title || id}</span>
          {hasDraft && (
            <span className="shrink-0 text-[0.6875rem] text-muted">draft</span>
          )}
          {badge}
        </span>
        {detail && (
          <span className="truncate font-mono text-[0.6875rem] text-muted">
            {detail}
          </span>
        )}
      </button>
    </li>
  );
}

/** A category heading and its notes. */
export function NoteGroup({
  category,
  count,
  children,
}: {
  category: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <p className="flex items-baseline gap-2 px-2 py-1 text-xs font-medium text-muted">
        <span className="truncate">{category}</span>
        <span className="ml-auto font-mono">{count}</span>
      </p>
      <ul className="flex flex-col">{children}</ul>
    </div>
  );
}

/** Same-shape placeholder rows for a notes list; the spinner shows only when slow. */
export function NoteListSkeleton({
  label,
  showSpinner,
}: {
  label: string;
  showSpinner: boolean;
}) {
  return (
    <div aria-busy="true" className="flex flex-col gap-1">
      <div className="flex items-center gap-2 px-2 py-1">
        <Skeleton className="h-3.5 w-20" />
        {showSpinner && <Spinner label={label} />}
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex flex-col gap-1 px-2 py-1">
          <Skeleton className="h-3.5" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
