import http from "node:http";
import type { MemoryBackend } from "./backend.js";
import type {
  ListInput,
  Memory,
  MemoryMeta,
  MemoryStats,
  SearchInput,
  SearchResult,
  StoreInput,
  UpdateInput,
} from "./types.js";

export interface DaemonClientOptions {
  /** Called to respawn the daemon when a connection fails. */
  respawn?: () => Promise<boolean>;
}

/**
 * MemoryBackend implementation that talks to the daemon over UDS.
 *
 * When a `respawn` callback is provided, connection errors automatically
 * trigger a single respawn attempt followed by a retry of the original request.
 */
export class DaemonClient implements MemoryBackend {
  private respawn?: () => Promise<boolean>;

  constructor(
    private socketPath: string,
    opts?: DaemonClientOptions,
  ) {
    this.respawn = opts?.respawn;
  }

  private rawRequest<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const options: http.RequestOptions = {
        socketPath: this.socketPath,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
        },
      };

      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data) as T;
            if (res.statusCode && res.statusCode >= 400) {
              reject(
                new Error(
                  (parsed as Record<string, string>).error ??
                    `HTTP ${res.statusCode}`,
                ),
              );
            } else {
              resolve(parsed);
            }
          } catch {
            reject(new Error(`Invalid JSON response: ${data}`));
          }
        });
      });

      req.on("error", (err) => {
        reject(err);
      });

      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  /**
   * Send a request to the daemon. On connection error (ECONNREFUSED, ENOENT),
   * attempt to respawn the daemon once and retry.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    try {
      return await this.rawRequest<T>(method, path, body);
    } catch (err) {
      if (!this.respawn || !isConnectionError(err)) throw err;

      const ok = await this.respawn();
      if (!ok) throw err;

      return this.rawRequest<T>(method, path, body);
    }
  }

  async store(input: StoreInput): Promise<Memory> {
    const result = await this.request<{
      id: string;
      title: string;
      stored: boolean;
    }>("POST", "/memory", input);
    // Retrieve full memory after store
    const memory = await this.retrieve(result.id);
    if (!memory) throw new Error("Store succeeded but retrieve failed");
    return memory;
  }

  async search(input: SearchInput): Promise<SearchResult[]> {
    const params = new URLSearchParams();
    params.set("query", input.query);
    if (input.type) params.set("type", input.type);
    if (input.tags) params.set("tags", input.tags.join(","));
    if (input.limit) params.set("limit", String(input.limit));

    return this.request<SearchResult[]>(
      "GET",
      `/memory/search?${params.toString()}`,
    );
  }

  async retrieve(id: string): Promise<Memory | null> {
    try {
      return await this.request<Memory>("GET", `/memory/${id}`);
    } catch {
      return null;
    }
  }

  async list(input: ListInput): Promise<MemoryMeta[]> {
    const params = new URLSearchParams();
    if (input.type) params.set("type", input.type);
    if (input.category) params.set("category", input.category);
    if (input.limit) params.set("limit", String(input.limit));

    const qs = params.toString();
    return this.request<MemoryMeta[]>("GET", qs ? `/memory?${qs}` : "/memory");
  }

  async update(input: UpdateInput): Promise<Memory | null> {
    const { id, ...body } = input;
    try {
      await this.request("PATCH", `/memory/${id}`, body);
      return this.retrieve(id);
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.request("DELETE", `/memory/${id}`);
      return true;
    } catch {
      return false;
    }
  }

  async stats(): Promise<MemoryStats> {
    return this.request<MemoryStats>("GET", "/stats");
  }

  async close(): Promise<void> {
    // No-op — daemon keeps running
  }

  /**
   * Check if the daemon is reachable.
   */
  async ping(): Promise<boolean> {
    try {
      // Use rawRequest — ping checks liveness, must not trigger respawn
      const result = await this.rawRequest<{ status: string }>(
        "GET",
        "/health",
      );
      return result.status === "ok";
    } catch {
      return false;
    }
  }

  /**
   * Trigger index rebuild on the daemon.
   */
  async rebuild(): Promise<void> {
    try {
      await this.request<{ rebuilt: boolean }>("POST", "/rebuild");
    } catch {
      // Rebuild failed or not supported
    }
  }
}

/** Connection-level errors that indicate the daemon process is gone. */
function isConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  return code === "ECONNREFUSED" || code === "ENOENT" || code === "ECONNRESET";
}
