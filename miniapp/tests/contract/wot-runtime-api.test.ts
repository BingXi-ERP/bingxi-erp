/**
 * Wot Design Uni 运行时契约（复审 finding 2 的补偿门禁）。
 *
 * tsconfig.paths 把 'wot-design-uni/components/wd-toast' 与 '.../wd-message-box' 指到本地声明文件，
 * 目的是不把第三方未收紧的实现源码纳入 vue-tsc；代价是类型检查从此不看真实模块，
 * 上游改名或改签名时 typecheck 不会红。这里补上那一刀：本文件在 vitest 里运行，
 * 而 vitest 不读 tsconfig.paths，所以这两个 import 解析到的是 node_modules 里的真实 .ts 源码，
 * 断言的是真实导出，不是我们抄的声明。
 *
 * 断言内容是 src/shared/ui/wot/WToast.vue 与 WDialog.vue 真正调用的那张方法面：
 * 少一个键或改一个名，封装件在真机点击时才报错，这里把它提前到 CI。
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { useMessage } from 'wot-design-uni/components/wd-message-box'
import { useToast } from 'wot-design-uni/components/wd-toast'

/** WToast.vue 的 defineExpose 逐项对应的上游方法名。 */
const TOAST_API = ['close', 'error', 'info', 'loading', 'show', 'success', 'warning']
/** WDialog.vue 的 defineExpose 逐项对应的上游方法名。 */
const MESSAGE_API = ['alert', 'close', 'confirm', 'prompt', 'show']

/**
 * composable 依赖组件实例上的 inject/provide，必须在 setup 里调用，否则 Vue 只返回默认值并告警。
 * 探针组件不渲染 wd-* 标签，只把返回值的方法名收集起来，避免把组件库实现拖进测试。
 */
function capturedKeys(composable: (selector?: string) => object, selector: string): string[] {
  let api: object | undefined
  const Probe = defineComponent({
    setup() {
      api = composable(selector)
      return () => h('div')
    },
  })
  mount(Probe)
  if (api === undefined) {
    throw new Error(`探针 setup 未执行，selector=${selector} 的 composable 没有被调用`)
  }
  return Object.keys(api).sort()
}

describe('wot-design-uni 真实导出', () => {
  it('useToast 与 useMessage 是函数', () => {
    expect(typeof useToast).toBe('function')
    expect(typeof useMessage).toBe('function')
  })

  it('useToast 返回 WToast.vue 调用的整套方法', () => {
    expect(capturedKeys(useToast, 'contract-toast')).toEqual(TOAST_API)
  })

  it('useMessage 返回 WDialog.vue 调用的整套方法', () => {
    expect(capturedKeys(useMessage, 'contract-message')).toEqual(MESSAGE_API)
  })
})
