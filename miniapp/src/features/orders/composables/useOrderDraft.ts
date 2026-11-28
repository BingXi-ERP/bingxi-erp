import { computed, ref } from 'vue'
import { logger } from '../../../shared/api/logger'
import { isAppError } from '../../../shared/api/response'
import { t } from '../../../shared/i18n'
import { calculateLineTotal, compareDecimals, sumDecimals } from '../../../shared/trade'
import { orderService } from '../services/orders'
import type { CreateOrderPayload, SalesOrder } from '../types'

type OrderDraftItem = CreateOrderPayload['items'][number]

export function useOrderDraft() {
  const customerId = ref(0)
  const contactPerson = ref('')
  const contactPhone = ref('')
  const shippingAddress = ref('')
  const orderDate = ref(new Date().toISOString())
  const notes = ref('')
  const items = ref<OrderDraftItem[]>([])
  const submitting = ref(false)
  const submitError = ref('')

  const errors = computed(() => {
    const result: string[] = []
    if (customerId.value < 1) result.push('customer_required')
    if (!contactPerson.value.trim()) result.push('contact_person_required')
    if (!contactPhone.value.trim()) result.push('contact_phone_required')
    if (!shippingAddress.value.trim()) result.push('shipping_address_required')
    if (items.value.length === 0) result.push('items_required')
    items.value.forEach((item, index) => {
      try {
        if (compareDecimals(item.quantity, '0') <= 0) result.push(`item_${index}_quantity_invalid`)
        if (compareDecimals(item.unit_price, '0') <= 0) result.push(`item_${index}_price_invalid`)
      } catch {
        result.push(`item_${index}_decimal_invalid`)
      }
    })
    return result
  })

  const canSubmit = computed(() => errors.value.length === 0 && !submitting.value)
  const subtotal = computed(() => {
    if (items.value.length === 0) return ''
    try {
      return sumDecimals(
        items.value.map((item) => calculateLineTotal(item.quantity, item.unit_price)),
      )
    } catch {
      return ''
    }
  })

  function setCustomer(
    id: number,
    details: { contact_person?: string; contact_phone?: string; address?: string },
  ) {
    customerId.value = id
    contactPerson.value = details.contact_person ?? ''
    contactPhone.value = details.contact_phone ?? ''
    shippingAddress.value = details.address ?? ''
  }

  function addItem(item: OrderDraftItem) {
    items.value.push({ ...item })
  }

  function updateItem(index: number, patch: Partial<OrderDraftItem>) {
    const current = items.value[index]
    if (!current) return
    items.value[index] = { ...current, ...patch }
  }

  function removeItem(index: number) {
    items.value.splice(index, 1)
  }

  async function submit(): Promise<SalesOrder | null> {
    if (!canSubmit.value) return null
    submitting.value = true
    submitError.value = ''
    const payload: CreateOrderPayload = {
      customer_id: customerId.value,
      order_date: orderDate.value,
      contact_person: contactPerson.value,
      contact_phone: contactPhone.value,
      shipping_address: shippingAddress.value,
      notes: notes.value || undefined,
      items: items.value.map((item) => ({ ...item })),
    }
    try {
      const order = await orderService.create(payload)
      items.value = []
      return order
    } catch (error) {
      submitError.value = isAppError(error) ? error.message : t('orders.submitFailed')
      logger.error('orders.submit_failed', {
        code: isAppError(error) ? error.code : 'UNKNOWN_ERROR',
      })
      return null
    } finally {
      submitting.value = false
    }
  }

  return {
    customerId,
    contactPerson,
    contactPhone,
    shippingAddress,
    orderDate,
    notes,
    items,
    submitting,
    submitError,
    errors,
    canSubmit,
    subtotal,
    setCustomer,
    addItem,
    updateItem,
    removeItem,
    submit,
  }
}
