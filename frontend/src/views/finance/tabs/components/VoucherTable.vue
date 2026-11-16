<!--
  VoucherTable.vue - 凭证列表表格
  拆分自 VoucherTab.vue（P14 批 1 B3 I-2）
  行为完全保持一致（仅结构重构）
-->
<template>
  <el-card shadow="hover">
    <!-- 手机卡片（<768 与 BPM 审批手机卡片同断点同范式） -->
    <section v-if="isPhone" v-loading="voucherLoading" class="voucher-mobile">
      <ul class="voucher-list" :aria-label="t('finance.voucherTable.mobileCardAriaLabel')">
        <li v-for="row in vouchers" :key="row.id" class="voucher-card">
          <dl class="voucher-fields">
            <div class="voucher-number">
              <dt>{{ t('finance.voucherTable.columnVoucherNo') }}</dt>
              <dd>{{ row.voucher_no }}</dd>
            </div>
            <div>
              <dt>{{ t('finance.voucherTable.columnVoucherDate') }}</dt>
              <dd>{{ row.voucher_date }}</dd>
            </div>
            <div>
              <dt>{{ t('finance.voucherTable.columnVoucherType') }}</dt>
              <dd>{{ row.voucher_type }}</dd>
            </div>
            <div>
              <dt>{{ t('finance.voucherTable.columnStatus') }}</dt>
              <dd>
                <el-tag :type="getVoucherStatusType(row.status)" size="small">
                  {{ getVoucherStatusLabel(row.status) }}
                </el-tag>
              </dd>
            </div>
            <div>
              <dt>{{ t('finance.voucherTable.columnCreatedBy') }}</dt>
              <dd>{{ row.created_by_name || '-' }}</dd>
            </div>
          </dl>
          <div class="voucher-actions">
            <el-button type="primary" @click="emit('view', row)">{{
              t('finance.voucherTable.buttonView')
            }}</el-button>
            <el-button v-if="row.status === 'draft'" type="primary" @click="emit('submit', row)">{{
              t('finance.voucherTable.buttonSubmit')
            }}</el-button>
            <el-button
              v-if="row.status === 'submitted'"
              type="success"
              @click="emit('review', row)"
              >{{ t('finance.voucherTable.buttonReview') }}</el-button
            >
            <el-button v-if="row.status === 'reviewed'" type="warning" @click="emit('post', row)">{{
              t('finance.voucherTable.buttonPost')
            }}</el-button>
          </div>
        </li>
      </ul>
      <ElEmpty
        v-if="!voucherLoading && vouchers.length === 0"
        :description="t('components.v2Table.empty')"
      />
      <ElPagination
        :current-page="page"
        :page-size="pageSize"
        :page-sizes="[10, 20, 50]"
        :total="voucherTotal"
        layout="total, sizes, prev, next"
        :aria-label="t('finance.voucherTable.paginationAriaLabel')"
        @update:current-page="(v: number) => emit('update:page', v)"
        @update:page-size="(v: number) => emit('update:page-size', v)"
      />
    </section>
    <el-table
      v-else
      v-loading="voucherLoading"
      :data="vouchers"
      stripe
      :aria-label="t('finance.voucherTable.ariaLabel')"
    >
      <el-table-column
        prop="voucher_no"
        :label="t('finance.voucherTable.columnVoucherNo')"
        width="120"
      />
      <el-table-column
        prop="voucher_date"
        :label="t('finance.voucherTable.columnVoucherDate')"
        width="120"
      />
      <el-table-column
        prop="voucher_type"
        :label="t('finance.voucherTable.columnVoucherType')"
        width="100"
      />
      <!-- P0 修复（移除假契约列）：后端 GET /vouchers 列表返回 Vec<voucher::Model>
           （models/voucher.rs），从不包含 total_debit/total_credit（vouchers 表无合计列，
           list_vouchers 无聚合）⇒ 原「借方/贷方金额」列恒显 0.00，已移除；
           借贷合计真实来源为详情端点 entries（见 VoucherDetail / useVchr.viewVoucher 派生）。 -->
      <el-table-column
        prop="status"
        :label="t('finance.voucherTable.columnStatus')"
        width="100"
        align="center"
      >
        <template #default="{ row }">
          <el-tag :type="getVoucherStatusType(row.status)" size="small">
            {{ getVoucherStatusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        prop="created_by_name"
        :label="t('finance.voucherTable.columnCreatedBy')"
        width="100"
      />
      <el-table-column
        prop="created_at"
        :label="t('finance.voucherTable.columnCreatedAt')"
        width="160"
      />
      <el-table-column :label="t('finance.voucherTable.columnAction')" width="200" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link size="small" @click="emit('view', row)">{{
            t('finance.voucherTable.buttonView')
          }}</el-button>
          <el-button
            v-if="row.status === 'draft'"
            type="primary"
            link
            size="small"
            @click="emit('submit', row)"
            >{{ t('finance.voucherTable.buttonSubmit') }}</el-button
          >
          <el-button
            v-if="row.status === 'submitted'"
            type="success"
            link
            size="small"
            @click="emit('review', row)"
            >{{ t('finance.voucherTable.buttonReview') }}</el-button
          >
          <el-button
            v-if="row.status === 'reviewed'"
            type="warning"
            link
            size="small"
            @click="emit('post', row)"
            >{{ t('finance.voucherTable.buttonPost') }}</el-button
          >
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination-wrapper">
      <el-pagination
        :current-page="page"
        :page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="voucherTotal"
        layout="total, sizes, prev, pager, next, jumper"
        :aria-label="t('finance.voucherTable.paginationAriaLabel')"
        @update:current-page="(v: number) => emit('update:page', v)"
        @update:page-size="(v: number) => emit('update:page-size', v)"
      />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElEmpty, ElPagination } from 'element-plus';
import type { Voucher } from '@/api/finance';
import { useBreakpoint } from '@/composables/useBreakpoint';

const { t } = useI18n({ useScope: 'global' });

// 手机卡片断点（<768 与 BPM 审批手机卡片同断点）
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

/**
 * 凭证列表表格组件
 * 仅做展示，行内操作通过 emit 通知父组件
 * 批次 289：分页改为 v-model:page/page-size 绑定（由 useTableApi watch 自动加载）
 */
const props = defineProps<{
  vouchers: Voucher[];
  voucherLoading: boolean;
  voucherTotal: number;
  page: number;
  pageSize: number;
  getVoucherStatusLabel: (status?: string) => string;
  getVoucherStatusType: (status?: string) => string;
}>();

// 查看凭证 / 提交凭证 / 审核凭证 / 过账凭证 / 分页变化（由 useTableApi watch 自动加载）
const emit = defineEmits<{
  view: [row: Voucher];
  submit: [row: Voucher];
  review: [row: Voucher];
  post: [row: Voucher];
  'update:page': [page: number];
  'update:page-size': [pageSize: number];
}>();

void props;
</script>

<style scoped>
.pagination-wrapper {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

/* 手机卡片（范式与 BPM 审批手机卡片一致） */
.voucher-mobile {
  min-width: 0;
}
.voucher-list {
  display: grid;
  gap: 16px;
  padding: 0;
  margin: 0 0 16px;
  list-style: none;
}
.voucher-card {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-bg-color);
}
.voucher-fields {
  display: grid;
  gap: 12px;
  margin: 0 0 16px;
}
.voucher-fields > div {
  min-width: 0;
}
.voucher-fields dt {
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 1.5;
}
.voucher-fields dd {
  margin: 4px 0 0;
  color: var(--el-text-color-primary);
  font-size: 16px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.voucher-number dd {
  font-weight: 600;
}
.voucher-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.voucher-actions .el-button {
  min-height: 44px;
  min-width: 44px;
  height: auto;
  margin: 0;
  padding: 8px;
  white-space: normal;
}
.voucher-mobile :deep(.el-pagination) {
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
.voucher-mobile :deep(.el-pagination button),
.voucher-mobile :deep(.el-pager li),
.voucher-mobile :deep(.el-pagination__sizes .el-select__wrapper) {
  min-width: 44px;
  min-height: 44px;
}
</style>
