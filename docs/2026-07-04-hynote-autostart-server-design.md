# hynote 自启动后端 + /api/health — 设计（spec）

> 日期：2026-07-04
> 类型：CLI 启动优化 + server 加一个 health 路由
> 关联：`docs/2026-07-04-auto-email-ui-design.md`

## 1. 目标

`hynote` 一条命令同时把后端起起来：CLI 启动时探测端口，已有 server 就复用，否则 spawn 一个子进程跑 server，就绪后再渲染 TUI，CLI 退出时连带 kill 自己 spawn 的 server。新增一个专用 `/api/health` 存活探测接口。

## 2. 决策

| 议题 | 决定 |
|---|---|
| 启动方式 | spawn 子进程（不在 CLI 进程内起 server，CLI 不 import @hynote/server） |
| 端口已占 | 先探测：已有 server 响应 → 复用（不 spawn、不管其生命周期）；无 → spawn |
| 探测接口 | 专用 `GET /api/health` → 200 `{ ok: true }`（不读盘/不调 AI） |
| 日志 | 子进程 stdout/stderr 追加写 `~/.bao-auto-mail/server.log` |
| 清理 | CLI 退出（exit/SIGINT/SIGTERM）时 kill 自己 spawn 的子进程；复用的不动 |
| 路径解析 | 相对 `import.meta.dir` 解析 server 入口与 repo 根（不依赖 cwd） |

## 3. 设计

### 3.1 server：`/api/health`（`packages/server/src/app.ts`）
在 `createApp` 里加一条最轻量路由：
```ts
app.get('/api/health', (c) => c.json({ ok: true }));
```
不依赖 db/config/AI，纯存活标志。其余路由不变。

### 3.2 CLI 启动引导：新文件 `packages/cli/src/server-boot.ts`

> 用 `node:child_process`（由 `@types/node` 完整类型化，避开 CLI tsconfig `types:["node"]` 下 `Bun` 全局无类型的问题）；`process.execPath` 即当前 bun 二进制，spawn 它直接跑 TS 入口。

```ts
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)); // packages/cli/src
const SERVER_ENTRY = resolve(HERE, '../../server/src/index.ts');
const REPO_ROOT = resolve(HERE, '../../..');
const PORT = Number(process.env.HYNOTE_PORT ?? 3000);
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
    cwd: REPO_ROOT, // so server's `import 'dotenv/config'` finds root .env
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
    try { proc.kill(); } catch { /* already gone */ }
  };
  process.on('exit', kill);
  process.on('SIGINT', kill);
  process.on('SIGTERM', kill);
}
```

### 3.3 `packages/cli/src/index.tsx` 接线
在 `createCliRenderer` 之前：
```ts
import { ensureServer, registerCleanup } from './server-boot';
// …
const { proc } = await ensureServer();
if (proc) registerCleanup(proc);

const renderer = await createCliRenderer({ targetFps: 60, exitOnCtrlC: false });
createRoot(renderer).render(<RouterProvider router={router} />);
```
若 `ensureServer` 抛错（server 起不来），进程直接退出并打印错误（提示看 server.log）——比进 TUI 后所有请求失败体验好。

## 4. 依赖

无新增。spawn 用 Bun 全局 API；不 import @hynote/server（CLI 包依赖不变）。

## 5. 测试 / 验证

- 单测 `packages/cli/tests/server-boot.test.ts`：mock `fetch` → `probeServer` 在 2xx 时返回 true、abort/非 ok 时 false。
- `/api/health` 端到端测试（`packages/server/tests/app.test.ts`）：`GET /api/health` → 200 且 body `{ ok: true }`。
- spawn/就绪/清理/复用：真实终端验证——
  - 直接 `hynote`：应自动起 server（首次约数秒）再进 TUI；`~/.bao-auto-mail/server.log` 有 server 输出；Ctrl+C 退出后该 server 进程被 kill（`lsof -i:3000` 无残留）。
  - 先 `bun run dev:server` 再 `hynote`：应复用、不 spawn、退出不杀 dev server。

## 6. 改动文件

| 文件 | 改动 |
|---|---|
| `packages/server/src/app.ts` | + `GET /api/health` → `{ ok: true }` |
| `packages/server/tests/app.test.ts` | + `/api/health` 断言 |
| `packages/cli/src/server-boot.ts` | 新增 probeServer / ensureServer / registerCleanup |
| `packages/cli/tests/server-boot.test.ts` | 新增 probeServer 单测 |
| `packages/cli/src/index.tsx` | 启动前 `ensureServer` + `registerCleanup` |

## 7. 风险

- **软链路径解析**：`hynote` 经 `bun link` 全局安装后，`import.meta.url` 是否解析成 repo 真实路径。若为软链路径导致 `../../server` 找不到 → 改为从 `HERE` 向上查找含 `packages/server` 的 workspace 根。实现时实测（`hynote` 全局跑一次）。
- **`bun` 运行 .ts 入口**：`process.execPath` 是当前 bun；spawn `bun server/src/index.ts` 直接跑 TS，OK。
- **就绪超时**：D1 凭证缺失时 server 启动即抛错并写 server.log；probe 一直失败 → 10s 超时报错，提示看日志（符合预期）。
- **清理时机**：opentui Ctrl+C 走 keyboard-layer → `renderer.destroy()` → 进程退出 → `process.on('exit')` kill 子进程；额外挂 SIGINT/SIGTERM 兜底。
