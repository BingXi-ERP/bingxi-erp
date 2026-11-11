#!/usr/bin/env node
/**
 * e2e 全量钩子里绑 test 作用域 fixture 的静态门（纯 Node，零依赖）。
 *
 * 判据：Playwright 的 page 与 context 是按用例创建的对象，在 beforeAll 与 afterAll 形参里
 * 解构它们会在收集阶段直接抛错，整档用例一条都不跑（现象是 1 failed 加若干 did not run，
 * 而 tsc 与 --list 全绿，CI 上只有真跑起来才暴露）。合法的形参是 worker 作用域的 browser、
 * playwright 与本仓库自定义的 workerSession；清理与建数据需要页面时在钩子内
 * browser.newContext() 自造，或把前置改到首个用例里懒建。
 *
 * 只解析钩子紧跟的那一个形参解构块，不扫钩子体，因此体内叫 page 的局部变量与
 * beforeEach 与 afterEach 里的 page 都不算命中。
 *
 * 用法：node scripts/check-e2e-hook-fixture.mjs [--self-test]
 * 退出码：0 无违规，1 有违规或自证失败，2 扫描根缺失。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = dirname(SCRIPT_DIR);
const E2E_ROOT = join(FRONTEND_ROOT, 'e2e');

/** 钩子里禁止出现的 test 作用域 fixture 名（Playwright 逐名报错的那三个） */
const FORBIDDEN = new Set(['page', 'context', 'request']);
/** 全量钩子里合法的形参名：worker 作用域 fixture 与不占位的空解构 */
const ALLOWED_NOTE = 'browser playwright workerSession';

const HOOK_RE = /\.(beforeAll|afterAll)\s*\(\s*async?\s*\(/g;

function collectSpecFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectSpecFiles(full));
    } else if (entry.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out.sort();
}

/** 从钩子形参的左花括号起按配对取整个解构块，取不到（非解构形参）返回 null */
function readDestructure(text, openBrace) {
  if (text[openBrace] !== '{') {
    return null;
  }
  let depth = 0;
  for (let i = openBrace; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(openBrace + 1, i);
    }
  }
  return null;
}

/** 解构块里的顶层属性名集合（含 foo: alias 形式的 foo，忽略嵌套层与默认值表达式） */
function topLevelKeys(destructure) {
  const keys = [];
  let depth = 0;
  let exprDepth = 0;
  let inExpr = false;
  let token = '';
  const push = () => {
    const name = token.split(':')[0].trim();
    if (/^[A-Za-z_$][\w$]*$/.test(name)) keys.push(name);
    token = '';
  };
  for (const ch of destructure) {
    const opener = ch === '{' || ch === '[' || ch === '(';
    const closer = ch === '}' || ch === ']' || ch === ')';
    if (inExpr) {
      // 默认值表达式内部整体丢弃，括号配平后在顶层逗号处回到下一个参数位
      if (opener) exprDepth += 1;
      else if (closer) {
        if (exprDepth > 0) exprDepth -= 1;
      } else if (exprDepth === 0 && ch === ',') inExpr = false;
      continue;
    }
    if (opener) depth += 1;
    else if (closer) depth -= 1;
    if (depth === 0 && (ch === ',' || ch === '\n')) {
      push();
      continue;
    }
    if (depth === 0 && ch === '=') {
      push();
      inExpr = true;
      continue;
    }
    token += ch;
  }
  push();
  return keys;
}

/** 扫一份源码，返回违规清单 */
function scanText(text) {
  const hits = [];
  HOOK_RE.lastIndex = 0;
  for (let m = HOOK_RE.exec(text); m !== null; m = HOOK_RE.exec(text)) {
    const paren = m.index + m[0].length - 1;
    const openBrace = text.indexOf('{', paren);
    if (openBrace < 0 || openBrace - paren > 2) {
      // 形参不是解构块（如 test.afterAll(async () => {})），无 fixture 可绑
      continue;
    }
    const inner = readDestructure(text, openBrace);
    if (inner === null) continue;
    for (const key of topLevelKeys(inner)) {
      if (FORBIDDEN.has(key)) {
        hits.push({
          line: text.slice(0, m.index).split('\n').length,
          hook: m[1],
          fixture: key,
        });
      }
    }
  }
  return hits;
}

function selfTest() {
  const cases = [
    { name: 'afterAll 绑 page', src: "test.afterAll(async ({ page }) => {\n  await page.goto('x');\n});\n", expect: 1 },
    { name: 'beforeAll 绑 context', src: 'test.beforeAll(async ({ context }) => {});\n', expect: 1 },
    { name: 'beforeAll 重命名绑 page', src: 'test.beforeAll(async ({ page: p, browser }) => {});\n', expect: 1 },
    { name: '默认值后仍有非法形参', src: 'test.afterAll(async ({ ctx = 1, context }) => {});\n', expect: 1 },
    { name: 'afterAll 绑 browser', src: 'test.afterAll(async ({ browser }) => {\n  const page = await browser.newPage();\n});\n', expect: 0 },
    { name: 'afterEach 绑 page 合法', src: 'test.afterEach(async ({ page }) => {});\n', expect: 0 },
    { name: '钩子无解构形参', src: 'test.beforeAll(async () => {});\n', expect: 0 },
    { name: '嵌套解构不误报', src: 'test.afterAll(async ({ browser, workerSession }) => {});\n', expect: 0 },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = scanText(c.src).length;
    const ok = got === c.expect;
    if (!ok) failed += 1;
    console.log(`[self-test] ${ok ? 'PASS' : 'FAIL'} ${c.name} 期望命中 ${c.expect} 实际 ${got}`);
  }
  console.log(`[self-test] 用例 ${cases.length} 条，失败 ${failed} 条；合法形参白名单 ${ALLOWED_NOTE}`);
  if (failed > 0) {
    console.error('[check-e2e-hook-fixture] TOOL_BUG 判定器自证失败，禁止以主门 0 命中当作通过');
    return 1;
  }
  return 0;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    process.exit(selfTest());
  }
  let files;
  try {
    files = collectSpecFiles(E2E_ROOT);
  } catch {
    console.error(`[check-e2e-hook-fixture] TOOL_BUG 扫描根不可读：${E2E_ROOT}`);
    process.exit(2);
  }
  const report = [];
  for (const file of files) {
    const hits = scanText(readFileSync(file, 'utf8'));
    for (const h of hits) {
      report.push(
        `${relative(FRONTEND_ROOT, file)}:${h.line} ${h.hook} 形参绑了 test 作用域 fixture ${h.fixture}`
      );
    }
  }
  console.log(`[check-e2e-hook-fixture] 扫描 spec ${files.length} 份，违规 ${report.length} 处`);
  for (const line of report) {
    console.error(`::error::${line}`);
  }
  if (report.length > 0) {
    console.error(
      `[check-e2e-hook-fixture] 判负：全量钩子里 ${ALLOWED_NOTE} 之外没有可注入的 page，改为钩子内 browser.newContext() 自造或把前置挪进用例`
    );
    process.exit(1);
  }
  console.log('[check-e2e-hook-fixture] 锁绿：全量钩子零 test 作用域 fixture 绑定');
}

main();
