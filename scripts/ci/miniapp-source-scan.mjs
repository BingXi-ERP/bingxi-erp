import assert from "node:assert/strict";
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
import { dirname, join, relative, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require(join(resolve("miniapp"), "node_modules/typescript"));
const SOURCE_ROOT = resolve("miniapp");
const SKIP_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  "test-results",
  "tests",
  ".git",
]);
const CHINESE = /[\u3400-\u9fff]/u;
const SENSITIVE_NAME =
  /(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|credential)/i;
const PLACEHOLDER =
  /(?:^$|your[-_]|example\.invalid|changeme|placeholder|dummy|touristappid|\$\{)/i;

function posix(value) {
  return value.split(sep).join("/");
}

function files(root) {
  const found = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) walk(path);
      } else if (
        /\.(?:ts|tsx|js|mjs|cjs|vue|json|env|ya?ml)$/.test(entry.name) ||
        entry.name.startsWith(".env")
      ) {
        found.push(path);
      }
    }
  }
  walk(root);
  return found;
}

function exempt(file, root) {
  const path = posix(relative(root, file));
  return (
    /^(?:src\/)?shared\/i18n\/(?:zh-CN|en-US)\.ts$/.test(path) ||
    /(?:^|\/)pages\.json$/.test(path) ||
    /(?:^|\/)package-lock\.json$/.test(path)
  );
}

function publicIpv4(value) {
  for (const match of value.matchAll(/(?:\d{1,3}\.){3}\d{1,3}/g)) {
    const candidate = match[0];
    const index = match.index ?? 0;
    const before = value[index - 1];
    const after = value[index + candidate.length];
    if (before !== undefined && /[\d.]/.test(before)) continue;
    if (after !== undefined && /[\d.]/.test(after)) continue;
    const octets = candidate.split(".").map(Number);
    if (octets.some((octet) => octet < 0 || octet > 255)) continue;
    const [a, b] = octets;
    if (!(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 100 && b >= 64 && b <= 127)
    )) {
      return true;
    }
  }
  return false;
}

function sensitiveLiteral(name, value) {
  return (
    !/^(?:show|hide|is|has|can)/i.test(name) &&
    SENSITIVE_NAME.test(name) &&
    !PLACEHOLDER.test(value.trim())
  );
}

function codeLiterals(file, contents) {
  const templateLiterals = [];
  if (file.endsWith(".vue")) {
    const template =
      contents.match(/<template\b[^>]*>([\s\S]*?)<\/template>/)?.[1] ?? "";
    const cleaned = template.replace(/<!--[\s\S]*?-->/g, "");
    for (const match of cleaned.matchAll(/>([^<>]+)</g)) {
      const value = match[1].replace(/\{\{[\s\S]*?\}\}/g, "").trim();
      if (value) templateLiterals.push({ value, name: "", line: 1 });
    }
    for (const match of cleaned.matchAll(
      /([A-Za-z_:][\w:.-]*)\s*=\s*(["'])(.*?)\2/gs,
    )) {
      if (!match[1].startsWith(":")) {
        templateLiterals.push({ value: match[3], name: match[1], line: 1 });
      }
    }
  }
  const start = file.endsWith(".vue")
    ? contents.match(/<script\b[^>]*>([\s\S]*?)<\/script>/)?.[1]
    : contents;
  if (start === undefined) return [];
  const source = ts.createSourceFile(
    file,
    start,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".vue") ? ts.ScriptKind.TS : ts.ScriptKind.TSX,
  );
  const literals = [];
  function add(node, value, name = "") {
    const line =
      source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    literals.push({ value, name, line });
  }
  function visit(node) {
    if (
      ts.isStringLiteralLike(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      add(node, node.text);
    } else if (ts.isTemplateExpression(node)) {
      add(node.head, node.head.text);
      for (const span of node.templateSpans)
        add(span.literal, span.literal.text);
    }
    if (
      (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) ||
      (ts.isPropertyAssignment(node) && ts.isStringLiteralLike(node.name))
    ) {
      const initializer = node.initializer;
      if (ts.isStringLiteralLike(initializer))
        add(initializer, initializer.text, node.name.text);
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isStringLiteralLike(node.initializer)
    ) {
      add(node.initializer, node.initializer.text, node.name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return [...templateLiterals, ...literals];
}

function envLiterals(contents) {
  return contents.split(/\r?\n/).flatMap((line, index) => {
    const match = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/,
    );
    if (!match) return [];
    return [
      {
        name: match[1],
        value: match[2].replace(/^(['"])(.*)\1$/, "$2"),
        line: index + 1,
      },
    ];
  });
}

function jsonLiterals(value, line = 1) {
  if (typeof value === "string") return [{ value, name: "", line }];
  if (Array.isArray(value))
    return value.flatMap((item) => jsonLiterals(item, line));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([name, item]) =>
      typeof item === "string"
        ? [{ value: item, name, line }]
        : jsonLiterals(item, line),
    );
  }
  return [];
}

function inspectLiterals(file, root, literals) {
  const path = posix(relative(root, file));
  const violations = [];
  for (const literal of literals) {
    const value = literal.value;
    const at = `${path}:${literal.line}`;
    if (publicIpv4(value))
      violations.push({
        file: path,
        line: literal.line,
        rule: "public-ip",
        value,
      });
    if (
      /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/.test(value) ||
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(value) ||
      /[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i.test(value) ||
      sensitiveLiteral(literal.name, value)
    ) {
      violations.push({
        file: path,
        line: literal.line,
        rule: "credential-literal",
        value,
      });
    }
    if (CHINESE.test(value)) {
      violations.push({
        file: path,
        line: literal.line,
        rule: "bare-chinese-token",
        value,
      });
    }
  }
  return violations;
}

function scanSource(root = SOURCE_ROOT) {
  const violations = [];
  for (const file of files(root)) {
    if (exempt(file, root)) continue;
    const contents = readFileSync(file, "utf8");
    let literals;
    if (/\.(?:ts|tsx|js|mjs|cjs|vue)$/.test(file))
      literals = codeLiterals(file, contents);
    else if (file.endsWith(".json"))
      literals = jsonLiterals(JSON.parse(contents));
    else literals = envLiterals(contents);
    violations.push(...inspectLiterals(file, root, literals));
  }
  const seen = new Set();
  return violations.filter((violation) => {
    const key = JSON.stringify(violation);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function runSelfTest() {
  const fixture = mkdtempSync(join(tmpdir(), "miniapp-source-"));
  try {
    const write = (path, contents) => {
      const file = join(fixture, path);
      const directory = dirname(file);
      mkdirSync(directory, { recursive: true });
      writeFileSync(file, contents, "utf8");
    };
    write("src/safe.ts", "export const host = 'https://erp.example.invalid'\n");
    write("src/shared/i18n/zh-CN.ts", "export const text = '工作台'\n");
    write("src/pages.json", '{"navigationBarTitleText":"工作台"}\n');
    assert.deepEqual(scanSource(fixture), []);

    write(
      "src/features/auth/zh-CN.ts",
      "export const apiKey = 'not-a-real-credential'; export const host = 'https://8.8.8.8'; export const text = '裸中文必须命中'\n",
    );
    assert.deepEqual(
      scanSource(fixture)
        .map((item) => item.rule)
        .sort(),
      ["bare-chinese-token", "credential-literal", "public-ip"],
    );
    rmSync(join(fixture, "src/features/auth/zh-CN.ts"));

    write(
      "src/bad.ts",
      "export const host = 'https://8.8.8.8'; export const text = '业务失败'\n",
    );
    assert.deepEqual(
      scanSource(fixture).map((item) => item.rule),
      ["public-ip", "bare-chinese-token"],
    );
    write("src/bad.ts", "export const host = 'https://1234.8.8.8'\n");
    assert.deepEqual(scanSource(fixture), []);
    rmSync(join(fixture, "src/bad.ts"));
    write("src/bad.ts", "export const password = 'real-looking-secret'\n");
    assert.equal(scanSource(fixture)[0]?.rule, "credential-literal");
    write(
      "src/bad.ts",
      "export const privateKey = '-----BEGIN PRIVATE KEY-----'\n",
    );
    assert.equal(scanSource(fixture)[0]?.rule, "credential-literal");
    rmSync(join(fixture, "src/bad.ts"));
    write(
      ".env",
      "VITE_API_BASE_URL=https://10.0.0.1\nVITE_PASSWORD=secret-value\n",
    );
    assert.deepEqual(
      scanSource(fixture).map((item) => item.rule),
      ["credential-literal"],
    );
    return "MINIAPP_SOURCE_SCAN_SELFTEST_OK";
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

function main(args) {
  if (args.includes("--self-test")) {
    console.info(runSelfTest());
    return;
  }
  const violations = scanSource();
  for (const violation of violations) {
    console.error(
      `MINIAPP_SOURCE_VIOLATION ${violation.file}:${violation.line} ${violation.rule} ${JSON.stringify(violation.value)}`,
    );
  }
  if (violations.length > 0)
    throw new Error(`源码安全扫描失败：${violations.length} 项`);
  console.info("MINIAPP_SOURCE_SCAN_OK");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

export { scanSource };
