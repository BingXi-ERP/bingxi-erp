import { z } from 'zod'
import { apiClient } from '../../../shared/api/client'
import { DASHBOARD_OVERVIEW_PATH } from '../../../shared/api/contracts'
import { AppError } from '../../../shared/api/response'

const dashboardOverviewSchema = z.strictObject({
  total_products: z.number().int(),
  total_warehouses: z.number().int(),
  total_orders: z.number().int(),
  total_sales: z.string(),
  low_stock_count: z.number().int(),
  pending_orders: z.number().int(),
  monthly_sales: z.string(),
  inventory_total: z.string(),
  inventory_weight_kg: z.string(),
  customer_count: z.number().int(),
  today_orders: z.number().int(),
  fabric_count: z.number().int(),
})

export type DashboardOverview = z.infer<typeof dashboardOverviewSchema>

export const dashboardService = {
  async overview(): Promise<DashboardOverview> {
    const value = await apiClient.get<unknown>(DASHBOARD_OVERVIEW_PATH)
    const result = dashboardOverviewSchema.safeParse(value)
    if (!result.success) {
      const fields = result.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}:${issue.code}`)
        .join(', ')
      throw new AppError({
        code: 'INVALID_RESPONSE',
        message: `Invalid dashboard response from ${DASHBOARD_OVERVIEW_PATH}: ${fields}`,
      })
    }
    return result.data
  },
}
