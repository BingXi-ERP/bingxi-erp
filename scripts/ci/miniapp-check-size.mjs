#!/usr/bin/env node
// 微信构建产物体积门：递归统计所有文件字节，扫描空目录按判定器故障处理。

import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function checkSize(root, limitKb) {
  const absoluteRoot = resolve(root);
  const limit = Number(limitKb);
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error(
      `TOOL_BUG: size limit must be a positive integer: ${limitKb}`,
    );
  }
  if (!existsSync(absoluteRoot) || !statSync(absoluteRoot).isDirectory()) {
    throw new Error(`TOOL_BUG: build root not found: ${absoluteRoot}`);
  }

  let bytes = 0;
  let files = 0;
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        bytes += statSync(full).size;
        files += 1;
      }
    }
  }
  walk(absoluteRoot);
  if (files === 0) {
    throw new Error(`TOOL_BUG: build root contains no files: ${absoluteRoot}`);
  }
  return { totalKb: Math.ceil(bytes / 1024), limitKb: limit };
}

function main() {
  if (process.argv.length !== 4) {
    console.error(
      "TOOL_BUG: usage: miniapp-check-size.mjs <build-root> <limit-kb>",
    );
    process.exit(2);
  }
  try {
    const { totalKb, limitKb } = checkSize(process.argv[2], process.argv[3]);
    console.log(`MINIAPP_SIZE totalKb=${totalKb} limitKb=${limitKb}`);
    process.exit(totalKb > limitKb ? 1 : 0);
  } catch (error) {
    console.error(
      `MINIAPP_SIZE_TOOL_ERROR ${error instanceof Error ? error.message : String(error)}`,
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
