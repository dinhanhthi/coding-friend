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

/**
 * MemoryBackend implementation that talks to the daemon over UDS.
 */
export class DaemonClient implements MemoryBackend {
  constructor(private socketPath: string) {}

  private request<T>(method: string, path: string, body?: unknown): Promise<T> {
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
      const result = await this.request<{ status: string }>("GET", "/health");
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
