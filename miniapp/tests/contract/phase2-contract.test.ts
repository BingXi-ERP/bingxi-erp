import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COLOR_CARDS_PATH,
  CUSTOMERS_PATH,
  DASHBOARD_OVERVIEW_PATH,
  ORDERS_PATH,
  PAYMENTS_PATH,
  PRINT_TASKS_PATH,
  PRODUCT_COLORS_PATH,
  PRODUCTS_PATH,
  SALES_RETURNS_PATH,
} from '../../src/shared/api/contracts'

const snapshotPath = resolve(import.meta.dirname, '../../../frontend/scripts/route-snapshot.txt')
const registeredPaths = new Set(
  readFileSync(snapshotPath, 'utf8')
    .split(/\r?\n/)
    .flatMap((line) => {
      const apiPath = line.split('\t')[1]
      if (!apiPath) return []
      return [apiPath.replace(/\{[^}]+\}/g, '*').replace(/\$\{[^}]+\}/g, '*')]
    }),
)

const endpoints = [
  ['DASHBOARD_OVERVIEW_PATH', DASHBOARD_OVERVIEW_PATH, '/api/v1/erp/dashboard/overview'],
  ['CUSTOMERS_PATH', CUSTOMERS_PATH, '/api/v1/erp/crm/customers'],
  ['PRODUCTS_PATH', PRODUCTS_PATH, '/api/v1/erp/products'],
  ['PRODUCT_COLORS_PATH', PRODUCT_COLORS_PATH, '/api/v1/erp/products/{id}/colors'],
  ['COLOR_CARDS_PATH', COLOR_CARDS_PATH, '/api/v1/erp/color-cards'],
  ['ORDERS_PATH', ORDERS_PATH, '/api/v1/erp/sales/orders'],
  ['PAYMENTS_PATH', PAYMENTS_PATH, '/api/v1/erp/ar/payments'],
  ['PRINT_TASKS_PATH', PRINT_TASKS_PATH, '/api/v1/erp/print-tasks'],
  ['SALES_RETURNS_PATH', SALES_RETURNS_PATH, '/api/v1/erp/sales/sales-returns'],
] as const

describe('Phase 2 endpoint contracts', () => {
  it.each(endpoints)('%s uses its full registered ERP path', (_name, actual, expected) => {
    expect(actual).toBe(expected)
    expect(registeredPaths.has(actual.replace(/\{[^}]+\}/g, '*'))).toBe(true)
  })
})
