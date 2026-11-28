import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../../src/shared/api/client', () => ({ apiClient: { get } }))

import { DASHBOARD_OVERVIEW_PATH } from '../../src/shared/api/contracts'
import { dashboardService } from '../../src/features/workspace/services/dashboard'

const overview = {
  total_products: 12,
  total_warehouses: 2,
  total_orders: 34,
  total_sales: '12345.67',
  low_stock_count: 3,
  pending_orders: 4,
  monthly_sales: '2345.67',
  inventory_total: '890.5',
  inventory_weight_kg: '1234.25',
  customer_count: 56,
  today_orders: 7,
  fabric_count: 9,
}

describe('dashboardService', () => {
  beforeEach(() => {
    get.mockReset()
  })

  it('loads and validates the real dashboard overview', async () => {
    get.mockResolvedValue(overview)

    await expect(dashboardService.overview()).resolves.toEqual(overview)
    expect(get).toHaveBeenCalledWith(DASHBOARD_OVERVIEW_PATH)
  })

  it('rejects a response missing a required metric', async () => {
    const incomplete = Object.fromEntries(
      Object.entries(overview).filter(([key]) => key !== 'fabric_count'),
    )
    get.mockResolvedValue(incomplete)

    await expect(dashboardService.overview()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('rejects numeric strings for count metrics', async () => {
    get.mockResolvedValue({ ...overview, total_orders: '34' })

    await expect(dashboardService.overview()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
})
