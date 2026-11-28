import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout } from 'node:timers';

const localLocks = new AsyncLocalStorage();
const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_RETRY_MS = 100;

function defaultLockPath() {
  const shard = String(process.env.E2E_SHARD_INDEX ?? 'local').replace(/[^a-zA-Z0-9_-]/g, '_');
  const root = process.env.BINGXI_E2E_LOCK_ROOT || os.tmpdir();
  return path.join(root, 'bingxi-e2e-number-rule-config', shard, 'number-rule-config.lock');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function readOwner(lockPath) {
  try {
    return JSON.parse(await readFile(path.join(lockPath, 'owner.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function recoverStaleLock(lockPath) {
  const owner = await readOwner(lockPath);
  if (!owner || !Number.isInteger(owner.pid) || processAlive(owner.pid)) return;
  const stalePath = `${lockPath}.stale-${process.pid}-${randomUUID()}`;
  try {
    await rename(lockPath, stalePath);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  await rm(stalePath, { recursive: true, force: true });
}

const LOCK_CONTENTION_CODES = new Set(['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES']);

function isLockContention(error) {
  return LOCK_CONTENTION_CODES.has(error?.code);
}

async function acquire(lockPath, timeoutMs, retryMs) {
  const parent = path.dirname(lockPath);
  await mkdir(parent, { recursive: true });
  const token = `${process.pid}-${randomUUID()}`;
  const owner = { token, pid: process.pid, createdAt: new Date().toISOString() };
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
      // 竞争错误发生时，持有者可能在本进程检查锁目录前恰好释放锁。
      // 此时 exists=false 只说明现在可重试，不能把上一轮 EPERM/EEXIST 误抛为致命错误。
      if (!isLockContention(error) && !(await exists(lockPath))) throw error;
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

export async function withNumberRuleConfigLock(fn, options = {}) {
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
