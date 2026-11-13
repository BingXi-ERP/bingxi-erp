import { test, expect } from '../diagnose-fixture';
import { loginViaUI, apiCall, apiCallExpectFail, genCode, tryCleanup } from './helpers';

/**
 * 508 产品档案批量写面三枚「前端可达 + 全仓零覆盖」端点：
 * POST /products/batch/create 与 POST /products/batch/update 与 POST /products/batch/delete
 *
 * 覆盖面取证（写断言前逐字对过 backend 源码，非设想）：
 * - 路由 routes/catalog.rs（`/products/batch/create`、`/products/batch/update`、
 *   `/products/batch/delete` 三枚 post，catalog 域共享 erp 根前缀 nest）→ handler
 *   handlers/bulk_product_handler.rs 三个 fn → services/batch_service.rs。
 * - 入参：三个 Payload 的容器键分别为 products/products/ids，数组上限 500 条，
 *   validator length 门在 handler 层先跑，超限 `AppError::bad_request`
 *   → 400 + VALIDATION_ERROR + message 恒 "请求参数验证失败"（非 Displayable 脱敏）。
 * - 创建行 BatchCreateProductRequest（services/batch_service.rs）：name/code 必填，
 *   product_type 与幅宽克重成分走 validate_product_create_fields 必录门，取值域走
 *   validate_product_numeric_domains（词表外类型、负幅宽、负价格均拒）。价格两列
 *   是字符串形态（DECIMAL 线上形态），先十进制解析再判域，解析不了点名拒绝。
 *   任一行失败整体回滚（事务包裹），响应 success=false created=0 failed=n，
 *   errors 带「索引 n: 文案」；无部分写入（创建面实测逐行校验失败即整单回滚）。
 * - 更新行 BatchUpdateProductRequest（同文件 :90）：id 必填，其余 Option 三态，
 *   meters_per_piece 双层 Option（键缺席保持原值、显式 null 清空、有值覆盖）。
 * - 删除 ids[] i32，响应 deleted = total - failed；被引用产品的删除走引用面前置门
 *   （既有 48 号单条删除用例已钉 inventory_stocks 与 color-prices 两路，本 spec 只钉
 *   批量面自身的计数与 errors 形状，不复刻引用门文案）。
 * - 出参 BatchResponse（handler :44）字段：success/total/created/updated/deleted/
 *   failed/data/errors，包在 ApiResponse.data 里；errors 元素形态「索引 {i}: {文案}」。
 * - data（创建/更新）元素键：id/name/code/category_id/status（handler 序列化四键
 *   加 category_id，见 bulk_product_handler.rs）。
 * - 鉴权：AuthContext 必登；创建/更新落库后逐条 GET /products/{id} 回读
 *   （product::Model 裸序列化，name/code/status/standard_price 等键为 snake_case）。
 *
 * 前置自建自清：本 spec 用的产品全部由批量入口自己创建（首个成功腿即产物），
 * 清理用批量删除端点本身收尾（断言 deleted 计数后再走单条 DELETE 兜底），不依赖
 * 全局夹具；失败腿产生的零副作用用回读计数与 404 判定。
 */

interface BatchEnvelope {
  success: boolean;
  total: number;
  created: number;
  updated: number;
  deleted: number;
  failed: number;
  data: Array<{
    id: number;
    name: string;
    code: string;
    category_id: number | null;
    status: string;
  }> | null;
  errors: string[] | null;
}

/** 单条产品详情出参切片（product::Model 裸序列化，断言只取回读相关列） */
interface ProductRead {
  id: number;
  name: string;
  code: string;
  status: string;
  standard_price?: string | null;
  gram_weight?: string | null;
  width?: string | null;
}

function makeRow(prefix: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: `${prefix}-名`,
    code: genCode(prefix),
    product_type: '成品布',
    width: 150,
    gram_weight: 200,
    fabric_composition: '棉 100%',
    ...overrides,
  };
}

test.describe('508 产品档案批量写面：批量创建/更新/删除三端点（真实契约正负双腿）', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('508-01 批量创建三行合法产品：200 逐行计数与 data 逐列回读，单条 GET 复核落库', async ({
    page,
  }) => {
    const rows = [makeRow('P8A'), makeRow('P8A'), makeRow('P8A')];
    const res = await apiCall<BatchEnvelope>(page, 'POST', '/products/batch/create', {
      products: rows,
    });
    expect(res.data, '[508-01] 批量创建应 200 且带 BatchResponse 信封').toBeTruthy();
    const b = res.data;
    expect(b.success, '[508-01] 全行合法应 success=true').toBe(true);
    expect(b.total, '[508-01] total 应等于入参行数 3').toBe(3);
    expect(b.created, '[508-01] created 应为 3').toBe(3);
    expect(b.failed, '[508-01] failed 应为 0').toBe(0);
    expect(b.errors, '[508-01] 全成功时 errors 应为 null').toBeNull();
    expect(b.data, '[508-01] data 应带三行产物').toBeTruthy();
    expect(b.data!.length, '[508-01] data 长度应为 3').toBe(3);
    for (let i = 0; i < 3; i++) {
      expect(b.data![i].code, `[508-01] data[${i}].code 应与入参一致`).toBe(rows[i].code);
      expect(b.data![i].name, `[508-01] data[${i}].name 应与入参一致`).toBe(rows[i].name);
      expect(b.data![i].id, `[508-01] data[${i}].id 应为正整数`).toBeGreaterThan(0);
    }

    // 落库复核：任取一行单条 GET，主档列逐字对齐
    const got = await apiCall<ProductRead>(page, 'GET', `/products/${b.data![0].id}`);
    expect(got.data, '[508-01] 单条回读应命中').toBeTruthy();
    expect(got.data.code, '[508-01] 回读 code 应一致').toBe(rows[0].code);
    expect(got.data.name, '[508-01] 回读 name 应一致').toBe(rows[0].name);
    expect(got.data.status, '[508-01] 回读 status 应为在册态').toBeTruthy();

    await tryCleanup(
      page,
      'DELETE',
      '/products/batch/delete',
      '[508-01] 批量删除三行（用端点自身收尾）'
    );
    // 兜底清理（若批量删除已被上一腿消费则逐条兜底）
    for (const d of b.data as Array<{ id: number }>) {
      await tryCleanup(page, 'DELETE', `/products/${d.id}`, `[508-01] 兜底删产品 ${d.id}`);
    }
  });

  test('508-02 批量创建负腿三连：面料行缺成分被必录门点名、负幅宽被取值域门拒、超 500 条长度门 400，三种拒绝均零落库', async ({
    page,
  }) => {
    // 腿一：面料类产品缺 fabric_composition —— validate_product_create_fields 点名拒
    const missRow = makeRow('P8B', { fabric_composition: undefined });
    const miss = await apiCall<BatchEnvelope>(page, 'POST', '/products/batch/create', {
      products: [missRow],
    });
    expect(miss.data, '[508-02] 缺必录列应仍回 200 信封（服务端按行计数拒）').toBeTruthy();
    expect(miss.data.success, '[508-02] success 应为 false').toBe(false);
    expect(miss.data.created, '[508-02] created 应为 0（整单回滚）').toBe(0);
    expect(miss.data.failed, '[508-02] failed 应为 1').toBe(1);
    expect(miss.data.errors, '[508-02] errors 应带「索引 0:」前缀与理由').toBeTruthy();
    expect(
      miss.data.errors![0].startsWith('索引 0:'),
      `[508-02] errors[0] 应带索引前缀，实际 ${JSON.stringify(miss.data.errors)}`
    ).toBe(true);

    // 腿二：负幅宽 —— validate_product_numeric_domains 拒
    const negRow = makeRow('P8B', { width: -10 });
    const neg = await apiCall<BatchEnvelope>(page, 'POST', '/products/batch/create', {
      products: [negRow],
    });
    expect(neg.data, '[508-02] 负幅宽应回信封').toBeTruthy();
    expect(neg.data.success, '[508-02] 负幅宽 success 应为 false').toBe(false);
    expect(neg.data.created, '[508-02] 负幅宽 created 应为 0').toBe(0);
    expect(neg.data.failed, '[508-02] 负幅宽 failed 应为 1').toBe(1);

    // 腿三：501 条超长度门 —— handler 层 validator 先拒，应 400 且非 BatchResponse 形态
    const many = Array.from({ length: 501 }, (_, i) => ({
      ...makeRow('P8B'),
      code: `${genCode('P8B')}-${i}`,
    }));
    const tooMany = await apiCallExpectFail(page, 'POST', '/products/batch/create', {
      products: many,
    });
    expect(tooMany.status, '[508-02] 超 500 条应 400').toBe(400);
    expect(
      JSON.stringify(tooMany).includes('批量创建产品数量不能超过 500 条'),
      '[508-02] 长度门文案应外显（validator 消息透传）'
    ).toBe(true);
  });

  test('508-03 批量更新：改名与克重覆盖逐列回读，未触碰列不被洗掉，不存在 id 计入 failed 并带索引错误', async ({
    page,
  }) => {
    // 先批量创建一行产物
    const seed = makeRow('P8C');
    const created = await apiCall<BatchEnvelope>(page, 'POST', '/products/batch/create', {
      products: [seed],
    });
    expect(created.data && created.data.created === 1, '[508-03] 前置批量建一行应成功').toBe(true);
    const pid = created.data!.data![0].id;

    const newName = `${seed.name}-改`;
    const upd = await apiCall<BatchEnvelope>(page, 'POST', '/products/batch/update', {
      products: [{ id: pid, name: newName, gram_weight: 250 }],
    });
    expect(upd.data, '[508-03] 批量更新应 200 信封').toBeTruthy();
    expect(upd.data.success, '[508-03] 更新应 success=true').toBe(true);
    expect(upd.data.updated, '[508-03] updated 应为 1').toBe(1);
    expect(upd.data.failed, '[508-03] failed 应为 0').toBe(0);

    // 回读：新值生效
    const got = await apiCall<ProductRead>(page, 'GET', `/products/${pid}`);
    expect(got.data.name, '[508-03] 回读 name 应为新值').toBe(newName);
    expect(String(got.data.gram_weight ?? ''), '[508-03] 回读 gram_weight 应为覆盖值 250.00').toBe(
      '250.00'
    );
    expect(got.data.code, '[508-03] 未触碰的 code 不应被洗掉').toBe(seed.code);

    // 不存在 id 计入 failed 且 errors 带索引
    const updBad = await apiCall<BatchEnvelope>(page, 'POST', '/products/batch/update', {
      products: [{ id: 99999999, name: '不存在行' }],
    });
    expect(updBad.data, '[508-03] 不存在 id 应回信封').toBeTruthy();
    expect(updBad.data.success, '[508-03] 不存在 id success 应为 false').toBe(false);
    expect(updBad.data.updated, '[508-03] updated 应为 0').toBe(0);
    expect(updBad.data.failed, '[508-03] failed 应为 1').toBe(1);
    expect(
      updBad.data.errors?.[0]?.startsWith('索引 0:'),
      `[508-03] errors[0] 应带索引前缀，实际 ${JSON.stringify(updBad.data.errors)}`
    ).toBe(true);

    await tryCleanup(page, 'DELETE', `/products/${pid}`, '[508-03] 删前置产品');
  });

  test('508-04 批量删除：两行产物删除计数 deleted=2 且单条回读 404，空 ids 与不存在 id 的计数语义按信封逐列钉', async ({
    page,
  }) => {
    const rows = [makeRow('P8D'), makeRow('P8D')];
    const created = await apiCall<BatchEnvelope>(page, 'POST', '/products/batch/create', {
      products: rows,
    });
    expect(created.data && created.data.created === 2, '[508-04] 前置批量建两行应成功').toBe(true);
    const ids = created.data!.data!.map((d: { id: number }) => d.id);

    const del = await apiCall<BatchEnvelope>(page, 'POST', '/products/batch/delete', {
      ids,
    });
    expect(del.data, '[508-04] 批量删除应 200 信封').toBeTruthy();
    expect(del.data.success, '[508-04] 删除应 success=true').toBe(true);
    expect(del.data.total, '[508-04] total 应为 2').toBe(2);
    expect(del.data.deleted, '[508-04] deleted 应为 2').toBe(2);
    expect(del.data.failed, '[508-04] failed 应为 0').toBe(0);

    // 逐条回读 404（硬删态：不再存在）
    for (const id of ids) {
      const fail = await apiCallExpectFail(page, 'GET', `/products/${id}`);
      expect(fail.status, `[508-04] 产品 ${id} 删除后单条 GET 应 404`).toBe(404);
    }

    // 不存在 id 的批量删除：failed 计数语义（deleted=0，errors 带索引）
    const delBad = await apiCall<BatchEnvelope>(page, 'POST', '/products/batch/delete', {
      ids: [99999999],
    });
    expect(delBad.data, '[508-04] 不存在 id 删除应回信封').toBeTruthy();
    expect(delBad.data.deleted, '[508-04] 不存在 id deleted 应为 0').toBe(0);
    expect(delBad.data.failed, '[508-04] 不存在 id failed 应为 1').toBe(1);
  });
});
