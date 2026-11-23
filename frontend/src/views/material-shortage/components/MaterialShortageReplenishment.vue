<!--
  MaterialShortageReplenishment.vue - 补货建议
  数据来自后端 GET /material-shortage/replenishment：按当前实时缺料逐条给出
  建议采购量（缺口量 × 1.2 余量）与优先级，优先级由缺料级别映射（URGENT/HIGH/MEDIUM/LOW）
-->
<template>
  <el-card shadow="hover" class="replenishment-card">
    <template #header>
      <div class="replenishment-header">
        <span>{{ t('materialShortage.replenishment.title') }}</span>
        <el-button type="primary" link :loading="loading" @click="emit('refresh')">
          <el-icon><Refresh /></el-icon>
          {{ t('materialShortage.replenishment.refresh') }}
        </el-button>
      </div>
    </template>

    <section v-if="isPhone" v-loading="loading" class="replenishment-mobile">
      <ul class="shortage-list" :aria-label="t('materialShortage.replenishment.mobileCardAria')">
        <li v-for="row in suggestions" :key="row.material_code" class="shortage-card">
          <dl class="shortage-fields">
            <div class="shortage-number">
              <dt>{{ t('materialShortage.table.materialCode') }}</dt>
              <dd>{{ row.material_code }}</dd>
            </div>
            <div>
              <dt>{{ t('materialShortage.table.materialName') }}</dt>
              <dd>{{ row.material_name }}</dd>
            </div>
            <div>
              <dt>{{ t('materialShortage.table.shortageQuantity') }}</dt>
              <dd>{{ formatQuantity(row.shortage_quantity) }}</dd>
            </div>
            <div>
              <dt>{{ t('materialShortage.replenishment.suggestedQuantity') }}</dt>
              <dd>{{ formatQuantity(row.suggested_quantity) }}</dd>
            </div>
            <div>
              <dt>{{ t('materialShortage.replenishment.unit') }}</dt>
              <dd>{{ row.unit || '-' }}</dd>
            </div>
            <div>
              <dt>{{ t('materialShortage.replenishment.priority') }}</dt>
              <dd>
                <el-tag :type="getPriorityTagType(row.priority)">{{
                  getPriorityText(row.priority)
                }}</el-tag>
              </dd>
            </div>
            <div>
              <dt>{{ t('materialShortage.table.affectedOrders') }}</dt>
              <dd>{{ row.affected_orders_count }}</dd>
            </div>
          </dl>
        </li>
      </ul>
      <el-empty
        v-if="suggestions.length === 0"
        :description="t('materialShortage.replenishment.empty')"
      />
    </section>

    <el-table
      v-else
      v-loading="loading"
      :data="suggestions"
      stripe
      :empty-text="t('materialShortage.replenishment.empty')"
      :aria-label="t('materialShortage.replenishment.ariaLabel')"
    >
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
        :label="t('materialShortage.table.shortageQuantity')"
        width="110"
        align="right"
      >
        <template #default="{ row }">{{ formatQuantity(row.shortage_quantity) }}</template>
      </el-table-column>
      <el-table-column
        :label="t('materialShortage.replenishment.suggestedQuantity')"
        width="130"
        align="right"
      >
        <template #default="{ row }">{{ formatQuantity(row.suggested_quantity) }}</template>
      </el-table-column>
      <el-table-column :label="t('materialShortage.replenishment.unit')" width="80" align="center">
        <template #default="{ row }">{{ row.unit || '-' }}</template>
      </el-table-column>
      <el-table-column
        :label="t('materialShortage.replenishment.priority')"
        width="100"
        align="center"
      >
        <template #default="{ row }">
          <el-tag :type="getPriorityTagType(row.priority)">{{
            getPriorityText(row.priority)
          }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column
        :label="t('materialShortage.table.affectedOrders')"
        width="120"
        align="center"
      >
        <template #default="{ row }">{{ row.affected_orders_count }}</template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Refresh } from '@element-plus/icons-vue';
import { getPriorityTagType, getPriorityText, formatQuantity } from '../composables/msFmts';
import { useBreakpoint } from '@/composables/useBreakpoint';
import type { ReplenishmentSuggestion } from '@/api/material-shortage';

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

defineProps<{
  suggestions: ReplenishmentSuggestion[];
  loading: boolean;
}>();

const emit = defineEmits<{ refresh: [] }>();
</script>

<style scoped>
.replenishment-card {
  margin-bottom: 20px;
}
.replenishment-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.shortage-list {
  display: grid;
  gap: 16px;
  padding: 0;
  margin: 0;
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
</style>
