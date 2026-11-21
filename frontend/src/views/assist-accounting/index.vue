<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useBreakpoint } from '@/composables/useBreakpoint';
import {
  ElTable,
  ElTableColumn,
  ElButton,
  ElDialog,
  ElInput,
  ElSelect,
  ElOption,
  ElDatePicker,
  ElMessage,
  ElRow,
  ElCol,
  ElDescriptions,
  ElDescriptionsItem,
  ElTabs,
  ElTabPane,
  ElPagination,
} from 'element-plus';
import { View, Refresh } from '@element-plus/icons-vue';
import {
  getAssistDimensionList,
  getAssistSummary,
  type AssistDimensionResponse,
  type AssistRecordResponse,
  type AssistSummaryResponse,
} from '@/api/assist-accounting';
import { useTableApi } from '@/composables/useTableApi';
import { logAuxLoadFailure } from '@/utils/logger';

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

const activeTab = ref('records');
const dimensions = ref<AssistDimensionResponse[]>([]);

// 批次 390：records tab 接入 useTableApi，修复 0-based 分页 bug
// 原代码第 98 行 page: pagination.value.page - 1 为 0-based 分页，
// 与后端 page.unwrap_or(1).clamp(1,1000) + page.saturating_sub(1)*page_size 约定不一致。
// useTableApi 使用 1-based 分页，直接传 page 给后端，无需 -1 转换。
// 后端返回 { data: { records: [], total: 0 } }，需配置 listKey: 'records'。
const {
  data: tableData,
  total,
  loading: recordsLoading,
  page,
  pageSize,
  queryParams,
  refresh: loadRecords,
} = useTableApi<AssistRecordResponse>({
  url: '/assist-accounting/records',
  listKey: 'records',
  defaultPageSize: 20,
  defaultParams: {
    accounting_period: '',
    dimension_code: '',
    business_type: '',
    warehouse_id: '',
  },
  onError: (err: unknown) => {
    logAuxLoadFailure(t('assistAccounting.message.fetchRecordsFailed'), err);
    ElMessage.error(t('assistAccounting.message.fetchRecordsFailed'));
  },
});

// summary tab 保持独立 loading 和数据管理（不分页，不接入 useTableApi）
const summaryLoading = ref(false);
const summaryData = ref<AssistSummaryResponse[]>([]);

// searchForm 用于表单双向绑定，搜索时同步到 useTableApi queryParams
const searchForm = ref({
  accounting_period: '',
  dimension_code: '',
  business_type: '',
  warehouse_id: '',
});

const viewDialogVisible = ref(false);
const viewData = ref<AssistRecordResponse | null>(null);

const dimensionOptions = computed(() => {
  return dimensions.value.map(d => ({ label: d.dimension_name, value: d.dimension_code }));
});

const businessTypeOptions = computed(() => [
  { label: t('assistAccounting.businessType.all'), value: '' },
  { label: t('assistAccounting.businessType.purchaseReceipt'), value: 'PURCHASE_RECEIPT' },
  { label: t('assistAccounting.businessType.salesDelivery'), value: 'SALES_DELIVERY' },
  { label: t('assistAccounting.businessType.inventoryAdjustment'), value: 'INVENTORY_ADJUSTMENT' },
  { label: t('assistAccounting.businessType.productionInput'), value: 'PRODUCTION_INPUT' },
  { label: t('assistAccounting.businessType.productionOutput'), value: 'PRODUCTION_OUTPUT' },
]);

const getBusinessTypeLabel = (value: string) => {
  const option = businessTypeOptions.value.find(b => b.value === value);
  return option?.label || value;
};

// 借/贷金额与米数/公斤数在后端为 Decimal，线上序列化为 JSON 字符串（见 api 层类型注释）。
// 本页仅原样展示这些字符串，不在前端做数值转换或合计——避免把 number 混入本应为 string 的列。

const loadDimensions = async () => {
  try {
    // 后端 /dimensions 的 data 恒为裸数组 AssistDimensionResponse[]，直接取 res.data
    const res = await getAssistDimensionList();
    dimensions.value = res.data;
  } catch (error) {
    logAuxLoadFailure(t('assistAccounting.message.loadDimensionFailed'), error);
    ElMessage.error(t('assistAccounting.message.loadDimensionFailed'));
  }
};

const loadSummary = async () => {
  summaryLoading.value = true;
  try {
    const period = searchForm.value.accounting_period || new Date().toISOString().slice(0, 7);
    // 后端 /summary 的 data 恒为裸数组 AssistSummaryResponse[]，直接取 res.data
    const res = await getAssistSummary({
      accounting_period: period,
      dimension_code: searchForm.value.dimension_code || undefined,
    });
    summaryData.value = res.data;
  } catch (error) {
    logAuxLoadFailure(t('assistAccounting.message.loadSummaryFailed'), error);
    ElMessage.error(t('assistAccounting.message.loadSummaryFailed'));
  } finally {
    summaryLoading.value = false;
  }
};

// 批次 390：handleSearch 同步 searchForm 到 useTableApi queryParams
// useTableApi watch 只监听 page/pageSize 变化，不监听 queryParams，
// 所以修改 queryParams 后需要手动调 loadRecords 确保加载
const handleSearch = () => {
  if (activeTab.value === 'records') {
    // 同步搜索条件到 useTableApi queryParams
    queryParams.value = {
      accounting_period: searchForm.value.accounting_period || undefined,
      dimension_code: searchForm.value.dimension_code || undefined,
      business_type: searchForm.value.business_type || undefined,
      warehouse_id: searchForm.value.warehouse_id
        ? Number(searchForm.value.warehouse_id)
        : undefined,
    };
    page.value = 1;
    loadRecords();
  } else {
    loadSummary();
  }
};

const handleReset = () => {
  searchForm.value = {
    accounting_period: '',
    dimension_code: '',
    business_type: '',
    warehouse_id: '',
  };
  handleSearch();
};

const openViewDialog = (row: AssistRecordResponse) => {
  viewData.value = row;
  viewDialogVisible.value = true;
};

const handleTabChange = () => {
  handleSearch();
};

// 批次 390：维度数据在 setup 阶段加载，records 由 useTableApi setup 自动加载
loadDimensions();
</script>

<template>
  <div class="app-container">
    <div class="filter-container">
      <ElRow :gutter="20">
        <ElCol :span="isPhone ? 24 : 6">
          <ElDatePicker
            v-model="searchForm.accounting_period"
            type="month"
            :placeholder="$t('assistAccounting.filter.accountingPeriod')"
            class="filter-item"
          />
        </ElCol>
        <ElCol :span="isPhone ? 24 : 6">
          <ElSelect
            v-model="searchForm.dimension_code"
            :placeholder="$t('assistAccounting.filter.dimension')"
            class="filter-item"
          >
            <ElOption :label="$t('assistAccounting.filter.all')" value="" />
            <ElOption
              v-for="d in dimensionOptions"
              :key="d.value"
              :label="d.label"
              :value="d.value"
            />
          </ElSelect>
        </ElCol>
        <ElCol :span="isPhone ? 24 : 6">
          <ElSelect
            v-model="searchForm.business_type"
            :placeholder="$t('assistAccounting.filter.businessType')"
            class="filter-item"
          >
            <ElOption
              v-for="b in businessTypeOptions"
              :key="b.value"
              :label="b.label"
              :value="b.value"
            />
          </ElSelect>
        </ElCol>
        <ElCol :span="isPhone ? 24 : 6">
          <ElInput
            v-model="searchForm.warehouse_id"
            :placeholder="$t('assistAccounting.filter.warehouseId')"
            class="filter-item"
            @keyup.enter="handleSearch"
          />
        </ElCol>
      </ElRow>
      <div class="filter-actions">
        <ElButton type="primary" @click="handleSearch">{{
          $t('assistAccounting.filter.query')
        }}</ElButton>
        <ElButton @click="handleReset">{{ $t('assistAccounting.filter.reset') }}</ElButton>
        <ElButton @click="activeTab === 'records' ? loadRecords() : loadSummary()">
          <Refresh /> {{ $t('assistAccounting.filter.refresh') }}
        </ElButton>
      </div>
    </div>

    <ElTabs v-model="activeTab" @tab-change="handleTabChange">
      <ElTabPane :label="$t('assistAccounting.tabs.records')" name="records">
        <!-- 手机端：核算记录单列卡片，字段与动作与桌面表格等价 -->
        <section v-if="isPhone" class="records-mobile">
          <ul class="card-list" :aria-label="$t('assistAccounting.recordsTable.ariaLabel')">
            <li v-for="(row, index) in tableData" :key="row.id ?? index" class="card-item">
              <dl class="card-fields">
                <div class="field field-emphasis">
                  <dt>{{ $t('assistAccounting.recordsTable.businessNo') }}</dt>
                  <dd>{{ row.business_no }}</dd>
                </div>
                <div class="field">
                  <dt>{{ $t('assistAccounting.recordsTable.businessType') }}</dt>
                  <dd>{{ getBusinessTypeLabel(row.business_type) }}</dd>
                </div>
                <div class="field">
                  <dt>{{ $t('assistAccounting.recordsTable.batchNo') }}</dt>
                  <dd>{{ row.batch_no }}</dd>
                </div>
                <div class="field">
                  <dt>{{ $t('assistAccounting.recordsTable.colorNo') }}</dt>
                  <dd>{{ row.color_no }}</dd>
                </div>
                <div class="field">
                  <dt>{{ $t('assistAccounting.recordsTable.grade') }}</dt>
                  <dd>{{ row.grade }}</dd>
                </div>
                <div class="field">
                  <dt>{{ $t('assistAccounting.recordsTable.warehouseId') }}</dt>
                  <dd>{{ row.warehouse_id }}</dd>
                </div>
                <div class="field">
                  <dt>{{ $t('assistAccounting.recordsTable.quantityMeters') }}</dt>
                  <dd>{{ row.quantity_meters }}</dd>
                </div>
                <div class="field">
                  <dt>{{ $t('assistAccounting.recordsTable.quantityKg') }}</dt>
                  <dd>{{ row.quantity_kg }}</dd>
                </div>
                <div class="field">
                  <dt>{{ $t('assistAccounting.recordsTable.debitAmount') }}</dt>
                  <dd>{{ row.debit_amount }}</dd>
                </div>
                <div class="field">
                  <dt>{{ $t('assistAccounting.recordsTable.creditAmount') }}</dt>
                  <dd>{{ row.credit_amount }}</dd>
                </div>
                <div class="field">
                  <dt>{{ $t('assistAccounting.recordsTable.createdAt') }}</dt>
                  <dd>{{ row.created_at }}</dd>
                </div>
              </dl>
              <div class="card-actions">
                <ElButton size="small" @click="openViewDialog(row as AssistRecordResponse)">
                  <View />
                </ElButton>
              </div>
            </li>
          </ul>
        </section>

        <ElTable
          v-if="!isPhone"
          :data="tableData"
          :loading="recordsLoading"
          border
          fit
          highlight-current-row
          style="width: 100%"
          :aria-label="$t('assistAccounting.recordsTable.ariaLabel')"
        >
          <ElTableColumn prop="id" :label="$t('assistAccounting.recordsTable.id')" width="80" />
          <ElTableColumn
            prop="business_type"
            :label="$t('assistAccounting.recordsTable.businessType')"
            width="120"
          >
            <template #default="scope">{{
              getBusinessTypeLabel(scope.row.business_type)
            }}</template>
          </ElTableColumn>
          <ElTableColumn
            prop="business_no"
            :label="$t('assistAccounting.recordsTable.businessNo')"
            width="150"
          />
          <ElTableColumn
            prop="batch_no"
            :label="$t('assistAccounting.recordsTable.batchNo')"
            width="120"
          />
          <ElTableColumn
            prop="color_no"
            :label="$t('assistAccounting.recordsTable.colorNo')"
            width="100"
          />
          <ElTableColumn
            prop="grade"
            :label="$t('assistAccounting.recordsTable.grade')"
            width="100"
          />
          <ElTableColumn
            prop="warehouse_id"
            :label="$t('assistAccounting.recordsTable.warehouseId')"
            width="100"
          />
          <ElTableColumn
            prop="quantity_meters"
            :label="$t('assistAccounting.recordsTable.quantityMeters')"
            width="120"
            align="right"
          />
          <ElTableColumn
            prop="quantity_kg"
            :label="$t('assistAccounting.recordsTable.quantityKg')"
            width="120"
            align="right"
          />
          <ElTableColumn
            prop="debit_amount"
            :label="$t('assistAccounting.recordsTable.debitAmount')"
            width="120"
            align="right"
          />
          <ElTableColumn
            prop="credit_amount"
            :label="$t('assistAccounting.recordsTable.creditAmount')"
            width="120"
            align="right"
          />
          <ElTableColumn
            prop="created_at"
            :label="$t('assistAccounting.recordsTable.createdAt')"
            width="150"
          />
          <ElTableColumn
            :label="$t('assistAccounting.recordsTable.operation')"
            width="100"
            align="center"
          >
            <template #default="scope">
              <ElButton size="small" @click="openViewDialog(scope.row as AssistRecordResponse)">
                <View />
              </ElButton>
            </template>
          </ElTableColumn>
        </ElTable>

        <!-- 批次 390：分页由 useTableApi watch 自动加载，v-model 双向绑定 page/pageSize -->
        <div class="pagination-wrapper" style="margin-top: 16px; text-align: right">
          <ElPagination
            v-model:current-page="page"
            v-model:page-size="pageSize"
            :page-sizes="[10, 20, 50, 100]"
            :total="total"
            layout="total, sizes, prev, pager, next, jumper"
            :aria-label="$t('assistAccounting.recordsTable.paginationAriaLabel')"
          />
        </div>
      </ElTabPane>

      <ElTabPane :label="$t('assistAccounting.tabs.summary')" name="summary">
        <!-- 手机端：汇总单列卡片 -->
        <section v-if="isPhone" class="summary-mobile">
          <ul class="card-list" :aria-label="$t('assistAccounting.summaryTable.ariaLabel')">
            <li v-for="(row, index) in summaryData" :key="row.id ?? index" class="card-item">
              <dl class="card-fields">
                <div class="field field-emphasis">
                  <dt>{{ $t('assistAccounting.summaryTable.accountingPeriod') }}</dt>
                  <dd>{{ row.accounting_period }}</dd>
                </div>
                <div class="field">
                  <dt>{{ $t('assistAccounting.summaryTable.dimensionCode') }}</dt>
                  <dd>{{ row.dimension_code }}</dd>
                </div>
                <div class="field">
                  <dt>{{ $t('assistAccounting.summaryTable.dimensionValue') }}</dt>
                  <dd>{{ row.dimension_value_name }}</dd>
                </div>
                <div class="field">
                  <dt>{{ $t('assistAccounting.summaryTable.totalDebit') }}</dt>
                  <dd>{{ row.total_debit }}</dd>
                </div>
                <div class="field">
                  <dt>{{ $t('assistAccounting.summaryTable.totalCredit') }}</dt>
                  <dd>{{ row.total_credit }}</dd>
                </div>
                <div class="field">
                  <dt>{{ $t('assistAccounting.summaryTable.totalQuantityMeters') }}</dt>
                  <dd>{{ row.total_quantity_meters }}</dd>
                </div>
                <div class="field">
                  <dt>{{ $t('assistAccounting.summaryTable.totalQuantityKg') }}</dt>
                  <dd>{{ row.total_quantity_kg }}</dd>
                </div>
                <div class="field">
                  <dt>{{ $t('assistAccounting.summaryTable.recordCount') }}</dt>
                  <dd>{{ row.record_count }}</dd>
                </div>
              </dl>
            </li>
          </ul>
        </section>

        <ElTable
          v-if="!isPhone"
          :data="summaryData"
          :loading="summaryLoading"
          border
          fit
          highlight-current-row
          style="width: 100%"
          :aria-label="$t('assistAccounting.summaryTable.ariaLabel')"
        >
          <ElTableColumn prop="id" :label="$t('assistAccounting.summaryTable.id')" width="80" />
          <ElTableColumn
            prop="accounting_period"
            :label="$t('assistAccounting.summaryTable.accountingPeriod')"
            width="120"
          />
          <ElTableColumn
            prop="dimension_code"
            :label="$t('assistAccounting.summaryTable.dimensionCode')"
            width="120"
          />
          <ElTableColumn
            prop="dimension_value_name"
            :label="$t('assistAccounting.summaryTable.dimensionValue')"
            width="150"
          />
          <ElTableColumn
            prop="total_debit"
            :label="$t('assistAccounting.summaryTable.totalDebit')"
            width="120"
            align="right"
          />
          <ElTableColumn
            prop="total_credit"
            :label="$t('assistAccounting.summaryTable.totalCredit')"
            width="120"
            align="right"
          />
          <ElTableColumn
            prop="total_quantity_meters"
            :label="$t('assistAccounting.summaryTable.totalQuantityMeters')"
            width="120"
            align="right"
          />
          <ElTableColumn
            prop="total_quantity_kg"
            :label="$t('assistAccounting.summaryTable.totalQuantityKg')"
            width="120"
            align="right"
          />
          <ElTableColumn
            prop="record_count"
            :label="$t('assistAccounting.summaryTable.recordCount')"
            width="100"
            align="center"
          />
        </ElTable>
      </ElTabPane>
    </ElTabs>

    <ElDialog
      :title="$t('assistAccounting.detailDialog.title')"
      v-model="viewDialogVisible"
      :width="isPhone ? '95%' : '800px'"
      :aria-label="$t('assistAccounting.detailDialog.ariaLabel')"
      @close="viewDialogVisible = false"
    >
      <div v-if="viewData">
        <ElDescriptions :column="isPhone ? 1 : 3" border>
          <ElDescriptionsItem :label="$t('assistAccounting.detailDialog.id')">{{
            viewData.id
          }}</ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('assistAccounting.detailDialog.businessType')">{{
            getBusinessTypeLabel(viewData.business_type)
          }}</ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('assistAccounting.detailDialog.businessNo')">{{
            viewData.business_no
          }}</ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('assistAccounting.detailDialog.businessId')">{{
            viewData.business_id
          }}</ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('assistAccounting.detailDialog.accountSubjectId')">{{
            viewData.account_subject_id
          }}</ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('assistAccounting.detailDialog.fiveDimensionId')">{{
            viewData.five_dimension_id
          }}</ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('assistAccounting.detailDialog.productId')">{{
            viewData.product_id
          }}</ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('assistAccounting.detailDialog.batchNo')">{{
            viewData.batch_no
          }}</ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('assistAccounting.detailDialog.colorNo')">{{
            viewData.color_no
          }}</ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('assistAccounting.detailDialog.dyeLotNo')">{{
            viewData.dye_lot_no || '-'
          }}</ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('assistAccounting.detailDialog.grade')">{{
            viewData.grade
          }}</ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('assistAccounting.detailDialog.warehouseId')">{{
            viewData.warehouse_id
          }}</ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('assistAccounting.detailDialog.quantityMeters')">{{
            viewData.quantity_meters
          }}</ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('assistAccounting.detailDialog.quantityKg')">{{
            viewData.quantity_kg
          }}</ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('assistAccounting.detailDialog.debitAmount')">{{
            viewData.debit_amount
          }}</ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('assistAccounting.detailDialog.creditAmount')">{{
            viewData.credit_amount
          }}</ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('assistAccounting.detailDialog.workshopId')">{{
            viewData.workshop_id || '-'
          }}</ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('assistAccounting.detailDialog.customerId')">{{
            viewData.customer_id || '-'
          }}</ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('assistAccounting.detailDialog.supplierId')">{{
            viewData.supplier_id || '-'
          }}</ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('assistAccounting.detailDialog.remarks')">{{
            viewData.remarks || '-'
          }}</ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('assistAccounting.detailDialog.createdAt')">{{
            viewData.created_at
          }}</ElDescriptionsItem>
        </ElDescriptions>
      </div>
    </ElDialog>
  </div>
</template>

<style scoped>
.app-container {
  padding: 20px;
}

.filter-container {
  margin-bottom: 20px;
}

.filter-item {
  width: 100%;
}

.filter-actions {
  margin-top: 10px;
}

.records-mobile .card-list,
.summary-mobile .card-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.records-mobile .card-item,
.summary-mobile .card-item {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 12px;
}

.records-mobile .card-fields > div,
.summary-mobile .card-fields > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
}

.records-mobile .card-fields dt,
.summary-mobile .card-fields dt {
  color: #909399;
  flex-shrink: 0;
}

.records-mobile .card-fields dd,
.summary-mobile .card-fields dd {
  margin: 0;
  text-align: right;
  word-break: break-all;
}

.records-mobile .field-emphasis dd,
.summary-mobile .field-emphasis dd {
  font-weight: 500;
}

.records-mobile .card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #ebeef5;
}

.records-mobile .card-actions .el-button {
  margin: 0;
}
</style>
