import { FolderOpen, RefreshCw, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";

import { CommandLine } from "@/components/CommandLine";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  INSTALL_COMMAND,
  UPDATE_COMMAND,
  checkCli,
  chooseCfPath,
  clearCfPath,
  describeCfError,
  getCfInfo,
  isCancelled,
  stderrTailOf,
  toCfError,
  type CfError,
  type CfSource,
  type CliStatus,
  type GateState,
  type LoginPathSource,
  type ResolvedCf,
} from "@/lib/cf";
import { useCfQuery } from "@/lib/use-cf-query";

const SOURCE_LABEL: Record<CfSource, string> = {
  env: "from CF_APP_CF_BIN",
  settings: "chosen in the app",
  path: "from the login-shell PATH",
};

export function describeResolvedCf(cf: ResolvedCf): string {
  return `${cf.path} (${SOURCE_LABEL[cf.source]})`;
}

/** Probes the CLI on start; renders `children` only when it passed the gate. */
export function CliGate({
  children,
}: {
  children: (cli: CliStatus) => ReactNode;
}) {
  const cli = useCfQuery("cli", checkCli);

  if (cli.status === "idle" || cli.status === "loading") {
    return (
      <div
        aria-busy="true"
        className="grid h-screen place-items-center bg-canvas"
      >
        <DragStrip />
        {cli.showSpinner && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner label="Checking the Coding Friend CLI" />
            <span aria-hidden>Checking the Coding Friend CLI…</span>
          </p>
        )}
      </div>
    );
  }
  if (cli.data?.state === "ok") return children(cli.data);

  // A rejected `check_cli` (e.g. no Tauri bridge) is an `error` gate as well.
  const error: CfError | null = cli.data?.error ?? cli.error ?? null;
  return (
    <GateScreen
      state={cli.data?.state ?? "error"}
      cf={cli.data?.cf ?? null}
      version={cli.data?.version ?? null}
      error={error}
      checking={cli.refreshing}
      onRecheck={cli.refetch}
    />
  );
}

/**
 * The window has an overlay titlebar, so the gate (no sidebar) needs its own drag strip.
 * Kept off `main` itself: a drag region blocks text selection in the commands below.
 */
function DragStrip() {
  return (
    <div
      aria-hidden
      data-tauri-drag-region
      className="fixed inset-x-0 top-0 z-10 h-13 bg-canvas"
    />
  );
}

function GateScreen({
  state,
  cf,
  version,
  error,
  checking,
  onRecheck,
}: {
  state: GateState;
  cf: ResolvedCf | null;
  version: string | null;
  error: CfError | null;
  checking: boolean;
  onRecheck: () => void;
}) {
  const info = useCfQuery("cf-info", getCfInfo);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const resolved = cf ?? info.data?.cf ?? null;
  const loginPathSource =
    error?.kind === "nodeNotFound"
      ? error.loginPathSource
      : info.data?.loginPathSource;
  const copy = gateCopy(state, error, loginPathSource);
  const stderrTail = error ? stderrTailOf(error) : null;

  const recheck = () => {
    onRecheck();
    info.refetch();
  };

  const act = (action: () => Promise<unknown>) => {
    setActionError(null);
    setBusy(true);
    action()
      .then(recheck, (e: unknown) => {
        if (!isCancelled(e)) setActionError(describeCfError(toCfError(e)));
      })
      .finally(() => setBusy(false));
  };

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-8 pt-13 pb-8">
      <DragStrip />
      <section
        aria-labelledby="gate-title"
        className="flex w-full max-w-lg flex-col gap-5"
      >
        <header className="flex flex-col gap-2">
          <TriangleAlert aria-hidden className="size-5 text-muted" />
          <h1 id="gate-title" className="text-lg font-semibold tracking-tight">
            {copy.title}
          </h1>
          <p className="text-sm leading-relaxed text-ink-2">{copy.body}</p>
          {error && (
            <p className="text-sm break-words text-muted">
              {describeCfError(error)}
            </p>
          )}
        </header>

        {copy.command && <CommandLine command={copy.command} />}

        {actionError && (
          <p role="alert" className="text-sm break-words text-danger">
            {actionError}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={recheck} disabled={checking || busy}>
            <RefreshCw aria-hidden className={checking ? "animate-spin" : ""} />
            {checking ? "Checking…" : "Check again"}
          </Button>
          <Button
            variant="outline"
            onClick={() => act(chooseCfPath)}
            disabled={checking || busy}
          >
            <FolderOpen aria-hidden />
            Choose CLI folder…
          </Button>
          {usesSettingsPath(resolved, error) && (
            <Button
              variant="ghost"
              onClick={() => act(clearCfPath)}
              disabled={checking || busy}
            >
              Use the CLI on PATH
            </Button>
          )}
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-rule pt-4 text-xs">
          <dt className="text-muted">cf</dt>
          <dd className="min-w-0 font-mono break-all text-ink-2">
            {resolved ? describeResolvedCf(resolved) : "not resolved"}
          </dd>
          {version && (
            <>
              <dt className="text-muted">version</dt>
              <dd className="font-mono text-ink-2">{version}</dd>
            </>
          )}
          {info.data && (
            <>
              <dt className="text-muted">PATH</dt>
              <dd className="min-w-0 font-mono break-all text-ink-2">
                {info.data.loginPathSource === "login-shell"
                  ? "from the login shell"
                  : "fallback (the login shell did not answer)"}
              </dd>
            </>
          )}
        </dl>

        {(stderrTail || info.data) && (
          <details className="text-xs text-muted">
            <summary className="cursor-default rounded select-none hover:text-ink focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none">
              Details
            </summary>
            {info.data && (
              <>
                <p className="mt-3 mb-1">Login PATH</p>
                <pre className="overflow-auto rounded-lg border border-rule bg-paper-2 p-3 font-mono whitespace-pre-wrap text-ink-2">
                  {info.data.loginPath}
                </pre>
              </>
            )}
            {stderrTail && (
              <>
                <p className="mt-3 mb-1">stderr (last lines)</p>
                <pre className="max-h-64 overflow-auto rounded-lg border border-rule bg-paper-2 p-3 font-mono whitespace-pre-wrap text-ink-2">
                  {stderrTail}
                </pre>
              </>
            )}
          </details>
        )}
      </section>
    </main>
  );
}

function gateCopy(
  state: GateState,
  error: CfError | null,
  loginPathSource: LoginPathSource | undefined,
): { title: string; body: string; command?: string } {
  switch (state) {
    case "notFound":
      return {
        title: "Coding Friend CLI not found",
        body: "The app works through the cf command from the coding-friend-cli npm package. Install it in a terminal, then check again.",
        command: INSTALL_COMMAND,
      };
    case "tooOld":
      return {
        title: "Coding Friend CLI is too old",
        body: "This cf has no cf doctor, which the app needs. Update it in a terminal, then check again.",
        command: UPDATE_COMMAND,
      };
    case "incompatible":
      return {
        title: "Coding Friend CLI does not match this app",
        body: "Update the CLI in a terminal, then check again. If the CLI is already the latest, update the app instead.",
        command: UPDATE_COMMAND,
      };
    case "nodeNotFound":
      return {
        title: "Node.js not found",
        body: `cf is a Node.js program, but node is not on ${
          loginPathSource === "fallback"
            ? "the fallback PATH (the app could not read your login shell's PATH)"
            : "your login shell's PATH"
        }. Install Node.js, or add it to the PATH your login shell sets (for example in ~/.zprofile), then check again.`,
      };
    case "ok":
    case "error":
      return {
        title:
          error?.kind === "refused"
            ? "This CLI path was refused"
            : "Coding Friend CLI did not answer",
        body: "The app could not use cf. Fix the problem below, then check again.",
      };
  }
}

/**
 * A bad `cfBinPath` leaves no resolved `cf`, so its source is read from the error: a
 * refused settings path names settings.json, a missing configured path is absolute
 * (`CF_APP_CF_BIN` too; clearing settings is then harmless).
 */
function usesSettingsPath(cf: ResolvedCf | null, error: CfError | null) {
  if (cf) return cf.source === "settings";
  if (error?.kind === "refused")
    return error.message.startsWith("settings.json cfBinPath");
  return error?.kind === "cliNotFound" && error.path.startsWith("/");
}
