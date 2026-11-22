/**
 * 528 批量质量预测 21 条上限与零写入。
 *
 * 功能：钉住 POST /ai/quality-predictions/batch 的批量条数门，验证超限请求在 AI 推理
 * 和持久化之前被拒，且按产品回读的预测集合逐字段零变化。
 * 调用方：Playwright E2E 套件，由 CI 的 e2e enhanced 分片按文件哈希收集执行。
 * 入参：登录走 loginViaUI 的 admin 会话，产品分类走 ensureTestEntities 与 getCtx 的
 * productCategoryIds，产品编码走 genCode，不手造主键、不复用共享产品历史行。
 * 传给谁：请求经 flow/helpers 的 apiCall、apiCallRaw、apiCallExpectFail 发出，
 * 机器码由 failureCode 读取，路径均相对前端 baseURL /api/v1/erp。
 * 存什么：仅建一张唯一产品用于隔离；批量超限负例不得落 quality_prediction 行。
 * 存哪里：产品行落 PostgreSQL products 表并在断言后软删；预测集合经真实 GET 回读。
 *
 * 判据出处：路由在 frontend/scripts/route-snapshot.txt:1020（batch）与 :157（by-product）；
 * handler 在 backend/src/handlers/ai_extend_handler.rs:462-475，body.requests.len()>20
 * 在遍历 svc.create_quality_prediction 之前直接 validation_displayable，故 21 条请求
 * 必然先被 400 + VALIDATION_ERROR 拒绝，不进入推理、不产生半批写入。
 * CreateQualityPredDto 见 backend/src/services/ai_extend_service.rs:97-101，内层
 * QualityPredRequest 的 product_id 等字段见 backend/src/services/ai/quality_pred.rs:53-71，
 * 全为 Option，故 `{request:{product_id}}` 足以触发条数门且不需构造推理特征。
 * by-product handler 见 ai_extend_handler.rs:359-385，固定出参 `{"items": Vec<...>}`，
 * 不是 PaginatedResponse；service 按 ProductId 与 CreatedBy 数据范围过滤，故用自建产品
 * 隔离并发噪声。产品建单字段照 PRODUCT_TYPE 单源常量，避免产品字段静态门盲区。
 */
import { test, expect } from '../diagnose-fixture';
import { PRODUCT_TYPE } from '../../src/constants/product-type';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
  loginViaUI,
  tryCleanup,
} from '../flow/helpers';

type ProductRow = Record<string, unknown>;
type PredictionItems = { items?: unknown };

function requirePositiveId(value: unknown, label: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`${label}：期望正整数 id，实际 ${JSON.stringify(value)}`);
  }
  return id;
}

function requireItems(body: PredictionItems, label: string): unknown[] {
  if (!Array.isArray(body.items)) {
    throw new Error(
      `${label}：by-product 信封缺 items 数组键，实际 ${JSON.stringify(body).slice(0, 160)}`
    );
  }
  return body.items;
}

test('528-01 批量质量预测 21 条被前置拒绝且按产品零写入', async ({ page }) => {
  const tag = 'E528QLTY';
  await loginViaUI(page);
  await ensureTestEntities(page);
  const ctx = getCtx();
  const categoryId = requirePositiveId(ctx.productCategoryIds[0], `${tag} 产品分类前置`);
  const code = genCode('E528P');
  let productId: number | undefined;

  try {
    const created = await apiCall<{ id?: number }>(page, 'POST', '/products', {
      code,
      name: genCode('E528N'),
      category_id: categoryId,
      unit: '米',
      product_type: PRODUCT_TYPE.auxiliary,
    });
    productId = requirePositiveId(created.data?.id, `${tag} 建产品`);
    const product = await apiCallRaw<ProductRow>(page, 'GET', `/products/${productId}`);
    expect(String(product.code), `${tag} 产品回读 code`).toBe(code);
    expect(Number(product.category_id), `${tag} 产品回读分类`).toBe(categoryId);

    const path = `/ai/quality-predictions/by-product?product_id=${productId}&limit=20`;
    const before = requireItems(
      await apiCallRaw<PredictionItems>(page, 'GET', path),
      `${tag} 基线`
    );
    expect(before, `${tag} 自建产品基线必须为空`).toEqual([]);

    const failure = await apiCallExpectFail(page, 'POST', '/ai/quality-predictions/batch', {
      requests: Array.from({ length: 21 }, () => ({ request: { product_id: productId } })),
    });
    expect(failure.status, `${tag} 超限批量应 400，实际 ${failure.status}`).toBe(400);
    expect(
      failureCode(failure),
      `${tag} 超限批量机器码，实际 ${String(failure.code)} message=${String(failure.message)}`
    ).toBe(APP_ERROR_CODES.VALIDATION_ERROR);

    const after = requireItems(
      await apiCallRaw<PredictionItems>(page, 'GET', path),
      `${tag} 拒后回读`
    );
    expect(after, `${tag} 超限请求不得产生任何按产品可见的预测行`).toEqual(before);
  } finally {
    if (productId) {
      await tryCleanup(page, 'DELETE', `/products/${productId}`, `${tag} 产品 ${productId}`);
    }
  }
});
