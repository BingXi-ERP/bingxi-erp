<template>
  <wd-tag :type="presentation.type">{{ t(presentation.labelKey) }}</wd-tag>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TagType } from 'wot-design-uni/components/wd-tag/types'
import { t, type MessageKey } from '../i18n'
import {
  normalizeSalesOrderStatus,
  normalizeSalesReturnStatus,
  type SalesOrderStatus,
  type SalesReturnStatus,
} from '../trade'

type StatusDomain =
  'sales-order' | 'sales-return' | 'payment' | 'customer' | 'product' | 'color-card'

interface StatusPresentation {
  labelKey: MessageKey
  type: TagType
}

const salesOrderPresentations: Record<SalesOrderStatus, StatusPresentation> = {
  draft: { labelKey: 'statusTag.salesOrderDraft', type: 'default' },
  pending: { labelKey: 'statusTag.salesOrderPending', type: 'warning' },
  approved: { labelKey: 'statusTag.salesOrderApproved', type: 'primary' },
  partial_shipped: { labelKey: 'statusTag.salesOrderPartialShipped', type: 'primary' },
  shipped: { labelKey: 'statusTag.salesOrderShipped', type: 'primary' },
  completed: { labelKey: 'statusTag.salesOrderCompleted', type: 'success' },
  cancelled: { labelKey: 'statusTag.salesOrderCancelled', type: 'default' },
  rejected: { labelKey: 'statusTag.salesOrderRejected', type: 'danger' },
}

const salesReturnPresentations: Record<SalesReturnStatus, StatusPresentation> = {
  DRAFT: { labelKey: 'statusTag.salesReturnDraft', type: 'default' },
  SUBMITTED: { labelKey: 'statusTag.salesReturnSubmitted', type: 'warning' },
  APPROVED: { labelKey: 'statusTag.salesReturnApproved', type: 'primary' },
  REJECTED: { labelKey: 'statusTag.salesReturnRejected', type: 'danger' },
  COMPLETED: { labelKey: 'statusTag.salesReturnCompleted', type: 'success' },
}

const props = defineProps<{
  domain: StatusDomain
  value: string
}>()

const presentation = computed<StatusPresentation>(() => {
  if (props.domain === 'sales-order') {
    return salesOrderPresentations[normalizeSalesOrderStatus(props.value)]
  }
  if (props.domain === 'sales-return') {
    return salesReturnPresentations[normalizeSalesReturnStatus(props.value)]
  }
  throw new Error(`Unsupported status domain: ${props.domain}`)
})
</script>
