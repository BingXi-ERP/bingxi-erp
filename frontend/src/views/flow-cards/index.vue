<template>
  <div class="flow-cards-page">
    <el-card shadow="never">
      <div class="page-header">
        <h2>{{ t('flowCards.index.pageTitle') }}</h2>
        <div class="header-actions">
          <el-select
            v-model="queryStatus"
            :placeholder="t('flowCards.index.placeholderAllStatus')"
            clearable
            style="width: 160px"
            @change="handleFilter"
          >
            <el-option
              v-for="(label, key) in statusTextMap"
              :key="key"
              :label="label"
              :value="key"
            />
          </el-select>
          <el-button type="primary" @click="handleCreate">{{
            t('flowCards.index.buttonCreate')
          }}</el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="cardList" border>
        <el-table-column prop="card_no" :label="t('flowCards.index.colCardNo')" min-width="180" />
        <el-table-column
          prop="production_order_id"
          :label="t('flowCards.index.colProductionOrder')"
          width="100"
          align="center"
        />
        <el-table-column
          prop="product_name"
          :label="t('flowCards.index.colProduct')"
          min-width="120"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ row.product_name || '-' }}</template>
        </el-table-column>
        <el-table-column :label="t('flowCards.index.colColorNo')" prop="color_no" width="120">
          <template #default="{ row }">{{ row.color_no || '-' }}</template>
        </el-table-column>
        <el-table-column prop="status" :label="t('common.status')" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTagMap[row.status as FlowCardStatus] ?? 'info'">
              {{ statusTextMap[row.status as FlowCardStatus] ?? row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="planned_fabric_weight"
          :label="t('flowCards.index.colPlannedWeight')"
          width="120"
          align="right"
        >
          <template #default="{ row }">{{ row.planned_fabric_weight ?? '-' }}</template>
        </el-table-column>
        <el-table-column prop="dye_lot_no" :label="t('flowCards.index.colDyeLotNo')" width="130">
          <template #default="{ row }">{{ row.dye_lot_no || '-' }}</template>
        </el-table-column>
        <el-table-column :label="t('common.operation')" width="330" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="handleDetail(row)">
              {{ t('common.detail') }}
            </el-button>
            <el-button
              v-permission="PERMISSIONS.FLOW_CARD_READ"
              size="small"
              link
              type="primary"
              @click="openMaterials(row)"
            >
              {{ t('flowCards.materials.buttonMaterials') }}
            </el-button>
            <el-button
              v-for="action in getNextActions(row)"
              :key="action.key"
              size="small"
              link
              :type="action.danger ? 'danger' : 'primary'"
              @click="runAction(action, row)"
            >
              {{ action.label }}
            </el-button>
            <el-button
              v-if="canDelete(row)"
              size="small"
              link
              type="danger"
              @click="handleDelete(row)"
            >
              {{ t('common.delete') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        style="margin-top: 16px; justify-content: flex-end"
        @current-change="loadList"
        @size-change="handleFilter"
      />
    </el-card>

    <el-dialog
      v-model="createVisible"
      :title="t('flowCards.index.titleCreate')"
      width="560px"
      @close="resetForm"
    >
      <el-form ref="formRef" :model="formData" :rules="formRules" label-width="110px">
        <el-form-item
          :label="t('flowCards.index.labelProductionOrderId')"
          prop="production_order_id"
        >
          <el-select
            v-model="formData.production_order_id"
            filterable
            clearable
            :filter-method="filterOrderOptions"
            :placeholder="t('flowCards.index.placeholderSelectOrder')"
            style="width: 100%"
            @change="onProductionOrderChange"
          >
            <el-option
              v-for="o in visibleOrderOptions"
              :key="o.id"
              :label="orderLabel(o)"
              :value="o.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('flowCards.index.labelProductId')" prop="product_id">
          <!-- 产品由所选生产订单带出，只读展示，不允许手改 -->
          <el-input :model-value="numericView(formData.product_id)" disabled style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('flowCards.index.labelProductName')" prop="product_name">
          <el-input
            v-model="formData.product_name"
            :placeholder="t('flowCards.index.placeholderProductAuto')"
            readonly
          />
        </el-form-item>
        <el-form-item :label="t('flowCards.index.colColorNo')" prop="color_no">
          <el-input
            v-model="formData.color_no"
            :placeholder="t('flowCards.index.placeholderOptional')"
          />
        </el-form-item>
        <el-form-item :label="t('flowCards.index.colPlannedWeight')" prop="planned_fabric_weight">
          <el-input
            v-model="formData.planned_fabric_weight"
            inputmode="decimal"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item
          :label="t('flowCards.index.labelDyeingRequirements')"
          prop="dyeing_requirements"
        >
          <el-input v-model="formData.dyeing_requirements" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="submitLoading" @click="submitCreate">{{
          t('flowCards.index.buttonConfirm')
        }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailVisible" :title="t('flowCards.index.titleDetail')" width="640px">
      <el-descriptions v-if="detailRow" :column="2" border>
        <el-descriptions-item :label="t('flowCards.index.colCardNo')">{{
          detailRow.card_no
        }}</el-descriptions-item>
        <el-descriptions-item :label="t('flowCards.index.labelBarcode')">{{
          detailRow.barcode
        }}</el-descriptions-item>
        <el-descriptions-item :label="t('flowCards.index.labelProductionOrderId')">{{
          detailRow.production_order_id
        }}</el-descriptions-item>
        <el-descriptions-item :label="t('common.status')">
          <el-tag :type="statusTagMap[detailRow.status] ?? 'info'">
            {{ statusTextMap[detailRow.status] ?? detailRow.status }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="t('flowCards.index.colProduct')">{{
          detailRow.product_name || '-'
        }}</el-descriptions-item>
        <el-descriptions-item :label="t('flowCards.index.colColorNo')">{{
          detailRow.color_no || '-'
        }}</el-descriptions-item>
        <el-descriptions-item :label="t('flowCards.index.labelCustomer')">{{
          detailRow.customer_name || '-'
        }}</el-descriptions-item>
        <el-descriptions-item :label="t('flowCards.index.colDyeLotNo')">{{
          detailRow.dye_lot_no || '-'
        }}</el-descriptions-item>
        <el-descriptions-item :label="t('flowCards.index.colPlannedWeight')">{{
          detailRow.planned_fabric_weight ?? '-'
        }}</el-descriptions-item>
        <el-descriptions-item :label="t('flowCards.index.labelActualWeight')">{{
          detailRow.actual_fabric_weight ?? '-'
        }}</el-descriptions-item>
        <el-descriptions-item :label="t('flowCards.index.labelCurrentStepSeq')">{{
          detailRow.current_step_seq
        }}</el-descriptions-item>
        <el-descriptions-item :label="t('common.createTime')">{{
          detailRow.created_at
        }}</el-descriptions-item>
        <el-descriptions-item :label="t('flowCards.index.labelDyeingRequirements')" :span="2">{{
          detailRow.dyeing_requirements || '-'
        }}</el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button @click="detailVisible = false">{{ t('common.close') }}</el-button>
      </template>
    </el-dialog>

    <!-- 投纱明细面板：纱批事实（什么纱／编号／批次）由流转卡的投纱行承载，按卡读写 -->
    <el-card v-if="selectedCard" shadow="never" class="materials-panel">
      <div class="page-header">
        <h2>
          {{ t('flowCards.materials.pageTitle') }}
          <span class="materials-card-no">{{ selectedCard.card_no }}</span>
        </h2>
        <div class="header-actions">
          <el-button
            v-permission="PERMISSIONS.FLOW_CARD_CREATE"
            type="primary"
            @click="openMaterialCreate"
          >
            {{ t('flowCards.materials.buttonAdd') }}
          </el-button>
          <el-button @click="closeMaterials">{{ t('common.close') }}</el-button>
        </div>
      </div>

      <el-table v-loading="materialsLoading" :data="materialList" border>
        <el-table-column
          prop="material_no"
          :label="t('flowCards.materials.colMaterialNo')"
          min-width="120"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ row.material_no || '-' }}</template>
        </el-table-column>
        <el-table-column
          prop="material_name"
          :label="t('flowCards.materials.colMaterialName')"
          min-width="140"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ row.material_name || '-' }}</template>
        </el-table-column>
        <el-table-column
          prop="batch_no"
          :label="t('flowCards.materials.colBatchNo')"
          min-width="110"
        >
          <template #default="{ row }">{{ row.batch_no || '-' }}</template>
        </el-table-column>
        <el-table-column prop="color_no" :label="t('flowCards.materials.colColorNo')" width="100">
          <template #default="{ row }">{{ row.color_no || '-' }}</template>
        </el-table-column>
        <el-table-column
          prop="dye_lot_no"
          :label="t('flowCards.materials.colDyeLotNo')"
          width="110"
        >
          <template #default="{ row }">{{ row.dye_lot_no || '-' }}</template>
        </el-table-column>
        <el-table-column prop="grade" :label="t('flowCards.materials.colGrade')" width="100">
          <template #default="{ row }">{{ gradeText(row.grade) }}</template>
        </el-table-column>
        <el-table-column prop="quantity" :label="t('flowCards.materials.colQuantity')" width="110">
          <template #default="{ row }">{{ row.quantity }}</template>
        </el-table-column>
        <el-table-column prop="unit" :label="t('flowCards.materials.colUnit')" width="80">
          <template #default="{ row }">{{ unitText(row.unit) }}</template>
        </el-table-column>
        <el-table-column
          prop="remark"
          :label="t('flowCards.materials.colRemark')"
          min-width="120"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ row.remark || '-' }}</template>
        </el-table-column>
        <el-table-column :label="t('common.operation')" width="150" fixed="right">
          <template #default="{ row }">
            <el-button
              v-permission="PERMISSIONS.FLOW_CARD_UPDATE"
              size="small"
              link
              type="primary"
              @click="openMaterialEdit(row)"
            >
              {{ t('common.edit') }}
            </el-button>
            <el-button
              v-permission="PERMISSIONS.FLOW_CARD_DELETE"
              size="small"
              link
              type="danger"
              @click="handleMaterialDelete(row)"
            >
              {{ t('common.delete') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="materialDialogVisible"
      :title="
        materialEditId === null
          ? t('flowCards.materials.titleCreate')
          : t('flowCards.materials.titleEdit')
      "
      width="640px"
      @closed="resetMaterialForm"
    >
      <el-form
        ref="materialFormRef"
        :model="materialForm"
        :rules="materialFormRules"
        label-width="110px"
      >
        <el-form-item :label="t('flowCards.materials.labelWarehouse')" prop="warehouse_id">
          <el-select
            v-model="materialForm.warehouse_id"
            filterable
            remote
            clearable
            :remote-show-suffix="true"
            :loading="warehouseLoading"
            :remote-method="searchWarehouses"
            :placeholder="t('flowCards.materials.placeholderSearchWarehouse')"
            :no-data-text="t('flowCards.picker.noData')"
            style="width: 100%"
            @change="onWarehouseChange"
          >
            <el-option
              v-for="item in warehouseOptions"
              :key="item.id"
              :label="item.label"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('flowCards.materials.labelMaterial')" prop="material_id">
          <el-select
            v-model="materialForm.material_id"
            filterable
            remote
            clearable
            :remote-show-suffix="true"
            :loading="yarnLoading"
            :remote-method="searchYarns"
            :placeholder="t('flowCards.materials.placeholderSearchYarn')"
            :no-data-text="t('flowCards.picker.noData')"
            style="width: 100%"
            @change="onYarnChange"
          >
            <el-option
              v-for="item in yarnOptions"
              :key="item.id"
              :label="item.label"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('flowCards.materials.colMaterialNo')">
          <!-- 纱编号与纱名由所选纱线源数据带出，只读展示，不落库副本 -->
          <el-input :model-value="materialDisplay.material_no" disabled style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('flowCards.materials.colMaterialName')">
          <el-input :model-value="materialDisplay.material_name" disabled style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('flowCards.materials.colBatchNo')" prop="batch_no">
          <el-input
            v-model="materialForm.batch_no"
            :placeholder="t('flowCards.materials.placeholderOptional')"
            clearable
          />
        </el-form-item>
        <el-form-item :label="t('flowCards.materials.colColorNo')" prop="color_no">
          <el-input
            v-model="materialForm.color_no"
            :placeholder="t('flowCards.materials.placeholderOptional')"
            clearable
          />
        </el-form-item>
        <el-form-item :label="t('flowCards.materials.colDyeLotNo')" prop="dye_lot_no">
          <el-input
            v-model="materialForm.dye_lot_no"
            :placeholder="t('flowCards.materials.placeholderOptional')"
            clearable
          />
        </el-form-item>
        <el-form-item :label="t('flowCards.materials.colGrade')" prop="grade">
          <!-- 等级词表唯一来源 constants/stock-grade.ts（一等品/二等品/等外品），value 为落库中文真相 -->
          <el-select
            v-model="materialForm.grade"
            clearable
            :placeholder="t('flowCards.materials.placeholderGrade')"
            style="width: 100%"
          >
            <el-option
              v-for="g in STOCK_GRADE_VALUES"
              :key="g"
              :label="t(STOCK_GRADE_LABEL_KEY[g])"
              :value="g"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('flowCards.materials.colQuantity')" prop="quantity">
          <!-- 数量手写录入（禁步进控件），>0 与 4 位小数由校验器把关，非法值不发请求 -->
          <el-input v-model="materialForm.quantity" inputmode="decimal" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('flowCards.materials.colUnit')" prop="unit">
          <el-select v-model="materialForm.unit" style="width: 100%">
            <el-option
              v-for="u in MATERIAL_UNIT_VALUES"
              :key="u"
              :label="t(MATERIAL_UNIT_LABEL_KEY[u])"
              :value="u"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('flowCards.materials.colRemark')" prop="remark">
          <el-input v-model="materialForm.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="materialDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="materialSubmitLoading" @click="submitMaterial">
          {{ t('flowCards.index.buttonConfirm') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { isDialogDismissal } from '@/utils/monitor';
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { numberInputRules, numericView, parseNumberText } from '@/utils/number-input';
import { useI18n } from 'vue-i18n';
import { getProductionOrderList, type ProductionOrder } from '@/api/production';
import { logAuxLoadFailure, logger } from '@/utils/logger';
import { msg } from '@/utils/message';
import { PERMISSIONS } from '@/constants/permissions';
import {
  MATERIAL_UNIT,
  MATERIAL_UNIT_VALUES,
  MATERIAL_UNIT_LABEL_KEY,
  isMaterialUnit,
} from '@/constants/yarn-input-unit';
import { STOCK_GRADE_VALUES, STOCK_GRADE_LABEL_KEY } from '@/constants/stock-grade';
import { getProductById, getProductList, type Product } from '@/api/product';
import { getWarehouseById, getWarehouseList } from '@/api/warehouse';
import {
  useGreigePicker,
  PICKER_PAGE_SIZE,
  type PickerOption,
} from '@/views/greige-fabrics/useGreigePicker';
import {
  getFlowCardList,
  createFlowCard,
  deleteFlowCard,
  scheduleFlowCard,
  startPreparing,
  completePreparing,
  startDyeing,
  completeDyeing,
  startInspecting,
  completeFlowCard,
  shipFlowCard,
  terminateFlowCard,
  reactivateFlowCard,
  listFlowCardMaterials,
  createFlowCardMaterial,
  getFlowCardMaterial,
  updateFlowCardMaterial,
  deleteFlowCardMaterial,
  type FlowCard,
  type FlowCardStatus,
  type FlowCardMaterialView,
  type UpdateFlowCardMaterialPayload,
} from '@/api/flow-card';

const { t } = useI18n({ useScope: 'global' });

const statusTextMap: Record<FlowCardStatus, string> = {
  pending: t('flowCards.index.statusPending'),
  scheduled: t('flowCards.index.statusScheduled'),
  preparing: t('flowCards.index.statusPreparing'),
  dyeing: t('flowCards.index.statusDyeing'),
  dyed: t('flowCards.index.statusDyed'),
  inspecting: t('flowCards.index.statusInspecting'),
  completed: t('flowCards.index.statusCompleted'),
  shipped: t('flowCards.index.statusShipped'),
  terminated: t('flowCards.index.statusTerminated'),
};

const statusTagMap: Record<FlowCardStatus, 'info' | 'warning' | 'primary' | 'success' | 'danger'> =
  {
    pending: 'info',
    scheduled: 'warning',
    preparing: 'warning',
    dyeing: 'primary',
    dyed: 'primary',
    inspecting: 'warning',
    completed: 'success',
    shipped: 'success',
    terminated: 'danger',
  };

interface StatusAction {
  key: string;
  label: string;
  danger?: boolean;
}

/** 按后端状态机（validate_status_transition）生成下一步操作 */
const nextActionMap: Partial<Record<FlowCardStatus, StatusAction[]>> = {
  pending: [
    { key: 'schedule', label: t('flowCards.index.buttonSchedule') },
    { key: 'terminate', label: t('flowCards.index.buttonTerminate'), danger: true },
  ],
  scheduled: [
    { key: 'start-preparing', label: t('flowCards.index.buttonStartPreparing') },
    { key: 'terminate', label: t('flowCards.index.buttonTerminate'), danger: true },
  ],
  preparing: [
    { key: 'complete-preparing', label: t('flowCards.index.buttonCompletePreparing') },
    { key: 'start-dyeing', label: t('flowCards.index.buttonStartDyeing') },
    { key: 'terminate', label: t('flowCards.index.buttonTerminate'), danger: true },
  ],
  dyeing: [
    { key: 'complete-dyeing', label: t('flowCards.index.buttonCompleteDyeing') },
    { key: 'terminate', label: t('flowCards.index.buttonTerminate'), danger: true },
  ],
  dyed: [{ key: 'start-inspecting', label: t('flowCards.index.buttonStartInspecting') }],
  inspecting: [{ key: 'complete', label: t('flowCards.index.buttonCompleteInspecting') }],
  completed: [{ key: 'ship', label: t('flowCards.index.buttonShip') }],
  terminated: [{ key: 'reactivate', label: t('flowCards.index.buttonReactivate') }],
};

const actionRunners: Record<string, (id: number) => Promise<unknown>> = {
  schedule: (id: number) => scheduleFlowCard(id),
  'start-preparing': (id: number) => startPreparing(id),
  'start-dyeing': (id: number) => startDyeing(id),
  'complete-dyeing': (id: number) => completeDyeing(id),
  'start-inspecting': (id: number) => startInspecting(id),
  complete: (id: number) => completeFlowCard(id),
  ship: (id: number) => shipFlowCard(id),
  reactivate: (id: number) => reactivateFlowCard(id),
};

const loading = ref(false);
const submitLoading = ref(false);
const cardList = ref<FlowCard[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const queryStatus = ref('');
const createVisible = ref(false);
const detailVisible = ref(false);
const detailRow = ref<FlowCard | null>(null);
const formRef = ref<FormInstance>();

// 计划克重为手写文本模型（空串=未填），提交前显式 Number() 归一为契约数值；
// product_id 由所选生产订单带出保持数值模型，只读展示经 numericView 归一
const formData = reactive<{
  production_order_id: number | undefined;
  product_id: number | undefined;
  product_name: string;
  color_no: string;
  planned_fabric_weight: string;
  dyeing_requirements: string;
}>({
  production_order_id: undefined,
  product_id: undefined,
  product_name: '',
  color_no: '',
  planned_fabric_weight: '',
  dyeing_requirements: '',
});

/** 手写文本模型转契约数值：空串回 undefined（可选键省略=不采集） */
const numOpt = (text: string): number | undefined =>
  text.trim() === '' ? undefined : Number(text);

const formRules: FormRules = {
  production_order_id: [
    {
      required: true,
      message: t('flowCards.index.ruleProductionOrderIdRequired'),
      trigger: 'change',
    },
  ],
  // 范围与精度靠校验器（numberInputRules 单源），不靠步进按钮
  planned_fabric_weight: numberInputRules({
    label: t('flowCards.index.colPlannedWeight'),
    min: 0,
    precision: 2,
  }),
};

// 新建流转卡必须挂在真实生产订单上，选择订单即带出它的产品，避免手填对不上的 ID。
const orderOptions = ref<ProductionOrder[]>([]);
const orderQuery = ref('');

const visibleOrderOptions = computed(() => {
  const q = orderQuery.value.trim().toLowerCase();
  if (!q) return orderOptions.value;
  return orderOptions.value.filter(o => {
    const name = (o.product_name ?? '').toLowerCase();
    return o.order_no.toLowerCase().includes(q) || String(o.id).startsWith(q) || name.includes(q);
  });
});

const orderLabel = (o: ProductionOrder): string =>
  o.product_name ? `${o.order_no}（${o.product_name}）` : o.order_no;

const filterOrderOptions = (query: string) => {
  orderQuery.value = query;
};

const onProductionOrderChange = (id: number | undefined) => {
  if (!id) {
    formData.product_id = undefined;
    formData.product_name = '';
    return;
  }
  const order = orderOptions.value.find(o => o.id === id);
  if (order) {
    formData.product_id = order.product_id;
    formData.product_name = order.product_name ?? '';
  }
};

const loadOrderOptions = async () => {
  try {
    const res = await getProductionOrderList({ page: 1, page_size: 500 });
    orderOptions.value = res.data.items;
  } catch (error) {
    logAuxLoadFailure(t('flowCards.index.messageFetchOrdersFailed'), error);
  }
};

/** 响应解包防御：兼容数组 / { items } 分页包装，避免 el-table "r is not iterable" */
const unwrapList = (payload: unknown): FlowCard[] => {
  if (Array.isArray(payload)) return payload;
  const paged = payload as { items?: FlowCard[] } | null;
  return paged?.items ?? [];
};

const loadList = async () => {
  loading.value = true;
  try {
    const res = await getFlowCardList({
      page: page.value,
      page_size: pageSize.value,
      status: queryStatus.value || undefined,
    });
    cardList.value = unwrapList(res.data);
    total.value =
      res.data && !Array.isArray(res.data) ? (res.data.total ?? 0) : cardList.value.length;
  } catch {
    ElMessage.error(t('flowCards.index.messageFetchListFailed'));
  } finally {
    loading.value = false;
  }
};

const handleFilter = () => {
  page.value = 1;
  loadList();
};

const getNextActions = (row: FlowCard): StatusAction[] =>
  nextActionMap[row.status as FlowCardStatus] ?? [];

const runAction = async (action: StatusAction, row: FlowCard) => {
  try {
    if (action.key === 'terminate') {
      const { value } = await ElMessageBox.prompt(
        t('flowCards.index.messageTerminatePrompt', { no: row.card_no }),
        t('flowCards.index.titleTerminateConfirm'),
        {
          confirmButtonText: t('flowCards.index.buttonConfirmTerminate'),
          cancelButtonText: t('common.cancel'),
          inputPlaceholder: t('flowCards.index.placeholderTerminateReason'),
        }
      );
      await terminateFlowCard(row.id, { reason: value || undefined });
    } else if (action.key === 'complete-preparing') {
      const { value } = await ElMessageBox.prompt(
        t('flowCards.index.messageCompletePreparingPrompt', { no: row.card_no }),
        t('flowCards.index.buttonCompletePreparing'),
        {
          confirmButtonText: t('common.confirm'),
          cancelButtonText: t('common.cancel'),
          inputPlaceholder: t('flowCards.index.placeholderActualWeightInput'),
          inputPattern: /^\d+(\.\d{1,2})?$/,
          inputErrorMessage: t('flowCards.index.messageInvalidWeight'),
        }
      );
      await completePreparing(row.id, { actual_fabric_weight: Number(value) });
    } else {
      await ElMessageBox.confirm(
        t('flowCards.index.messageConfirmAction', { no: row.card_no, action: action.label }),
        t('flowCards.index.titleActionConfirm'),
        {
          confirmButtonText: t('common.confirm'),
          cancelButtonText: t('common.cancel'),
          type: 'warning',
        }
      );
      await actionRunners[action.key](row.id);
    }
    ElMessage.success(t('flowCards.index.messageOperationSuccess', { action: action.label }));
    await loadList();
  } catch (error) {
    if (isDialogDismissal(error)) return;
    ElMessage.error(t('flowCards.index.messageOperationFailed', { action: action.label }));
  }
};

const handleCreate = () => {
  loadOrderOptions();
  createVisible.value = true;
};

const resetForm = () => {
  formData.production_order_id = undefined;
  formData.product_id = undefined;
  formData.product_name = '';
  formData.color_no = '';
  formData.planned_fabric_weight = '';
  formData.dyeing_requirements = '';
  orderQuery.value = '';
  formRef.value?.resetFields();
};

const handleDetail = (row: FlowCard) => {
  detailRow.value = row;
  detailVisible.value = true;
};

const submitCreate = async () => {
  if (!formRef.value) return;
  await formRef.value.validate(async valid => {
    if (!valid) return;
    if (!formData.production_order_id) return;
    submitLoading.value = true;
    try {
      await createFlowCard({
        production_order_id: formData.production_order_id,
        product_id: formData.product_id,
        product_name: formData.product_name || undefined,
        color_no: formData.color_no || undefined,
        planned_fabric_weight: numOpt(formData.planned_fabric_weight),
        dyeing_requirements: formData.dyeing_requirements || undefined,
      });
      ElMessage.success(t('flowCards.index.messageCreateSuccess'));
      createVisible.value = false;
      await loadList();
    } catch {
      ElMessage.error(t('flowCards.index.messageCreateFailed'));
    } finally {
      submitLoading.value = false;
    }
  });
};

const handleDelete = async (row: FlowCard) => {
  try {
    await ElMessageBox.confirm(
      t('flowCards.index.messageDeleteConfirm', { no: row.card_no }),
      t('flowCards.index.titleDeleteConfirm'),
      {
        confirmButtonText: t('flowCards.index.buttonConfirmDelete'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
      }
    );
    await deleteFlowCard(row.id);
    ElMessage.success(t('common.message.deleteSuccess'));
    await loadList();
  } catch (error) {
    if (isDialogDismissal(error)) return;
    ElMessage.error(t('flowCards.index.messageDeleteFailed'));
  }
};

const canDelete = (row: FlowCard): boolean =>
  row.status === 'pending' || row.status === 'terminated';

// ============================ 投纱明细面板 ============================
/**
 * 投纱行承载纱批事实（什么纱／编号／批次），读写面均按卡进行；
 * 端点契约与信封形状逐字段对齐 handlers/flow_card_material_handler.rs（列出为裸数组 data，
 * 写面回传实体行）。展示不含任何成本列：投纱表没有 unit_cost/total_cost，成本唯一真源不在这里。
 */
const selectedCard = ref<FlowCard | null>(null);
const materialList = ref<FlowCardMaterialView[]>([]);
const materialsLoading = ref(false);
/** 请求序号：换卡后旧卡的迟到响应一律丢弃，不得覆盖新卡列表（竞态防线，与实体选择器同判据） */
let materialsSeq = 0;

const materialDialogVisible = ref(false);
const materialSubmitLoading = ref(false);
const materialFormRef = ref<FormInstance>();
/** null 即建单态；非 null 为被编辑行的主键（PUT/DELETE 与单行回读都用它） */
const materialEditId = ref<number | null>(null);

const materialForm = reactive<{
  warehouse_id: number | undefined;
  material_id: number | undefined;
  batch_no: string;
  color_no: string;
  dye_lot_no: string;
  grade: string;
  quantity: string;
  unit: string;
  remark: string;
}>({
  warehouse_id: undefined,
  material_id: undefined,
  batch_no: '',
  color_no: '',
  dye_lot_no: '',
  grade: '',
  quantity: '',
  // 单位默认取受控词表常量本身（后端 UNIT_KG/UNIT_METER 同值），不是手抄字面量
  unit: MATERIAL_UNIT.kilogram,
  remark: '',
});

/** 选纱带出的只读展示（不落库副本，来自产品档案源数据） */
const materialDisplay = reactive({ material_no: '', material_name: '' });

const materialFormRules = computed<FormRules>(() => ({
  warehouse_id: [
    { required: true, message: t('flowCards.materials.ruleWarehouseRequired'), trigger: 'change' },
  ],
  material_id: [
    { required: true, message: t('flowCards.materials.ruleMaterialRequired'), trigger: 'change' },
  ],
  quantity: numberInputRules({
    label: t('flowCards.materials.colQuantity'),
    required: true,
    positive: true,
    precision: 4,
  }),
  unit: [{ required: true, message: t('flowCards.materials.ruleUnitRequired'), trigger: 'change' }],
}));

/** 纱线主键 → 编号与名称的带出缓存：搜索命中即记录，供只读展示回查，不伪造名称 */
const yarnInfoCache = new Map<number, { code: string; name: string }>();
function cacheYarnInfo(items: Product[]): void {
  for (const item of items) {
    yarnInfoCache.set(item.id, { code: item.product_code, name: item.product_name });
  }
}

const yarnPicker = useGreigePicker(
  async (keyword): Promise<PickerOption[]> => {
    const res = await getProductList({ search: keyword, page: 1, page_size: PICKER_PAGE_SIZE });
    const items = res.data.items;
    cacheYarnInfo(items);
    return items.map(item => ({
      id: item.id,
      label: `${item.product_name}（${item.product_code}）`,
    }));
  },
  async (id): Promise<PickerOption | null> => {
    const res = await getProductById(id);
    const row = res.data;
    if (!row) return null;
    cacheYarnInfo([row]);
    return { id, label: `${row.product_name}（${row.product_code}）` };
  }
);
const {
  options: yarnOptions,
  loading: yarnLoading,
  search: searchYarns,
  syncPinned: syncYarnPinned,
  restore: restoreYarn,
  reset: resetYarnPicker,
} = yarnPicker;

const warehousePicker = useGreigePicker(
  async (keyword): Promise<PickerOption[]> => {
    const res = await getWarehouseList({
      search: keyword,
      page: 1,
      page_size: PICKER_PAGE_SIZE,
    });
    return res.data.items.map(item => ({
      id: item.id,
      label: `${item.warehouse_name}（${item.warehouse_code}）`,
    }));
  },
  async (id): Promise<PickerOption | null> => {
    const res = await getWarehouseById(id);
    const row = res.data;
    if (!row) return null;
    return { id, label: `${row.warehouse_name}（${row.warehouse_code}）` };
  }
);
const {
  options: warehouseOptions,
  loading: warehouseLoading,
  search: searchWarehouses,
  syncPinned: syncWarehousePinned,
  restore: restoreWarehouse,
  reset: resetWarehousePicker,
} = warehousePicker;

/** 选纱即从源数据带出编号与名称；缓存取不到属状态异常，记警告留空展示，不造名 */
function onYarnChange(value: unknown): void {
  syncYarnPinned(typeof value === 'number' ? value : undefined);
  if (typeof value !== 'number') {
    materialDisplay.material_no = '';
    materialDisplay.material_name = '';
    return;
  }
  const info = yarnInfoCache.get(value);
  if (!info) {
    logger.warn('[flowCards] 选中纱线不在带出缓存，编号与名称无法从源数据取回', { id: value });
    materialDisplay.material_no = '';
    materialDisplay.material_name = '';
    return;
  }
  materialDisplay.material_no = info.code;
  materialDisplay.material_name = info.name;
}

function onWarehouseChange(value: unknown): void {
  syncWarehousePinned(typeof value === 'number' ? value : undefined);
}

function gradeText(grade: string): string {
  if (grade === '') return t('flowCards.materials.gradeNone');
  const labelKey = STOCK_GRADE_LABEL_KEY[grade];
  return labelKey ? t(labelKey) : grade;
}

function unitText(unit: string): string {
  return isMaterialUnit(unit) ? t(MATERIAL_UNIT_LABEL_KEY[unit]) : unit;
}

async function loadMaterials(flowCardId: number): Promise<void> {
  const seq = ++materialsSeq;
  materialsLoading.value = true;
  try {
    const res = await listFlowCardMaterials(flowCardId);
    if (seq !== materialsSeq) return;
    materialList.value = res.data;
  } catch (error) {
    if (seq !== materialsSeq) return;
    materialList.value = [];
    logAuxLoadFailure(t('flowCards.materials.messageFetchFailed'), error);
    msg.error('loadFailed');
  } finally {
    if (seq === materialsSeq) materialsLoading.value = false;
  }
}

function openMaterials(row: FlowCard): void {
  selectedCard.value = row;
  loadMaterials(row.id);
}

function closeMaterials(): void {
  materialsSeq += 1;
  selectedCard.value = null;
  materialList.value = [];
}

function openMaterialCreate(): void {
  materialEditId.value = null;
  materialDialogVisible.value = true;
}

/** 编辑先按主键回读单行（PUT 是整行覆盖语义，必须拿最新落库值作底），取不到不开弹窗 */
async function openMaterialEdit(row: FlowCardMaterialView): Promise<void> {
  try {
    const res = await getFlowCardMaterial(row.id);
    const latest = res.data;
    materialEditId.value = latest.id;
    materialForm.warehouse_id = latest.warehouse_id;
    materialForm.material_id = latest.material_id;
    materialForm.batch_no = latest.batch_no;
    materialForm.color_no = latest.color_no;
    materialForm.dye_lot_no = latest.dye_lot_no ?? '';
    materialForm.grade = latest.grade;
    materialForm.quantity = String(latest.quantity);
    materialForm.unit = latest.unit;
    materialForm.remark = latest.remark ?? '';
    // 编号与名称的展示真源取列表富化行（实体回传体不含这两键），主键一致才可用
    materialDisplay.material_no = row.material_no ?? '';
    materialDisplay.material_name = row.material_name ?? '';
    materialDialogVisible.value = true;
    void restoreYarn(latest.material_id);
    void restoreWarehouse(latest.warehouse_id);
  } catch (error) {
    logAuxLoadFailure(t('flowCards.materials.messageFetchFailed'), error);
    msg.error('loadFailed');
  }
}

/** 弹窗关闭即复位表单与选择器，避免跨行串候选；由 @closed 触发，不在提交成功路径里抢跑 */
function resetMaterialForm(): void {
  materialEditId.value = null;
  materialForm.warehouse_id = undefined;
  materialForm.material_id = undefined;
  materialForm.batch_no = '';
  materialForm.color_no = '';
  materialForm.dye_lot_no = '';
  materialForm.grade = '';
  materialForm.quantity = '';
  materialForm.unit = MATERIAL_UNIT.kilogram;
  materialForm.remark = '';
  materialDisplay.material_no = '';
  materialDisplay.material_name = '';
  resetYarnPicker();
  resetWarehousePicker();
  materialFormRef.value?.clearValidate();
}

/**
 * 表单控件态到契约值的显式映射：后端对 batch_no/color_no/grade 用空串表达"无"，
 * 对 dye_lot_no/remark 用 null 表达"无"；清空控件回 undefined 一律映射为对应"无"值，
 * 这是词表换算不是兜底掩盖（数量除外：非法值在 rules 判负，根本走不到发请求）。
 * 返回值是更新契约的键集；新增契约只多一个 flow_card_id，由建单分支在调用点补上。
 */
function buildMaterialPayload(): UpdateFlowCardMaterialPayload {
  return {
    warehouse_id: materialForm.warehouse_id as number,
    material_id: materialForm.material_id as number,
    batch_no: materialForm.batch_no.trim(),
    color_no: materialForm.color_no.trim(),
    dye_lot_no: materialForm.dye_lot_no.trim() === '' ? null : materialForm.dye_lot_no.trim(),
    grade: typeof materialForm.grade === 'string' ? materialForm.grade : '',
    quantity: parseNumberText(materialForm.quantity.trim()) as number,
    unit: materialForm.unit,
    remark: materialForm.remark.trim() === '' ? null : materialForm.remark.trim(),
  };
}

async function submitMaterial(): Promise<void> {
  if (!materialFormRef.value || !selectedCard.value) return;
  const valid = await materialFormRef.value.validate().catch(() => false);
  if (!valid) return;
  const card = selectedCard.value;
  const quantity = parseNumberText(materialForm.quantity.trim());
  // 校验器判负以外的最后一道门：主键与数量必须是真实取到的值才发请求
  if (quantity === undefined || quantity <= 0) return;
  materialSubmitLoading.value = true;
  try {
    if (materialEditId.value === null) {
      await createFlowCardMaterial({ flow_card_id: card.id, ...buildMaterialPayload() });
      msg.createOk();
    } else {
      await updateFlowCardMaterial(materialEditId.value, buildMaterialPayload());
      msg.updateOk();
    }
    // 成功返回后才关弹窗并重拉列表（刷新即回读真实落库结果，不本地拼数组）
    materialDialogVisible.value = false;
    await loadMaterials(card.id);
  } catch (error) {
    logger.error('[flowCards] 投纱明细保存失败', error);
    if (materialEditId.value === null) msg.createFail();
    else msg.updateFail();
  } finally {
    materialSubmitLoading.value = false;
  }
}

async function handleMaterialDelete(row: FlowCardMaterialView): Promise<void> {
  if (!selectedCard.value) return;
  const target = row.material_name || row.material_no || String(row.id);
  try {
    await ElMessageBox.confirm(
      t('flowCards.materials.confirmDelete', { target }),
      t('flowCards.index.titleDeleteConfirm'),
      {
        confirmButtonText: t('flowCards.index.buttonConfirmDelete'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
      }
    );
    await deleteFlowCardMaterial(row.id);
    msg.deleteOk();
    await loadMaterials(selectedCard.value.id);
  } catch (error) {
    if (isDialogDismissal(error)) return;
    logger.error('[flowCards] 投纱明细作废失败', error);
    msg.deleteFail();
  }
}

onMounted(() => {
  loadList();
});
</script>

<style scoped>
.flow-cards-page {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.page-header h2 {
  margin: 0;
  font-size: 18px;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}
</style>
