import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COLOR_CARDS_PATH,
  CUSTOMER_DETAIL_PATH,
  CUSTOMER_FOLLOW_UPS_PATH,
  CUSTOMER_SELECT_PATH,
  CUSTOMERS_PATH,
  DASHBOARD_OVERVIEW_PATH,
  ORDER_DETAIL_PATH,
  ORDERS_PATH,
  PAYMENT_DETAIL_PATH,
  PAYMENTS_PATH,
  PRINT_TASK_DETAIL_PATH,
  PRINT_TASKS_PATH,
  COLOR_CARD_DETAIL_PATH,
  COLOR_CARD_ITEMS_PATH,
  PRODUCT_COLORS_PATH,
  PRODUCT_DETAIL_PATH,
  PRODUCT_SELECT_PATH,
  PRODUCTS_PATH,
  SALES_RETURNS_PATH,
  SALES_RETURN_DETAIL_PATH,
  SALES_RETURN_ITEMS_PATH,
} from '../../src/shared/api/contracts'

const snapshotPath = resolve(import.meta.dirname, '../../../frontend/scripts/route-snapshot.txt')
const registeredMethods = new Map<string, Set<string>>()
for (const line of readFileSync(snapshotPath, 'utf8').split(/\r?\n/)) {
  const [method, rawPath] = line.split('\t')
  if (!method || !rawPath) continue
  const apiPath = rawPath.replace(/\{[^}]+\}/g, '*').replace(/\$\{[^}]+\}/g, '*')
  const methods = registeredMethods.get(apiPath) ?? new Set<string>()
  methods.add(method)
  registeredMethods.set(apiPath, methods)
}

const endpoints = [
  ['DASHBOARD_OVERVIEW_PATH', DASHBOARD_OVERVIEW_PATH, '/api/v1/erp/dashboard/overview'],
  ['CUSTOMERS_PATH', CUSTOMERS_PATH, '/api/v1/erp/crm/customers'],
  ['CUSTOMER_DETAIL_PATH', CUSTOMER_DETAIL_PATH, '/api/v1/erp/crm/customers/{id}'],
  ['CUSTOMER_SELECT_PATH', CUSTOMER_SELECT_PATH, '/api/v1/erp/crm/customers/select'],
  [
    'CUSTOMER_FOLLOW_UPS_PATH',
    CUSTOMER_FOLLOW_UPS_PATH,
    '/api/v1/erp/crm/customers/{id}/follow-ups',
  ],
  ['PRODUCTS_PATH', PRODUCTS_PATH, '/api/v1/erp/products'],
  ['PRODUCT_COLORS_PATH', PRODUCT_COLORS_PATH, '/api/v1/erp/products/{id}/colors'],
  ['PRODUCT_DETAIL_PATH', PRODUCT_DETAIL_PATH, '/api/v1/erp/products/{id}'],
  ['PRODUCT_SELECT_PATH', PRODUCT_SELECT_PATH, '/api/v1/erp/products/select'],
  ['COLOR_CARDS_PATH', COLOR_CARDS_PATH, '/api/v1/erp/color-cards'],
  ['COLOR_CARD_DETAIL_PATH', COLOR_CARD_DETAIL_PATH, '/api/v1/erp/color-cards/{id}'],
  ['COLOR_CARD_ITEMS_PATH', COLOR_CARD_ITEMS_PATH, '/api/v1/erp/color-cards/{id}/items'],
  ['ORDERS_PATH', ORDERS_PATH, '/api/v1/erp/sales/orders'],
  ['ORDER_DETAIL_PATH', ORDER_DETAIL_PATH, '/api/v1/erp/sales/orders/{id}'],
  ['PAYMENTS_PATH', PAYMENTS_PATH, '/api/v1/erp/ar/payments'],
  ['PAYMENT_DETAIL_PATH', PAYMENT_DETAIL_PATH, '/api/v1/erp/ar/payments/{id}'],
  ['PRINT_TASKS_PATH', PRINT_TASKS_PATH, '/api/v1/erp/print-tasks'],
  ['PRINT_TASK_DETAIL_PATH', PRINT_TASK_DETAIL_PATH, '/api/v1/erp/print-tasks/{id}'],
  ['SALES_RETURNS_PATH', SALES_RETURNS_PATH, '/api/v1/erp/sales/sales-returns'],
  ['SALES_RETURN_DETAIL_PATH', SALES_RETURN_DETAIL_PATH, '/api/v1/erp/sales/sales-returns/{id}'],
  [
    'SALES_RETURN_ITEMS_PATH',
    SALES_RETURN_ITEMS_PATH,
    '/api/v1/erp/sales/sales-returns/{id}/items',
  ],
] as const

describe('Phase 2 endpoint contracts', () => {
  it.each(endpoints)('%s uses its full registered GET path', (_name, actual, expected) => {
    const normalized = actual.replace(/\{[^}]+\}/g, '*')
    expect(actual).toBe(expected)
    expect(registeredMethods.get(normalized)?.has('GET')).toBe(true)
  })
})
