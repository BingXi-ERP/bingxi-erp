<!--
  InventoryTransactionTab.vue - 库存交易流水
  全量出入库流水查询（getTransactionList）
-->
<template>
  <div class="transaction-tab">
    <div class="tab-toolbar">
      <el-button :loading="loading" @click="fetchTransactions">
        {{ t('common.refresh') }}
      </el-button>
    </div>

    <section v-if="isPhone" v-loading="loading" class="transaction-mobile">
      <ul class="card-list">
        <li
          v-for="(row, index) in transactions"
          :key="(row.id as number) ?? index"
          class="card-item"
        >
          <dl class="card-fields">
            <div class="field field-emphasis">
              <dt>{{ t('inventory.transaction.colNo') }}</dt>
              <dd>{{ row.transaction_no }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('inventory.transaction.colType') }}</dt>
              <dd>
                <el-tag size="small" :type="row.transaction_type === 'in' ? 'success' : 'warning'">
                  {{ row.transaction_type }}
                </el-tag>
              </dd>
            </div>
            <div class="field">
              <dt>{{ t('inventory.stockTab.colProductName') }}</dt>
              <dd>{{ row.product_name }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('inventory.stockTab.colBatchNo') }}</dt>
              <dd>{{ row.batch_no }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('inventory.stockTab.colQuantity') }}</dt>
              <dd>{{ Number(row.quantity ?? 0).toLocaleString() }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('inventory.stockTab.colWarehouse') }}</dt>
              <dd>{{ row.warehouse_name }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('common.createTime') }}</dt>
              <dd>{{ row.created_at }}</dd>
            </div>
          </dl>
        </li>
      </ul>
    </section>

    <el-table
      v-if="!isPhone"
      v-loading="loading"
      :data="transactions"
      border
      stripe
      max-height="520"
    >
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column
        prop="transaction_no"
        :label="t('inventory.transaction.colNo')"
        min-width="160"
      />
      <el-table-column
        prop="transaction_type"
        :label="t('inventory.transaction.colType')"
        width="110"
      >
        <template #default="{ row }">
          <el-tag size="small" :type="row.transaction_type === 'in' ? 'success' : 'warning'">
            {{ row.transaction_type }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        prop="product_name"
        :label="t('inventory.stockTab.colProductName')"
        min-width="150"
      />
      <el-table-column prop="batch_no" :label="t('inventory.stockTab.colBatchNo')" width="130" />
      <el-table-column
        prop="quantity"
        :label="t('inventory.stockTab.colQuantity')"
        width="110"
        align="right"
      >
        <template #default="{ row }">{{ Number(row.quantity ?? 0).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column
        prop="warehouse_name"
        :label="t('inventory.stockTab.colWarehouse')"
        width="120"
      />
      <el-table-column prop="created_at" :label="t('common.createTime')" width="170" />
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { getTransactionList, type TransactionQueryParams } from '@/api/inventory';
import { useBreakpoint } from '@/composables/useBreakpoint';

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

const transactions = ref<Record<string, unknown>[]>([]);
const loading = ref(false);

const fetchTransactions = async () => {
  loading.value = true;
  try {
    const res = await getTransactionList({ page: 1, page_size: 100 } as TransactionQueryParams);
    const d = res.data as unknown as
      { items?: Record<string, unknown>[] } | Record<string, unknown>[] | undefined;
    transactions.value =
      (d && typeof d === 'object' && !Array.isArray(d)
        ? d.items
        : (d as Record<string, unknown>[])) || [];
  } catch (e) {
    const err = e as { message?: string };
    ElMessage.error(err.message || t('common.failed'));
  } finally {
    loading.value = false;
  }
};

defineExpose({ refresh: fetchTransactions });

onMounted(() => {
  fetchTransactions();
});
</script>

<style scoped>
.tab-toolbar {
  margin-bottom: 12px;
  display: flex;
  gap: 8px;
}

.transaction-mobile .card-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.transaction-mobile .card-item {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 12px;
}

.transaction-mobile .card-fields > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
}

.transaction-mobile .card-fields dt {
  color: #909399;
  flex-shrink: 0;
}

.transaction-mobile .card-fields dd {
  margin: 0;
  text-align: right;
  word-break: break-all;
}

.transaction-mobile .field-emphasis dd {
  font-weight: 500;
}
</style>
