import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '../../..')

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8')
}

describe('Task 11 CI security regressions', () => {
  it('keeps initialization credentials outside the artifact directory', () => {
    const script = readRepoFile('scripts/ci/start-miniapp-e2e-backend.sh')

    expect(script).toContain('RUNNER_TEMP')
    expect(script).not.toContain('INIT_PAYLOAD_FILE="$RESULTS_DIR/init-request.json"')
    expect(script).toContain('trap cleanup_init_payload EXIT')
  })

  it('uses the public top-level readiness endpoint', () => {
    const backendScript = readRepoFile('scripts/ci/start-miniapp-e2e-backend.sh')
    const runner = readRepoFile('miniapp/tests/e2e/run.mjs')

    expect(backendScript).toContain('"$BACKEND_URL/health/readiness"')
    expect(backendScript).not.toContain('"$BACKEND_URL/api/v1/erp/health/readiness"')
    expect(runner).toContain("new URL('/health/readiness'")
  })

  it('strips URLs from every WeChat reqwest error', () => {
    const service = readRepoFile('backend/src/services/wechat_miniapp_service.rs')
    const reqwestErrorMappings = (service.match(/map_err\(\|error\|[\s\S]*?\}\)\?/g) ?? []).filter(
      (mapping) => mapping.includes('微信'),
    )

    expect(reqwestErrorMappings).toHaveLength(9)
    for (const mapping of reqwestErrorMappings) {
      expect(mapping).toContain('error.without_url()')
    }
  })

  it('passes the PR head SHA to both step summaries', () => {
    for (const path of [
      '.github/workflows/miniapp-checks.yml',
      '.github/workflows/miniapp-e2e.yml',
    ]) {
      const workflow = readRepoFile(path)
      expect(workflow).toContain(
        'HEAD_SHA: ${{ github.event.pull_request.head.sha || github.sha }}',
      )
    }
  })

  it('triggers runtime E2E when the step summary script changes', () => {
    const workflow = readRepoFile('.github/workflows/miniapp-e2e.yml')
    const pullRequestPaths = workflow.match(
      /[ ]{2}pull_request:\r?\n[ ]{4}paths:\r?\n([\s\S]*?)(?=\r?\n[ ]{2}workflow_dispatch:)/,
    )?.[1]

    expect(pullRequestPaths).toContain('scripts/ci/miniapp-write-step-summary.mjs')
  })

  it('uses the Windows runner PostgreSQL service instead of Linux Docker images', () => {
    const workflow = readRepoFile('.github/workflows/miniapp-e2e.yml')

    expect(workflow).toContain("$service = 'postgresql-x64-17'")
    expect(workflow).toContain('Set-Service -Name $service -StartupType Manual')
    expect(workflow).toContain('Start-Service -Name $service')
    expect(workflow).toContain('bingxi_miniapp_test')
    expect(workflow).not.toContain('docker run')
    expect(workflow).not.toContain('postgres:16')
  })

  it('discovers the installed devtools CLI and exports it to later steps', () => {
    const script = readRepoFile('scripts/ci/install-wechat-devtools.ps1')

    expect(script).toContain('function Find-DevtoolsCli')
    expect(script).toContain("Get-ChildItem -LiteralPath $root -Filter 'cli.bat'")
    expect(script).toContain('WECHAT_DEVTOOLS_CLI=$cliPath')
    expect(script).toContain('$env:GITHUB_ENV')
  })

  it('uploads artifacts only after a successful sensitive-information scan', () => {
    const workflow = readRepoFile('.github/workflows/miniapp-e2e.yml')
    const scanStep = workflow.match(
      /- name: 脱敏并强制扫描 E2E 制品\r?\n([\s\S]*?)(?=\r?\n {6}- )/,
    )?.[1]
    const uploadStep = workflow
      .slice(workflow.indexOf('- uses: actions/upload-artifact@'))
      .split(/\r?\n {6}- /, 1)[0]

    const configStep = workflow.match(
      /- name: 校验运行时 E2E 配置\r?\n([\s\S]*?)(?=\r?\n {6}- )/,
    )?.[1]
    expect(configStep).toContain('id: config')
    expect(scanStep).toContain('id: scan_artifacts')
    expect(scanStep).toContain('if: always()')
    expect(uploadStep).toContain(
      "if: always() && steps.config.outcome == 'success' && steps.scan_artifacts.outcome == 'success'",
    )
    expect(uploadStep).not.toMatch(/\r?\n {8}if: always\(\)\r?\n/)
    expect(workflow).not.toContain('path: miniapp/test-results/')
    expect(workflow).toContain('miniapp/test-results/e2e.json')
    expect(workflow).toContain('miniapp/test-results/exit-code.txt')
  })

  it('allows the official tourist appid only for password and denial E2E scope', () => {
    const workflow = readRepoFile('.github/workflows/miniapp-e2e.yml')
    const configStep = workflow.match(
      /- name: 校验运行时 E2E 配置\r?\n([\s\S]*?)(?=\r?\n {6}- )/,
    )?.[1]

    expect(configStep).toContain("$appId -ne 'touristappid'")
    expect(configStep).toContain('scope=password-and-denial-only')
    expect(configStep).not.toContain("$appId -eq 'touristappid' -or")
  })

  it('uses a page-level denial test instead of opening the native authorization dialog', () => {
    const spec = readRepoFile('miniapp/tests/e2e/wechat-login.spec.ts')

    expect(spec).toContain("trigger('getphonenumber'")
    expect(spec).not.toContain('.tap()')
    expect(spec).toContain('does not complete real WeChat phone login')
    expect(spec).not.toContain('reaches workspace')
  })

  it('runs npm audit with a production severity gate in CI', () => {
    const workflow = readRepoFile('.github/workflows/miniapp-checks.yml')
    const auditScript = readRepoFile('scripts/ci/miniapp-npm-audit.mjs')

    expect(workflow).toContain('scripts/ci/miniapp-npm-audit.mjs')
    expect(auditScript).toContain('--omit=dev')
    expect(auditScript).toContain('critical')
    expect(auditScript).toContain('high')
  })

  it('ignores generated E2E evidence and does not track a stale exit code', () => {
    const gitignore = readRepoFile('.gitignore')

    expect(gitignore).toContain('/miniapp/test-results/')
    expect(gitignore).toContain('/miniapp/tests/e2e/exit-code.txt')
    expect(() => readRepoFile('miniapp/tests/e2e/exit-code.txt')).toThrow()
  })
})
