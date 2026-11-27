import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { withNumberRuleConfigLock } from '../e2e/flow/number-rule-config-lock.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOCK_MODULE_URL = pathToFileURL(
  path.resolve(HERE, '../e2e/flow/number-rule-config-lock.mjs')
).href;
const TEMP_ROOT =
  process.env.BINGXI_TEST_TMP || (process.platform === 'win32' ? 'F:/tmp' : os.tmpdir());

function tempDir(label) {
  mkdirSync(TEMP_ROOT, { recursive: true });
  return mkdtempSync(path.join(TEMP_ROOT, `number-rule-lock-${label}-`));
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(10);
  }
  throw new Error(`等待条件超时：${timeoutMs}ms`);
}

function startWorker(lockPath, mode, eventsPath, releasePath) {
  const code = `
    import { appendFileSync, existsSync } from 'node:fs';
    import { withNumberRuleConfigLock } from ${JSON.stringify(LOCK_MODULE_URL)};
    const [lockPath, mode, eventsPath, releasePath] = process.argv.slice(1);
    const note = value => appendFileSync(eventsPath, value + '\\n');
    note(mode + ':waiting');
    await withNumberRuleConfigLock(async () => {
      note(mode + ':start');
      if (mode === 'A') {
        while (!existsSync(releasePath)) await new Promise(resolve => setTimeout(resolve, 10));
      }
      note(mode + ':end');
    }, { lockPath, timeoutMs: 10000, retryMs: 10 });
  `;
  const child = spawn(
    process.execPath,
    ['--input-type=module', '-e', code, lockPath, mode, eventsPath, releasePath],
    {
      cwd: path.resolve(HERE, '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  let stderr = '';
  child.stderr.on('data', chunk => {
    stderr += chunk.toString();
  });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', status => {
      if (status === 0) resolve();
      else reject(new Error(`${mode} worker 退出码 ${status}: ${stderr}`));
    });
  });
  return { child, done };
}

test('两个真实进程按获取顺序进入临界区，不会并发持有', async () => {
  const dir = tempDir('processes');
  const lockPath = path.join(dir, 'config.lock');
  const eventsPath = path.join(dir, 'events.txt');
  const releasePath = path.join(dir, 'release.txt');
  writeFileSync(eventsPath, '');
  const a = startWorker(lockPath, 'A', eventsPath, releasePath);
  let b;
  try {
    await waitFor(() => readFileSync(eventsPath, 'utf8').includes('A:start'));
    b = startWorker(lockPath, 'B', eventsPath, releasePath);
    await waitFor(() => readFileSync(eventsPath, 'utf8').includes('B:waiting'));
    await delay(150);
    assert.equal(
      readFileSync(eventsPath, 'utf8').includes('B:start'),
      false,
      'A 持锁期间 B 不得进入临界区'
    );
    writeFileSync(releasePath, 'go');
    await Promise.all([a.done, b.done]);
    const events = readFileSync(eventsPath, 'utf8')
      .trim()
      .split('\n')
      .filter(line => line.endsWith(':start') || line.endsWith(':end'));
    assert.deepEqual(events, ['A:start', 'A:end', 'B:start', 'B:end']);
  } finally {
    if (b?.child.exitCode === null) b.child.kill();
    if (a.child.exitCode === null) a.child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('同一异步调用链可重入，不会自锁', async () => {
  const dir = tempDir('reentrant');
  const events = [];
  try {
    await withNumberRuleConfigLock(
      async () => {
        events.push('outer:start');
        await withNumberRuleConfigLock(
          async () => {
            events.push('inner');
          },
          { lockPath: path.join(dir, 'config.lock'), timeoutMs: 250, retryMs: 10 }
        );
        events.push('outer:end');
      },
      { lockPath: path.join(dir, 'config.lock'), timeoutMs: 1000, retryMs: 10 }
    );
    assert.deepEqual(events, ['outer:start', 'inner', 'outer:end']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('回调抛错时释放锁，后续调用可立即获取', async () => {
  const dir = tempDir('throw');
  const lockPath = path.join(dir, 'config.lock');
  try {
    await assert.rejects(
      withNumberRuleConfigLock(
        async () => {
          throw new Error('boom');
        },
        { lockPath, timeoutMs: 1000, retryMs: 10 }
      ),
      /boom/
    );
    const value = await withNumberRuleConfigLock(async () => 'next', {
      lockPath,
      timeoutMs: 250,
      retryMs: 10,
    });
    assert.equal(value, 'next');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('持有者进程已退出时自动回收陈旧锁', async () => {
  const dir = tempDir('stale');
  const lockPath = path.join(dir, 'config.lock');
  mkdirSync(lockPath);
  writeFileSync(
    path.join(lockPath, 'owner.json'),
    JSON.stringify({ token: 'dead-owner', pid: 99999999, createdAt: new Date().toISOString() })
  );
  try {
    const value = await withNumberRuleConfigLock(async () => 'recovered', {
      lockPath,
      timeoutMs: 1000,
      retryMs: 10,
    });
    assert.equal(value, 'recovered');
    assert.equal(existsSync(lockPath), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
