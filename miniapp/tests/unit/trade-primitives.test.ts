import { describe, expect, it } from 'vitest'
import {
  calculateLineTotal,
  compareDecimals,
  mergeUniqueById,
  normalizeDecimals,
  normalizePageQuery,
  normalizeSalesOrderStatus,
  normalizeSalesReturnStatus,
} from '../../src/shared/trade'

describe('trade decimal helpers', () => {
  it('normalizes decimal strings without floating-point conversion', () => {
    expect(normalizeDecimals(['001.2300', '0.000', '-2.500'])).toEqual(['1.23', '0', '-2.5'])
  })

  it('rejects malformed decimal strings instead of coercing them', () => {
    expect(() => normalizeDecimals(['1e3'])).toThrow('Invalid decimal')
    expect(() => normalizeDecimals([''])).toThrow('Invalid decimal')
    expect(() => normalizeDecimals(['NaN'])).toThrow('Invalid decimal')
  })

  it('calculates line totals exactly', () => {
    expect(calculateLineTotal('12.345', '7.890')).toBe('97.40205')
    expect(calculateLineTotal('0', '7.890')).toBe('0')
  })

  it('compares decimals exactly across different scales', () => {
    expect(compareDecimals('1.20', '1.2')).toBe(0)
    expect(compareDecimals('1.2001', '1.2')).toBe(1)
    expect(compareDecimals('-2.5', '-2.50')).toBe(0)
  })
})

describe('trade pagination helpers', () => {
  it('accepts only positive integer pagination values', () => {
    expect(normalizePageQuery({ page: 2, page_size: 50 })).toEqual({ page: 2, page_size: 50 })
    expect(() => normalizePageQuery({ page: 0, page_size: 50 })).toThrow('page must be a positive integer')
    expect(() => normalizePageQuery({ page: 1, page_size: 1.5 })).toThrow(
      'page_size must be a positive integer',
    )
  })

  it('merges pages by id while preserving the newest occurrence', () => {
    const first = { id: 1, name: 'old' }
    const second = { id: 2, name: 'second' }
    const refreshed = { id: 1, name: 'new' }

    expect(mergeUniqueById([first, second], [refreshed])).toEqual([refreshed, second])
  })
})

describe('trade status vocabularies', () => {
  it('accepts only backend sales order status tokens', () => {
    expect(normalizeSalesOrderStatus('partial_shipped')).toBe('partial_shipped')
    expect(() => normalizeSalesOrderStatus('PARTIAL_SHIPPED')).toThrow('Unknown sales order status')
  })

  it('accepts only uppercase backend sales return status tokens', () => {
    expect(normalizeSalesReturnStatus('SUBMITTED')).toBe('SUBMITTED')
    expect(() => normalizeSalesReturnStatus('submitted')).toThrow('Unknown sales return status')
  })
})
