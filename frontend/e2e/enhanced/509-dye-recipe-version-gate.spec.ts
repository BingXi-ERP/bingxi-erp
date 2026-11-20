// 509 染色配方版本门：仅已审核配方可建新版本，版本树逐字段回读，草稿子版零再写入。
// 后端判据：services/dye_recipe_service.rs:223-232 仅 approved 放行，非法走 AppError::business →
// 400/BUSINESS_ERROR + 固定脱敏文案；:550-596 复制业务列并固定写 draft、version+1、
// parent_recipe_id、会话 created_by，approval/reject 列清空；:617-636 按父主键取版树并倒序。
// 状态词来源 models/status/quality_dyeing.rs:39-57，逐字符小写。建单 DTO 见
// services/dye_recipe_service.rs:51-71，实体键见 models/dye_recipe.rs:30-66。
import type { Page } from '@playwright/test';
import { expect, test } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  failureCode,
  genCode,
  loginViaUI,
  tryCleanup,
} from '../flow/helpers';

interface Recipe {
  id?: number;
  recipe_no?: string;
  recipe_name?: string | null;
  color_no?: string | null;
  color_code?: string | null;
  color_name?: string | null;
  fabric_type?: string | null;
  dye_type?: string | null;
  chemical_formula?: string | null;
  temperature?: string | number | null;
  time_minutes?: number | null;
  ph_value?: string | number | null;
  liquor_ratio?: string | number | null;
  auxiliaries?: Array<{ name: string; amount: string | number; unit: string }> | null;
  status?: string | null;
  is_deleted?: boolean | null;
  version?: number | null;
  parent_recipe_id?: number | null;
  approved_by?: number | null;
  approved_at?: string | null;
  rejected_reason?: string | null;
  remarks?: string | null;
  created_by?: number | null;
}

function int(value: unknown, label: string): number {
  expect(
    Number.isInteger(value) && (value as number) > 0,
    `[509] ${label} 须正整数，实际=${JSON.stringify(value)}`
  ).toBe(true);
  return value as number;
}

function text(value: unknown, label: string): string {
  expect(
    typeof value === 'string' && (value as string).length > 0,
    `[509] ${label} 须非空字符串，实际=${JSON.stringify(value)}`
  ).toBe(true);
  return value as string;
}

function decimal(value: unknown, label: string): number {
  expect(
    typeof value === 'string' || typeof value === 'number',
    `[509] ${label} 须 Decimal 线格式，实际=${JSON.stringify(value)}`
  ).toBe(true);
  return Number(value);
}

async function selfUserId(page: Page): Promise<number> {
  const me = await apiCallRaw<{ id?: number }>(page, 'GET', '/auth/me');
  return int(me?.id, '当前登录用户 id');
}

async function readRecipe(page: Page, id: number): Promise<Recipe> {
  const found = await apiCallRaw<Recipe>(page, 'GET', `/production/dye-recipes/${id}`);
  expect(found.id, `[509] GET /production/dye-recipes/${id} 回读 id`).toBe(id);
  return found;
}

async function expectCopiedFields(child: Recipe, parent: Recipe): Promise<void> {
  expect(child.recipe_no, '[509] 新版本编号须由父编号派生').toBe(
    `${text(parent.recipe_no, '父配方编号')}-V2`
  );
  expect(child.version, '[509] 新版本 version 须为 2').toBe(2);
  expect(child.parent_recipe_id, '[509] 新版本须挂父配方').toBe(parent.id);
  expect(child.status, '[509] 新版本状态须 draft').toBe('draft');
  expect(child.is_deleted, '[509] 新版本不得软删').toBe(false);
  expect(child.approved_by, '[509] 新版本审批人须清空').toBe(null);
  expect(child.approved_at, '[509] 新版本审批时间须清空').toBe(null);
  expect(child.rejected_reason, '[509] 新版本拒绝理由须清空').toBe(null);
  expect(child.recipe_name, '[509] 新版本须复制配方名').toBe(parent.recipe_name);
  expect(child.color_no, '[509] 新版本须复制色号').toBe(parent.color_no);
  expect(child.color_code, '[509] 新版本须复制色代码').toBe(parent.color_code);
  expect(child.color_name, '[509] 新版本须复制色名').toBe(parent.color_name);
  expect(child.fabric_type, '[509] 新版本须复制布种').toBe(parent.fabric_type);
  expect(child.dye_type, '[509] 新版本须复制染料类型').toBe(parent.dye_type);
  expect(child.chemical_formula, '[509] 新版本须复制配方正文').toBe(parent.chemical_formula);
  expect(decimal(child.temperature, '新版本温度'), '[509] 新版本温度守恒').toBe(
    decimal(parent.temperature, '父配方温度')
  );
  expect(child.time_minutes, '[509] 新版本时间守恒').toBe(parent.time_minutes);
  expect(decimal(child.ph_value, '新版本 pH'), '[509] 新版本 pH 守恒').toBe(
    decimal(parent.ph_value, '父配方 pH')
  );
  expect(decimal(child.liquor_ratio, '新版本浴比'), '[509] 新版本浴比守恒').toBe(
    decimal(parent.liquor_ratio, '父配方浴比')
  );
  expect(child.auxiliaries, '[509] 新版本须复制助剂').toEqual(parent.auxiliaries);
}

test.describe('509 染色配方版本门', () => {
  test('509-01 已审核建版并复制字段，草稿子版拒绝再建且零写入', async ({ page }) => {
    await loginViaUI(page, undefined, undefined, true);
    const self = await selfUserId(page);
    const stamp = genCode('E509DR');
    const recipeNo = `DR-${stamp}`;
    const createRemark = `E509建版-${stamp}`;
    const versionRemark = `E509新版本-${stamp}`;
    let parentId: number | undefined;
    let childId: number | undefined;

    try {
      const parent = await apiCallRaw<Recipe>(page, 'POST', '/production/dye-recipes', {
        recipe_no: recipeNo,
        recipe_name: `E509配方-${stamp}`,
        color_no: `CN-${stamp}`,
        color_code: `CC-${stamp}`,
        color_name: 'E509测试色',
        fabric_type: '纯棉',
        dye_type: '活性染料',
        chemical_formula: `E509-FORMULA-${stamp}`,
        temperature: '60.00',
        time_minutes: 45,
        ph_value: '6.50',
        liquor_ratio: '10.00',
        auxiliaries: [{ name: '匀染剂', amount: '1.25', unit: 'g/L' }],
        status: 'draft',
        version: 1,
        remarks: createRemark,
      });
      parentId = int(parent?.id, '建父配方返回 id');
      const parentBefore = await readRecipe(page, parentId);
      expect(parentBefore.recipe_no, '[509] 父配方编号回读').toBe(recipeNo);
      expect(parentBefore.status, '[509] 建单初始状态须 draft').toBe('draft');
      expect(parentBefore.version, '[509] 建单初始版本须 1').toBe(1);
      expect(parentBefore.parent_recipe_id, '[509] 父配方无父版本').toBe(null);
      expect(parentBefore.is_deleted, '[509] 父配方不得软删').toBe(false);
      expect(parentBefore.approved_by, '[509] 父配方建单未审批').toBe(null);
      expect(parentBefore.approved_at, '[509] 父配方建单无审批时间').toBe(null);
      expect(parentBefore.rejected_reason, '[509] 父配方建单无拒绝理由').toBe(null);
      expect(parentBefore.remarks, '[509] 父配方备注落库').toBe(createRemark);
      expect(parentBefore.created_by, '[509] 建单人取会话用户').toBe(self);

      await apiCallRaw(page, 'POST', `/production/dye-recipes/${parentId}/submit`);
      const submitted = await readRecipe(page, parentId);
      expect(submitted.status, '[509] submit 后状态须 pending_approval').toBe('pending_approval');
      await apiCallRaw(page, 'POST', `/production/dye-recipes/${parentId}/approve`);
      const approved = await readRecipe(page, parentId);
      expect(approved.status, '[509] approve 后状态须 approved').toBe('approved');
      expect(approved.approved_by, '[509] 审批人须取会话用户').toBe(self);
      expect(text(approved.approved_at, '审批时间').length > 0, '[509] 审批时间须非空').toBe(true);

      const versionsBefore = await apiCallRaw<Recipe[]>(
        page,
        'GET',
        `/production/dye-recipes/${parentId}/versions`
      );
      expect(
        Array.isArray(versionsBefore),
        `[509] 版本树须返回数组，实际=${JSON.stringify(versionsBefore)}`
      ).toBe(true);
      expect(versionsBefore.length, '[509] 建版前版本树仅父配方一条').toBe(1);
      expect(versionsBefore[0].id, '[509] 建版前版本树 id').toBe(parentId);
      expect(versionsBefore[0].version, '[509] 建版前版本树 version').toBe(1);

      const child = await apiCallRaw<Recipe>(
        page,
        'POST',
        `/production/dye-recipes/${parentId}/version`,
        { remarks: versionRemark }
      );
      childId = int(child?.id, '建新版本返回 id');
      const childAfter = await readRecipe(page, childId);
      expect(childAfter.remarks, '[509] 新版本 remarks 精确落库').toBe(versionRemark);
      expect(childAfter.created_by, '[509] 新版本建版人取会话用户').toBe(self);
      await expectCopiedFields(childAfter, parentBefore);

      const versionsAfter = await apiCallRaw<Recipe[]>(
        page,
        'GET',
        `/production/dye-recipes/${parentId}/versions`
      );
      expect(
        Array.isArray(versionsAfter),
        `[509] 建版后版本树须返回数组，实际=${JSON.stringify(versionsAfter)}`
      ).toBe(true);
      expect(versionsAfter.length, '[509] 建版后版本树须两条').toBe(2);
      expect(
        versionsAfter.map(row => row.version),
        '[509] 版本树须按 version 倒序'
      ).toEqual([2, 1]);
      expect(
        versionsAfter.map(row => row.id),
        '[509] 版本树 id 顺序'
      ).toEqual([childId, parentId]);
      expect(versionsAfter[1].parent_recipe_id, '[509] 父版本无父版本').toBe(null);

      const rejected = await apiCallExpectFail(
        page,
        'POST',
        `/production/dye-recipes/${childId}/version`,
        { remarks: `${versionRemark}-FORBIDDEN` }
      );
      expect(rejected.status, `[509] draft 子版再建须 400，实际=${rejected.status}`).toBe(400);
      expect(
        failureCode(rejected),
        `[509] draft 子版再建机器码须 BUSINESS_ERROR，实际=${JSON.stringify(rejected)}`
      ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
      expect(rejected.message, '[509] business 错误文案须固定脱敏').toBe('业务处理失败');
      expect(rejected.data, '[509] 拒绝响应不得携带业务数据').toBe(undefined);

      const versionsFinal = await apiCallRaw<Recipe[]>(
        page,
        'GET',
        `/production/dye-recipes/${parentId}/versions`
      );
      expect(versionsFinal.length, '[509] 拒绝建版后版本树不得增长').toBe(2);
      expect(
        versionsFinal.map(row => row.id),
        '[509] 拒绝建版后版本树 id 不变'
      ).toEqual([childId, parentId]);
      const childFinal = await readRecipe(page, childId);
      expect(childFinal.status, '[509] 被拒绝的建版源状态须保持 draft').toBe('draft');
    } finally {
      if (childId !== undefined) {
        await tryCleanup(page, 'DELETE', `/production/dye-recipes/${childId}`, '509 子版本');
      }
      if (parentId !== undefined) {
        try {
          const latest = await apiCallRaw<Recipe>(
            page,
            'GET',
            `/production/dye-recipes/${parentId}`
          );
          if (latest.status === 'approved') {
            await apiCallRaw(page, 'PUT', `/production/dye-recipes/${parentId}`, {
              status: 'disabled',
            });
          }
        } catch (error) {
          console.warn(`[cleanup] 509 父配方停用失败: ${(error as Error).message}`);
        }
        await tryCleanup(page, 'DELETE', `/production/dye-recipes/${parentId}`, '509 父配方');
      }
    }
  });
});
