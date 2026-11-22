<!--
  供应商商品维护页
  - 按供应商过滤 + 关键字搜索 + 分页
  - 新建/编辑供应商商品
  - 进入某商品维护其色号（list/create/update）
-->
<template>
  <div class="app-container" :aria-label="t('supplierProduct.pageAria')">
    <div class="page-header">
      <h2>{{ t('supplierProduct.title') }}</h2>
      <div class="header-actions">
        <el-button
          v-permission="PERMISSIONS.SUPPLIER_PRODUCT_CREATE"
          type="primary"
          @click="dialog.openCreate(list.queryParams.supplier_id)"
        >
          {{ t('supplierProduct.create') }}
        </el-button>
      </div>
    </div>

    <el-form :inline="!isPhone" class="filter-form">
      <el-form-item :label="t('supplierProduct.filter.supplier')">
        <el-select
          v-model="list.queryParams.supplier_id"
          clearable
          filterable
          :placeholder="t('supplierProduct.formPlaceholders.supplier')"
          style="width: 220px"
          @change="list.handleQuery()"
        >
          <el-option
            v-for="s in list.suppliers.value"
            :key="s.id"
            :label="s.supplier_name"
            :value="s.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('supplierProduct.filter.keyword')">
        <el-input
          v-model="list.queryParams.keyword"
          clearable
          :placeholder="t('supplierProduct.formPlaceholders.productCode')"
          style="width: 200px"
          @keyup.enter="list.handleQuery()"
          @clear="list.handleQuery()"
        />
      </el-form-item>
      <el-form-item>
        <el-button @click="list.handleQuery()">{{ t('common.search') }}</el-button>
        <el-button @click="list.handleReset()">{{ t('common.reset') }}</el-button>
      </el-form-item>
    </el-form>

    <!-- 手机端：供应商产品单列卡片 -->
    <section v-if="isPhone" v-loading="list.loading.value" class="supplier-product-mobile">
      <ul class="card-list" :aria-label="t('supplierProduct.columns.productName')">
        <li v-for="(row, index) in list.list.value" :key="row.id ?? index" class="card-item">
          <dl class="card-fields">
            <div class="field field-emphasis">
              <dt>{{ t('supplierProduct.columns.productName') }}</dt>
              <dd>{{ row.product_name }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('supplierProduct.columns.productCode') }}</dt>
              <dd>{{ row.product_code }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('supplierProduct.columns.unit') }}</dt>
              <dd>{{ row.unit }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('supplierProduct.columns.isEnabled') }}</dt>
              <dd>
                <el-tag v-if="row.is_enabled" type="success" size="small">{{
                  t('common.yes')
                }}</el-tag>
                <el-tag v-else type="danger" size="small">{{ t('common.no') }}</el-tag>
              </dd>
            </div>
          </dl>
          <div class="card-actions">
            <el-button
              v-permission="PERMISSIONS.SUPPLIER_PRODUCT_COLOR_READ"
              type="primary"
              @click="color.open(row)"
            >
              {{ t('supplierProduct.action.manageColors') }}
            </el-button>
            <el-button
              v-permission="PERMISSIONS.SUPPLIER_PRODUCT_UPDATE"
              @click="dialog.openEdit(row)"
            >
              {{ t('common.edit') }}
            </el-button>
            <el-button
              v-permission="PERMISSIONS.SUPPLIER_PRODUCT_UPDATE"
              @click="list.toggleEnabled(row)"
            >
              {{ row.is_enabled ? t('common.disable') : t('common.enable') }}
            </el-button>
          </div>
        </li>
      </ul>
    </section>

    <el-table
      v-if="!isPhone"
      v-loading="list.loading.value"
      :data="list.list.value"
      border
      stripe
      style="width: 100%"
    >
      <el-table-column
        prop="product_code"
        :label="t('supplierProduct.columns.productCode')"
        width="160"
      />
      <el-table-column
        prop="product_name"
        :label="t('supplierProduct.columns.productName')"
        min-width="180"
      />
      <el-table-column prop="unit" :label="t('supplierProduct.columns.unit')" width="100" />
      <el-table-column :label="t('supplierProduct.columns.isEnabled')" width="90" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.is_enabled" type="success" size="small">{{ t('common.yes') }}</el-tag>
          <el-tag v-else type="danger" size="small">{{ t('common.no') }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.operation')" width="240" fixed="right">
        <template #default="{ row }">
          <el-button
            v-permission="PERMISSIONS.SUPPLIER_PRODUCT_COLOR_READ"
            link
            type="primary"
            size="small"
            @click="color.open(row)"
          >
            {{ t('supplierProduct.action.manageColors') }}
          </el-button>
          <el-button
            v-permission="PERMISSIONS.SUPPLIER_PRODUCT_UPDATE"
            link
            type="primary"
            size="small"
            @click="dialog.openEdit(row)"
          >
            {{ t('common.edit') }}
          </el-button>
          <el-button
            v-permission="PERMISSIONS.SUPPLIER_PRODUCT_UPDATE"
            link
            size="small"
            @click="list.toggleEnabled(row)"
          >
            {{ row.is_enabled ? t('common.disable') : t('common.enable') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="list.queryParams.page"
      v-model:page-size="list.queryParams.page_size"
      :total="list.total.value"
      :page-sizes="[20, 50, 100]"
      layout="total, sizes, prev, pager, next, jumper"
      class="pagination"
      @size-change="list.handleSizeChange"
      @current-change="list.handlePageChange"
    />

    <SupplierProductFormDialog :suppliers="list.suppliers.value" />
    <SupplierProductColorDialog />
  </div>
</template>

<script setup lang="ts">
import { provide, computed } from 'vue';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { useI18n } from 'vue-i18n';
import { PERMISSIONS } from '@/constants/permissions';
import { useSupplierProductList } from './composables/useSupplierProductList';
import { useSupplierProductDialog } from './composables/useSupplierProductDialog';
import { useSupplierProductColor } from './composables/useSupplierProductColor';
import SupplierProductFormDialog from './components/SupplierProductFormDialog.vue';
import SupplierProductColorDialog from './components/SupplierProductColorDialog.vue';

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

const list = useSupplierProductList();
const dialog = useSupplierProductDialog(list.loadData);
const color = useSupplierProductColor(() => {});

provide('supplierProductDialogProc', dialog);
provide('supplierProductColorProc', color);
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.page-header h2 {
  margin: 0;
  font-size: 18px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.filter-form {
  margin-bottom: 16px;
}

.pagination {
  margin-top: 16px;
  justify-content: flex-end;
}

.supplier-product-mobile .card-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.supplier-product-mobile .card-item {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 12px;
}
.supplier-product-mobile .card-fields > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
}
.supplier-product-mobile .card-fields dt {
  color: #909399;
  flex-shrink: 0;
}
.supplier-product-mobile .card-fields dd {
  margin: 0;
  text-align: right;
  word-break: break-all;
}
.supplier-product-mobile .field-emphasis dd {
  font-weight: 500;
}
.supplier-product-mobile .card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #ebeef5;
}
.supplier-product-mobile .card-actions .el-button {
  margin: 0;
}
</style>
