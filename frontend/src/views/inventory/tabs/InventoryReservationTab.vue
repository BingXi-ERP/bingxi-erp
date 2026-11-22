<!--
  InventoryReservationTab.vue - 库存预留管理
  预留列表 + 锁定/释放/取消（只读与维护操作）
  新建预留入口已移除：预留 order_id 有 FK→销售订单且后端预检存在性，必须从销售订单列表
  「预留库存」操作发起（order_id 由上下文带入）；本页不再提供无订单上下文的创建路径。
  数据源：/inventory/reservations（api/inventory.ts 封装）
-->
<template>
  <div class="reservation-tab">
    <div class="tab-toolbar">
      <el-alert :title="t('inventory.reservation.createHint')" type="info" :closable="false" />
      <el-button :loading="loading" @click="fetchReservations">
        {{ t('common.refresh') }}
      </el-button>
    </div>

    <section v-if="isPhone" v-loading="loading" class="reservation-mobile">
      <ul class="card-list">
        <li v-for="(row, index) in reservations" :key="row.id ?? index" class="card-item">
          <dl class="card-fields">
            <div class="field">
              <dt>ID</dt>
              <dd>{{ row.id }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('inventory.reservation.product') }}</dt>
              <dd>{{ row.product_id }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('inventory.stockTab.colWarehouse') }}</dt>
              <dd>{{ row.warehouse_id }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('inventory.stockTab.colQuantity') }}</dt>
              <dd>{{ row.quantity }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('common.status') }}</dt>
              <dd>
                <el-tag size="small" :type="statusType(row.status)">{{ row.status }}</el-tag>
              </dd>
            </div>
            <div class="field">
              <dt>{{ t('inventory.reservation.remark') }}</dt>
              <dd>{{ row.notes }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('common.createTime') }}</dt>
              <dd>{{ row.created_at }}</dd>
            </div>
          </dl>
          <div class="card-actions">
            <el-button
              v-if="row.status === 'pending'"
              type="warning"
              @click="lockReservationRow(row)"
            >
              {{ t('inventory.reservation.lock') }}
            </el-button>
            <el-button
              v-if="row.status === 'locked'"
              type="success"
              @click="releaseReservationRow(row)"
            >
              {{ t('inventory.reservation.release') }}
            </el-button>
            <el-button
              v-if="row.status === 'pending' || row.status === 'locked'"
              type="danger"
              @click="cancelReservationRow(row)"
            >
              {{ t('common.cancel') }}
            </el-button>
          </div>
        </li>
      </ul>
    </section>

    <el-table v-if="!isPhone" v-loading="loading" :data="reservations" border stripe>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="product_id" :label="t('inventory.reservation.product')" width="100" />
      <el-table-column
        prop="warehouse_id"
        :label="t('inventory.stockTab.colWarehouse')"
        width="100"
      />
      <el-table-column
        prop="quantity"
        :label="t('inventory.stockTab.colQuantity')"
        width="110"
        align="right"
      >
        <template #default="{ row }">{{ Number(row.quantity ?? 0).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column prop="status" :label="t('common.status')" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="statusType(row.status)">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="notes" :label="t('inventory.reservation.remark')" min-width="150" />
      <el-table-column prop="created_at" :label="t('common.createTime')" width="170" />
      <el-table-column :label="t('common.action')" width="220" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="row.status === 'pending'"
            size="small"
            type="warning"
            link
            @click="lockReservationRow(row)"
          >
            {{ t('inventory.reservation.lock') }}
          </el-button>
          <el-button
            v-if="row.status === 'locked'"
            size="small"
            type="success"
            link
            @click="releaseReservationRow(row)"
          >
            {{ t('inventory.reservation.release') }}
          </el-button>
          <el-button
            v-if="row.status === 'pending' || row.status === 'locked'"
            size="small"
            type="danger"
            link
            @click="cancelReservationRow(row)"
          >
            {{ t('common.cancel') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { isDialogDismissal, rethrowNonDismissal } from '@/utils/monitor';
import {
  getReservationList,
  cancelReservation,
  lockReservation,
  releaseReservation,
  type InventoryReservation,
} from '@/api/inventory';
import { useBreakpoint } from '@/composables/useBreakpoint';

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

const reservations = ref<InventoryReservation[]>([]);
const loading = ref(false);

const statusType = (status: string) => {
  const map: Record<string, string> = {
    pending: 'warning',
    locked: 'info',
    released: 'success',
    cancelled: 'info',
    completed: 'success',
  };
  return map[status] || 'info';
};

const fetchReservations = async () => {
  loading.value = true;
  try {
    const res = await getReservationList({ page: 1, page_size: 100 });
    reservations.value = res.data.list;
  } catch (e) {
    const err = e as { message?: string };
    ElMessage.error(err.message || t('common.failed'));
  } finally {
    loading.value = false;
  }
};

const runAction = async (action: () => Promise<unknown>, msg: string) => {
  try {
    await action();
    ElMessage.success(msg);
    fetchReservations();
  } catch (e) {
    const err = e as { message?: string };
    ElMessage.error(err.message || t('common.failed'));
  }
};

const lockReservationRow = (row: Record<string, unknown>) =>
  runAction(() => lockReservation(Number(row.id)), t('inventory.reservation.lockSuccess'));

const releaseReservationRow = (row: Record<string, unknown>) =>
  runAction(() => releaseReservation(Number(row.id)), t('inventory.reservation.releaseSuccess'));

const cancelReservationRow = async (row: Record<string, unknown>) => {
  try {
    await ElMessageBox.confirm(t('inventory.reservation.cancelConfirm'), t('common.cancel'), {
      type: 'warning',
    });
  } catch (error: unknown) {
    if (isDialogDismissal(error)) return;
    rethrowNonDismissal('inventory.cancelReservationRow', error);
  }
  await runAction(
    () => cancelReservation(Number(row.id)),
    t('inventory.reservation.cancelSuccess')
  );
};

defineExpose({ refresh: fetchReservations });

onMounted(() => {
  fetchReservations();
});
</script>

<style scoped>
.tab-toolbar {
  margin-bottom: 12px;
  display: flex;
  gap: 8px;
}

.reservation-mobile .card-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.reservation-mobile .card-item {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 12px;
}

.reservation-mobile .card-fields > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
}

.reservation-mobile .card-fields dt {
  color: #909399;
  flex-shrink: 0;
}

.reservation-mobile .card-fields dd {
  margin: 0;
  text-align: right;
  word-break: break-all;
}

.reservation-mobile .card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #ebeef5;
}

.reservation-mobile .card-actions .el-button {
  margin: 0;
}
</style>
