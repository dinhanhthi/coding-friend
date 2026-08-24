export interface HookAPI {
  on(event: string, handler: (...args: unknown[]) => unknown): void;
  sendMessage?(message: {
    customType: string;
    content: string;
    display?: boolean;
  }): void;
}
export default function createExtension(pi: HookAPI): void;
