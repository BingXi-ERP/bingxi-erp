// Wave4 样品/色卡/配方域：染色配方版本门（仅已审核可建新版本）与版本树逐字段回读。
// 后端判据：routes/production.rs:126-137 挂 POST /production/dye-recipes/{id}/version
//   与 GET /production/dye-recipes/{id}/versions；handlers/dye_recipe_handler.rs:202-220
//   用 OptionalJson<CreateVersionRequest> 只收 remarks，建版人取 AuthContext.user_id，
//   写前先按父配方 created_by 做归属门；services/dye_recipe_service.rs:223-232 仅
//   Some("approved") 放行，否则 AppError::business → 400/BUSINESS_ERROR（出参脱敏，
//   不断言文案）；:550-596 复制父行字段、version=父+1、recipe_no=父号-Vn、
//   status=draft、parent_recipe_id=父 id、approved_by/approved_at 置空。
//   get_recipe_versions 以 parent_recipe_id 取整树、按 version 降序且排除软删行；
//   出参键见 models/dye_recipe.rs:30-67，状态词表见 models/status/quality_dyeing.rs:39-56
//   （draft/pending_approval/approved/rejected/disabled 全小写，逐字符比较）。
// 造数隔离：recipe_no/color_no/color_code 全带 genCode 唯一后缀，回读只按自建 id；
//   清理先子后父，PUT status=disabled 再 DELETE；清理失败仅告警，不作被测断言。
import type { Page } from '@playwright/test';
import { expect, test } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  failureCode,
  genCode,
  loginViaUI,
} from '../flow/helpers';

const RECIPES = '/production/dye-recipes';

interface Recipe {
  id?: number;
  recipe_no?: string;
  recipe_name?: string | null;
  color_no?: string | null;
  formula?: string | null;
  color_code?: string | null;
  color_name?: string | null;
  fabric_type?: string | null;
  dye_type?: string | null;
  chemical_formula?: string | null;
  temperature?: unknown;
  time_minutes?: number | null;
  ph_value?: unknown;
  liquor_ratio?: unknown;
  auxiliaries?: unknown;
  status?: string | null;
  is_deleted?: boolean | null;
  version?: number | null;
  parent_recipe_id?: number | null;
  approved_by?: number | null;
  approved_at?: string | null;
  rejected_reason?: string | null;
  remarks?: string | null;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

interface CleanupRecipe {
  id: number;
  label: string;
}

const AUXILIARIES = [{ name: 'E509-AUX', amount: '1.25', unit: 'g/L' }];

function positiveInt(value: unknown, label: string): number {
  expect(
    Number.isInteger(value) && (value as number) > 0,
    `[509] ${label} 须正整数，实际 ${JSON.stringify(value)}`
  ).toBe(true);
  return value as number;
}

function decimalCents(value: unknown, label: string): number {
  expect(typeof value, `[509] ${label} 须为字符串 Decimal，实际 ${JSON.stringify(value)}`).toBe(
    'string'
  );
  const text = value as string;
  expect(/^\d+(\.\d{1,2})?$/.test(text), `[509] ${label} 金额格式异常: ${text}`).toBe(true);
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  expect(Number.isSafeInteger(cents), `[509] ${label} 超出安全整数范围: ${text}`).toBe(true);
  return cents;
}

async function createSeedRecipe(page: Page, marker: string): Promise<Recipe> {
  const row = await apiCallRaw<Recipe>(page, 'POST', RECIPES, {
    recipe_no: `E509-${marker}`,
    recipe_name: `E509-base-${marker}`,
    color_no: `E509-CN-${marker}`,
    color_code: `E509-CC-${marker}`,
    color_name: `E509-color-${marker}`,
    fabric_type: 'cotton',
    dye_type: 'reactive',
    chemical_formula: `E509-CF-${marker}`,
    temperature: '130.50',
    time_minutes: 45,
    ph_value: '6.80',
    liquor_ratio: '12.50',
    auxiliaries: AUXILIARIES,
    remarks: `${marker}-BASE`,
  });
  positiveInt(row?.id, '建配方 id');
  return row;
}

async function readRecipe(page: Page, id: number, label: string): Promise<Recipe> {
  const row = await apiCallRaw<Recipe>(page, 'GET', `${RECIPES}/${id}`);
  expect(Number(row?.id), `[509] ${label} 详情 id 应为 ${id}，实际 ${JSON.stringify(row)}`).toBe(
    id
  );
  return row;
}

async function readVersions(page: Page, id: number, label: string): Promise<Recipe[]> {
  const rows = await apiCallRaw<Recipe[]>(page, 'GET', `${RECIPES}/${id}/versions`);
  expect(Array.isArray(rows), `[509] ${label} 版本树须为数组，实际 ${JSON.stringify(rows)}`).toBe(
    true
  );
  return rows as Recipe[];
}

async function expectVersionRejected(page: Page, id: number, label: string): Promise<void> {
  const failure = await apiCallExpectFail(page, 'POST', `${RECIPES}/${id}/version`, {
    remarks: `${label}-FORBIDDEN`,
  });
  expect(failure.status, `[509] ${label} 建版须 400，实际 ${failure.status}`).toBe(400);
  const code = failureCode(failure);
  expect(
    code,
    `[509] ${label} 机器码须 BUSINESS_ERROR，实际 ${String(code)} body=${JSON.stringify(failure)}`
  ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
}

async function cleanupRecipes(page: Page, recipes: CleanupRecipe[]): Promise<void> {
  for (const recipe of recipes) {
    try {
      await apiCallRaw(page, 'PUT', `${RECIPES}/${recipe.id}`, { status: 'disabled' });
    } catch (e) {
      console.warn(`[cleanup] [509] ${recipe.label} 停用失败: ${(e as Error).message}`);
    }
    try {
      await apiCallRaw(page, 'DELETE', `${RECIPES}/${recipe.id}`);
    } catch (e) {
      console.warn(`[cleanup] [509] ${recipe.label} 软删失败: ${(e as Error).message}`);
    }
  }
}

function expectSeedFields(row: Recipe, marker: string, label: string): void {
  expect(row.recipe_no, `[509] ${label} recipe_no`).toBe(`E509-${marker}`);
  expect(row.recipe_name, `[509] ${label} recipe_name`).toBe(`E509-base-${marker}`);
  expect(row.color_no, `[509] ${label} color_no`).toBe(`E509-CN-${marker}`);
  expect(row.color_code, `[509] ${label} color_code`).toBe(`E509-CC-${marker}`);
  expect(row.color_name, `[509] ${label} color_name`).toBe(`E509-color-${marker}`);
  expect(row.fabric_type, `[509] ${label} fabric_type`).toBe('cotton');
  expect(row.dye_type, `[509] ${label} dye_type`).toBe('reactive');
  expect(row.chemical_formula, `[509] ${label} chemical_formula`).toBe(`E509-CF-${marker}`);
  expect(row.formula, `[509] ${label} formula 须由 chemical_formula 派生`).toBe(
    row.chemical_formula
  );
  expect(decimalCents(row.temperature, `${label} temperature`), `[509] ${label} temperature`).toBe(
    13050
  );
  expect(row.time_minutes, `[509] ${label} time_minutes`).toBe(45);
  expect(decimalCents(row.ph_value, `${label} ph_value`), `[509] ${label} ph_value`).toBe(680);
  expect(
    decimalCents(row.liquor_ratio, `${label} liquor_ratio`),
    `[509] ${label} liquor_ratio`
  ).toBe(1250);
  expect(row.auxiliaries, `[509] ${label} auxiliaries`).toEqual(AUXILIARIES);
  expect(row.status, `[509] ${label} 初始状态须 draft`).toBe('draft');
  expect(row.version, `[509] ${label} 初始版本须 1`).toBe(1);
  expect(row.parent_recipe_id, `[509] ${label} 根配方无父 id`).toBeNull();
  expect(row.is_deleted, `[509] ${label} 新建行未被软删`).toBe(false);
  expect(row.approved_by, `[509] ${label} 初始审批人为空`).toBeNull();
  expect(row.approved_at, `[509] ${label} 初始审批时间为空`).toBeNull();
  expect(row.rejected_reason, `[509] ${label} 初始拒绝理由为空`).toBeNull();
  expect(row.remarks, `[509] ${label} remarks`).toBe(`${marker}-BASE`);
}

function expectCopiedFields(
  child: Recipe,
  parent: Recipe,
  parentId: number,
  remarks: string,
  self: number,
  label: string
): void {
  expect(child.recipe_no, `[509] ${label} recipe_no 须为父号-V2`).toBe(`${parent.recipe_no}-V2`);
  expect(child.recipe_name, `[509] ${label} recipe_name 复制父值`).toBe(parent.recipe_name);
  expect(child.color_no, `[509] ${label} color_no 复制父值`).toBe(parent.color_no);
  expect(child.color_code, `[509] ${label} color_code 复制父值`).toBe(parent.color_code);
  expect(child.color_name, `[509] ${label} color_name 复制父值`).toBe(parent.color_name);
  expect(child.fabric_type, `[509] ${label} fabric_type 复制父值`).toBe(parent.fabric_type);
  expect(child.dye_type, `[509] ${label} dye_type 复制父值`).toBe(parent.dye_type);
  expect(child.chemical_formula, `[509] ${label} chemical_formula 复制父值`).toBe(
    parent.chemical_formula
  );
  expect(child.formula, `[509] ${label} formula 复制父值`).toBe(parent.formula);
  expect(
    decimalCents(child.temperature, `${label} temperature`),
    `[509] ${label} temperature 复制父值`
  ).toBe(decimalCents(parent.temperature, `父配方 temperature`));
  expect(child.time_minutes, `[509] ${label} time_minutes 复制父值`).toBe(parent.time_minutes);
  expect(
    decimalCents(child.ph_value, `${label} ph_value`),
    `[509] ${label} ph_value 复制父值`
  ).toBe(decimalCents(parent.ph_value, `父配方 ph_value`));
  expect(
    decimalCents(child.liquor_ratio, `${label} liquor_ratio`),
    `[509] ${label} liquor_ratio 复制父值`
  ).toBe(decimalCents(parent.liquor_ratio, `父配方 liquor_ratio`));
  expect(child.auxiliaries, `[509] ${label} auxiliaries 复制父值`).toEqual(parent.auxiliaries);
  expect(child.status, `[509] ${label} 子版须落 draft`).toBe('draft');
  expect(child.version, `[509] ${label} 子版版本号须为 2`).toBe(2);
  expect(child.parent_recipe_id, `[509] ${label} parent_recipe_id 须指向父配方`).toBe(parentId);
  expect(child.approved_by, `[509] ${label} 子版审批人须清空`).toBeNull();
  expect(child.approved_at, `[509] ${label} 子版审批时间须清空`).toBeNull();
  expect(child.rejected_reason, `[509] ${label} 子版拒绝理由须为空`).toBeNull();
  expect(child.remarks, `[509] ${label} remarks 须取请求体`).toBe(remarks);
  expect(child.created_by, `[509] ${label} 建版人须取会话用户`).toBe(self);
  expect(child.is_deleted, `[509] ${label} 子版未被软删`).toBe(false);
}

test.describe('509 染色配方版本门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('509-01 已审核才可建新版本，版本树逐字段回读，draft 子版拒绝再建版且零写入', async ({
    page,
  }) => {
    const marker = genCode('E509').replace(/-/g, '');
    const cleanup: CleanupRecipe[] = [];
    try {
      const me = await apiCallRaw<Record<string, unknown>>(page, 'GET', '/auth/me');
      const self = positiveInt(me?.id, '当前登录用户 id');

      let parent = await createSeedRecipe(page, marker);
      const parentId = positiveInt(parent?.id, '父配方 id');
      cleanup.push({ id: parentId, label: 'parent' });
      expectSeedFields(parent, marker, '建单');

      const beforeDraft = await readRecipe(page, parentId, 'draft 父版');
      const draftTree = await readVersions(page, parentId, 'draft 版本树');
      expect(draftTree.length, `[509] draft 父版版本树应只有 1 行，实际 ${draftTree.length}`).toBe(
        1
      );
      await expectVersionRejected(page, parentId, 'draft-parent');
      expect(
        await readRecipe(page, parentId, 'draft 拒绝后回读'),
        '[509] draft 建版被拒后父行须零写入'
      ).toEqual(beforeDraft);
      expect(
        await readVersions(page, parentId, 'draft 拒绝后版本树'),
        '[509] draft 建版被拒后版本树须零写入'
      ).toEqual(draftTree);

      const submitted = await apiCallRaw<Recipe>(page, 'POST', `${RECIPES}/${parentId}/submit`);
      expect(
        submitted.status,
        `[509] submit 后状态须为 pending_approval，实际 ${submitted.status}`
      ).toBe('pending_approval');
      const beforePending = await readRecipe(page, parentId, 'pending 父版');
      const pendingTree = await readVersions(page, parentId, 'pending 版本树');
      expect(
        pendingTree.length,
        `[509] pending 版本树应只有 1 行，实际 ${pendingTree.length}`
      ).toBe(1);
      await expectVersionRejected(page, parentId, 'pending-parent');
      expect(
        await readRecipe(page, parentId, 'pending 拒绝后回读'),
        '[509] pending_approval 建版被拒后父行须零写入'
      ).toEqual(beforePending);
      expect(
        await readVersions(page, parentId, 'pending 拒绝后版本树'),
        '[509] pending_approval 建版被拒后版本树须零写入'
      ).toEqual(pendingTree);

      parent = await apiCallRaw<Recipe>(page, 'POST', `${RECIPES}/${parentId}/approve`);
      expect(parent.status, `[509] approve 后状态须为 approved，实际 ${parent.status}`).toBe(
        'approved'
      );
      expect(parent.approved_by, `[509] approve 审批人须为会话用户 ${self}`).toBe(self);
      expect(
        typeof parent.approved_at,
        `[509] approve 须落 approved_at，实际 ${JSON.stringify(parent.approved_at)}`
      ).toBe('string');

      const childRemarks = `${marker}-CHILD`;
      const child = await apiCallRaw<Recipe>(page, 'POST', `${RECIPES}/${parentId}/version`, {
        remarks: childRemarks,
      });
      const childId = positiveInt(child?.id, '子版 id');
      cleanup.unshift({ id: childId, label: 'child' });
      expectCopiedFields(child, parent, parentId, childRemarks, self, '子版');

      // 从子版 id 回读整树：service 以 child.parent_recipe_id 取父与全部兄弟，按 version 降序。
      const treeFromChild = await readVersions(page, childId, '子版版本树');
      expect(treeFromChild.length, `[509] 版本树应为父子两行，实际 ${treeFromChild.length}`).toBe(
        2
      );
      expect(
        treeFromChild.map(row => row.id),
        '[509] 版本树须按 version 降序：子版在前'
      ).toEqual([childId, parentId]);
      expect(
        treeFromChild.map(row => row.version),
        '[509] 版本树版本号须为 [2,1]'
      ).toEqual([2, 1]);
      expect(treeFromChild[0], '[509] 版本树首行须与子版详情逐字段一致').toEqual(child);
      expect(treeFromChild[1], '[509] 版本树次行须与审核后父版逐字段一致').toEqual(parent);
      expect(
        await readVersions(page, parentId, '父版版本树'),
        '[509] 从父版与子版读到的版本树须一致'
      ).toEqual(treeFromChild);

      const beforeChild = await readRecipe(page, childId, 'draft 子版');
      await expectVersionRejected(page, childId, 'draft-child');
      expect(
        await readRecipe(page, childId, 'draft 子版拒绝后回读'),
        '[509] draft 子版再建版被拒后子行须零写入'
      ).toEqual(beforeChild);
      expect(
        await readVersions(page, childId, 'draft 子版拒绝后版本树'),
        '[509] draft 子版再建版被拒后版本树须零写入'
      ).toEqual(treeFromChild);
    } finally {
      await cleanupRecipes(page, cleanup);
    }
  });
});
