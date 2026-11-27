#!/usr/bin/env node
/**
 * 迁移文件注册集合完整性门禁。
 *
 * 校验 Rust 迁移模块的文件集合、mod 声明集合与 MigratorTrait 运行链三者一致，
 * 并核对每支子迁移在 up/down 链中只执行一次。支持跨域调用、pub(crate) 声明、
 * 迁移再导出与 lib.rs 直接登记四种现行注册形态。
 *
 * 用法：
 *   node frontend/scripts/check-migration-registration.mjs
 *   node frontend/scripts/check-migration-registration.mjs --self-test
 *
 * --self-test 用真实判定函数执行干净样例与逐类变异，证明漏登记、重复执行和
 * 空解析都会判负。默认模式先跑同一组自证，再扫描 backend/migration/src。
 */
import { readFileSync, readdirSync } from 'fs';
import { dirname, join, relative, resolve, sep } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, '..', '..');
export const MIGRATION_SRC = join(REPO, 'backend', 'migration', 'src');

function fixture() {
  return new Map([
    [
      'lib.rs',
      `pub mod domain;
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![Box::new(domain::alpha::Migration)]
    }
}
`,
    ],
    ['domain/mod.rs', 'pub mod alpha;\n'],
    [
      'domain/alpha/mod.rs',
      `mod m0001_seed;
pub struct Migration;
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0001_seed::Migration.up(manager).await?;
        Ok(())
    }
    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0001_seed::Migration.down(manager).await?;
        Ok(())
    }
}
`,
    ],
    [
      'domain/alpha/m0001_seed.rs',
      `pub struct Migration;
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> { Ok(()) }
    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> { Ok(()) }
}
`,
    ],
  ]);
}

function replace(source, from, to) {
  if (!source.includes(from)) throw new Error(`夹具锚点不存在: ${from}`);
  return source.replace(from, to);
}

export function migrationRegistrationSelfProof() {
  const cases = [];
  const add = (name, mutate, expectRules) => {
    const sources = fixture();
    mutate(sources);
    const result = auditSourceSet(sources);
    const rules = new Set(result.findings.map(f => f.rule));
    const missed = expectRules.filter(rule => !rules.has(rule));
    const unexpected = expectRules.length === 0 && result.findings.length > 0;
    if (unexpected || missed.length > 0) {
      cases.push({
        name,
        ok: false,
        detail: `期望${expectRules.length ? `命中 ${expectRules.join('/')}` : '零发现'}，实际 ${result.findings.length} 条；缺失 ${missed.join('/') || '无'}；${result.findings.map(f => `${f.rule}:${f.message}`).join('；')}`,
      });
    } else {
      cases.push({ name, ok: true, detail: result.findings.map(f => f.rule).join(',') });
    }
  };

  const clean = auditSourceSet(fixture());
  cases.push({
    name: '干净样例不误伤',
    ok: clean.findings.length === 0,
    detail: clean.findings.map(f => `${f.rule}:${f.message}`).join('；') || '0 条发现',
  });
  const emptyParse = auditSourceSet(new Map(), { enforceDetectionFloors: true });
  cases.push({
    name: '空解析不能冒充绿灯',
    ok: emptyParse.findings.some(f => f.rule === 'PARSER_DETECTION_FLOOR'),
    detail: emptyParse.findings.map(f => f.rule).join(',') || '0 条发现',
  });
  add(
    '根域 mod 声明缺失',
    s => {
      s.set('lib.rs', replace(s.get('lib.rs'), 'pub mod domain;', ''));
    },
    ['MODULE_NOT_DECLARED']
  );
  add(
    '漏写子迁移 mod 声明',
    s => {
      s.set('domain/alpha/mod.rs', replace(s.get('domain/alpha/mod.rs'), 'mod m0001_seed;', ''));
    },
    ['MODULE_NOT_DECLARED']
  );
  add(
    '保留指向不存在文件的 mod 声明',
    s => {
      s.set(
        'domain/alpha/mod.rs',
        replace(s.get('domain/alpha/mod.rs'), 'mod m0001_seed;', 'mod missing;')
      );
    },
    ['MODULE_TARGET_MISSING']
  );
  add(
    '顶层域未进入 MigratorTrait',
    s => {
      s.set(
        'lib.rs',
        replace(
          s.get('lib.rs'),
          'Box::new(domain::alpha::Migration)',
          'Box::new(domain::other::Migration)'
        )
      );
    },
    ['MIGRATION_NOT_REGISTERED', 'MIGRATION_TARGET_UNKNOWN']
  );
  add(
    'lib.rs 重复登记同一迁移',
    s => {
      s.set(
        'lib.rs',
        replace(
          s.get('lib.rs'),
          'vec![Box::new(domain::alpha::Migration)]',
          'vec![Box::new(domain::alpha::Migration), Box::new(domain::alpha::Migration)]'
        )
      );
    },
    ['MIGRATION_DUPLICATE_REGISTRATION']
  );
  add(
    '子迁移漏接 up 链',
    s => {
      s.set(
        'domain/alpha/mod.rs',
        replace(s.get('domain/alpha/mod.rs'), 'm0001_seed::Migration.up(manager).await?;', 'Ok(())')
      );
    },
    ['MIGRATION_CALL_MISSING']
  );
  add(
    '子迁移漏接 down 链',
    s => {
      s.set(
        'domain/alpha/mod.rs',
        replace(
          s.get('domain/alpha/mod.rs'),
          'm0001_seed::Migration.down(manager).await?;',
          'Ok(())'
        )
      );
    },
    ['MIGRATION_CALL_MISSING']
  );
  add(
    '子迁移在 up 链重复执行',
    s => {
      s.set(
        'domain/alpha/mod.rs',
        replace(
          s.get('domain/alpha/mod.rs'),
          'm0001_seed::Migration.up(manager).await?;',
          'm0001_seed::Migration.up(manager).await?;\n        m0001_seed::Migration.up(manager).await?;'
        )
      );
    },
    ['MIGRATION_CALL_DUPLICATE']
  );
  add(
    '子迁移在 down 链重复执行',
    s => {
      s.set(
        'domain/alpha/mod.rs',
        replace(
          s.get('domain/alpha/mod.rs'),
          'm0001_seed::Migration.down(manager).await?;',
          'm0001_seed::Migration.down(manager).await?;\n        m0001_seed::Migration.down(manager).await?;'
        )
      );
    },
    ['MIGRATION_CALL_DUPLICATE']
  );
  add(
    '注释里的假登记不参与判定',
    s => {
      s.set(
        'lib.rs',
        replace(
          s.get('lib.rs'),
          'pub mod domain;',
          '// mod ghost;\n// Box::new(domain::ghost::Migration)\npub mod domain;'
        )
      );
    },
    []
  );
  add(
    '字符串里的假登记不参与判定',
    s => {
      s.set(
        'lib.rs',
        replace(
          s.get('lib.rs'),
          'pub mod domain;',
          'const FAKE: &str = r#"mod ghost; Box::new(domain::ghost::Migration)"#;\npub mod domain;'
        )
      );
    },
    []
  );
  add(
    'pub(crate) mod 是合法声明',
    s => {
      s.set(
        'domain/alpha/mod.rs',
        replace(s.get('domain/alpha/mod.rs'), 'mod m0001_seed;', 'pub(crate) mod m0001_seed;')
      );
    },
    []
  );
  add(
    '再导出的子迁移可由父域直接登记',
    s => {
      s.set('domain/alpha/mod.rs', 'mod m0001_seed;\npub use m0001_seed::Migration;\n');
    },
    []
  );
  add(
    '再导出不能指向不存在的迁移',
    s => {
      s.set('domain/alpha/mod.rs', 'mod m0001_seed;\npub use ghost::Migration;\n');
    },
    ['MIGRATION_REEXPORT_TARGET_UNKNOWN']
  );
  add(
    'lib.rs 可直接登记嵌套子迁移',
    s => {
      s.set('domain/alpha/mod.rs', 'pub mod m0001_seed;\n');
      s.set(
        'lib.rs',
        replace(s.get('lib.rs'), 'domain::alpha::Migration', 'domain::alpha::m0001_seed::Migration')
      );
    },
    []
  );
  add(
    '跨域全路径调用可解析',
    s => {
      s.set('domain/mod.rs', 'pub mod alpha;\npub mod beta;\n');
      s.set('domain/beta/mod.rs', 'pub(crate) mod m0002_seed;\n');
      s.set('domain/beta/m0002_seed.rs', s.get('domain/alpha/m0001_seed.rs'));
      s.set('domain/alpha/mod.rs', replace(s.get('domain/alpha/mod.rs'), 'mod m0001_seed;\n', ''));
      s.set(
        'domain/alpha/mod.rs',
        replace(
          s.get('domain/alpha/mod.rs'),
          'm0001_seed::Migration.up(manager).await?;',
          'crate::domain::beta::m0002_seed::Migration.up(manager).await?;'
        )
      );
      s.set(
        'domain/alpha/mod.rs',
        replace(
          s.get('domain/alpha/mod.rs'),
          'm0001_seed::Migration.down(manager).await?;',
          'crate::domain::beta::m0002_seed::Migration.down(manager).await?;'
        )
      );
      s.delete('domain/alpha/m0001_seed.rs');
    },
    []
  );
  return cases;
}

function stripRustNoise(source) {
  let out = '';
  let i = 0;
  const blank = text => text.replace(/[^\r\n]/g, ' ');
  while (i < source.length) {
    if (source.startsWith('//', i)) {
      const end = source.indexOf('\n', i + 2);
      const stop = end === -1 ? source.length : end;
      out += blank(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (source.startsWith('/*', i)) {
      const start = i;
      let depth = 1;
      i += 2;
      while (i < source.length && depth > 0) {
        if (source.startsWith('/*', i)) {
          depth += 1;
          i += 2;
        } else if (source.startsWith('*/', i)) {
          depth -= 1;
          i += 2;
        } else {
          i += 1;
        }
      }
      out += blank(source.slice(start, i));
      continue;
    }

    let stringStart = i;
    if (source[i] === 'b' && source[i + 1] === 'r') stringStart = i + 1;
    if (source[stringStart] === 'r') {
      let cursor = stringStart + 1;
      let hashes = 0;
      while (source[cursor] === '#') {
        hashes += 1;
        cursor += 1;
      }
      if (source[cursor] === '"') {
        const endMarker = `"${'#'.repeat(hashes)}`;
        const end = source.indexOf(endMarker, cursor + 1);
        const stop = end === -1 ? source.length : end + endMarker.length;
        out += blank(source.slice(i, stop));
        i = stop;
        continue;
      }
    }

    if (source[i] === '"') {
      const start = i;
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') i += 2;
        else if (source[i] === '"') {
          i += 1;
          break;
        } else i += 1;
      }
      out += blank(source.slice(start, i));
      continue;
    }
    if (source[i] === "'") {
      let cursor = i + 1;
      if (source[cursor] === '\\') {
        cursor += 2;
        if (source[cursor - 1] === 'u' && source[cursor] === '{') {
          cursor += 1;
          while (cursor < source.length && source[cursor] !== '}') cursor += 1;
          if (source[cursor] === '}') cursor += 1;
        }
      } else {
        cursor += 1;
      }
      if (source[cursor] === "'") {
        out += blank(source.slice(i, cursor + 1));
        i = cursor + 1;
        continue;
      }
    }
    out += source[i];
    i += 1;
  }
  return out;
}

function canonicalPath(path) {
  return path.replace(/\s+/g, '').replace(/^crate::/, '');
}

function modulePathForFile(file) {
  if (file === 'lib.rs') return '';
  const parts = file.split('/');
  const last = parts.pop();
  if (last !== 'mod.rs') parts.push(last.slice(0, -3));
  return parts.join('::');
}

function moduleDirectory(ownerFile) {
  if (ownerFile === 'lib.rs') return '';
  return ownerFile.endsWith('/mod.rs')
    ? ownerFile.slice(0, -'/mod.rs'.length)
    : ownerFile.slice(0, -3);
}

function resolveModuleFile(ownerFile, name, sources) {
  const directory = moduleDirectory(ownerFile);
  const prefix = directory ? `${directory}/` : '';
  const direct = `${prefix}${name}.rs`;
  const nested = `${prefix}${name}/mod.rs`;
  if (sources.has(direct) && sources.has(nested))
    return { target: null, ambiguous: [direct, nested] };
  if (sources.has(direct)) return { target: direct, ambiguous: [] };
  if (sources.has(nested)) return { target: nested, ambiguous: [] };
  return { target: null, ambiguous: [] };
}

function resolveMigrationPath(rawPath, currentModule) {
  let path = canonicalPath(rawPath);
  if (path.startsWith('domain::')) return path;
  if (path === 'self') return currentModule;
  if (path.startsWith('self::'))
    return currentModule ? `${currentModule}::${path.slice(6)}` : path.slice(6);
  if (path === 'super' || path.startsWith('super::')) {
    const suffix = path === 'super' ? '' : path.slice(7);
    const parts = currentModule.split('::').filter(Boolean);
    parts.pop();
    return suffix ? `${parts.join('::')}::${suffix}` : parts.join('::');
  }
  return currentModule ? `${currentModule}::${path}` : path;
}

export function auditSourceSet(sources, options = {}) {
  const findings = [];
  const add = (rule, file, message, line = null) => findings.push({ rule, file, line, message });
  const codeByFile = new Map();
  const moduleFileByPath = new Map();
  for (const [inputFile, source] of sources) {
    const file = inputFile.replaceAll('\\', '/');
    const code = stripRustNoise(source);
    codeByFile.set(file, code);
    const modulePath = modulePathForFile(file);
    if (moduleFileByPath.has(modulePath)) {
      add(
        'MODULE_PATH_AMBIGUOUS',
        file,
        `模块路径 ${modulePath} 同时对应 ${moduleFileByPath.get(modulePath)} 与 ${file}`
      );
    } else {
      moduleFileByPath.set(modulePath, file);
    }
  }

  const migrationImplementations = new Set();
  for (const [file, code] of codeByFile) {
    if (/\bimpl\s+MigrationTrait\s+for\s+Migration\b/.test(code))
      migrationImplementations.add(file);
  }

  const declarations = [];
  const declaredTargets = new Map();
  const declarationsByOwner = new Map();
  for (const [file, code] of codeByFile) {
    const modulePattern = /\b((?:pub(?:\s*\([^)]*\))?\s+)?mod)\s+([A-Za-z_]\w*)\s*;/g;
    for (const match of code.matchAll(modulePattern)) {
      const name = match[2];
      const line = code.slice(0, match.index).split('\n').length;
      const { target, ambiguous } = resolveModuleFile(file, name, codeByFile);
      if (ambiguous.length) {
        add(
          'MODULE_TARGET_AMBIGUOUS',
          file,
          `mod ${name} 同时匹配 ${ambiguous.join(' 与 ')}`,
          line
        );
        continue;
      }
      if (!target) {
        add('MODULE_TARGET_MISSING', file, `mod ${name} 没有对应 .rs 或 mod.rs 文件`, line);
        continue;
      }
      const declaration = { owner: file, target, name, line };
      declarations.push(declaration);
      if (declaredTargets.has(target)) {
        add('MODULE_DUPLICATE_DECLARATION', file, `mod ${name} 重复声明 ${target}`, line);
      } else {
        declaredTargets.set(target, declaration);
      }
      if (!declarationsByOwner.has(file)) declarationsByOwner.set(file, []);
      declarationsByOwner.get(file).push(declaration);
    }
  }

  for (const file of codeByFile.keys()) {
    if (file !== 'lib.rs' && !declaredTargets.has(file)) {
      add('MODULE_NOT_DECLARED', file, 'Rust 模块文件没有对应 mod 声明');
    }
  }

  const reexportsByModule = new Map();
  for (const [file, code] of codeByFile) {
    const parentModule = modulePathForFile(file);
    const reexportPattern = /\bpub\s+use\s+([A-Za-z_]\w*)\s*::\s*Migration\s*;/g;
    for (const match of code.matchAll(reexportPattern)) {
      const childPath = resolveMigrationPath(match[1], parentModule);
      const target = moduleFileByPath.get(childPath);
      if (!target) {
        add('MIGRATION_REEXPORT_TARGET_UNKNOWN', file, `再导出目标 ${childPath}::Migration 不存在`);
      } else if (!migrationImplementations.has(target)) {
        add(
          'MIGRATION_REEXPORT_TARGET_NOT_MIGRATION',
          file,
          `再导出目标 ${childPath} 不实现 MigrationTrait`
        );
      } else {
        reexportsByModule.set(parentModule, childPath);
      }
    }
  }
  const providesMigration = file =>
    migrationImplementations.has(file) || reexportsByModule.has(modulePathForFile(file));

  const libCode = codeByFile.get('lib.rs') || '';
  const registrationPattern =
    /\bBox\s*::\s*new\s*\(\s*((?:crate\s*::\s*)?domain(?:\s*::\s*[A-Za-z_]\w*)+)\s*::\s*Migration\s*\)/g;
  const registrations = [];
  for (const match of libCode.matchAll(registrationPattern)) {
    const modulePath = canonicalPath(match[1]);
    registrations.push({ modulePath, line: libCode.slice(0, match.index).split('\n').length });
  }
  const registrationCounts = new Map();
  for (const registration of registrations) {
    registrationCounts.set(
      registration.modulePath,
      (registrationCounts.get(registration.modulePath) || 0) + 1
    );
    const target = moduleFileByPath.get(registration.modulePath);
    if (!target)
      add(
        'MIGRATION_TARGET_UNKNOWN',
        'lib.rs',
        `登记目标 ${registration.modulePath}::Migration 不存在`,
        registration.line
      );
    else if (!providesMigration(target))
      add(
        'MIGRATION_TARGET_NOT_MIGRATION',
        'lib.rs',
        `登记目标 ${registration.modulePath} 不提供 Migration`,
        registration.line
      );
    else if (!declaredTargets.has(target))
      add(
        'MIGRATION_TARGET_NOT_DECLARED',
        'lib.rs',
        `登记目标 ${registration.modulePath} 没有 mod 声明`,
        registration.line
      );
  }
  for (const [modulePath, count] of registrationCounts) {
    if (count > 1)
      add(
        'MIGRATION_DUPLICATE_REGISTRATION',
        'lib.rs',
        `${modulePath}::Migration 被登记 ${count} 次`
      );
  }

  const domainModules = new Set();
  for (const declaration of declarationsByOwner.get('domain/mod.rs') || []) {
    if (providesMigration(declaration.target)) {
      const modulePath = modulePathForFile(declaration.target);
      domainModules.add(modulePath);
      if (!registrationCounts.has(modulePath)) {
        add(
          'MIGRATION_NOT_REGISTERED',
          declaration.owner,
          `顶层迁移域 ${modulePath} 未进入 MigratorTrait`,
          declaration.line
        );
      }
    }
  }

  const callsByPath = new Map();
  const callPattern =
    /((?:crate|self|super)?(?:\s*::\s*[A-Za-z_]\w*)+|[A-Za-z_]\w*)\s*::\s*Migration\s*\.\s*(up|down)\s*\(/g;
  let runtimeCalls = 0;
  for (const [file, code] of codeByFile) {
    const currentModule = modulePathForFile(file);
    for (const match of code.matchAll(callPattern)) {
      runtimeCalls += 1;
      const path = resolveMigrationPath(match[1], currentModule);
      const direction = match[2];
      const line = code.slice(0, match.index).split('\n').length;
      if (!callsByPath.has(path)) callsByPath.set(path, { up: [], down: [] });
      callsByPath.get(path)[direction].push({ file, line });
      const target = moduleFileByPath.get(path);
      if (!target)
        add('MIGRATION_CALL_TARGET_UNKNOWN', file, `${direction} 调用目标 ${path} 不存在`, line);
      else if (!migrationImplementations.has(target))
        add(
          'MIGRATION_CALL_TARGET_NOT_MIGRATION',
          file,
          `${direction} 调用目标 ${path} 不实现 MigrationTrait`,
          line
        );
    }
  }

  const reexportParents = new Map();
  for (const [parent, child] of reexportsByModule) reexportParents.set(child, parent);
  for (const file of migrationImplementations) {
    const modulePath = modulePathForFile(file);
    if (!modulePath) continue;
    if (registrationCounts.has(modulePath)) continue;
    const parent = reexportParents.get(modulePath);
    if (parent && registrationCounts.has(parent)) continue;
    const calls = callsByPath.get(modulePath) || { up: [], down: [] };
    if (calls.up.length !== 1 || calls.down.length !== 1) {
      add(
        'MIGRATION_CALL_MISSING',
        file,
        `${modulePath} 未直接登记或经父域再导出，且 up/down 调用次数为 ${calls.up.length}/${calls.down.length}，应为 1/1`
      );
    }
    if (calls.up.length > 1)
      add('MIGRATION_CALL_DUPLICATE', file, `${modulePath} 的 up 被调用 ${calls.up.length} 次`);
    if (calls.down.length > 1)
      add('MIGRATION_CALL_DUPLICATE', file, `${modulePath} 的 down 被调用 ${calls.down.length} 次`);
  }

  if (options.enforceDetectionFloors ?? codeByFile.size > 20) {
    const floors = [
      ['rustFiles', codeByFile.size, 100],
      ['migrationImplementations', migrationImplementations.size, 100],
      ['domainModules', domainModules.size, 50],
      ['registrations', registrations.length, 50],
    ];
    for (const [name, actual, minimum] of floors) {
      if (actual < minimum)
        add(
          'PARSER_DETECTION_FLOOR',
          'backend/migration/src',
          `${name} 仅识别 ${actual} 项，低于防空解析下限 ${minimum}`
        );
    }
  }

  findings.sort((a, b) =>
    `${a.file}\0${a.line || 0}\0${a.rule}\0${a.message}`.localeCompare(
      `${b.file}\0${b.line || 0}\0${b.rule}\0${b.message}`
    )
  );
  return {
    findings,
    stats: {
      rustFiles: codeByFile.size,
      migrationImplementations: migrationImplementations.size,
      domainModules: domainModules.size,
      registrations: registrations.length,
      moduleDeclarations: declarations.length,
      runtimeCalls,
    },
  };
}

export function collectMigrationSources(root = MIGRATION_SRC) {
  const out = new Map();
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith('.rs'))
        out.set(relative(root, file).split(sep).join('/'), readFileSync(file, 'utf8'));
    }
  };
  walk(root);
  return out;
}

export function checkMigrationRegistration() {
  const proof = migrationRegistrationSelfProof();
  const sources = collectMigrationSources();
  const result = auditSourceSet(sources);
  return { ...result, proof, ok: proof.every(c => c.ok) && result.findings.length === 0 };
}

export function printMigrationRegistrationReport(result) {
  console.log('=== check-migration-registration: 迁移文件/mod 声明/运行链集合一致性 ===');
  for (const c of result.proof)
    console.log(`${c.ok ? 'PASS' : 'FAIL'} self-test: ${c.name}（${c.detail}）`);
  if (!result.proof.every(c => c.ok)) {
    console.error('FAIL: 迁移注册判定器自证未过，拒绝扫描结果');
    return false;
  }
  console.log(
    `扫描 .rs ${result.stats.rustFiles}，迁移实现 ${result.stats.migrationImplementations}，顶层域 ${result.stats.domainModules}，lib 登记 ${result.stats.registrations}`
  );
  if (result.findings.length) {
    console.error(`\n[迁移注册] ${result.findings.length} 条不一致：`);
    for (const f of result.findings) console.error(`  - ${f.file}: ${f.rule} ${f.message}`);
    return false;
  }
  console.log('OK: 迁移文件、模块声明、MigratorTrait 登记与 up/down 调用集合完全一致。');
  return true;
}

function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--self-test')) {
    console.error(`FAIL: 未知参数 ${args.join(' ')}；只接受无参数或 --self-test`);
    process.exit(1);
  }
  if (args.includes('--self-test')) {
    const proof = migrationRegistrationSelfProof();
    for (const c of proof) console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.name}（${c.detail}）`);
    const failed = proof.filter(c => !c.ok).length;
    console.log(`self-test 结论：${proof.length - failed}/${proof.length} 通过`);
    process.exit(failed ? 1 : 0);
  }
  process.exit(printMigrationRegistrationReport(checkMigrationRegistration()) ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
