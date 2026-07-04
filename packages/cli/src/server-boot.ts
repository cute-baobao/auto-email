import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)); // packages/cli/src
const SERVER_ENTRY = resolve(HERE, '../../server/src/index.ts');
const REPO_ROOT = resolve(HERE, '../../..');
const PORT = Number(process.env.HYNOTE_PORT ?? 45678);
const CONFIG_DIR = join(homedir(), '.bao-auto-mail');
const LOG_PATH = join(CONFIG_DIR, 'server.log');

export async function probeServer(port = PORT): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 500);
    const res = await fetch(`http://localhost:${port}/api/health`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

export async function ensureServer(): Promise<{ proc: ChildProcess | null }> {
  if (await probeServer()) return { proc: null }; // reuse a running server

  mkdirSync(CONFIG_DIR, { recursive: true });
  const fd = openSync(LOG_PATH, 'a');
  const proc = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: REPO_ROOT,
    stdio: ['ignore', fd, fd],
    env: process.env,
  });

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await probeServer()) return { proc };
    await new Promise((r) => setTimeout(r, 250));
  }
  proc.kill();
  throw new Error(`server 未在 10s 内就绪，见 ${LOG_PATH}`);
}

export function registerCleanup(proc: ChildProcess): void {
  const kill = () => {
    try {
      proc.kill();
    } catch {
      /* already gone */
    }
  };
  process.on('exit', kill);
  process.on('SIGINT', kill);
  process.on('SIGTERM', kill);
}
