import { describe, expect, it } from 'vitest'
import { hasPermission } from '../../src/shared/stores/permissions'

describe('hasPermission', () => {
  it('matches the exact action or an action wildcard', () => {
    expect(hasPermission('orders:read', ['orders:read'])).toBe(true)
    expect(hasPermission('orders:read', ['*:*'])).toBe(true)
    expect(hasPermission('orders:read', ['*:read'])).toBe(true)
    expect(hasPermission('orders:read', ['orders:*'])).toBe(true)
  })

  it('does not treat read/view or update/edit as equivalent actions', () => {
    expect(hasPermission('orders:read', ['orders:view'])).toBe(false)
    expect(hasPermission('orders:view', ['orders:read'])).toBe(false)
    expect(hasPermission('orders:update', ['orders:edit'])).toBe(false)
    expect(hasPermission('orders:edit', ['orders:update'])).toBe(false)
  })

  it('accepts a required list when any exact permission matches', () => {
    expect(hasPermission(['orders:read', 'orders:update'], ['orders:update'])).toBe(true)
    expect(hasPermission(['orders:read', 'orders:update'], ['orders:edit'])).toBe(false)
  })

  it('does not grant a different resource or action', () => {
    expect(hasPermission('orders:read', ['products:read'])).toBe(false)
    expect(hasPermission('orders:read', ['orders:delete'])).toBe(false)
  })

  it('fails closed for empty requirements, empty permissions, and malformed codes', () => {
    expect(hasPermission([], ['*:*'])).toBe(false)
    expect(hasPermission('orders:read', [])).toBe(false)
    expect(hasPermission('orders:read', ['orders', '*', 'orders:'])).toBe(false)
  })
})
