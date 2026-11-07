import {
  GraduationCap,
  Info,
  MessagesSquare,
  Plus,
  Settings,
  Stethoscope,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import { projectName } from "@/components/ProjectDetail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  describeCfError,
  type ProjectList,
  type SupervisorStatus,
} from "@/lib/cf";
import { describePending, type PendingRun } from "@/lib/runs";
import type { CfQuery } from "@/lib/use-cf-query";
import { cn } from "@/lib/utils";

export type View =
  "projects" | "learn" | "sessions" | "doctor" | "version" | "settings";

type ViewEntry = { id: View; label: string; icon: LucideIcon };

const TOP_VIEWS: ViewEntry[] = [
  { id: "learn", label: "Learn", icon: GraduationCap },
  { id: "sessions", label: "Sessions", icon: MessagesSquare },
  { id: "doctor", label: "Doctor", icon: Stethoscope },
];

const BOTTOM_VIEWS: ViewEntry[] = [
  { id: "settings", label: "Settings", icon: Settings },
  { id: "version", label: "Version", icon: Info },
];

export function Sidebar({
  view,
  onView,
  projects,
  selectedPath,
  onSelect,
  onAdd,
  onRemove,
  actionError,
  pending,
  supervisor,
}: {
  view: View;
  onView: (view: View) => void;
  projects: CfQuery<ProjectList>;
  /** `null` when no project is shown (another view is open). */
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onAdd: () => void;
  onRemove: (path: string) => void;
  actionError: string | null;
  /** Disables add and remove while any mutating command is pending. */
  pending: PendingRun | null;
  supervisor: CfQuery<SupervisorStatus>;
}) {
  // A pending remove shows on its row; anything else gets one line below the list.
  const reason =
    pending && pending.op !== "projectRemove" ? describePending(pending) : null;
  return (
    <aside className="flex w-60 shrink-0 flex-col select-none">
      {/* Overlay titlebar: the traffic lights sit on this strip. */}
      <div data-tauri-drag-region className="h-13 shrink-0">
        <h1 className="sr-only">Coding Friend</h1>
      </div>

      <nav aria-label="Views" className="flex flex-col gap-px px-2.5">
        {TOP_VIEWS.map((entry) => (
          <ViewRow
            key={entry.id}
            entry={entry}
            selected={view === entry.id}
            onView={onView}
          />
        ))}
      </nav>

      <div className="mt-4 flex h-7 items-center pr-2.5 pl-4.5">
        <h2
          id="sidebar-projects"
          className="flex-1 text-[11px] font-semibold text-muted"
        >
          Projects
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Add project"
          title="Add project"
          onClick={onAdd}
          disabled={pending !== null}
        >
          <Plus aria-hidden />
        </Button>
      </div>

      <nav
        aria-labelledby="sidebar-projects"
        className="min-h-0 flex-1 overflow-auto px-2.5"
      >
        <ProjectItems
          projects={projects}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onRemove={onRemove}
          pending={pending}
        />
      </nav>

      {(projects.data?.warning || actionError || reason) && (
        <div className="flex flex-col gap-1 px-4.5 py-2 text-xs break-words">
          {projects.data?.warning && (
            <p className="text-muted">{projects.data.warning}</p>
          )}
          {reason && <p className="text-muted">{reason}</p>}
          {actionError && (
            <p role="alert" className="text-danger">
              {actionError}
            </p>
          )}
        </div>
      )}

      <footer className="flex flex-col gap-px px-2.5 pt-2 pb-2.5">
        <nav aria-label="App" className="flex flex-col gap-px">
          {BOTTOM_VIEWS.map((entry) => (
            <ViewRow
              key={entry.id}
              entry={entry}
              selected={view === entry.id}
              onView={onView}
            />
          ))}
        </nav>
        <SupervisorLine supervisor={supervisor} />
      </footer>
    </aside>
  );
}

function ViewRow({
  entry: { id, label, icon: Icon },
  selected,
  onView,
}: {
  entry: ViewEntry;
  selected: boolean;
  onView: (view: View) => void;
}) {
  return (
    <button
      type="button"
      aria-current={selected ? "page" : undefined}
      onClick={() => onView(id)}
      className={cn(
        "flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] text-ink outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus",
        selected && "bg-paper-3 font-medium hover:bg-paper-3",
      )}
    >
      <Icon
        aria-hidden
        className={cn("size-4 text-muted", selected && "text-accent")}
      />
      {label}
    </button>
  );
}

function ProjectItems({
  projects,
  selectedPath,
  onSelect,
  onRemove,
  pending,
}: {
  projects: CfQuery<ProjectList>;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onRemove: (path: string) => void;
  pending: PendingRun | null;
}) {
  if (projects.status === "error" && projects.error) {
    return (
      <div className="flex flex-col items-start gap-2 px-2 py-3 text-xs">
        <p role="alert" className="break-words text-danger">
          Could not list projects: {describeCfError(projects.error)}
        </p>
        <Button variant="outline" size="sm" onClick={projects.refetch}>
          Try again
        </Button>
      </div>
    );
  }
  if (!projects.data) {
    return (
      <div aria-busy="true" className="flex flex-col gap-1 py-1">
        {projects.showSpinner && (
          <Spinner label="Loading projects" className="px-2 py-1" />
        )}
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-1.5 px-2 py-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>
    );
  }
  if (projects.data.projects.length === 0) {
    return <p className="px-2 py-3 text-xs text-muted">No projects yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-0.5 py-1">
      {projects.data.projects.map((project) => {
        const name = projectName(project.path);
        const selected = project.path === selectedPath;
        const removing =
          pending?.op === "projectRemove" && pending.key === project.path
            ? pending.started
              ? "Removing…"
              : "Waiting for confirmation…"
            : null;
        return (
          <li key={project.path} className="group relative flex items-center">
            <button
              type="button"
              aria-current={selected ? "true" : undefined}
              onClick={() => onSelect(project.path)}
              title={project.path}
              className={cn(
                "flex min-w-0 flex-1 flex-col rounded-md py-1 pr-8 pl-2 text-left outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus",
                selected && "bg-paper-3 hover:bg-paper-3",
              )}
            >
              <span
                className={cn(
                  "flex items-center gap-1.5 text-[13px]",
                  !project.exists && "text-muted",
                )}
              >
                <span className="truncate">{name}</span>
                {!project.exists && <Badge variant="outline">missing</Badge>}
              </span>
              <span className="truncate font-mono text-[0.6875rem] text-muted">
                {project.path}
              </span>
              {removing && (
                <span role="status" className="text-[0.6875rem] text-muted">
                  {removing}
                </span>
              )}
            </button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${name} from the list`}
              title="Remove from the list"
              onClick={() => onRemove(project.path)}
              disabled={pending !== null}
              className="absolute right-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
            >
              <Trash2 aria-hidden />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

function SupervisorLine({
  supervisor,
}: {
  supervisor: CfQuery<SupervisorStatus>;
}) {
  let text: string;
  if (supervisor.status === "ok" && supervisor.data) {
    text = describeSupervisor(supervisor.data);
  } else if (supervisor.status === "error" && supervisor.error) {
    text = `Supervisor: ${describeCfError(supervisor.error)}`;
  } else {
    text = "Supervisor…";
  }
  return (
    <p className="truncate px-2 text-[0.6875rem] text-muted" title={text}>
      {text}
    </p>
  );
}

function describeSupervisor(s: SupervisorStatus): string {
  if (!s.supported || !s.launchd) return "Supervisor: not available here";
  const parts = [
    s.launchd.needsReinstall
      ? "needs reinstall"
      : s.launchd.loaded
        ? "on"
        : "off",
  ];
  const age = s.heartbeat?.ageSeconds;
  parts.push(
    age === null || age === undefined
      ? "no tick yet"
      : `last tick ${formatAge(age)} ago`,
  );
  if (s.paused > 0) parts.push(`${s.paused} paused`);
  if (s.orphaned > 0) parts.push(`${s.orphaned} orphaned`);
  return `Supervisor: ${parts.join(" · ")}`;
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} d`;
}
