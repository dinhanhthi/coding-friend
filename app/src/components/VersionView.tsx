import { getVersion } from "@tauri-apps/api/app";
import { Download, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

import { describeResolvedCf } from "@/components/CliGate";
import { Section } from "@/components/ProjectDetail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  describeCfError,
  type CliStatus,
  type UpdateCheck,
  type UpdateResult,
  type VersionInfo,
} from "@/lib/cf";
import { describePending, type PendingRun } from "@/lib/runs";
import { useCfQuery, useDelayed, type CfQuery } from "@/lib/use-cf-query";

/** How the last `cf update` ended; kept by the Dashboard across view switches. */
export type UpdateOutcome = { result: UpdateResult } | { error: string };

function hasUpdate(check: UpdateCheck): boolean {
  return (
    check.cli.updateAvailable === true ||
    check.hosts.some((h) => h.updateAvailable === true)
  );
}

/** Installed versions, the update check, and `cf update` behind a native confirm. */
export function VersionView({
  cli,
  version,
  check,
  pending,
  outcome,
  onUpdate,
}: {
  cli: CliStatus;
  version: CfQuery<VersionInfo>;
  check: CfQuery<UpdateCheck>;
  pending: PendingRun | null;
  outcome: UpdateOutcome | null;
  onUpdate: () => void;
}) {
  const app = useCfQuery("app-version", getVersion);
  const showCheckRefreshing = useDelayed(check.refreshing);
  // "confirming": the native confirm is up; "updating": the user pressed OK, cf runs.
  const phase =
    pending?.op === "update"
      ? pending.started
        ? "updating"
        : "confirming"
      : "idle";
  const result = outcome && "result" in outcome ? outcome.result : null;
  const updateError = outcome && "error" in outcome ? outcome.error : null;

  const available = check.data ? hasUpdate(check.data) : false;
  const latestKnown =
    check.data?.cli.latest != null && check.data.plugin.latest != null;
  const checked = check.status === "ok" && !check.refreshing;

  return (
    <article
      aria-labelledby="version-title"
      className="mx-auto flex max-w-3xl flex-col gap-8 px-8 py-7"
    >
      <header className="min-w-0">
        <h2 id="version-title" className="text-lg font-semibold tracking-tight">
          Version
        </h2>
        {cli.cf && (
          <p
            className="truncate font-mono text-xs text-muted"
            title={cli.cf.path}
          >
            {describeResolvedCf(cli.cf)}
          </p>
        )}
      </header>

      <Section title="Installed">
        <Row label="App">
          <Value query={app}>{(v) => v}</Value>
        </Row>
        <Row label="CLI">
          <Value query={version}>{(v) => v.cli}</Value>
        </Row>
        {version.status === "error" ? null : version.data ? (
          Object.entries(version.data.hosts).map(([host, h]) => (
            <Row key={host} label={host}>
              {h.installed ? (
                (h.version ?? "installed, version unknown")
              ) : (
                <span className="text-muted">not installed</span>
              )}
            </Row>
          ))
        ) : (
          <Row label="Hosts">
            <Skeleton className="h-3.5 w-24" />
          </Row>
        )}
      </Section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h3 className="flex-1 text-xs font-medium tracking-wide text-muted uppercase">
            Updates
          </h3>
          {(check.showSpinner || showCheckRefreshing) && (
            <Spinner label="Checking for updates" />
          )}
        </div>
        <UpdateRows check={check} />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={onUpdate}
            disabled={pending !== null || !checked || !available}
          >
            {phase === "updating" ? (
              <LoaderCircle aria-hidden className="animate-spin" />
            ) : (
              <Download aria-hidden />
            )}
            {phase === "updating"
              ? "Updating…"
              : phase === "confirming"
                ? "Waiting for confirmation…"
                : checked && !available && latestKnown
                  ? "Up to date"
                  : "Update"}
          </Button>
          {phase === "updating" && (
            <p className="text-sm text-muted">
              Updating… this can take a few minutes.
            </p>
          )}
          {pending && pending.op !== "update" && (
            <p className="text-xs text-muted">{describePending(pending)}</p>
          )}
        </div>

        {updateError && (
          <p role="alert" className="text-sm break-words text-danger">
            cf update failed: {updateError}
          </p>
        )}
        {result && (
          <div className="flex flex-col gap-1 text-sm">
            <p className="text-ink-2">
              {result.performed.length > 0
                ? `Updated: ${result.performed.join(", ")}.`
                : "Nothing was updated."}
            </p>
            {hasUpdate(result.after) && (
              <p className="text-xs text-muted">
                cf update finished, but an update is still available: a step may
                have failed. The check above is the current state.
              </p>
            )}
          </div>
        )}
      </section>
    </article>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li className="flex min-h-10 items-center gap-4 px-3 py-2 text-sm">
      <span className="w-24 shrink-0 text-muted">{label}</span>
      <span className="min-w-0 flex-1 font-mono break-all">{children}</span>
    </li>
  );
}

/** A query's value, a skeleton while it loads, or its error. */
function Value<T>({
  query,
  children,
}: {
  query: CfQuery<T>;
  children: (data: T) => ReactNode;
}) {
  if (query.status === "error" && query.error) {
    return (
      <span className="font-sans text-danger">
        {describeCfError(query.error)}
      </span>
    );
  }
  if (query.data === undefined) return <Skeleton className="h-3.5 w-16" />;
  return children(query.data);
}

function UpdateBadge({ available }: { available: boolean | null }) {
  if (available === null) return <Badge variant="outline">unknown</Badge>;
  return available ? (
    <Badge>update available</Badge>
  ) : (
    <Badge variant="outline">up to date</Badge>
  );
}

function UpdateRows({ check }: { check: CfQuery<UpdateCheck> }) {
  if (check.status === "error" && check.error) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p role="alert" className="text-sm break-words text-danger">
          Could not check for updates: {describeCfError(check.error)}
        </p>
        <Button variant="outline" size="sm" onClick={check.refetch}>
          Try again
        </Button>
      </div>
    );
  }
  const data = check.data;
  if (!data) {
    return (
      <ul
        aria-busy="true"
        className="flex flex-col divide-y divide-rule rounded-lg border border-rule"
      >
        {[0, 1, 2].map((i) => (
          <li key={i} aria-hidden className="flex min-h-10 items-center px-3">
            <Skeleton className="h-3.5 w-full max-w-sm" />
          </li>
        ))}
      </ul>
    );
  }

  const latestPlugin = data.plugin.latest ?? "unknown";
  return (
    <>
      <ul className="flex flex-col divide-y divide-rule rounded-lg border border-rule">
        <Row label="CLI">
          <span className="flex flex-wrap items-center gap-2">
            {data.cli.current} → {data.cli.latest ?? "unknown"}
            <UpdateBadge available={data.cli.updateAvailable} />
          </span>
        </Row>
        {data.hosts.map((h) => (
          <Row key={h.host} label={h.host}>
            {h.installed ? (
              <span className="flex flex-wrap items-center gap-2">
                {h.current ?? "unknown"} → {latestPlugin}
                <UpdateBadge available={h.updateAvailable} />
              </span>
            ) : (
              <span className="text-muted">not installed</span>
            )}
          </Row>
        ))}
        {data.statusline.current && (
          <Row label="Statusline">{data.statusline.current}</Row>
        )}
      </ul>
      {data.cli.linked && (
        <p className="text-xs text-muted">
          cf is npm-linked to a local repo: cf update skips the CLI.
        </p>
      )}
      {(data.cli.latest === null || data.plugin.latest === null) && (
        <p className="text-xs text-muted">
          The latest version could not be read, so some updates are unknown.
        </p>
      )}
    </>
  );
}
