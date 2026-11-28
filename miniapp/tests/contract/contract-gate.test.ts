/**
 * Task 3 契约门判定器自证测试。
 *
 * 被测对象是 CI 静态扫描器 scripts/ci/miniapp-contract-check.mjs 的纯函数面：
 * normalizeApiPath（路径归一化）、findForbiddenLegacyTokens（旧工程形态探测）与
 * evaluateEntries（调用点判定，覆盖 Important 2 的「相对路径不再补全」与
 * Critical 1 的「常量调用 fail-closed」语义）。
 * 本文件只证明「判定器不瞎、也不误杀」；判定器本体在 CI 里对 miniapp/src 全量扫描，
 * 空扫描与判定器失效由 `--self-test` 与主流程的 TOOL_BUG 分支显式失败（见脚本头注释）。
 *
 * 注意：夹具里刻意出现 '/app-api/' 与 'data.content' 等被禁字面量，这是被测语义本身；
 * 扫描器对 tests/fixtures 目录整体跳过，不会因此把自己的回归夹具判红。
 */
import { describe, expect, it } from 'vitest'
import {
  evaluateEntries,
  findForbiddenLegacyTokens,
  normalizeApiPath,
} from '../../../scripts/ci/miniapp-contract-check.mjs'

describe('miniapp contract gate', () => {
  it('normalizes dynamic path segments to wildcards', () => {
    expect(normalizeApiPath('/api/v1/erp/sales/orders/${id}/cancel')).toBe(
      '/api/v1/erp/sales/orders/*/cancel',
    )
  })

  it('detects legacy endpoints and legacy pagination keys', () => {
    const source = `
      apiClient.get('/app-api/goods/list')
      const rows = response.data.content
      const page = response.data.pageNo
    `
    expect(findForbiddenLegacyTokens(source)).toEqual([
      'legacy-endpoint:/app-api/',
      'legacy-pagination:data.content',
      'legacy-pagination:data.pageNo',
    ])
  })

  it('normalizes {id} braces, query strings and duplicate slashes', () => {
    expect(normalizeApiPath('/api/v1/erp/sales/orders/{id}')).toBe('/api/v1/erp/sales/orders/*')
    expect(normalizeApiPath('/api/v1/erp/auth/me?page=1&size=20')).toBe('/api/v1/erp/auth/me')
    expect(normalizeApiPath('sales//orders/')).toBe('/sales/orders')
  })

  it('leaves contract-conforming sources untouched', () => {
    const source = `
      apiClient.get('/api/v1/erp/auth/me')
      const rows = response.data.items
      const total = response.data.total
    `
    expect(findForbiddenLegacyTokens(source)).toEqual([])
  })
})

describe('legacy endpoint prefixes', () => {
  it.each(['/app-api/', '/oauth-api/'])('flags %s', (token) => {
    expect(findForbiddenLegacyTokens(`request('${token}goods/list')`)).toContain(
      `legacy-endpoint:${token}`,
    )
  })
})

describe('legacy pagination access forms (Important 3)', () => {
  const legacyKeys: string[] = ['content', 'pageNo', 'totalPage', 'hasNextPage', 'isLastPage']
  const accessForms = (key: string): string[] => [
    `const rows = data.${key}`,
    `const rows = response.data.${key}`,
    `const rows = res?.data.${key}`,
    `const rows = payload.data.${key} || []`,
    `const rows = data['${key}']`,
    `const rows = response.data?.['${key}']`,
    `const { ${key} } = response.data`,
    `const { ${key}: alias, items } = data`,
    `const { ${key} = 1 } = response.data`,
    `const { ${key}: alias = [], items } = data`,
    `({ ${key} } = response.data)`,
    `({ ${key} = 1 } = response.data)`,
    `({ ${key}: alias = [] } = data)`,
  ]
  const cases: [string, string][] = legacyKeys.flatMap((key) =>
    accessForms(key).map<[string, string]>((src) => [key, src]),
  )

  it.each(cases)('flags access to data.%s', (key, src) => {
    expect(findForbiddenLegacyTokens(src)).toContain(`legacy-pagination:data.${key}`)
  })

  it('returns hits in the stable token order', () => {
    const source = `
      apiClient.get('/oauth-api/user/info')
      const a = response.data.hasNextPage
      const b = data.isLastPage
      const c = response.data?.['content']
    `
    expect(findForbiddenLegacyTokens(source)).toEqual([
      'legacy-endpoint:/oauth-api/',
      'legacy-pagination:data.content',
      'legacy-pagination:data.hasNextPage',
      'legacy-pagination:data.isLastPage',
    ])
  })
})

describe('legacy pagination detector negatives (no false positives)', () => {
  it.each([
    'const rows = metadata.content',
    'const total = formdata.totalPage',
    'const flag = responseData.hasNextPage',
    'const list = data.contentList',
    'const n = data.isLastPageCount',
    'const list = dataList.pageNo',
    'const rows = data?.items',
    'const pageNo = route.query.pageNo',
    'const rows = pageResult.data.items',
  ])('does not flag %s', (src) => {
    expect(findForbiddenLegacyTokens(src)).toEqual([])
  })
})

describe('endpoint path rules (Critical 1 / Important 2)', () => {
  const snapshot = [
    'GET\t/api/v1/erp/auth/me\ta\tm',
    'POST\t/api/v1/erp/auth/login\tb\tm',
    'GET\t/api/v1/erp/sales/orders/*\tc\tm',
  ].join('\n')

  it('accepts full-prefix literal calls', () => {
    const res = evaluateEntries(
      [{ file: 'a.ts', source: "apiClient.get('/api/v1/erp/auth/me')" }],
      snapshot,
    )
    expect(res.calls).toHaveLength(1)
    expect(res.failures).toEqual([])
  })

  it('traverses switch case clauses without treating them as statement blocks', () => {
    const res = evaluateEntries(
      [
        {
          file: 'navigation.ts',
          source: [
            "const AUTH_PATH = '/api/v1/erp/auth/me'",
            'function navigate(method: string) {',
            '  switch (method) {',
            "    case 'read': apiClient.get(AUTH_PATH); break",
            '    default: break',
            '  }',
            '}',
          ].join('\n'),
        },
      ],
      snapshot,
    )

    expect(res.calls).toHaveLength(1)
    expect(res.calls[0]).toMatchObject({ method: 'GET', path: '/api/v1/erp/auth/me' })
    expect(res.failures).toEqual([])
  })

  it('does NOT complete base-relative paths (runtime apiBaseUrl is host-only)', () => {
    const res = evaluateEntries([{ file: 'a.ts', source: "apiClient.get('/auth/me')" }], snapshot)
    expect(res.failures).toHaveLength(1)
    expect(res.failures[0]).toMatchObject({ type: 'MISS', message: 'GET /auth/me' })
  })

  it('resolves statically resolvable constant calls against the snapshot', () => {
    const res = evaluateEntries(
      [
        {
          file: 'contracts.ts',
          source: [
            "export const API_BASE_PATH = '/api/v1/erp'",
            'export const AUTH_ME_PATH = `${API_BASE_PATH}/auth/me`',
            'export const LOGIN_PATH = `${API_BASE_PATH}/auth/nope`',
          ].join('\n'),
        },
        { file: 'session.ts', source: 'apiClient.get(AUTH_ME_PATH)' },
        { file: 'page.ts', source: "apiClient.post(LOGIN_PATH, { code: 'x' })" },
      ],
      snapshot,
    )
    expect(res.calls).toHaveLength(2)
    expect(res.failures).toHaveLength(2)
    expect(res.failures).toContainEqual({
      type: 'MISS',
      message: 'CONSTANT LOGIN_PATH /api/v1/erp/auth/nope (no route registered)',
      file: 'contracts.ts',
    })
    expect(res.failures).toContainEqual({
      type: 'MISS',
      message: 'POST /api/v1/erp/auth/nope [LOGIN_PATH]',
      file: 'page.ts',
    })
  })

  it('fails closed on call arguments that cannot be statically resolved', () => {
    const res = evaluateEntries(
      [
        { file: 'a.ts', source: "apiClient.get(buildPath('me'))" },
        { file: 'b.ts', source: 'apiClient.post(`${buildHost()}/x`)' },
        { file: 'c.ts', source: 'apiClient.get(unknownImportedConst)' },
      ],
      snapshot,
    )
    expect(res.failures).toHaveLength(3)
    expect(res.failures.map((f) => f.type)).toEqual(['UNRESOLVED', 'UNRESOLVED', 'UNRESOLVED'])
  })

  it('rejects substituted call templates instead of guessing a dynamic path', () => {
    const res = evaluateEntries(
      [{ file: 'a.ts', source: 'apiClient.get(`/api/v1/erp/sales/orders/${id}`)' }],
      snapshot,
    )
    expect(res.failures).toHaveLength(1)
    expect(res.failures[0]).toMatchObject({ type: 'UNRESOLVED' })
  })

  it('fails closed on empty first arguments (apiClient.get())', () => {
    const res = evaluateEntries(
      [
        {
          file: 'a.ts',
          source: "apiClient.get('/api/v1/erp/auth/me')\napiClient.get()\napiClient.post( )\n",
        },
      ],
      snapshot,
    )
    expect(res.failures).toHaveLength(2)
    expect(res.failures.map((f) => f.type)).toEqual(['UNRESOLVED', 'UNRESOLVED'])
  })

  it('fails closed on concatenated first args (literal prefix must not pass)', () => {
    const res = evaluateEntries(
      [
        {
          file: 'a.ts',
          source:
            "apiClient.get('/api/v1/erp/auth/me' + suffix)\n" +
            'apiClient.get(`/api/v1/erp/auth/me` + suffix)\n' +
            "apiClient.post(prefix + '/api/v1/erp/auth/me')",
        },
      ],
      snapshot,
    )
    expect(res.failures).toHaveLength(3)
    expect(res.failures.map((f) => f.type)).toEqual(['UNRESOLVED', 'UNRESOLVED', 'UNRESOLVED'])
    expect(res.failures.some((f) => f.type === 'MISS')).toBe(false)
  })

  it('does not resolve bare names that are exported with the same name from several files', () => {
    const res = evaluateEntries(
      [
        { file: 'one.ts', source: "export const SHADOWED_PATH = '/api/v1/erp/auth/me'" },
        { file: 'two.ts', source: "export const SHADOWED_PATH = '/api/v1/erp/ghost'" },
        { file: 'user.ts', source: 'apiClient.get(SHADOWED_PATH)' },
      ],
      snapshot,
    )
    expect(res.failures).toHaveLength(1)
    expect(res.failures[0]).toMatchObject({ type: 'UNRESOLVED' })
    expect(res.failures[0]?.message).toContain('SHADOWED_PATH')
  })

  // 修复轮 3 Critical：歧义索引必须登记「所有」导出绑定，不可解析的导出也算一条。
  // 否则 one.ts 的合法字面量导出会被当成全仓唯一导出代入，two.ts 的同名 opaque 导出隐身 → 假绿。
  it('counts an opaque same-name export as a binding (no unique-export false green)', () => {
    const res = evaluateEntries(
      [
        { file: 'one.ts', source: "export const AUTH_ME_PATH = '/api/v1/erp/auth/me'" },
        { file: 'two.ts', source: 'export const AUTH_ME_PATH = buildPath()' },
        { file: 'user.ts', source: 'apiClient.get(AUTH_ME_PATH)' },
      ],
      snapshot,
    )
    expect(res.failures).toHaveLength(1)
    expect(res.failures[0]).toMatchObject({ type: 'UNRESOLVED', file: 'user.ts' })
    expect(res.failures[0]?.message).toContain('AUTH_ME_PATH')
    expect(res.calls.some((c) => c.path === '/api/v1/erp/auth/me')).toBe(false)
  })

  it('counts a collection export as a binding in the ambiguity index', () => {
    const res = evaluateEntries(
      [
        { file: 'one.ts', source: "export const SHARED = '/api/v1/erp/auth/me'" },
        { file: 'coll.ts', source: "export const SHARED = new Set(['a'])" },
        { file: 'user.ts', source: 'apiClient.get(SHARED)' },
      ],
      snapshot,
    )
    expect(res.failures).toHaveLength(1)
    expect(res.failures[0]).toMatchObject({ type: 'UNRESOLVED' })
    expect(res.failures[0]?.message).toContain('SHARED')
  })

  it('counts a var-declared same-name export as a binding in the ambiguity index', () => {
    const res = evaluateEntries(
      [
        { file: 'one.ts', source: "export const VAR_TWINS = '/api/v1/erp/auth/me'" },
        { file: 'other.ts', source: 'export var VAR_TWINS = buildPath()' },
        { file: 'user.ts', source: 'apiClient.get(VAR_TWINS)' },
      ],
      snapshot,
    )
    expect(res.failures).toHaveLength(1)
    expect(res.failures[0]).toMatchObject({ type: 'UNRESOLVED' })
    expect(res.failures[0]?.message).toContain('VAR_TWINS')
  })

  it('counts exported enum / namespace declarations as bindings too', () => {
    const enumRes = evaluateEntries(
      [
        { file: 'one.ts', source: "export const ENUM_TWINS = '/api/v1/erp/auth/me'" },
        { file: 'en.ts', source: 'export enum ENUM_TWINS {\n  a,\n}' },
        { file: 'user.ts', source: 'apiClient.get(ENUM_TWINS)' },
      ],
      snapshot,
    )
    expect(enumRes.failures).toHaveLength(1)
    expect(enumRes.failures[0]).toMatchObject({ type: 'UNRESOLVED' })
    expect(enumRes.failures[0]?.message).toContain('ENUM_TWINS')

    const nsRes = evaluateEntries(
      [
        { file: 'one.ts', source: "export const NS_TWINS = '/api/v1/erp/auth/me'" },
        { file: 'ns.ts', source: 'export namespace NS_TWINS {\n  export const v = 1\n}' },
        { file: 'user.ts', source: 'apiClient.get(NS_TWINS)' },
      ],
      snapshot,
    )
    expect(nsRes.failures).toHaveLength(1)
    expect(nsRes.failures[0]).toMatchObject({ type: 'UNRESOLVED' })
    expect(nsRes.failures[0]?.message).toContain('NS_TWINS')
  })

  it('resolves a genuinely unique literal export (ambiguity index must not over-red)', () => {
    const res = evaluateEntries(
      [
        { file: 'api/contracts.ts', source: "export const UNIQUE_PATH = '/api/v1/erp/auth/me'" },
        { file: 'paths.ts', source: "export const OTHER_PATH = '/api/v1/erp/auth/login'" },
        { file: 'page.ts', source: 'apiClient.get(UNIQUE_PATH)' },
      ],
      snapshot,
    )
    expect(res.failures).toEqual([])
  })

  it('lets an unresolvable local declaration shadow a unique foreign export', () => {
    const res = evaluateEntries(
      [
        { file: 'api/contracts.ts', source: "export const LOCAL_SHADE = '/api/v1/erp/auth/me'" },
        { file: 'page.ts', source: 'const LOCAL_SHADE = buildPath()\napiClient.get(LOCAL_SHADE)' },
      ],
      snapshot,
    )
    expect(res.failures).toHaveLength(1)
    expect(res.failures[0]).toMatchObject({ type: 'UNRESOLVED', file: 'page.ts' })
    expect(res.failures[0]?.message).toContain('LOCAL_SHADE')
  })

  it('treats an `export { A as B }` alias of a resolvable constant as that constant', () => {
    const res = evaluateEntries(
      [
        {
          file: 'api/contracts.ts',
          source: "export const OK = '/api/v1/erp/auth/me'\nexport { OK as RENAMED }",
        },
        { file: 'page.ts', source: 'apiClient.get(RENAMED)' },
      ],
      snapshot,
    )
    expect(res.failures).toEqual([])
  })

  it('resolves a var-declared literal export (subset covers const/let/var)', () => {
    const res = evaluateEntries(
      [
        { file: 'api/contracts.ts', source: "export var VAR_LIT = '/api/v1/erp/auth/me'" },
        { file: 'page.ts', source: 'apiClient.get(VAR_LIT)' },
      ],
      snapshot,
    )
    expect(res.failures).toEqual([])
  })

  it('resolves import-bound aliases through the module path to the concrete file', () => {
    const res = evaluateEntries(
      [
        { file: 'api/contracts.ts', source: "export const ME_PATH = '/api/v1/erp/auth/me'" },
        { file: 'paths.ts', source: "export const ME_PATH = '/api/v1/erp/ghost'" },
        { file: 'page.ts', source: "import { ME_PATH } from './paths'\napiClient.get(ME_PATH)" },
      ],
      snapshot,
    )
    expect(res.failures).toHaveLength(1)
    expect(res.failures[0]).toMatchObject({
      type: 'MISS',
      message: 'GET /api/v1/erp/ghost [ME_PATH]',
    })
  })

  it('registers each contracts.ts per file; a same-name export elsewhere cannot mask it', () => {
    const res = evaluateEntries(
      [
        { file: 'a/contracts.ts', source: "export const TWIN_PATH = '/api/v1/erp/auth/me'" },
        { file: 'b/contracts.ts', source: "export const TWIN_PATH = '/api/v1/erp/ghost'" },
        { file: 'use.ts', source: "apiClient.get('/api/v1/erp/auth/me')" },
      ],
      snapshot,
    )
    expect(res.failures).toContainEqual({
      type: 'MISS',
      message: 'CONSTANT TWIN_PATH /api/v1/erp/ghost (no route registered)',
      file: 'b/contracts.ts',
    })
  })

  it('treats imports pointing outside the scanned set as UNRESOLVED (fail-closed)', () => {
    const res = evaluateEntries(
      [{ file: 'page.ts', source: "import { OUT } from 'lib/not-scanned'\napiClient.get(OUT)" }],
      snapshot,
    )
    expect(res.failures).toHaveLength(1)
    expect(res.failures[0]).toMatchObject({ type: 'UNRESOLVED' })
    expect(res.failures[0]?.message).toContain('OUT')
  })
})

describe('TypeScript AST contract semantics', () => {
  const snapshot = 'GET\t/api/v1/erp/auth/me\ta\tm\n'

  it('ignores comments and string data in the legacy pagination detector', () => {
    expect(
      findForbiddenLegacyTokens(
        "// data.content\nconst text = 'data.pageNo'\nconst rows = metadata.content\n/* data.totalPage */",
      ),
    ).toEqual([])
  })

  it('invalidates var/let literal bindings after any reassignment', () => {
    const res = evaluateEntries(
      [
        {
          file: 'paths.ts',
          source: "export var REASSIGNED = '/api/v1/erp/auth/me'\nREASSIGNED = buildPath()\n",
        },
        { file: 'page.ts', source: 'apiClient.get(REASSIGNED)' },
      ],
      snapshot,
    )
    expect(res.failures).toHaveLength(1)
    expect(res.failures[0]).toMatchObject({ type: 'UNRESOLVED', file: 'page.ts' })
  })

  it.each([
    'const f = function P() { apiClient.get(P) }',
    'const C = class P { read() { apiClient.get(P) } }',
  ])('keeps a named expression self-binding opaque: %s', (expression) => {
    const res = evaluateEntries(
      [
        {
          file: 'page.ts',
          source: `const P = '/api/v1/erp/auth/me'\n${expression}\napiClient.get(P)\n`,
        },
      ],
      snapshot,
    )
    expect(res.failures).toHaveLength(1)
    expect(res.failures[0]).toMatchObject({ type: 'UNRESOLVED', file: 'page.ts' })
    expect(res.calls.filter((call) => call.path === '/api/v1/erp/auth/me')).toHaveLength(1)
  })

  it.each(["[P = '/api/v1/erp/ghost']", "({ P = '/api/v1/erp/ghost' })"])(
    'invalidates a literal binding after a destructuring default assignment: %s',
    (target) => {
      const res = evaluateEntries(
        [
          {
            file: 'paths.ts',
            source: `export var P = '/api/v1/erp/auth/me'\n${target} = values\n`,
          },
          { file: 'page.ts', source: 'apiClient.get(P)' },
        ],
        snapshot,
      )
      expect(res.failures).toHaveLength(1)
      expect(res.failures[0]).toMatchObject({ type: 'UNRESOLVED', file: 'page.ts' })
    },
  )

  it('resolves nested declarations lexically without leaking their shadowing', () => {
    const res = evaluateEntries(
      [
        {
          file: 'page.ts',
          source:
            "const SCOPED = '/api/v1/erp/auth/me'\n" +
            '{ const SCOPED = buildPath(); apiClient.get(SCOPED) }\n' +
            'apiClient.get(SCOPED)\n',
        },
      ],
      snapshot,
    )
    expect(res.failures).toHaveLength(1)
    expect(res.failures[0]).toMatchObject({ type: 'UNRESOLVED', file: 'page.ts' })
    expect(res.calls.filter((call) => call.path === '/api/v1/erp/auth/me')).toHaveLength(1)
  })

  it('counts every declarator, abstract class and re-export in ambiguity checks', () => {
    const multi = evaluateEntries(
      [
        { file: 'one.ts', source: "export const MULTI = '/api/v1/erp/auth/me'" },
        { file: 'two.ts', source: 'export const OTHER = 1, MULTI = buildPath()' },
        { file: 'page.ts', source: 'apiClient.get(MULTI)' },
      ],
      snapshot,
    )
    expect(multi.failures).toHaveLength(1)
    expect(multi.failures[0]).toMatchObject({ type: 'UNRESOLVED' })

    const abstract = evaluateEntries(
      [
        { file: 'one.ts', source: "export const ABSTRACT_TWIN = '/api/v1/erp/auth/me'" },
        { file: 'two.ts', source: 'export abstract class ABSTRACT_TWIN {}' },
        { file: 'page.ts', source: 'apiClient.get(ABSTRACT_TWIN)' },
      ],
      snapshot,
    )
    expect(abstract.failures).toHaveLength(1)
    expect(abstract.failures[0]).toMatchObject({ type: 'UNRESOLVED' })

    const reexport = evaluateEntries(
      [
        { file: 'barrel.ts', source: "export { X as ALIAS } from './not-scanned'" },
        {
          file: 'page.ts',
          source: "import { ALIAS } from './barrel'\napiClient.get(ALIAS)",
        },
      ],
      snapshot,
    )
    expect(reexport.failures).toHaveLength(1)
    expect(reexport.failures[0]).toMatchObject({ type: 'UNRESOLVED' })
  })

  it('fails closed for export-star consumers and contracts registries', () => {
    const res = evaluateEntries(
      [
        { file: 'barrel.ts', source: "export * from './not-scanned'" },
        { file: 'contracts.ts', source: "export * from './not-scanned'" },
        {
          file: 'page.ts',
          source:
            "import { ANY } from './barrel'\napiClient.get(ANY)\napiClient.get('/api/v1/erp/auth/me')",
        },
      ],
      snapshot,
    )
    expect(res.failures).toHaveLength(2)
    expect(res.failures.every((failure) => failure.type === 'UNRESOLVED')).toBe(true)
    expect(res.failures.some((failure) => failure.message.includes('EXPORT STAR'))).toBe(true)
  })

  it('registers all slash-prefixed exports and explicitly rejects opaque constants', () => {
    const res = evaluateEntries(
      [
        {
          file: 'contracts.ts',
          source:
            "const LOCAL = '/api/v1/erp/auth/me'\n" +
            'export { LOCAL as ALIAS }\n' +
            "export const MISSING = '/api/v1/erp/ghost'\n" +
            'export const OPAQUE = buildPath()\n',
        },
        { file: 'page.ts', source: "apiClient.get('/api/v1/erp/auth/me')" },
      ],
      snapshot,
    )
    expect(res.failures).toHaveLength(2)
    expect(res.failures).toContainEqual({
      type: 'MISS',
      message: 'CONSTANT MISSING /api/v1/erp/ghost (no route registered)',
      file: 'contracts.ts',
    })
    expect(res.failures).toContainEqual({
      type: 'UNRESOLVED',
      message: 'CONSTANT OPAQUE (export initializer outside the parseable constant subset)',
      file: 'contracts.ts',
    })
  })

  it('fails closed for empty entry sets and empty snapshots', () => {
    expect(() => evaluateEntries([], 'GET\t/api/v1/erp/auth/me\ta\tm')).toThrow(
      'TOOL_BUG: no source entries',
    )
    expect(() =>
      evaluateEntries([{ file: 'a.ts', source: "apiClient.get('/api/v1/erp/auth/me')" }], ''),
    ).toThrow('TOOL_BUG: snapshot parsed 0 routes')
  })
})
