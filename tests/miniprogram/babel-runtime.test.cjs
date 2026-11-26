const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { assert, MP_ROOT } = require('./helpers.cjs');

const mpRequire = Module.createRequire(path.join(MP_ROOT, 'package.json'));

function sourceFiles(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'miniprogram_npm', '@babel'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, output);
    else if (entry.name.endsWith('.js')) output.push(full);
  }
  return output;
}

test('clean checkout 的每个相对 @babel/runtime 引用都有锁定依赖与真实 helper', () => {
  const pkg = require(path.join(MP_ROOT, 'package.json'));
  const lock = require(path.join(MP_ROOT, 'package-lock.json'));
  assert.equal(pkg.dependencies['@babel/runtime'], '7.28.4');
  assert.equal(
    lock.packages['node_modules/@babel/runtime'].version,
    pkg.dependencies['@babel/runtime']
  );
  const references = [];
  for (const file of sourceFiles(MP_ROOT)) {
    const text = fs.readFileSync(file, 'utf8');
    const requirePattern = /require\((['"])([^'"]+)\1\)/g;
    let match;
    while ((match = requirePattern.exec(text)) !== null) {
      const request = match[2];
      const marker = '@babel/runtime/';
      const index = request.indexOf(marker);
      if (index >= 0) {
        const suffix = request.slice(index + marker.length);
        const helper = mpRequire('@babel/runtime/' + suffix);
        assert.ok(helper, 'Babel helper 为空：' + request);
        references.push({ file, request });
      }
    }
  }
  assert.ok(references.length > 100, 'Babel 引用扫描面过小：' + references.length);
  assert.ok(references.some(({ request }) => request.includes('createClass')));
  assert.ok(references.some(({ request }) => request.includes('classCallCheck')));
  assert.ok(references.some(({ request }) => request.includes('interopRequireDefault')));
});

test('运行版本模块与 package.json 逐字对齐，禁止版本漂移', () => {
  const version = require(path.join(MP_ROOT, 'version.js'));
  assert.equal(version, require(path.join(MP_ROOT, 'package.json')).version);
  assert.equal(version, '3.13.10');
});
