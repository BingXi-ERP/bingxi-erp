import { computed, ref } from 'vue'
import { logger } from '../../../shared/api/logger'
import { isAppError } from '../../../shared/api/response'
import { t } from '../../../shared/i18n'
import { compareDecimals } from '../../../shared/trade'
import { salesReturnService } from '../services/salesReturns'
import type { CreateSalesReturnHeader, CreateSalesReturnItem } from '../types'

interface ReturnDraftItem extends CreateSalesReturnItem {
  maxQuantity: string
}

export function useReturnDraft() {
  const header = ref<CreateSalesReturnHeader | null>(null)
  const items = ref<ReturnDraftItem[]>([])
  const submitting = ref(false)
  const submitError = ref('')

  const errors = computed(() => {
    const result: string[] = []
    if (!header.value) result.push('header_required')
    if (items.value.length === 0) result.push('items_required')
    items.value.forEach((item, index) => {
      try {
        if (compareDecimals(item.quantity, '0') <= 0) result.push(`item_${index}_quantity_invalid`)
        if (compareDecimals(item.quantity, item.maxQuantity) > 0) {
          result.push('quantity_exceeds_returnable')
        }
        if (compareDecimals(item.unit_price, '0') < 0) result.push(`item_${index}_price_invalid`)
      } catch {
        result.push(`item_${index}_decimal_invalid`)
      }
    })
    return result
  })

  const canSubmit = computed(() => errors.value.length === 0 && !submitting.value)

  function setHeader(value: CreateSalesReturnHeader) {
    header.value = { ...value }
  }

  function addItem(item: ReturnDraftItem) {
    items.value.push({ ...item })
  }

  function removeItem(index: number) {
    items.value.splice(index, 1)
  }

  async function submit() {
    if (!canSubmit.value || !header.value) return null
    submitting.value = true
    submitError.value = ''
    try {
      const created = await salesReturnService.createHeader(header.value)
      for (const item of items.value) {
        const payload = Object.fromEntries(
          Object.entries(item).filter(([key]) => key !== 'maxQuantity'),
        ) as unknown as CreateSalesReturnItem
        await salesReturnService.createItem(created.id, payload)
      }
      header.value = null
      items.value = []
      return created
    } catch (error) {
      submitError.value = isAppError(error) ? error.message : t('salesReturns.submitFailed')
      logger.error('sales_returns.submit_failed', {
        code: isAppError(error) ? error.code : 'UNKNOWN_ERROR',
      })
      return null
    } finally {
      submitting.value = false
    }
  }

  return {
    header,
    items,
    submitting,
    submitError,
    errors,
    canSubmit,
    setHeader,
    addItem,
    removeItem,
    submit,
  }
}
