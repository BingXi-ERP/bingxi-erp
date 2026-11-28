import { computed, reactive, ref } from 'vue'
import { logger } from '../../../shared/api/logger'
import { isAppError } from '../../../shared/api/response'
import { t } from '../../../shared/i18n'
import { mergeUniqueById, normalizePageQuery } from '../../../shared/trade'
import { productService, type ProductListQuery } from '../services/products'
import type { Product } from '../types'

export function useProducts() {
  const items = ref<Product[]>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(10)
  const status = ref<'loading' | 'empty' | 'error' | 'success'>('loading')
  const message = ref('')
  const filters = reactive<ProductListQuery>({ search: '' })
  const loading = computed(() => status.value === 'loading')
  const hasMore = computed(() => page.value * pageSize.value < total.value)

  async function load() {
    status.value = 'loading'
    message.value = ''
    try {
      const query = normalizePageQuery({ page: 1, page_size: pageSize.value })
      const result = await productService.list({ ...query, ...filters })
      items.value = result.items
      total.value = result.total
      page.value = result.page
      pageSize.value = result.page_size
      status.value = result.items.length === 0 ? 'empty' : 'success'
      logger.info('products.loaded', { total: result.total, page: result.page })
    } catch (error) {
      items.value = []
      status.value = 'error'
      message.value = isAppError(error) ? error.message : t('catalog.loadFailed')
      logger.error('products.load_failed', {
        code: isAppError(error) ? error.code : 'UNKNOWN_ERROR',
      })
    }
  }

  async function loadMore() {
    if (loading.value || !hasMore.value) return
    status.value = 'loading'
    try {
      const query = normalizePageQuery({ page: page.value + 1, page_size: pageSize.value })
      const result = await productService.list({ ...query, ...filters })
      items.value = mergeUniqueById(items.value, result.items)
      total.value = result.total
      page.value = result.page
      pageSize.value = result.page_size
      status.value = 'success'
    } catch (error) {
      status.value = 'error'
      message.value = isAppError(error) ? error.message : t('catalog.loadFailed')
      logger.error('products.load_more_failed', {
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
