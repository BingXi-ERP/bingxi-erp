<template>{{ formattedValue }}</template>

<script setup lang="ts">
import { computed } from 'vue'
import { t } from '../i18n'
import { normalizeDecimals } from '../trade'

const props = withDefaults(
  defineProps<{
    value: string
    currency?: boolean
  }>(),
  {
    currency: false,
  },
)

const formattedValue = computed(() => {
  const amount = normalizeDecimals([props.value]).join('')
  return props.currency ? `${t('money.currency')}${amount}` : amount
})
</script>
