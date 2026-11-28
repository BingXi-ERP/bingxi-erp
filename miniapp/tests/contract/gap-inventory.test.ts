import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildInventory,
  classifyBackendStatus,
  normalizeApiPath,
  parseLegacyCall,
  parseWxRequest,
  renderLedger,
} from '../../../scripts/ci/miniapp-gap-inventory.mjs'

const snapshot = new Set(['GET /api/v1/erp/products', 'POST /api/v1/erp/products'])

describe('gap inventory', () => {
  it('classifies existing, missing, legacy and unresolved endpoints', () => {
    expect(classifyBackendStatus('GET', '/api/v1/erp/products', snapshot)).toBe('existing')
    expect(classifyBackendStatus('POST', '/api/v1/erp/products/missing', snapshot)).toBe('missing')
    expect(classifyBackendStatus('GET', '/app-api/goods/list', snapshot)).toBe('legacy')
    expect(classifyBackendStatus('GET', '/oauth-api/user/info', snapshot)).toBe('legacy')
    expect(classifyBackendStatus('UNKNOWN', '/manual-review', snapshot)).toBe('manual-review')
  })

  it('parses legacy call sites without executing them', () => {
    expect(parseLegacyCall("request.GET(app.config.bingxiHost + '/app-api/goods/list')")).toEqual({
      method: 'GET',
      path: '/app-api/goods/list',
    })
  })

  it('normalizes paths with the contract gate rules', () => {
    expect(normalizeApiPath('/api/v1/erp/products/${id}?expand=name')).toBe(
      '/api/v1/erp/products/*',
    )
    expect(normalizeApiPath('api//v1/erp/products/{id}/')).toBe('/api/v1/erp/products/*')
  })

  it('parses multiline Babel calls and keeps dynamic suffixes explicit', () => {
    expect(
      parseLegacyCall(
        'request._POST(\n  "".concat(app.config.bingxiHost, "/app-api/goods/").concat(id),\n  data\n)',
      ),
    ).toEqual({ method: 'POST', path: '/app-api/goods/*' })
  })

  it('keeps dynamic middle segments and action suffixes in Babel concat paths', () => {
    expect(
      parseLegacyCall(
        'request.DELETE("".concat(app.config.bingxiHost, "/api/v1/erp/products/", id))',
      ),
    ).toEqual({ method: 'DELETE', path: '/api/v1/erp/products/*' })
    expect(
      parseLegacyCall(
        'request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/sales/orders/", orderId, "/cancel"))',
      ),
    ).toEqual({ method: 'POST', path: '/api/v1/erp/sales/orders/*/cancel' })
    expect(
      parseLegacyCall(
        'request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/sales/orders?customer_id=", customerId))',
      ),
    ).toEqual({ method: 'GET', path: '/api/v1/erp/sales/orders' })
  })

  it('ignores commented-out request calls', () => {
    expect(parseLegacyCall("// request.GET('/app-api/goods/list')")).toBeNull()
    expect(parseLegacyCall("/* request.POST('/api/v1/erp/products') */")).toBeNull()
  })

  it('parses direct wx.request method and URL without executing them', () => {
    expect(
      parseWxRequest(
        "wx.request({ url: app.config.bingxiHost + '/api/v1/erp/products', method: 'GET' })",
      ),
    ).toEqual({ method: 'GET', path: '/api/v1/erp/products' })
    expect(parseWxRequest('wx.request({ url, method: wireMethod(kind) })')).toEqual({
      method: 'UNKNOWN',
      path: '/manual-review',
    })
  })

  it('marks wx.request dynamic URLs without a path as manual review', () => {
    expect(
      parseWxRequest(
        'wx.request({ url: t.api_base + "?" + e.join("&").toLowerCase(), method: "GET" })',
      ),
    ).toEqual({ method: 'UNKNOWN', path: '/manual-review' })
    expect(
      parseWxRequest(
        'wx.request({ url: t.api_base + "?" + n.join("&").toLowerCase(), method: "POST" })',
      ),
    ).toEqual({ method: 'UNKNOWN', path: '/manual-review' })
    expect(
      parseWxRequest('wx.request({ url: t.api_base + "#" + fragment, method: "GET" })'),
    ).toEqual({ method: 'UNKNOWN', path: '/manual-review' })
    expect(parseWxRequest('wx.request({ url: t.api_base, method: "GET" })')).toEqual({
      method: 'UNKNOWN',
      path: '/manual-review',
    })
  })

  it('marks concat URLs without a path as manual review', () => {
    expect(
      parseWxRequest('wx.request({ url: "".concat(t.api_base, "?", query), method: "GET" })'),
    ).toEqual({ method: 'UNKNOWN', path: '/manual-review' })
    expect(parseWxRequest('wx.request({ url: "".concat("?"), method: "GET" })')).toEqual({
      method: 'UNKNOWN',
      path: '/manual-review',
    })
    expect(parseLegacyCall('request.GET("".concat(t.api_base, "?", query))')).toEqual({
      method: 'UNKNOWN',
      path: '/manual-review',
    })
    expect(parseLegacyCall('request.GET("".concat(t.api_base, "#", fragment))')).toEqual({
      method: 'UNKNOWN',
      path: '/manual-review',
    })
  })

  it('emits every declared page and fails closed for a missing page entry', () => {
    const root = mkdtempSync(join(tmpdir(), 'miniapp-gap-test-'))
    try {
      mkdirSync(join(root, 'pages/one'), { recursive: true })
      writeFileSync(
        join(root, 'app.json'),
        JSON.stringify({
          pages: ['pages/one/index'],
          subPackages: [{ root: 'packageA/', pages: ['pages/two/index'] }],
        }),
      )
      writeFileSync(
        join(root, 'pages/one/index.js'),
        "const service = require('../../services/goods')\nservice.list()\n",
      )
      mkdirSync(join(root, 'services'), { recursive: true })
      writeFileSync(
        join(root, 'services/goods.js'),
        "module.exports.list = function list() { return request.GET(app.config.bingxiHost + '/app-api/goods/list') }\n",
      )
      mkdirSync(join(root, 'packageA/pages/two'), { recursive: true })
      writeFileSync(join(root, 'packageA/pages/two/index.js'), 'Page({})\n')

      const inventory = buildInventory({
        legacyRoot: root,
        snapshotText: 'GET\t/api/v1/erp/products\thandler\tdomain\n',
      })
      expect(inventory.pages).toEqual(['pages/one/index', 'packageA/pages/two/index'])
      expect(inventory.rows).toHaveLength(2)
      expect(inventory.rows[0]).toMatchObject({
        page: 'pages/one/index',
        action: 'list',
        method: 'GET',
        path: '/app-api/goods/list',
        backendStatus: 'legacy',
        taskRef: 'Task 9',
      })
      expect(inventory.rows[1]).toMatchObject({
        page: 'packageA/pages/two/index',
        backendStatus: 'manual-review',
      })
      for (const row of inventory.rows) {
        expect(Object.values(row).every((value) => String(value).length > 0)).toBe(true)
      }

      const ledger = renderLedger(inventory)
      expect(ledger).toContain(
        '| 页面 | 动作 | 方法 | 路径 | 请求字段 | 响应字段 | 权限 | 来源 | 后端状态 | 任务引用 |',
      )
      const ledgerRows = ledger.split('## 全量台账')[1] ?? ''
      expect(ledgerRows.match(/^\| (?!页面)(?!---)/gm)).toHaveLength(2)
      rmSync(join(root, 'packageA/pages/two/index.js'))
      expect(() =>
        buildInventory({
          legacyRoot: root,
          snapshotText: 'GET\t/api/v1/erp/products\thandler\tdomain\n',
        }),
      ).toThrow('DECLARED_PAGE_MISSING')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('uses the service property instead of a Babel constructor or control-flow name', () => {
    const root = mkdtempSync(join(tmpdir(), 'miniapp-gap-test-'))
    try {
      mkdirSync(join(root, 'pages/one'), { recursive: true })
      writeFileSync(join(root, 'app.json'), JSON.stringify({ pages: ['pages/one/index'] }))
      writeFileSync(
        join(root, 'pages/one/index.js'),
        "const Service = require('../../services/goods')\nnew Service().list()\n",
      )
      mkdirSync(join(root, 'services'), { recursive: true })
      writeFileSync(
        join(root, 'services/goods.js'),
        "module.exports = createClass(function Constructor() { if (enabled) { this.list = function list() { return request.GET('/api/v1/erp/products') } } })\n",
      )
      const inventory = buildInventory({
        legacyRoot: root,
        snapshotText: 'GET\t/api/v1/erp/products\thandler\tdomain\n',
      })
      expect(inventory.rows).toHaveLength(1)
      expect(inventory.rows[0]?.action).toBe('list')

      writeFileSync(
        join(root, 'services/goods.js'),
        `${readFileSync(join(root, 'services/goods.js'), 'utf8')}\nfunction later() { return request.POST('/api/v1/erp/products') }\n`,
      )
      const withLaterFunction = buildInventory({
        legacyRoot: root,
        snapshotText: 'GET\t/api/v1/erp/products\thandler\tdomain\n',
      })
      expect(withLaterFunction.rows.map((row) => row.action)).toEqual(['list', 'later'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('deduplicates repeated calls for the same page and action deterministically', () => {
    const root = mkdtempSync(join(tmpdir(), 'miniapp-gap-test-'))
    try {
      mkdirSync(join(root, 'pages/one'), { recursive: true })
      writeFileSync(join(root, 'app.json'), JSON.stringify({ pages: ['pages/one/index'] }))
      writeFileSync(
        join(root, 'pages/one/index.js'),
        [
          "const service = require('../../services/goods')",
          'service.list()',
          'service.list()',
          "request.GET('/api/v1/erp/products')",
        ].join('\n'),
      )
      mkdirSync(join(root, 'services'), { recursive: true })
      writeFileSync(
        join(root, 'services/goods.js'),
        "exports.list = function list() { return request.GET('/api/v1/erp/products') }\n",
      )
      const options = {
        legacyRoot: root,
        snapshotText: 'GET\t/api/v1/erp/products\thandler\tdomain\n',
      }
      const first = buildInventory(options)
      const second = buildInventory(options)
      expect(first.rows).toHaveLength(2)
      expect(first.rows.map((row) => row.action)).toEqual(['api-call', 'list'])
      expect(renderLedger(first)).toBe(renderLedger(second))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
