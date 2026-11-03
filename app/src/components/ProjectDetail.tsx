import { RefreshCw } from "lucide-react";
import { useState, type ReactNode } from "react";

import { ConfigView, type SetConfig } from "@/components/ConfigView";
import { DocsView } from "@/components/DocsView";
import { ChecksSkeleton, DoctorChecks } from "@/components/DoctorView";
import { MemoryView } from "@/components/MemoryView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

  return (
    <article
      aria-labelledby="project-title"
      aria-busy={loading}
      className="mx-auto flex max-w-3xl flex-col gap-8 px-8 py-7"
    >
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2
            id="project-title"
            className="truncate text-lg font-semibold tracking-tight"
          >
            {projectName(project.path)}
          </h2>
          <p
            className="truncate font-mono text-xs text-muted"
            title={project.path}
          >
            {project.path}
          </p>
        </div>
        {!project.exists && <Badge variant="danger">folder missing</Badge>}
        {loading && activity.showSpinner && (
          <Spinner label="Loading tasks and chefs" className="mt-1" />
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
      </header>

      <div role="tablist" aria-label="Project" className="-mt-4 flex gap-1">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`project-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="project-tabpanel"
            onClick={() => setTab(id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-focus",
              tab === id && "bg-paper-3 font-medium text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id="project-tabpanel"
        aria-labelledby={`project-tab-${tab}`}
        className="flex flex-col gap-8"
      >
        {overview ? (
          <Overview activity={activity} />
        ) : !project.exists ? (
          <p className="text-sm text-muted">
            The folder is missing, so its {tab} cannot be read.
          </p>
        ) : tab === "config" ? (
          <ConfigView
            key={project.path}
            scope="local"
            project={project.path}
            pending={pending}
            onSet={onSetConfig}
            onOpenLearn={onOpenLearn}
          />
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
          <HealthView key={project.path} project={project.path} />
        )}
      </div>
    </article>
  );
}

function Overview({ activity }: { activity: CfQuery<ProjectActivity> }) {
  return (
    <>
      {activity.status === "error" && activity.error ? (
        <p role="alert" className="text-sm break-words text-danger">
          Could not load tasks and chefs: {describeCfError(activity.error)}
        </p>
      ) : (
        <>
          <Section title="Tasks" count={activity.data?.tasks.length}>
            {activity.data ? (
              activity.data.tasks.length > 0 ? (
                activity.data.tasks.map((t) => <TaskRow key={t.id} task={t} />)
              ) : (
                <Empty>No running, waiting, paused or queued tasks.</Empty>
              )
            ) : (
              <RowSkeletons />
            )}
          </Section>
          <Section title="Chefs" count={activity.data?.chefs.length}>
            {activity.data ? (
              activity.data.chefs.length > 0 ? (
                activity.data.chefs.map((c) => <ChefRow key={c.id} chef={c} />)
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
    </>
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
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-baseline gap-2 text-xs font-medium tracking-wide text-muted uppercase">
        {title}
        {count !== undefined && <span className="font-mono">{count}</span>}
      </h3>
      <ul className="flex flex-col divide-y divide-rule rounded-lg border border-rule">
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
  if (state === "paused" || state === "quota-wait") return "default" as const;
  return "outline" as const;
}

function TaskRow({ task }: { task: TaskView }) {
  const asks = task.pendingAsks.length;
  return (
    <li className={ROW}>
      <div className="flex items-center gap-2 text-xs">
        <Badge variant={stateVariant(task.state)}>{task.state}</Badge>
        <span className="text-ink-2">{task.provider}</span>
        {task.readOnly && <Badge variant="outline">read-only</Badge>}
        {asks > 0 && (
          <span className="text-muted">
            {asks === 1 ? "1 question" : `${asks} questions`} waiting
          </span>
        )}
        <span className="ml-auto truncate font-mono text-muted">{task.id}</span>
      </div>
      <p className="truncate text-sm" title={task.prompt}>
        {task.prompt}
      </p>
      {task.hint && (
        <p className="truncate text-xs text-muted" title={task.hint}>
          {task.hint}
        </p>
      )}
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
