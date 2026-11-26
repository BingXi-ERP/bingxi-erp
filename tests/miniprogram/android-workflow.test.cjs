const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { assert, REPO_ROOT } = require('./helpers.cjs');

test('主流水线强制 Android 模拟器 E2E 真实执行', () => {
  const pipeline = fs.readFileSync(
    path.join(REPO_ROOT, '.github', 'workflows', 'ci-cd.yml'),
    'utf8'
  );
  const call = 'uses: ./.github/workflows/android.yml';
  const callIndex = pipeline.indexOf(call);
  assert.notEqual(callIndex, -1);
  const androidCall = pipeline.slice(callIndex - 1400, callIndex + call.length);
  assert.match(androidCall, /run_e2e: \$\{\{ 'true' \}\}/);
  assert.doesNotMatch(androidCall, /run_e2e: \$\{\{ 'false' \}\}/);
});
