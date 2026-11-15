// 产品批量写面三端点的 e2e 契约用例。
//
// 功能 钉批量创建、批量更新、批量删除三条写腿的真实落库、回滚方向与拒因。
// 调用方 CI 的 e2e 分片按文件粒度调度本文件，无其它调用方。
// 入参 无外部入参，前置由本用例经批量创建腿自建，不依赖库里既有行。
// 传给谁 断言结果只进 Playwright 报告，不写任何仓库文件。
// 存什么 不落盘制品，被测数据落 products 与其审计表。
// 存哪里 数据在 CI 现场数据库，报告在 Actions 制品。
//
// 覆盖面。本文件钉三段。
// 一、创建。合法批量落库后逐条回读；任一行必录或取值域不过即整体回滚，
// 首行合法也不得落库（与单条创建共用的 validate_product_create_fields 判据）；
// 超过 500 条在 DTO 长度门被拒。批量创建与更新是事务整体回滚，删除是逐条
// 部分成功，两者语义不同，分别钉死，不接受把删除也当成整体回滚。
// 二、更新。每匹米数按 RFC 7386 三态解释，键缺席保持、有值覆盖、显式 null 清空，
// 每腿回读对齐；不存在主键混入即整体回滚，合法行改动不得落库。
// 三、删除。合法批量删后详情必须 404；合法主键与不存在主键混入时逐条执行，
// 合法行真删、不存在行计失败，deleted 等于 total 减 failed。
//
// 事实来源。端点与方法对照 backend/src/routes/catalog.rs 的 products/batch 路由族。
// 批量响应形状与三条完成文案取自 backend/src/handlers/bulk_product_handler.rs，
// 整体回滚与逐条删除语义取自 backend/src/services/batch_service.rs，
// 必录与取值域拒因取自 backend/src/services/product_service.rs。
// 产品类型词表（坯布、成品布、辅料）是写入侧字面值，辅料非面料类只必录名称编号类型，
// 面料类另必录幅宽克重成分。全部打真实后端，不用 route mock，不用宽松断言掩盖源码问题。
import { test, expect } from '../diagnose-fixture';
import {
  loginViaUI,
  ensureTestEntities,
  apiCall,
  apiCallExpectFail,
  genCode,
  failureCode,
  APP_ERROR_CODES,
} from './helpers';

/** 批量创建与更新出参里 data 数组的元素形状，键名逐字对照 handler 的 serde_json::json */
interface BatchProductRow {
  id: number;
  name: string;
  code: string;
  category_id: number | null;
  status: string;
}

/** 批量响应外壳，删除腿 data 为 null，创建更新腿 data 为数组 */
interface BatchPayload {
  success: boolean;
  total: number;
  created: number;
  updated: number;
  deleted: number;
  failed: number;
  data: BatchProductRow[] | null;
  errors: string[] | null;
}

/** 产品详情回读形状，DECIMAL 列序列化为十进制字符串，可空列为 null */
interface ProductRow {
  id: number;
  name: string;
  code: string;
  status: string;
  meters_per_piece: string | null;
}

/** 产品列表信封，分页四键由 PaginatedResponse 产出 */
interface ProductPage {
  items: ProductRow[];
  total: number;
  page: number;
  page_size: number;
}

test.describe('产品批量写面 创建回滚 更新三态 删除部分成功', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  /** 一条合法的辅料建品入参，辅料非面料类只必录名称编号类型 */
  function validProduct(code: string): Record<string, unknown> {
    return { name: `批量产品-${code}`, code, product_type: '辅料', unit: '米' };
  }

  /** 经批量创建腿自建若干产品，返回落库后的真实行，作为更新删除腿前置 */
  async function seedProducts(
    page: import('@playwright/test').Page,
    count: number,
    extra?: Record<string, unknown>
  ): Promise<BatchProductRow[]> {
    const products = Array.from({ length: count }, () => ({
      ...validProduct(genCode('P485')),
      ...extra,
    }));
    const res = await apiCall<BatchPayload>(page, 'POST', '/products/batch/create', { products });
    expect(res.message).toBe('批量创建产品完成');
    expect(res.data.success).toBe(true);
    expect(res.data.created).toBe(count);
    expect(res.data.data).toBeTruthy();
    expect(res.data.data!.length).toBe(count);
    return res.data.data!;
  }

  /** 详情回读，写腿之后一律走它而不是复用写腿自己的出参 */
  async function readProduct(
    page: import('@playwright/test').Page,
    id: number
  ): Promise<ProductRow> {
    const res = await apiCall<ProductRow>(page, 'GET', `/products/${id}`);
    expect(res.data.id).toBe(id);
    return res.data;
  }

  test('485-01 创建 合法批量逐条落库且详情回读对齐', async ({ page }) => {
    const rows = await seedProducts(page, 2);
    expect(rows[0].code).toMatch(/^P485-/);
    expect(rows[1].code).toMatch(/^P485-/);
    expect(rows[0].id).not.toBe(rows[1].id);
    for (const row of rows) {
      const back = await readProduct(page, row.id);
      expect(back.name).toBe(row.name);
      expect(back.code).toBe(row.code);
    }
  });

  test('485-02 创建 次行缺产品类型整体回滚首行也不落库', async ({ page }) => {
    const firstCode = genCode('P485');
    const secondCode = genCode('P485');
    const res = await apiCall<BatchPayload>(page, 'POST', '/products/batch/create', {
      products: [validProduct(firstCode), { name: `缺类型-${secondCode}`, code: secondCode }],
    });
    // 业务失败仍走 200 信封，success 与计数才是判据，不得只看 HTTP 状态
    expect(res.data.success).toBe(false);
    expect(res.data.total).toBe(2);
    expect(res.data.created).toBe(0);
    expect(res.data.failed).toBe(1);
    expect(res.data.data === null || res.data.data.length === 0).toBe(true);
    expect(res.data.errors).toBeTruthy();
    expect(res.data.errors!.length).toBe(1);
    expect(res.data.errors![0]).toContain('索引 1');
    expect(res.data.errors![0]).toContain('新建产品必须显式提交产品类型');
    // 反向对照。首行合法但整体回滚，按唯一名称搜索必须零行，证明不是部分写入。
    // 列表过滤走查询串而非请求体，后端以 Query 提取器读 search，故拼进路径。
    const search = await apiCall<ProductPage>(
      page,
      'GET',
      `/products/select?search=${encodeURIComponent(`批量产品-${firstCode}`)}&page=1&page_size=10`
    );
    expect(search.data.total).toBe(0);
  });

  test('485-03 创建 面料类缺幅宽被取值域门拒且点名幅宽', async ({ page }) => {
    const code = genCode('P485');
    const res = await apiCall<BatchPayload>(page, 'POST', '/products/batch/create', {
      products: [
        {
          name: `面料-${code}`,
          code,
          product_type: '成品布',
          gram_weight: 200,
          fabric_composition: '涤纶100%',
        },
      ],
    });
    expect(res.data.success).toBe(false);
    expect(res.data.created).toBe(0);
    expect(res.data.errors).toBeTruthy();
    expect(res.data.errors![0]).toContain('索引 0');
    expect(res.data.errors![0]).toContain('幅宽');
  });

  test('485-04 创建 超过五百条在长度门被拒', async ({ page }) => {
    const products = Array.from({ length: 501 }, () => validProduct(genCode('P485')));
    const res = await apiCallExpectFail(page, 'POST', '/products/batch/create', { products });
    expect(res.status).toBe(400);
    // DTO 的 validate() 错误经 validator::ValidationErrors 的统一转换出参，
    // 机器码固定 VALIDATION_ERROR，文案是 DTO 上声明的那句中文，不另起第二套口径。
    expect(failureCode(res)).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
    expect(res.message).toContain('批量创建产品数量不能超过 500 条');
  });

  test('485-05 更新 每匹米数键缺席保持有值覆盖显式 null 清空', async ({ page }) => {
    const [row] = await seedProducts(page, 1, { meters_per_piece: 30 });
    const original = await readProduct(page, row.id);
    expect(Number(original.meters_per_piece)).toBe(30);

    // 只改名称，每匹米数键缺席必须保持原值
    const newName = `改名-${genCode('P485')}`;
    const keep = await apiCall<BatchPayload>(page, 'POST', '/products/batch/update', {
      products: [{ id: row.id, name: newName }],
    });
    expect(keep.message).toBe('批量更新产品完成');
    expect(keep.data.success).toBe(true);
    expect(keep.data.updated).toBe(1);
    const afterKeep = await readProduct(page, row.id);
    expect(afterKeep.name).toBe(newName);
    expect(Number(afterKeep.meters_per_piece)).toBe(30);

    // 有值覆盖
    await apiCall(page, 'POST', '/products/batch/update', {
      products: [{ id: row.id, meters_per_piece: 50 }],
    });
    const afterSet = await readProduct(page, row.id);
    expect(Number(afterSet.meters_per_piece)).toBe(50);

    // 显式 null 清空，出参必须是 null 而不是旧值残留
    await apiCall(page, 'POST', '/products/batch/update', {
      products: [{ id: row.id, meters_per_piece: null }],
    });
    const afterNull = await readProduct(page, row.id);
    expect(afterNull.meters_per_piece).toBeNull();
    expect(afterNull.name).toBe(newName);
  });

  test('485-06 更新 不存在主键混入整体回滚合法行不动', async ({ page }) => {
    const [row] = await seedProducts(page, 1);
    const original = await readProduct(page, row.id);
    const absentId = 2147483647;
    const res = await apiCall<BatchPayload>(page, 'POST', '/products/batch/update', {
      products: [
        { id: row.id, name: `应被回滚-${genCode('P485')}` },
        { id: absentId, name: '不存在' },
      ],
    });
    expect(res.data.success).toBe(false);
    expect(res.data.updated).toBe(0);
    expect(res.data.errors).toBeTruthy();
    expect(
      res.data.errors!.some(e => e.includes('索引 1') && e.includes(`产品 ID ${absentId} 不存在`))
    ).toBe(true);
    // 反向对照。合法行的改名必须随整体回滚消失
    const back = await readProduct(page, row.id);
    expect(back.name).toBe(original.name);
  });

  test('485-07 删除 合法批量删后详情两侧都 404', async ({ page }) => {
    const rows = await seedProducts(page, 2);
    const res = await apiCall<BatchPayload>(page, 'POST', '/products/batch/delete', {
      ids: [rows[0].id, rows[1].id],
    });
    expect(res.message).toBe('批量删除产品完成');
    expect(res.data.success).toBe(true);
    expect(res.data.total).toBe(2);
    expect(res.data.deleted).toBe(2);
    expect(res.data.failed).toBe(0);
    for (const row of rows) {
      const gone = await apiCallExpectFail(page, 'GET', `/products/${row.id}`);
      expect(gone.status).toBe(404);
      expect(failureCode(gone)).toBe(APP_ERROR_CODES.NOT_FOUND);
    }
  });

  test('485-08 删除 合法与不存在主键混入逐条部分成功', async ({ page }) => {
    const [row] = await seedProducts(page, 1);
    const absentId = 2147483647;
    const res = await apiCall<BatchPayload>(page, 'POST', '/products/batch/delete', {
      ids: [row.id, absentId],
    });
    // 删除腿逐条执行而非整体回滚，合法行真删、不存在行计失败
    expect(res.data.success).toBe(false);
    expect(res.data.total).toBe(2);
    expect(res.data.failed).toBe(1);
    expect(res.data.deleted).toBe(1);
    expect(res.data.errors).toBeTruthy();
    expect(res.data.errors!.length).toBe(1);
    expect(res.data.errors![0]).toContain('索引 1');
    const gone = await apiCallExpectFail(page, 'GET', `/products/${row.id}`);
    expect(gone.status).toBe(404);
  });
});
