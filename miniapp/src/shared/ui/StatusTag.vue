<template>
  <wd-tag :type="presentation.type">{{ t(presentation.labelKey) }}</wd-tag>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TagType } from 'wot-design-uni/components/wd-tag/types'
import { t, type MessageKey } from '../i18n'
import {
  normalizeColorCardStatus,
  normalizeCustomerStatus,
  normalizePaymentStatus,
  normalizeProductStatus,
  normalizeSalesOrderStatus,
  normalizeSalesReturnStatus,
  type ColorCardStatus,
  type CustomerStatus,
  type PaymentStatus,
  type ProductStatus,
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

const paymentPresentations: Record<PaymentStatus, StatusPresentation> = {
  pending: { labelKey: 'statusTag.paymentPending', type: 'warning' },
  confirmed: { labelKey: 'statusTag.paymentConfirmed', type: 'success' },
  cancelled: { labelKey: 'statusTag.paymentCancelled', type: 'default' },
}

const customerPresentations: Record<CustomerStatus, StatusPresentation> = {
  active: { labelKey: 'statusTag.customerActive', type: 'success' },
  inactive: { labelKey: 'statusTag.customerInactive', type: 'default' },
  merged: { labelKey: 'statusTag.customerMerged', type: 'primary' },
  blacklist: { labelKey: 'statusTag.customerBlacklist', type: 'danger' },
}

const productPresentations: Record<ProductStatus, StatusPresentation> = {
  active: { labelKey: 'statusTag.productActive', type: 'success' },
  inactive: { labelKey: 'statusTag.productInactive', type: 'default' },
}

const colorCardPresentations: Record<ColorCardStatus, StatusPresentation> = {
  draft: { labelKey: 'statusTag.colorCardDraft', type: 'default' },
  issued: { labelKey: 'statusTag.colorCardIssued', type: 'primary' },
  received: { labelKey: 'statusTag.colorCardReceived', type: 'primary' },
  used: { labelKey: 'statusTag.colorCardUsed', type: 'success' },
  expired: { labelKey: 'statusTag.colorCardExpired', type: 'warning' },
  archived: { labelKey: 'statusTag.colorCardArchived', type: 'default' },
  lost: { labelKey: 'statusTag.colorCardLost', type: 'danger' },
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
  if (props.domain === 'payment') {
    return paymentPresentations[normalizePaymentStatus(props.value)]
  }
  if (props.domain === 'customer') {
    return customerPresentations[normalizeCustomerStatus(props.value)]
  }
  if (props.domain === 'product') {
    return productPresentations[normalizeProductStatus(props.value)]
  }
  return colorCardPresentations[normalizeColorCardStatus(props.value)]
})
</script>
