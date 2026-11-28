<template>
  <WButton v-if="allowed" v-bind="$attrs" @click="onClick"><slot /></WButton>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import WButton from './wot/WButton.vue'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  permission: string | string[]
  can: (permission: string | string[]) => boolean
}>()
const emit = defineEmits<{ click: [event: MouseEvent] }>()

const allowed = computed(() => props.can(props.permission))

function onClick(event: MouseEvent) {
  emit('click', event)
}
</script>
