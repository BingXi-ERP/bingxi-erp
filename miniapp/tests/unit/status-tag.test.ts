import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import MoneyText from '../../src/shared/ui/MoneyText.vue'
import StatusTag from '../../src/shared/ui/StatusTag.vue'

const TagStub = defineComponent({
  name: 'WdTag',
  props: { type: String },
  template: '<span class="tag-stub"><slot /></span>',
})

function mountStatusTag(props: {
  domain: 'sales-order' | 'sales-return' | 'payment' | 'customer' | 'product' | 'color-card'
  value: string
}) {
  return mount(StatusTag, {
    props,
    global: { stubs: { 'wd-tag': TagStub } },
  })
}

describe('StatusTag', () => {
  it.each([
    ['draft', '草稿', 'default'],
    ['pending', '待审核', 'warning'],
    ['approved', '已审核', 'primary'],
    ['partial_shipped', '部分发货', 'primary'],
    ['shipped', '已发货', 'primary'],
    ['completed', '已完成', 'success'],
    ['cancelled', '已取消', 'default'],
    ['rejected', '已拒绝', 'danger'],
  ] as const)('renders sales order status %s', (value, label, type) => {
    const wrapper = mountStatusTag({ domain: 'sales-order', value })
    expect(wrapper.text()).toBe(label)
    expect(wrapper.findComponent(TagStub).props('type')).toBe(type)
  })

  it.each([
    ['DRAFT', '草稿', 'default'],
    ['SUBMITTED', '已提交', 'warning'],
    ['APPROVED', '已审核', 'primary'],
    ['REJECTED', '已拒绝', 'danger'],
    ['COMPLETED', '已完成', 'success'],
  ] as const)('renders sales return status %s', (value, label, type) => {
    const wrapper = mountStatusTag({ domain: 'sales-return', value })
    expect(wrapper.text()).toBe(label)
    expect(wrapper.findComponent(TagStub).props('type')).toBe(type)
  })

  it('rejects unknown sales order tokens instead of displaying a fallback', () => {
    expect(() => mountStatusTag({ domain: 'sales-order', value: 'PARTIAL_SHIPPED' })).toThrow(
      'Unknown sales order status',
    )
  })

  it('rejects unknown sales return tokens instead of displaying a fallback', () => {
    expect(() => mountStatusTag({ domain: 'sales-return', value: 'submitted' })).toThrow(
      'Unknown sales return status',
    )
  })

  it.each(['payment', 'customer', 'product', 'color-card'] as const)(
    'fails explicitly for unsupported domain %s',
    (domain) => {
      expect(() => mountStatusTag({ domain, value: 'approved' })).toThrow(
        'Unsupported status domain',
      )
    },
  )

  it('recomputes the label and tone when props change', async () => {
    const wrapper = mountStatusTag({ domain: 'sales-order', value: 'draft' })
    await wrapper.setProps({ value: 'completed' })
    expect(wrapper.text()).toBe('已完成')
    expect(wrapper.findComponent(TagStub).props('type')).toBe('success')
  })
})

describe('MoneyText', () => {
  it.each([
    ['1250.00', '1250'],
    ['00012.3400', '12.34'],
    [' 12.30 ', '12.3'],
    ['-0.00', '0'],
    ['9007199254740993.01', '9007199254740993.01'],
    ['0.00000000000000000001', '0.00000000000000000001'],
  ])('formats Decimal string %s without floating-point conversion', (value, expected) => {
    const wrapper = mount(MoneyText, { props: { value } })
    expect(wrapper.text()).toBe(expected)
  })

  it('shows the localized currency prefix only when requested', async () => {
    const wrapper = mount(MoneyText, { props: { value: '1250.00' } })
    expect(wrapper.text()).toBe('1250')
    await wrapper.setProps({ currency: true })
    expect(wrapper.text()).toBe('¥1250')
    await wrapper.setProps({ currency: false })
    expect(wrapper.text()).toBe('1250')
  })

  it.each(['', 'abc', '1e3', 'NaN', 'Infinity', '1,000', '.5', '1.', '--1'])(
    'rejects invalid Decimal string %j',
    (value) => {
      expect(() => mount(MoneyText, { props: { value } })).toThrow('Invalid decimal')
    },
  )
})
