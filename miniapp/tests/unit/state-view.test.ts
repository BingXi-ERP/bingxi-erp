import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import StateView from '../../src/shared/ui/StateView.vue'

describe('StateView', () => {
  it('renders empty state and calls retry only from error state', async () => {
    const wrapper = mount(StateView, { props: { status: 'empty', message: '暂无数据' } })
    expect(wrapper.text()).toContain('暂无数据')
    expect(wrapper.find('button').exists()).toBe(false)

    const retry = vi.fn()
    await wrapper.setProps({ status: 'error', message: '加载失败', retry })
    await wrapper.find('button').trigger('click')
    expect(retry).toHaveBeenCalledOnce()
  })

  it('falls back to the built-in copy when no message is given', () => {
    const empty = mount(StateView, { props: { status: 'empty' } })
    expect(empty.text()).toContain('暂无数据')

    const failed = mount(StateView, { props: { status: 'error' } })
    expect(failed.text()).toContain('加载失败')
    // 没有 retry 回调时不给出按钮，避免出现点了没反应的假重试。
    expect(failed.find('button').exists()).toBe(false)
  })

  it('renders loading text and the default slot only on success', () => {
    const loading = mount(StateView, { props: { status: 'loading' } })
    expect(loading.text()).toContain('加载中')
    expect(loading.find('[data-test="content"]').exists()).toBe(false)

    const success = mount(StateView, {
      props: { status: 'success' },
      slots: { default: '<view data-test="content">正文</view>' },
    })
    expect(success.text()).toContain('正文')
  })
})
