<template>
  <wd-toast :selector="selector" />
</template>

<script setup lang="ts">
/**
 * Toast 的唯一入口：页面放一个 <WToast ref="toast" />，通过 ref 调方法，不直接写 wd-toast。
 *
 * 用法约束（与组件库一致，别在调用处再包一层 try/catch 吞掉它）：
 * loading() 不会自动消失，必须显式 close()；同一时刻后一次调用会覆盖前一次的内容。
 */
import { useToast } from 'wot-design-uni/components/wd-toast'
import type { ToastOptions } from 'wot-design-uni/components/wd-toast/types'

const props = withDefaults(defineProps<{ selector?: string }>(), {
  selector: '',
})

const toast = useToast(props.selector)

defineExpose({
  show: (options: ToastOptions | string) => toast.show(options),
  success: (options: ToastOptions | string) => toast.success(options),
  error: (options: ToastOptions | string) => toast.error(options),
  warning: (options: ToastOptions | string) => toast.warning(options),
  info: (options: ToastOptions | string) => toast.info(options),
  loading: (options: ToastOptions | string) => toast.loading(options),
  close: () => toast.close(),
})
</script>
