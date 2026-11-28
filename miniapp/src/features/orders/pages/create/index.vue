<template>
  <FormPageTemplate>
    <view class="orders__form">
      <CustomerPicker
        v-model="draft.customerId.value"
        :customer="selectedCustomer ?? undefined"
        :label="t('orders.customer')"
        @change="selectCustomer"
      />
      <WInput v-model="draft.contactPerson.value" :label="t('orders.contact')" />
      <WInput v-model="draft.contactPhone.value" :label="t('orders.phone')" type="tel" />
      <WInput v-model="draft.shippingAddress.value" :label="t('orders.address')" />
      <WInput v-model="draft.notes.value" :label="t('orders.notes')" />

      <view class="orders__goods-title">
        <text>{{ t('orders.goods') }}</text>
        <ProductPicker :label="t('orders.product')" @change="selectProduct" />
      </view>
      <view v-for="(item, index) in draft.items.value" :key="index" class="orders__goods-row">
        <view class="orders__goods-name">{{ productNames[item.product_id] }}</view>
        <WInput v-model="item.quantity" :label="t('orders.quantity')" type="digit" />
        <WInput v-model="item.unit_price" :label="t('orders.unitPrice')" type="digit" />
        <WInput v-model="item.color_no" :label="t('orders.colorNo')" />
        <WButton size="small" @click="draft.removeItem(index)">{{ t('orders.remove') }}</WButton>
      </view>
      <view v-if="draft.subtotal.value" class="orders__subtotal">
        <text>{{ t('orders.subtotal') }}</text>
        <MoneyText :value="draft.subtotal.value" currency />
      </view>
      <view v-if="productError" class="orders__error">{{ productError }}</view>
      <view v-if="draft.submitError.value" class="orders__error">{{
        draft.submitError.value
      }}</view>
    </view>

    <template #footer>
      <WButton
        block
        :loading="draft.submitting.value"
        :disabled="!draft.canSubmit.value"
        @click="submit"
      >
        {{ t('orders.submit') }}
      </WButton>
    </template>
  </FormPageTemplate>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { CustomerPicker, type Customer } from '../../../customers'
import { ProductPicker, type Product } from '../../../catalog'
import { t } from '../../../../shared/i18n'
import MoneyText from '../../../../shared/ui/MoneyText.vue'
import FormPageTemplate from '../../../../shared/ui/templates/FormPageTemplate.vue'
import WButton from '../../../../shared/ui/wot/WButton.vue'
import WInput from '../../../../shared/ui/wot/WInput.vue'
import { useOrderDraft } from '../../composables/useOrderDraft'

const draft = useOrderDraft()
const selectedCustomer = ref<Customer | null>(null)
const productNames = ref<Record<number, string>>({})
const productError = ref('')

function selectCustomer(customer: Customer) {
  selectedCustomer.value = customer
  draft.setCustomer(customer.id, {
    contact_person: customer.contact_person ?? undefined,
    contact_phone: customer.contact_phone ?? undefined,
    address: customer.address ?? undefined,
  })
}

function selectProduct({ product }: { product: Product }) {
  productError.value = ''
  if (!product.standard_price) {
    productError.value = t('orders.productPriceRequired')
    return
  }
  productNames.value[product.id] = product.name
  draft.addItem({
    product_id: product.id,
    quantity: '1',
    unit_price: product.standard_price,
  })
}

async function submit() {
  const order = await draft.submit()
  if (order) {
    uni.redirectTo({ url: `/features/orders/pages/detail/index?id=${order.id}` })
  }
}
</script>

<style scoped>
.orders__form {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--space-3);
}

.orders__goods-title,
.orders__goods-row,
.orders__subtotal {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.orders__goods-title {
  border-top: var(--hairline) solid var(--color-border);
  margin-top: var(--space-3);
  padding-top: var(--space-3);
}

.orders__goods-row {
  border-top: var(--hairline) solid var(--color-border);
  padding: var(--space-3) 0;
}

.orders__goods-name,
.orders__subtotal {
  color: var(--color-text);
  font-weight: 600;
}

.orders__subtotal {
  align-items: flex-end;
}

.orders__error {
  color: var(--color-danger);
  margin-top: var(--space-3);
}
</style>
