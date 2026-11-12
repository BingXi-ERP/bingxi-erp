/**
 * 505 主数据唯一性面
 *
 * 目标：补 4.4「色号、缸号、客户编号、单据编码唯一性校验」与 4.1 H 段「重复提交不生成两条相同记录」
 * 在直连接口上的缺口。此前这三条线只有导入腿有查重，建档口要么裸撞库级约束冒成数据库错误，
 * 要么根本没有防线。
 *
 * 契约事实（比较值一律照抄写入方）：
 * 1. 产品编码有库级 UNIQUE，重复建档应被业务族点名拒绝而不是冒 500；拒因必须含实际编码，
 *    红了能一眼分清"门缺失"（status=500 或 code=DATABASE_ERROR）与"文案漂移"（不含编码）。
 * 2. 色号所在的 product_colors 表既无库级唯一约束也无服务层查重，同一产品下重复色号会静默落多行；
 *    现在按写入侧前置查重拒绝，判据作用域是 (产品, 色号) 而非全表，所以同产品换色号必须放行。
 * 3. 客户编码走既有服务层事务内查重，重复即业务族拒绝，文案为固定公开规则。
 *
 * 前置全部本用例自建或复用夹具既有行，收尾删除自建行并读回校验，不给库里留重复数据。
 */
import { test, expect } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  genCode,
  getCtx,
} from './helpers';

type ProductRow = { id?: unknown; code?: unknown };
type ColorRow = { id?: unknown; color_no?: unknown };
type CustomerRow = { id?: unknown; customer_code?: unknown };

/**
 * 功能：把唯一性冲突腿统一断成"恰 400 + 业务族机器码 + 拒因含实际值"三件套。
 * 调用方：产品编码、色号、客户编码三条重复腿。
 * 入参：result=apiCallExpectFail 原样透传的失败体；expectSubstring=必须出现在拒因里的实际值；
 *       context=点位描述，进断言消息。
 * 传给谁：断言消息，红了能直接区分门缺失与文案漂移。
 * 存什么：不落库，纯断言。
 * 存哪里：无写入。
 */
function expectDuplicateRejected(
  result: { status: number; code?: unknown; message?: unknown },
  expectSubstring: string,
  context: string
): void {
  const label =
    `${context}（实际 status=${result.status} code=${JSON.stringify(result.code)} ` +
    `message=${JSON.stringify(result.message)}）`;
  expect(result.status, `${label}：重复值应被拒且恰 400`).toBe(400);
  expect(result.code, `${label}：重复应走业务族机器码`).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
  expect(
    String(result.message ?? ''),
    `${label}：拒因必须外显实际值，否则分不清是哪一列重复`
  ).toContain(expectSubstring);
}

test.describe('505 主数据唯一性面', () => {
  test.describe.configure({ mode: 'serial' });

  test('重复产品编码被业务族点名拒绝且不落第二行', async ({ page }) => {
    await ensureTestEntities(page);
    const ctx = getCtx();
    if (!ctx.productIds || ctx.productIds.length === 0) {
      throw new Error('前置不成立：夹具未产出产品主键，无存量编码可复用');
    }
    const productId = ctx.productIds[0];
    const detail = await apiCallRaw<ProductRow>(page, 'GET', `/products/${productId}`);
    const existingCode = String(detail.code ?? '');
    if (!existingCode) {
      throw new Error(`前置不成立：夹具产品未回编码列，实际 ${JSON.stringify(detail)}`);
    }

    const dup = await apiCallExpectFail(page, 'POST', '/products', {
      code: existingCode,
      name: `505重复编码探针${existingCode}`,
      product_type: '辅料',
      unit: '米',
    });
    expectDuplicateRejected(dup, existingCode, '产品建档腿：同一编码第二次提交');

    const list = await apiCallRaw<{ items?: ProductRow[]; total?: number }>(
      page,
      'GET',
      '/products?page=1&page_size=200'
    );
    const total = Number(list.total ?? -1);
    if (total < 0 || total > 200) {
      throw new Error(`前置不成立：产品列表总数 ${total} 超出一页可读范围，无法按整表判定重复行数`);
    }
    const rows = (list.items ?? []).filter(r => String(r.code) === existingCode);
    expect(rows.length, `编码 ${existingCode} 在库里必须仍只有一行，实际 ${rows.length} 行`).toBe(
      1
    );
    expect(
      Number(rows[0].id),
      `那一行必须还是夹具原产品，实际 id=${String(rows[0].id)} 期望 ${productId}`
    ).toBe(productId);
  });

  test('同产品重复色号被拒但换色号放行，读回只有一行', async ({ page }) => {
    await ensureTestEntities(page);
    const ctx = getCtx();
    if (!ctx.productIds || ctx.productIds.length === 0) {
      throw new Error('前置不成立：夹具未产出产品主键，无法挂色号');
    }
    const productId = ctx.productIds[0];
    const dupNo = genCode('C505A');
    const otherNo = genCode('C505B');

    const first = await apiCall<{ id?: unknown }>(page, 'POST', `/products/${productId}/colors`, {
      color_no: dupNo,
      color_name: '505甲色',
      color_type: '常规色',
      extra_cost: 0,
    });
    const firstId = Number(first.data?.id);
    if (!Number.isInteger(firstId) || firstId <= 0) {
      throw new Error(`前置不成立：首次建色号未回真实主键，实际 ${JSON.stringify(first)}`);
    }

    const second = await apiCallExpectFail(page, 'POST', `/products/${productId}/colors`, {
      color_no: dupNo,
      color_name: '505重复色探针',
      color_type: '常规色',
      extra_cost: 0,
    });
    expectDuplicateRejected(second, dupNo, '色号腿：同一产品同一色号第二次提交');

    // 判据作用域是产品内的色号，换一枚色号必须照旧放行，否则门过宽会挡住日常建档
    const different = await apiCall<{ id?: unknown }>(
      page,
      'POST',
      `/products/${productId}/colors`,
      {
        color_no: otherNo,
        color_name: '505乙色',
        color_type: '常规色',
        extra_cost: 0,
      }
    );
    const differentId = Number(different.data?.id);
    if (!Number.isInteger(differentId) || differentId <= 0) {
      throw new Error(`不同色号被误挡：应照旧落库并回主键，实际 ${JSON.stringify(different)}`);
    }

    const colors = await apiCallRaw<ColorRow[]>(page, 'GET', `/products/${productId}/colors`);
    const hits = colors.filter(c => String(c.color_no) === dupNo);
    expect(hits.length, `色号 ${dupNo} 在该产品下必须只有一行，实际 ${hits.length} 行`).toBe(1);
    expect(
      Number(hits[0].id),
      `那一行必须是最初建的色号，实际 id=${String(hits[0].id)} 期望 ${firstId}`
    ).toBe(firstId);

    await apiCall(page, 'DELETE', `/products/${productId}/colors/${firstId}`);
    await apiCall(page, 'DELETE', `/products/${productId}/colors/${differentId}`);
    const after = await apiCallRaw<ColorRow[]>(page, 'GET', `/products/${productId}/colors`);
    expect(
      after.filter(
        c =>
          String(c.color_no).startsWith('505') ||
          String(c.color_no) === dupNo ||
          String(c.color_no) === otherNo
      ).length,
      '收尾后本产品不应残留本用例的色号行'
    ).toBe(0);
  });

  test('重复客户编码被固定文案拒绝且不落第二行', async ({ page }) => {
    await ensureTestEntities(page);
    const code = genCode('CU505');

    const created = await apiCall<{ id?: unknown }>(page, 'POST', '/customers', {
      customer_name: `505唯一性客户${code}`,
      customer_code: code,
    });
    const customerId = Number(created.data?.id);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      throw new Error(`前置不成立：自建客户未回真实主键，实际 ${JSON.stringify(created)}`);
    }

    const dup = await apiCallExpectFail(page, 'POST', '/customers', {
      customer_name: `505重复编码探针${code}`,
      customer_code: code,
    });
    expectDuplicateRejected(dup, code, '客户建档腿：同一客户编码第二次提交');

    const list = await apiCallRaw<{ items?: CustomerRow[]; total?: number }>(
      page,
      'GET',
      '/customers?page=1&page_size=200'
    );
    const total = Number(list.total ?? -1);
    if (total < 0 || total > 200) {
      throw new Error(`前置不成立：客户列表总数 ${total} 超出一页可读范围，无法按整表判定重复行数`);
    }
    const rows = (list.items ?? []).filter(r => String(r.customer_code) === code);
    expect(rows.length, `客户编码 ${code} 在库里必须只有一行，实际 ${rows.length} 行`).toBe(1);

    await apiCall(page, 'DELETE', `/customers/${customerId}`);
    const gone = await apiCallExpectFail(page, 'GET', `/customers/${customerId}`);
    expect(gone.status, `客户删除后按 id 回读必须 404，实际 ${gone.status}`).toBe(404);
  });
});
