import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { Button } from "@/components/ui/button";
import { DETAIL, LIST, SPLIT } from "@/components/ui/layout";
import {
  describeCfError,
  isCancelled,
  memoryDelete,
  memoryEdit,
  memoryList,
  memoryRebuildCommand,
  memorySearch,
  memoryShow,
  openUrl,
  toCfError,
  type CfError,
  type MemoryDeleteResult,
  type MemoryEditResult,
  type MemoryIndexState,
} from "@/lib/cf";
import type { PendingRun, StartRun } from "@/lib/runs";
import { useCfQuery } from "@/lib/use-cf-query";
import { cn } from "@/lib/utils";

/** Typing pauses this long before a search runs. */
const SEARCH_DELAY_MS = 300;

function describeError(e: CfError): string {
  return e.kind === "cliTooOld"
    ? "This cf is too old for the memory browser. Update it from the Version view."
    : describeCfError(e);
}

/** A save or delete outcome, plus the rebuild hint when the search index went stale. */
function indexNotice(
  text: string,
  index: MemoryIndexState,
  project: string,
): NoteNotice {
  return index === "stale"
    ? {
        text: `${text} The search index may be stale. Rebuild it in a terminal:`,
        command: memoryRebuildCommand(project),
      }
    : { text };
}

/** The project instruction files whose rule line for the memory went with it. */
function ruleNotice(files: string[]): string[] {
  if (files.length === 0) return [];
  const names = files.map((f) => f.split("/").pop() ?? f);
  return [`Its rule line was also removed from ${names.join(" and ")}.`];
}

/**
 * A project's memories (`docs/memory/`): search or the list by category on the left, the
 * selected memory on the right. Save and delete go through Rust's native confirm.
 */
export function MemoryView({
  project,
  pending,
  run,
}: {
  project: string;
  pending: PendingRun | null;
  run: StartRun;
}) {
  const list = useCfQuery(`memory:${project}`, () => memoryList(project));
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setTerm(query.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // An empty box shows the list at once and never calls the CLI.
  const searching = query.trim() !== "" && term !== "";
  const search = useCfQuery(
    searching ? `memory-search:${project}:${term}` : null,
    () => memorySearch(project, term),
  );
  const note = useCfQuery(
    selected === null ? null : `memory-note:${project}:${selected}`,
    () => memoryShow(project, selected ?? ""),
  );

  // A run can end after the user moved on: refresh what is shown then, not what was.
  const latest = useRef({ selected, note, search });
  useEffect(() => {
    latest.current = { selected, note, search };
  });

  const backend: NoteBackend<MemoryEditResult, MemoryDeleteResult> = {
    editOp: "memoryEdit",
    deleteOp: "memoryDelete",
    runKey: (id) => `memory:${project}:${id}`,
    editCommand: (id, sha) =>
      `cf memory edit --stdin --if-match ${sha} --project-dir=${JSON.stringify(project)} -- ${JSON.stringify(id)}`,
    deleteCommand: (id, sha) =>
      `cf memory delete --yes --if-match ${sha} --project-dir=${JSON.stringify(project)} -- ${JSON.stringify(id)}`,
    edit: (id, sha, body) => memoryEdit(project, id, sha, body),
    remove: (id, sha) => memoryDelete(project, id, sha),
    saved: (id, result) => indexNotice(`Saved ${id}.`, result.index, project),
    deleted: (id, result) =>
      indexNotice(
        [
          `Deleted ${id}.`,
          ...ruleNotice(result.instructionFiles),
          ...result.warnings,
        ].join(" "),
        result.index,
        project,
      ),
  };
  const notes = useNotes(backend, run, pending, {
    saved: (id) => {
      if (latest.current.selected === id) latest.current.note.refetch();
      list.refetch();
      latest.current.search.refetch();
    },
    deleted: (id) => {
      if (latest.current.selected === id) setSelected(null);
      list.refetch();
      latest.current.search.refetch();
    },
    conflict: (id) => {
      if (latest.current.selected === id) latest.current.note.refetch();
    },
  });
  const { dismiss } = notes;

  const items = list.data;
  const known = useMemo(() => new Set(items?.map((m) => m.id)), [items]);
  const groups = useMemo(() => groupByCategory(items ?? []), [items]);

  // Only state updates: the new key reads `loading` in this same render.
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

  if (list.error) {
    return (
      <div className={SPLIT}>
        <div className={DETAIL}>
          <div className="flex flex-col items-start gap-2">
            <p role="alert" className="text-sm break-words text-danger">
              Could not load the memories: {describeError(list.error)}
            </p>
            <Button variant="outline" size="sm" onClick={list.refetch}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!items) {
    return (
      <div className={SPLIT}>
        <div className={cn(LIST, "w-60")}>
          <NoteListSkeleton
            label="Loading the memories"
            showSpinner={list.showSpinner}
          />
        </div>
        <div className={DETAIL} />
      </div>
    );
  }

  // The outcome of deleting the last memory still shows (e.g. the rebuild hint).
  if (items.length === 0)
    return (
      <div className={SPLIT}>
        <div className={DETAIL}>
          <NoteOutcome notice={notes.outcome} />
          <p className="text-sm text-muted">No memories in this project.</p>
        </div>
      </div>
    );

  const draftOf = (id: string) => notes.drafts.has(id);

  return (
    <div className={SPLIT}>
      <nav aria-label="Memories" className={cn(LIST, "w-60")}>
        <label className="flex items-center gap-2 rounded-md border border-rule bg-control px-2 focus-within:ring-2 focus-within:ring-focus">
          <Search aria-hidden className="size-3.5 shrink-0 text-muted" />
          <input
            type="search"
            aria-label="Search memories"
            placeholder="Search"
            value={query}
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            className="h-7 min-w-0 flex-1 bg-transparent text-xs text-ink outline-none"
          />
        </label>

        {!searching ? (
          groups.map(([category, memories]) => (
            <NoteGroup
              key={category}
              category={category}
              count={memories.length}
            >
              {memories.map((m) => (
                <NoteItem
                  key={m.id}
                  id={m.id}
                  title={m.title}
                  selected={m.id === selected}
                  hasDraft={draftOf(m.id)}
                  onSelect={select}
                />
              ))}
            </NoteGroup>
          ))
        ) : search.error ? (
          <p role="alert" className="px-2 py-1 text-xs break-words text-danger">
            Could not search: {describeError(search.error)}
          </p>
        ) : !search.data ? (
          <NoteListSkeleton
            label="Searching the memories"
            showSpinner={search.showSpinner}
          />
        ) : search.data.results.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted">No memories match.</p>
        ) : (
          <ul className="flex flex-col">
            {search.data.results.map((m) => (
              <NoteItem
                key={m.id}
                id={m.id}
                title={m.title}
                detail={m.category}
                selected={m.id === selected}
                hasDraft={draftOf(m.id)}
                onSelect={select}
              />
            ))}
          </ul>
        )}
      </nav>

      <div className={DETAIL}>
        <NoteOutcome notice={notes.outcome} />
        {missing && (
          <p role="alert" className="text-xs break-all text-danger">
            {missing} is not in this project's memory.
          </p>
        )}
        {linkError && (
          <p role="alert" className="text-xs break-words text-danger">
            Could not open the link: {linkError}
          </p>
        )}
        {selected === null ? (
          <p className="text-sm text-muted">Choose a memory to read it.</p>
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
  );
}
