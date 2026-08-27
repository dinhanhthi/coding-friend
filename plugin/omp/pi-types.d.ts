export interface HookAPI {
  on(
    event: "session.compacting",
    handler: (event: unknown) => { context: string[] } | void,
  ): void;
  on(event: "session_before_compact", handler: (event: unknown) => void): void;
  on(event: string, handler: (...args: unknown[]) => unknown): void;
  sendMessage?(message: {
    customType: string;
    content: string;
    display?: boolean;
  }): void;
}
export default function createExtension(pi: HookAPI): void;
