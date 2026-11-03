import { RefreshCw } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { CommandLine } from "@/components/CommandLine";
import { Section } from "@/components/ProjectDetail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  configFields,
  configSchema,
  configView,
  describeCfError,
  encodeConfigValue,
  shellQuote,
  unknownConfigKeys,
  valueSource,
  type CfError,
  type ConfigField,
  type ConfigScope,
} from "@/lib/cf";
import { describePending, type PendingRun } from "@/lib/runs";
import { useCfQuery, useDelayed } from "@/lib/use-cf-query";
import { cn } from "@/lib/utils";

export interface ConfigSetArgs {
  scope: ConfigScope;
  project?: string;
  key: string;
  /** Already encoded for `config set`; `"null"` deletes the key. */
  value: string;
}

/** Runs `configSet` through the Dashboard's one pending mutation. Cancel calls neither. */
export type SetConfig = (
  args: ConfigSetArgs,
  onDone: () => void,
  onError: (message: string) => void,
) => void;

/** `PendingRun.key` of a config write: the row it belongs to. */
export function configRunKey(args: ConfigSetArgs): string {
  return `${args.scope}:${args.project ?? ""}:${args.key}`;
}

/** The command line as the native confirm shows it (Rust `config_set`, Debug-quoted). */
export function configCommand(args: ConfigSetArgs): string {
  const dir = args.project
    ? ` --project-dir=${JSON.stringify(args.project)}`
    : "";
  return `cf config set --${args.scope}${dir} -- ${JSON.stringify(args.key)} ${JSON.stringify(args.value)}`;
}

/** Rust refuses writes to these: they decide where Coding Friend writes files. */
const READ_ONLY_KEYS = new Set(["learn.outputDir", "docsDir"]);

function getPath(obj: Record<string, unknown>, key: string): unknown {
  let cur: unknown = obj;
  for (const part of key.split(".")) {
    if (typeof cur !== "object" || cur === null || Array.isArray(cur))
      return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function show(value: unknown): string {
  if (value === undefined) return "not set";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function describeError(e: CfError): string {
  return e.kind === "cliTooOld"
    ? "This cf is too old for the config editor. Update it from the Version view."
    : describeCfError(e);
}

/** Fields by top-level section, top-level leaves first under "General". */
function groupFields(fields: ConfigField[]): [string, ConfigField[]][] {
  const groups = new Map<string, ConfigField[]>([["General", []]]);
  for (const field of fields) {
    const dot = field.key.indexOf(".");
    const name = dot === -1 ? "General" : field.key.slice(0, dot);
    const group = groups.get(name);
    if (group) group.push(field);
    else groups.set(name, [field]);
  }
  return [...groups].filter(([, group]) => group.length > 0);
}

/**
 * The config of one scope: Settings (`global`) or a project's Config tab (`local`, with
 * `project`). Every write goes through `onSet` (Rust confirms it), then the view reloads.
 */
export function ConfigView({
  scope,
  project,
  pending,
  onSet,
}: {
  scope: ConfigScope;
  project?: string;
  pending: PendingRun | null;
  onSet: SetConfig;
}) {
  const view = useCfQuery(`config:${scope}:${project ?? ""}`, () =>
    configView(project),
  );
  const schema = useCfQuery("config-schema", configSchema);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const showRefreshing = useDelayed(view.refreshing);

  const setError = (key: string, message: string | null) =>
    setErrors(({ [key]: _, ...rest }) =>
      message === null ? rest : { ...rest, [key]: message },
    );

  const write = (key: string, value: string) => {
    if (pending) return;
    setError(key, null);
    onSet({ scope, project, key, value }, view.refetch, (message) =>
      setError(key, message),
    );
  };

  const failed = view.error ?? schema.error;
  if (failed) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p role="alert" className="text-sm break-words text-danger">
          Could not load the config: {describeError(failed)}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (view.error) view.refetch();
            if (schema.error) schema.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const data = view.data;
  if (!data || !schema.data) {
    return (
      <div aria-busy="true" className="flex flex-col gap-8">
        <div className="flex items-center gap-3">
          <Skeleton className="h-3 w-64" />
          {(view.showSpinner || schema.showSpinner) && (
            <Spinner label="Loading the config" />
          )}
        </div>
        <Section title="General">
          {[0, 1, 2].map((i) => (
            <li key={i} aria-hidden className={ROW}>
              <div className="flex items-center gap-3">
                <Skeleton className="h-3.5 w-40 flex-1" />
                <Skeleton className="h-5 w-16" />
              </div>
            </li>
          ))}
        </Section>
      </div>
    );
  }

  const fields = configFields(schema.data);
  const unknown = unknownConfigKeys(schema.data, data.effective);
  const rowProps = (key: string) => {
    const runKey = configRunKey({ scope, project, key, value: "" });
    return {
      value: getPath(data.effective, key),
      source: valueSource(key, data, scope),
      scope,
      project,
      disabled: pending !== null,
      status:
        pending?.op === "configSet" && pending.key === runKey
          ? pending.started
            ? "Saving…"
            : "Waiting for confirmation…"
          : null,
      error: errors[key],
    };
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-3">
        <p
          className="min-w-0 flex-1 truncate font-mono text-xs text-muted"
          title={data.paths[scope]}
        >
          {data.paths[scope]}
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Reload the config"
          onClick={view.refetch}
          disabled={view.refreshing}
        >
          <RefreshCw
            aria-hidden
            className={showRefreshing ? "animate-spin" : ""}
          />
        </Button>
      </div>

      {pending && pending.op !== "configSet" && (
        <p className="text-xs text-muted">{describePending(pending)}</p>
      )}

      {groupFields(fields).map(([group, list]) => (
        <Section key={group} title={group} count={list.length}>
          {list.map((field) => {
            const props = rowProps(field.key);
            const label =
              group === "General"
                ? field.key
                : field.key.slice(group.length + 1);
            return READ_ONLY_KEYS.has(field.key) ? (
              <ReadOnlyRow
                key={field.key}
                fieldKey={field.key}
                label={label}
                {...props}
              />
            ) : (
              <FieldRow
                // A reload with a new value starts a fresh draft.
                key={`${field.key}:${JSON.stringify(props.value) ?? ""}`}
                field={field}
                label={label}
                onWrite={write}
                onInvalid={setError}
                {...props}
              />
            );
          })}
        </Section>
      ))}

      {unknown.length > 0 && (
        <Section title="Not in the schema" count={unknown.length}>
          {unknown.map((key) => (
            <ReadOnlyRow
              key={key}
              fieldKey={key}
              label={key}
              {...rowProps(key)}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

const ROW = "flex min-h-12 flex-col justify-center gap-1.5 px-3 py-2";

const CONTROL =
  "rounded-md border border-rule bg-paper px-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50";

interface RowProps {
  label: string;
  value: unknown;
  source: ConfigScope | "default";
  scope: ConfigScope;
  project?: string;
  disabled: boolean;
  status: string | null;
  error?: string;
}

function RowHead({
  label,
  source,
  children,
}: {
  label: string;
  source: RowProps["source"];
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <p className="min-w-0 flex-1 font-mono text-sm break-all">{label}</p>
      <Badge variant={source === "default" ? "outline" : "default"}>
        {source}
      </Badge>
      {children}
    </div>
  );
}

function RowFoot({ status, error }: { status: string | null; error?: string }) {
  return (
    <>
      {status && (
        <p role="status" className="text-xs text-muted">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs break-words text-danger">
          {error}
        </p>
      )}
    </>
  );
}

function ReadOnlyRow({
  fieldKey,
  label,
  value,
  source,
  scope,
  project,
}: RowProps & { fieldKey: string }) {
  return (
    <li className={ROW}>
      <RowHead label={label} source={source}>
        <Badge variant="outline">read-only</Badge>
      </RowHead>
      <p className="font-mono text-xs break-all text-ink-2">{show(value)}</p>
      {fieldKey === "learn.outputDir" ? (
        <p className="text-xs text-muted">
          Changed from the learn storage card in the Learn view (coming soon).
        </p>
      ) : fieldKey === "docsDir" ? (
        <>
          <p className="text-xs text-muted">
            Decides where memory and docs live. Change it in a terminal:
          </p>
          <CommandLine
            command={
              scope === "local" && project
                ? `cf config set --local --project-dir=${shellQuote(project)} -- docsDir <dir>`
                : "cf config set --global -- docsDir <dir>"
            }
          />
        </>
      ) : null}
    </li>
  );
}

function FieldRow({
  field,
  label,
  value,
  source,
  scope,
  disabled,
  status,
  error,
  onWrite,
  onInvalid,
}: RowProps & {
  field: ConfigField;
  onWrite: (key: string, value: string) => void;
  onInvalid: (key: string, message: string | null) => void;
}) {
  const initial =
    value === undefined
      ? ""
      : field.kind === "json"
        ? JSON.stringify(value, null, 2)
        : typeof value === "string"
          ? value
          : JSON.stringify(value);
  const [draft, setDraft] = useState(initial);
  const dirty = draft !== initial;

  const send = (text: string) => {
    let encoded: string;
    try {
      encoded = encodeConfigValue(field, text);
    } catch (e) {
      onInvalid(field.key, e instanceof Error ? e.message : String(e));
      return;
    }
    onWrite(field.key, encoded);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (dirty && !disabled) send(draft);
  };

  // Reset deletes the key from this scope's file; only offered where it is set.
  const reset =
    source === scope ? (
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={() => onWrite(field.key, "null")}
        title={`Remove ${field.key} from the ${scope} config`}
      >
        Reset
      </Button>
    ) : null;

  if (field.kind === "boolean") {
    // Unset is its own state: some keys (privacyBlock, scoutBlock…) default to on in code
    // the app cannot see, so it never shows an unset key as off.
    return (
      <li className={ROW}>
        <RowHead label={label} source={source}>
          {reset}
          {typeof value !== "boolean" && (
            <span className="text-xs text-muted">{show(value)}</span>
          )}
          <div
            role="radiogroup"
            aria-label={field.key}
            className="flex shrink-0 overflow-hidden rounded-md border border-rule"
          >
            {[true, false].map((option) => (
              <button
                key={String(option)}
                type="button"
                role="radio"
                aria-checked={value === option}
                disabled={disabled}
                onClick={() => value !== option && send(String(option))}
                className={cn(
                  "h-7 px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset disabled:opacity-50",
                  value === option
                    ? "bg-accent text-accent-ink"
                    : "bg-paper text-ink-2",
                )}
              >
                {option ? "On" : "Off"}
              </button>
            ))}
          </div>
        </RowHead>
        <RowFoot status={status} error={error} />
      </li>
    );
  }

  if (field.kind === "select") {
    const current = JSON.stringify(value);
    const known = field.options.some((o) => JSON.stringify(o) === current);
    return (
      <li className={ROW}>
        <RowHead label={label} source={source}>
          {reset}
          <select
            aria-label={field.key}
            value={known ? current : ""}
            disabled={disabled}
            onChange={(e) => send(e.target.value)}
            className={cn(CONTROL, "h-7")}
          >
            {!known && (
              <option value="" disabled>
                {show(value)}
              </option>
            )}
            {field.options.map((option) => (
              <option
                key={JSON.stringify(option)}
                value={JSON.stringify(option)}
              >
                {show(option)}
              </option>
            ))}
          </select>
        </RowHead>
        <RowFoot status={status} error={error} />
      </li>
    );
  }

  const save = dirty && (
    <Button type="submit" variant="outline" size="sm" disabled={disabled}>
      Save
    </Button>
  );

  return (
    <li className={ROW}>
      <RowHead label={label} source={source}>
        {reset}
      </RowHead>
      <form onSubmit={submit} className="flex items-start gap-2">
        {field.kind === "json" ? (
          <textarea
            aria-label={field.key}
            value={draft}
            placeholder="JSON"
            spellCheck={false}
            rows={Math.min(8, Math.max(2, draft.split("\n").length))}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            className={cn(CONTROL, "min-w-0 flex-1 py-1.5 font-mono text-xs")}
          />
        ) : (
          <input
            aria-label={field.key}
            type={field.kind === "number" ? "number" : "text"}
            inputMode={field.kind === "number" ? "numeric" : undefined}
            step={field.kind === "number" && field.integer ? 1 : undefined}
            min={field.kind === "number" ? field.min : undefined}
            value={draft}
            placeholder="not set"
            spellCheck={false}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            className={cn(CONTROL, "h-7 min-w-0 flex-1")}
          />
        )}
        {save}
      </form>
      <RowFoot status={status} error={error} />
    </li>
  );
}
