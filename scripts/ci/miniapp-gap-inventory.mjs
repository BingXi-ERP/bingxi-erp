// 旧小程序后端能力静态盘点：只读取声明页与 require 图，不执行旧工程代码。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MANUAL_REVIEW = "manual-review";
const TASK_REF = "Task 9";
const KNOWN_FLAGS = new Set([
  "--legacy-root",
  "--output",
  "--snapshot",
  "--self-test",
]);

export function normalizeApiPath(value) {
  let path = String(value).split(/[?#]/)[0];
  path = path.replace(/\$\{[^}]+\}/g, "*").replace(/\{[^}]+\}/g, "*");
  path = path.replace(/\/{2,}/g, "/");
  if (!path.startsWith("/")) path = `/${path}`;
  return path.replace(/\/+$/, "") || "/";
}

export function classifyBackendStatus(method, path, snapshot) {
  const normalized = normalizeApiPath(path);
  if (
    normalized.startsWith("/app-api/") ||
    normalized.startsWith("/oauth-api/")
  )
    return "legacy";
  if (method === "UNKNOWN" || normalized === "/manual-review")
    return MANUAL_REVIEW;
  return snapshot.has(`${method} ${normalized}`) ? "existing" : "missing";
}

export function parseSnapshot(text) {
  if (typeof text !== "string")
    throw new Error("TOOL_BUG: snapshot must be text");
  const keys = new Set();
  const malformed = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [method, path] = line.split("\t");
    if (
      !method ||
      !/^[A-Za-z]+$/.test(method.trim()) ||
      !path ||
      !path.startsWith("/")
    ) {
      malformed.push(line);
      continue;
    }
    keys.add(`${method.trim().toUpperCase()} ${normalizeApiPath(path)}`);
  }
  if (keys.size === 0) throw new Error("TOOL_BUG: snapshot parsed 0 routes");
  if (malformed.length > 0) {
    throw new Error(
      `TOOL_BUG: snapshot has ${malformed.length} unparsable lines`,
    );
  }
  return keys;
}

function maskSource(source, maskStrings) {
  let result = "";
  let state = "code";
  let quote = "";
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (state === "line-comment") {
      if (char === "\n") {
        state = "code";
        result += char;
      } else result += " ";
      continue;
    }
    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        result += "  ";
        index += 1;
        state = "code";
      } else result += char === "\n" ? "\n" : " ";
      continue;
    }
    if (state === "string") {
      if (char === "\\") {
        result += maskStrings ? "  " : `${char}${next ?? ""}`;
        index += 1;
      } else if (char === quote) {
        result += maskStrings ? " " : char;
        state = "code";
      } else result += maskStrings ? (char === "\n" ? "\n" : " ") : char;
      continue;
    }
    if (char === "/" && next === "/") {
      result += "  ";
      index += 1;
      state = "line-comment";
    } else if (char === "/" && next === "*") {
      result += "  ";
      index += 1;
      state = "block-comment";
    } else if (char === "'" || char === '"' || char === "`") {
      result += maskStrings ? " " : char;
      quote = char;
      state = "string";
    } else result += char;
  }
  return result;
}

function matchingDelimiter(source, start, open, close) {
  let depth = 0;
  const code = maskSource(source, true);
  for (let index = start; index < source.length; index += 1) {
    if (code[index] === open) depth += 1;
    if (code[index] === close) depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function splitArguments(source) {
  const args = [];
  const code = maskSource(source, true);
  let start = 0;
  let round = 0;
  let square = 0;
  let curly = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = code[index];
    if (char === "(") round += 1;
    else if (char === ")") round -= 1;
    else if (char === "[") square += 1;
    else if (char === "]") square -= 1;
    else if (char === "{") curly += 1;
    else if (char === "}") curly -= 1;
    else if (char === "," && round === 0 && square === 0 && curly === 0) {
      args.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  args.push(source.slice(start).trim());
  return args;
}

function decodeLiteral(raw) {
  const body = raw.slice(1, -1);
  return body.replace(/\\([\\'"`])/g, "$1");
}

function appendPathExpression(path, expression) {
  const value = expression.trim();
  if (!value) return path;
  const literal = value.match(/^(['"`])((?:\\.|(?!\1)[^\\])*)\1$/);
  if (literal) {
    const decoded = decodeLiteral(literal[0]);
    if (!decoded || /^https?:\/\//.test(decoded)) return path;
    return `${path}${decoded}`;
  }
  if (/^`[^`]*\$\{[^}]+\}[^`]*$/.test(value)) {
    return `${path}${decodeLiteral(value).replace(/\$\{[^}]+\}/g, "*")}`;
  }
  if (!path || path.includes("?")) return path;
  return `${path}*`;
}

function pathFromConcat(value) {
  let path = "";
  let rest = value;
  while (rest.includes(".concat")) {
    const code = maskSource(rest, true);
    const match = /\.concat\s*\(/.exec(code);
    if (!match) break;
    const open = code.indexOf("(", match.index);
    const close = matchingDelimiter(rest, open, "(", ")");
    if (close === -1) return null;
    path = appendPathExpression(path, rest.slice(0, match.index));
    for (const argument of splitArguments(rest.slice(open + 1, close))) {
      path = appendPathExpression(path, argument);
    }
    rest = rest.slice(close + 1);
  }
  path = appendPathExpression(path, rest);
  return path.split(/[?#]/, 1)[0] ? normalizeApiPath(path) : null;
}

function pathFromExpression(expression) {
  const value = expression.trim();
  if (value.includes(".concat")) return pathFromConcat(value);
  if (/^`[^`]*\$\{[^}]+\}[^`]*`$/.test(value)) {
    return normalizeApiPath(decodeLiteral(value).replace(/\$\{[^}]+\}/g, "*"));
  }
  const literals = [];
  for (const match of value.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    const literal = decodeLiteral(match[0]);
    if (!literal || /^https?:\/\//.test(literal)) continue;
    literals.push({ value: literal, end: match.index + match[0].length });
  }
  if (literals.length === 0) return null;
  if (!literals[0].value.split(/[?#]/, 1)[0]) return null;
  let path = literals.map((literal) => literal.value).join("");
  const tail = value.slice(literals[literals.length - 1].end);
  if (/\.concat\s*\(|(?:\+|-)\s*[A-Za-z_$[(]/.test(tail)) path += "/*";
  return normalizeApiPath(path);
}

function actionBefore(source, index) {
  const prefix = source.slice(0, index);
  const candidates = [];
  const properties = [
    /(?:this|exports|module\.exports)\.([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function(?:\s+[A-Za-z_$][\w$]*)?\s*\(/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function(?:\s+[A-Za-z_$][\w$]*)?|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g,
  ];
  for (const pattern of properties) {
    for (const match of prefix.matchAll(pattern)) {
      candidates.push({ index: match.index, action: match[1] });
    }
  }
  for (const match of prefix.matchAll(
    /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g,
  )) {
    if (/=\s*$/.test(prefix.slice(Math.max(0, match.index - 8), match.index)))
      continue;
    candidates.push({ index: match.index, action: match[1] });
  }
  candidates.sort((left, right) => right.index - left.index);
  return candidates[0]?.action ?? "api-call";
}

function lineAt(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function scanRequestCalls(source) {
  const calls = [];
  const code = maskSource(source, true);
  const pattern = /\brequest\.(GET|POST|PUT|DELETE|PATCH|_POST)\s*\(/g;
  for (const match of code.matchAll(pattern)) {
    const open = code.indexOf("(", match.index);
    const close = matchingDelimiter(source, open, "(", ")");
    if (close === -1) {
      calls.push({
        method: "UNKNOWN",
        path: "/manual-review",
        action: actionBefore(source, match.index),
        line: lineAt(source, match.index),
      });
      continue;
    }
    const args = splitArguments(source.slice(open + 1, close));
    const path = pathFromExpression(args[0] ?? "");
    calls.push({
      method: path ? (match[1] === "_POST" ? "POST" : match[1]) : "UNKNOWN",
      path: path ?? "/manual-review",
      action: actionBefore(source, match.index),
      line: lineAt(source, match.index),
    });
  }
  return calls;
}

export function parseLegacyCall(source) {
  const call = scanRequestCalls(source)[0];
  return call ? { method: call.method, path: call.path } : null;
}

function objectProperty(objectSource, property) {
  const pattern = new RegExp(
    `(?:^|[,{\\n])\\s*${property}\\s*:\\s*([^,}\\n]+)`,
    "m",
  );
  const match = objectSource.match(pattern);
  return match?.[1]?.trim() ?? null;
}

export function parseWxRequest(source) {
  const code = maskSource(source, true);
  const match = /\bwx\.request\s*\(/.exec(code);
  if (!match) return null;
  const open = code.indexOf("(", match.index);
  const close = matchingDelimiter(source, open, "(", ")");
  if (close === -1) return { method: "UNKNOWN", path: "/manual-review" };
  const argument = source.slice(open + 1, close).trim();
  if (!argument.startsWith("{"))
    return { method: "UNKNOWN", path: "/manual-review" };
  const methodLiteral = objectProperty(argument, "method")?.match(
    /^(['"])([A-Z]+)\1$/,
  )?.[2];
  const path = pathFromExpression(objectProperty(argument, "url") ?? "");
  return {
    method: path ? (methodLiteral ?? "UNKNOWN") : "UNKNOWN",
    path: path ?? "/manual-review",
  };
}

function scanWxCalls(source) {
  const calls = [];
  const code = maskSource(source, true);
  const pattern = /\bwx\.request\s*\(/g;
  for (const match of code.matchAll(pattern)) {
    const open = code.indexOf("(", match.index);
    const close = matchingDelimiter(source, open, "(", ")");
    const argument = close === -1 ? "" : source.slice(open + 1, close);
    const method =
      objectProperty(argument, "method")?.match(/^(['"])([A-Z]+)\1$/)?.[2] ??
      "UNKNOWN";
    const path = pathFromExpression(objectProperty(argument, "url") ?? "");
    calls.push({
      method: path ? method : "UNKNOWN",
      path: path ?? "/manual-review",
      action: "wx.request",
      line: lineAt(source, match.index),
    });
  }
  return calls;
}

function resolveRequire(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.js`, join(base, "index.js")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function reachableFiles(pageFile) {
  const seen = new Set();
  const queue = [pageFile];
  while (queue.length > 0) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(
      /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    )) {
      const next = resolveRequire(file, match[1]);
      if (next) queue.push(next);
    }
  }
  return [...seen];
}

function portablePath(value) {
  return value.split(/[\\/]/).join("/");
}

function collectCalls(files, legacyRoot) {
  const calls = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const call of [...scanRequestCalls(source), ...scanWxCalls(source)]) {
      calls.push({ ...call, file: portablePath(relative(legacyRoot, file)) });
    }
  }
  return calls.sort(
    (left, right) =>
      left.file.localeCompare(right.file) || left.line - right.line,
  );
}

function emptyRow(page, source) {
  return {
    page,
    action: "no-static-call",
    method: "-",
    path: MANUAL_REVIEW,
    requestFields: "not-applicable",
    responseFields: "not-applicable",
    permission: "not-applicable",
    source,
    backendStatus: MANUAL_REVIEW,
    taskRef: TASK_REF,
  };
}

export function buildInventory({ legacyRoot, snapshotText }) {
  if (!legacyRoot) throw new Error("TOOL_BUG: legacyRoot is required");
  const root = resolve(legacyRoot);
  const snapshot = parseSnapshot(snapshotText);
  const appJsonPath = join(root, "app.json");
  if (!existsSync(appJsonPath))
    throw new Error(`TOOL_BUG: app.json not found: ${appJsonPath}`);
  const app = JSON.parse(readFileSync(appJsonPath, "utf8"));
  const pages = [
    ...app.pages,
    ...(app.subPackages ?? []).flatMap((subPackage) =>
      subPackage.pages.map(
        (page) => `${subPackage.root.replace(/\/$/, "")}/${page}`,
      ),
    ),
  ];
  if (pages.length === 0 || new Set(pages).size !== pages.length) {
    throw new Error("TOOL_BUG: declared pages are empty or duplicated");
  }

  const rows = [];
  for (const page of pages) {
    const pageFile = [".js", ".wxml"]
      .map((extension) => join(root, `${page}${extension}`))
      .find(existsSync);
    if (!pageFile) throw new Error(`DECLARED_PAGE_MISSING ${page}`);
    const pageCalls = collectCalls(reachableFiles(pageFile), root);
    if (pageCalls.length === 0) {
      rows.push(emptyRow(page, `${page}.js:0`));
      continue;
    }
    const unique = new Map();
    for (const call of pageCalls) {
      const status = classifyBackendStatus(call.method, call.path, snapshot);
      const key = `${call.action}\0${call.method}\0${call.path}`;
      if (unique.has(key)) continue;
      unique.set(key, {
        page,
        action: call.action,
        method: call.method,
        path: call.path,
        requestFields: MANUAL_REVIEW,
        responseFields: MANUAL_REVIEW,
        permission: MANUAL_REVIEW,
        source: `${call.file}:${call.line}`,
        backendStatus: status,
        taskRef: TASK_REF,
      });
    }
    rows.push(...unique.values());
  }

  const represented = new Set(rows.map((row) => row.page));
  const missing = pages.filter((page) => !represented.has(page));
  if (missing.length > 0)
    throw new Error(`DECLARED_PAGE_MISSING ${missing.join(", ")}`);
  const counts = { existing: 0, missing: 0, legacy: 0, "manual-review": 0 };
  for (const row of rows) counts[row.backendStatus] += 1;
  return { pages, rows, counts, snapshotCount: snapshot.size };
}

function markdownCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function renderLedger(inventory) {
  const { pages, rows, counts, snapshotCount } = inventory;
  return [
    "# 小程序后端能力缺口台账",
    "",
    `> 由 \`node scripts/ci/miniapp-gap-inventory.mjs --legacy-root miniprogram --output docs/plans/miniapp-backend-gap-ledger.md\` 生成；声明页 ${pages.length}，台账行 ${rows.length}，路由快照 ${snapshotCount}。`,
    ">",
    "> `requestFields`、`responseFields` 与 `permission` 无法从旧调用点可靠推导时显式记为 `manual-review`；`legacy` 仅表示旧 `/app-api` 或 `/oauth-api` 路径，不代表新后端已有等价端点。",
    "",
    "## 分类统计",
    "",
    "| existing | missing | legacy | manual-review |",
    "| --- | --- | --- | --- |",
    `| ${counts.existing} | ${counts.missing} | ${counts.legacy} | ${counts["manual-review"]} |`,
    "",
    "## 全量台账",
    "",
    "| 页面 | 动作 | 方法 | 路径 | 请求字段 | 响应字段 | 权限 | 来源 | 后端状态 | 任务引用 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${[row.page, row.action, row.method, row.path, row.requestFields, row.responseFields, row.permission, row.source, row.backendStatus, row.taskRef].map(markdownCell).join(" | ")} |`,
    ),
    "",
  ].join("\n");
}

function pathArg(args, flag, defaultValue) {
  const indices = args.flatMap((token, index) =>
    token === flag ? [index] : [],
  );
  if (indices.length > 1) throw new Error(`TOOL_BUG: duplicate flag: ${flag}`);
  if (indices.length === 0) return resolve(REPO_ROOT, defaultValue);
  const value = args[indices[0] + 1];
  if (value === undefined || value.trim() === "" || value.startsWith("--")) {
    throw new Error(`TOOL_BUG: ${flag} requires a non-empty value`);
  }
  return resolve(value);
}

function assertKnownFlags(args) {
  const valueSlots = new Set();
  for (const flag of ["--legacy-root", "--output", "--snapshot"]) {
    const index = args.indexOf(flag);
    if (index !== -1) valueSlots.add(index + 1);
  }
  for (const [index, token] of args.entries()) {
    if (valueSlots.has(index)) continue;
    if (token.startsWith("--") && !KNOWN_FLAGS.has(token)) {
      throw new Error(`TOOL_BUG: unknown flag: ${token}`);
    }
  }
}

export function runInventory(args, io = {}) {
  const log = io.log ?? ((message) => console.log(message));
  assertKnownFlags(args);
  const legacyRoot = pathArg(args, "--legacy-root", "miniprogram");
  const output = pathArg(
    args,
    "--output",
    "docs/plans/miniapp-backend-gap-ledger.md",
  );
  const snapshotPath = pathArg(
    args,
    "--snapshot",
    "frontend/scripts/route-snapshot.txt",
  );
  const inventory = buildInventory({
    legacyRoot,
    snapshotText: readFileSync(snapshotPath, "utf8"),
  });
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, renderLedger(inventory), "utf8");
  log(
    `MINIAPP_GAP pages=${inventory.pages.length} rows=${inventory.rows.length} output=${isAbsolute(output) ? output : portablePath(relative(REPO_ROOT, output))}`,
  );
  return 0;
}

function selfTest() {
  const snapshot = parseSnapshot(
    "GET\t/api/v1/erp/products\thandler\tdomain\n",
  );
  const parsed = parseLegacyCall(
    "request.GET(app.config.bingxiHost + '/app-api/goods/list')",
  );
  if (
    !parsed ||
    parsed.method !== "GET" ||
    parsed.path !== "/app-api/goods/list"
  ) {
    throw new Error("DETECTOR_BLIND: parseLegacyCall");
  }
  if (
    classifyBackendStatus("GET", "/app-api/goods/list", snapshot) !== "legacy"
  ) {
    throw new Error("DETECTOR_BLIND: legacy classification");
  }
  if (
    classifyBackendStatus("GET", "/api/v1/erp/products", snapshot) !==
    "existing"
  ) {
    throw new Error("DETECTOR_BLIND: existing classification");
  }
  const wxCall = parseWxRequest(
    "wx.request({ url: '/api/v1/erp/products', method: 'GET' })",
  );
  if (
    !wxCall ||
    wxCall.method !== "GET" ||
    wxCall.path !== "/api/v1/erp/products"
  ) {
    throw new Error("DETECTOR_BLIND: wx.request");
  }
  console.log("MINIAPP_GAP_SELFTEST_OK");
}

function main() {
  try {
    const args = process.argv.slice(2);
    assertKnownFlags(args);
    if (args.includes("--self-test")) selfTest();
    else process.exit(runInventory(args));
  } catch (error) {
    console.error(
      `MINIAPP_GAP_TOOL_ERROR ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(2);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main();
