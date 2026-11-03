import {
  FolderKanban,
  Info,
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

export type View = "projects" | "doctor" | "version" | "settings";

const VIEWS: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "doctor", label: "Doctor", icon: Stethoscope },
  { id: "version", label: "Version", icon: Info },
  { id: "settings", label: "Settings", icon: Settings },
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
    <aside className="flex w-64 shrink-0 flex-col border-r border-rule bg-paper-2">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <h1 className="flex-1 text-sm font-semibold tracking-tight">
          Coding Friend
        </h1>
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

      <nav aria-label="Projects" className="min-h-0 flex-1 overflow-auto px-2">
        <ProjectItems
          projects={projects}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onRemove={onRemove}
          pending={pending}
        />
      </nav>

      {(projects.data?.warning || actionError || reason) && (
        <div className="flex flex-col gap-1 px-4 py-2 text-xs break-words">
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

      <footer className="flex flex-col gap-2 border-t border-rule p-2">
        <SupervisorLine supervisor={supervisor} />
        <nav aria-label="Views" className="grid grid-cols-2 gap-1">
          {VIEWS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={view === id ? "page" : undefined}
              onClick={() => onView(id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-focus",
                view === id && "bg-paper-3 font-medium text-ink",
              )}
            >
              <Icon aria-hidden className="size-3.5" />
              {label}
            </button>
          ))}
        </nav>
      </footer>
    </aside>
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
                "flex min-w-0 flex-1 flex-col rounded-md py-1.5 pr-9 pl-2 text-left outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus",
                selected && "bg-paper-3 hover:bg-paper-3",
              )}
            >
              <span
                className={cn(
                  "flex items-center gap-1.5 text-sm",
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
