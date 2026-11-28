import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('../../src/shared/api/client', () => ({ apiClient: { get, post } }))

import { PRINT_TASK_DETAIL_PATH, PRINT_TASKS_PATH } from '../../src/shared/api/contracts'
import { isPrintTaskTerminal, printingService } from '../../src/features/printing/services/printing'

const task = {
  id: 3,
  job_code: 'PT-3',
  requested_by: 1,
  requested_by_name: '管理员',
  doc_type: 'sales_order',
  doc_id: 11,
  template_id: null,
  target_kind: 'printer',
  target_name: 'office',
  copies: 1,
  paper_size: 'A4',
  orientation: 'portrait',
  margin_top_mm: 10,
  margin_bottom_mm: 10,
  margin_left_mm: 10,
  margin_right_mm: 10,
  barcode_enabled: false,
  source_module: 'miniapp',
  status: 'pending',
  backend_kind: 'queue',
  external_job_id: null,
  error_message: null,
  dispatched_at: null,
  completed_at: null,
  created_at: '2026-11-28T00:00:00Z',
  updated_at: '2026-11-28T00:00:00Z',
}

describe('printingService', () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
  })

  it('creates a print task and returns only the job reference', async () => {
    post.mockResolvedValue({ id: 3, job_code: 'PT-3' })

    await expect(
      printingService.create({ doc_type: 'sales_order', doc_id: 11, copies: 2 }),
    ).resolves.toEqual({ id: 3, job_code: 'PT-3' })
    expect(post).toHaveBeenCalledWith(PRINT_TASKS_PATH, {
      doc_type: 'sales_order',
      doc_id: 11,
      copies: 2,
    })
  })

  it('reads task status through a resolved id', async () => {
    get.mockResolvedValue(task)

    await expect(printingService.get(3)).resolves.toEqual(task)
    expect(get).toHaveBeenCalledWith(PRINT_TASK_DETAIL_PATH, undefined, {
      pathParams: { id: 3 },
    })
  })

  it('does not treat accepted or dispatched tasks as completed', () => {
    expect(isPrintTaskTerminal('pending')).toBe(false)
    expect(isPrintTaskTerminal('queued')).toBe(false)
    expect(isPrintTaskTerminal('dispatched')).toBe(false)
    expect(isPrintTaskTerminal('succeeded')).toBe(true)
    expect(isPrintTaskTerminal('failed')).toBe(true)
  })
})
