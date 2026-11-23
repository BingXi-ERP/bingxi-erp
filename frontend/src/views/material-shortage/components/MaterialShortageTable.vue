<!--
  MaterialShortageTable.vue - 物料缺料预警列表（含级别 / 状态筛选、状态推进）
  拆分自 material-shortage/index.vue（P14 批 2 I-3 第 5 批）
  行数据为后端 ShortageAlertView：实时缺料结果 + 未解决预警的落库状态
-->
<template>
  <el-card shadow="hover">
    <div class="filter-bar" :class="{ 'filter-bar-phone': isPhone }">
      <el-select
        :model-value="filterLevel"
        :placeholder="t('materialShortage.table.levelPlaceholder')"
        clearable
        style="width: 160px"
        @update:model-value="(v: string) => emit('update:filter-level', v)"
      >
        <el-option
          v-for="level in SHORTAGE_LEVEL_VALUES"
          :key="level"
          :label="getLevelText(level)"
          :value="level"
        />
      </el-select>
      <el-select
        :model-value="filterStatus"
        :placeholder="t('materialShortage.table.statusPlaceholder')"
        clearable
        style="width: 180px"
        @update:model-value="(v: string) => emit('update:filter-status', v)"
      >
        <el-option
          v-for="status in SHORTAGE_ALERT_STATUS_VALUES"
          :key="status"
          :label="getStatusText(status)"
          :value="status"
        />
      </el-select>
      <el-button type="primary" @click="emit('filter-change')">
        <el-icon><Search /></el-icon>
        {{ t('materialShortage.table.search') }}
      </el-button>
      <el-button type="success" :loading="checking" @click="emit('check')">
        <el-icon><Refresh /></el-icon>
        {{ t('materialShortage.table.triggerCheck') }}
      </el-button>
    </div>

    <section v-if="isPhone" v-loading="loading" class="shortage-mobile">
      <ul class="shortage-list" :aria-label="t('materialShortage.table.mobileCardAria')">
        <li v-for="row in data" :key="row.material_id" class="shortage-card">
          <dl class="shortage-fields">
            <div class="shortage-number">
              <dt>{{ t('materialShortage.table.alertNo') }}</dt>
              <dd>{{ row.alert_no || '-' }}</dd>
            </div>
            <div>
              <dt>{{ t('materialShortage.table.materialCode') }}</dt>
              <dd>{{ row.material_code }}</dd>
            </div>
            <div>
              <dt>{{ t('materialShortage.table.materialName') }}</dt>
              <dd>{{ row.material_name }}</dd>
            </div>
            <div>
              <dt>{{ t('materialShortage.table.requiredQuantity') }}</dt>
              <dd>{{ formatQuantity(row.required_quantity) }}</dd>
            </div>
            <div>
              <dt>{{ t('materialShortage.table.availableQuantity') }}</dt>
              <dd>{{ formatQuantity(row.available_quantity) }}</dd>
            </div>
            <div>
              <dt>{{ t('materialShortage.table.shortageQuantity') }}</dt>
              <dd>{{ formatQuantity(row.shortage_quantity) }}</dd>
            </div>
            <div>
              <dt>{{ t('materialShortage.table.deficitRate') }}</dt>
              <dd>{{ formatDeficitRate(row.deficit_rate) }}</dd>
            </div>
            <div>
              <dt>{{ t('materialShortage.table.level') }}</dt>
              <dd>
                <el-tag :type="getLevelTagType(row.level)">{{ getLevelText(row.level) }}</el-tag>
              </dd>
            </div>
            <div>
              <dt>{{ t('materialShortage.table.affectedOrders') }}</dt>
              <dd>{{ row.affected_orders.length }}</dd>
            </div>
            <div>
              <dt>{{ t('materialShortage.table.identifiedAt') }}</dt>
              <dd>{{ formatDateTime(row.identified_at) || '-' }}</dd>
            </div>
            <div>
              <dt>{{ t('materialShortage.table.status') }}</dt>
              <dd>
                <el-tag v-if="!row.status" type="info">
                  {{ t('materialShortage.table.statusUnsaved') }}
                </el-tag>
                <el-select
                  v-else
                  :model-value="row.status"
                  :aria-label="t('materialShortage.table.statusAriaLabel')"
                  @update:model-value="
                    (v: ShortageAlertStatusValue) => emit('status-change', row, v)
                  "
                >
                  <el-option
                    v-for="status in SHORTAGE_ALERT_STATUS_VALUES"
                    :key="status"
                    :label="getStatusText(status)"
                    :value="status"
                  />
                </el-select>
              </dd>
            </div>
          </dl>
        </li>
      </ul>
      <div class="pagination-container">
        <el-pagination
          :current-page="currentPage"
          :page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, next"
          :aria-label="t('materialShortage.table.paginationAriaLabel')"
          @update:current-page="(v: number) => emit('update:page', v)"
          @update:page-size="(v: number) => emit('update:size', v)"
        />
      </div>
    </section>
    <template v-else>
      <el-table
        v-loading="loading"
        :data="data"
        stripe
        :aria-label="t('materialShortage.table.ariaLabel')"
      >
        <el-table-column
          prop="alert_no"
          :label="t('materialShortage.table.alertNo')"
          min-width="150"
        />
        <el-table-column
          prop="material_code"
          :label="t('materialShortage.table.materialCode')"
          min-width="140"
        />
        <el-table-column
          prop="material_name"
          :label="t('materialShortage.table.materialName')"
          min-width="160"
          show-overflow-tooltip
        />
        <el-table-column
          :label="t('materialShortage.table.requiredQuantity')"
          width="110"
          align="right"
        >
          <template #default="{ row }">{{ formatQuantity(row.required_quantity) }}</template>
        </el-table-column>
        <el-table-column
          :label="t('materialShortage.table.availableQuantity')"
          width="110"
          align="right"
        >
          <template #default="{ row }">{{ formatQuantity(row.available_quantity) }}</template>
        </el-table-column>
        <el-table-column
          :label="t('materialShortage.table.shortageQuantity')"
          width="110"
          align="right"
        >
          <template #default="{ row }">{{ formatQuantity(row.shortage_quantity) }}</template>
        </el-table-column>
        <el-table-column :label="t('materialShortage.table.deficitRate')" width="100" align="right">
          <template #default="{ row }">{{ formatDeficitRate(row.deficit_rate) }}</template>
        </el-table-column>
        <el-table-column :label="t('materialShortage.table.level')" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getLevelTagType(row.level)">{{ getLevelText(row.level) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('materialShortage.table.affectedOrders')"
          width="120"
          align="center"
        >
          <template #default="{ row }">{{ row.affected_orders.length }}</template>
        </el-table-column>
        <el-table-column :label="t('materialShortage.table.identifiedAt')" min-width="180">
          <template #default="{ row }">{{ formatDateTime(row.identified_at) || '-' }}</template>
        </el-table-column>
        <el-table-column :label="t('materialShortage.table.status')" width="220" align="center">
          <template #default="{ row }">
            <el-tag v-if="!row.status" type="info">{{
              t('materialShortage.table.statusUnsaved')
            }}</el-tag>
            <el-select
              v-else
              :model-value="row.status"
              :aria-label="t('materialShortage.table.statusAriaLabel')"
              style="width: 190px"
              @update:model-value="(v: ShortageAlertStatusValue) => emit('status-change', row, v)"
            >
              <el-option
                v-for="status in SHORTAGE_ALERT_STATUS_VALUES"
                :key="status"
                :label="getStatusText(status)"
                :value="status"
              />
            </el-select>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-container">
        <el-pagination
          :current-page="currentPage"
          :page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          :aria-label="t('materialShortage.table.paginationAriaLabel')"
          @update:current-page="(v: number) => emit('update:page', v)"
          @update:page-size="(v: number) => emit('update:size', v)"
        />
      </div>
    </template>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Search, Refresh } from '@element-plus/icons-vue';
import { useBreakpoint } from '@/composables/useBreakpoint';
import {
  SHORTAGE_ALERT_STATUS_VALUES,
  SHORTAGE_LEVEL_VALUES,
  type ShortageAlertStatusValue,
} from '@/constants/shortage';
import {
  formatDateTime,
  formatDeficitRate,
  formatQuantity,
  getLevelText,
  getLevelTagType,
  getStatusText,
} from '../composables/msFmts';
import type { MaterialShortageAlert } from '@/api/material-shortage';

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

/**
 * 缺料预警列表（筛选栏 + 状态推进）
 */
defineProps<{
  // 列表数据
  data: MaterialShortageAlert[];
  // 总数
  total: number;
  // 加载状态
  loading: boolean;
  // 检查中
  checking: boolean;
  // 分页
  currentPage: number;
  pageSize: number;
  // 过滤
  filterLevel: string;
  filterStatus: string;
}>();

const emit = defineEmits<{
  // 过滤变化
  'filter-change': [];
  // 触发检查
  check: [];
  // 预警状态推进（确认弹窗与请求由 useMsProc 处理）
  'status-change': [row: MaterialShortageAlert, status: ShortageAlertStatusValue];
  // 分页
  'update:page': [v: number];
  'update:size': [v: number];
  // 过滤值变化
  'update:filter-level': [v: string];
  'update:filter-status': [v: string];
}>();
</script>

<style scoped>
.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  align-items: center;
}
.pagination-container {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.filter-bar-phone {
  flex-wrap: wrap;
}
.shortage-mobile {
  min-width: 0;
}
.shortage-list {
  display: grid;
  gap: 16px;
  padding: 0;
  margin: 0 0 16px;
  list-style: none;
}
.shortage-card {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-bg-color);
}
.shortage-fields {
  display: grid;
  gap: 12px;
  margin: 0;
}
.shortage-fields > div {
  min-width: 0;
}
.shortage-fields dt {
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 1.5;
}
.shortage-fields dd {
  margin: 4px 0 0;
  color: var(--el-text-color-primary);
  font-size: 16px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.shortage-number dd {
  font-weight: 600;
}
.shortage-mobile :deep(.el-pagination) {
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
</style>
