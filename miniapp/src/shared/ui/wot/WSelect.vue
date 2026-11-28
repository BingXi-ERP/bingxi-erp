<template>
  <wd-picker
    v-bind="$attrs"
    v-model="value"
    :columns="options"
    :label="label"
    :placeholder="placeholder"
    :title="title"
    :disabled="disabled"
    :loading="loading"
    :clearable="clearable"
  />
</template>

<script setup lang="ts">
/**
 * 选择器的唯一入口：业务代码只 import 本组件，不直接写 wd-picker。
 *
 * options 用项目自己的 { value, label } 形状（value 落库、label 展示），
 * 与 wd-picker 的默认 valueKey / labelKey 对齐，换库时只改这一处映射。
 * 其余属性与事件（confirm / cancel / open / clear 等）通过 $attrs 透传；
 * v-model 由本组件接管，选中值的变化就是 value 的变化。
 */
import type { WSelectOption } from './types'

defineOptions({ inheritAttrs: false })

const value = defineModel<string | number>({ default: '' })

withDefaults(
  defineProps<{
    options: WSelectOption[]
    label?: string
    placeholder?: string
    title?: string
    disabled?: boolean
    loading?: boolean
    clearable?: boolean
  }>(),
  {
    label: '',
    placeholder: '',
    title: '',
    disabled: false,
    loading: false,
    clearable: false,
  },
)
</script>
