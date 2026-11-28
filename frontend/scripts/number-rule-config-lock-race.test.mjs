import test from 'node:test';
import assert from 'node:assert/strict';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TEMP_ROOT =
  process.env.BINGXI_TEST_TMP || (process.platform === 'win32' ? 'F:/tmp' : os.tmpdir());

test('非竞争 IO 错误仍立即抛出，不被重试逻辑吞掉', async () => {
  const dir = mkdtempSync(path.join(TEMP_ROOT, 'number-rule-lock-io-'));
  const lockPath = path.join(dir, 'config.lock');
  const originalRename = fsPromises.rename;

  fsPromises.rename = async () => {
    const error = new Error('disk failure');
    error.code = 'EIO';
    throw error;
  };
  syncBuiltinESMExports();

  try {
    const moduleUrl = pathToFileURL(path.resolve('e2e/flow/number-rule-config-lock.mjs'));
    moduleUrl.searchParams.set('io-regression', '1');
    const { withNumberRuleConfigLock } = await import(moduleUrl.href);
    await assert.rejects(
      withNumberRuleConfigLock(async () => 'unexpected', {
        lockPath,
        timeoutMs: 1000,
        retryMs: 10,
      }),
      { code: 'EIO' }
    );
  } finally {
    fsPromises.rename = originalRename;
    syncBuiltinESMExports();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rename 竞争失败后锁已释放仍应重试，不得误抛 EPERM', async () => {
  const dir = mkdtempSync(path.join(TEMP_ROOT, 'number-rule-lock-race-'));
  const lockPath = path.join(dir, 'config.lock');
  const originalRename = fsPromises.rename;
  let injected = false;

  fsPromises.rename = async (...args) => {
    if (!injected && String(args[1]) === lockPath) {
      injected = true;
      const error = new Error('destination already exists');
      error.code = 'EPERM';
      throw error;
    }
    return originalRename(...args);
  };
  syncBuiltinESMExports();

  try {
    const moduleUrl = pathToFileURL(path.resolve('e2e/flow/number-rule-config-lock.mjs'));
    moduleUrl.searchParams.set('race-regression', '1');
    const { withNumberRuleConfigLock } = await import(moduleUrl.href);
    const value = await withNumberRuleConfigLock(async () => 'acquired', {
      lockPath,
      timeoutMs: 1000,
      retryMs: 10,
    });
    assert.equal(value, 'acquired');
    assert.equal(injected, true);
  } finally {
    fsPromises.rename = originalRename;
    syncBuiltinESMExports();
    rmSync(dir, { recursive: true, force: true });
  }
});
