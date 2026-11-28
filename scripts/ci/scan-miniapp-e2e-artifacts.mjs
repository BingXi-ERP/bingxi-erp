import assert from "node:assert/strict";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SECRET_ENV_NAMES = [
  "MINIAPP_SECRET",
  "E2E_PASSWORD",
  "E2E_PHONE",
  "INIT_TOKEN",
  "JWT_SECRET",
  "COOKIE_SECRET",
  "WEBHOOK_SECRET",
  "AUDIT_SECRET_KEY",
];

const FORBIDDEN_FILE =
  /^(?:init-(?:request|response)\.json|\.env(?:\..*)?|credentials\.json)$/i;
const TEXT_PATTERNS = [
  [
    "wechat-query-secret",
    /[?&](?:secret|js_code|access_token|phone_code|token)=(?!\[REDACTED\])[^&\s"'<>]+/gi,
  ],
  [
    "json-secret",
    /"(?:admin_password|password|secret|access_token|refresh_token|init_token|phone_code|js_code)"\s*:\s*"(?!\[REDACTED\])[^"]*"/gi,
  ],
  [
    "authorization-header",
    /(?:authorization\s*:\s*bearer\s+|x-init-token\s*:\s*)(?!\[REDACTED\])[^\s,;]+/gi,
  ],
  ["url-credentials", /https?:\/\/[^\s/:@]+:[^\s/@]+@/gi],
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ["mainland-phone", /(?<!\d)1[3-9]\d{9}(?!\d)/g],
];

function secretValues(env) {
  return SECRET_ENV_NAMES.flatMap((name) => {
    const value = env[name]?.trim();
    return value && value.length >= 4 ? [{ name, value }] : [];
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function sanitizeText(text, env = process.env) {
  let result = text;
  for (const { name, value } of secretValues(env)) {
    result = result.replace(
      new RegExp(escapeRegExp(value), "g"),
      `[REDACTED:${name}]`,
    );
  }
  result = result.replace(
    /([?&](?:secret|js_code|access_token|phone_code|token)=)[^&\s"'<>]+/gi,
    "$1[REDACTED]",
  );
  result = result.replace(
    /("(?:admin_password|password|secret|access_token|refresh_token|init_token|phone_code|js_code)"\s*:\s*")[^"]*(")/gi,
    "$1[REDACTED]$2",
  );
  result = result.replace(
    /(authorization\s*:\s*bearer\s+|x-init-token\s*:\s*)[^\s,;]+/gi,
    "$1[REDACTED]",
  );
  result = result.replace(
    /https?:\/\/[^\s/:@]+:[^\s/@]+@/gi,
    "https://[REDACTED]@",
  );
  result = result.replace(
    /-----BEGIN ((?:RSA |EC |OPENSSH )?PRIVATE KEY)-----[\s\S]*?-----END \1-----/g,
    "[REDACTED:PRIVATE_KEY]",
  );
  result = result.replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, "[REDACTED:PHONE]");
  return result;
}

function textFiles(root) {
  const files = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        files.push({ path, symlink: true });
      } else if (entry.isDirectory()) {
        walk(path);
      } else if (entry.isFile()) {
        files.push({ path, symlink: false });
      }
    }
  }
  walk(root);
  return files;
}

function readText(file) {
  const buffer = readFileSync(file.path);
  if (buffer.includes(0)) return null;
  return buffer.toString("utf8");
}

export function scanArtifacts(root, env = process.env) {
  const findings = [];
  const scannedFiles = [];
  for (const file of textFiles(root)) {
    const displayPath = relative(root, file.path).replaceAll("\\", "/");
    if (file.symlink) {
      findings.push({ file: displayPath, rule: "symlink" });
      continue;
    }
    if (FORBIDDEN_FILE.test(basename(file.path))) {
      findings.push({ file: displayPath, rule: "forbidden-file" });
      continue;
    }
    const text = readText(file);
    if (text === null) continue;
    scannedFiles.push(displayPath);
    for (const { name, value } of secretValues(env)) {
      if (text.includes(value)) {
        findings.push({ file: displayPath, rule: `env:${name}` });
      }
    }
    for (const [rule, pattern] of TEXT_PATTERNS) {
      if (pattern.test(text)) findings.push({ file: displayPath, rule });
      pattern.lastIndex = 0;
    }
  }
  return { ok: findings.length === 0, findings, scannedFiles };
}

export function sanitizeArtifacts(root, env = process.env) {
  const changedFiles = [];
  const removedFiles = [];
  for (const file of textFiles(root)) {
    const displayPath = relative(root, file.path).replaceAll("\\", "/");
    if (file.symlink) continue;
    if (FORBIDDEN_FILE.test(basename(file.path))) {
      rmSync(file.path);
      removedFiles.push(displayPath);
      continue;
    }
    const text = readText(file);
    if (text === null) continue;
    const sanitized = sanitizeText(text, env);
    if (sanitized !== text) {
      writeFileSync(file.path, sanitized, "utf8");
      changedFiles.push(displayPath);
    }
  }
  return { changedFiles, removedFiles };
}

export function runSelfTest() {
  const root = mkdtempSync(join(tmpdir(), "miniapp-artifact-scan-"));
  const env = {
    MINIAPP_SECRET: "self-test-miniapp-secret",
    E2E_PASSWORD: "self-test-admin-password",
    E2E_PHONE: "13900000000",
    INIT_TOKEN: "self-test-init-token",
  };
  try {
    writeFileSync(join(root, "e2e.json"), JSON.stringify({ status: "passed" }));
    assert.equal(scanArtifacts(root, env).ok, true);

    writeFileSync(
      join(root, "backend.log"),
      "https://api.weixin.qq.com/sns/jscode2session?secret=self-test-miniapp-secret&js_code=wx-code\n",
    );
    assert.equal(scanArtifacts(root, env).ok, false);
    assert.ok(
      scanArtifacts(root, env).findings.some(
        (item) => item.rule === "wechat-query-secret",
      ),
    );

    sanitizeArtifacts(root, env);
    assert.equal(scanArtifacts(root, env).ok, true);
    assert.ok(
      !readFileSync(join(root, "backend.log"), "utf8").includes(
        env.MINIAPP_SECRET,
      ),
    );

    writeFileSync(
      join(root, "init-request.json"),
      JSON.stringify({ admin_password: env.E2E_PASSWORD }),
    );
    assert.equal(scanArtifacts(root, env).ok, false);
    sanitizeArtifacts(root, env);
    assert.equal(scanArtifacts(root, env).ok, true);

    writeFileSync(
      join(root, "automator.stdout.log"),
      `password=${env.E2E_PASSWORD}`,
    );
    assert.equal(scanArtifacts(root, env).ok, false);
    sanitizeArtifacts(root, env);
    assert.equal(scanArtifacts(root, env).ok, true);

    const privateKeyBody = "c2VsZi10ZXN0LW5vdC1hLXJlYWwta2V5";
    writeFileSync(
      join(root, "private-key.pem"),
      [
        "-----BEGIN PRIVATE KEY-----",
        privateKeyBody,
        "-----END PRIVATE KEY-----",
        "",
      ].join("\r\n"),
    );
    const privateKeyFindings = scanArtifacts(root, env).findings;
    assert.equal(privateKeyFindings.length > 0, true);
    assert.ok(
      privateKeyFindings.some(
        (item) =>
          item.file === "private-key.pem" && item.rule === "private-key",
      ),
    );

    const privateKeyResult = sanitizeArtifacts(root, env);
    assert.ok(privateKeyResult.changedFiles.includes("private-key.pem"));
    const sanitizedPrivateKey = readFileSync(
      join(root, "private-key.pem"),
      "utf8",
    );
    assert.ok(!sanitizedPrivateKey.includes("BEGIN PRIVATE KEY"));
    assert.ok(!sanitizedPrivateKey.includes(privateKeyBody));
    assert.ok(sanitizedPrivateKey.includes("[REDACTED:PRIVATE_KEY]"));
    assert.equal(scanArtifacts(root, env).ok, true);
    return "MINIAPP_ARTIFACT_SCAN_SELFTEST_OK";
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function main(args) {
  if (args.includes("--self-test")) {
    console.info(runSelfTest());
    return;
  }
  const rootIndex = args.indexOf("--root");
  const root = resolve(
    rootIndex >= 0 ? args[rootIndex + 1] : "miniapp/test-results",
  );
  if (args.includes("--sanitize")) {
    const result = sanitizeArtifacts(root);
    console.info(
      `MINIAPP_ARTIFACT_SANITIZE changed=${result.changedFiles.length} removed=${result.removedFiles.length}`,
    );
  }
  const result = scanArtifacts(root);
  if (!result.ok) {
    for (const finding of result.findings) {
      console.error(
        `MINIAPP_ARTIFACT_SECRET file=${finding.file} rule=${finding.rule}`,
      );
    }
    throw new Error(`制品敏感信息扫描失败：${result.findings.length} 项命中`);
  }
  console.info(`MINIAPP_ARTIFACT_SCAN_OK files=${result.scannedFiles.length}`);
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
