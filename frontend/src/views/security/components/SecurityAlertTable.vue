<!--
  SecurityAlertTable.vue - 安全告警表（含类型/状态标签）
  拆分自 security/index.vue（P14 批 2 I-3 第 6 批）
  行为完全保持一致（仅结构重构）
  批次 D05 B4：接入 useI18n
-->
<template>
  <el-card shadow="hover" class="table-card">
    <template #header>
      <div class="card-header">
        <span>{{ t('security.alertTable.title') }}</span>
      </div>
    </template>

    <!-- 手机端：安全告警单列卡片 -->
    <section v-if="isPhone" v-loading="loading" class="security-table-mobile">
      <ul class="card-list" :aria-label="t('security.alertTable.ariaLabel')">
        <li v-for="(row, index) in data" :key="index" class="card-item">
          <dl class="card-fields">
            <div class="field field-emphasis">
              <dt>{{ t('security.alertTable.column.alertType') }}</dt>
              <dd>
                <el-tag :type="getAlertType(row.alert_type)">{{
                  getAlertLabel(row.alert_type)
                }}</el-tag>
              </dd>
            </div>
            <div class="field">
              <dt>{{ t('security.alertTable.column.username') }}</dt>
              <dd>{{ row.username }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('security.alertTable.column.ipAddress') }}</dt>
              <dd>{{ row.ip_address }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('security.alertTable.column.description') }}</dt>
              <dd>{{ row.description }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('security.alertTable.column.createdAt') }}</dt>
              <dd>{{ row.created_at }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('security.alertTable.column.status') }}</dt>
              <dd>
                <el-tag :type="getAlertStatusType(row.status)">
                  {{ getAlertStatusLabel(row.status) }}
                </el-tag>
              </dd>
            </div>
          </dl>
        </li>
      </ul>
    </section>

    <el-table
      v-if="!isPhone"
      v-loading="loading"
      :data="data"
      border
      stripe
      :aria-label="t('security.alertTable.ariaLabel')"
    >
      <el-table-column
        type="index"
        :label="t('security.alertTable.column.index')"
        width="60"
        align="center"
      />
      <el-table-column
        prop="alert_type"
        :label="t('security.alertTable.column.alertType')"
        width="120"
        align="center"
      >
        <template #default="{ row }">
          <el-tag :type="getAlertType(row.alert_type)">{{ getAlertLabel(row.alert_type) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column
        prop="username"
        :label="t('security.alertTable.column.username')"
        width="120"
        show-overflow-tooltip
      />
      <el-table-column
        prop="ip_address"
        :label="t('security.alertTable.column.ipAddress')"
        width="150"
        show-overflow-tooltip
      />
      <el-table-column
        prop="description"
        :label="t('security.alertTable.column.description')"
        min-width="200"
        show-overflow-tooltip
      />
      <el-table-column
        prop="created_at"
        :label="t('security.alertTable.column.createdAt')"
        width="180"
        align="center"
      />
      <el-table-column
        prop="status"
        :label="t('security.alertTable.column.status')"
        width="100"
        align="center"
      >
        <template #default="{ row }">
          <el-tag :type="getAlertStatusType(row.status)">{{
            getAlertStatusLabel(row.status)
          }}</el-tag>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useBreakpoint } from '@/composables/useBreakpoint';
import type { SecurityAlert } from '@/api/security';
import { getAlertType, getAlertStatusType } from '../composables/secFmts';

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

defineProps<{ data: SecurityAlert[]; loading: boolean }>();

// 告警类型/状态码 → 本地化标签（动态 t() 调用确保语言切换响应）
const getAlertLabel = (type: string) => t(`security.alertTable.alertType.${type}`);
const getAlertStatusLabel = (status: string) => t(`security.alertTable.status.${status}`);
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.security-table-mobile .card-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.security-table-mobile .card-item {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 12px;
}

.security-table-mobile .card-fields > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
}

.security-table-mobile .card-fields dt {
  color: #909399;
  flex-shrink: 0;
}

.security-table-mobile .card-fields dd {
  margin: 0;
  text-align: right;
  word-break: break-all;
}

.security-table-mobile .field-emphasis dd {
  font-weight: 500;
}

.security-table-mobile .card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #ebeef5;
}

.security-table-mobile .card-actions .el-button {
  margin: 0;
}
</style>
