const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { assert, REPO_ROOT, releaseScript } = require('./helpers.cjs');
const ciRelease = require(path.join(REPO_ROOT, 'scripts', 'ci', 'miniprogram-ci-release.cjs'));

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-release-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const mp = path.join(root, 'miniprogram');
  fs.mkdirSync(mp, { recursive: true });
  fs.writeFileSync(
    path.join(mp, 'package.json'),
    JSON.stringify({
      version: '3.13.10',
      dependencies: { '@babel/runtime': '7.28.4' },
    })
  );
  fs.writeFileSync(
    path.join(mp, 'project.config.json'),
    JSON.stringify({ appid: 'wx9fc2137059cd96d0' })
  );
  fs.writeFileSync(path.join(mp, 'app.js'), 'App({});\n');
  fs.mkdirSync(path.join(mp, 'libs'), { recursive: true });
  for (let i = 0; i < 100; i += 1) {
    fs.writeFileSync(path.join(mp, 'libs', `file-${i}.js`), 'module.exports = {};\n');
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', 'miniprogram'], { cwd: root });
  execFileSync(
    'git',
    ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'fixture'],
    {
      cwd: root,
    }
  );
  return { root, mp };
}

test('源码包排除本地主机、构建目录、环境文件、密钥与报告', t => {
  const excluded = [
    'mpHost.local.js',
    'node_modules/a/index.js',
    'miniprogram_npm/@babel/runtime/index.js',
    '@babel/runtime/helpers/a.js',
    '.env.production',
    'private.key',
    'server.pem',
    'reports/result.json',
    'project.private.config.json',
  ];
  for (const file of excluded) assert.equal(releaseScript().isExcluded(file), true, file);
  for (const file of ['app.js', 'mpHost.local.example.js', 'package-lock.json', 'version.js']) {
    assert.equal(releaseScript().isExcluded(file), false, file);
  }
});

test('源码包 CLI 按工作流参数生成 ZIP 与 manifest', t => {
  const { root } = fixture(t);
  const output = path.join(root, 'dist');
  const stdout = execFileSync(
    process.execPath,
    [
      path.join(REPO_ROOT, 'scripts', 'ci', 'miniprogram-release.cjs'),
      '--root',
      root,
      '--version',
      '3.13.10',
      '--output',
      output,
    ],
    { encoding: 'utf8' }
  );
  assert.match(stdout, /MP_SOURCE_PACKAGE_OK version=3\.13\.10/);
  const manifest = JSON.parse(fs.readFileSync(path.join(output, 'release-manifest.json'), 'utf8'));
  assert.equal(manifest.artifactType, 'wechat-miniprogram-source-project');
  assert.equal(manifest.compiledPackage, false);
  assert.equal(fs.existsSync(path.join(output, manifest.archive.name)), true);
});

test('版本必须显式 semver 且与 package.json 单一事实源一致', () => {
  assert.equal(releaseScript().VERSION_PATTERN.test('3.13.10'), true);
  assert.equal(releaseScript().VERSION_PATTERN.test('3.13.10-rc.1'), true);
  assert.equal(releaseScript().VERSION_PATTERN.test('latest'), false);
  assert.throws(() => releaseScript().validateVersion('3.13.11', '3.13.10'), /必须与/);
});

test('旧端点扫描忽略注释但保留字符串调用点、行号与动态拼接', () => {
  const source = [
    '// "/app-api/comment-only"',
    '/* "/app-api/block-comment" */',
    'request.POST(app.config.bingxiHost + "/app-api/orders/save", data);',
    'const url = "/app-api/orders/" + id;',
    'const text = "not a /app-api path";',
  ].join('\n');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-legacy-scan-'));
  try {
    const file = path.join(dir, 'a.js');
    fs.writeFileSync(file, source);
    const actual = releaseScript().scanLegacyEndpoints([
      { relativePath: 'services/a.js', fullPath: file },
    ]);
    assert.equal(actual.length, 3);
    assert.deepEqual(
      actual.map(hit => hit.line),
      [3, 4, 5]
    );
    assert.equal(actual[0].file, 'miniprogram/services/a.js');
    assert.match(actual[0].path, /\/app-api\/orders\/save/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('注释剥离保留字符串内的 URL 与换行', () => {
  const input = 'const u="/app-api/x"; // /app-api/comment\n/* block\ncomment */ const x=1;';
  const output = releaseScript().stripComments(input);
  assert.match(output, /"\/app-api\/x"/);
  assert.doesNotMatch(output, /comment/);
  assert.match(output, /const x=1/);
});

test('真实 Git 跟踪面生成版本化 ZIP 与 manifest，排除敏感文件且编译包标记为 false', t => {
  const { root, mp } = fixture(t);
  fs.writeFileSync(
    path.join(mp, 'mpHost.local.js'),
    'module.exports={bingxiHost:"https://secret.example.com"};\n'
  );
  fs.mkdirSync(path.join(mp, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(mp, 'reports', 'secret.json'), '{}');
  fs.writeFileSync(path.join(mp, 'services.js'), 'request.POST(host + "/app-api/legacy/save");\n');
  execFileSync(
    'git',
    [
      'add',
      'miniprogram/mpHost.local.js',
      'miniprogram/reports/secret.json',
      'miniprogram/services.js',
    ],
    {
      cwd: root,
    }
  );
  const output = path.join(root, 'dist');
  const manifest = releaseScript().packageSource(root, '3.13.10', output);
  assert.equal(manifest.version, '3.13.10');
  assert.equal(manifest.appid, 'wx9fc2137059cd96d0');
  assert.equal(manifest.compiledPackage, false);
  assert.equal(manifest.artifactType, 'wechat-miniprogram-source-project');
  assert.equal(manifest.fileCount, 104);
  assert.equal(manifest.legacyEndpoints.count, 1);
  assert.equal(manifest.releaseReadiness.uploadAllowed, false);
  assert.equal(manifest.releaseReadiness.onlineReleaseAllowed, false);
  assert.ok(manifest.excludedTrackedFiles.includes('miniprogram/mpHost.local.js'));
  assert.ok(manifest.excludedTrackedFiles.includes('miniprogram/reports/secret.json'));
  assert.match(manifest.archive.name, /^miniprogram-source-3\.13\.10-[0-9a-f]{12}\.zip$/);
  assert.equal(manifest.archive.fileCount, manifest.fileCount);
  assert.ok(manifest.archive.bytes > 0);
  const entries = execFileSync('unzip', ['-Z1', path.join(output, manifest.archive.name)], {
    encoding: 'utf8',
  });
  assert.match(entries, /miniprogram\/app\.js/);
  assert.doesNotMatch(entries, /mpHost\.local\.js/);
  assert.doesNotMatch(entries, /reports\/|node_modules|miniprogram_npm|@babel/);
  execFileSync('unzip', ['-t', path.join(output, manifest.archive.name)], {
    stdio: 'pipe',
  });
});

test('源码包拒绝 version 漂移与错误 AppID', t => {
  const { root, mp } = fixture(t);
  assert.throws(
    () => releaseScript().packageSource(root, '9.9.9', path.join(root, 'dist')),
    /version/
  );
  fs.writeFileSync(path.join(mp, 'project.config.json'), JSON.stringify({ appid: 'wxwrong' }));
  execFileSync('git', ['add', 'miniprogram/project.config.json'], {
    cwd: root,
  });
  assert.throws(
    () => releaseScript().packageSource(root, '3.13.10', path.join(root, 'dist')),
    /AppID/
  );
});

function manifest(overrides = {}) {
  return {
    appid: 'wx9fc2137059cd96d0',
    version: '3.13.10',
    compiledPackage: false,
    legacyEndpoints: { count: 0 },
    releaseReadiness: { uploadAllowed: true },
    ...overrides,
  };
}

function releaseOptions(t, overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-ci-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const projectPath = path.join(dir, 'miniprogram');
  const output = path.join(dir, 'output');
  fs.mkdirSync(projectPath, { recursive: true });
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    path.join(projectPath, 'mpHost.local.js'),
    'module.exports={bingxiHost:"https://erp.example.com"};\n'
  );
  const privateKeyPath = path.join(dir, 'private.key');
  fs.writeFileSync(privateKeyPath, 'unit-test-key');
  return {
    root: dir,
    projectPath,
    output,
    privateKeyPath,
    manifest: manifest(),
    mode: 'preview',
    version: '3.13.10',
    robot: '1',
    desc: 'CI unit test',
    Project: class {
      constructor(options) {
        this.options = options;
      }
    },
    ci: {
      async packNpm() {
        return [];
      },
      async preview(options) {
        fs.writeFileSync(options.qrcodeOutputDest, 'png');
        return { subPackageInfo: [{ name: '__FULL__', size: 10 }] };
      },
      async upload() {
        return { subPackageInfo: [{ name: '__FULL__', size: 10 }] };
      },
    },
    ...overrides,
  };
}

test('发布配置拒绝缺秘密、非 HTTPS、越界 robot、错误 AppID 与版本', () => {
  const valid = {
    mode: 'preview',
    version: '3.13.10',
    robot: 30,
    desc: 'release',
    appid: 'wx9fc2137059cd96d0',
    privateKey: 'key',
    host: 'https://erp.example.com',
  };
  assert.equal(ciRelease.validateReleaseConfig(valid).robot, 30);
  assert.throws(() => ciRelease.validateReleaseConfig({ ...valid, privateKey: '' }), /PRIVATE_KEY/);
  assert.throws(() => ciRelease.validateReleaseConfig({ ...valid, host: '' }), /BINGXI_HOST/);
  assert.throws(
    () =>
      ciRelease.validateReleaseConfig({
        ...valid,
        host: 'http://erp.example.com',
      }),
    /https/
  );
  assert.throws(
    () =>
      ciRelease.validateReleaseConfig({
        ...valid,
        host: 'https://u:p@erp.example.com',
      }),
    /用户名/
  );
  assert.throws(
    () =>
      ciRelease.validateReleaseConfig({
        ...valid,
        host: 'https://erp.example.com/base',
      }),
    /路径/
  );
  assert.throws(() => ciRelease.validateReleaseConfig({ ...valid, robot: 31 }), /1-30/);
  assert.throws(() => ciRelease.validateReleaseConfig({ ...valid, appid: 'wxwrong' }), /AppID/);
  assert.throws(() => ciRelease.validateReleaseConfig({ ...valid, version: 'latest' }), /semver/);
});

test('主机渲染只输出规范化 https 源站，不输出秘密', () => {
  assert.equal(
    ciRelease.renderHostConfig('https://erp.example.com/'),
    'module.exports = { bingxiHost: "https://erp.example.com" };\n'
  );
});

test('preview 调 packNpm 与 preview，输出二维码和安全结果，不调 upload', async t => {
  const calls = [];
  const options = releaseOptions(t, {
    ci: {
      async packNpm(project, settings) {
        calls.push(['packNpm', project.options.appid, settings.reporter]);
        return [];
      },
      async preview(settings) {
        calls.push(['preview', settings.robot, settings.qrcodeFormat]);
        fs.writeFileSync(settings.qrcodeOutputDest, 'png');
        return { subPackageInfo: [] };
      },
      async upload() {
        calls.push(['upload']);
      },
    },
  });
  const result = await ciRelease.runRelease(options);
  assert.equal(result.mode, 'preview');
  assert.equal(result.onlineReleasePerformed, false);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].slice(0, 2), ['packNpm', 'wx9fc2137059cd96d0']);
  assert.deepEqual(calls[1], ['preview', 1, 'image']);
  assert.equal(fs.existsSync(path.join(options.output, 'preview-qrcode.png')), true);
  assert.equal(fs.existsSync(path.join(options.output, 'wechat-ci-result.json')), true);
});

test('upload 仅在显式 upload 模式调用，不执行线上发布 API', async t => {
  const calls = [];
  const options = releaseOptions(t, {
    mode: 'upload',
    ci: {
      async packNpm() {
        return [];
      },
      async preview() {
        calls.push('preview');
      },
      async upload(settings) {
        calls.push(['upload', settings.version, settings.robot]);
        return {};
      },
    },
  });
  const result = await ciRelease.runRelease(options);
  assert.deepEqual(calls, [['upload', '3.13.10', 1]]);
  assert.equal(result.onlineReleasePerformed, false);
});

test('packNpm 任一 warning 都失败并阻止 preview/upload', async t => {
  let called = false;
  const options = releaseOptions(t, {
    ci: {
      async packNpm() {
        return [{ code: 'WARN', msg: 'missing declaration', jsPath: 'a.js' }];
      },
      async preview() {
        called = true;
      },
    },
  });
  await assert.rejects(ciRelease.runRelease(options), /PACK_NPM_WARNING.*missing declaration/);
  assert.equal(called, false);
});

test('旧 /app-api 未清零时 upload 硬阻断，preview 仍可生成受控验证码', async t => {
  const blocked = releaseOptions(t, {
    mode: 'upload',
    manifest: manifest({
      legacyEndpoints: { count: 12 },
      releaseReadiness: { uploadAllowed: false },
    }),
  });
  await assert.rejects(ciRelease.runRelease(blocked), /UPLOAD_BLOCKED legacy/);
  const preview = releaseOptions(t, {
    manifest: manifest({
      legacyEndpoints: { count: 12 },
      releaseReadiness: { uploadAllowed: false },
    }),
  });
  assert.equal((await ciRelease.runRelease(preview)).mode, 'preview');
});

test('preview 未生成二维码时失败，不产出假成功结果', async t => {
  const options = releaseOptions(t, {
    ci: {
      async packNpm() {
        return [];
      },
      async preview() {
        return {};
      },
    },
  });
  await assert.rejects(ciRelease.runRelease(options), /未生成二维码/);
  assert.equal(fs.existsSync(path.join(options.output, 'wechat-ci-result.json')), false);
});

test('execute 缺秘密时立即失败且不创建密钥文件', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-ci-missing-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const projectPath = path.join(dir, 'miniprogram');
  const output = path.join(dir, 'output');
  fs.mkdirSync(projectPath, { recursive: true });
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    path.join(projectPath, 'project.config.json'),
    JSON.stringify({ appid: 'wx9fc2137059cd96d0' })
  );
  fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify({ version: '3.13.10' }));
  fs.writeFileSync(path.join(output, 'release-manifest.json'), JSON.stringify(manifest()));
  await assert.rejects(
    ciRelease.execute(
      ['--mode', 'preview', '--version', '3.13.10', '--robot', '1', '--desc', 'test'],
      { RUNNER_TEMP: dir }
    ),
    /PRIVATE_KEY|BINGXI_HOST/
  );
  assert.equal(fs.existsSync(path.join(dir, 'wechat-miniprogram-private.key')), false);
});

test('CI 强制小程序运行时依赖审计与源码产物', () => {
  const workflow = fs.readFileSync(
    path.join(REPO_ROOT, '.github', 'workflows', 'miniprogram-checks.yml'),
    'utf8'
  );
  assert.match(workflow, /npm --prefix miniprogram audit --omit=dev --audit-level=high/);
  assert.match(workflow, /npm --prefix miniprogram test/);
  assert.match(workflow, /node scripts\/ci\/miniprogram-release\.cjs \\\n\s+--version/);
  assert.doesNotMatch(workflow, /miniprogram-release\.cjs package/);
  assert.match(workflow, /if-no-files-found: error/);
});

test('execute 在 finally 删除私钥并移除本次生成的本地主机文件', async t => {
  const options = releaseOptions(t);
  fs.writeFileSync(
    path.join(options.projectPath, 'package.json'),
    JSON.stringify({ version: '3.13.10' })
  );
  fs.writeFileSync(
    path.join(options.projectPath, 'project.config.json'),
    JSON.stringify(manifest())
  );
  fs.writeFileSync(path.join(options.output, 'release-manifest.json'), JSON.stringify(manifest()));
  fs.rmSync(path.join(options.projectPath, 'mpHost.local.js'));
  const runnerTemp = path.join(options.root, 'runner');
  fs.mkdirSync(runnerTemp);
  const result = await ciRelease.execute(
    [
      '--root',
      options.root,
      '--project',
      'miniprogram',
      '--output',
      'output',
      '--mode',
      'preview',
      '--version',
      '3.13.10',
      '--robot',
      '1',
      '--desc',
      'test',
    ],
    {
      RUNNER_TEMP: runnerTemp,
      WECHAT_MINIPROGRAM_PRIVATE_KEY: 'unit-test-key',
      BINGXI_HOST: 'https://erp.example.com',
    },
    { ci: options.ci, Project: options.Project }
  );
  assert.equal(result.mode, 'preview');
  assert.equal(fs.existsSync(path.join(runnerTemp, 'wechat-miniprogram-private.key')), false);
  assert.equal(fs.existsSync(path.join(options.projectPath, 'mpHost.local.js')), false);
});
