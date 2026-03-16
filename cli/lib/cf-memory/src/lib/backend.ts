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

export interface MemoryBackend {
  store(input: StoreInput): Promise<Memory>;
  search(input: SearchInput): Promise<SearchResult[]>;
  retrieve(id: string): Promise<Memory | null>;
  list(input: ListInput): Promise<MemoryMeta[]>;
  update(input: UpdateInput): Promise<Memory | null>;
  delete(id: string): Promise<boolean>;
  stats(): Promise<MemoryStats>;
  close(): Promise<void>;
  /** Rebuild the search index from source files. Optional — not all backends support it. */
  rebuild?(): Promise<void>;
}
