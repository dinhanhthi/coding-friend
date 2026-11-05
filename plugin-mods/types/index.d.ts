// The state contract of coding-friend-mods. Later features add their keys
// to the "coding-friend-mods" entry below.

export type ModsSession = { isInteractive: boolean };

/** One Claude quota window as the band draws it (from the quota snapshot). */
export type ModsQuotaWindow = {
  kind: "five_hour" | "seven_day";
  /** 0-100, one decimal at most. */
  percentUsed: number;
  /** Epoch seconds. */
  resetsAt: number;
};

declare module "claude-code" {
  interface PluginState {
    "coding-friend-mods": {
      isInteractive: boolean;
      /** Latest quota windows, null until the first measurement. */
      quota: ModsQuotaWindow[] | null;
    };
  }
}
