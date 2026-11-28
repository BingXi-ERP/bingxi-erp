#!/usr/bin/env node
import {
  appendFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AUDIT_REPORT = "miniapp/test-results/miniapp-npm-audit.json";
const PAGES_CONFIG = "miniapp/src/pages.json";
const BUILD_ROOT = "miniapp/dist/build/mp-weixin";
const E2E_RESULTS = "miniapp/test-results";
const E2E_ARTIFACT_FILES = [
  "e2e.json",
  "exit-code.txt",
  "backend.log",
  "backend.stderr.log",
  "automator.stdout.log",
  "automator.stderr.log",
  "readiness.json",
  "init-status.json",
];

function requireEvidenceContext(context) {
  const sha = context.headSha === undefined ? context.sha : context.headSha;
  if (!/^[0-9a-f]{40}$/i.test(sha ?? "")) {
    throw new Error(
      "Step Summary 必须使用完整 40 位 HEAD_SHA（PR）或 github.sha（非 PR）",
    );
  }
  if (
    typeof context.jobStatus !== "string" ||
    context.jobStatus.trim() === ""
  ) {
    throw new Error("Step Summary 缺少 job.status");
  }
  return sha;
}

function readJson(path) {
  if (!existsSync(path)) return { state: "not-generated", data: null };
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      return { state: "report-parse-error", data: null };
    }
    return { state: "ok", data };
  } catch {
    return { state: "report-parse-error", data: null };
  }
}

function outcome(value) {
  return typeof value === "string" && value.trim() !== "" ? value : "not-run";
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 ? String(value) : "invalid";
}

function artifactSize(root) {
  const buildRoot = join(root, BUILD_ROOT);
  if (!existsSync(buildRoot) || !statSync(buildRoot).isDirectory()) return null;
  let bytes = 0;
  let files = 0;
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else {
        bytes += statSync(path).size;
        files += 1;
      }
    }
  }
  walk(buildRoot);
  return { bytes, files, totalKb: Math.ceil(bytes / 1024) };
}

export function buildStaticSummary(context) {
  const sha = requireEvidenceContext(context);
  const root = resolve(context.root ?? process.cwd());
  const audit = readJson(join(root, AUDIT_REPORT));
  const pages = readJson(join(root, PAGES_CONFIG));
  const size = artifactSize(root);
  const lines = [
    "## 新小程序静态门摘要",
    "",
    `- SHA：\`${sha}\``,
    `- job.status：\`${context.jobStatus}\``,
    `- npm audit 步骤：\`${outcome(context.auditOutcome)}\``,
  ];

  if (audit.state === "ok") {
    const summary = audit.data.summary;
    const validSummary =
      summary !== null &&
      typeof summary === "object" &&
      !Array.isArray(summary);
    lines.push(
      `- npm audit 摘要：${validSummary ? ["critical", "high", "moderate", "low", "info", "total"].map((key) => `${key}=${count(summary[key])}`).join(" ") : "report-schema-error"}`,
    );
    lines.push(
      `- 审计分类：productionBlockers=${Array.isArray(audit.data.productionBlockers) ? audit.data.productionBlockers.length : "invalid"} devBlockers=${Array.isArray(audit.data.devBlockers) ? audit.data.devBlockers.length : "invalid"} devRiskStatus=${typeof audit.data.devOnlyRiskAcceptance?.status === "string" ? audit.data.devOnlyRiskAcceptance.status : "missing"}`,
    );
  } else {
    lines.push(
      `- npm audit 摘要：${audit.state}${audit.state === "not-generated" ? "（报告不存在）" : "（报告不可解析）"}`,
    );
  }

  const declaredPages = Array.isArray(pages.data?.pages)
    ? pages.data.pages.length
    : null;
  lines.push(
    `- 声明页数：${declaredPages === null ? `${pages.state}（pages.json 无效或缺失）` : declaredPages}；页面门：\`${outcome(context.pagesOutcome)}\``,
    `- 架构扫描：\`${outcome(context.architectureOutcome)}\``,
    `- 源码扫描：\`${outcome(context.sourceOutcome)}\``,
    `- 静态门步骤：\`${outcome(context.staticOutcome)}\``,
  );
  if (size === null) {
    lines.push("- 真实包体积：not-generated（构建产物不存在）");
  } else {
    lines.push(
      `- 真实包体积：${size.bytes} bytes / ${size.totalKb} KB（${size.files} files）；体积门：\`${outcome(context.sizeOutcome)}\`；上限：2048 KB`,
    );
  }
  lines.push(`- 构建产物路径：\`${BUILD_ROOT}\``, "");
  return lines.join("\n");
}

export function buildE2ESummary(context) {
  const sha = requireEvidenceContext(context);
  const root = resolve(context.root ?? process.cwd());
  const resultsRoot = join(root, E2E_RESULTS);
  const exitCodePath = join(resultsRoot, "exit-code.txt");
  const exitCode = existsSync(exitCodePath)
    ? readFileSync(exitCodePath, "utf8").trim()
    : null;
  const report = readJson(join(resultsRoot, "e2e.json"));
  const lines = [
    "## 新小程序运行时 E2E 摘要",
    "",
    `- SHA：\`${sha}\``,
    `- job.status：\`${context.jobStatus}\``,
    `- E2E 步骤：\`${outcome(context.e2eOutcome)}\``,
    `- exit-code：\`${exitCode === null ? "not-generated" : /^\d+$/.test(exitCode) ? exitCode : "invalid"}\``,
  ];

  if (report.state === "ok") {
    lines.push(
      `- 测试数量：total=${count(report.data.numTotalTests)} passed=${count(report.data.numPassedTests)} failed=${count(report.data.numFailedTests)} pending=${count(report.data.numPendingTests)} todo=${count(report.data.numTodoTests)}`,
    );
    const result =
      report.data.success === true
        ? "passed"
        : report.data.success === false
          ? "failed"
          : "invalid";
    lines.push(`- 测试结果：\`${result}\``);
  } else {
    lines.push(`- 测试数量：${report.state}`, `- 测试结果：${report.state}`);
  }

  lines.push(
    `- 制品敏感信息扫描：\`${outcome(context.scanOutcome)}\``,
    `- 制品路径：\`miniapp-e2e-results\`（本地目录 \`${E2E_RESULTS}/\`）`,
    `- 制品白名单：${E2E_ARTIFACT_FILES.map((file) => `\`${file}\``).join("、")}`,
    `- 制品上传：\`${outcome(context.uploadOutcome)}\``,
    "",
  );
  return lines.join("\n");
}

export function appendStepSummary(path, markdown) {
  appendFileSync(
    path,
    markdown.endsWith("\n") ? markdown : `${markdown}\n`,
    "utf8",
  );
}

function main(args) {
  if (args.length !== 2 || args[0] !== "--mode") {
    throw new Error(
      "usage: miniapp-write-step-summary.mjs --mode <static|e2e>",
    );
  }
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) throw new Error("缺少 GITHUB_STEP_SUMMARY");
  const context = {
    root: process.cwd(),
    headSha: process.env.HEAD_SHA,
    sha: process.env.GITHUB_SHA,
    jobStatus: process.env.JOB_STATUS,
    auditOutcome: process.env.NPM_AUDIT_OUTCOME,
    staticOutcome: process.env.STATIC_GATE_OUTCOME,
    architectureOutcome: process.env.ARCHITECTURE_OUTCOME,
    sourceOutcome: process.env.SOURCE_OUTCOME,
    pagesOutcome: process.env.PAGES_OUTCOME,
    sizeOutcome: process.env.SIZE_OUTCOME,
    e2eOutcome: process.env.E2E_OUTCOME,
    scanOutcome: process.env.ARTIFACT_SCAN_OUTCOME,
    uploadOutcome: process.env.ARTIFACT_UPLOAD_OUTCOME,
  };
  const markdown =
    args[1] === "static"
      ? buildStaticSummary(context)
      : args[1] === "e2e"
        ? buildE2ESummary(context)
        : (() => {
            throw new Error(`未知摘要模式：${args[1]}`);
          })();
  appendStepSummary(summaryPath, markdown);
  console.info(`MINIAPP_STEP_SUMMARY_OK mode=${args[1]}`);
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
