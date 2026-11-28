import { describe, expect, it } from 'vitest'
import { resolveApiPath } from '../../src/shared/api/path'

describe('resolveApiPath', () => {
  it('builds a real product colors path from a validated id', () => {
    expect(resolveApiPath('/api/v1/erp/products/{id}/colors', { id: 42 })).toBe(
      '/api/v1/erp/products/42/colors',
    )
  })

  it('encodes string path parameters', () => {
    expect(resolveApiPath('/api/v1/erp/orders/{orderNo}', { orderNo: 'SO/2026 001' })).toBe(
      '/api/v1/erp/orders/SO%2F2026%20001',
    )
  })

  it('rejects missing path parameters', () => {
    expect(() => resolveApiPath('/api/v1/erp/products/{id}/colors', {})).toThrow(
      'Missing path parameter: id',
    )
  })

  it('rejects unexpected path parameters', () => {
    expect(() =>
      resolveApiPath('/api/v1/erp/products/{id}/colors', { id: 42, extra: 'x' }),
    ).toThrow('Unexpected path parameter: extra')
  })
})
