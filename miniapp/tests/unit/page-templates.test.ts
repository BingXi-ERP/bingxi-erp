import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DetailPageTemplate from '../../src/shared/ui/templates/DetailPageTemplate.vue'
import FormPageTemplate from '../../src/shared/ui/templates/FormPageTemplate.vue'
import ListPageTemplate from '../../src/shared/ui/templates/ListPageTemplate.vue'

describe('ListPageTemplate', () => {
  it('renders filter, content and footer slots', () => {
    const wrapper = mount(ListPageTemplate, {
      slots: {
        filter: '<view data-test="filter">筛选</view>',
        default: '<view data-test="content">列表</view>',
        footer: '<view data-test="footer">底部</view>',
      },
    })
    expect(wrapper.find('[data-test="filter"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="content"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="footer"]').exists()).toBe(true)
  })

  it('omits the filter area when the caller supplies no filter', () => {
    const wrapper = mount(ListPageTemplate, {
      slots: { default: '<view data-test="content">列表</view>' },
    })
    expect(wrapper.find('[data-test="content"]').exists()).toBe(true)
    expect(wrapper.find('.list-page__filter').exists()).toBe(false)
    expect(wrapper.find('.list-page__footer').exists()).toBe(false)
  })
})

describe('FormPageTemplate', () => {
  it('renders content and footer slots', () => {
    const wrapper = mount(FormPageTemplate, {
      slots: {
        default: '<view data-test="content">表单</view>',
        footer: '<view data-test="footer">提交</view>',
      },
    })
    expect(wrapper.find('[data-test="content"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="footer"]').exists()).toBe(true)
  })
})

describe('DetailPageTemplate', () => {
  it('renders content and footer slots', () => {
    const wrapper = mount(DetailPageTemplate, {
      slots: {
        default: '<view data-test="content">明细</view>',
        footer: '<view data-test="footer">操作</view>',
      },
    })
    expect(wrapper.find('[data-test="content"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="footer"]').exists()).toBe(true)
  })
})
