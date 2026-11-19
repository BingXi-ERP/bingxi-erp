<!--
  ArReconciliationDispute.vue - AR 对账争议处理对话框
  拆分自 arReconciliation/enhanced.vue（P14 批 1 B3 I-2）
  P9-3 批次 F Pattern A 重构：本地 ref 镜像 + watch 防循环 + emit 整体覆盖父组件
-->
<template>
  <div class="ar-reconciliation-dispute">
    <el-dialog
      :model-value="visible"
      :title="$t('arReconciliationModule.disputeHandling')"
      :width="isPhone ? phoneDialogWidth : '900px'"
      class="ar-reconciliation-dispute-dialog"
      :class="{ 'ar-reconciliation-dispute-dialog--phone': isPhone }"
      :aria-label="$t('arReconciliationModule.disputeDialogAria')"
      @update:model-value="(v: boolean) => emit('update:visible', v)"
    >
      <el-form
        :model="localForm"
        :label-width="isPhone ? undefined : '100px'"
        :label-position="isPhone ? 'top' : 'right'"
        :aria-label="$t('arReconciliationModule.disputeFormAria')"
      >
        <!-- 后端 CreateDisputeApiRequest 只有 reconciliation_id/customer_id/reason/description，
             争议原因落 dispute_reason；原「争议类型/争议金额」采集项在 DTO 与表结构均无对应
             （提交即被 serde 丢弃 = 假采集），已移除 -->
        <el-form-item :label="$t('arReconciliationModule.disputeDescription')" required>
          <el-input
            :model-value="localForm.description"
            type="textarea"
            :rows="3"
            :placeholder="$t('arReconciliationModule.disputeDescriptionPlaceholder')"
            @update:model-value="(v: string) => (localForm.description = v ?? '')"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="emit('submit')">{{
            $t('arReconciliationModule.submitDispute')
          }}</el-button>
        </el-form-item>
      </el-form>

      <el-divider>{{ $t('arReconciliationModule.disputeRecords') }}</el-divider>
      <!-- list_disputes 返回的是对账单列表（reconciliation_status='disputed'），
           键为 reconciliation_no / period_* / dispute_reason / created_at -->
      <section v-if="isPhone" class="ar-dispute-mobile">
        <ul
          v-if="disputes.length"
          class="card-list"
          :aria-label="$t('arReconciliationModule.disputeRecordsAria')"
        >
          <li v-for="row in disputes" :key="row.id" class="card-item">
            <dl class="card-fields">
              <div class="field-emphasis">
                <dt>{{ $t('arReconciliationModule.sourceNo') }}</dt>
                <dd>{{ row.reconciliation_no }}</dd>
              </div>
              <div>
                <dt>{{ $t('arReconciliationModule.reconciliationPeriod') }}</dt>
                <dd>{{ row.period_start }} ~ {{ row.period_end }}</dd>
              </div>
              <div>
                <dt>{{ $t('arReconciliationModule.disputeDescription') }}</dt>
                <dd>{{ row.dispute_reason }}</dd>
              </div>
              <div>
                <dt>{{ $t('common.createTime') }}</dt>
                <dd>{{ row.created_at }}</dd>
              </div>
            </dl>
            <div class="card-actions">
              <el-button
                v-if="row.reconciliation_status === 'disputed'"
                size="small"
                type="primary"
                @click="emit('resolve', row)"
              >
                {{ $t('arReconciliationModule.resolve') }}
              </el-button>
            </div>
          </li>
        </ul>
        <el-empty v-else :description="$t('components.v2Table.empty')" />
      </section>
      <el-table
        v-else
        :data="disputes"
        border
        style="width: 100%"
        :aria-label="$t('arReconciliationModule.disputeRecordsAria')"
      >
        <el-table-column
          prop="reconciliation_no"
          :label="$t('arReconciliationModule.sourceNo')"
          width="150"
        />
        <el-table-column :label="$t('arReconciliationModule.reconciliationPeriod')" width="210">
          <template #default="scope"
            >{{ scope.row.period_start }} ~ {{ scope.row.period_end }}</template
          >
        </el-table-column>
        <el-table-column
          prop="dispute_reason"
          :label="$t('arReconciliationModule.disputeDescription')"
          show-overflow-tooltip
        />
        <el-table-column prop="created_at" :label="$t('common.createTime')" width="160" />
        <el-table-column :label="$t('common.operation')" width="100" align="center">
          <template #default="scope">
            <el-button
              v-if="scope.row.reconciliation_status === 'disputed'"
              size="small"
              type="primary"
              @click="emit('resolve', scope.row)"
            >
              {{ $t('arReconciliationModule.resolve') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import type { CreateDisputePayload, DisputeRecord } from '@/api/ar-reconciliation-enhanced';
import { useBreakpoint } from '@/composables/useBreakpoint';

const phoneDialogWidth =
  'calc(100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))';

const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

const props = defineProps<{
  visible: boolean;
  // 表单数据（由父组件管理，子组件通过 emit 回写）
  form: CreateDisputePayload;
  disputes: DisputeRecord[];
}>();

const emit = defineEmits<{
  'update:visible': [v: boolean];
  submit: [];
  resolve: [row: DisputeRecord];
  // 整体回写表单数据（父组件监听此事件并 Object.assign 到自己的 form）
  'update:form': [v: CreateDisputePayload];
}>();

// 本地镜像：避免直接修改 prop 触发 vue/no-mutating-props
const localForm = ref<CreateDisputePayload>({ ...props.form });

// 同步标志位：防止 prop → local 与 local → emit 形成循环
let syncing = false;

// 外部 prop 变化时同步到 local（如父组件重新打开对话框时填充数据）
watch(
  () => props.form,
  newForm => {
    if (syncing) return;
    syncing = true;
    localForm.value = { ...newForm };
    nextTick(() => {
      syncing = false;
    });
  },
  { deep: true }
);

// 本地变化时通知父组件（用户输入）
watch(
  localForm,
  newForm => {
    if (syncing) return;
    syncing = true;
    emit('update:form', { ...newForm });
    nextTick(() => {
      syncing = false;
    });
  },
  { deep: true }
);
</script>

<style scoped>
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
  margin: 0 0 16px;
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
.card-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.card-actions .el-button {
  min-height: 44px;
  min-width: 44px;
  height: auto;
  margin: 0;
  padding: 8px;
  white-space: normal;
}
.ar-reconciliation-dispute :deep(.ar-reconciliation-dispute-dialog--phone) {
  display: flex;
  flex-direction: column;
  width: calc(
    100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)
  ) !important;
  max-width: calc(
    100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)
  ) !important;
  max-height: calc(
    100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)
  );
  margin: calc(12px + env(safe-area-inset-top, 0px)) calc(12px + env(safe-area-inset-right, 0px))
    calc(12px + env(safe-area-inset-bottom, 0px)) calc(12px + env(safe-area-inset-left, 0px)) !important;
  box-sizing: border-box;
}
.ar-reconciliation-dispute :deep(.ar-reconciliation-dispute-dialog--phone .el-dialog__body) {
  min-height: 0;
  overflow-y: auto;
}
</style>
