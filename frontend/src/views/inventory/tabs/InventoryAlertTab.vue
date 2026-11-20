<!--
  InventoryAlertTab.vue - 库存预警 Tab
  来源：原 inventory/index.vue 中 alert tab 区
  拆分日期：2026-06-17 P1-3-Batch-3
-->
<template>
  <el-card shadow="hover">
    <section v-if="isPhone" class="alert-mobile">
      <ul class="card-list" :aria-label="t('inventory.alertTab.listAria')">
        <li v-for="(row, index) in alerts" :key="row.id ?? index" class="card-item">
          <dl class="card-fields">
            <div class="field">
              <dt>{{ t('inventory.alertTab.colProductCode') }}</dt>
              <dd>{{ row.product_code }}</dd>
            </div>
            <div class="field field-emphasis">
              <dt>{{ t('inventory.alertTab.colProductName') }}</dt>
              <dd>{{ row.product_name }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('inventory.alertTab.colWarehouse') }}</dt>
              <dd>{{ row.warehouse_name }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('inventory.alertTab.colCurrentQty') }}</dt>
              <dd>
                <span class="low-stock">{{ formatNumber(Number(row.quantity_on_hand)) }}</span>
              </dd>
            </div>
            <div class="field">
              <dt>{{ t('inventory.alertTab.colMinQty') }}</dt>
              <dd>{{ row.reorder_point }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('inventory.alertTab.colUnit') }}</dt>
              <dd>{{ row.unit }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('inventory.alertTab.colAlertLevel') }}</dt>
              <dd>
                <el-tag :type="alertTypeTagType(row.alert_type)" size="small">
                  {{ alertTypeText(row.alert_type) }}
                </el-tag>
              </dd>
            </div>
          </dl>
          <div class="card-actions">
            <el-button type="primary" plain @click="$emit('purchase', row)">
              {{ t('inventory.alertTab.purchase') }}
            </el-button>
          </div>
        </li>
      </ul>
    </section>

    <el-table v-if="!isPhone" :data="alerts" stripe :aria-label="t('inventory.alertTab.listAria')">
      <el-table-column
        prop="product_code"
        :label="t('inventory.alertTab.colProductCode')"
        width="140"
      />
      <el-table-column
        prop="product_name"
        :label="t('inventory.alertTab.colProductName')"
        min-width="180"
      />
      <el-table-column
        prop="warehouse_name"
        :label="t('inventory.alertTab.colWarehouse')"
        width="120"
      />
      <el-table-column
        prop="quantity_on_hand"
        :label="t('inventory.alertTab.colCurrentQty')"
        width="100"
        align="right"
      >
        <template #default="{ row }">
          <span class="low-stock">{{ formatNumber(Number(row.quantity_on_hand)) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        prop="reorder_point"
        :label="t('inventory.alertTab.colMinQty')"
        width="100"
        align="right"
      />
      <el-table-column prop="unit" :label="t('inventory.alertTab.colUnit')" width="60" />
      <!-- 告警类型是后端派生码（normal/low_stock/...），不再是自造的 warning|danger 两档 -->
      <el-table-column prop="alert_type" :label="t('inventory.alertTab.colAlertLevel')" width="150">
        <template #default="{ row }">
          <el-tag :type="alertTypeTagType(row.alert_type)" size="small">
            {{ alertTypeText(row.alert_type) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('inventory.alertTab.colOperation')" width="100">
        <template #default="{ row }">
          <el-button type="primary" link size="small" @click="$emit('purchase', row)">{{
            t('inventory.alertTab.purchase')
          }}</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
// v11 批次 160 P2-7 修复：导入 StockAlert 接口替代 any[]
import { computed } from 'vue';
import type { StockAlert } from '@/api/inventory';
import {
  STOCK_ALERT_TYPE_LABEL_KEY,
  STOCK_ALERT_TYPE_TAG_TYPES,
  type StockAlertTypeValue,
} from '@/constants/stock-alert-type';
import { formatNumber } from '../composables/invFmts';
import { logger } from '@/utils/logger';
import { useBreakpoint } from '@/composables/useBreakpoint';

// 接入 i18n，替换硬编码中文文案
const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

/** 告警类型 → 文案：后端派生码（AlertType）在取值域外时告警并原样显示，不猜含义 */
const alertTypeText = (alertType: string) => {
  const key = STOCK_ALERT_TYPE_LABEL_KEY[alertType as StockAlertTypeValue];
  if (!key) {
    logger.warn(`未知库存告警类型，需与后端 AlertType 取值域同步：${alertType}`);
    return alertType;
  }
  return t(key);
};

const alertTypeTagType = (alertType: string) =>
  STOCK_ALERT_TYPE_TAG_TYPES[alertType as StockAlertTypeValue] ?? 'warning';

defineProps<{
  alerts: StockAlert[];
}>();

defineEmits<{
  purchase: [row: StockAlert];
}>();
</script>

<style scoped>
.low-stock {
  color: #f56c6c;
  font-weight: 600;
}

.alert-mobile .card-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.alert-mobile .card-item {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 12px;
}

.alert-mobile .card-fields > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
}

.alert-mobile .card-fields dt {
  color: #909399;
  flex-shrink: 0;
}

.alert-mobile .card-fields dd {
  margin: 0;
  text-align: right;
  word-break: break-all;
}

.alert-mobile .field-emphasis dd {
  font-weight: 500;
}

.alert-mobile .card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #ebeef5;
}

.alert-mobile .card-actions .el-button {
  margin: 0;
}
</style>
