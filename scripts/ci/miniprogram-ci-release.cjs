#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EXPECTED_APPID, VERSION_PATTERN } = require('./miniprogram-release.cjs');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) throw new Error('未知参数：' + key);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error('参数缺值：' + key);
    args[key.slice(2)] = value;
  }
  return args;
}

function validateReleaseConfig({ mode, version, robot, desc, appid, privateKey }) {
  assert.ok(mode === 'preview' || mode === 'upload', 'mode 只能是 preview 或 upload');
  assert.ok(VERSION_PATTERN.test(version), 'version 必须是显式 semver');
  const robotNumber = Number(robot);
  assert.ok(
    Number.isInteger(robotNumber) && robotNumber >= 1 && robotNumber <= 30,
    'robot 必须是 1-30 整数'
  );
  assert.equal(typeof desc, 'string', 'desc 必须是字符串');
  assert.ok(desc.length > 0 && desc.length <= 200, 'desc 长度必须是 1-200');
  assert.equal(appid, EXPECTED_APPID, '工程 AppID 与发布白名单不一致');
  assert.ok(
    typeof privateKey === 'string' && privateKey.length > 0,
    '缺少 WECHAT_MINIPROGRAM_PRIVATE_KEY'
  );
  return { robot: robotNumber };
}

function sanitizedResult(mode, version, result) {
  return {
    mode,
    version,
    operation: mode === 'preview' ? 'preview' : 'upload',
    onlineReleasePerformed: false,
    subPackageInfo: Array.isArray(result.subPackageInfo) ? result.subPackageInfo : [],
    pluginInfo: Array.isArray(result.pluginInfo) ? result.pluginInfo : [],
  };
}

async function runRelease({
  ci,
  Project,
  root,
  projectPath,
  output,
  privateKeyPath,
  manifest,
  mode,
  version,
  robot,
  desc,
}) {
  const config = validateReleaseConfig({
    mode,
    version,
    robot,
    desc,
    appid: manifest.appid,
    privateKey: fs.readFileSync(privateKeyPath, 'utf8'),
  });
  assert.equal(manifest.version, version, 'manifest version 与发布入参不一致');
  assert.equal(manifest.compiledPackage, false, '源码包不得冒充编译包');
  if (mode === 'upload' && !manifest.releaseReadiness.uploadAllowed) {
    throw new Error(
      'UPLOAD_BLOCKED legacy /app-api 调用点尚未清零：' +
        manifest.legacyEndpoints.count +
        '；详见 release-manifest.json'
    );
  }
  const project = new Project({
    appid: EXPECTED_APPID,
    type: 'miniProgram',
    projectPath,
    privateKeyPath,
    ignores: ['node_modules/**/*'],
  });
  console.log(`MP_CI_BEGIN mode=${mode} version=${version} robot=${config.robot}`);
  const warnings = await ci.packNpm(project, {
    ignores: ['pack_npm_ignore_list'],
    reporter: () => {},
  });
  if (!Array.isArray(warnings)) throw new Error('packNpm 未返回 warning 数组，无法证明零警告');
  if (warnings.length > 0) {
    const warning = warnings[0];
    throw new Error(
      `PACK_NPM_WARNING code=${warning.code || 'unknown'} msg=${warning.msg || 'unknown'} path=${warning.jsPath || 'unknown'}`
    );
  }
  console.log('MP_PACK_NPM_OK warnings=0');
  fs.mkdirSync(output, { recursive: true });
  let result;
  if (mode === 'preview') {
    const qrcodeOutputDest = path.join(output, 'preview-qrcode.png');
    result = await ci.preview({
      project,
      desc,
      robot: config.robot,
      qrcodeFormat: 'image',
      qrcodeOutputDest,
    });
    assert.ok(fs.existsSync(qrcodeOutputDest), 'preview 未生成二维码文件');
    assert.ok(fs.statSync(qrcodeOutputDest).size > 0, 'preview 二维码为空文件');
  } else {
    result = await ci.upload({ project, version, desc, robot: config.robot });
  }
  const safe = sanitizedResult(mode, version, result);
  fs.writeFileSync(
    path.join(output, 'wechat-ci-result.json'),
    JSON.stringify(safe, null, 2) + '\n'
  );
  console.log(
    `MP_CI_OK mode=${mode} version=${version} onlineReleasePerformed=false${
      mode === 'preview' ? ' qrcode=preview-qrcode.png' : ''
    }`
  );
  return safe;
}

async function execute(argv, env, deps = {}) {
  const args = parseArgs(argv);
  const root = path.resolve(args.root || path.resolve(__dirname, '..', '..'));
  const projectPath = path.resolve(root, args.project || 'miniprogram');
  const output = path.resolve(root, args.output || 'miniprogram-release-output');
  const privateKey = env.WECHAT_MINIPROGRAM_PRIVATE_KEY;
  const projectConfig = JSON.parse(
    fs.readFileSync(path.join(projectPath, 'project.config.json'), 'utf8')
  );
  const packageConfig = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf8'));
  validateReleaseConfig({
    mode: args.mode,
    version: args.version,
    robot: args.robot,
    desc: args.desc,
    appid: projectConfig.appid,
    privateKey,
  });
  const manifest = JSON.parse(fs.readFileSync(path.join(output, 'release-manifest.json'), 'utf8'));
  assert.equal(args.version, packageConfig.version, '发布 version 与 package.json 不一致');
  assert.equal(args.desc, args.desc.trim(), 'desc 首尾不得含空白');
  const tempRoot = path.resolve(
    env.RUNNER_TEMP || fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'mp-ci-'))
  );
  fs.mkdirSync(tempRoot, { recursive: true });
  const privateKeyPath = path.join(tempRoot, 'wechat-miniprogram-private.key');
  try {
    fs.writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
    const ci = deps.ci || require(path.join(root, 'miniprogram', 'node_modules', 'miniprogram-ci'));
    const Project = deps.Project || ci.Project;
    return await runRelease({
      ci,
      Project,
      root,
      projectPath,
      output,
      privateKeyPath,
      manifest,
      mode: args.mode,
      version: args.version,
      robot: args.robot,
      desc: args.desc,
    });
  } finally {
    fs.rmSync(privateKeyPath, { force: true });
  }
}

if (require.main === module) {
  execute(process.argv.slice(2), process.env).catch(error => {
    const privateKey = process.env.WECHAT_MINIPROGRAM_PRIVATE_KEY;
    const message = privateKey ? error.message.split(privateKey).join('[REDACTED]') : error.message;
    console.error('MP_CI_RED ' + message);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  validateReleaseConfig,
  runRelease,
  execute,
  sanitizedResult,
};
