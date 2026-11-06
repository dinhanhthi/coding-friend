import { useCallback, useEffect, useRef, useState } from "react";

import { toCfError, type CfError } from "./cf";

/** Loads shorter than this never flash a spinner. */
export const SPINNER_DELAY_MS = 150;

export type CfQueryStatus = "idle" | "loading" | "ok" | "error";

export interface CfQuery<T> {
  status: CfQueryStatus;
  data?: T;
  error?: CfError;
  /** True only after the first load of a key has taken SPINNER_DELAY_MS. */
  showSpinner: boolean;
  /** A refetch is running; the last result stays visible meanwhile. */
  refreshing: boolean;
  refetch: () => void;
}

interface Settled<T> {
  key: string;
  data?: T;
  error?: CfError;
  refreshing: boolean;
}

/**
 * Loads `fetcher()` for `key` (`null` = nothing to load). The status is derived from
 * the key, so a new key reads `loading` in the very render it arrives, with no data from
 * the previous key. One request runs per key; a response from an older request is dropped.
 * A refetch while a request runs queues one more request after it.
 */
export function useCfQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
): CfQuery<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const [spinnerKey, setSpinnerKey] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  const requestId = useRef(0);
  const inFlightKey = useRef<string | null>(null);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const rerun = useRef(false);

  const load = useCallback((k: string) => {
    if (inFlightKey.current === k) return;
    const id = ++requestId.current;
    inFlightKey.current = k;
    const finish = (outcome: { data?: T; error?: CfError }) => {
      if (id !== requestId.current) return;
      inFlightKey.current = null;
      // A refetch asked for during this request (e.g. right after a mutation) may
      // need newer data than it saw: run once more, keeping this result visible.
      const again = rerun.current;
      rerun.current = false;
      setSettled({ key: k, ...outcome, refreshing: again });
      if (again) load(k);
    };
    fetcherRef.current().then(
      (data) => finish({ data }),
      (e: unknown) => finish({ error: toCfError(e) }),
    );
  }, []);

  useEffect(() => {
    setSettled(null);
    if (key === null) return;
    load(key);
    return () => {
      // Drops the old key's response, also on unmount.
      requestId.current++;
      inFlightKey.current = null;
      rerun.current = false;
    };
  }, [key, load]);

  let status: CfQueryStatus;
  if (key === null) status = "idle";
  else if (settled?.key !== key) status = "loading";
  else status = settled.error ? "error" : "ok";
  const current = status === "ok" || status === "error" ? settled : null;

  useEffect(() => {
    if (status !== "loading") return;
    const timer = setTimeout(() => setSpinnerKey(key), SPINNER_DELAY_MS);
    return () => {
      clearTimeout(timer);
      setSpinnerKey(null);
    };
  }, [status, key]);

  const refetch = useCallback(() => {
    if (key === null) return;
    if (inFlightKey.current === key) {
      rerun.current = true;
      return;
    }
    setSettled((prev) =>
      prev?.key === key ? { ...prev, refreshing: true } : prev,
    );
    load(key);
  }, [key, load]);

  return {
    status,
    data: current?.data,
    error: current?.error,
    showSpinner: status === "loading" && spinnerKey === key,
    refreshing: current?.refreshing ?? false,
    refetch,
  };
}

/** `flag`, but only once it has been true for `ms`. */
export function useDelayed(flag: boolean, ms = SPINNER_DELAY_MS): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!flag) return;
    const timer = setTimeout(() => setShown(true), ms);
    return () => {
      clearTimeout(timer);
      setShown(false);
    };
  }, [flag, ms]);
  return flag && shown;
}
