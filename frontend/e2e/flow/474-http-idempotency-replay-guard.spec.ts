/**
 * 474 请求级幂等重放防护面
 *
 * 目标：补 4.2「并发创建单据，重复提交拦截」与 4.1 H 段「重复点击保存按钮：接口幂等，
 * 不生成两条相同单据」「抓包重放审批请求，重复提交不产生重复动作」在服务端 HTTP 层的缺口。
 * 此前 HTTP 侧没有任何请求级去重防线：同一写请求被重放两次就会落两条数据或跑两次副作用。
 *
 * 契约事实（比较值一律照抄写入方）：
 * 1. 只有带 Idempotency-Key 请求头的 POST / PUT / PATCH / DELETE 进门，判据作用域是
 *    (登录账号, 幂等键)，键只在提交者自己名下唯一；不带该头的请求逐字节不变，
 *    所以本用例同时验一条不带键的腿必须照旧放行。
 * 2. 同键同内容且上一次已受理成功，第二次由门拒在分发之前，拒因是业务族且点名幂等键；
 *    读了门自己的文案，才不会把"编码重复"这类建档层的拒绝误当成幂等门生效（两条腿文案不同）。
 * 3. 同键但内容（方法 / 路径 / 请求体）变了，判键复用拒绝对外要求换新键，
 *    且第二次提交根本不会进 handler，库里不许出现第二行。
 * 4. 上一次没被受理（校验或业务拒绝）时占位释放，同一把键改完内容必须能重试成功，
 *    否则操作者改一次字段就得换一次键，防护退化成不可用的墙。
 *
 * 前置全部由本用例自建（每次取新的产品编码与新的幂等键），收尾删掉自建行并读回校验，
 * 不给库里留残留，也不依赖库里恰好有什么。
 */
import { test, expect } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  genCode,
  type ApiFailureResult,
} from './helpers';

type ProductRow = { id?: unknown; code?: unknown; name?: unknown };

type CreateProductBody = {
  code: string;
  name: string;
  product_type: string;
  unit: string;
};

/**
 * 功能：构造一条字段齐全、编码唯一的产品建档请求体。
 * 调用方：本文件的四条幂等腿。
 * 入参：code=已生成的唯一编码；name=随编码变化的品名，保证不同腿的内容指纹不同。
 * 传给谁：直接作为产品建档 POST 的请求体。
 * 存什么：不落库，只组装载荷。
 * 存哪里：无写入。
 */
function productBody(code: string, name: string): CreateProductBody {
  return { code, name, product_type: '辅料', unit: '米' };
}

/**
 * 功能：把幂等门的拒绝腿统一断成"恰 400 + 业务族机器码 + 拒因点名幂等键"三件套。
 * 调用方：重放腿、键复用腿。
 * 入参：result=apiCallExpectFail 原样透传的失败体；idempotencyKey=必须出现在拒因里的键；
 *       mustContain=本腿专属的判据词（重复提交 / 新的幂等键）；context=点位描述。
 * 传给谁：断言消息，红了能直接区分门缺失、拒因漂移与文案串腿。
 * 存什么：不落库，纯断言。
 * 存哪里：无写入。
 */
function expectIdempotencyRejected(
  result: ApiFailureResult,
  idempotencyKey: string,
  mustContain: string,
  context: string
): void {
  expect(result.status, `${context}：幂等门应拒在分发之前，给 400 而不是 500`).toBe(400);
  // 失败体的 code / message 在未收窄的 ApiFailureBody 里是可选字段：缺键时必须判红，
  // 所以这里只把值读成字符串参与比较，缺键会落成 "undefined" 让下面的断言自然失败。
  const code = String(result.code);
  const message = String(result.message);
  expect(code, `${context}：拒因应走业务族机器码，实际 code=${code} message=${message}`).toBe(
    APP_ERROR_CODES.BUSINESS_ERROR
  );
  expect(
    message,
    `${context}：拒因应点名幂等键 ${idempotencyKey}，实际 message=${message}`
  ).toContain(idempotencyKey);
  expect(
    message,
    `${context}：拒因应含判据词「${mustContain}」，实际 message=${message}`
  ).toContain(mustContain);
}

/**
 * 功能：按编码读回产品全表命中行数，用于证明重复提交没有落第二行。
 * 调用方：三条落库判据腿。
 * 入参：page=已登录会话；code=目标产品编码。
 * 传给谁：调用方做行数断言。
 * 存什么：不发写请求，只读产品列表分页。
 * 存哪里：无写入。
 */
async function countProductsByCode(page: import('@playwright/test').Page, code: string) {
  const list = await apiCallRaw<{ items?: ProductRow[]; total?: number }>(
    page,
    'GET',
    '/products?page=1&page_size=200'
  );
  const rows = list.items;
  if (!Array.isArray(rows)) {
    throw new Error(
      `前置不成立：产品列表未回 items 数组，实际 ${JSON.stringify(list).slice(0, 200)}`
    );
  }
  if (typeof list.total === 'number' && list.total > 200) {
    throw new Error(
      `前置不成立：产品总数 ${list.total} 超过单页读取上限，按编码计数会漏行，不改断言阈值凑绿`
    );
  }
  return rows.filter(r => String(r.code) === code);
}

/**
 * 功能：删除本用例自建的产品并读回确认行已消失。
 * 调用方：每条建成功的产品腿收尾。
 * 入参：page=已登录会话；productId=建档回传的真实主键；code=用于读回过滤的编码。
 * 传给谁：DELETE 产品端点，随后读回列表。
 * 存什么：不新增数据，只做收尾删除与校验。
 * 存哪里：无写入。
 */
async function cleanupProduct(
  page: import('@playwright/test').Page,
  productId: number,
  code: string
): Promise<void> {
  await apiCall(page, 'DELETE', `/products/${productId}`);
  const after = await countProductsByCode(page, code);
  expect(after.length, `收尾后编码 ${code} 不应残留产品行`).toBe(0);
}

test.describe('474 请求级幂等重放防护面', () => {
  test('带键首提交落库，同键原样重放被门拒且只有一行', async ({ page }) => {
    const code = genCode('C474A');
    const idempotencyKey = genCode('K474A');
    const body = productBody(code, `474幂等甲品${code}`);

    const first = await apiCall<{ id?: unknown }>(page, 'POST', '/products', body, {
      'Idempotency-Key': idempotencyKey,
    });
    const firstId = Number(first.data?.id);
    if (!Number.isInteger(firstId) || firstId <= 0) {
      throw new Error(`前置不成立：带键首提交未回真实主键，实际 ${JSON.stringify(first)}`);
    }

    const replay = await apiCallExpectFail(page, 'POST', '/products', body, {
      'Idempotency-Key': idempotencyKey,
    });
    expectIdempotencyRejected(replay, idempotencyKey, '重复提交', '重放腿：同键同内容第二次提交');

    const hits = await countProductsByCode(page, code);
    expect(hits.length, `幂等键 ${idempotencyKey} 下编码 ${code} 必须只有一行`).toBe(1);
    expect(
      Number(hits[0].id),
      `那一行必须是首提交建出的产品，实际 id=${String(hits[0].id)} 期望 ${firstId}`
    ).toBe(firstId);

    await cleanupProduct(page, firstId, code);
  });

  test('同键换内容判键复用，两次意图不许混成一次且第二次不落库', async ({ page }) => {
    const codeA = genCode('C474B');
    const codeB = genCode('C474C');
    const idempotencyKey = genCode('K474B');

    const first = await apiCall<{ id?: unknown }>(
      page,
      'POST',
      '/products',
      productBody(codeA, `474乙甲${codeA}`),
      {
        'Idempotency-Key': idempotencyKey,
      }
    );
    const firstId = Number(first.data?.id);
    if (!Number.isInteger(firstId) || firstId <= 0) {
      throw new Error(`前置不成立：同键首提交未回真实主键，实际 ${JSON.stringify(first)}`);
    }

    const reused = await apiCallExpectFail(
      page,
      'POST',
      '/products',
      productBody(codeB, `474乙乙${codeB}`),
      { 'Idempotency-Key': idempotencyKey }
    );
    expectIdempotencyRejected(reused, idempotencyKey, '新的幂等键', '键复用腿：同键换了请求内容');

    expect(
      (await countProductsByCode(page, codeB)).length,
      `被门拒掉的第二次提交不该进 handler，编码 ${codeB} 应为 0 行`
    ).toBe(0);

    await cleanupProduct(page, firstId, codeA);
  });

  test('未受理的同键提交允许改后重试，换一把键也能并行建档', async ({ page }) => {
    const badCode = genCode('C474D');
    const goodCode = genCode('C474E');
    const otherCode = genCode('C474F');
    const idempotencyKey = genCode('K474D');
    const otherKey = genCode('K474E');

    const missingName = { code: badCode, product_type: '辅料', unit: '米' };
    const rejected = await apiCallExpectFail(page, 'POST', '/products', missingName, {
      'Idempotency-Key': idempotencyKey,
    });
    expect(
      rejected.status,
      `前置不成立：缺品名的建档本应被服务端拒，实际 status=${rejected.status} message=${rejected.message}`
    ).toBe(400);
    expect(
      (await countProductsByCode(page, badCode)).length,
      `被拒的第一次提交不该落库，编码 ${badCode} 应为 0 行`
    ).toBe(0);

    const retry = await apiCall<{ id?: unknown }>(
      page,
      'POST',
      '/products',
      productBody(goodCode, `474丙改后${goodCode}`),
      { 'Idempotency-Key': idempotencyKey }
    );
    const retryId = Number(retry.data?.id);
    if (!Number.isInteger(retryId) || retryId <= 0) {
      throw new Error(
        `未受理的提交应允许同键改后重试：实际 ${JSON.stringify(retry)}，前一次拒因为 ${rejected.message}`
      );
    }
    expect(
      (await countProductsByCode(page, goodCode)).length,
      `同键重试只应落一行，编码 ${goodCode}`
    ).toBe(1);

    const differentKey = await apiCall<{ id?: unknown }>(
      page,
      'POST',
      '/products',
      productBody(otherCode, `474丙另一把键${otherCode}`),
      { 'Idempotency-Key': otherKey }
    );
    const differentKeyId = Number(differentKey.data?.id);
    if (!Number.isInteger(differentKeyId) || differentKeyId <= 0) {
      throw new Error(
        `前置不成立：另一把幂等键的建档应照旧成功，实际 ${JSON.stringify(differentKey)}`
      );
    }

    const noKeyCode = genCode('C474G');
    const noKey = await apiCall<{ id?: unknown }>(
      page,
      'POST',
      '/products',
      productBody(noKeyCode, `474丙不带键${noKeyCode}`)
    );
    const noKeyId = Number(noKey.data?.id);
    if (!Number.isInteger(noKeyId) || noKeyId <= 0) {
      throw new Error(`不带幂等键的请求必须逐字节保持原样放行，实际 ${JSON.stringify(noKey)}`);
    }
    expect(
      (await countProductsByCode(page, noKeyCode)).length,
      `不带幂等键的建档应照旧落一行，编码 ${noKeyCode}`
    ).toBe(1);

    await cleanupProduct(page, retryId, goodCode);
    await cleanupProduct(page, differentKeyId, otherCode);
    await cleanupProduct(page, noKeyId, noKeyCode);
  });
});
