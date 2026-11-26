<template>
  <div v-loading="listLoading" class="number-rules" data-testid="number-rules-page">
    <header class="page-header">
      <div>
        <h2>{{ t('system.numberRules.title') }}</h2>
        <p>{{ t('system.numberRules.description') }}</p>
      </div>
      <el-button :loading="listLoading" @click="loadRules">
        {{ t('common.refresh') }}
      </el-button>
    </header>

    <el-alert
      v-if="!canUpdate"
      :title="t('system.numberRules.readonly')"
      type="info"
      :closable="false"
    />
    <el-alert
      v-if="listFailed"
      :title="t('system.numberRules.loadFailed')"
      type="error"
      :closable="false"
    >
      <el-button @click="loadRules">{{ t('common.refresh') }}</el-button>
    </el-alert>

    <section v-else class="table-section" :aria-label="t('system.numberRules.tableAria')">
      <el-table
        :data="rules"
        row-key="id"
        :row-class-name="rowClassName"
        :empty-text="t('system.numberRules.empty')"
        data-testid="number-rules-table"
      >
        <el-table-column
          prop="rule_key"
          :label="t('system.numberRules.columns.ruleKey')"
          width="110"
        />
        <el-table-column
          prop="name"
          :label="t('system.numberRules.columns.name')"
          min-width="150"
        />
        <el-table-column :label="t('system.numberRules.columns.prefix')" min-width="120">
          <template #default="{ row }">
            <span :data-testid="`number-rule-${row.rule_key}-prefix`">{{ row.prefix }}</span>
          </template>
        </el-table-column>
        <el-table-column
          prop="seq_width"
          :label="t('system.numberRules.columns.seqWidth')"
          width="120"
        />
        <el-table-column :label="t('system.numberRules.columns.resetMode')" width="130">
          <template #default="{ row }">
            <el-tag :type="resetModeTagType(row.reset_mode)">
              {{ resetModeLabel(row.reset_mode) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="version"
          :label="t('system.numberRules.columns.version')"
          width="100"
        />
        <el-table-column :label="t('system.numberRules.columns.updatedAt')" min-width="180">
          <template #default="{ row }">{{ formatTimestamp(row.updated_at) }}</template>
        </el-table-column>
        <el-table-column :label="t('system.numberRules.columns.actions')" width="210" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              :data-testid="`number-rule-${row.rule_key}-detail`"
              @click="openDetail(row.id)"
            >
              {{ t('system.numberRules.actions.history') }}
            </el-button>
            <el-button
              v-permission="PERMISSIONS.NUMBER_RULES_UPDATE"
              link
              type="primary"
              :data-testid="`number-rule-${row.rule_key}-edit`"
              @click="openEdit(row)"
            >
              {{ t('system.numberRules.actions.edit') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        :aria-label="t('system.numberRules.paginationAria')"
        data-testid="number-rules-pagination"
        @size-change="loadRules"
        @current-change="loadRules"
      />
    </section>
  </div>

  <el-drawer
    v-model="drawerVisible"
    :title="detailTitle"
    size="min(760px, 94vw)"
    destroy-on-close
    data-testid="number-rule-detail-drawer"
  >
    <div v-loading="detailLoading" class="detail-content">
      <el-alert
        v-if="detailFailed"
        :title="t('system.numberRules.detailLoadFailed')"
        type="error"
        :closable="false"
      >
        <el-button v-if="detailId" @click="loadDetail(detailId)">{{
          t('common.refresh')
        }}</el-button>
      </el-alert>
      <template v-if="selectedDetail">
        <dl class="current-config">
          <div>
            <dt>{{ t('system.numberRules.columns.ruleKey') }}</dt>
            <dd>{{ selectedDetail.rule.rule_key }}</dd>
          </div>
          <div>
            <dt>{{ t('system.numberRules.columns.name') }}</dt>
            <dd>{{ selectedDetail.rule.name }}</dd>
          </div>
          <div>
            <dt>{{ t('system.numberRules.columns.prefix') }}</dt>
            <dd>{{ selectedDetail.rule.prefix }}</dd>
          </div>
          <div>
            <dt>{{ t('system.numberRules.columns.seqWidth') }}</dt>
            <dd>{{ selectedDetail.rule.seq_width }}</dd>
          </div>
          <div>
            <dt>{{ t('system.numberRules.columns.resetMode') }}</dt>
            <dd>{{ resetModeLabel(selectedDetail.rule.reset_mode) }}</dd>
          </div>
          <div>
            <dt>{{ t('system.numberRules.columns.version') }}</dt>
            <dd>{{ selectedDetail.rule.version }}</dd>
          </div>
        </dl>

        <div class="detail-heading">
          <h3>{{ t('system.numberRules.historyTitle') }}</h3>
          <el-button
            v-permission="PERMISSIONS.NUMBER_RULES_UPDATE"
            type="primary"
            :data-testid="`number-rule-${selectedDetail.rule.rule_key}-drawer-edit`"
            @click="openEdit(selectedDetail.rule)"
          >
            {{ t('system.numberRules.actions.edit') }}
          </el-button>
        </div>
        <el-table
          :data="selectedDetail.revisions"
          row-key="id"
          :empty-text="t('system.numberRules.historyEmpty')"
          :aria-label="t('system.numberRules.historyAria')"
          data-testid="number-rule-history-table"
        >
          <el-table-column
            prop="version"
            :label="t('system.numberRules.columns.version')"
            width="90"
          />
          <el-table-column :label="t('system.numberRules.columns.prefix')" width="100">
            <template #default="{ row }">
              <span :data-testid="`number-rule-revision-${row.version}-prefix`">
                {{ row.config.prefix }}
              </span>
            </template>
          </el-table-column>
          <el-table-column :label="t('system.numberRules.columns.seqWidth')" width="110">
            <template #default="{ row }">
              <span :data-testid="`number-rule-revision-${row.version}-width`">
                {{ row.config.seq_width }}
              </span>
            </template>
          </el-table-column>
          <el-table-column :label="t('system.numberRules.columns.resetMode')" width="120">
            <template #default="{ row }">
              <span :data-testid="`number-rule-revision-${row.version}-reset-mode`">
                {{ resetModeLabel(row.config.reset_mode) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column
            prop="change_reason"
            :label="t('system.numberRules.columns.changeReason')"
            min-width="180"
            show-overflow-tooltip
          />
          <el-table-column
            prop="changed_by"
            :label="t('system.numberRules.columns.changedBy')"
            width="110"
          />
          <el-table-column :label="t('system.numberRules.columns.createdAt')" min-width="175">
            <template #default="{ row }">{{ formatTimestamp(row.created_at) }}</template>
          </el-table-column>
          <el-table-column
            :label="t('system.numberRules.columns.actions')"
            width="110"
            fixed="right"
          >
            <template #default="{ row }">
              <el-button
                v-permission="PERMISSIONS.NUMBER_RULES_UPDATE"
                link
                type="danger"
                :disabled="row.version >= selectedDetail.rule.version"
                :data-testid="`number-rule-revision-${row.version}-rollback`"
                @click="confirmRollback(row)"
              >
                {{ t('system.numberRules.actions.rollback') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </div>
  </el-drawer>

  <el-dialog
    v-model="editVisible"
    :title="t('system.numberRules.editTitle')"
    width="min(560px, 94vw)"
    destroy-on-close
    data-testid="number-rule-edit-dialog"
  >
    <el-alert
      v-if="versionConflict"
      :title="t('system.numberRules.versionConflict')"
      type="warning"
      :closable="false"
      data-testid="number-rule-version-conflict"
    >
      <el-button :loading="conflictRefreshing" @click="refreshAfterConflict">
        {{ t('system.numberRules.actions.refreshAndRetry') }}
      </el-button>
    </el-alert>
    <el-alert
      v-if="editFailed"
      :title="t('system.numberRules.updateFailed')"
      type="error"
      :closable="false"
      data-testid="number-rule-update-failed"
    />
    <el-form
      v-if="editingRule"
      ref="editFormRef"
      :model="editForm"
      :rules="editRules"
      :disabled="!canUpdate || submitting"
      label-position="top"
      :aria-label="t('system.numberRules.editFormAria')"
      @submit.prevent
    >
      <el-form-item :label="t('system.numberRules.columns.ruleKey')">
        <el-input :model-value="editingRule.rule_key" disabled />
      </el-form-item>
      <el-form-item :label="t('system.numberRules.columns.name')">
        <el-input :model-value="editingRule.name" disabled />
      </el-form-item>
      <el-form-item :label="t('system.numberRules.columns.prefix')" prop="prefix">
        <el-input
          v-model="editForm.prefix"
          :maxlength="50"
          show-word-limit
          data-testid="number-rule-prefix-input"
        />
      </el-form-item>
      <el-form-item :label="t('system.numberRules.columns.seqWidth')" prop="seq_width">
        <el-input
          v-model="editForm.seq_width"
          inputmode="numeric"
          maxlength="2"
          data-testid="number-rule-width-input"
        />
      </el-form-item>
      <el-form-item :label="t('system.numberRules.columns.resetMode')" prop="reset_mode">
        <el-select v-model="editForm.reset_mode" data-testid="number-rule-reset-mode-select">
          <el-option
            v-for="mode in resetModes"
            :key="mode"
            :label="resetModeLabel(mode)"
            :value="mode"
          />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('system.numberRules.exampleTitle')">
        <div class="number-example" aria-live="polite" data-testid="number-rule-number-example">
          {{ numberExample }}
        </div>
        <p class="form-hint">{{ t('system.numberRules.exampleHint') }}</p>
      </el-form-item>
      <el-form-item :label="t('system.numberRules.columns.changeReason')" prop="change_reason">
        <el-input
          v-model="editForm.change_reason"
          type="textarea"
          :rows="3"
          :maxlength="500"
          show-word-limit
          :placeholder="t('system.numberRules.changeReasonPlaceholder')"
          data-testid="number-rule-change-reason-input"
        />
      </el-form-item>
      <p class="form-hint">
        {{ t('system.numberRules.versionHint', { version: editBaseVersion }) }}
      </p>
    </el-form>
    <template #footer>
      <el-button :disabled="submitting" @click="editVisible = false">
        {{ t('common.cancel') }}
      </el-button>
      <el-button
        v-permission="PERMISSIONS.NUMBER_RULES_UPDATE"
        type="primary"
        :loading="submitting"
        :disabled="versionConflict"
        data-testid="number-rule-save"
        @click="saveEdit"
      >
        {{ t('common.save') }}
      </el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="rollbackVisible"
    :title="t('system.numberRules.rollbackTitle')"
    width="min(520px, 94vw)"
    destroy-on-close
    data-testid="number-rule-rollback-dialog"
  >
    <el-alert
      v-if="rollbackConflict"
      :title="t('system.numberRules.versionConflict')"
      type="warning"
      :closable="false"
    >
      <el-button :loading="conflictRefreshing" @click="refreshRollbackAfterConflict">
        {{ t('system.numberRules.actions.refreshAndRetry') }}
      </el-button>
    </el-alert>
    <el-alert
      v-if="rollbackFailed"
      :title="t('system.numberRules.rollbackFailed')"
      type="error"
      :closable="false"
    />
    <p v-if="rollbackTarget">
      {{
        t('system.numberRules.rollbackDescription', {
          version: rollbackTarget.version,
          currentVersion: rollbackBaseVersion,
        })
      }}
    </p>
    <el-form
      v-if="rollbackTarget"
      label-position="top"
      :disabled="!canUpdate || rollbackSubmitting"
      :aria-label="t('system.numberRules.rollbackFormAria')"
      @submit.prevent
    >
      <el-form-item :label="t('system.numberRules.columns.changeReason')">
        <el-input
          v-model="rollbackReason"
          type="textarea"
          :rows="3"
          :maxlength="500"
          show-word-limit
          :placeholder="t('system.numberRules.changeReasonPlaceholder')"
          data-testid="number-rule-rollback-reason-input"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button :disabled="rollbackSubmitting" @click="rollbackVisible = false">
        {{ t('common.cancel') }}
      </el-button>
      <el-button
        v-permission="PERMISSIONS.NUMBER_RULES_UPDATE"
        type="danger"
        :loading="rollbackSubmitting"
        :disabled="rollbackConflict"
        data-testid="number-rule-rollback-confirm"
        @click="submitRollback"
      >
        {{ t('system.numberRules.actions.rollback') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { isAxiosError } from 'axios';
import type { FormInstance, FormRules } from 'element-plus';
import {
  getNumberRule,
  getNumberRules,
  rollbackNumberRule,
  updateNumberRule,
  type NumberRule,
  type NumberRuleDetail,
  type NumberRuleResetMode,
  type NumberRuleRevision,
} from '@/api/system-number-rule';
import { PERMISSIONS } from '@/constants/permissions';
import { hasRoutePermission } from '@/router';
import { useUserStore } from '@/store/user';
import type { ErrorResponse } from '@/types/api-response';
import { logger } from '@/utils/logger';
import { msg } from '@/utils/message';
import { isDialogDismissal } from '@/utils/monitor';

interface EditForm {
  prefix: string;
  seq_width: number | string;
  reset_mode: NumberRuleResetMode;
  change_reason: string;
}

const { t, locale } = useI18n({ useScope: 'global' });
const userStore = useUserStore();
const resetModes: NumberRuleResetMode[] = ['day', 'month', 'never'];

const rules = ref<NumberRule[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const listLoading = ref(false);
const listFailed = ref(false);

const drawerVisible = ref(false);
const detailId = ref<number | null>(null);
const selectedDetail = ref<NumberRuleDetail | null>(null);
const detailLoading = ref(false);
const detailFailed = ref(false);

const editVisible = ref(false);
const editingRule = ref<NumberRule | null>(null);
const editBaseVersion = ref(0);
const editForm = ref<EditForm>({ prefix: '', seq_width: 3, reset_mode: 'day', change_reason: '' });
const editFormRef = ref<FormInstance>();
const editRules = computed<FormRules>(() => ({
  prefix: [
    { required: true, message: t('system.numberRules.validation.prefixRequired'), trigger: 'blur' },
  ],
  seq_width: [
    {
      validator: (_rule, value, callback) => {
        const width = Number(value);
        if (!Number.isInteger(width) || width < 1 || width > 12) {
          callback(new Error(t('system.numberRules.validation.seqWidthInvalid')));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
  change_reason: [
    {
      required: true,
      message: t('system.numberRules.validation.changeReasonRequired'),
      trigger: 'blur',
    },
  ],
}));
const submitting = ref(false);
const editFailed = ref(false);
const versionConflict = ref(false);
const conflictRefreshing = ref(false);

const rollbackVisible = ref(false);
const rollbackTarget = ref<NumberRuleRevision | null>(null);
const rollbackBaseVersion = ref(0);
const rollbackReason = ref('');
const rollbackSubmitting = ref(false);
const rollbackFailed = ref(false);
const rollbackConflict = ref(false);

const canUpdate = computed(() => {
  const permissions = userStore.userInfo?.permissions;
  return (
    permissions !== undefined && hasRoutePermission(PERMISSIONS.NUMBER_RULES_UPDATE, permissions)
  );
});
const detailTitle = computed(() => {
  const rule = selectedDetail.value?.rule;
  return rule
    ? t('system.numberRules.historyDialogTitle', { name: rule.name })
    : t('system.numberRules.historyTitle');
});
const numberExample = computed(() => {
  const { prefix, seq_width: seqWidth, reset_mode: resetMode } = editForm.value;
  const width = Number(seqWidth);
  if (prefix.length === 0 || !Number.isInteger(width) || width < 1 || width > 12) {
    return null;
  }
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const period =
    resetMode === 'day' ? `${year}${month}${day}` : resetMode === 'month' ? `${year}${month}` : '';
  return `${prefix}${period}${String(1).padStart(width, '0')}`;
});

function rowClassName({ row }: { row: NumberRule }): string {
  return `number-rule-row-${row.rule_key}`;
}

function resetModeLabel(mode: NumberRuleResetMode): string {
  switch (mode) {
    case 'day':
      return t('system.numberRules.resetModes.day');
    case 'month':
      return t('system.numberRules.resetModes.month');
    case 'never':
      return t('system.numberRules.resetModes.never');
  }
}

function resetModeTagType(mode: NumberRuleResetMode): 'info' | 'warning' | 'success' {
  switch (mode) {
    case 'day':
      return 'info';
    case 'month':
      return 'warning';
    case 'never':
      return 'success';
  }
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

async function loadRules(): Promise<void> {
  listLoading.value = true;
  listFailed.value = false;
  try {
    const response = await getNumberRules({ page: page.value, page_size: pageSize.value });
    rules.value = response.data.items;
    total.value = response.data.total;
  } catch (error) {
    rules.value = [];
    total.value = 0;
    listFailed.value = true;
    logger.error('加载编码规则列表失败', error);
  } finally {
    listLoading.value = false;
  }
}

async function loadDetail(id: number): Promise<void> {
  detailLoading.value = true;
  detailFailed.value = false;
  try {
    const response = await getNumberRule(id);
    selectedDetail.value = response.data;
  } catch (error) {
    selectedDetail.value = null;
    detailFailed.value = true;
    logger.error('加载编码规则历史失败', error);
  } finally {
    detailLoading.value = false;
  }
}

async function openDetail(id: number): Promise<void> {
  detailId.value = id;
  selectedDetail.value = null;
  drawerVisible.value = true;
  await loadDetail(id);
}

function openEdit(rule: NumberRule): void {
  editingRule.value = rule;
  editBaseVersion.value = rule.version;
  editForm.value = {
    prefix: rule.prefix,
    seq_width: rule.seq_width,
    reset_mode: rule.reset_mode,
    change_reason: '',
  };
  editFailed.value = false;
  versionConflict.value = false;
  editVisible.value = true;
}

function isBusinessError(error: unknown): boolean {
  if (!isAxiosError(error) || error.response?.status !== 400) return false;
  const body = error.response.data as ErrorResponse | undefined;
  return body?.code === 'BUSINESS_ERROR';
}

async function hasVersionChanged(id: number, version: number): Promise<boolean> {
  const response = await getNumberRule(id);
  return response.data.rule.version !== version;
}

function showVersionConflict(): void {
  versionConflict.value = true;
  ElMessage.warning(t('system.numberRules.versionConflict'));
}

async function saveEdit(): Promise<void> {
  const rule = editingRule.value;
  if (!rule) return;
  const valid = await editFormRef.value?.validate().catch(() => false);
  if (!valid) return;

  submitting.value = true;
  editFailed.value = false;
  try {
    const latest = await getNumberRule(rule.id);
    if (latest.data.rule.version !== editBaseVersion.value) {
      showVersionConflict();
      return;
    }
    const response = await updateNumberRule(rule.id, {
      prefix: editForm.value.prefix.trim(),
      seq_width: Number(editForm.value.seq_width),
      reset_mode: editForm.value.reset_mode,
      version: editBaseVersion.value,
      change_reason: editForm.value.change_reason.trim(),
    });
    selectedDetail.value = response.data;
    editVisible.value = false;
    await loadRules();
    msg.updateOk();
  } catch (error) {
    logger.error('更新编码规则失败', error);
    if (isBusinessError(error)) {
      let versionChanged: boolean;
      try {
        versionChanged = await hasVersionChanged(rule.id, editBaseVersion.value);
      } catch (versionError) {
        logger.error('更新冲突后核对编码规则版本失败', versionError);
        editFailed.value = true;
        msg.updateFail();
        return;
      }
      if (versionChanged) {
        showVersionConflict();
        return;
      }
    }
    editFailed.value = true;
    msg.updateFail();
  } finally {
    submitting.value = false;
  }
}

async function refreshAfterConflict(): Promise<void> {
  const rule = editingRule.value;
  if (!rule) return;
  conflictRefreshing.value = true;
  try {
    const response = await getNumberRule(rule.id);
    selectedDetail.value = response.data;
    editBaseVersion.value = response.data.rule.version;
    versionConflict.value = false;
    msg.info('refreshSuccess');
  } catch (error) {
    logger.error('刷新编码规则版本失败', error);
    msg.error('operationFailed');
  } finally {
    conflictRefreshing.value = false;
  }
}

async function confirmRollback(revision: NumberRuleRevision): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('system.numberRules.rollbackConfirm', { version: revision.version }),
      {
        title: t('system.numberRules.rollbackTitle'),
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
      }
    );
  } catch (error) {
    if (!isDialogDismissal(error)) {
      logger.error('编码规则回滚确认失败', error);
      msg.error('operationFailed');
    }
    return;
  }

  const rule = selectedDetail.value?.rule;
  if (!rule) return;
  rollbackTarget.value = revision;
  rollbackBaseVersion.value = rule.version;
  rollbackReason.value = '';
  rollbackFailed.value = false;
  rollbackConflict.value = false;
  rollbackVisible.value = true;
}

function showRollbackConflict(): void {
  rollbackConflict.value = true;
  ElMessage.warning(t('system.numberRules.versionConflict'));
}

async function submitRollback(): Promise<void> {
  const target = rollbackTarget.value;
  if (!target) return;
  rollbackSubmitting.value = true;
  rollbackFailed.value = false;
  try {
    const latest = await getNumberRule(target.rule_id);
    if (latest.data.rule.version !== rollbackBaseVersion.value) {
      showRollbackConflict();
      return;
    }
    const response = await rollbackNumberRule(target.rule_id, {
      revision_id: target.id,
      version: rollbackBaseVersion.value,
      change_reason: rollbackReason.value.trim(),
    });
    selectedDetail.value = response.data;
    rollbackVisible.value = false;
    await loadRules();
    msg.updateOk();
  } catch (error) {
    logger.error('回滚编码规则失败', error);
    if (isBusinessError(error)) {
      let versionChanged: boolean;
      try {
        versionChanged = await hasVersionChanged(target.rule_id, rollbackBaseVersion.value);
      } catch (versionError) {
        logger.error('回滚冲突后核对编码规则版本失败', versionError);
        rollbackFailed.value = true;
        msg.error('operationFailed');
        return;
      }
      if (versionChanged) {
        showRollbackConflict();
        return;
      }
    }
    rollbackFailed.value = true;
    msg.error('operationFailed');
  } finally {
    rollbackSubmitting.value = false;
  }
}

async function refreshRollbackAfterConflict(): Promise<void> {
  const target = rollbackTarget.value;
  if (!target) return;
  conflictRefreshing.value = true;
  try {
    const response = await getNumberRule(target.rule_id);
    selectedDetail.value = response.data;
    rollbackBaseVersion.value = response.data.rule.version;
    rollbackConflict.value = false;
    msg.info('refreshSuccess');
  } catch (error) {
    logger.error('刷新编码规则回滚版本失败', error);
    msg.error('operationFailed');
  } finally {
    conflictRefreshing.value = false;
  }
}

onMounted(loadRules);
</script>

<style scoped>
.number-rules {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.page-header,
.detail-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.page-header h2,
.page-header p,
.detail-heading h3 {
  margin: 0;
}

.page-header p {
  margin-top: 8px;
  color: var(--el-text-color-secondary);
}

.table-section {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.table-section .el-pagination {
  justify-self: end;
  overflow-wrap: anywhere;
}

.detail-content {
  display: grid;
  gap: 20px;
  min-width: 0;
}

.current-config {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin: 0;
}

.current-config div {
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
}

.current-config dt {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.current-config dd {
  margin: 6px 0 0;
  overflow-wrap: anywhere;
}

.form-hint {
  margin: 0;
  color: var(--el-text-color-secondary);
}

.number-example {
  padding: 10px 12px;
  overflow-wrap: anywhere;
  color: var(--el-text-color-primary);
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
  font-family: var(--el-font-family);
  font-weight: 600;
}

.number-example + .form-hint {
  margin-top: 6px;
}

.el-alert + .el-form,
.el-alert + p,
.el-alert + .el-table {
  margin-top: 16px;
}
</style>
