<!--
  切换事件列表
  - 显示最近的切换事件流水
  - 包含时间、功能、事件类型、延迟
-->

<template>
  <div class="failover-event-list" :class="{ 'failover-event-list--phone': isPhone }">
    <section v-if="isPhone" v-loading="loading" class="failover-event-mobile">
      <ul
        v-if="events.length"
        class="card-list"
        :aria-label="$t('adminFailover.eventListAriaLabel')"
      >
        <li v-for="row in events" :key="row.id" class="card-item">
          <dl class="card-fields">
            <div class="field-emphasis">
              <dt>{{ $t('adminFailover.colTime') }}</dt>
              <dd>{{ formatTime(row.created_at) }}</dd>
            </div>
            <div>
              <dt>{{ $t('adminFailover.colFunction') }}</dt>
              <dd>
                <el-tag size="small">{{ functionLabel(row.function_name) }}</el-tag>
              </dd>
            </div>
            <div>
              <dt>{{ $t('adminFailover.colEventType') }}</dt>
              <dd>
                <el-tag :type="eventTagType(row.event_type)" size="small">
                  {{ eventLabel(row.event_type) }}
                </el-tag>
              </dd>
            </div>
            <div>
              <dt>{{ $t('adminFailover.colStateChange') }}</dt>
              <dd>
                <span v-if="row.from_state">{{ row.from_state }} → {{ row.to_state }}</span>
                <span v-else>-</span>
              </dd>
            </div>
            <div>
              <dt>{{ $t('adminFailover.colReason') }}</dt>
              <dd class="reason">{{ row.reason || '-' }}</dd>
            </div>
            <div>
              <dt>{{ $t('adminFailover.colLatency') }}</dt>
              <dd>
                <span v-if="row.latency_ms !== null && row.latency_ms !== undefined">
                  {{ row.latency_ms }}
                </span>
                <span v-else>-</span>
              </dd>
            </div>
          </dl>
        </li>
      </ul>
      <el-empty v-else :description="$t('adminFailover.emptyEvents')" />
    </section>
    <el-table
      v-else
      v-loading="loading"
      :data="events"
      stripe
      border
      :empty-text="$t('adminFailover.emptyEvents')"
      :aria-label="$t('adminFailover.eventListAriaLabel')"
    >
      <el-table-column prop="created_at" :label="$t('adminFailover.colTime')" width="180">
        <template #default="{ row }">
          {{ formatTime(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column prop="function_name" :label="$t('adminFailover.colFunction')" width="120">
        <template #default="{ row }">
          <el-tag size="small">{{ functionLabel(row.function_name) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="event_type" :label="$t('adminFailover.colEventType')" width="160">
        <template #default="{ row }">
          <el-tag :type="eventTagType(row.event_type)" size="small">
            {{ eventLabel(row.event_type) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="$t('adminFailover.colStateChange')" width="180">
        <template #default="{ row }">
          <span v-if="row.from_state">{{ row.from_state }} → {{ row.to_state }}</span>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="reason" :label="$t('adminFailover.colReason')" min-width="200">
        <template #default="{ row }">
          <span class="reason">{{ row.reason || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column
        prop="latency_ms"
        :label="$t('adminFailover.colLatency')"
        width="100"
        align="right"
      >
        <template #default="{ row }">
          <span v-if="row.latency_ms !== null && row.latency_ms !== undefined">
            {{ row.latency_ms }}
          </span>
          <span v-else>-</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FailoverEventDto } from '@/api/failover';
import { useBreakpoint } from '@/composables/useBreakpoint';

defineProps<{ events: FailoverEventDto[]; loading?: boolean }>();

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

const FUNCTION_LABEL_KEYS: Record<string, string> = {
  database: 'adminFailover.funcDatabase',
  cache: 'adminFailover.funcCache',
};

const EVENT_LABEL_KEYS: Record<string, string> = {
  switch_to_backup: 'adminFailover.eventSwitchToBackup',
  switch_back: 'adminFailover.eventSwitchBack',
  primary_recovered: 'adminFailover.eventPrimaryRecovered',
  both_failed: 'adminFailover.eventBothFailed',
  circuit_open: 'adminFailover.eventCircuitOpen',
  circuit_close: 'adminFailover.eventCircuitClose',
  circuit_half_open: 'adminFailover.eventCircuitHalfOpen',
};

const EVENT_TAG_TYPES: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
  switch_to_backup: 'warning',
  switch_back: 'success',
  primary_recovered: 'success',
  both_failed: 'danger',
  circuit_open: 'danger',
  circuit_close: 'success',
  circuit_half_open: 'info',
};

function functionLabel(name: string): string {
  return FUNCTION_LABEL_KEYS[name] ? t(FUNCTION_LABEL_KEYS[name]) : name;
}

function eventLabel(type: string): string {
  return EVENT_LABEL_KEYS[type] ? t(EVENT_LABEL_KEYS[type]) : type;
}

function eventTagType(type: string): 'success' | 'warning' | 'danger' | 'info' {
  return EVENT_TAG_TYPES[type] || 'info';
}

function formatTime(time: string): string {
  try {
    return new Date(time).toLocaleString('zh-CN');
  } catch {
    return time;
  }
}
</script>

<style scoped>
.reason {
  color: #606266;
  font-size: 13px;
}
.card-list {
  display: grid;
  gap: 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}
.card-item {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-bg-color);
}
.card-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}
.card-fields > div {
  min-width: 0;
}
.field-emphasis {
  grid-column: 1 / -1;
}
.card-fields dt {
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.5;
}
.card-fields dd {
  margin: 4px 0 0;
  color: var(--el-text-color-primary);
  font-size: 14px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.field-emphasis dd {
  font-weight: 600;
}
.card-fields .reason {
  color: #606266;
  font-size: 13px;
}
</style>
