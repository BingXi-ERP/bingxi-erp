<!--
  CategoryDialogTab.vue - 产品分类管理对话框
  来源：原 product/index.vue 中 分类管理弹窗
  拆分日期：2026-06-15 B3-4
  D05 Batch 8 Group B：接入 useI18n
-->
<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('product.categoryDialogTab.title')"
    :width="isPhone ? '95%' : '600px'"
    :aria-label="t('product.categoryDialogTab.ariaLabel')"
    @update:model-value="(val: boolean) => emit('update:modelValue', val)"
  >
    <div class="category-dialog-content">
      <div class="category-add-form">
        <el-input
          v-model="newCategoryName"
          :placeholder="t('product.categoryDialogTab.placeholderNewCategory')"
          style="width: 300px; margin-right: 10px"
        />
        <el-button type="primary" @click="handleAdd">
          <el-icon><Plus /></el-icon>
          {{ t('product.categoryDialogTab.buttonAddCategory') }}
        </el-button>
      </div>
      <!-- 手机端：分类单列卡片 -->
      <section v-if="isPhone" class="category-mobile">
        <ul class="card-list" :aria-label="t('product.categoryDialogTab.tableAriaLabel')">
          <li v-for="(row, index) in categories" :key="row.id ?? index" class="card-item">
            <dl class="card-fields">
              <div class="field field-emphasis">
                <dt>{{ t('product.categoryDialogTab.colId') }}</dt>
                <dd>{{ row.id }}</dd>
              </div>
              <div class="field">
                <dt>{{ t('product.categoryDialogTab.colName') }}</dt>
                <dd>{{ row.name }}</dd>
              </div>
              <div class="field">
                <dt>{{ t('product.categoryDialogTab.colDescription') }}</dt>
                <dd>{{ row.description }}</dd>
              </div>
            </dl>
            <div class="card-actions">
              <el-button type="primary" @click="handleRename(row as ProductCategory)">
                {{ t('common.edit') }}
              </el-button>
              <el-button type="danger" @click="handleDelete(row as ProductCategory)">
                {{ t('common.delete') }}
              </el-button>
            </div>
          </li>
        </ul>
      </section>

      <el-table
        v-if="!isPhone"
        v-loading="loading"
        :data="categories"
        stripe
        :aria-label="t('product.categoryDialogTab.tableAriaLabel')"
        style="margin-top: 15px"
      >
        <el-table-column prop="id" :label="t('product.categoryDialogTab.colId')" width="80" />
        <el-table-column prop="name" :label="t('product.categoryDialogTab.colName')" />
        <el-table-column
          prop="description"
          :label="t('product.categoryDialogTab.colDescription')"
        />
        <el-table-column :label="t('product.categoryDialogTab.colActions')" width="160">
          <template #default="{ row }">
            <el-button
              size="small"
              type="primary"
              link
              @click="handleRename(row as ProductCategory)"
            >
              {{ t('common.edit') }}
            </el-button>
            <el-button
              size="small"
              type="danger"
              link
              @click="handleDelete(row as ProductCategory)"
            >
              {{ t('common.delete') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { isDialogDismissal } from '@/utils/monitor';
import { computed, ref, watch } from 'vue';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import {
  getProductCategoryList,
  createProductCategory,
  deleteProductCategory,
  updateProductCategory,
  type ProductCategory,
} from '@/api/product';
import { logger } from '@/utils/logger';

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

interface Props {
  modelValue: boolean;
}

interface Emits {
  (e: 'update:modelValue', val: boolean): void;
  (e: 'changed'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const categories = ref<ProductCategory[]>([]);
const newCategoryName = ref('');
const loading = ref(false);

const fetchCategories = async () => {
  loading.value = true;
  try {
    const res = await getProductCategoryList();
    categories.value = res.data.items;
  } catch (error) {
    const err = error as Error;
    logger.error(t('product.categoryDialogTab.messageFetchFailed'), err.message);
  } finally {
    loading.value = false;
  }
};

const handleAdd = async () => {
  if (!newCategoryName.value.trim()) {
    ElMessage.warning(t('product.categoryDialogTab.messageCategoryNameRequired'));
    return;
  }
  try {
    await createProductCategory({ name: newCategoryName.value.trim() });
    ElMessage.success(t('product.categoryDialogTab.messageAddSuccess'));
    newCategoryName.value = '';
    fetchCategories();
    emit('changed');
  } catch (error) {
    const err = error as Error;
    ElMessage.error(err.message || t('product.categoryDialogTab.messageAddFailed'));
  }
};

// 重命名分类（updateProductCategory，prompt 输入新名）
const handleRename = async (row: ProductCategory) => {
  try {
    const { value } = await ElMessageBox.prompt(
      t('product.categoryDialogTab.messageRenamePrompt'),
      `${t('common.edit')} - ${row.name}`,
      {
        type: 'info',
        inputPattern: /\S+/,
        inputErrorMessage: t('product.categoryDialogTab.messageCategoryNameRequired'),
      }
    );
    await updateProductCategory(row.id, { name: value.trim() });
    ElMessage.success(t('product.categoryDialogTab.messageAddSuccess'));
    fetchCategories();
    emit('changed');
  } catch (e) {
    if (!isDialogDismissal(e)) {
      const err = e as Error;
      ElMessage.error(err.message || t('product.categoryDialogTab.messageAddFailed'));
    }
  }
};

const handleDelete = async (row: ProductCategory) => {
  try {
    await ElMessageBox.confirm(
      t('product.categoryDialogTab.messageDeleteConfirm', { name: row.name }),
      t('product.categoryDialogTab.messageDeleteTitle'),
      { type: 'warning' }
    );
    await deleteProductCategory(row.id);
    ElMessage.success(t('product.categoryDialogTab.messageDeleteSuccess'));
    fetchCategories();
    emit('changed');
  } catch (error) {
    if (!isDialogDismissal(error)) {
      const err = error as Error;
      ElMessage.error(err.message || t('product.categoryDialogTab.messageDeleteFailed'));
    }
  }
};

watch(
  () => props.modelValue,
  val => {
    if (val) {
      fetchCategories();
    }
  }
);
</script>

<style scoped>
.category-dialog-content {
  padding: 10px 0;
}
.category-add-form {
  display: flex;
  align-items: center;
}

.category-mobile .card-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.category-mobile .card-item {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 12px;
}

.category-mobile .card-fields > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
}

.category-mobile .card-fields dt {
  color: #909399;
  flex-shrink: 0;
}

.category-mobile .card-fields dd {
  margin: 0;
  text-align: right;
  word-break: break-all;
}

.category-mobile .field-emphasis dd {
  font-weight: 500;
}

.category-mobile .card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #ebeef5;
}

.category-mobile .card-actions .el-button {
  margin: 0;
}
</style>
