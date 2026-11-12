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
const child = spawn(electron, [root, ...process.argv.slice(2)], { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
