import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const listeners = new Map<string, (value: unknown) => void>()
const { navigateTo } = vi.hoisted(() => ({ navigateTo: vi.fn() }))
vi.stubGlobal('uni', {
  navigateTo,
  $on: vi.fn((event: string, handler: (value: unknown) => void) => listeners.set(event, handler)),
  $off: vi.fn((event: string) => listeners.delete(event)),
})

import CustomerPicker from '../../src/features/customers/components/CustomerPicker.vue'

const customer = {
  id: 7,
  customer_code: 'C-7',
  customer_name: '测试客户',
  status: 'active' as const,
  customer_type: 'wholesale' as const,
}

describe('CustomerPicker', () => {
  beforeEach(() => {
    listeners.clear()
    navigateTo.mockReset()
  })

  it('opens the customer list in selection mode', async () => {
    const wrapper = mount(CustomerPicker, {
      props: { modelValue: 7, customer },
      global: { stubs: { WInput: { props: ['modelValue'], template: '<input />' } } },
    })

    await wrapper.find('[data-test="customer-picker"]').trigger('click')

    expect(navigateTo).toHaveBeenCalledWith({
      url: '/features/customers/pages/list/index?mode=select',
    })
  })

  it('emits the selected customer id and full customer', async () => {
    const wrapper = mount(CustomerPicker, {
      global: { stubs: { WInput: { props: ['modelValue'], template: '<input />' } } },
    })
    await flushPromises()

    listeners.get('customer:selected')?.(customer)
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')).toEqual([[7]])
    expect(wrapper.emitted('change')).toEqual([[customer]])
  })
})
