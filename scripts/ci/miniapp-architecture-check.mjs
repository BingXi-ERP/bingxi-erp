#!/usr/bin/env node
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
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require(join(resolve("miniapp"), "node_modules/typescript"));
const SOURCE_ROOT = resolve("miniapp/src");

function posix(value) {
  return value.split(sep).join("/");
}

function sourceFiles(root) {
  const files = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(?:ts|tsx|vue)$/.test(entry.name)) files.push(path);
    }
  }
  walk(root);
  return files;
}

function scriptSource(file, contents) {
  if (!file.endsWith(".vue")) return contents;
  const match = contents.match(/<script\b[^>]*>([\s\S]*?)<\/script>/);
  return match?.[1] ?? "";
}

function importSpecifiers(file, contents) {
  const source = ts.createSourceFile(
    file,
    scriptSource(file, contents),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".vue") ? ts.ScriptKind.TS : ts.ScriptKind.TSX,
  );
  const specifiers = [];
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) ||
        ts.isExportDeclaration(node) ||
        ts.isImportEqualsDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return specifiers;
}

function featureName(file, sourceRoot) {
  const path = posix(relative(sourceRoot, file));
  const match = path.match(/^features\/([^/]+)\//);
  return match?.[1] ?? null;
}

function resolvedTarget(file, specifier, sourceRoot) {
  if (!specifier.startsWith(".")) return null;
  const path = posix(resolve(dirname(file), specifier));
  if (isAbsolute(relative(sourceRoot, path))) return null;
  return relative(sourceRoot, path).split(sep).join("/");
}

function checkArchitecture(sourceRoot = SOURCE_ROOT) {
  const violations = [];
  const featureDirectories = new Set();
  if (existsSync(join(sourceRoot, "features"))) {
    for (const entry of readdirSync(join(sourceRoot, "features"), {
      withFileTypes: true,
    })) {
      if (entry.isDirectory()) featureDirectories.add(entry.name);
    }
  }
  for (const feature of [...featureDirectories].sort()) {
    const entry = join(sourceRoot, "features", feature, "index.ts");
    if (!existsSync(entry)) {
      violations.push({
        file: posix(relative(sourceRoot, entry)),
        message: `缺少公开入口 features/${feature}/index.ts`,
      });
    }
  }
  for (const file of sourceFiles(sourceRoot).sort()) {
    const source = posix(relative(sourceRoot, file));
    const fromFeature = featureName(file, sourceRoot);
    const contents = readFileSync(file, "utf8");
    for (const specifier of importSpecifiers(file, contents)) {
      const target = resolvedTarget(file, specifier, sourceRoot);
      if (!target) continue;
      const targetMatch = target.match(/^features\/([^/]+)(\/.*)?$/);
      if (!targetMatch) continue;
      const [, toFeature, internal = ""] = targetMatch;
      const publicEntry =
        internal === "" || /^\/index(?:\.ts|\.tsx)?$/.test(internal);
      if (source.startsWith("shared/")) {
        violations.push({
          file: source,
          message: `shared 不得依赖 features：${specifier}`,
        });
      } else if (fromFeature && toFeature !== fromFeature && !publicEntry) {
        violations.push({
          file: source,
          message: `跨 feature 不得引用内部模块：${specifier}`,
        });
      } else if (!fromFeature && !publicEntry) {
        violations.push({
          file: source,
          message: `外部消费者必须使用 feature 公开入口：${specifier}`,
        });
      }
    }
  }
  return violations;
}

function runSelfTest() {
  const fixture = mkdtempSync(join(tmpdir(), "miniapp-architecture-"));
  try {
    const write = (path, contents) => {
      const file = join(fixture, path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, contents, "utf8");
    };
    write("features/auth/index.ts", "export const auth = true\n");
    write("features/workspace/index.ts", "export const workspace = true\n");
    write("shared/types/user.ts", "export type User = { id: number }\n");
    write("app.ts", "import { auth } from './features/auth'\n");
    write(
      "features/auth/internal.ts",
      "import { workspace } from '../workspace'\n",
    );
    assert.deepEqual(checkArchitecture(fixture), []);

    write(
      "shared/ui/Button.ts",
      "import { auth } from '../../features/auth'\n",
    );
    assert.match(
      checkArchitecture(fixture)[0]?.message,
      /shared 不得依赖 features/,
    );
    rmSync(join(fixture, "shared/ui/Button.ts"));

    write(
      "features/auth/internal.ts",
      "import { workspace } from '../workspace/internal'\n",
    );
    assert.ok(
      checkArchitecture(fixture).some(
        (item) =>
          item.message === "跨 feature 不得引用内部模块：../workspace/internal",
      ),
    );
    rmSync(join(fixture, "features/workspace/internal.ts"), { force: true });

    write("app.ts", "import { auth } from './features/auth/internal'\n");
    assert.ok(
      checkArchitecture(fixture).some(
        (item) => item.file === "app.ts" && /公开入口/.test(item.message),
      ),
    );

    rmSync(join(fixture, "features/workspace/index.ts"));
    assert.match(
      checkArchitecture(fixture).find(
        (item) => item.file === "features/workspace/index.ts",
      )?.message ?? "",
      /缺少公开入口/,
    );
    return "MINIAPP_ARCHITECTURE_SELFTEST_OK";
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

function main(args) {
  if (args.includes("--self-test")) {
    console.info(runSelfTest());
    return;
  }
  const violations = checkArchitecture();
  for (const violation of violations) {
    console.error(
      `MINIAPP_ARCHITECTURE_VIOLATION ${violation.file}: ${violation.message}`,
    );
  }
  if (violations.length > 0) {
    throw new Error(`功能域边界检查失败：${violations.length} 项`);
  }
  console.info("MINIAPP_ARCHITECTURE_OK");
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

export { checkArchitecture, runSelfTest };
