<script setup lang="ts">
/**
 * AdvancedRecipePanel - 工艺优化（染色配方）tab 视图组件
 * 任务编号: P13 批 1 B3 I-1（拆分 advanced/index.vue 第 4 个 tab）
 * 染色工艺参数智能推荐（A2-1）
 * 数据与函数全部由父组件通过 props 传入
 * P9-3 批次 F 重构：移除 vue/no-mutating-props 抑制，改用本地 ref 镜像 + watch 防循环
 */
import { computed, ref, watch, nextTick } from 'vue';
import NumericInput from '@/components/NumericInput.vue';
import { useI18n } from 'vue-i18n';
import { useBreakpoint } from '@/composables/useBreakpoint';
import {
  RECIPE_FABRIC_TYPE_LABEL_KEY,
  RECIPE_FABRIC_TYPE_VALUES,
} from '@/constants/recipe-fabric-type';
import type { RecipeFormData, RecipeResult } from '../composables/useRcp';

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

const props = defineProps<{
  // 工艺推荐表单（由父组件管理，子组件通过 emit('update:recipeForm') 回写）
  recipeForm: RecipeFormData;
  recipeLoading: boolean;
  recipeResult: RecipeResult | null;
  runRecipeOptimization: () => Promise<void>;
}>();

// 布类下拉：库里存的是中文布类名本身，界面文案才走 i18n
const fabricTypeOptions = computed(() =>
  RECIPE_FABRIC_TYPE_VALUES.map(value => ({
    value,
    label: t(RECIPE_FABRIC_TYPE_LABEL_KEY[value]),
  }))
);

const emit = defineEmits<{
  // 整体回写表单
  (e: 'update:recipeForm', form: RecipeFormData): void;
}>();

// 本地镜像：避免直接修改 prop 触发 vue/no-mutating-props
const localForm = ref<RecipeFormData>({ ...props.recipeForm });

// 同步标志位：防止 prop → local 与 local → emit 形成循环
let syncing = false;

// 外部 prop 变化时同步到 local
watch(
  () => props.recipeForm,
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

// 本地变化时通知父组件
watch(
  localForm,
  newForm => {
    if (syncing) return;
    syncing = true;
    emit('update:recipeForm', { ...newForm });
    nextTick(() => {
      syncing = false;
    });
  },
  { deep: true }
);

function sourceLabel(source: string): string {
  return source === 'knn'
    ? t('advancedModule.recipe.sourceKnn')
    : t('advancedModule.recipe.sourceFallback');
}
</script>

<template>
  <div class="advanced-recipe-panel" :class="{ 'advanced-recipe-panel--phone': isPhone }">
    <div class="page-header">
      <h2 class="page-title">{{ $t('advancedModule.recipe.title') }}</h2>
    </div>

    <el-row :gutter="isPhone ? 0 : 20">
      <el-col :span="isPhone ? 24 : 8">
        <el-card shadow="hover" class="mb-20">
          <template #header
            ><div class="card-header">{{ $t('advancedModule.recipe.conditions') }}</div></template
          >
          <el-form
            :model="localForm"
            label-width="100px"
            :aria-label="t('advancedModule.recipe.ariaConditions')"
          >
            <el-form-item :label="$t('advancedModule.recipe.colorNo')" required>
              <el-input
                v-model="localForm.color_no"
                :placeholder="$t('advancedModule.recipe.colorNoPlaceholder')"
              />
            </el-form-item>
            <el-form-item :label="$t('advancedModule.recipe.fabricType')" required>
              <el-select
                v-model="localForm.fabric_type"
                :placeholder="$t('advancedModule.recipe.fabricPlaceholder')"
                style="width: 100%"
              >
                <el-option
                  v-for="item in fabricTypeOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="$t('advancedModule.recipe.dyeType')">
              <el-input
                v-model="localForm.dye_type"
                :placeholder="$t('advancedModule.recipe.dyeTypePlaceholder')"
              />
            </el-form-item>
            <el-form-item :label="$t('advancedModule.recipe.colorName')">
              <el-input
                v-model="localForm.color_name"
                :placeholder="$t('advancedModule.recipe.colorNamePlaceholder')"
              />
            </el-form-item>
            <el-form-item :label="$t('advancedModule.recipe.kValue')">
              <NumericInput v-model="localForm.k" style="width: 100%" :min="0" :max="20" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="recipeLoading" @click="runRecipeOptimization">{{
                $t('advancedModule.recipe.generate')
              }}</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <el-col :span="isPhone ? 24 : 16">
        <el-card shadow="hover" class="mb-20">
          <template #header>
            <div class="card-header">{{ $t('advancedModule.recipe.result') }}</div>
          </template>
          <el-empty v-if="!recipeResult" :description="$t('advancedModule.recipe.empty')" />
          <div v-else>
            <dl v-if="isPhone" class="card-fields recipe-detail-fields">
              <div>
                <dt>{{ $t('advancedModule.recipe.recTemperature') }}</dt>
                <dd>{{ recipeResult.recommended_params.temperature }} °C</dd>
              </div>
              <div>
                <dt>{{ $t('advancedModule.recipe.recTime') }}</dt>
                <dd>
                  {{ recipeResult.recommended_params.time_minutes }}
                  {{ $t('advancedModule.recipe.unitMinutes') }}
                </dd>
              </div>
              <div>
                <dt>{{ $t('advancedModule.recipe.recPh') }}</dt>
                <dd>{{ recipeResult.recommended_params.ph_value }}</dd>
              </div>
              <div>
                <dt>{{ $t('advancedModule.recipe.recLiquorRatio') }}</dt>
                <dd>1 : {{ recipeResult.recommended_params.liquor_ratio }}</dd>
              </div>
              <div>
                <dt>{{ $t('advancedModule.recipe.confidence') }}</dt>
                <dd>{{ Math.round(recipeResult.confidence * 100) }}%</dd>
              </div>
              <div>
                <dt>{{ $t('advancedModule.recipe.similarCases') }}</dt>
                <dd>{{ recipeResult.similar_cases }}</dd>
              </div>
              <div>
                <dt>{{ $t('advancedModule.recipe.recSource') }}</dt>
                <dd>
                  <el-tag :type="recipeResult.source === 'knn' ? 'success' : 'info'" size="small">
                    {{ sourceLabel(recipeResult.source) }}
                  </el-tag>
                </dd>
              </div>
            </dl>
            <el-descriptions v-else :column="2" border>
              <el-descriptions-item :label="$t('advancedModule.recipe.recTemperature')">
                {{ recipeResult.recommended_params.temperature }} °C
              </el-descriptions-item>
              <el-descriptions-item :label="$t('advancedModule.recipe.recTime')">
                {{ recipeResult.recommended_params.time_minutes }}
                {{ $t('advancedModule.recipe.unitMinutes') }}
              </el-descriptions-item>
              <el-descriptions-item :label="$t('advancedModule.recipe.recPh')">
                {{ recipeResult.recommended_params.ph_value }}
              </el-descriptions-item>
              <el-descriptions-item :label="$t('advancedModule.recipe.recLiquorRatio')">
                1 : {{ recipeResult.recommended_params.liquor_ratio }}
              </el-descriptions-item>
              <el-descriptions-item :label="$t('advancedModule.recipe.confidence')">
                {{ Math.round(recipeResult.confidence * 100) }}%
              </el-descriptions-item>
              <el-descriptions-item :label="$t('advancedModule.recipe.similarCases')">
                {{ recipeResult.similar_cases }}
              </el-descriptions-item>
              <el-descriptions-item :label="$t('advancedModule.recipe.recSource')">
                <el-tag :type="recipeResult.source === 'knn' ? 'success' : 'info'" size="small">
                  {{ sourceLabel(recipeResult.source) }}
                </el-tag>
              </el-descriptions-item>
            </el-descriptions>

            <el-alert
              class="mt-12"
              :title="recipeResult.reason"
              type="info"
              :closable="false"
              show-icon
            />

            <h4 class="mb-10" style="margin-top: 16px">
              {{ $t('advancedModule.recipe.similarCandidates') }}
            </h4>
            <template v-if="recipeResult.candidates && recipeResult.candidates.length > 0">
              <section v-if="isPhone" class="recipe-mobile recipe-candidates-mobile">
                <ul class="card-list" :aria-label="t('advancedModule.recipe.ariaCandidates')">
                  <li
                    v-for="(row, index) in recipeResult.candidates"
                    :key="String(row.recipe_no) + '-' + index"
                    class="card-item"
                  >
                    <dl class="card-fields">
                      <div>
                        <dt>{{ $t('advancedModule.recipe.colRecipeNo') }}</dt>
                        <dd>{{ row.recipe_no }}</dd>
                      </div>
                      <div>
                        <dt>{{ $t('advancedModule.recipe.colColorNo') }}</dt>
                        <dd>{{ row.color_no }}</dd>
                      </div>
                      <div>
                        <dt>{{ $t('advancedModule.recipe.colFabricType') }}</dt>
                        <dd>{{ row.fabric_type }}</dd>
                      </div>
                      <div>
                        <dt>{{ $t('advancedModule.recipe.colDyeType') }}</dt>
                        <dd>{{ row.dye_type }}</dd>
                      </div>
                      <div>
                        <dt>{{ $t('advancedModule.recipe.colTemperature') }}</dt>
                        <dd>{{ row.temperature ?? '-' }} °C</dd>
                      </div>
                      <div>
                        <dt>{{ $t('advancedModule.recipe.colTime') }}</dt>
                        <dd>
                          {{ row.time_minutes ?? '-' }}
                          {{ $t('advancedModule.recipe.unitMinutesShort') }}
                        </dd>
                      </div>
                      <div>
                        <dt>{{ $t('advancedModule.recipe.colPh') }}</dt>
                        <dd>{{ row.ph_value ?? '-' }}</dd>
                      </div>
                      <div>
                        <dt>{{ $t('advancedModule.recipe.colLiquorRatio') }}</dt>
                        <dd>1:{{ row.liquor_ratio ?? '-' }}</dd>
                      </div>
                      <div>
                        <dt>{{ $t('advancedModule.recipe.colSimilarity') }}</dt>
                        <dd>{{ Math.round((row.similarity as number) * 100) }}%</dd>
                      </div>
                    </dl>
                  </li>
                </ul>
              </section>
              <el-table
                v-else
                :data="recipeResult.candidates"
                stripe
                size="small"
                border
                :aria-label="t('advancedModule.recipe.ariaCandidates')"
              >
                <el-table-column
                  prop="recipe_no"
                  :label="$t('advancedModule.recipe.colRecipeNo')"
                  width="160"
                />
                <el-table-column
                  prop="color_no"
                  :label="$t('advancedModule.recipe.colColorNo')"
                  width="120"
                />
                <el-table-column
                  prop="fabric_type"
                  :label="$t('advancedModule.recipe.colFabricType')"
                  width="100"
                />
                <el-table-column
                  prop="dye_type"
                  :label="$t('advancedModule.recipe.colDyeType')"
                  width="120"
                />
                <el-table-column :label="$t('advancedModule.recipe.colTemperature')" width="80">
                  <template #default="{ row }"> {{ row.temperature ?? '-' }} °C </template>
                </el-table-column>
                <el-table-column :label="$t('advancedModule.recipe.colTime')" width="80">
                  <template #default="{ row }">
                    {{ row.time_minutes ?? '-' }} {{ $t('advancedModule.recipe.unitMinutesShort') }}
                  </template>
                </el-table-column>
                <el-table-column :label="$t('advancedModule.recipe.colPh')" width="80">
                  <template #default="{ row }">
                    {{ row.ph_value ?? '-' }}
                  </template>
                </el-table-column>
                <el-table-column :label="$t('advancedModule.recipe.colLiquorRatio')" width="80">
                  <template #default="{ row }"> 1:{{ row.liquor_ratio ?? '-' }} </template>
                </el-table-column>
                <el-table-column :label="$t('advancedModule.recipe.colSimilarity')" width="100">
                  <template #default="{ row }"> {{ Math.round(row.similarity * 100) }}% </template>
                </el-table-column>
              </el-table>
            </template>
            <el-empty
              v-else
              :description="$t('advancedModule.recipe.emptyNoCandidates')"
              :image-size="60"
            />
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.advanced-recipe-panel {
  min-width: 0;
  max-width: 100%;
}
.card-list {
  display: grid;
  gap: 16px;
  padding: 0;
  margin: 0 0 16px;
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
  gap: 12px;
  margin: 0 0 16px;
}
.card-fields > div {
  min-width: 0;
}
.card-fields dt {
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 1.5;
}
.card-fields dd {
  margin: 4px 0 0;
  color: var(--el-text-color-primary);
  font-size: 16px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.advanced-recipe-panel--phone :deep(.el-button) {
  min-width: 44px;
  min-height: 44px;
  margin-left: 0;
  white-space: normal;
}
.advanced-recipe-panel--phone :deep(.el-select__wrapper),
.advanced-recipe-panel--phone :deep(.el-input__wrapper) {
  min-height: 44px;
}
</style>
