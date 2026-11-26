import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface NumberRuleConfigLockOptions {
  lockPath?: string;
  timeoutMs?: number;
  retryMs?: number;
}

interface LockOwner {
  token: string;
  pid: number;
  createdAt: string;
}

interface LockHandle {
  release: () => Promise<void>;
}

const localLocks = new AsyncLocalStorage<Map<string, number>>();
const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_RETRY_MS = 100;

function defaultLockPath(): string {
  const shard = String(process.env.E2E_SHARD_INDEX ?? 'local').replace(/[^a-zA-Z0-9_-]/g, '_');
  const root = process.env.BINGXI_E2E_LOCK_ROOT || os.tmpdir();
  return path.join(root, 'bingxi-e2e-number-rule-config', shard, 'number-rule-config.lock');
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function readOwner(lockPath: string): Promise<LockOwner | undefined> {
  try {
    return JSON.parse(await readFile(path.join(lockPath, 'owner.json'), 'utf8')) as LockOwner;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function recoverStaleLock(lockPath: string): Promise<void> {
  const owner = await readOwner(lockPath);
  if (!owner || !Number.isInteger(owner.pid) || processAlive(owner.pid)) return;
  const stalePath = `${lockPath}.stale-${process.pid}-${randomUUID()}`;
  try {
    await rename(lockPath, stalePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  await rm(stalePath, { recursive: true, force: true });
}

async function acquire(lockPath: string, timeoutMs: number, retryMs: number): Promise<LockHandle> {
  const parent = path.dirname(lockPath);
  await mkdir(parent, { recursive: true });
  const token = `${process.pid}-${randomUUID()}`;
  const owner: LockOwner = { token, pid: process.pid, createdAt: new Date().toISOString() };
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const pendingPath = path.join(parent, `.pending-${token}`);
    await mkdir(pendingPath);
    try {
      await writeFile(path.join(pendingPath, 'owner.json'), JSON.stringify(owner), 'utf8');
    } catch (error) {
      await rm(pendingPath, { recursive: true, force: true });
      throw error;
    }

    try {
      await rename(pendingPath, lockPath);
      return {
        release: async () => {
          const current = await readOwner(lockPath);
          if (!current) return;
          if (current.token !== token) {
            throw new Error(`编码规则锁 owner 不匹配，拒绝删除他人锁：${lockPath}`);
          }
          await rm(lockPath, { recursive: true, force: true });
        },
      };
    } catch (error) {
      await rm(pendingPath, { recursive: true, force: true });
      if (!(await exists(lockPath))) throw error;
      await recoverStaleLock(lockPath);
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        const current = await readOwner(lockPath);
        throw new Error(
          `等待编码规则锁超时 ${timeoutMs}ms：${lockPath}；owner pid=${current?.pid ?? 'unknown'}`
        );
      }
      await delay(Math.min(retryMs, remaining));
    }
  }
}

export async function withNumberRuleConfigLock<T>(
  fn: () => T | Promise<T>,
  options: NumberRuleConfigLockOptions = {}
): Promise<T> {
  const lockPath = path.resolve(options.lockPath ?? defaultLockPath());
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryMs = options.retryMs ?? DEFAULT_RETRY_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`编码规则锁 timeoutMs 必须为正数：${timeoutMs}`);
  }
  if (!Number.isFinite(retryMs) || retryMs <= 0) {
    throw new Error(`编码规则锁 retryMs 必须为正数：${retryMs}`);
  }

  const existing = localLocks.getStore();
  const depth = existing?.get(lockPath) ?? 0;
  if (depth > 0) {
    const nested = new Map(existing);
    nested.set(lockPath, depth + 1);
    return localLocks.run(nested, async () => fn());
  }

  const handle = await acquire(lockPath, timeoutMs, retryMs);
  return localLocks.run(new Map([[lockPath, 1]]), async () => {
    try {
      return await fn();
    } finally {
      await handle.release();
    }
  });
}
