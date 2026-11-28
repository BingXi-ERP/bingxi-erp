import { ref } from 'vue'
import { isAppError } from '../../../shared/api/response'
import { logger } from '../../../shared/api/logger'
import { t } from '../../../shared/i18n'
import { dashboardService, type DashboardOverview } from '../services/dashboard'

export function useDashboard() {
  const status = ref<'loading' | 'empty' | 'error' | 'success'>('loading')
  const message = ref('')
  const overview = ref<DashboardOverview | null>(null)

  async function load() {
    status.value = 'loading'
    message.value = ''
    try {
      overview.value = await dashboardService.overview()
      status.value = 'success'
      logger.info('workspace.dashboard_loaded')
    } catch (error) {
      overview.value = null
      status.value = 'error'
      message.value = isAppError(error) ? error.message : t('workspace.dashboardFailed')
      logger.error('workspace.dashboard_failed', {
        code: isAppError(error) ? error.code : 'UNKNOWN_ERROR',
      })
    }
  }

  return { status, message, overview, load }
}
