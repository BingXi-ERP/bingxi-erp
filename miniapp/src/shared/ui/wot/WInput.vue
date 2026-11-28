<template>
  <wd-input
    v-bind="$attrs"
    v-model="value"
    :type="type"
    :disabled="disabled"
    :readonly="readonly"
    :clearable="clearable"
    :show-password="showPassword"
    :placeholder="placeholder"
    :label="label"
  />
</template>

<script setup lang="ts">
/**
 * 输入框的唯一入口：业务代码只 import 本组件，不直接写 wd-input。
 * v-model 由本组件接管，其余属性与事件（focus / blur / confirm / clear 等）通过 $attrs 透传。
 */
defineOptions({ inheritAttrs: false })

const value = defineModel<string | number>({ default: '' })

withDefaults(
  defineProps<{
    label?: string
    placeholder?: string
    type?: 'text' | 'number' | 'digit' | 'idcard' | 'tel' | 'safe-password' | 'nickname'
    disabled?: boolean
    readonly?: boolean
    clearable?: boolean
    showPassword?: boolean
  }>(),
  {
    label: '',
    placeholder: '',
    type: 'text',
    disabled: false,
    readonly: false,
    clearable: false,
    showPassword: false,
  },
)
</script>
