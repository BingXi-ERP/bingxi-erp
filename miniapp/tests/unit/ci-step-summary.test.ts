import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appendStepSummary,
  buildE2ESummary,
  buildStaticSummary,
} from '../../../scripts/ci/miniapp-write-step-summary.mjs'

const SHA = '0123456789abcdef0123456789abcdef01234567'
const temporaryRoots: string[] = []

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'miniapp-summary-test-'))
  temporaryRoots.push(root)
  return root
}

function writeJson(root: string, path: string, value: unknown) {
  const file = join(root, path)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, JSON.stringify(value), 'utf8')
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('CI Step Summary evidence', () => {
  it('reports the full SHA, audit classification, scanner outcomes, page count and real artifact size', () => {
    const root = fixtureRoot()
    writeJson(root, 'miniapp/test-results/miniapp-npm-audit.json', {
      summary: { info: 0, low: 12, moderate: 21, high: 1, critical: 0, total: 34 },
      productionBlockers: [],
      devBlockers: [{ name: 'vite' }],
      devOnlyRiskAcceptance: { status: 'approved-unexpired' },
    })
    writeJson(root, 'miniapp/src/pages.json', {
      pages: [{ path: 'pages/login/index' }, { path: 'features/workspace/pages/index/index' }],
    })
    const artifact = join(root, 'miniapp/dist/build/mp-weixin/app.js')
    mkdirSync(join(artifact, '..'), { recursive: true })
    writeFileSync(artifact, Buffer.alloc(1025))

    const summary = buildStaticSummary({
      root,
      sha: SHA,
      jobStatus: 'success',
      auditOutcome: 'success',
      staticOutcome: 'success',
      architectureOutcome: 'success',
      sourceOutcome: 'success',
      pagesOutcome: 'success',
      sizeOutcome: 'success',
    })

    expect(summary).toContain(`\`${SHA}\``)
    expect(summary).toContain('`success`')
    expect(summary).toContain('critical=0')
    expect(summary).toContain('high=1')
    expect(summary).toContain('productionBlockers=0')
    expect(summary).toContain('devBlockers=1')
    expect(summary).toContain('devRiskStatus=approved-unexpired')
    expect(summary).toContain('架构扫描：`success`')
    expect(summary).toContain('源码扫描：`success`')
    expect(summary).toContain('声明页数：2')
    expect(summary).toContain('真实包体积：1025 bytes / 2 KB（1 files）')
  })

  it('keeps failed and unrun gates visible when audit blocks the static gate before build', () => {
    const root = fixtureRoot()
    writeJson(root, 'miniapp/test-results/miniapp-npm-audit.json', {
      summary: { info: 0, low: 12, moderate: 21, high: 1, critical: 0, total: 34 },
      productionBlockers: [],
      devBlockers: [{ name: 'vite' }],
      devOnlyRiskAcceptance: { status: 'pending' },
    })
    writeJson(root, 'miniapp/src/pages.json', { pages: [{ path: 'pages/login/index' }] })

    const summary = buildStaticSummary({
      root,
      sha: SHA,
      jobStatus: 'failure',
      auditOutcome: 'failure',
      staticOutcome: 'skipped',
      architectureOutcome: 'not-run',
      sourceOutcome: 'not-run',
      pagesOutcome: 'not-run',
      sizeOutcome: 'not-run',
    })

    expect(summary).toContain('job.status：`failure`')
    expect(summary).toContain('devRiskStatus=pending')
    expect(summary).toContain('架构扫描：`not-run`')
    expect(summary).toContain('源码扫描：`not-run`')
    expect(summary).toContain('声明页数：1')
    expect(summary).toContain('真实包体积：not-generated（构建产物不存在）')
  })

  it('reports malformed audit JSON as a summary error instead of inventing a passing result', () => {
    const root = fixtureRoot()
    const report = join(root, 'miniapp/test-results/miniapp-npm-audit.json')
    mkdirSync(join(report, '..'), { recursive: true })
    writeFileSync(report, '{not-json', 'utf8')

    const summary = buildStaticSummary({
      root,
      sha: SHA,
      jobStatus: 'failure',
      auditOutcome: 'failure',
      staticOutcome: 'not-run',
      architectureOutcome: 'failure',
      sourceOutcome: 'not-run',
      pagesOutcome: 'not-run',
      sizeOutcome: 'not-run',
    })

    expect(summary).toContain('npm audit 摘要：report-parse-error')
    expect(summary).toContain('架构扫描：`failure`')
  })

  it('reports E2E exit code, test totals and artifact upload evidence on success', () => {
    const root = fixtureRoot()
    writeJson(root, 'miniapp/test-results/e2e.json', {
      success: true,
      numTotalTests: 2,
      numPassedTests: 2,
      numFailedTests: 0,
      numPendingTests: 0,
      numTodoTests: 0,
    })
    writeFileSync(join(root, 'miniapp/test-results/exit-code.txt'), '0\n', 'utf8')

    const summary = buildE2ESummary({
      root,
      sha: SHA,
      jobStatus: 'success',
      e2eOutcome: 'success',
      scanOutcome: 'success',
      uploadOutcome: 'success',
    })

    expect(summary).toContain(`\`${SHA}\``)
    expect(summary).toContain('exit-code：`0`')
    expect(summary).toContain('测试数量：total=2 passed=2 failed=0 pending=0 todo=0')
    expect(summary).toContain('测试结果：`passed`')
    expect(summary).toContain('制品路径：`miniapp-e2e-results`')
    expect(summary).toContain('制品上传：`success`')
  })

  it('writes an E2E failure summary even when the runner produced no JSON report', () => {
    const root = fixtureRoot()
    const resultsRoot = join(root, 'miniapp/test-results')
    mkdirSync(resultsRoot, { recursive: true })
    writeFileSync(join(resultsRoot, 'exit-code.txt'), '1\n', 'utf8')

    const summary = buildE2ESummary({
      root,
      sha: SHA,
      jobStatus: 'failure',
      e2eOutcome: 'failure',
      scanOutcome: 'failure',
      uploadOutcome: 'skipped',
    })

    expect(summary).toContain('job.status：`failure`')
    expect(summary).toContain('exit-code：`1`')
    expect(summary).toContain('测试数量：not-generated')
    expect(summary).toContain('测试结果：not-generated')
    expect(summary).toContain('制品上传：`skipped`')
  })

  it('prefers the PR head SHA over a different merge commit SHA in both summaries', () => {
    const root = fixtureRoot()
    const mergeSha = 'fedcba9876543210fedcba9876543210fedcba98'
    const headSha = 'abcdef0123456789abcdef0123456789abcdef01'
    const context = {
      root,
      sha: mergeSha,
      headSha,
      jobStatus: 'success',
    }

    const staticSummary = buildStaticSummary(context)
    const e2eSummary = buildE2ESummary(context)

    expect(staticSummary).toContain(`- SHA：\`${headSha}\``)
    expect(staticSummary).not.toContain(mergeSha)
    expect(e2eSummary).toContain(`- SHA：\`${headSha}\``)
    expect(e2eSummary).not.toContain(mergeSha)
  })

  it('rejects an invalid HEAD_SHA instead of falling back to GITHUB_SHA', () => {
    const root = fixtureRoot()

    expect(() =>
      buildStaticSummary({
        root,
        sha: SHA,
        headSha: SHA.slice(0, 7),
        jobStatus: 'failure',
      }),
    ).toThrow(/HEAD_SHA|40/)
    expect(() =>
      buildE2ESummary({
        root,
        sha: SHA,
        headSha: 'not-a-sha',
        jobStatus: 'failure',
      }),
    ).toThrow(/HEAD_SHA|40/)
  })

  it('rejects abbreviated SHAs and appends the complete summary to the evidence file', () => {
    const root = fixtureRoot()
    expect(() =>
      buildE2ESummary({
        root,
        sha: SHA.slice(0, 7),
        jobStatus: 'failure',
        e2eOutcome: 'failure',
        scanOutcome: 'failure',
        uploadOutcome: 'skipped',
      }),
    ).toThrow(/40/)

    const summaryPath = join(root, 'summary.md')
    const summary = buildE2ESummary({
      root,
      sha: SHA,
      jobStatus: 'failure',
      e2eOutcome: 'failure',
      scanOutcome: 'failure',
      uploadOutcome: 'skipped',
    })
    appendStepSummary(summaryPath, summary)
    appendStepSummary(summaryPath, summary)
    expect(readFileSync(summaryPath, 'utf8').split(SHA)).toHaveLength(3)
  })
})
