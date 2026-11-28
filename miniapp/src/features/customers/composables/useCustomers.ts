import { computed, reactive, ref } from 'vue'
import { logger } from '../../../shared/api/logger'
import { isAppError } from '../../../shared/api/response'
import { t } from '../../../shared/i18n'
import { mergeUniqueById, normalizePageQuery } from '../../../shared/trade'
import { customerService } from '../services/customers'
import type { Customer, CustomerListQuery } from '../types'

export function useCustomers() {
  const items = ref<Customer[]>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(20)
  const status = ref<'loading' | 'empty' | 'error' | 'success'>('loading')
  const message = ref('')
  const filters = reactive<CustomerListQuery>({ keyword: '' })
  const loading = computed(() => status.value === 'loading')
  const hasMore = computed(() => page.value * pageSize.value < total.value)

  async function load() {
    status.value = 'loading'
    message.value = ''
    try {
      const query = normalizePageQuery({ page: 1, page_size: pageSize.value })
      const result = await customerService.list({ ...query, ...filters })
      items.value = result.items
      total.value = result.total
      page.value = result.page
      pageSize.value = result.page_size
      status.value = result.items.length === 0 ? 'empty' : 'success'
      logger.info('customers.loaded', { total: result.total, page: result.page })
    } catch (error) {
      items.value = []
      status.value = 'error'
      message.value = isAppError(error) ? error.message : t('customers.loadFailed')
      logger.error('customers.load_failed', {
        code: isAppError(error) ? error.code : 'UNKNOWN_ERROR',
      })
    }
  }

  async function loadMore() {
    if (loading.value || !hasMore.value) return
    status.value = 'loading'
    try {
      const nextPage = page.value + 1
      const query = normalizePageQuery({ page: nextPage, page_size: pageSize.value })
      const result = await customerService.list({ ...query, ...filters })
      items.value = mergeUniqueById(items.value, result.items)
      total.value = result.total
      page.value = result.page
      pageSize.value = result.page_size
      status.value = 'success'
      logger.info('customers.loaded_more', { total: result.total, page: result.page })
    } catch (error) {
      status.value = 'error'
      message.value = isAppError(error) ? error.message : t('customers.loadFailed')
      logger.error('customers.load_more_failed', {
        code: isAppError(error) ? error.code : 'UNKNOWN_ERROR',
      })
    }
  }

  return {
    items,
    total,
    page,
    pageSize,
    status,
    message,
    filters,
    loading,
    hasMore,
    load,
    loadMore,
  }
}
