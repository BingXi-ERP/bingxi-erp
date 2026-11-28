import { ref } from 'vue'
import { logger } from '../../../shared/api/logger'
import { isAppError } from '../../../shared/api/response'
import { t } from '../../../shared/i18n'
import { paymentService, validatePaymentAmount, type ArPayment } from '../services/payments'

export function usePaymentForm() {
  const customerId = ref(0)
  const outstanding = ref('')
  const amount = ref('')
  const method = ref('cash')
  const paymentDate = ref(new Date().toISOString().slice(0, 10))
  const remark = ref('')
  const submitting = ref(false)
  const error = ref('')

  function setCustomer(id: number, balance: string) {
    customerId.value = id
    outstanding.value = balance
  }

  async function submit(): Promise<ArPayment | null> {
    if (submitting.value) return null
    error.value = ''
    let normalizedAmount: string
    try {
      normalizedAmount = validatePaymentAmount(amount.value, outstanding.value)
    } catch (validationError) {
      const code =
        validationError instanceof Error ? validationError.message : 'PAYMENT_AMOUNT_INVALID'
      const key =
        code === 'PAYMENT_AMOUNT_NOT_POSITIVE'
          ? 'payments.amountNotPositive'
          : code === 'PAYMENT_AMOUNT_PRECISION'
            ? 'payments.amountPrecision'
            : code === 'PAYMENT_AMOUNT_EXCEEDS_OUTSTANDING'
              ? 'payments.amountExceedsOutstanding'
              : 'payments.amountInvalid'
      error.value = t(key)
      return null
    }

    submitting.value = true
    try {
      const payment = await paymentService.create({
        customer_id: customerId.value,
        amount: normalizedAmount,
        payment_method: method.value,
        payment_date: paymentDate.value,
        remark: remark.value || undefined,
      })
      amount.value = ''
      return payment
    } catch (submitError) {
      error.value = isAppError(submitError) ? submitError.message : t('payments.saveFailed')
      logger.error('payments.submit_failed', {
        code: isAppError(submitError) ? submitError.code : 'UNKNOWN_ERROR',
      })
      return null
    } finally {
      submitting.value = false
    }
  }

  return {
    customerId,
    outstanding,
    amount,
    method,
    paymentDate,
    remark,
    submitting,
    error,
    setCustomer,
    submit,
  }
}
