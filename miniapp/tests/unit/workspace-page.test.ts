import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspacePage from '../../src/features/workspace/pages/index/index.vue'

const { dashboard, reLaunch, session, switchTab } = vi.hoisted(() => {
  const session = {
    user: {
      id: 1,
      username: 'alice',
      email: null,
      role_id: 2,
      role_name: 'Sales',
      permissions: ['orders:read'],
      phone: null,
      department_id: null,
      department_name: null,
      is_totp_enabled: false,
      real_name: null,
      avatar: null,
      agreed_to_terms_at: null,
    },
    can: vi.fn((permission: string | string[]) => {
      const required = Array.isArray(permission) ? permission : [permission]
      return required.includes('orders:read')
    }),
    verify: vi.fn(),
  }
  const dashboard = {
    overview: vi.fn().mockResolvedValue({
      total_products: 12,
      total_warehouses: 2,
      total_orders: 34,
      total_sales: '12345.67',
      low_stock_count: 3,
      pending_orders: 4,
      monthly_sales: '2345.67',
      inventory_total: '890.5',
      inventory_weight_kg: '1234.25',
      customer_count: 56,
      today_orders: 7,
      fabric_count: 9,
    }),
  }
  return { dashboard, reLaunch: vi.fn(), session, switchTab: vi.fn() }
})

vi.stubGlobal('uni', { reLaunch, switchTab })
vi.mock('../../src/features/auth/stores/session', () => ({
  useSessionStore: () => session,
}))
vi.mock('../../src/features/workspace/services/dashboard', () => ({
  dashboardService: dashboard,
}))

const global = {
  stubs: {
    'wd-button': {
      inheritAttrs: true,
      emits: ['click'],
      props: ['disabled', 'loading', 'type'],
      template:
        '<button :type="type" :disabled="disabled || loading" @click="$emit(\'click\', $event)"><slot /></button>',
    },
  },
}

describe('WorkspacePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    session.verify.mockResolvedValue('valid')
  })

  it('shows the authenticated user and only permission-controlled entries', async () => {
    const wrapper = mount(WorkspacePage, { global })
    await flushPromises()

    expect(wrapper.text()).toContain('alice')
    expect(wrapper.find('[data-permission="orders:read"]').exists()).toBe(true)
    expect(wrapper.find('[data-permission="orders:create"]').exists()).toBe(false)
    expect(wrapper.find('.app-tab-bar__item').text()).not.toBe('')
  })

  it('renders real dashboard metrics after session verification', async () => {
    const wrapper = mount(WorkspacePage, { global })
    await flushPromises()

    expect(dashboard.overview).toHaveBeenCalledOnce()
    expect(wrapper.find('[data-test="metric-orders"]').text()).toContain('34')
    expect(wrapper.find('[data-test="metric-sales"]').text()).toContain('12345.67')
    expect(wrapper.find('[data-test="metric-customers"]').text()).toContain('56')
  })

  it('shows a retryable error when dashboard loading fails', async () => {
    dashboard.overview.mockRejectedValueOnce(new Error('network unavailable'))
    const wrapper = mount(WorkspacePage, { global })
    await flushPromises()

    expect(wrapper.find('.state-view__retry').exists()).toBe(true)
    expect(wrapper.find('[data-test="metric-orders"]').exists()).toBe(false)

    await wrapper.find('.state-view__retry').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="metric-orders"]').exists()).toBe(true)
  })

  it('opens the workspace tab through the registered tab route', async () => {
    const wrapper = mount(WorkspacePage, { global })
    await flushPromises()

    await wrapper.find('.app-tab-bar__item').trigger('click')

    expect(switchTab).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/features/workspace/pages/index/index' }),
    )
  })

  it.each(['none', 'invalid'] as const)(
    'returns to login when session verification is %s',
    async (result) => {
      session.verify.mockResolvedValue(result)
      const wrapper = mount(WorkspacePage, { global })
      await flushPromises()

      expect(reLaunch).toHaveBeenCalledWith({ url: '/pages/login/index' })
      expect(wrapper.find('[data-permission="orders:read"]').exists()).toBe(false)
    },
  )

  it('shows a retryable error when verification rejects', async () => {
    session.verify.mockRejectedValue(new Error('network unavailable'))
    const wrapper = mount(WorkspacePage, { global })
    await flushPromises()

    expect(wrapper.find('.state-view__retry').exists()).toBe(true)
    expect(wrapper.find('[data-permission="orders:read"]').exists()).toBe(false)
    expect(reLaunch).not.toHaveBeenCalled()
  })

  it('shows a retryable error when verification cannot complete', async () => {
    session.verify.mockResolvedValue('error')
    const wrapper = mount(WorkspacePage, { global })
    await flushPromises()

    const retry = wrapper.find('.state-view__retry')
    expect(retry.exists()).toBe(true)
    expect(wrapper.find('[data-test="workspace-user"]').exists()).toBe(false)

    session.verify.mockResolvedValue('valid')
    await retry.trigger('click')
    await flushPromises()

    expect(session.verify).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-test="workspace-user"]').exists()).toBe(true)
  })
})
