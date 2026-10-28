import { FolderPlus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { DoctorView, fixCommand, useDoctor } from "@/components/DoctorView";
import { ProjectDetail, loadProjectActivity } from "@/components/ProjectDetail";
import { Sidebar, type View } from "@/components/Sidebar";
import { VersionView, type UpdateOutcome } from "@/components/VersionView";
import { Button } from "@/components/ui/button";
import {
  addProject,
  cfVersion,
  describeCfError,
  isCancelled,
  onRunStarted,
  projectList,
  projectRemove,
  runFix,
  supervisorStatus,
  toCfError,
  updateCheck,
  updateYes,
  type CliStatus,
  type DoctorCheck,
} from "@/lib/cf";
import type { PendingRun } from "@/lib/runs";
import { useCfQuery } from "@/lib/use-cf-query";

/**
 * The app once the CLI passed the gate. `cli` feeds the Doctor/Version views. Mutations
 * and their results live here, so a view switch never loses a run.
 */
export function Dashboard({ cli }: { cli: CliStatus }) {
  const [view, setView] = useState<View>("projects");
  const [chosen, setChosen] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingRun | null>(null);
  const [updateOutcome, setUpdateOutcome] = useState<UpdateOutcome | null>(
    null,
  );
  // The version queries load on the first visit of the Version view, then stay.
  const [versionSeen, setVersionSeen] = useState(false);

  const projects = useCfQuery("projects", projectList);
  const supervisor = useCfQuery("supervisor", supervisorStatus);
  const version = useCfQuery(versionSeen ? "version" : null, cfVersion);
  const check = useCfQuery(versionSeen ? "update-check" : null, updateCheck);
  const doctor = useDoctor(cli.doctor);

  // A removed or never-chosen project falls back to the first one.
  const list = projects.data?.projects ?? [];
  const selected = list.find((p) => p.path === chosen) ?? list[0];
  const selectedPath = selected?.path ?? null;

  const detail = useCfQuery(
    view === "projects" && selectedPath !== null
      ? `activity:${selectedPath}`
      : null,
    () => loadProjectActivity(selectedPath ?? ""),
  );

  // Refresh on window focus; the refetch functions change with their keys.
  const refreshAll = useRef(() => {});
  useEffect(() => {
    refreshAll.current = () => {
      projects.refetch();
      supervisor.refetch();
      detail.refetch();
    };
  });
  useEffect(() => {
    const onFocus = () => refreshAll.current();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Rust emits `cf-run-started` when the user pressed OK; only one run is ever pending.
  useEffect(
    () =>
      onRunStarted(({ op, command }) => {
        setPending((p) =>
          p && !p.started && p.op === op ? { ...p, command, started: true } : p,
        );
      }),
    [],
  );

  const show = (next: View) => {
    setView(next);
    if (next === "version") setVersionSeen(true);
  };

  const select = (path: string) => {
    show("projects");
    if (path === selectedPath && view === "projects") detail.refetch();
    else setChosen(path);
  };

  /**
   * Runs one mutating command at a time (Rust shows its confirm or picker first). Cancel
   * rejects with `cancelled`, which shows nothing.
   */
  const start = <T,>(
    run: Omit<PendingRun, "started">,
    action: () => Promise<T>,
    onDone: (result: T) => void,
    onError: (message: string) => void,
  ) => {
    if (pending) return;
    setPending({ ...run, started: false });
    action().then(
      (result) => {
        setPending(null);
        onDone(result);
      },
      (e: unknown) => {
        setPending(null);
        if (!isCancelled(e)) onError(describeCfError(toCfError(e)));
      },
    );
  };

  const add = () => {
    if (pending) return;
    setActionError(null);
    start(
      { op: "projectAdd", key: null, command: "cf project add" },
      addProject,
      ({ project }) => {
        show("projects");
        setChosen(project.path);
        projects.refetch();
      },
      setActionError,
    );
  };

  const remove = (path: string) => {
    if (pending) return;
    setActionError(null);
    start(
      {
        op: "projectRemove",
        key: path,
        command: `cf project remove -- ${JSON.stringify(path)}`,
      },
      () => projectRemove(path),
      () => projects.refetch(),
      setActionError,
    );
  };

  const fix = (target: DoctorCheck, argv: string[]) => {
    if (pending) return;
    doctor.setFixError(target.id, null);
    start(
      { op: "fix", key: target.id, command: fixCommand(argv) },
      () => runFix(argv),
      () => doctor.run(),
      (message) => doctor.setFixError(target.id, message),
    );
  };

  const update = () => {
    if (pending) return;
    setUpdateOutcome(null);
    // A failed run may still have changed something: refresh either way.
    const refresh = () => {
      version.refetch();
      check.refetch();
      doctor.run();
    };
    start(
      { op: "update", key: null, command: "cf update --yes" },
      updateYes,
      (result) => {
        setUpdateOutcome({ result });
        refresh();
      },
      (error) => {
        setUpdateOutcome({ error });
        refresh();
      },
    );
  };

  return (
    <div className="flex h-screen bg-paper text-ink">
      <Sidebar
        view={view}
        onView={show}
        projects={projects}
        selectedPath={view === "projects" ? selectedPath : null}
        onSelect={select}
        onAdd={add}
        onRemove={remove}
        actionError={actionError}
        pending={pending}
        supervisor={supervisor}
      />
      <main className="min-w-0 flex-1 overflow-auto">
        {view === "projects" ? (
          selected ? (
            <ProjectDetail project={selected} activity={detail} />
          ) : projects.status === "ok" ? (
            <NoProjects onAdd={add} disabled={pending !== null} />
          ) : null
        ) : view === "doctor" ? (
          <DoctorView cli={cli} doctor={doctor} pending={pending} onFix={fix} />
        ) : (
          <VersionView
            cli={cli}
            version={version}
            check={check}
            pending={pending}
            outcome={updateOutcome}
            onUpdate={update}
          />
        )}
      </main>
    </div>
  );
}

function NoProjects({
  onAdd,
  disabled,
}: {
  onAdd: () => void;
  disabled: boolean;
}) {
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <FolderPlus aria-hidden className="size-6 text-muted" />
        <h2 className="text-base font-semibold">No projects yet</h2>
        <p className="text-sm text-muted">
          A project shows up here once Coding Friend runs in it. You can also
          add a folder yourself.
        </p>
        <Button onClick={onAdd} disabled={disabled}>
          <Plus aria-hidden />
          Add project…
        </Button>
      </div>
    </div>
  );
}
