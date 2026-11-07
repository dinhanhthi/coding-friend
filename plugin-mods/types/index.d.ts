// The state contract of coding-friend-mods. Later features add their keys
// to the "coding-friend-mods" entry below.

/** One Claude quota window as the band draws it (from the quota snapshot). */
export type ModsQuotaWindow = {
  kind: "five_hour" | "seven_day";
  /** 0-100, one decimal at most. */
  percentUsed: number;
  /** Epoch seconds. */
  resetsAt: number;
};

/**
 * One MCP server's health at the last ping: "ok" answered, "error" answered
 * with isError, timed out or failed, "absent" not configured or not connected.
 */
export type ModsMcpState = "ok" | "error" | "absent";

/** The last MCP ping of both Coding Friend servers. */
export type ModsMcp = {
  memory: ModsMcpState;
  learn: ModsMcpState;
  /** Epoch milliseconds of the ping. */
  checkedAt: number;
};

/** One Progress row as the plan pane draws it (label cleaned and cut short). */
export type ModsPlanRow = {
  status: "todo" | "in_progress" | "done" | "failed";
  label: string;
};

/** The rows of one plan file: the README's, or a phase file not yet all done. */
export type ModsPlanGroup = { title: string; rows: ModsPlanRow[] };

/** Rows per status across a set of rows. */
export type ModsPlanCounts = {
  todo: number;
  in_progress: number;
  done: number;
  failed: number;
};

/** The plan the `/cf-plan-status` pane shows. */
export type ModsPlan = {
  slug: string;
  /** Frontmatter `status:` when it is a plain word, else null. */
  status: string | null;
  /** README Progress rows (phases, or tasks for a one-file plan). */
  readme: ModsPlanCounts;
  /** Task rows of every phase file, null when the plan has none. */
  tasks: ModsPlanCounts | null;
  /** At most 60 rows in all. */
  groups: ModsPlanGroup[];
  /** Epoch milliseconds of the read. */
  updatedAt: number;
};

declare module "claude-code" {
  interface PluginState {
    "coding-friend-mods": {
      isInteractive: boolean;
      /** Latest quota windows, null until the first measurement. */
      quota: ModsQuotaWindow[] | null;
      /** Latest MCP ping, null until the first one (interactive only). */
      mcp: ModsMcp | null;
      /** The plan the pane shows, null while it is closed. */
      plan: ModsPlan | null;
    };
  }
}
