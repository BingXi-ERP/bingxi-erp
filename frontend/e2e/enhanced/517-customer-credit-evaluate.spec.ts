// 517 客户信用评分模型（纯 API E2E）：缺信用行 404、日期格式门、零业务历史固定
// 四因子/总分/评级/推荐额度、评估零写入。逐条核源：
// - routes/crm.rs:134-137 挂 POST /customer-credits/evaluate；
//   handlers/customer_credit_handler.rs:419-441 请求仅 customer_id/evaluation_date。
// - services/customer_credit_evaluate.rs:21-41 先解析日期再加载信用行，缺行 404；
//   :124-140 无应收票 70；:178-211 评估日与信用行创建日同日 50；
//   :214-225 近一年无销售订单 50；:257-297 单条默认 B 且无高使用率 75。
// - services/customer_credit_evaluate.rs:83-120 权重与逐项取整：
//   21 + 10 + 12 + 18 = 61；:301-315 61 → BBB / 100000。
// - services/customer_credit_limit.rs:69-81 创建信用行默认 B / 60 / 额度 0 / active。
import type { Page } from '@playwright/test';
import { expect, test } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  failureCode,
  genCode,
  loginViaUI,
  tryCleanup,
} from '../flow/helpers';

interface FactorRow {
  factor_name?: unknown;
  weight?: unknown;
  score?: unknown;
  description?: unknown;
}

interface Row {
  id?: number;
  customer_id?: number;
  customer_name?: string;
  credit_level?: string;
  credit_score?: number;
  credit_limit?: string | number;
  used_credit?: string | number;
  status?: string;
  created_at?: string;
  credit_rating?: string;
  recommended_limit?: string | number;
  evaluation_date?: string;
  evaluation_factors?: FactorRow[];
  [key: string]: unknown;
}

function requireId(value: unknown, label: string): number {
  expect(
    Number.isInteger(value) && Number(value) > 0,
    `[517] ${label} 须正整数，实际 ${JSON.stringify(value)}`
  ).toBe(true);
  return Number(value);
}

function text(value: unknown, label: string): string {
  expect(typeof value === 'string' && value.length > 0, `[517] ${label} 须非空字符串`).toBe(true);
  return value as string;
}

function decimalNumber(value: unknown, label: string): number {
  expect(
    typeof value === 'string' || typeof value === 'number',
    `[517] ${label} 须 DECIMAL 字符串或数字，实际 ${JSON.stringify(value)}`
  ).toBe(true);
  const parsed = Number(value);
  expect(Number.isFinite(parsed), `[517] ${label} 须有限数值，实际 ${JSON.stringify(value)}`).toBe(
    true
  );
  return parsed;
}

async function readCredit(page: Page, customerId: number): Promise<Row> {
  const row = await apiCallRaw<Row>(page, 'GET', `/crm/customer-credits/${customerId}`);
  requireId(row.id, '信用详情 id');
  requireId(row.customer_id, '信用详情 customer_id');
  return row;
}

test.describe('517 客户信用评分模型', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('517-01 零业务历史固定 61 分、BBB、100000 且评估零写入', async ({ page }) => {
    const customerName = `E517${genCode('C')}`;
    const customer = await apiCall<Row>(page, 'POST', '/crm/customers', {
      customer_name: customerName,
      status: 'active',
    });
    const customerId = requireId(customer.data?.id, '专属客户 id');
    let creditCreated = false;

    try {
      const missing = await apiCallExpectFail(page, 'POST', '/crm/customer-credits/evaluate', {
        customer_id: customerId,
        evaluation_date: '2026-01-01',
      });
      expect(missing.status, '[517] 无信用行评估须 404').toBe(404);
      expect(failureCode(missing), '[517] 无信用行机器码').toBe(APP_ERROR_CODES.NOT_FOUND);

      const createdCredit = await apiCallRaw<Row>(page, 'POST', '/crm/customer-credits', {
        customer_id: customerId,
      });
      creditCreated = true;
      requireId(createdCredit.id, '信用行 id');

      const before = await readCredit(page, customerId);
      expect(before.customer_name, '[517] 信用详情须富化真实客户名').toBe(customerName);
      expect(before.credit_level, '[517] 默认信用等级').toBe('B');
      expect(before.credit_score, '[517] 默认信用分').toBe(60);
      expect(decimalNumber(before.credit_limit, '默认信用额度'), '[517] 默认额度为 0').toBe(0);
      expect(before.status, '[517] 默认信用状态').toBe('active');

      const createdAt = text(before.created_at, '信用行 created_at');
      const evaluationDate = createdAt.slice(0, 10);
      expect(
        /^\d{4}-\d{2}-\d{2}$/.test(evaluationDate),
        `[517] created_at 前 10 位须为日期，实际 ${createdAt}`
      ).toBe(true);

      const badDate = await apiCallExpectFail(page, 'POST', '/crm/customer-credits/evaluate', {
        customer_id: customerId,
        evaluation_date: '2026-02-30',
      });
      expect(badDate.status, '[517] 非法日期须 400').toBe(400);
      expect(failureCode(badDate), '[517] 非法日期机器码').toBe(APP_ERROR_CODES.VALIDATION_ERROR);
      expect(badDate.message, '[517] validation_displayable 须外显原文').toBe('日期格式错误');

      const result = await apiCallRaw<Row>(page, 'POST', '/crm/customer-credits/evaluate', {
        customer_id: customerId,
        evaluation_date: evaluationDate,
      });
      expect(requireId(result.customer_id, '评估结果 customer_id'), '[517] 客户主键回显').toBe(
        customerId
      );
      expect(text(result.customer_name, '评估结果客户名'), '[517] 真实客户名回显').toBe(
        customerName
      );
      expect(result.credit_score, '[517] 零业务历史总分固定 61').toBe(61);
      expect(result.credit_rating, '[517] 61 分评级映射').toBe('BBB');
      expect(result.evaluation_date, '[517] 评估日期原样回显').toBe(evaluationDate);
      expect(
        typeof result.recommended_limit === 'string' && /^\d+$/.test(result.recommended_limit),
        `[517] 推荐额度须整数形态 DECIMAL 字符串，实际 ${JSON.stringify(result.recommended_limit)}`
      ).toBe(true);
      expect(decimalNumber(result.recommended_limit, '推荐额度'), '[517] 61 分推荐额度').toBe(
        100000
      );

      const factors = result.evaluation_factors;
      expect(Array.isArray(factors), '[517] 四因子须数组').toBe(true);
      expect((factors as FactorRow[]).length, '[517] 四因子数量').toBe(4);
      const expected = [
        {
          factor_name: '历史付款记录',
          weight: 0.3,
          score: 70,
          description: '基于过去 12 个月的付款及时性',
        },
        { factor_name: '合作时长', weight: 0.2, score: 50, description: '基于客户创建时间计算' },
        { factor_name: '订单规模', weight: 0.25, score: 50, description: '基于年度订单总额' },
        { factor_name: '信用记录', weight: 0.25, score: 75, description: '基于历史信用记录' },
      ];
      for (let i = 0; i < expected.length; i += 1) {
        const actual = (factors as FactorRow[])[i];
        expect(text(actual.factor_name, `因子 ${i + 1} 名称`), `[517] 因子 ${i + 1} 顺序`).toBe(
          expected[i].factor_name
        );
        expect(actual.weight, `[517] 因子 ${i + 1} 权重`).toBeCloseTo(expected[i].weight, 6);
        expect(actual.score, `[517] 因子 ${i + 1} 分数`).toBe(expected[i].score);
        expect(text(actual.description, `因子 ${i + 1} 说明`), `[517] 因子 ${i + 1} 说明`).toBe(
          expected[i].description
        );
      }

      const after = await readCredit(page, customerId);
      expect(after.credit_level, '[517] 评估后等级不变').toBe(before.credit_level);
      expect(after.credit_score, '[517] 评估后信用分不变').toBe(before.credit_score);
      expect(decimalNumber(after.credit_limit, '评估后信用额度'), '[517] 评估后额度不变').toBe(
        decimalNumber(before.credit_limit, '评估前信用额度')
      );
      expect(after.status, '[517] 评估后状态不变').toBe(before.status);
    } finally {
      if (creditCreated) {
        await tryCleanup(
          page,
          'DELETE',
          `/crm/customer-credits/${customerId}`,
          `[517] 信用行 ${customerId}`
        );
      }
      await tryCleanup(page, 'DELETE', `/crm/customers/${customerId}`, `[517] 客户 ${customerId}`);
    }
  });
});
