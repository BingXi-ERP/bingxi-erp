<!--
  SecurityLockTable.vue - 锁定账户管理表（含解锁操作）
  拆分自 security/index.vue（P14 批 2 I-3 第 6 批）
  行为完全保持一致（仅结构重构）
  批次 D05 B4：接入 useI18n
-->
<template>
  <el-card shadow="hover" class="table-card">
    <template #header>
      <div class="card-header">
        <span>{{ t('security.lockTable.title') }}</span>
      </div>
    </template>

    <!-- 手机端：锁定账户单列卡片 -->
    <section v-if="isPhone" v-loading="loading" class="security-table-mobile">
      <ul class="card-list" :aria-label="t('security.lockTable.ariaLabel')">
        <li v-for="(row, index) in data" :key="index" class="card-item">
          <dl class="card-fields">
            <div class="field field-emphasis">
              <dt>{{ t('security.lockTable.column.username') }}</dt>
              <dd>{{ row.username }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('security.lockTable.column.lockReason') }}</dt>
              <dd>{{ row.lock_reason }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('security.lockTable.column.lockedAt') }}</dt>
              <dd>{{ row.locked_at }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('security.lockTable.column.unlockAt') }}</dt>
              <dd>{{ row.unlock_at }}</dd>
            </div>
          </dl>
          <div class="card-actions">
            <el-button type="primary" @click="emit('unlock', row as LockedAccount)">
              {{ t('security.lockTable.button.unlock') }}
            </el-button>
          </div>
        </li>
      </ul>
    </section>

    <el-table
      v-if="!isPhone"
      v-loading="loading"
      :data="data"
      border
      stripe
      :aria-label="t('security.lockTable.ariaLabel')"
    >
      <el-table-column
        type="index"
        :label="t('security.lockTable.column.index')"
        width="60"
        align="center"
      />
      <el-table-column
        prop="username"
        :label="t('security.lockTable.column.username')"
        width="120"
        show-overflow-tooltip
      />
      <el-table-column
        prop="lock_reason"
        :label="t('security.lockTable.column.lockReason')"
        min-width="200"
        show-overflow-tooltip
      />
      <el-table-column
        prop="locked_at"
        :label="t('security.lockTable.column.lockedAt')"
        width="180"
        align="center"
      />
      <el-table-column
        prop="unlock_at"
        :label="t('security.lockTable.column.unlockAt')"
        width="180"
        align="center"
      />
      <el-table-column :label="t('security.lockTable.column.action')" width="120" align="center">
        <template #default="{ row }">
          <el-button
            type="primary"
            link
            size="small"
            :disabled="(row as LockedAccount).id === null"
            @click="emit('unlock', row as LockedAccount)"
            >{{ t('security.lockTable.button.unlock') }}</el-button
          >
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useBreakpoint } from '@/composables/useBreakpoint';
import type { LockedAccount } from '@/api/security';

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

defineProps<{ data: LockedAccount[]; loading: boolean }>();
const emit = defineEmits<{ unlock: [row: LockedAccount] }>();
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
