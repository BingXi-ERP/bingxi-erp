#!/usr/bin/env node
// miniapp 契约门禁：用 TypeScript Compiler API 解析源码，不执行被测工程代码。
// 业务红包含旧端点/旧分页键、未注册路径、不可解析调用与契约常量。
// 判定器异常（TOOL_BUG/DETECTOR_BLIND）退出 2，不得被当成绿。

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  analyzeSourceEntries,
  findForbiddenLegacyTokensInSource,
} from "./miniapp-contract-ast.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const API_BASE_PATH = "/api/v1/erp";
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "unpackage",
  "tests",
  "fixtures",
]);
const KNOWN_FLAGS = new Set(["--root", "--snapshot", "--self-test"]);

/** 路径归一化只处理快照键，不参与 JS/TS 语法解析。 */
export function normalizeApiPath(value) {
  let path = String(value).split(/[?#]/)[0];
  path = path.replace(/\$\{[^}]+\}/g, "*").replace(/\{[^}]+\}/g, "*");
  path = path.replace(/\/{2,}/g, "/");
  if (!path.startsWith("/")) path = `/${path}`;
  return path.replace(/\/+$/, "") || "/";
}

/** 旧端点与旧分页键的 AST 探测纯函数。 */
export function findForbiddenLegacyTokens(source) {
  return findForbiddenLegacyTokensInSource(source);
}

/** 解析 METHOD<TAB>path<TAB>... 快照；空快照与格式漂移由调用方失败封闭。 */
export function parseSnapshot(text) {
  if (typeof text !== "string")
    throw new Error("TOOL_BUG: snapshot must be text");
  const keys = new Set();
  const paths = new Map();
  const malformed = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [method, apiPath] = line.split("\t");
    if (
      !method ||
      !/^[A-Za-z]+$/.test(method.trim()) ||
      !apiPath ||
      !apiPath.startsWith("/")
    ) {
      malformed.push(line);
      continue;
    }
    const verb = method.trim().toUpperCase();
    const norm = normalizeApiPath(apiPath);
    keys.add(`${verb} ${norm}`);
    if (!paths.has(norm)) paths.set(norm, new Set());
    paths.get(norm).add(verb);
  }
  return { keys, paths, malformed };
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, out);
    } else if (/\.(ts|vue|js)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function loadSnapshotOrThrow(snapshotPath) {
  if (!existsSync(snapshotPath))
    throw new Error(`TOOL_BUG: snapshot file not found: ${snapshotPath}`);
  const parsed = parseSnapshot(readFileSync(snapshotPath, "utf8"));
  if (parsed.keys.size === 0)
    throw new Error(`TOOL_BUG: snapshot parsed 0 routes: ${snapshotPath}`);
  if (parsed.malformed.length > 0) {
    throw new Error(
      `TOOL_BUG: snapshot has ${parsed.malformed.length} unparsable lines (format drift?): ${snapshotPath}`,
    );
  }
  return parsed;
}

/**
 * 纯内存契约判定。调用路径只接受字符串字面量、无替换模板串或可解析到字符串字面量的标识符。
 * contracts.ts 的斜杠导出逐条校验快照；opaque 导出由 AST helper 显式判红。
 */
export function evaluateEntries(entries, snapshotText, options = {}) {
  const base = options.base ?? API_BASE_PATH;
  const snapshot = parseSnapshot(snapshotText);
  if (snapshot.keys.size === 0)
    throw new Error("TOOL_BUG: snapshot parsed 0 routes");
  if (snapshot.malformed.length > 0) {
    throw new Error(
      `TOOL_BUG: snapshot has ${snapshot.malformed.length} unparsable lines (format drift?)`,
    );
  }
  const { calls, failures, contracts } = analyzeSourceEntries(entries);

  for (const call of calls) {
    if (call.unresolved) continue;
    const path = normalizeApiPath(call.path);
    const underBase = path === base || path.startsWith(`${base}/`);
    if (!underBase || !snapshot.keys.has(`${call.method} ${path}`)) {
      const note = call.note ? ` [${call.note}]` : "";
      failures.push({
        type: "MISS",
        message: `${call.method} ${path}${note}`,
        file: call.file,
      });
    }
  }

  for (const contract of contracts) {
    if (contract.value === null) continue;
    const path = normalizeApiPath(contract.value);
    if (!path.startsWith("/") || path === base) continue;
    if (!path.startsWith(`${base}/`)) {
      failures.push({
        type: "BAD",
        message: `CONSTANT ${contract.name} ${path} (path constant must start with ${base}/)`,
        file: contract.file,
      });
    } else if (!snapshot.paths.has(path)) {
      failures.push({
        type: "MISS",
        message: `CONSTANT ${contract.name} ${path} (no route registered)`,
        file: contract.file,
      });
    }
  }
  return { calls, failures };
}

function pathArg(args, flag, defaultRel) {
  const indices = args.flatMap((token, index) =>
    token === flag ? [index] : [],
  );
  if (indices.length > 1) throw new Error(`TOOL_BUG: duplicate flag: ${flag}`);
  if (indices.length === 0) return resolve(REPO_ROOT, defaultRel);
  const value = args[indices[0] + 1];
  if (value === undefined || value.trim() === "" || value.startsWith("--")) {
    throw new Error(`TOOL_BUG: ${flag} requires a non-empty value`);
  }
  return resolve(value);
}

function assertKnownFlags(args) {
  const valueSlots = new Set();
  for (const flag of ["--root", "--snapshot"]) {
    const index = args.indexOf(flag);
    if (index !== -1) valueSlots.add(index + 1);
  }
  args.forEach((token, index) => {
    if (valueSlots.has(index)) return;
    if (token.startsWith("--") && !KNOWN_FLAGS.has(token)) {
      throw new Error(`TOOL_BUG: unknown flag: ${token}`);
    }
  });
}

function selfTest() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`DETECTOR_BLIND: ${message}`);
  };
  assert.throws = (fn, pattern) => {
    let error = null;
    try {
      fn();
    } catch (caught) {
      error = caught;
    }
    assert(
      error && pattern.test(error.message),
      `expected error matching ${pattern}, got ${error?.message ?? "none"}`,
    );
  };
  const snapshot = [
    "GET\t/api/v1/erp/auth/me\thandler\tmod",
    "GET\t/api/v1/erp/sales/orders/*\thandler\tmod",
  ].join("\n");
  const evaluate = (entries) => evaluateEntries(entries, snapshot);
  const unresolved = (result) =>
    result.failures.filter((failure) => failure.type === "UNRESOLVED");

  for (const key of [
    "content",
    "pageNo",
    "totalPage",
    "hasNextPage",
    "isLastPage",
  ]) {
    const forms = [
      `data.${key}`,
      `response.data.${key}`,
      `res?.data.${key}`,
      `data['${key}']`,
      `response.data?.['${key}']`,
      `const { ${key} } = response.data`,
      `const { ${key}: alias } = data`,
      `const { ${key} = 1 } = response.data`,
      `const { ${key}: alias = [], items } = data`,
      `({ ${key} } = response.data)`,
      `({ ${key} = 1 } = response.data)`,
      `({ ${key}: alias = [] } = data)`,
    ];
    for (const source of forms) {
      assert(
        findForbiddenLegacyTokens(source).includes(
          `legacy-pagination:data.${key}`,
        ),
        `legacy pagination form missed: ${source}`,
      );
    }
  }

  for (const source of [
    "// data.content",
    "const text = 'data.pageNo'",
    "/* data.totalPage */",
    "// apiClient.get('/app-api/goods/list')",
    "const rows = metadata.content",
    "const total = formdata.totalPage",
    "const flag = responseData.hasNextPage",
    "const list = data.contentList",
    "const n = data.isLastPageCount",
    "const list = dataList.pageNo",
    "const rows = data?.items",
  ]) {
    assert(
      findForbiddenLegacyTokens(source).length === 0,
      `clean source falsely flagged: ${source}`,
    );
  }

  for (const token of ["/app-api/", "/oauth-api/"]) {
    assert(
      findForbiddenLegacyTokens(`request('${token}goods/list')`).includes(
        `legacy-endpoint:${token}`,
      ),
      `legacy endpoint token missed: ${token}`,
    );
  }
  assert(
    normalizeApiPath("/api/v1/erp/sales/orders/${id}/cancel") ===
      "/api/v1/erp/sales/orders/*/cancel",
    "dynamic path normalization failed",
  );

  const literal = evaluate([
    { file: "a.ts", source: "apiClient.get('/api/v1/erp/auth/me')" },
  ]);
  assert(
    literal.calls.length === 1 && literal.failures.length === 0,
    "literal call fixture must pass",
  );

  const vue = evaluate([
    {
      file: "page.vue",
      source:
        "<template><view /></template>\n<script setup>\n" +
        "const ME = '/api/v1/erp/auth/me'\napiClient.get(ME)\n</script>",
    },
  ]);
  assert(
    vue.calls.length === 1 && vue.failures.length === 0,
    "Vue script blocks must be parsed as TypeScript",
  );

  const switchCase = evaluate([
    {
      file: "navigation.ts",
      source:
        "const ME = '/api/v1/erp/auth/me'\n" +
        "function navigate(method: string) { switch (method) { case 'read': apiClient.get(ME); break; default: break; } }",
    },
  ]);
  assert(
    switchCase.calls.length === 1 && switchCase.failures.length === 0,
    "switch case clauses must be traversed through their clauses collection",
  );

  const relative = evaluate([
    { file: "a.ts", source: "apiClient.get('/auth/me')" },
  ]);
  assert(
    relative.failures.length === 1 && relative.failures[0].type === "MISS",
    "base-relative paths must MISS without silent completion",
  );

  const forbidden = evaluate([
    {
      file: "dirty.ts",
      source:
        "apiClient.get('/api/v1/erp/auth/me')\n" +
        "const legacy = '/oauth-api/user/info'\n" +
        "const rows = response.data?.['totalPage']",
    },
  ]);
  assert(
    forbidden.failures.filter((failure) => failure.type === "FORBIDDEN")
      .length === 2,
    "end-to-end forbidden fixture must report endpoint and pagination hits",
  );

  const invalidArgs = evaluate([
    {
      file: "args.ts",
      source:
        "apiClient.get()\n" +
        "apiClient.get('/api/v1/erp/auth/me' + suffix)\n" +
        "apiClient.get(`/api/v1/erp/sales/orders/${id}`)\n" +
        "apiClient.get(buildPath('me'))",
    },
  ]);
  assert(
    unresolved(invalidArgs).length === 4,
    "empty/concatenated/substituted/expression args must be UNRESOLVED",
  );
  assert(
    !invalidArgs.failures.some((failure) => failure.type === "MISS"),
    "invalid args must not be prefix-judged",
  );

  const constants = evaluate([
    {
      file: "contracts.ts",
      source:
        "export const API_BASE_PATH = '/api/v1/erp'\n" +
        "export const AUTH_ME_PATH = `${API_BASE_PATH}/auth/me`\n" +
        "export const LOGIN_PATH = '/api/v1/erp/auth/nope'\n",
    },
    { file: "session.ts", source: "apiClient.get(AUTH_ME_PATH)" },
    { file: "page.ts", source: "apiClient.post(LOGIN_PATH, {})" },
  ]);
  assert(
    constants.failures.length === 2,
    "constant call and registry must both validate missing routes",
  );
  assert(
    constants.failures.some(
      (failure) =>
        failure.message === "POST /api/v1/erp/auth/nope [LOGIN_PATH]",
    ),
    "constant call MISS missing",
  );
  assert(
    constants.failures.some((failure) =>
      failure.message.startsWith("CONSTANT LOGIN_PATH"),
    ),
    "constant registry MISS missing",
  );

  const twinRegistry = evaluate([
    {
      file: "a/contracts.ts",
      source: "export const TWIN = '/api/v1/erp/auth/me'",
    },
    {
      file: "b/contracts.ts",
      source: "export const TWIN = '/api/v1/erp/ghost'",
    },
    { file: "page.ts", source: "apiClient.get('/api/v1/erp/auth/me')" },
  ]);
  assert(
    twinRegistry.failures.length === 1 &&
      twinRegistry.failures[0].message.startsWith(
        "CONSTANT TWIN /api/v1/erp/ghost",
      ),
    "each contracts.ts must be registered independently",
  );

  const shadow = evaluate([
    { file: "one.ts", source: "export const SHADOWED = '/api/v1/erp/auth/me'" },
    { file: "two.ts", source: "export const SHADOWED = '/api/v1/erp/ghost'" },
    { file: "page.ts", source: "apiClient.get(SHADOWED)" },
  ]);
  assert(
    unresolved(shadow).length === 1,
    "duplicate global export names must be ambiguous",
  );

  const opaqueShadow = evaluate([
    {
      file: "one.ts",
      source: "export const OPAQUE_TWIN = '/api/v1/erp/auth/me'",
    },
    { file: "two.ts", source: "export const OPAQUE_TWIN = buildPath()" },
    { file: "page.ts", source: "apiClient.get(OPAQUE_TWIN)" },
  ]);
  assert(
    unresolved(opaqueShadow).length === 1,
    "opaque same-name exports must participate in ambiguity",
  );

  const lexical = evaluate([
    {
      file: "page.ts",
      source:
        "const SCOPED = '/api/v1/erp/auth/me'\n" +
        "{ const SCOPED = buildPath(); apiClient.get(SCOPED) }\n" +
        "apiClient.get(SCOPED)\n",
    },
  ]);
  assert(
    unresolved(lexical).length === 1,
    "nested opaque declaration must shadow only its lexical scope",
  );
  assert(
    lexical.calls.filter((call) => call.path === "/api/v1/erp/auth/me")
      .length === 1,
    "outer binding must remain resolvable",
  );

  const namedFunctionExpression = evaluate([
    {
      file: "page.ts",
      source:
        "const P = '/api/v1/erp/auth/me'\n" +
        "const f = function P() { apiClient.get(P) }\n" +
        "apiClient.get(P)\n",
    },
  ]);
  assert(
    unresolved(namedFunctionExpression).length === 1 &&
      namedFunctionExpression.calls.filter(
        (call) => call.path === "/api/v1/erp/auth/me",
      ).length === 1,
    "named function expression self-binding must shadow the outer path",
  );

  const namedClassExpression = evaluate([
    {
      file: "page.ts",
      source:
        "const P = '/api/v1/erp/auth/me'\n" +
        "const C = class P { read() { apiClient.get(P) } }\n" +
        "apiClient.get(P)\n",
    },
  ]);
  assert(
    unresolved(namedClassExpression).length === 1 &&
      namedClassExpression.calls.filter(
        (call) => call.path === "/api/v1/erp/auth/me",
      ).length === 1,
    "named class expression self-binding must shadow the outer path",
  );

  const parameterScope = evaluate([
    {
      file: "page.ts",
      source:
        "const PARAM = '/api/v1/erp/auth/me'\n" +
        "function use(PARAM) { return apiClient.get(PARAM) }\n" +
        "apiClient.get(PARAM)\n",
    },
  ]);
  assert(
    unresolved(parameterScope).length === 1,
    "function parameters must shadow outer bindings",
  );

  const reassigned = evaluate([
    {
      file: "paths.ts",
      source:
        "export var REASSIGNED = '/api/v1/erp/auth/me'\nREASSIGNED = buildPath()\n",
    },
    { file: "page.ts", source: "apiClient.get(REASSIGNED)" },
  ]);
  assert(
    unresolved(reassigned).length === 1,
    "var/let reassignment must invalidate literal resolution",
  );

  for (const target of [
    "[P = '/api/v1/erp/ghost']",
    "({ P = '/api/v1/erp/ghost' })",
  ]) {
    const destructuringDefault = evaluate([
      {
        file: "paths.ts",
        source: `export var P = '/api/v1/erp/auth/me'\n${target} = values\n`,
      },
      { file: "page.ts", source: "apiClient.get(P)" },
    ]);
    assert(
      unresolved(destructuringDefault).length === 1,
      `destructuring default must invalidate the assigned binding: ${target}`,
    );
  }

  const exportShapes = evaluate([
    { file: "one.ts", source: "export const MULTI = '/api/v1/erp/auth/me'" },
    { file: "two.ts", source: "export const OTHER = 1, MULTI = buildPath()" },
    {
      file: "three.ts",
      source: "export const ABSTRACT = '/api/v1/erp/auth/me'",
    },
    { file: "four.ts", source: "export abstract class ABSTRACT {}" },
    {
      file: "page.ts",
      source: "apiClient.get(MULTI)\napiClient.get(ABSTRACT)",
    },
  ]);
  assert(
    unresolved(exportShapes).length === 2,
    "all declarators and abstract classes must count as bindings",
  );

  const opaqueValueShapes = evaluate([
    {
      file: "one.ts",
      source: "export const COLLECTION_TWIN = '/api/v1/erp/auth/me'",
    },
    { file: "two.ts", source: "export const COLLECTION_TWIN = new Set(['a'])" },
    {
      file: "three.ts",
      source: "export const FUNCTION_TWIN = '/api/v1/erp/auth/me'",
    },
    { file: "four.ts", source: "export function FUNCTION_TWIN() { return 1 }" },
    {
      file: "page.ts",
      source: "apiClient.get(COLLECTION_TWIN)\napiClient.get(FUNCTION_TWIN)",
    },
  ]);
  assert(
    unresolved(opaqueValueShapes).length === 2,
    "collection and function exports must count as value bindings",
  );

  const valueShapes = evaluate([
    {
      file: "one.ts",
      source: "export const ENUM_TWIN = '/api/v1/erp/auth/me'",
    },
    { file: "two.ts", source: "export enum ENUM_TWIN { a }" },
    {
      file: "three.ts",
      source: "export const NS_TWIN = '/api/v1/erp/auth/me'",
    },
    {
      file: "four.ts",
      source: "export namespace NS_TWIN { export const v = 1 }",
    },
    {
      file: "page.ts",
      source: "apiClient.get(ENUM_TWIN)\napiClient.get(NS_TWIN)",
    },
  ]);
  assert(
    unresolved(valueShapes).length === 2,
    "enum and namespace declarations must count as value bindings",
  );

  const namespaceLeak = evaluate([
    {
      file: "ns.ts",
      source:
        "export namespace INTERNAL { export const INNER = '/api/v1/erp/auth/me' }",
    },
    {
      file: "page.ts",
      source: "apiClient.get(INNER)\napiClient.get('/api/v1/erp/auth/me')",
    },
  ]);
  assert(
    unresolved(namespaceLeak).length === 1,
    "namespace-internal exports must not leak into module exports",
  );

  const reexport = evaluate([
    { file: "one.ts", source: "export const ALIAS = '/api/v1/erp/auth/me'" },
    { file: "barrel.ts", source: "export { X as ALIAS } from './not-scanned'" },
    {
      file: "page.ts",
      source: "import { ALIAS } from './barrel'\napiClient.get(ALIAS)",
    },
  ]);
  assert(
    unresolved(reexport).length === 1,
    "unresolvable same-name re-export must fail closed",
  );

  const resolvableReexport = evaluate([
    { file: "paths.ts", source: "export const X = '/api/v1/erp/auth/me'" },
    { file: "barrel.ts", source: "export { X as Y } from './paths'" },
    {
      file: "page.ts",
      source: "import { Y } from './barrel'\napiClient.get(Y)",
    },
  ]);
  assert(
    resolvableReexport.failures.length === 0,
    "resolvable named re-exports must not over-red",
  );

  const stars = evaluate([
    { file: "barrel.ts", source: "export * from './not-scanned'" },
    { file: "contracts.ts", source: "export * from './not-scanned'" },
    {
      file: "page.ts",
      source:
        "import { ANY } from './barrel'\napiClient.get(ANY)\napiClient.get('/api/v1/erp/auth/me')",
    },
  ]);
  assert(
    unresolved(stars).length === 2,
    "export-star consumers and registries must fail closed",
  );
  assert(
    stars.failures.some((failure) => failure.message.includes("EXPORT STAR")),
    "export-star registry diagnostic missing",
  );

  const namespaceReexport = evaluate([
    { file: "contracts.ts", source: "export * as NS from './not-scanned'" },
    { file: "page.ts", source: "apiClient.get('/api/v1/erp/auth/me')" },
  ]);
  assert(
    unresolved(namespaceReexport).length === 1 &&
      unresolved(namespaceReexport)[0].message.includes("CONSTANT NS"),
    "namespace re-exports must be explicit opaque registry failures",
  );

  const alias = evaluate([
    { file: "paths.ts", source: "export const ME = '/api/v1/erp/auth/me'" },
    {
      file: "page.ts",
      source: "import { ME as ALIAS } from './paths'\napiClient.get(ALIAS)",
    },
  ]);
  assert(
    alias.failures.length === 0,
    "resolvable import alias must not over-red",
  );

  const jsSpecifier = evaluate([
    { file: "paths.ts", source: "export const ME = '/api/v1/erp/auth/me'" },
    {
      file: "page.ts",
      source: "import { ME } from './paths.js'\napiClient.get(ME)",
    },
  ]);
  assert(
    jsSpecifier.failures.length === 0,
    "JavaScript module specifiers must resolve their TypeScript sources",
  );

  const aliasMiss = evaluate([
    { file: "paths.ts", source: "export const ME = '/api/v1/erp/ghost'" },
    {
      file: "page.ts",
      source: "import { ME as ALIAS } from './paths'\napiClient.get(ALIAS)",
    },
  ]);
  assert(
    aliasMiss.failures.length === 1 &&
      aliasMiss.failures[0].message === "GET /api/v1/erp/ghost [ALIAS]",
    "import-bound aliases must validate the concrete target value",
  );

  const localAlias = evaluate([
    {
      file: "barrel.ts",
      source:
        "export const OK = '/api/v1/erp/auth/me'\nexport { OK as RENAMED }",
    },
    { file: "page.ts", source: "apiClient.get(RENAMED)" },
  ]);
  assert(
    localAlias.failures.length === 0,
    "local export aliases must remain resolvable",
  );

  const forwardExport = evaluate([
    {
      file: "barrel.ts",
      source:
        "export { FORWARD as ALIAS }\nconst FORWARD = '/api/v1/erp/auth/me'",
    },
    { file: "page.ts", source: "apiClient.get(ALIAS)" },
  ]);
  assert(
    forwardExport.failures.length === 0,
    "local export lists must resolve forward declarations",
  );

  const ambient = evaluate([
    { file: "one.ts", source: "export const AMBIENT = '/api/v1/erp/auth/me'" },
    { file: "d.ts", source: "export declare const AMBIENT: string" },
    { file: "page.ts", source: "apiClient.get(AMBIENT)" },
  ]);
  assert(
    ambient.failures.length === 0,
    "ambient declarations must not forge runtime ambiguity",
  );

  const varLiteral = evaluate([
    {
      file: "paths.ts",
      source: "export var VAR_LITERAL = '/api/v1/erp/auth/me'",
    },
    { file: "page.ts", source: "apiClient.get(VAR_LITERAL)" },
  ]);
  assert(
    varLiteral.failures.length === 0,
    "unreassigned var literals must remain resolvable",
  );

  const opaqueRegistry = evaluate([
    {
      file: "contracts.ts",
      source:
        "export const OK = '/api/v1/erp/auth/me'\nexport const OPAQUE = buildPath()",
    },
    { file: "page.ts", source: "apiClient.get('/api/v1/erp/auth/me')" },
  ]);
  assert(
    unresolved(opaqueRegistry).length === 1,
    "opaque contracts export must fail exactly once",
  );

  const broken = evaluate([
    { file: "broken.ts", source: "apiClient.get('/api/v1/erp/auth/me" },
  ]);
  assert(
    unresolved(broken).some((failure) => failure.message.startsWith("PARSE ")),
    "syntax diagnostics must fail closed",
  );

  assert.throws(
    () => evaluateEntries([], snapshot),
    /TOOL_BUG: no source entries/,
  );
  assert.throws(
    () =>
      evaluateEntries(
        [{ file: "a.ts", source: "apiClient.get('/api/v1/erp/auth/me')" }],
        "",
      ),
    /TOOL_BUG: snapshot parsed 0 routes/,
  );
  assert.throws(
    () =>
      evaluateEntries(
        [{ file: "a.ts", source: "apiClient.get('/api/v1/erp/auth/me')" }],
        `${snapshot}\nbad line`,
      ),
    /unparsable/,
  );

  const dir = mkdtempSync(join(tmpdir(), "miniapp-contract-"));
  try {
    const root = join(dir, "src");
    const snapshotFile = join(dir, "snapshot.txt");
    mkdirSync(root);
    writeFileSync(snapshotFile, snapshot);
    writeFileSync(join(root, "a.ts"), "apiClient.get('/api/v1/erp/auth/me')");
    const io = { log: () => {}, error: () => {} };
    assert(
      runGate(["--root", root, "--snapshot", snapshotFile], io) === 0,
      "end-to-end green fixture failed",
    );
    writeFileSync(join(root, "a.ts"), "export const quiet = true");
    assert.throws(
      () => runGate(["--root", root, "--snapshot", snapshotFile], io),
      /no apiClient calls found/,
    );
    assert.throws(
      () => runGate(["--root", root, "--snapshot", join(dir, "missing")], io),
      /snapshot file not found/,
    );
    for (const args of [
      ["--root"],
      ["--root", ""],
      ["--snapsot", "x"],
      ["--bogus"],
    ]) {
      assert.throws(() => runGate(args, io), /TOOL_BUG/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log("MINIAPP_CONTRACT_SELFTEST_OK");
}

/** CLI 主流程；0 绿、1 业务红、判定器异常由 main 转成 2。 */
export function runGate(args, io = {}) {
  const out = io.log ?? ((message) => console.log(message));
  const errOut = io.error ?? ((message) => console.error(message));
  assertKnownFlags(args);
  const root = pathArg(args, "--root", "miniapp/src");
  const snapshotPath = pathArg(
    args,
    "--snapshot",
    "frontend/scripts/route-snapshot.txt",
  );
  if (!existsSync(root))
    throw new Error(`TOOL_BUG: scan root not found: ${root}`);
  loadSnapshotOrThrow(snapshotPath);
  const entries = walk(root).map((file) => ({
    file,
    source: readFileSync(file, "utf8"),
  }));
  const { calls, failures } = evaluateEntries(
    entries,
    readFileSync(snapshotPath, "utf8"),
  );
  for (const failure of failures)
    errOut(`${failure.type} ${failure.message} @ ${failure.file}`);
  if (calls.length === 0) {
    throw new Error(
      `TOOL_BUG: no apiClient calls found under ${root}; scanning empty must not pass`,
    );
  }
  out(`MINIAPP_CONTRACT calls=${calls.length} failures=${failures.length}`);
  return failures.length === 0 ? 0 : 1;
}

function main() {
  try {
    const args = process.argv.slice(2);
    assertKnownFlags(args);
    if (args.includes("--self-test")) {
      for (const flag of ["--root", "--snapshot"]) {
        if (args.includes(flag)) pathArg(args, flag, "");
      }
      selfTest();
    } else process.exit(runGate(args));
  } catch (error) {
    console.error(
      `MINIAPP_CONTRACT_TOOL_ERROR ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(2);
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main();
