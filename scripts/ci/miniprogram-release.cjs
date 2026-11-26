#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const EXPECTED_APPID = 'wx9fc2137059cd96d0';
const EXCLUDED_DIRS = new Set(['node_modules', 'miniprogram_npm', '@babel', 'report', 'reports']);
const EXCLUDED_FILES = new Set(['mpHost.local.js', 'project.private.config.json']);
const SENSITIVE_SUFFIXES = ['.pem', '.key', '.crt', '.env'];

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error('未知参数：' + arg);
    const key = arg.slice(2);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error('参数缺值：' + arg);
    result[key] = value;
  }
  return result;
}

function validateVersion(version, packageVersion) {
  assert.ok(VERSION_PATTERN.test(version), 'version 必须是显式 semver');
  assert.equal(version, packageVersion, '发布 version 必须与 miniprogram/package.json 一致');
}

function isExcluded(relativePath) {
  const parts = relativePath.split('/');
  const basename = parts.pop();
  if (parts.some(part => EXCLUDED_DIRS.has(part))) return true;
  if (EXCLUDED_FILES.has(basename)) return true;
  if (basename === '.env' || basename.startsWith('.env.')) return true;
  if (/(?:^|[._-])(?:private[._-]?key|app[._-]?secret|credentials?)(?:[._-]|$)/i.test(basename)) {
    return true;
  }
  return SENSITIVE_SUFFIXES.some(suffix => basename.toLowerCase().endsWith(suffix));
}

function gitFiles(root) {
  return execFileSync('git', ['-C', root, 'ls-files', '-z', '--', 'miniprogram'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean)
    .sort();
}

function stripComments(source) {
  let output = '';
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (lineComment) {
      if (char === '\n') {
        lineComment = false;
        output += char;
      } else output += ' ';
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        output += '  ';
        i += 1;
      } else output += char === '\n' ? '\n' : ' ';
      continue;
    }
    if (quote) {
      output += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      output += char;
    } else if (char === '/' && next === '/') {
      lineComment = true;
      output += '  ';
      i += 1;
    } else if (char === '/' && next === '*') {
      blockComment = true;
      output += '  ';
      i += 1;
    } else output += char;
  }
  return output;
}

function scanLegacyEndpoints(sourceFiles) {
  const hits = [];
  for (const file of sourceFiles) {
    if (!file.relativePath.endsWith('.js')) continue;
    const source = stripComments(fs.readFileSync(file.fullPath, 'utf8'));
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      const literals = line.match(/(["'`])([^"'`\n]*\/app-api[^"'`\n]*)\1/g) || [];
      for (const literal of literals) {
        hits.push({
          file: 'miniprogram/' + file.relativePath,
          line: index + 1,
          path: literal.slice(1, -1),
        });
      }
    });
  }
  return hits;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function prepareSource(root, version, output) {
  const mpRoot = path.join(root, 'miniprogram');
  const pkg = JSON.parse(fs.readFileSync(path.join(mpRoot, 'package.json'), 'utf8'));
  validateVersion(version, pkg.version);
  const project = JSON.parse(fs.readFileSync(path.join(mpRoot, 'project.config.json'), 'utf8'));
  assert.equal(project.appid, EXPECTED_APPID, '工程 AppID 与发布白名单不一致');
  const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const tracked = gitFiles(root);
  assert.ok(tracked.length > 100, 'Git 跟踪的小程序源文件少于 100，拒绝生成空包');
  const included = [];
  const excluded = [];
  for (const relative of tracked) {
    const inner = relative.slice('miniprogram/'.length);
    if (isExcluded(inner)) {
      excluded.push(relative);
      continue;
    }
    const fullPath = path.join(root, relative);
    assert.ok(fs.statSync(fullPath).isFile(), '跟踪路径不是普通文件：' + relative);
    included.push({
      relativePath: inner,
      fullPath,
      bytes: fs.statSync(fullPath).size,
    });
  }
  const legacyEndpoints = scanLegacyEndpoints(included);
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'bingxi-miniprogram-source-'));
  const stageRoot = path.join(staging, 'miniprogram');
  fs.mkdirSync(stageRoot, { recursive: true });
  for (const file of included) {
    const destination = path.join(stageRoot, file.relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(file.fullPath, destination);
  }
  const dependencies = Object.fromEntries(
    Object.entries(Object.assign({}, pkg.dependencies, pkg.devDependencies)).sort(([a], [b]) =>
      a.localeCompare(b)
    )
  );
  const manifest = {
    schemaVersion: 1,
    artifactType: 'wechat-miniprogram-source-project',
    compiledPackage: false,
    notice: '源码工程包，不是微信编译后的 .wxapkg；miniprogram-ci 不返回可下载编译包路径。',
    commit,
    version,
    appid: project.appid,
    source: 'git-tracked-files',
    dependencies,
    fileCount: included.length,
    sourceBytes: included.reduce((sum, file) => sum + file.bytes, 0),
    excludedTrackedFiles: excluded,
    legacyEndpoints: {
      scope:
        'JavaScript string literals outside comments; static call sites, not runtime reachability',
      count: legacyEndpoints.length,
      samples: legacyEndpoints.slice(0, 20),
    },
    releaseReadiness: {
      previewAllowed: true,
      uploadAllowed: legacyEndpoints.length === 0,
      onlineReleaseAllowed: false,
      blockers:
        legacyEndpoints.length === 0
          ? ['微信 CI 实跑与受保护环境授权仍待验证；upload 不等于线上发布。']
          : [
              `存在 ${legacyEndpoints.length} 处旧 /app-api 字符串调用点，未完成端点迁移与真实链路验证。`,
              '微信 CI 实跑与受保护环境授权仍待验证；upload 不等于线上发布。',
            ],
    },
  };
  fs.writeFileSync(
    path.join(output, 'release-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    { mode: 0o644 }
  );
  return { staging, stageRoot, manifest };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function writeZipStored(directory, destination) {
  const files = [];
  (function walk(dir, prefix = '') {
    for (const entry of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      const relative = prefix + entry.name;
      if (entry.isDirectory()) walk(full, relative + '/');
      else if (entry.isFile()) files.push({ full, relative });
    }
  })(directory);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.relative);
    const data = fs.readFileSync(file.full);
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0x21, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0x21, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralBuffer = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  fs.writeFileSync(destination, Buffer.concat([...locals, centralBuffer, end]));
  return {
    fileCount: files.length,
    bytes: fs.statSync(destination).size,
    sha256: sha256(fs.readFileSync(destination)),
  };
}

function packageSource(root, version, output) {
  fs.mkdirSync(output, { recursive: true });
  const prepared = prepareSource(root, version, output);
  const shortSha = prepared.manifest.commit.slice(0, 12);
  const safeVersion = version.replace(/[^0-9A-Za-z.-]/g, '-');
  const zipName = `miniprogram-source-${safeVersion}-${shortSha}.zip`;
  const zipPath = path.join(output, zipName);
  try {
    const archive = writeZipStored(prepared.staging, zipPath);
    prepared.manifest.archive = { name: zipName, ...archive };
    fs.writeFileSync(
      path.join(output, 'release-manifest.json'),
      JSON.stringify(prepared.manifest, null, 2) + '\n'
    );
    return prepared.manifest;
  } finally {
    fs.rmSync(prepared.staging, { recursive: true, force: true });
  }
}

function main(argv) {
  const args = parseArgs(argv);
  const root = path.resolve(args.root || path.resolve(__dirname, '..', '..'));
  if (args.command !== 'package') throw new Error('仅支持 package 命令');
  const manifest = packageSource(root, args.version, path.resolve(args.output));
  console.log(
    `MP_SOURCE_PACKAGE_OK version=${manifest.version} commit=${manifest.commit} files=${manifest.fileCount} bytes=${manifest.archive.bytes} legacyEndpoints=${manifest.legacyEndpoints.count} uploadAllowed=${manifest.releaseReadiness.uploadAllowed}`
  );
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error('MP_SOURCE_PACKAGE_RED ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  EXPECTED_APPID,
  VERSION_PATTERN,
  isExcluded,
  scanLegacyEndpoints,
  stripComments,
  validateVersion,
  prepareSource,
  packageSource,
  writeZipStored,
};
