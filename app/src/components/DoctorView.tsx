import { LoaderCircle, RefreshCw, Wrench } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { describeResolvedCf } from "@/components/CliGate";
import { CommandLine } from "@/components/CommandLine";
import { Section } from "@/components/ProjectDetail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  cfDoctor,
  describeCfError,
  isCopyableCommand,
  isRunnableFix,
  toCfError,
  type CliStatus,
  type DoctorCheck,
  type DoctorData,
  type DoctorStatus,
} from "@/lib/cf";
import { describePending, type PendingRun } from "@/lib/runs";
import { useDelayed } from "@/lib/use-cf-query";

const STATUS_VARIANT: Record<DoctorStatus, "success" | "default" | "danger"> = {
  ok: "success",
  warn: "default",
  fail: "danger",
};

/** `cf <argv>` as the native confirm shows it (Rust `command_line`, no `--json`). */
export function fixCommand(argv: string[]): string {
  return `cf ${argv.filter((word) => word !== "--json").join(" ")}`;
}

/** Checks by group, groups in the order they first appear. */
function groupChecks(checks: DoctorCheck[]): [string, DoctorCheck[]][] {
  const groups = new Map<string, DoctorCheck[]>();
  for (const check of checks) {
    const group = groups.get(check.group);
    if (group) group.push(check);
    else groups.set(check.group, [check]);
  }
  return [...groups];
}

export interface DoctorState {
  data: DoctorData | null;
  running: boolean;
  runError: string | null;
  /** Fix errors by check id, until fresh doctor data arrives. */
  fixErrors: Record<string, string>;
  run: () => void;
  /** `null` clears the check's error. */
  setFixError: (id: string, error: string | null) => void;
}

/**
 * Doctor data, starting from the gate's run. Held by the Dashboard, so a run or fix that
 * finishes while another view is open still lands here.
 */
export function useDoctor(initial: DoctorData | null): DoctorState {
  const [data, setData] = useState<DoctorData | null>(initial);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [fixErrors, setFixErrors] = useState<Record<string, string>>({});
  // Only the newest doctor request may set the data.
  const request = useRef(0);

  const run = useCallback(() => {
    const id = ++request.current;
    setRunning(true);
    setRunError(null);
    cfDoctor()
      .then(
        (fresh) => {
          if (id !== request.current) return;
          setData(fresh);
          setFixErrors({});
        },
        (e: unknown) => {
          if (id === request.current)
            setRunError(describeCfError(toCfError(e)));
        },
      )
      .finally(() => {
        if (id === request.current) setRunning(false);
      });
  }, []);

  const setFixError = useCallback((id: string, error: string | null) => {
    setFixErrors(({ [id]: _, ...rest }) =>
      error === null ? rest : { ...rest, [id]: error },
    );
  }, []);

  return { data, running, runError, fixErrors, run, setFixError };
}

/** Shows the doctor data at once; "Run again" and fixes refresh it. */
export function DoctorView({
  cli,
  doctor,
  pending,
  onFix,
}: {
  cli: CliStatus;
  doctor: DoctorState;
  pending: PendingRun | null;
  onFix: (check: DoctorCheck, argv: string[]) => void;
}) {
  const { data, running, runError, fixErrors, run } = doctor;
  const showRunSpinner = useDelayed(running);

  // No gate data (and no run yet): run once the view opens.
  useEffect(() => {
    if (data === null && !running && runError === null) run();
    // Only on mount: a failed run waits for "Run again".
  }, []);

  const busy = running || pending !== null;

  return (
    <article
      aria-labelledby="doctor-title"
      aria-busy={running}
      className="mx-auto flex max-w-3xl flex-col gap-8 px-8 py-7"
    >
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2
            id="doctor-title"
            className="text-lg font-semibold tracking-tight"
          >
            Doctor
          </h2>
          {cli.cf && (
            <p
              className="truncate font-mono text-xs text-muted"
              title={cli.cf.path}
            >
              {describeResolvedCf(cli.cf)}
            </p>
          )}
          {data && (
            <p className="font-mono text-xs text-muted">
              CLI {data.cli.version} · node {data.cli.node}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={run} disabled={busy}>
          <RefreshCw
            aria-hidden
            className={showRunSpinner ? "animate-spin" : ""}
          />
          {showRunSpinner ? "Running…" : "Run again"}
        </Button>
      </header>

      {pending && pending.op !== "fix" && (
        <p className="text-xs text-muted">{describePending(pending)}</p>
      )}

      {runError && (
        <p role="alert" className="text-sm break-words text-danger">
          Could not run cf doctor: {runError}
        </p>
      )}

      {data ? (
        <DoctorChecks
          checks={data.checks}
          pending={pending}
          disabled={busy}
          fixErrors={fixErrors}
          onFix={onFix}
        />
      ) : (
        !runError && <ChecksSkeleton />
      )}
    </article>
  );
}

/**
 * The ok/warn/fail counts, then the checks by group. Without `onFix` nothing runs from here:
 * a fix shows as a manual command, like a hint.
 */
export function DoctorChecks({
  checks,
  pending = null,
  disabled = false,
  fixErrors = {},
  onFix,
}: {
  checks: DoctorCheck[];
  pending?: PendingRun | null;
  disabled?: boolean;
  fixErrors?: Record<string, string>;
  onFix?: (check: DoctorCheck, argv: string[]) => void;
}) {
  const counts = { ok: 0, warn: 0, fail: 0 };
  for (const check of checks) counts[check.status]++;

  return (
    <>
      <p className="text-sm text-ink-2">
        {counts.ok} ok · {counts.warn} warn · {counts.fail} fail
      </p>
      {groupChecks(checks).map(([group, list]) => (
        <Section key={group} title={group} count={list.length}>
          {list.map((check) => (
            <CheckRow
              key={check.id}
              check={check}
              fixing={
                pending?.op === "fix" && pending.key === check.id
                  ? pending.started
                    ? "running"
                    : "confirming"
                  : null
              }
              disabled={disabled}
              error={fixErrors[check.id]}
              onFix={onFix}
            />
          ))}
        </Section>
      ))}
    </>
  );
}

/** Placeholder rows in the shape of a check list. */
export function ChecksSkeleton() {
  return (
    <Section title="Checks">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          aria-hidden
          className="flex min-h-14 flex-col justify-center gap-1.5 px-3 py-2"
        >
          <Skeleton className="h-3.5 w-48" />
          <Skeleton className="h-3 w-full max-w-md" />
        </li>
      ))}
    </Section>
  );
}

function CheckRow({
  check,
  fixing,
  disabled,
  error,
  onFix,
}: {
  check: DoctorCheck;
  fixing: "confirming" | "running" | null;
  disabled: boolean;
  error?: string;
  /** Absent: no fix button, the fix shows as a manual command. */
  onFix?: (check: DoctorCheck, argv: string[]) => void;
}) {
  const { fix } = check;
  return (
    <li className="flex flex-col gap-2 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <Badge variant={STATUS_VARIANT[check.status]} className="mt-px">
          {check.status}
        </Badge>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-sm break-words">{check.label}</p>
          {check.detail && (
            <p className="text-xs break-words text-muted">{check.detail}</p>
          )}
        </div>
      </div>
      {fix && onFix && isRunnableFix(fix.argv) ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onFix(check, fix.argv)}
          >
            {fixing === "running" ? (
              <LoaderCircle aria-hidden className="animate-spin" />
            ) : (
              <Wrench aria-hidden />
            )}
            {fix.label}
          </Button>
          {fixing === "confirming" ? (
            <span className="text-xs text-muted">
              Waiting for confirmation…
            </span>
          ) : (
            <code className="min-w-0 font-mono text-xs break-all text-muted">
              {fixCommand(fix.argv)}
            </code>
          )}
        </div>
      ) : fix ? (
        // Not a fix Rust would run (e.g. from a newer CLI), or no fixes here: show the command only.
        <ManualCommand command={fixCommand(fix.argv)} />
      ) : (
        check.hint && <ManualCommand command={check.hint} />
      )}
      {error && (
        <p role="alert" className="text-xs break-words text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

/** CLI text: only a plain cf or npm command gets the `$` and copy. */
function ManualCommand({ command }: { command: string }) {
  return isCopyableCommand(command) ? (
    <CommandLine command={command} />
  ) : (
    <p className="text-xs break-words text-muted">{command}</p>
  );
}
