<template>
  <WSelect
    v-bind="$attrs"
    v-model="selectedUserId"
    :options="options"
    :title="title"
    :placeholder="placeholder"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { UserInfo } from '../types/user'
import { t } from '../i18n'
import WSelect from './wot/WSelect.vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    users: UserInfo[]
    modelValue?: number | ''
    title?: string
    placeholder?: string
  }>(),
  {
    modelValue: '',
    title: t('userPicker.title'),
    placeholder: t('userPicker.placeholder'),
  },
)

const emit = defineEmits<{ 'update:modelValue': [value: number | ''] }>()
const selectedUserId = computed({
  get: () => props.modelValue,
  set: (value: number | '') => emit('update:modelValue', value),
})

const options = computed(() =>
  props.users.map((user) => ({
    value: user.id,
    label: user.real_name === null ? user.username : user.real_name,
  })),
)
</script>
