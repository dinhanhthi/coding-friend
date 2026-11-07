import { X } from "lucide-react";
import { memo, useCallback, useState } from "react";

import { Turn } from "@/components/SessionsView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CONTROL } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  describeCfError,
  isCancelled,
  openUrl,
  taskCancel,
  taskReply,
  toCfError,
  type AskRecord,
  type TaskState,
  type TaskView,
} from "@/lib/cf";
import { describePending, type PendingRun, type StartRun } from "@/lib/runs";
import { useTaskFollow, type FollowItem } from "@/lib/use-task-follow";
import { cn } from "@/lib/utils";

const TERMINAL_STATES: ReadonlySet<TaskState> = new Set<TaskState>([
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
]);

/** The detail column is the surface, so the task needs no card of its own. */
const CARD = "flex flex-col gap-4";
/** Worker output: plain text, never Markdown. */
const PLAIN = "text-sm break-words whitespace-pre-wrap";
/** Rust's `MAX_ANSWER` (bytes); `maxLength` counts UTF-16 units. */
const MAX_ANSWER = 4096;

function stateVariant(state: TaskState) {
  if (state === "running") return "success" as const;
  if (state === "failed") return "danger" as const;
  if (state === "paused") return "warning" as const;
  return "outline" as const;
}

/**
 * The live view of one task (`cf task follow`). The header shows the clicked row at once;
 * the transcript waits for the first poll. Reply and Cancel go through `run` (native confirm).
 */
export function TaskDetail({
  task: row,
  pending,
  run,
  onChanged,
  onClose,
}: {
  /** The row that was clicked, until the first poll returns the task. */
  task: TaskView;
  pending: PendingRun | null;
  run: StartRun;
  /** A reply or cancel went through: reload the task list. */
  onChanged: () => void;
  onClose: () => void;
}) {
  const follow = useTaskFollow(row.id);
  const task = follow.task ?? row;
  const terminal = follow.loaded
    ? follow.terminal
    : TERMINAL_STATES.has(task.state);
  const [error, setError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  const { refetch } = follow;
  const changed = useCallback(() => {
    refetch();
    onChanged();
  }, [refetch, onChanged]);

  const cancel = () => {
    if (pending) return;
    setError(null);
    run(
      {
        op: "taskCancel",
        key: task.id,
        command: `cf task cancel --json -- ${task.id}`,
      },
      () => taskCancel(task.id),
      changed,
      (message) => setError(`Could not cancel the task: ${message}`),
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

  const mine =
    pending !== null &&
    (pending.op === "taskCancel" || pending.op === "taskReply") &&
    pending.key !== null &&
    pending.key.startsWith(task.id);

  let body;
  if (!follow.loaded && follow.error) {
    body = (
      <div className="flex flex-col items-start gap-2">
        <p role="alert" className="text-sm break-words text-danger">
          Could not follow the task: {describeCfError(follow.error)}
        </p>
        <Button variant="outline" size="sm" onClick={follow.refetch}>
          Try again
        </Button>
      </div>
    );
  } else if (!follow.loaded) {
    body = (
      <div aria-busy="true" className="flex flex-col gap-3">
        {follow.showSpinner && <Spinner label="Loading the transcript" />}
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        ))}
      </div>
    );
  } else {
    const live = follow.live;
    body = (
      <>
        {live?.status === "unsupported" && (
          <p className="text-sm break-words text-muted">
            No live view for this task.{live.reason && ` ${live.reason}`}
          </p>
        )}
        {live?.status === "pending" && (
          <p role="status" className="text-sm text-muted">
            Waiting for the transcript…
          </p>
        )}
        {linkError && (
          <p role="alert" className="text-xs break-words text-danger">
            Could not open the link: {linkError}
          </p>
        )}
        {follow.items.length > 0 ? (
          <ol className="flex flex-col gap-3">
            {follow.items.map((item, i) => (
              <Item
                key={i}
                item={item}
                onNavigate={navigate}
                onOpenExternal={openExternal}
              />
            ))}
          </ol>
        ) : (
          live?.status === "ok" && (
            <p className="text-sm text-muted">No turns yet.</p>
          )
        )}
        {(follow.truncated || follow.trimmed) && (
          <p className="text-xs text-muted">
            {follow.trimmed
              ? "Older turns were dropped to keep the view small."
              : "Some turns were shortened to stay under the size limit."}
          </p>
        )}
        {follow.error && (
          <p role="alert" className="text-xs break-words text-danger">
            Could not refresh the task: {describeCfError(follow.error)}
          </p>
        )}
      </>
    );
  }

  return (
    <section aria-label={`Task ${task.id}`} className={CARD}>
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs">
          <Badge variant={stateVariant(task.state)}>{task.state}</Badge>
          <span className="text-ink-2">{task.provider}</span>
          {task.readOnly && <Badge variant="outline">read-only</Badge>}
          <span className="ml-auto truncate font-mono text-muted">
            {task.id}
          </span>
          {!terminal && (
            <Button
              variant="destructive"
              size="sm"
              onClick={cancel}
              disabled={pending !== null}
            >
              Cancel task
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            onClick={onClose}
          >
            <X aria-hidden />
          </Button>
        </div>
        <p className="truncate text-sm" title={task.prompt}>
          {task.prompt}
        </p>
        {task.hint && (
          <p className="text-xs break-words text-muted">{task.hint}</p>
        )}
      </header>

      {task.pendingAsks.map((ask) => (
        <AskReply
          key={ask.qid}
          taskId={task.id}
          ask={ask}
          pending={pending}
          run={run}
          onDone={changed}
        />
      ))}

      {pending && (
        <p role="status" className="text-xs text-muted">
          {mine
            ? pending.started
              ? "Running…"
              : "Waiting for confirmation…"
            : describePending(pending)}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs break-words text-danger">
          {error}
        </p>
      )}

      {task.done && (
        <div className="flex flex-col gap-1">
          <p className="text-[0.6875rem] font-medium tracking-wide text-muted uppercase">
            Done · {task.done.outcome}
          </p>
          <p className={PLAIN}>{task.done.summary}</p>
        </div>
      )}
      {task.result?.lastMessage && (
        <div className="flex flex-col gap-1">
          <p className="text-[0.6875rem] font-medium tracking-wide text-muted uppercase">
            Last message · {task.result.outcome}
          </p>
          <p className={PLAIN}>{task.result.lastMessage}</p>
        </div>
      )}

      {body}
    </section>
  );
}

/** Memoized: a poll keeps old items and the callbacks are stable, so old turns skip re-parsing. */
const Item = memo(function Item({
  item,
  onNavigate,
  onOpenExternal,
}: {
  item: FollowItem;
  onNavigate: (path: string) => void;
  onOpenExternal: (url: string) => void;
}) {
  if (item.kind === "attempt") {
    return (
      <li className="flex items-center gap-2 font-mono text-[0.6875rem] text-muted">
        <span aria-hidden className="h-px flex-1 bg-rule" />
        attempt {item.n} · {item.provider} · {item.attemptKind}
        <span aria-hidden className="h-px flex-1 bg-rule" />
      </li>
    );
  }
  return (
    <Turn turn={item} onNavigate={onNavigate} onOpenExternal={onOpenExternal} />
  );
});

/** One pending question: its text (plain, worker output) and a one-line answer. */
function AskReply({
  taskId,
  ask,
  pending,
  run,
  onDone,
}: {
  taskId: string;
  ask: AskRecord;
  pending: PendingRun | null;
  run: StartRun;
  onDone: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const trimmed = answer.trim();

  const send = () => {
    if (pending || trimmed === "") return;
    setError(null);
    run(
      {
        op: "taskReply",
        key: `${taskId}:${ask.qid}`,
        command: `cf reply --json --task ${taskId} -- ${ask.qid} ${JSON.stringify(trimmed)}`,
      },
      () => taskReply(taskId, ask.qid, trimmed),
      () => {
        setAnswer("");
        onDone();
      },
      (message) => setError(message),
    );
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-rule bg-paper-2 p-3">
      <p className="text-[0.6875rem] font-medium tracking-wide text-muted uppercase">
        Question <span className="font-mono normal-case">{ask.qid}</span>
      </p>
      <p className={PLAIN}>{ask.question}</p>
      <div className="flex items-center gap-2">
        <input
          aria-label={`Answer to question ${ask.qid}`}
          value={answer}
          maxLength={MAX_ANSWER}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          className={cn(CONTROL, "h-7 min-w-0 flex-1")}
        />
        <Button
          size="sm"
          onClick={send}
          disabled={pending !== null || trimmed === ""}
        >
          Reply
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs break-words text-danger">
          Could not send the reply: {error}
        </p>
      )}
    </div>
  );
}
