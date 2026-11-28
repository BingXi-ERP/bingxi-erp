<template>
  <wd-message-box :selector="selector" :root-portal="rootPortal" />
</template>

<script setup lang="ts">
/**
 * 对话框的唯一入口：页面放一个 <WDialog ref="dialog" />，通过 ref 调 alert / confirm / prompt。
 *
 * 用法约束（组件库语义，调用方必须处理取消分支，不要吞掉）：
 * confirm / prompt 在用户点取消或点蒙层时是 reject，resolve 只代表点了确定；
 * 返回值里的 action 区分 'confirm' | 'cancel' | 'modal'，prompt 还带回输入的 value。
 */
import { useMessage } from 'wot-design-uni/components/wd-message-box'
import type { MessageOptions } from 'wot-design-uni/components/wd-message-box/types'

const props = withDefaults(
  defineProps<{
    selector?: string
    rootPortal?: boolean
  }>(),
  {
    selector: '',
    rootPortal: true,
  },
)

const message = useMessage(props.selector)

defineExpose({
  show: (options: MessageOptions | string) => message.show(options),
  alert: (options: MessageOptions | string) => message.alert(options),
  confirm: (options: MessageOptions | string) => message.confirm(options),
  prompt: (options: MessageOptions | string) => message.prompt(options),
  close: () => message.close(),
})
</script>
