<!--
  CapacityTable.vue - 工作中心列表表格（带分页 + 负荷率/状态/瓶颈）
  拆分自 capacity/index.vue（P14 批 2 I-3 第 6 批）
  行为完全保持一致（仅结构重构）
-->
<template>
  <el-card shadow="hover">
    <template #header>
      <div class="card-header">
        <span>{{ $t('capacityModule.table.title') }}</span>
        <el-button type="primary" link @click="emit('refresh')">
          <el-icon><Refresh /></el-icon>
          {{ $t('capacityModule.table.refresh') }}
        </el-button>
      </div>
    </template>
    <section v-if="isPhone" v-loading="tableLoading" class="capacity-mobile">
      <ul class="capacity-list" :aria-label="t('capacityModule.table.mobileCardAria')">
        <li v-for="row in data" :key="row.code" class="capacity-card">
          <dl class="capacity-fields">
            <div class="capacity-number">
              <dt>{{ t('capacityModule.table.code') }}</dt>
              <dd>{{ row.code }}</dd>
            </div>
            <div>
              <dt>{{ t('capacityModule.table.name') }}</dt>
              <dd>{{ row.name }}</dd>
            </div>
            <div>
              <dt>{{ t('capacityModule.table.capacityHours') }}</dt>
              <dd>{{ row.daily_capacity }} {{ row.capacity_unit }}</dd>
            </div>
            <div>
              <dt>{{ t('capacityModule.table.usedHours') }}</dt>
              <dd>{{ row.total_demand }}</dd>
            </div>
            <div>
              <dt>{{ t('capacityModule.table.loadRate') }}</dt>
              <dd>
                <el-tag v-if="row.load_rate != null" :type="getLoadRateType(Number(row.load_rate))">
                  {{ Number(row.load_rate).toFixed(1) }}%
                </el-tag>
              </dd>
            </div>
            <div>
              <dt>{{ t('capacityModule.table.status') }}</dt>
              <dd>
                <el-tag v-if="row.load_status != null" :type="getStatusType(row.load_status)">
                  {{ getStatusLabel(row.load_status) }}
                </el-tag>
              </dd>
            </div>
            <div>
              <dt>{{ t('capacityModule.table.bottleneck') }}</dt>
              <dd>
                <el-tag v-if="row.bottleneck" type="danger" size="small">
                  {{ t('capacityModule.common.yes') }}
                </el-tag>
                <span v-else>-</span>
              </dd>
            </div>
          </dl>
        </li>
      </ul>
      <el-pagination
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        class="pagination"
        :aria-label="t('capacityModule.table.paginationAriaLabel')"
        @update:current-page="(v: number) => emit('update:page', v)"
        @update:page-size="(v: number) => emit('update:size', v)"
      />
    </section>
    <template v-else>
      <el-table
        v-loading="tableLoading"
        :data="data"
        stripe
        style="width: 100%"
        :aria-label="$t('capacityModule.table.ariaLabel')"
      >
        <el-table-column prop="code" :label="$t('capacityModule.table.code')" width="120" />
        <el-table-column prop="name" :label="$t('capacityModule.table.name')" width="150" />
        <el-table-column
          prop="daily_capacity"
          :label="$t('capacityModule.table.capacityHours')"
          width="120"
        />
        <el-table-column
          prop="capacity_unit"
          :label="$t('capacityModule.table.capacityUnit')"
          width="90"
        />
        <el-table-column
          prop="total_demand"
          :label="$t('capacityModule.table.usedHours')"
          width="120"
        />
        <el-table-column prop="load_rate" :label="$t('capacityModule.table.loadRate')" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.load_rate != null" :type="getLoadRateType(Number(row.load_rate ?? 0))"
              >{{ Number(row.load_rate ?? 0).toFixed(1) }}%</el-tag
            >
          </template>
        </el-table-column>
        <el-table-column prop="status" :label="$t('capacityModule.table.status')" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.load_status != null" :type="getStatusType(row.load_status)">
              {{ getStatusLabel(row.load_status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="bottleneck"
          :label="$t('capacityModule.table.bottleneck')"
          width="80"
        >
          <template #default="{ row }">
            <el-tag v-if="row.bottleneck" type="danger" size="small">{{
              $t('capacityModule.common.yes')
            }}</el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        class="pagination"
        :aria-label="$t('capacityModule.table.paginationAriaLabel')"
        @update:current-page="(v: number) => emit('update:page', v)"
        @update:page-size="(v: number) => emit('update:size', v)"
      />
    </template>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Refresh } from '@element-plus/icons-vue';
import type { CapacityRow } from '@/api/capacity';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { getStatusType, getStatusLabel, getLoadRateType } from '../composables/cpFmts';

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

defineProps<{
  data: CapacityRow[];
  tableLoading: boolean;
  total: number;
  page: number;
  pageSize: number;
}>();

const emit = defineEmits<{
  refresh: [];
  'update:page': [v: number];
  'update:size': [v: number];
}>();
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header span {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.pagination {
  margin-top: 16px;
  justify-content: flex-end;
}

.capacity-mobile {
  min-width: 0;
}
.capacity-list {
  display: grid;
  gap: 16px;
  padding: 0;
  margin: 0 0 16px;
  list-style: none;
}
.capacity-card {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-bg-color);
}
.capacity-fields {
  display: grid;
  gap: 12px;
  margin: 0;
}
.capacity-fields > div {
  min-width: 0;
}
.capacity-fields dt {
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 1.5;
}
.capacity-fields dd {
  margin: 4px 0 0;
  color: var(--el-text-color-primary);
  font-size: 16px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.capacity-number dd {
  font-weight: 600;
}
.capacity-mobile :deep(.el-pagination) {
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
</style>
