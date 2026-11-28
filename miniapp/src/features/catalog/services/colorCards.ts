import { z } from 'zod'
import { apiClient } from '../../../shared/api/client'
import { COLOR_CARD_DETAIL_PATH, COLOR_CARDS_PATH } from '../../../shared/api/contracts'
import { AppError } from '../../../shared/api/response'
import {
  colorCardDetailSchema,
  colorCardSchema,
  type ColorCard,
  type ColorCardDetail,
} from '../types'

const colorCardPageSchema = z.strictObject({
  items: z.array(colorCardSchema),
  total: z.number().int(),
  page: z.number().int(),
  page_size: z.number().int(),
})

export interface ColorCardListQuery {
  page?: number
  page_size?: number
  card_type?: string
  season?: string
  status?: ColorCard['status']
  keyword?: string
}

function parse<T>(schema: z.ZodType<T>, value: unknown, path: string): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    const fields = result.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}:${issue.code}`)
      .join(', ')
    throw new AppError({
      code: 'INVALID_RESPONSE',
      message: `Invalid color card response from ${path}: ${fields}`,
    })
  }
  return result.data
}

export const colorCardService = {
  async list(query: ColorCardListQuery) {
    const value = await apiClient.get<unknown>(COLOR_CARDS_PATH, { ...query })
    return parse(colorCardPageSchema, value, COLOR_CARDS_PATH)
  },

  async detail(id: number): Promise<ColorCardDetail> {
    if (!Number.isInteger(id) || id < 1) throw new Error('Color card id must be a positive integer')
    const value = await apiClient.get<unknown>(COLOR_CARD_DETAIL_PATH, undefined, {
      pathParams: { id },
    })
    return parse(colorCardDetailSchema, value, COLOR_CARD_DETAIL_PATH)
  },
}
