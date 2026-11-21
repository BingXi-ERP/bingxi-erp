<!--
  crm/pool.vue - 客户公海池主入口
  拆分：tabs/ClaimDialogTab.vue / tabs/TransferDialogTab.vue / tabs/ReleaseDialogTab.vue
  本主入口承担：列表 + 工具栏 + 公共样式。
-->
<template>
  <div class="pool-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">{{ t('crmPool.title') }}</h1>
        <el-breadcrumb separator="/">
          <el-breadcrumb-item :to="{ path: '/' }">{{
            t('crmPool.breadcrumb.home')
          }}</el-breadcrumb-item>
          <el-breadcrumb-item>{{ t('crmPool.breadcrumb.crm') }}</el-breadcrumb-item>
          <el-breadcrumb-item>{{ t('crmPool.breadcrumb.pool') }}</el-breadcrumb-item>
        </el-breadcrumb>
      </div>
      <div class="header-actions">
        <el-button type="primary" :loading="claiming" @click="handleClaimSelected">
          <el-icon><Plus /></el-icon>
          {{ t('crmPool.batchClaim') }}
        </el-button>
        <el-button @click="router.push('/customer')">
          <el-icon><Back /></el-icon>
          {{ t('crmPool.back') }}
        </el-button>
      </div>
    </div>

    <el-card shadow="hover" class="filter-card">
      <el-form
        :inline="true"
        :model="queryParams"
        class="filter-form"
        :aria-label="t('crmPool.filter.ariaLabel')"
      >
        <el-form-item :label="t('crmPool.filter.keyword')">
          <el-input
            v-model="queryParams.keyword"
            :placeholder="t('crmPool.filter.keywordPlaceholder')"
            clearable
            @clear="handleQuery"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('crmPool.filter.customerType')">
          <el-select
            v-model="queryParams.customer_type"
            :placeholder="t('crmPool.filter.customerTypePlaceholder')"
            clearable
            @change="handleQuery"
          >
            <!-- 公海列表行的 customer_type 显示/筛选线：value 取后端渠道词表
                 constants::customer_type::ALLOWED 五值。分层词 normal/vip 不属本列。
                 ⚠️ 公海规则(rule scope)的 all/wholesale/retail/vip 是另一套词表
                 （crm_pool_handler 规则作用域），本批不动。 -->
            <el-option :label="t('crmPool.customerType.retail')" value="retail" />
            <el-option :label="t('crmPool.customerType.wholesale')" value="wholesale" />
            <el-option :label="t('crmPool.customerType.distributor')" value="distributor" />
            <el-option :label="t('crmPool.customerType.manufacturer')" value="manufacturer" />
            <el-option :label="t('crmPool.customerType.other')" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('crmPool.filter.daysInPool')">
          <el-select
            v-model="queryParams.daysInPool"
            :placeholder="t('crmPool.filter.daysInPoolPlaceholder')"
            clearable
            @change="handleQuery"
          >
            <el-option :label="t('crmPool.filter.daysWithinWeek')" value="7" />
            <el-option :label="t('crmPool.filter.daysWithinMonth')" value="30" />
            <el-option :label="t('crmPool.filter.daysWithinQuarter')" value="90" />
            <el-option :label="t('crmPool.filter.daysOverQuarter')" value="91" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleQuery">
            <el-icon><Search /></el-icon>
            {{ t('crmPool.filter.query') }}
          </el-button>
          <el-button @click="handleReset">
            <el-icon><Refresh /></el-icon>
            {{ t('crmPool.filter.reset') }}
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="hover" class="table-card">
      <!-- 手机端：单列卡片，字段与动作与桌面表格等价 -->
      <section v-if="isPhone" v-loading="loading" class="pool-mobile">
        <ul class="card-list" :aria-label="t('crmPool.table.ariaLabel')">
          <li v-for="(row, index) in poolList" :key="row.id ?? index" class="card-item">
            <dl class="card-fields">
              <div class="field field-emphasis">
                <dt>{{ t('crmPool.table.customerName') }}</dt>
                <dd>{{ row.customer_name }}</dd>
              </div>
              <div class="field">
                <dt>{{ t('crmPool.table.contactPerson') }}</dt>
                <dd>{{ row.contact_person }}</dd>
              </div>
              <div class="field">
                <dt>{{ t('crmPool.table.phone') }}</dt>
                <dd>{{ row.phone }}</dd>
              </div>
              <div class="field">
                <dt>{{ t('crmPool.table.type') }}</dt>
                <dd>
                  <el-tag :type="getCustomerTypeTag(row.customer_type)" size="small">
                    {{ getCustomerTypeLabel(row.customer_type) }}
                  </el-tag>
                </dd>
              </div>
              <div class="field">
                <dt>{{ t('crmPool.table.releasedAt') }}</dt>
                <dd>{{ row.released_at }}</dd>
              </div>
              <div class="field">
                <dt>{{ t('crmPool.table.releasedBy') }}</dt>
                <dd>{{ row.released_by_name }}</dd>
              </div>
              <div class="field">
                <dt>{{ t('crmPool.table.daysInPool') }}</dt>
                <dd>
                  <el-tag :type="getDaysTag(row.days_in_pool)" size="small">
                    {{ row.days_in_pool }} {{ t('crmPool.table.daysUnit') }}
                  </el-tag>
                </dd>
              </div>
              <div class="field">
                <dt>{{ t('crmPool.table.releaseReason') }}</dt>
                <dd>{{ row.release_reason }}</dd>
              </div>
            </dl>
            <div class="card-actions">
              <el-button type="primary" plain @click="openClaimDialog(row)">
                {{ t('crmPool.table.claim') }}
              </el-button>
              <el-button @click="openTransferDialog(row)">
                {{ t('crmPool.table.transfer') }}
              </el-button>
              <el-button
                v-if="row.previous_owner_id"
                type="warning"
                @click="openReleaseDialog(row)"
              >
                {{ t('crmPool.table.release') }}
              </el-button>
            </div>
          </li>
        </ul>
        <div class="pagination-container">
          <el-pagination
            v-model:current-page="page"
            v-model:page-size="pageSize"
            :page-sizes="[10, 20, 50, 100]"
            :total="total"
            layout="total, sizes, prev, next"
            :aria-label="t('crmPool.table.paginationAriaLabel')"
            @size-change="handleSizeChange"
            @current-change="handleCurrentChange"
          />
        </div>
      </section>

      <el-table
        v-if="!isPhone"
        v-loading="loading"
        :data="poolList"
        border
        stripe
        :aria-label="t('crmPool.table.ariaLabel')"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" align="center" />
        <el-table-column type="index" :label="t('crmPool.table.index')" width="60" align="center" />
        <el-table-column
          prop="customer_name"
          :label="t('crmPool.table.customerName')"
          min-width="150"
          show-overflow-tooltip
        />
        <el-table-column
          prop="contact_person"
          :label="t('crmPool.table.contactPerson')"
          width="100"
          show-overflow-tooltip
        />
        <el-table-column
          prop="phone"
          :label="t('crmPool.table.phone')"
          width="120"
          show-overflow-tooltip
        />
        <el-table-column
          prop="customer_type"
          :label="t('crmPool.table.type')"
          width="100"
          align="center"
        >
          <template #default="{ row }">
            <el-tag :type="getCustomerTypeTag(row.customer_type)" size="small">
              {{ getCustomerTypeLabel(row.customer_type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="released_at"
          :label="t('crmPool.table.releasedAt')"
          width="160"
          align="center"
        />
        <el-table-column
          prop="released_by_name"
          :label="t('crmPool.table.releasedBy')"
          width="100"
          show-overflow-tooltip
        />
        <el-table-column
          prop="days_in_pool"
          :label="t('crmPool.table.daysInPool')"
          width="100"
          align="center"
        >
          <template #default="{ row }">
            <el-tag :type="getDaysTag(row.days_in_pool)" size="small">
              {{ row.days_in_pool }} {{ t('crmPool.table.daysUnit') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="release_reason"
          :label="t('crmPool.table.releaseReason')"
          min-width="150"
          show-overflow-tooltip
        />
        <el-table-column
          :label="t('crmPool.table.operation')"
          width="240"
          align="center"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openClaimDialog(row)">{{
              t('crmPool.table.claim')
            }}</el-button>
            <el-button type="primary" link size="small" @click="openTransferDialog(row)">{{
              t('crmPool.table.transfer')
            }}</el-button>
            <el-button
              v-if="row.previous_owner_id"
              type="warning"
              link
              size="small"
              @click="openReleaseDialog(row)"
              >{{ t('crmPool.table.release') }}</el-button
            >
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-container">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          :aria-label="t('crmPool.table.paginationAriaLabel')"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>

    <ClaimDialogTab
      v-model="claimDialogVisible"
      :customer-name="currentCustomerName"
      :customer-id="currentCustomerId"
      @submitted="getList"
    />

    <TransferDialogTab
      v-model="transferDialogVisible"
      :customer-name="currentCustomerName"
      :customer-id="currentCustomerId"
      :users="users"
      @submitted="getList"
    />

    <ReleaseDialogTab
      v-model="releaseDialogVisible"
      :customer-name="currentCustomerName"
      :customer-id="currentCustomerId"
      @submitted="getList"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { isDialogDismissal, rethrowNonDismissal } from '@/utils/monitor';
import { Plus, Back, Search, Refresh } from '@element-plus/icons-vue';
import { getUserList, type User } from '@/api/user';
import { loadIfNot, createLazyLoader } from '@/utils/lazy-loader';
import { logger, logAuxLoadFailure } from '@/utils/logger';
import { type PoolCustomer } from '@/api/crm-enhanced';
import { batchClaimCustomersFromPool } from '@/api/crm-enhanced';
import { useTableApi } from '@/composables/useTableApi';
import { useBreakpoint } from '@/composables/useBreakpoint';
import ClaimDialogTab from './tabs/ClaimDialogTab.vue';
import TransferDialogTab from './tabs/TransferDialogTab.vue';
import ReleaseDialogTab from './tabs/ReleaseDialogTab.vue';

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

// 后端 list_pool 出参在 PoolCustomer 之外还带回收上下文列，桌面表格早已消费，
// 手机卡片需直接绑定这些字段，故显式扩展类型（与 crm/leads 的 LeadRow 同范式）
interface PoolRow extends PoolCustomer {
  released_at?: string;
  released_by_name?: string;
  release_reason?: string;
  previous_owner_id?: number;
}

const hasLoaded = createLazyLoader();

const router = useRouter();
const queryParams = reactive({
  keyword: '',
  customer_type: '',
  daysInPool: '',
});

// 批次 269：接入 useTableApi，消除手写分页重复 + 修复原硬编码参数 bug
const {
  data: poolList,
  loading,
  page,
  pageSize,
  total,
  refresh: getList,
  setQueryParam,
} = useTableApi<PoolRow>({
  url: '/crm/pool',
  // 后端 crm_pool_handler::list_pool 返回 json!{items,total,page,page_size}，
  // 承载列表的键为 items，显式钉住 listKey。
  listKey: 'items',
  onError: (e: unknown) => logger.warn(t('crmPool.message.loadFailed'), String(e)),
});

const users = ref<User[]>([]);

const claimDialogVisible = ref(false);
const transferDialogVisible = ref(false);
const releaseDialogVisible = ref(false);
const currentCustomerId = ref<number | null>(null);
const currentCustomerName = ref('');

const fetchUsers = async () => {
  try {
    const res = await getUserList();
    users.value = res.data.users;
  } catch (error) {
    logAuxLoadFailure(t('crmPool.message.loadUsersFailed'), error);
    users.value = [];
  }
};

const handleQuery = () => {
  setQueryParam('keyword', queryParams.keyword || undefined);
  setQueryParam('customer_type', queryParams.customer_type || undefined);
  page.value = 1;
  getList();
};

const handleReset = () => {
  queryParams.keyword = '';
  queryParams.customer_type = '';
  queryParams.daysInPool = '';
  handleQuery();
};

const openClaimDialog = (row: { id: number; customer_name: string }) => {
  currentCustomerId.value = row.id;
  currentCustomerName.value = row.customer_name;
  claimDialogVisible.value = true;
};

const openTransferDialog = (row: { id: number; customer_name: string }) => {
  currentCustomerId.value = row.id;
  currentCustomerName.value = row.customer_name;
  transferDialogVisible.value = true;
};

const openReleaseDialog = (row: { id: number; customer_name: string }) => {
  currentCustomerId.value = row.id;
  currentCustomerName.value = row.customer_name;
  releaseDialogVisible.value = true;
};

const handleClaimSelected = async () => {
  const ids = selectedRows.value.map(r => r.id);
  if (!ids.length) {
    ElMessage.info(t('crmPool.message.selectToClaim'));
    return;
  }
  try {
    await ElMessageBox.confirm(`确认认领选中的 ${ids.length} 个客户？`, t('crmPool.batchClaim'), {
      type: 'info',
    });
  } catch (error: unknown) {
    if (isDialogDismissal(error)) return;
    rethrowNonDismissal('crmPool.batchClaim', error);
  }
  claiming.value = true;
  try {
    await batchClaimCustomersFromPool(ids);
    ElMessage.success(t('crmPool.message.claimSuccess'));
    selectedRows.value = [];
    getList();
  } catch (e) {
    const err = e as { message?: string };
    ElMessage.error(err.message || t('common.failed'));
  } finally {
    claiming.value = false;
  }
};

const selectedRows = ref<Array<{ id: number; customer_name: string }>>([]);
const claiming = ref(false);

const handleSelectionChange = (rows: Array<{ id: number; customer_name: string }>) => {
  selectedRows.value = rows;
};

const handleSizeChange = (val: number) => {
  pageSize.value = val;
  page.value = 1;
};

const handleCurrentChange = (val: number) => {
  page.value = val;
};

// 公海行回读值是后端渠道 token（constants::customer_type::ALLOWED 五值），映射表按同一词表取文案；
// 未知/历史脏值不吞不造假名，回落显示原始 token。
const getCustomerTypeLabel = (type: string) => {
  const labelMap: Record<string, string> = {
    retail: t('crmPool.customerType.retail'),
    wholesale: t('crmPool.customerType.wholesale'),
    distributor: t('crmPool.customerType.distributor'),
    manufacturer: t('crmPool.customerType.manufacturer'),
    other: t('crmPool.customerType.other'),
  };
  return labelMap[type] || type;
};

// tag 颜色仅供列表视觉区分，不承载状态/层级语义。
const getCustomerTypeTag = (type: string) => {
  const typeMap: Record<string, string> = {
    retail: '',
    wholesale: 'success',
    distributor: 'warning',
    manufacturer: 'info',
    other: 'danger',
  };
  return typeMap[type] || '';
};

const getDaysTag = (days: number) => {
  if (days > 90) return 'danger';
  if (days > 30) return 'warning';
  return 'success';
};

onMounted(() => {
  loadIfNot('users', fetchUsers, hasLoaded);
});
</script>

<style scoped>
.pool-page {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.filter-card {
  margin-bottom: 20px;
}

.filter-form {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.table-card {
  margin-bottom: 20px;
}

.pagination-container {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.pool-mobile .card-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.pool-mobile .card-item {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 12px;
}

.pool-mobile .card-fields > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
}

.pool-mobile .card-fields dt {
  color: #909399;
  flex-shrink: 0;
}

.pool-mobile .card-fields dd {
  margin: 0;
  text-align: right;
  word-break: break-all;
}

.pool-mobile .field-emphasis dd {
  font-weight: 500;
}

.pool-mobile .card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #ebeef5;
}

.pool-mobile .card-actions .el-button {
  margin: 0;
}

.pool-mobile .pagination-container {
  justify-content: center;
  flex-wrap: wrap;
}
</style>
