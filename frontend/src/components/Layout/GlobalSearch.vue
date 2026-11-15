<template>
  <div class="global-search">
    <div v-if="error" class="search-error" role="alert">
      {{ t(error === 'partialFailure' ? 'layout.search.partialFailure' : 'layout.search.failed') }}
    </div>
    <el-select
      v-model="selected"
      class="global-search-select"
      filterable
      remote
      clearable
      :remote-method="doSearch"
      :loading="loading"
      :placeholder="t('layout.search.placeholder')"
      size="default"
      @change="onPick"
    >
      <el-option-group v-if="orders.length" :label="t('layout.search.salesOrders')">
        <el-option
          v-for="o in orders"
          :key="`so-${o.order_no}`"
          :value="`sales-order:${o.order_no}`"
          :label="o.order_no"
        >
          <span class="opt-main">{{ o.order_no }}</span>
          <span class="opt-sub">{{ o.customer_name }} · ¥{{ o.total_amount }}</span>
        </el-option>
      </el-option-group>
      <el-option-group v-if="customers.length" :label="t('layout.search.customers')">
        <el-option
          v-for="c in customers"
          :key="`cu-${c.id}`"
          :value="`customer:${c.id}`"
          :label="c.name"
        >
          <span class="opt-main">{{ c.name }}</span>
          <span class="opt-sub">{{ c.code }} · {{ c.contact_person ?? '' }}</span>
        </el-option>
      </el-option-group>
      <el-option-group v-if="products.length" :label="t('layout.search.products')">
        <el-option
          v-for="p in products"
          :key="`pr-${p.id}`"
          :value="`product:${p.id}`"
          :label="p.name"
        >
          <span class="opt-main">{{ p.name }}</span>
          <span class="opt-sub">{{ p.code }}</span>
        </el-option>
      </el-option-group>
      <template #empty>
        <el-empty v-if="searched" :description="t('layout.search.noResult')" :image-size="48" />
        <div v-else class="search-hint">{{ t('layout.search.hint') }}</div>
      </template>
    </el-select>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { logger } from '@/utils/logger';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  searchCustomers,
  searchProducts,
  searchSalesOrders,
  type CustomerHit,
  type ProductHit,
  type SalesOrderHit,
} from '@/api/search';

const { t } = useI18n({ useScope: 'global' });
const router = useRouter();
const emit = defineEmits<{ select: [] }>();

const selected = ref('');
const loading = ref(false);
const searched = ref(false);
const error = ref<'partialFailure' | 'failed' | null>(null);
let requestSequence = 0;
const orders = ref<SalesOrderHit[]>([]);
const customers = ref<CustomerHit[]>([]);
const products = ref<ProductHit[]>([]);

async function doSearch(q: string) {
  const sequence = ++requestSequence;
  orders.value = [];
  customers.value = [];
  products.value = [];
  error.value = null;
  if (!q || q.trim().length < 2) {
    searched.value = false;
    loading.value = false;
    return;
  }
  loading.value = true;
  searched.value = false;
  const keyword = q.trim();
  const results = await Promise.allSettled([
    searchSalesOrders(keyword, { size: 5 }),
    searchCustomers(keyword, { size: 5 }),
    searchProducts(keyword, { size: 5 }),
  ]);
  if (sequence !== requestSequence) return;

  const [so, cu, pr] = results;
  if (so.status === 'fulfilled') orders.value = so.value.hits;
  else logger.error('Global search failed for sales orders');
  if (cu.status === 'fulfilled') customers.value = cu.value.hits;
  else logger.error('Global search failed for customers');
  if (pr.status === 'fulfilled') products.value = pr.value.hits;
  else logger.error('Global search failed for products');

  const rejectedCount = results.filter(result => result.status === 'rejected').length;
  error.value =
    rejectedCount === 0 ? null : rejectedCount === results.length ? 'failed' : 'partialFailure';
  searched.value = error.value === null;
  loading.value = false;
}

function onPick(value: string) {
  const [type, id] = value.split(':');
  // 跳转目标对齐 router 现有路由：/sales、/customer、/product
  if (type === 'sales-order') {
    router.push({ path: '/sales', query: { order_no: id } });
  } else if (type === 'customer') {
    router.push({ path: '/customer', query: { id } });
  } else if (type === 'product') {
    router.push({ path: '/product', query: { id } });
  }
  selected.value = '';
  if (type === 'sales-order' || type === 'customer' || type === 'product') {
    emit('select');
  }
}
</script>

<style scoped>
.global-search {
  width: 100%;
  max-width: 260px;
  min-width: 0;
}
.global-search-select {
  width: 100%;
}
.opt-main {
  float: left;
}
.opt-sub {
  float: right;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-left: 12px;
}
.search-error {
  padding: 8px 12px;
  color: var(--el-color-danger);
  font-size: 12px;
}
.search-hint {
  padding: 16px;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
