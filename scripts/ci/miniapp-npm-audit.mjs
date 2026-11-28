#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BLOCKING_SEVERITIES = new Set(["critical", "high"]);
const SEVERITY_ORDER = { critical: 4, high: 3, moderate: 2, low: 1, info: 0 };
const DEV_RISK_ACCEPTANCE_SCOPE = "dev/build/test dependency tree only";
const AUDIT_SEVERITIES = new Set([
  "critical",
  "high",
  "moderate",
  "low",
  "info",
]);
const AUDIT_COUNT_FIELDS = [...AUDIT_SEVERITIES, "total"];
const DEV_RISK_ACCEPTANCE_PATH =
  "docs/security/miniapp-dev-dependency-risk-acceptance.json";

function normalizePath(value) {
  const slashed = value.replaceAll("\\", "/").replace(/\/+$/, "");
  return process.platform === "win32" ? slashed.toLowerCase() : slashed;
}

function productionEntries(tree, root) {
  const entries = new Map();
  function walk(dependencies, parentPath = []) {
    for (const [name, dependency] of Object.entries(dependencies ?? {})) {
      const dependencyPath = [...parentPath, name];
      const projectPath = dependency.path
        ? normalizePath(relative(root, dependency.path))
        : normalizePath(
            `node_modules/${dependencyPath.join("/node_modules/")}`,
          );
      const installedPath = dependency.path
        ? normalizePath(dependency.path)
        : normalizePath(resolve(root, projectPath));
      entries.set(installedPath, {
        name,
        version: dependency.version,
        path: projectPath,
        chain: dependencyPath.join(" > "),
      });
      entries.set(projectPath, {
        name,
        version: dependency.version,
        path: projectPath,
        chain: dependencyPath.join(" > "),
      });
      walk(dependency.dependencies, dependencyPath);
    }
  }
  walk(tree.dependencies);
  return entries;
}

function acceptancePackageName(entry) {
  return entry.split("|")[0] ?? "";
}

function acceptanceEntryKey(packageEntry, advisory) {
  return [
    packageEntry.name,
    packageEntry.version,
    normalizePath(packageEntry.node),
    advisory.url,
    advisory.range,
    advisory.severity,
    packageEntry.scope,
  ].join("|");
}

function evaluateDevRiskAcceptance(
  riskAcceptance,
  requiredPackages,
  options = {},
) {
  const now =
    options.now instanceof Date
      ? options.now
      : new Date(options.now ?? Date.now());
  const reasons = [];
  if (options.error) reasons.push(options.error);

  const status =
    typeof riskAcceptance?.status === "string"
      ? riskAcceptance.status
      : options.error
        ? "invalid"
        : "missing";
  if (status !== "approved") {
    reasons.push(`风险接受状态为 ${status}，不是 approved`);
  }

  const approvedBy = riskAcceptance?.approvedBy;
  if (typeof approvedBy !== "string" || approvedBy.trim() === "") {
    reasons.push("approvedBy 缺失或为空");
  }

  const approvedAt = parseRiskTimestamp(
    riskAcceptance?.approvedAt,
    "approvedAt",
    reasons,
  );
  const expiresAt = parseRiskTimestamp(
    riskAcceptance?.expiresAt,
    "expiresAt",
    reasons,
  );
  if (approvedAt && approvedAt.getTime() > now.getTime()) {
    reasons.push("approvedAt 晚于当前时间");
  }
  if (approvedAt && expiresAt && expiresAt.getTime() <= approvedAt.getTime()) {
    reasons.push("expiresAt 必须晚于 approvedAt");
  }
  if (expiresAt && now.getTime() >= expiresAt.getTime()) {
    reasons.push(`风险接受已于 ${expiresAt.toISOString()} 过期`);
  }

  const scope = riskAcceptance?.scope;
  if (scope !== DEV_RISK_ACCEPTANCE_SCOPE) {
    reasons.push(`scope 必须为 ${DEV_RISK_ACCEPTANCE_SCOPE}`);
  }

  const acceptedPackages = riskAcceptance?.packages;
  if (!Array.isArray(acceptedPackages)) {
    reasons.push("packages 必须为精确接受记录数组");
  }
  const acceptedEntries = new Set();
  if (Array.isArray(acceptedPackages)) {
    for (const entry of acceptedPackages) {
      if (
        !entry ||
        typeof entry !== "object" ||
        typeof entry.name !== "string" ||
        entry.name.trim() === "" ||
        typeof entry.version !== "string" ||
        entry.version.trim() === "" ||
        typeof entry.node !== "string" ||
        entry.node.trim() === "" ||
        entry.scope !== DEV_RISK_ACCEPTANCE_SCOPE ||
        !Array.isArray(entry.advisories) ||
        entry.advisories.length === 0
      ) {
        reasons.push(
          "packages 含无效的包名、版本、安装节点、advisory 或 scope",
        );
        continue;
      }
      for (const advisory of entry.advisories) {
        if (
          !advisory ||
          typeof advisory !== "object" ||
          typeof advisory.url !== "string" ||
          !/^https:\/\//.test(advisory.url) ||
          typeof advisory.range !== "string" ||
          advisory.range.trim() === "" ||
          !AUDIT_SEVERITIES.has(advisory.severity)
        ) {
          reasons.push(`packages 含无效 advisory：${entry.name}`);
          continue;
        }
        const key = acceptanceEntryKey(entry, advisory);
        if (acceptedEntries.has(key)) {
          reasons.push(`packages 含重复接受记录：${entry.name}`);
        }
        acceptedEntries.add(key);
      }
    }
  }
  const requiredEntries = new Set(requiredPackages);
  const uncoveredEntries = [...requiredEntries]
    .filter((entry) => !acceptedEntries.has(entry))
    .sort();
  const unexpectedEntries = [...acceptedEntries]
    .filter((entry) => !requiredEntries.has(entry))
    .sort();
  const packageNames = (entries) =>
    [...new Set(entries.map(acceptancePackageName))].sort();
  const uncoveredPackages = packageNames(uncoveredEntries);
  const unexpectedPackages = packageNames(unexpectedEntries);
  if (uncoveredPackages.length > 0) {
    reasons.push(`packages 未精确覆盖：${uncoveredPackages.join(", ")}`);
  }
  if (unexpectedPackages.length > 0) {
    reasons.push(`packages 含多余接受记录：${unexpectedPackages.join(", ")}`);
  }

  let acceptanceStatus = status;
  if (status === "approved") {
    acceptanceStatus =
      expiresAt && now.getTime() >= expiresAt.getTime()
        ? "expired"
        : reasons.length === 0
          ? "approved-unexpired"
          : "invalid";
  }

  return {
    ok: reasons.length === 0,
    status: acceptanceStatus,
    path: options.path ?? null,
    scope: typeof scope === "string" ? scope : null,
    approvedBy: typeof approvedBy === "string" ? approvedBy.trim() : null,
    approvedAt: approvedAt?.toISOString() ?? null,
    expiresAt: expiresAt?.toISOString() ?? null,
    requiredPackages: [
      ...new Set([...requiredPackages].map(acceptancePackageName)),
    ].sort(),
    requiredEntries: [...requiredEntries].sort(),
    acceptedEntries: [...acceptedEntries].sort(),
    uncoveredEntries,
    unexpectedEntries,
    uncoveredPackages,
    unexpectedPackages,
    reasons,
  };
}

function parseRiskTimestamp(value, field, reasons) {
  if (typeof value !== "string" || value.trim() === "") {
    reasons.push(`${field} 缺失或为空`);
    return null;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    reasons.push(`${field} 不是合法时间：${value}`);
    return null;
  }
  return new Date(timestamp);
}

function dispositionFor(row, devRiskAccepted) {
  if (row.production && BLOCKING_SEVERITIES.has(row.severity)) {
    return {
      disposition:
        "阻断发布：升级、移除或隔离后复扫；不接受生产 critical/high 风险",
      owner: "小程序依赖维护者 / 安全负责人",
      deadline: "2026-12-12（发布前）",
    };
  }
  if (!row.production) {
    return {
      disposition:
        row.severity === "critical" || row.severity === "high"
          ? devRiskAccepted
            ? "已批准风险接受：仅 dev/build/test 树，不进生产运行时；升级或移除前不得用于处理不可信输入"
            : "阻断门禁：dev critical/high 风险接受未批准、无效或已过期"
          : "计划治理：仅 dev/build/test 树；随工具链升级一并治理",
      owner: "前端测试工具维护者 / 安全负责人",
      deadline: "以风险接受文件 expiresAt 为准",
    };
  }
  return {
    disposition:
      "计划升级：随 uni-app/Vue 工具链升级复扫，发布前由安全负责人复核可达性",
    owner: "小程序依赖维护者",
    deadline: "2026-12-31",
  };
}

export function evaluateAudit(
  audit,
  productionTree,
  root = process.cwd(),
  options = {},
) {
  const production = productionEntries(productionTree, root);
  const installedEntries = productionEntries(options.installedTree ?? {}, root);
  const rows = [];
  for (const vulnerability of Object.values(audit.vulnerabilities ?? {})) {
    for (const node of vulnerability.nodes ?? []) {
      const normalizedNode = normalizePath(node);
      const absoluteNode = normalizePath(resolve(root, node));
      const installed =
        production.get(absoluteNode) ?? production.get(normalizedNode);
      const fullInstalled =
        installedEntries.get(absoluteNode) ??
        installedEntries.get(normalizedNode);
      const row = {
        name: vulnerability.name,
        severity: vulnerability.severity,
        node,
        version: fullInstalled?.version ?? installed?.version ?? null,
        production: Boolean(installed),
        chain: installed?.chain ?? "not-in-production-tree",
        reachability: installed
          ? "production-dependency-tree"
          : "dev/build-only",
        fixAvailable: vulnerability.fixAvailable ?? null,
        advisories: vulnerability.via.flatMap((item) =>
          typeof item === "string"
            ? []
            : [
                {
                  title: item.title,
                  url: item.url,
                  severity: item.severity,
                  range: item.range,
                },
              ],
        ),
      };
      rows.push(row);
    }
  }
  rows.sort(
    (left, right) =>
      (SEVERITY_ORDER[right.severity] ?? 0) -
        (SEVERITY_ORDER[left.severity] ?? 0) ||
      left.name.localeCompare(right.name) ||
      left.node.localeCompare(right.node),
  );
  const productionBlockers = rows.filter(
    (row) => row.production && BLOCKING_SEVERITIES.has(row.severity),
  );
  const devBlockers = rows.filter(
    (row) => !row.production && BLOCKING_SEVERITIES.has(row.severity),
  );
  const requiredDevRiskPackages = new Set(
    devBlockers.flatMap((row) => {
      if (typeof row.version !== "string" || row.version.trim() === "") {
        return [
          `${row.name}|unresolved-version|${normalizePath(row.node)}|unresolved-advisory|unresolved-range|unresolved-severity|${DEV_RISK_ACCEPTANCE_SCOPE}`,
        ];
      }
      if (row.advisories.length === 0) {
        return [
          `${row.name}|${row.version}|${normalizePath(row.node)}|unresolved-advisory|unresolved-range|unresolved-severity|${DEV_RISK_ACCEPTANCE_SCOPE}`,
        ];
      }
      return row.advisories.map((advisory) =>
        acceptanceEntryKey(
          {
            name: row.name,
            version: row.version,
            node: row.node,
            scope: DEV_RISK_ACCEPTANCE_SCOPE,
          },
          advisory,
        ),
      );
    }),
  );
  const devOnlyRiskAcceptance = evaluateDevRiskAcceptance(
    options.riskAcceptance,
    requiredDevRiskPackages,
    {
      now: options.now,
      error: options.riskAcceptanceError,
      path: options.acceptancePath ?? null,
    },
  );
  for (const row of rows) {
    Object.assign(row, dispositionFor(row, devOnlyRiskAcceptance.ok));
  }
  rows.sort(
    (left, right) =>
      (SEVERITY_ORDER[right.severity] ?? 0) -
        (SEVERITY_ORDER[left.severity] ?? 0) ||
      left.name.localeCompare(right.name) ||
      left.node.localeCompare(right.node),
  );
  const criticalPackages = [
    ...new Set(
      rows.filter((row) => row.severity === "critical").map((row) => row.name),
    ),
  ];
  return {
    ok:
      productionBlockers.length === 0 &&
      (devBlockers.length === 0 || devOnlyRiskAcceptance.ok),
    rows,
    productionBlockers,
    devBlockers,
    criticalPackages,
    summary: audit.metadata?.vulnerabilities ?? {},
    devOnlyRiskAcceptance,
  };
}

function markdownReport(result) {
  const lines = [
    "# 新小程序 npm audit 分类与处置",
    "",
    `- 审计时间：${new Date().toISOString()}`,
    `- 数据源：\`npm audit --json\` + \`npm ls --omit=dev --all --long --json\``,
    `- 结论：${
      result.ok
        ? "生产依赖树无 critical/high 阻断项，dev critical/high 风险接受有效或无此类漏洞"
        : `生产阻断 ${result.productionBlockers.length} 个；dev critical/high 阻断 ${result.devBlockers.length} 个`
    }`,
    `- 漏洞汇总：${Object.entries(result.summary)
      .map(([key, value]) => `${key}=${value}`)
      .join("，")}`,
    "- 生产依赖树出现 critical/high 即非零退出；dev/build-only critical/high 仅在风险接受文件有效且覆盖全部包名时放行。",
    "- “生产依赖树”是 npm 声明树判定，不等同于已证明运行时代码可达；可达性均需按具体构建产物复核。",
    "",
    "## Critical 逐项台账",
    "",
    "| 包名 | 严重级 | 安装节点 | 生产树 | 处置 | 负责人角色 | 期限 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const name of result.criticalPackages) {
    const matching = result.rows.filter((row) => row.name === name);
    for (const row of matching) {
      lines.push(
        `| \`${row.name}\` | ${row.severity} | \`${row.node}\` | ${row.production ? "是" : "否"} | ${row.disposition} | ${row.owner} | ${row.deadline} |`,
      );
    }
  }
  lines.push(
    "",
    "## 全部漏洞节点",
    "",
    "| 包名 | 严重级 | 版本 | 生产树 | 依赖路径/可达性 | 修复建议 | 处置 | 负责人角色 | 期限 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const row of result.rows) {
    const fix = row.fixAvailable?.name
      ? `${row.fixAvailable.name}@${row.fixAvailable.version}${row.fixAvailable.isSemVerMajor ? "（major）" : ""}`
      : "暂无自动修复；需移除、替换或等待上游";
    lines.push(
      `| \`${row.name}\` | ${row.severity} | ${row.version ?? "未在生产树解析"} | ${row.production ? "是" : "否"} | ${row.chain} / ${row.reachability} | ${fix} | ${row.disposition} | ${row.owner} | ${row.deadline} |`,
    );
  }
  lines.push(
    "",
    "## 风险接受记录",
    "",
    `- 文件：\`${result.devOnlyRiskAcceptance.path ?? "未提供"}\``,
    `- 状态：\`${result.devOnlyRiskAcceptance.status}\``,
    `- 范围：\`${result.devOnlyRiskAcceptance.scope ?? "缺失"}\``,
    `- 到期时间：\`${result.devOnlyRiskAcceptance.expiresAt ?? "缺失"}\``,
    `- 当前 dev critical/high 包：${result.devOnlyRiskAcceptance.requiredPackages.join(", ") || "无"}`,
    `- 未覆盖包：${result.devOnlyRiskAcceptance.uncoveredPackages.join(", ") || "无"}`,
    `- 阻断原因：${result.devOnlyRiskAcceptance.reasons.join("；") || "无"}`,
    "- 生产 critical/high：不接受风险，必须清零后发布。",
    "",
  );
  return lines.join("\n");
}

function runNpm(args, cwd) {
  const result = spawnSync("npm", args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status === null)
    throw new Error(`npm ${args.join(" ")} 被信号终止：${result.signal}`);
  return result;
}

function parseJson(output, command) {
  try {
    return JSON.parse(output.trim());
  } catch {
    throw new Error(`${command} 未返回合法 JSON`);
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertAuditSchema(audit) {
  if (isObject(audit) && Object.hasOwn(audit, "error")) {
    throw new Error("npm audit 返回 error 对象，审计失败");
  }
  if (!isObject(audit) || !isObject(audit.vulnerabilities)) {
    throw new Error("npm audit JSON 缺少合法 vulnerabilities 对象");
  }
  if (!isObject(audit.metadata) || !isObject(audit.metadata.vulnerabilities)) {
    throw new Error("npm audit JSON 缺少合法 metadata.vulnerabilities 对象");
  }
  const summary = audit.metadata.vulnerabilities;
  for (const field of AUDIT_COUNT_FIELDS) {
    if (
      !Object.hasOwn(summary, field) ||
      !Number.isSafeInteger(summary[field]) ||
      summary[field] < 0
    ) {
      throw new Error(
        `npm audit metadata.vulnerabilities.${field} 必须为非负整数`,
      );
    }
  }
  const severityTotal = [...AUDIT_SEVERITIES].reduce(
    (total, severity) => total + summary[severity],
    0,
  );
  if (summary.total !== severityTotal) {
    throw new Error(
      `npm audit metadata.vulnerabilities.total 必须等于各级之和 ${severityTotal}`,
    );
  }
  const detailedCounts = Object.fromEntries(
    [...AUDIT_SEVERITIES].map((severity) => [severity, 0]),
  );
  for (const [name, vulnerability] of Object.entries(audit.vulnerabilities)) {
    if (
      name.trim() === "" ||
      !isObject(vulnerability) ||
      vulnerability.name !== name ||
      !AUDIT_SEVERITIES.has(vulnerability.severity) ||
      !Array.isArray(vulnerability.nodes) ||
      vulnerability.nodes.length === 0 ||
      vulnerability.nodes.some(
        (node) => typeof node !== "string" || node.trim() === "",
      ) ||
      !Array.isArray(vulnerability.via)
    ) {
      throw new Error(`npm audit vulnerabilities schema 非法：${name}`);
    }
    detailedCounts[vulnerability.severity] += 1;
    for (const advisory of vulnerability.via) {
      if (typeof advisory === "string" && advisory.trim() !== "") continue;
      if (
        !isObject(advisory) ||
        typeof advisory.title !== "string" ||
        typeof advisory.url !== "string" ||
        !/^https:\/\//.test(advisory.url) ||
        typeof advisory.range !== "string" ||
        advisory.range.trim() === "" ||
        !AUDIT_SEVERITIES.has(advisory.severity)
      ) {
        throw new Error(`npm audit advisory schema 非法：${name}`);
      }
    }
  }
  for (const severity of AUDIT_SEVERITIES) {
    if (summary[severity] !== detailedCounts[severity]) {
      throw new Error(
        `npm audit metadata.vulnerabilities.${severity}=${summary[severity]} 与漏洞明细 ${detailedCounts[severity]} 不一致`,
      );
    }
  }
}

export function parseAuditRun(run) {
  if (run?.error) throw run.error;
  if (run?.status !== 0 && run?.status !== 1) {
    throw new Error(
      `npm audit --json status 非法：${String(run?.status)} signal=${String(run?.signal)}`,
    );
  }
  const audit = parseJson(run.stdout, "npm audit --json");
  assertAuditSchema(audit);
  if (run.status === 1 && Object.keys(audit.vulnerabilities).length === 0) {
    throw new Error("npm audit status 1 但未返回任何漏洞，拒绝判定为审计成功");
  }
  return audit;
}

export function runSelfTest() {
  const advisory = {
    title: "dev-only advisory",
    url: "https://github.com/advisories/GHSA-miniapp-test",
    severity: "critical",
    range: "<2.0.0",
  };
  const audit = {
    metadata: {
      vulnerabilities: {
        critical: 1,
        high: 1,
        moderate: 0,
        low: 0,
        info: 0,
        total: 2,
      },
    },
    vulnerabilities: {
      "dev-critical": {
        name: "dev-critical",
        severity: "critical",
        nodes: ["node_modules/dev-critical"],
        via: [advisory],
      },
      "prod-high": {
        name: "prod-high",
        severity: "high",
        nodes: ["node_modules/prod-high"],
        via: [],
      },
    },
  };
  const tree = {
    dependencies: {
      "prod-high": {
        version: "1.0.0",
      },
    },
  };
  const installedTree = {
    dependencies: {
      "dev-critical": { version: "1.0.0" },
      "prod-high": { version: "1.0.0" },
    },
  };
  const acceptedPackage = {
    name: "dev-critical",
    version: "1.0.0",
    node: "node_modules/dev-critical",
    advisories: [
      {
        url: advisory.url,
        range: advisory.range,
        severity: advisory.severity,
      },
    ],
    scope: DEV_RISK_ACCEPTANCE_SCOPE,
  };
  const approvedAcceptance = {
    status: "approved",
    approvedBy: "security-owner@example.invalid",
    approvedAt: "2026-11-01T00:00:00.000Z",
    expiresAt: "2026-12-31T23:59:59.000Z",
    scope: DEV_RISK_ACCEPTANCE_SCOPE,
    packages: [acceptedPackage],
    rationale: "self-test fixture",
    controls: ["self-test only"],
  };
  const blocked = evaluateAudit(audit, tree, "/project", {
    riskAcceptance: approvedAcceptance,
    installedTree,
    now: "2026-11-28T00:00:00.000Z",
  });
  assert.equal(
    blocked.ok,
    false,
    "production blockers must fail even with approval",
  );
  assert.deepEqual(blocked.criticalPackages, ["dev-critical"]);
  assert.equal(blocked.productionBlockers.length, 1);
  assert.match(markdownReport(blocked), /dev-critical/);

  const devOnlyAudit = {
    metadata: {
      vulnerabilities: {
        critical: 1,
        high: 0,
        moderate: 0,
        low: 0,
        info: 0,
        total: 1,
      },
    },
    vulnerabilities: { "dev-critical": audit.vulnerabilities["dev-critical"] },
  };
  const emptyTree = { dependencies: {} };
  const pending = evaluateAudit(devOnlyAudit, emptyTree, "/project", {
    riskAcceptance: { status: "pending" },
    now: "2026-11-28T00:00:00.000Z",
  });
  assert.equal(pending.ok, false, "pending acceptance must fail closed");
  assert.equal(pending.devBlockers.length, 1);
  assert.match(markdownReport(pending), /pending/);

  const approved = evaluateAudit(devOnlyAudit, emptyTree, "/project", {
    riskAcceptance: approvedAcceptance,
    installedTree,
    now: "2026-11-28T00:00:00.000Z",
  });
  assert.equal(approved.ok, true, "approved unexpired acceptance must pass");
  assert.equal(approved.devOnlyRiskAcceptance.status, "approved-unexpired");
  assert.match(markdownReport(approved), /approved-unexpired/);

  const expired = evaluateAudit(devOnlyAudit, emptyTree, "/project", {
    riskAcceptance: {
      ...approvedAcceptance,
      approvedAt: "2026-10-01T00:00:00.000Z",
      expiresAt: "2026-11-01T00:00:00.000Z",
    },
    installedTree,
    now: "2026-11-28T00:00:00.000Z",
  });
  assert.equal(expired.ok, false, "expired acceptance must fail closed");
  assert.equal(expired.devOnlyRiskAcceptance.status, "expired");
  assert.match(markdownReport(expired), /过期/);

  const scopeMissing = evaluateAudit(devOnlyAudit, emptyTree, "/project", {
    riskAcceptance: { ...approvedAcceptance, scope: null, packages: [] },
    installedTree,
    now: "2026-11-28T00:00:00.000Z",
  });
  assert.equal(
    scopeMissing.ok,
    false,
    "incomplete package coverage must fail closed",
  );
  assert.deepEqual(scopeMissing.devOnlyRiskAcceptance.uncoveredPackages, [
    "dev-critical",
  ]);
  assert.match(markdownReport(scopeMissing), /dev-critical/);

  const futureAdvisory = {
    title: "future advisory",
    url: "https://github.com/advisories/GHSA-miniapp-future",
    severity: "high",
    range: "<3.0.0",
  };
  const futureAudit = {
    metadata: {
      vulnerabilities: {
        critical: 1,
        high: 0,
        moderate: 0,
        low: 0,
        info: 0,
        total: 1,
      },
    },
    vulnerabilities: {
      "dev-critical": {
        ...audit.vulnerabilities["dev-critical"],
        via: [advisory, futureAdvisory],
      },
    },
  };
  const futureMismatch = evaluateAudit(futureAudit, emptyTree, "/project", {
    riskAcceptance: approvedAcceptance,
    installedTree,
    now: "2026-11-28T00:00:00.000Z",
  });
  assert.equal(futureMismatch.ok, false, "new advisories must fail closed");
  assert.deepEqual(futureMismatch.devOnlyRiskAcceptance.uncoveredPackages, [
    "dev-critical",
  ]);

  for (const mismatch of [
    { ...acceptedPackage, version: "9.9.9" },
    {
      ...acceptedPackage,
      node: "node_modules/other/node_modules/dev-critical",
    },
    { ...acceptedPackage, scope: "production" },
    {
      ...acceptedPackage,
      advisories: [{ ...acceptedPackage.advisories[0], range: "<1.0.0" }],
    },
  ]) {
    const result = evaluateAudit(devOnlyAudit, emptyTree, "/project", {
      riskAcceptance: { ...approvedAcceptance, packages: [mismatch] },
      installedTree,
      now: "2026-11-28T00:00:00.000Z",
    });
    assert.equal(
      result.ok,
      false,
      "acceptance tuple mismatch must fail closed",
    );
  }

  const extraAcceptance = evaluateAudit(devOnlyAudit, emptyTree, "/project", {
    riskAcceptance: {
      ...approvedAcceptance,
      packages: [acceptedPackage, { ...acceptedPackage, name: "unrelated" }],
    },
    installedTree,
    now: "2026-11-28T00:00:00.000Z",
  });
  assert.equal(
    extraAcceptance.ok,
    false,
    "extra accepted packages must fail closed",
  );
  assert.deepEqual(extraAcceptance.devOnlyRiskAcceptance.unexpectedPackages, [
    "unrelated",
  ]);

  const extraAdvisoryAcceptance = evaluateAudit(
    devOnlyAudit,
    emptyTree,
    "/project",
    {
      riskAcceptance: {
        ...approvedAcceptance,
        packages: [
          {
            ...acceptedPackage,
            advisories: [...acceptedPackage.advisories, futureAdvisory],
          },
        ],
      },
      installedTree,
      now: "2026-11-28T00:00:00.000Z",
    },
  );
  assert.equal(
    extraAdvisoryAcceptance.ok,
    false,
    "an extra advisory on an otherwise required package must fail closed",
  );
  assert.deepEqual(
    extraAdvisoryAcceptance.devOnlyRiskAcceptance.unexpectedPackages,
    ["dev-critical"],
  );
  assert.equal(
    extraAdvisoryAcceptance.devOnlyRiskAcceptance.unexpectedEntries.length,
    1,
    "acceptance differences must be reported at advisory-entry granularity",
  );

  const validRun = {
    status: 0,
    stdout: JSON.stringify(audit),
    stderr: "",
    error: undefined,
  };
  assert.deepEqual(parseAuditRun(validRun), audit);
  assert.deepEqual(parseAuditRun({ ...validRun, status: 1 }), audit);

  const validEmptyAudit = {
    metadata: {
      vulnerabilities: {
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0,
        info: 0,
        total: 0,
      },
    },
    vulnerabilities: {},
  };
  assert.deepEqual(
    parseAuditRun({ ...validRun, stdout: JSON.stringify(validEmptyAudit) }),
    validEmptyAudit,
  );
  assert.throws(
    () =>
      parseAuditRun({
        ...validRun,
        stdout: JSON.stringify({
          metadata: {
            vulnerabilities: {
              ...validEmptyAudit.metadata.vulnerabilities,
              high: 1,
              total: 1,
            },
          },
          vulnerabilities: {},
        }),
      }),
    /metadata.*vulnerabilities.*明细|漏洞明细/,
    "nonzero metadata with empty details must fail closed",
  );
  for (const summary of [
    { critical: 1, high: 1, total: 2 },
    {
      critical: 1,
      high: 1,
      moderate: 0,
      low: 0,
      info: 0,
      total: 3,
    },
    {
      critical: 1,
      high: 1,
      moderate: -1,
      low: 0,
      info: 0,
      total: 1,
    },
    {
      critical: 1,
      high: 1,
      moderate: 0.5,
      low: 0,
      info: 0,
      total: 2,
    },
    {
      critical: 0,
      high: 1,
      moderate: 0,
      low: 0,
      info: 0,
      total: 1,
    },
  ]) {
    assert.throws(
      () =>
        parseAuditRun({
          ...validRun,
          stdout: JSON.stringify({
            metadata: { vulnerabilities: summary },
            vulnerabilities: audit.vulnerabilities,
          }),
        }),
      /metadata\.vulnerabilities/,
      "missing, invalid, inconsistent or detail-mismatched counts must fail closed",
    );
  }
  assert.throws(
    () => parseAuditRun({ ...validRun, status: 1, stdout: "{not-json" }),
    /合法 JSON/,
    "malformed JSON must fail closed",
  );
  assert.throws(
    () =>
      parseAuditRun({
        ...validRun,
        status: 1,
        stdout: JSON.stringify({
          error: { code: "EAUDIT", summary: "audit failed" },
        }),
      }),
    /error/,
    "npm audit error objects must fail closed",
  );
  assert.throws(
    () => parseAuditRun({ ...validRun, status: 2 }),
    /status/,
    "unexpected nonzero status must fail closed",
  );
  assert.throws(
    () => parseAuditRun({ ...validRun, status: null, signal: "SIGTERM" }),
    /status/,
    "signal termination must fail closed",
  );
  assert.throws(
    () => parseAuditRun({ ...validRun, error: new Error("spawn failed") }),
    /spawn failed/,
    "spawn errors must fail closed",
  );
  assert.throws(
    () =>
      parseAuditRun({ ...validRun, stdout: JSON.stringify({ metadata: {} }) }),
    /vulnerabilities/,
    "schema-invalid JSON must fail closed",
  );
  assert.throws(
    () =>
      parseAuditRun({
        ...validRun,
        status: 1,
        stdout: JSON.stringify({
          metadata: {
            vulnerabilities: {
              critical: 0,
              high: 0,
              moderate: 0,
              low: 0,
              info: 0,
              total: 0,
            },
          },
          vulnerabilities: {},
        }),
      }),
    /status 1/,
    "empty vulnerability output cannot justify status 1",
  );

  return "MINIAPP_NPM_AUDIT_SELFTEST_OK";
}

function loadRiskAcceptance(path) {
  try {
    return { acceptance: JSON.parse(readFileSync(path, "utf8")), error: null };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        acceptance: null,
        error: `风险接受文件不存在：${path}`,
      };
    }
    return {
      acceptance: null,
      error: `风险接受文件不可读或不是合法 JSON：${path}`,
    };
  }
}

function main(args) {
  const miniappRoot = resolve("miniapp");
  const markdownOutput = resolve(
    args.includes("--markdown-output")
      ? args[args.indexOf("--markdown-output") + 1]
      : "miniapp/test-results/miniapp-npm-audit.md",
  );
  const jsonOutput = resolve(
    args.includes("--json-output")
      ? args[args.indexOf("--json-output") + 1]
      : "miniapp/test-results/miniapp-npm-audit.json",
  );
  const auditRun = runNpm(["audit", "--json"], miniappRoot);
  const audit = parseAuditRun(auditRun);
  const treeRun = runNpm(
    ["ls", "--omit=dev", "--all", "--long", "--json"],
    miniappRoot,
  );
  const installedTreeRun = runNpm(
    ["ls", "--all", "--long", "--json"],
    miniappRoot,
  );
  if (treeRun.status !== 0) {
    throw new Error(
      `生产依赖树读取失败：${treeRun.stderr.trim() || treeRun.stdout.trim()}`,
    );
  }
  if (installedTreeRun.status !== 0) {
    throw new Error(
      `完整安装依赖树读取失败：${installedTreeRun.stderr.trim() || installedTreeRun.stdout.trim()}`,
    );
  }
  const productionTree = parseJson(
    treeRun.stdout,
    "npm ls --omit=dev --all --long --json",
  );
  const installedTree = parseJson(
    installedTreeRun.stdout,
    "npm ls --all --long --json",
  );
  const riskAcceptancePath = resolve(DEV_RISK_ACCEPTANCE_PATH);
  const riskAcceptance = loadRiskAcceptance(riskAcceptancePath);
  const result = evaluateAudit(audit, productionTree, miniappRoot, {
    riskAcceptance: riskAcceptance.acceptance,
    riskAcceptanceError: riskAcceptance.error,
    acceptancePath: DEV_RISK_ACCEPTANCE_PATH,
    installedTree,
  });
  mkdirSync(dirname(markdownOutput), { recursive: true });
  mkdirSync(dirname(jsonOutput), { recursive: true });
  writeFileSync(markdownOutput, markdownReport(result), "utf8");
  writeFileSync(jsonOutput, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  for (const name of result.criticalPackages) {
    console.info(`MINIAPP_NPM_CRITICAL package=${name}`);
  }
  console.info(
    `MINIAPP_NPM_AUDIT_SUMMARY ${JSON.stringify(result.summary)} productionBlockers=${result.productionBlockers.length} devBlockers=${result.devBlockers.length} devRiskStatus=${result.devOnlyRiskAcceptance.status}`,
  );
  console.info(
    `MINIAPP_NPM_AUDIT_REPORT markdown=${markdownOutput} json=${jsonOutput}`,
  );
  if (!result.ok) {
    for (const row of result.productionBlockers) {
      console.error(
        `MINIAPP_NPM_PRODUCTION_BLOCKER package=${row.name} severity=${row.severity} node=${row.node}`,
      );
    }
    if (result.devBlockers.length > 0 && !result.devOnlyRiskAcceptance.ok) {
      for (const reason of result.devOnlyRiskAcceptance.reasons) {
        console.error(`MINIAPP_NPM_DEV_RISK_BLOCKER reason=${reason}`);
      }
    }
    throw new Error(
      result.productionBlockers.length > 0
        ? "生产依赖树存在 critical/high 漏洞，发布门禁失败"
        : "dev critical/high 风险接受未批准、无效、已过期或覆盖不全，审计门禁失败",
    );
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    if (args.includes("--self-test")) console.info(runSelfTest());
    else main(args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
