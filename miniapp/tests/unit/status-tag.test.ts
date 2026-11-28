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

  it.each([
    ['pending', '待确认', 'warning'],
    ['confirmed', '已确认', 'success'],
    ['cancelled', '已取消', 'default'],
  ] as const)('renders payment status %s', (value, label, type) => {
    const wrapper = mountStatusTag({ domain: 'payment', value })
    expect(wrapper.text()).toBe(label)
    expect(wrapper.findComponent(TagStub).props('type')).toBe(type)
  })

  it.each([
    ['active', '活跃', 'success'],
    ['inactive', '停用', 'default'],
    ['merged', '已合并', 'primary'],
    ['blacklist', '黑名单', 'danger'],
  ] as const)('renders customer status %s', (value, label, type) => {
    const wrapper = mountStatusTag({ domain: 'customer', value })
    expect(wrapper.text()).toBe(label)
    expect(wrapper.findComponent(TagStub).props('type')).toBe(type)
  })

  it.each([
    ['active', '启用', 'success'],
    ['inactive', '停用', 'default'],
  ] as const)('renders product status %s', (value, label, type) => {
    const wrapper = mountStatusTag({ domain: 'product', value })
    expect(wrapper.text()).toBe(label)
    expect(wrapper.findComponent(TagStub).props('type')).toBe(type)
  })

  it.each([
    ['draft', '草稿', 'default'],
    ['issued', '已发放', 'primary'],
    ['received', '已收回', 'primary'],
    ['used', '已使用', 'success'],
    ['expired', '已过期', 'warning'],
    ['archived', '已归档', 'default'],
    ['lost', '已丢失', 'danger'],
  ] as const)('renders color card status %s', (value, label, type) => {
    const wrapper = mountStatusTag({ domain: 'color-card', value })
    expect(wrapper.text()).toBe(label)
    expect(wrapper.findComponent(TagStub).props('type')).toBe(type)
  })

  it.each([
    ['payment', 'PENDING', 'Unknown payment status'],
    ['customer', 'ACTIVE', 'Unknown customer status'],
    ['product', 'INACTIVE', 'Unknown product status'],
    ['color-card', 'DRAFT', 'Unknown color card status'],
  ] as const)('rejects wrong-case %s status tokens', (domain, value, message) => {
    expect(() => mountStatusTag({ domain, value })).toThrow(message)
  })

  it.each([
    ['payment', 'Unknown payment status'],
    ['customer', 'Unknown customer status'],
    ['product', 'Unknown product status'],
    ['color-card', 'Unknown color card status'],
  ] as const)('rejects unknown %s status tokens', (domain, message) => {
    expect(() => mountStatusTag({ domain, value: 'unknown' })).toThrow(message)
  })

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

  it('formats ordinary negative Decimal strings', () => {
    const wrapper = mount(MoneyText, { props: { value: '-12.50' } })
    expect(wrapper.text()).toBe('-12.5')
  })

  it('recomputes the formatted value when props change', async () => {
    const wrapper = mount(MoneyText, { props: { value: '10.00' } })
    await wrapper.setProps({ value: '20.50' })
    expect(wrapper.text()).toBe('20.5')
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
