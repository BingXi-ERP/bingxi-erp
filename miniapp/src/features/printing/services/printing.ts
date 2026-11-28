import { z } from 'zod'
import { apiClient } from '../../../shared/api/client'
import { PRINT_TASK_DETAIL_PATH, PRINT_TASKS_PATH } from '../../../shared/api/contracts'
import { AppError } from '../../../shared/api/response'

const printTaskSchema = z.strictObject({
  id: z.number().int(),
  job_code: z.string(),
  requested_by: z.number().int(),
  requested_by_name: z.string(),
  doc_type: z.string(),
  doc_id: z.number().int(),
  template_id: z.number().int().nullable(),
  target_kind: z.string(),
  target_name: z.string(),
  copies: z.number().int(),
  paper_size: z.string(),
  orientation: z.string(),
  margin_top_mm: z.number().int(),
  margin_bottom_mm: z.number().int(),
  margin_left_mm: z.number().int(),
  margin_right_mm: z.number().int(),
  barcode_enabled: z.boolean(),
  source_module: z.string(),
  status: z.enum(['pending', 'queued', 'dispatched', 'succeeded', 'failed']),
  backend_kind: z.string(),
  external_job_id: z.string().nullable(),
  error_message: z.string().nullable(),
  dispatched_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

const printTaskRefSchema = z.strictObject({
  id: z.number().int(),
  job_code: z.string(),
})

export type PrintTask = z.infer<typeof printTaskSchema>
export type PrintTaskRef = z.infer<typeof printTaskRefSchema>

export interface CreatePrintTaskPayload {
  doc_type: string
  doc_id: number
  target_name?: string
  template_id?: number
  copies?: number
  paper_size?: string
  orientation?: string
  margin_top_mm?: number
  margin_bottom_mm?: number
  margin_left_mm?: number
  margin_right_mm?: number
  barcode_enabled?: boolean
}

function parse<T>(schema: z.ZodType<T>, value: unknown, path: string): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    const fields = result.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}:${issue.code}`)
      .join(', ')
    throw new AppError({
      code: 'INVALID_RESPONSE',
      message: `Invalid print task response from ${path}: ${fields}`,
    })
  }
  return result.data
}

export function isPrintTaskTerminal(status: PrintTask['status']): boolean {
  return status === 'succeeded' || status === 'failed'
}

export const printingService = {
  async create(payload: CreatePrintTaskPayload): Promise<PrintTaskRef> {
    const value = await apiClient.post<unknown>(PRINT_TASKS_PATH, payload)
    return parse(printTaskRefSchema, value, PRINT_TASKS_PATH)
  },

  async get(id: number): Promise<PrintTask> {
    if (!Number.isInteger(id) || id < 1) throw new Error('Print task id must be a positive integer')
    const value = await apiClient.get<unknown>(PRINT_TASK_DETAIL_PATH, undefined, {
      pathParams: { id },
    })
    return parse(printTaskSchema, value, PRINT_TASK_DETAIL_PATH)
  },
}
