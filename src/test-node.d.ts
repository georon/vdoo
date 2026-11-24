// The few Node APIs the tests use (vitest runs them in Node). The app itself never imports these; full @types/node would
// also put Node globals into the browser code's types.
declare module "node:child_process" {
  export function execFileSync(file: string, args?: string[], options?: { encoding?: string; input?: string }): string | Uint8Array;
}
declare module "node:fs" {
  export function mkdtempSync(prefix: string): string;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function writeFileSync(path: string, data: string): void;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
}
declare module "node:os" {
  export function tmpdir(): string;
}
declare module "node:path" {
  export function join(...parts: string[]): string;
  export function dirname(path: string): string;
}
