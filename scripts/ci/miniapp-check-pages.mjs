// pages.json 声明页与磁盘源码对账：缺页是业务红，配置或扫描异常是判定器故障。

import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EXTENSIONS = [".vue", ".ts", ".js"];

export function checkPages(root) {
  const absoluteRoot = resolve(root);
  const configPath = join(absoluteRoot, "pages.json");
  if (!existsSync(configPath)) {
    throw new Error(`TOOL_BUG: pages.json not found: ${configPath}`);
  }

  const config = JSON.parse(readFileSync(configPath, "utf8"));
  if (!Array.isArray(config.pages) || config.pages.length === 0) {
    throw new Error(
      "TOOL_BUG: pages.json must declare a non-empty pages array",
    );
  }

  const declared = config.pages.map((page) => {
    const path = page?.path;
    if (
      typeof path !== "string" ||
      path.trim() === "" ||
      path.startsWith("/") ||
      path.split(/[\\/]/).includes("..")
    ) {
      throw new Error(`TOOL_BUG: invalid declared page path: ${String(path)}`);
    }
    return path;
  });
  if (new Set(declared).size !== declared.length) {
    throw new Error("TOOL_BUG: pages.json contains duplicate page paths");
  }

  const missing = declared.filter((path) => {
    const base = join(absoluteRoot, path);
    return !EXTENSIONS.some((extension) => {
      const candidate = `${base}${extension}`;
      return existsSync(candidate) && statSync(candidate).isFile();
    });
  });
  return { declared, missing };
}

function main() {
  if (process.argv.length !== 3) {
    console.error("TOOL_BUG: usage: miniapp-check-pages.mjs <src-root>");
    process.exit(2);
  }
  try {
    const { declared, missing } = checkPages(process.argv[2]);
    for (const path of missing) console.error(`MISSING_PAGE ${path}`);
    if (missing.length > 0) process.exit(1);
    console.log(`MINIAPP_PAGES declared=${declared.length} missing=0`);
  } catch (error) {
    console.error(
      `MINIAPP_PAGES_TOOL_ERROR ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(2);
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main();
}
