import { RefreshCw } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { ConfigView, type SetConfig } from "@/components/ConfigView";
import { DocsView } from "@/components/DocsView";
import { ChecksSkeleton, DoctorChecks } from "@/components/DoctorView";
import { MemoryView } from "@/components/MemoryView";
import { TaskDetail } from "@/components/TaskDetail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DETAIL,
  LIST,
  READING,
  SCROLL,
  SEGMENT,
  SEGMENT_ON,
  SEGMENTS,
  SPLIT,
  VIEW,
} from "@/components/ui/layout";
import { PaneHeader } from "@/components/ui/pane-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  chefStatus,
  describeCfError,
  projectDoctor,
  taskList,
  type CfError,
  type ChefStatusView,
  type ProjectEntry,
  type TaskState,
  type TaskView,
} from "@/lib/cf";
import { inProject } from "@/lib/project-filter";
import type { PendingRun, StartRun } from "@/lib/runs";
import { useCfQuery, useDelayed, type CfQuery } from "@/lib/use-cf-query";
import { cn } from "@/lib/utils";

/** `waiting` is a running task that asked a question, so it counts as live. */
const LIVE_TASK_STATES: ReadonlySet<TaskState> = new Set<TaskState>([
  "running",
  "waiting",
  "paused",
  "queued",
]);

export interface ProjectActivity {
  tasks: TaskView[];
  chefs: ChefStatusView[];
}

export async function loadProjectActivity(
  projectPath: string,
): Promise<ProjectActivity> {
  const [tasks, chefs] = await Promise.all([taskList(), chefStatus()]);
  return {
    tasks: tasks.filter(
      (t) =>
        LIVE_TASK_STATES.has(t.state) && inProject(t.checkout, projectPath),
    ),
    chefs: chefs.filter((c) => inProject(c.checkout, projectPath)),
  };
}

export function projectName(path: string): string {
  return path.replace(/\/+$/, "").split("/").pop() || path;
}

type Tab = "overview" | "config" | "docs" | "memory" | "health";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "config", label: "Config" },
  { id: "docs", label: "Docs" },
  { id: "memory", label: "Memory" },
  { id: "health", label: "Health" },
];

/**
 * Rendered only once the project list has loaded, so Rust knows the project and a
 * project-scoped call is not refused.
 */
export function ProjectDetail({
  project,
  activity,
  pending,
  onSetConfig,
  run,
  onOpenLearn,
}: {
  project: ProjectEntry;
  activity: CfQuery<ProjectActivity>;
  pending: PendingRun | null;
  onSetConfig: SetConfig;
  /** The Dashboard's one pending mutation (memory save and delete). */
  run: StartRun;
  onOpenLearn: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const overview = tab === "overview";
  const loading = overview && activity.status === "loading";
  const showRefreshing = useDelayed(activity.refreshing);
  // The clicked task, tagged with its project so another project never shows it.
  const [picked, setPicked] = useState<{
    project: string;
    task: TaskView;
  } | null>(null);
  useEffect(() => setPicked(null), [project.path]);
  const selectedTask = picked?.project === project.path ? picked.task : null;
  const selectTask = (task: TaskView) =>
    setPicked((prev) =>
      prev?.project === project.path && prev.task.id === task.id
        ? null
        : { project: project.path, task },
    );

  return (
    <article
      aria-labelledby="project-title"
      aria-busy={loading}
      className={VIEW}
    >
      <PaneHeader
        title={projectName(project.path)}
        titleId="project-title"
        subtitle={project.path}
        subtitleMono
        controls={
          <div role="tablist" aria-label="Project" className={SEGMENTS}>
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`project-tab-${id}`}
                aria-selected={tab === id}
                aria-controls="project-tabpanel"
                onClick={() => setTab(id)}
                className={cn(SEGMENT, tab === id && SEGMENT_ON)}
              >
                {label}
              </button>
            ))}
          </div>
        }
        actions={
          <>
            {!project.exists && <Badge variant="danger">folder missing</Badge>}
            {loading && activity.showSpinner && (
              <Spinner label="Loading tasks and chefs" />
            )}
            {overview && activity.status !== "loading" && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Refresh"
                onClick={activity.refetch}
                disabled={activity.refreshing}
              >
                <RefreshCw
                  aria-hidden
                  className={showRefreshing ? "animate-spin" : ""}
                />
              </Button>
            )}
          </>
        }
      />

      <div
        role="tabpanel"
        id="project-tabpanel"
        aria-labelledby={`project-tab-${tab}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        {overview ? (
          <Overview
            activity={activity}
            selectedTask={selectedTask}
            onSelectTask={selectTask}
            onCloseTask={() => setPicked(null)}
            pending={pending}
            run={run}
          />
        ) : !project.exists ? (
          <Reading>
            <p className="text-sm text-muted">
              The folder is missing, so its {tab} cannot be read.
            </p>
          </Reading>
        ) : tab === "config" ? (
          <Reading>
            <ConfigView
              key={project.path}
              scope="local"
              project={project.path}
              pending={pending}
              onSet={onSetConfig}
              onOpenLearn={onOpenLearn}
            />
          </Reading>
        ) : tab === "docs" ? (
          <DocsView key={project.path} project={project.path} />
        ) : tab === "memory" ? (
          <MemoryView
            key={project.path}
            project={project.path}
            pending={pending}
            run={run}
          />
        ) : (
          <Reading>
            <HealthView key={project.path} project={project.path} />
          </Reading>
        )}
      </div>
    </article>
  );
}

/** A tab body that scrolls as a whole at reading width. */
function Reading({ children }: { children: ReactNode }) {
  return (
    <div className={SCROLL}>
      <div className={READING}>{children}</div>
    </div>
  );
}

function Overview({
  activity,
  selectedTask,
  onSelectTask,
  onCloseTask,
  pending,
  run,
}: {
  activity: CfQuery<ProjectActivity>;
  selectedTask: TaskView | null;
  onSelectTask: (task: TaskView) => void;
  onCloseTask: () => void;
  pending: PendingRun | null;
  run: StartRun;
}) {
  // A task that left the live list keeps its clicked snapshot; a listed one shows its row.
  const shownTask = selectedTask
    ? (activity.data?.tasks.find((t) => t.id === selectedTask.id) ??
      selectedTask)
    : null;
  return (
    <div className={SPLIT}>
      <div className={cn(LIST, "w-72 gap-6 p-3")}>
        {activity.status === "error" && activity.error ? (
          <p role="alert" className="text-sm break-words text-danger">
            Could not load tasks and chefs: {describeCfError(activity.error)}
          </p>
        ) : (
          <>
            <Section title="Tasks" count={activity.data?.tasks.length} plain>
              {activity.data ? (
                activity.data.tasks.length > 0 ? (
                  activity.data.tasks.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      selected={t.id === selectedTask?.id}
                      onSelect={onSelectTask}
                    />
                  ))
                ) : (
                  <Empty>No running, waiting, paused or queued tasks.</Empty>
                )
              ) : (
                <RowSkeletons />
              )}
            </Section>
            <Section title="Chefs" count={activity.data?.chefs.length} plain>
              {activity.data ? (
                activity.data.chefs.length > 0 ? (
                  activity.data.chefs.map((c) => (
                    <ChefRow key={c.id} chef={c} />
                  ))
                ) : (
                  <Empty>No chefs.</Empty>
                )
              ) : (
                <RowSkeletons />
              )}
            </Section>
          </>
        )}

        <p className="text-xs text-muted">
          Shows tasks and chefs whose checkout is this folder or a folder inside
          it. Worktrees elsewhere on disk are not shown.
        </p>
      </div>
      <div className={DETAIL}>
        {shownTask ? (
          <TaskDetail
            key={shownTask.id}
            task={shownTask}
            pending={pending}
            run={run}
            onChanged={activity.refetch}
            onClose={onCloseTask}
          />
        ) : (
          // On a load error the list column already says why; no prompt to choose.
          activity.status !== "error" && (
            <p className="text-sm text-muted">Choose a task to follow it.</p>
          )
        )}
      </div>
    </div>
  );
}

function describeHealthError(e: CfError): string {
  return e.kind === "cliTooOld"
    ? "This cf is too old for the project health check. Update it from the Version view."
    : describeCfError(e);
}

/** `cf doctor --project-dir`: read-only checks, hints only, never a fix button. */
function HealthView({ project }: { project: string }) {
  const health = useCfQuery(`doctor:${project}`, () => projectDoctor(project));
  const showRefreshing = useDelayed(health.refreshing);

  if (health.error) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p role="alert" className="text-sm break-words text-danger">
          Could not check the project: {describeHealthError(health.error)}
        </p>
        <Button variant="outline" size="sm" onClick={health.refetch}>
          Try again
        </Button>
      </div>
    );
  }

  const data = health.data;
  if (!data) {
    return (
      <div aria-busy="true" className="flex flex-col gap-8">
        <div className="flex items-center gap-3">
          <Skeleton className="h-3 w-48" />
          {health.showSpinner && <Spinner label="Checking the project" />}
        </div>
        <ChecksSkeleton />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted">
          CLI {data.cli.version} · node {data.cli.node}
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Check again"
          onClick={health.refetch}
          disabled={health.refreshing}
        >
          <RefreshCw
            aria-hidden
            className={showRefreshing ? "animate-spin" : ""}
          />
        </Button>
      </div>
      <DoctorChecks checks={data.checks} />
    </div>
  );
}

export function Section({
  title,
  count,
  plain = false,
  children,
}: {
  title: string;
  count?: number;
  /** A source-list column: rows without the bordered card. */
  plain?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3
        className={cn(
          "flex items-baseline gap-2 text-muted",
          plain
            ? "px-3 text-[11px] font-semibold"
            : "text-xs font-medium tracking-wide uppercase",
        )}
      >
        {title}
        {count !== undefined && <span className="font-mono">{count}</span>}
      </h3>
      <ul
        className={cn(
          "flex flex-col",
          plain
            ? "gap-0.5"
            : "divide-y divide-rule rounded-lg border border-rule",
        )}
      >
        {children}
      </ul>
    </section>
  );
}

const ROW = "flex min-h-14 flex-col justify-center gap-1 px-3 py-2";

function RowSkeletons() {
  return (
    <>
      {[0, 1].map((i) => (
        <li key={i} aria-hidden className={ROW}>
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-3.5 w-full max-w-md" />
        </li>
      ))}
    </>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <li className={`${ROW} text-sm text-muted`}>{children}</li>;
}

function stateVariant(state: string) {
  if (state === "running" || state === "active") return "success" as const;
  if (state === "paused" || state === "quota-wait") return "warning" as const;
  return "outline" as const;
}

function TaskRow({
  task,
  selected,
  onSelect,
}: {
  task: TaskView;
  selected: boolean;
  onSelect: (task: TaskView) => void;
}) {
  const asks = task.pendingAsks.length;
  return (
    <li className="flex">
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onSelect(task)}
        className={cn(
          ROW,
          "w-full min-w-0 rounded-md text-left outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus",
          selected && "bg-paper-3 hover:bg-paper-3",
        )}
      >
        <span className="flex items-center gap-2 text-xs">
          <Badge variant={stateVariant(task.state)}>{task.state}</Badge>
          <span className="text-ink-2">{task.provider}</span>
          {task.readOnly && <Badge variant="outline">read-only</Badge>}
          {asks > 0 && (
            <span className="text-muted">
              {asks === 1 ? "1 question" : `${asks} questions`} waiting
            </span>
          )}
          <span className="ml-auto truncate font-mono text-muted">
            {task.id}
          </span>
        </span>
        <span className="truncate text-sm" title={task.prompt}>
          {task.prompt}
        </span>
        {task.hint && (
          <span className="truncate text-xs text-muted" title={task.hint}>
            {task.hint}
          </span>
        )}
      </button>
    </li>
  );
}

function ChefRow({ chef }: { chef: ChefStatusView }) {
  return (
    <li className={ROW}>
      <div className="flex items-center gap-2 text-xs">
        <Badge variant={stateVariant(chef.state)}>{chef.state}</Badge>
        <span className="text-ink-2">{chef.provider}</span>
        <span className="truncate font-mono text-muted">{chef.branch}</span>
        {chef.inbox > 0 && (
          <span className="text-muted">{chef.inbox} in inbox</span>
        )}
        <span className="ml-auto truncate font-mono text-muted">{chef.id}</span>
      </div>
      <p className="truncate font-mono text-xs text-ink-2" title={chef.planDir}>
        {chef.planDir}
      </p>
      {chef.reason && (
        <p className="truncate text-xs text-muted" title={chef.reason}>
          {chef.reason}
        </p>
      )}
    </li>
  );
}
