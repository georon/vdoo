// Starts the desktop app from this checkout. Terminals inside VS Code (and other Electron apps) can export
// ELECTRON_RUN_AS_NODE=1, which makes Electron run as plain Node and fail on startup; the app never wants it.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const electron = createRequire(import.meta.url)("electron");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
// Ubuntu 23.10+ blocks unprivileged user namespaces (kernel.apparmor_restrict_unprivileged_userns=1), so Chromium
// falls back to the SUID chrome-sandbox helper, which npm installs without root ownership and Electron aborts.
// The GPU process has its own sandbox and dies ("GPU process isn't usable") unless that is disabled too.
// This launcher is for local development only; packaged builds keep the sandbox.
const sandboxArgs = process.platform === "linux" ? ["--no-sandbox", "--disable-gpu-sandbox"] : [];
const child = spawn(electron, [...sandboxArgs, root, ...process.argv.slice(2)], { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
