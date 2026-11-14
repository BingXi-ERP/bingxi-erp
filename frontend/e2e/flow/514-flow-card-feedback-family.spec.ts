// 流转卡工序质量反馈族用例（批十七 514，E2E 补测批二真缺口）
//
// 选题判据。后端五枚端点全部挂在 flow_card_handler 的工序质量反馈段
// （POST /flow-cards/feedbacks 建反馈、GET /flow-cards/feedbacks/{id} 详情、
// POST /flow-cards/feedbacks/{id}/handle 处理、POST /flow-cards/feedbacks/{id}/close
// 关闭、GET /flow-cards/{flow_card_id}/feedbacks 按卡列表），e2e 全树 grep 真实
// 调用点仅 24 号 spec 一处对按卡列表做 verifyEndpointHealthy 健康检查，五个端点的
// 业务写面零覆盖；覆盖缺口登记文档批二候选写的是配料审批三枚，经 grep 已被 487 号
// spec 全覆盖属陈旧语料，故本支落反馈族。
//
// 写入方口径。状态机唯一事实源在 flow_card_ops/feedback.rs：
// create 落小写 pending，handle 无处理结果落 processing、有处理结果落 resolved，
// close 只允许 resolved 转 closed；closed 状态再 handle 被拒。建单人取服务端会话，
// found_by 是业务归属由请求体录入。出参是 process_quality_feedback::Model 全字段
// 序列化（snake_case）。中文词表（feedback_type 与 severity 的取值）按建表默认与
// 常量词表核对，本用例用面料业务真实取值：feedback_type 用 quality 异常上报。
//
// 造数纪律。前置自建：流转卡由 24 号同款链造出可反馈的卡（建卡即存在，不依赖
// 库里恰好有数据）；反馈单按本用例自建自用，不与其它用例共享行；关闭腿的非法
// 前置用第二张反馈单造（建出 pending 直接 close 断被拒），两条腿互不污染。

import { test, expect, type Page } from '../diagnose-fixture';
import { apiCall, apiCallRaw, apiCallExpectFail, ensureTestEntities } from './helpers';

type Row = Record<string, unknown>;

function readNumber(v: unknown, label: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0)
    throw new Error(`${label}：非正数值，raw=${JSON.stringify(v)}`);
  return n;
}

function expectStatusChar(status: unknown, expected: string, label: string): void {
  expect(
    typeof status === 'string' && status.length > 0,
    `${label} 必须为非空字符串，raw=${JSON.stringify(status)}`
  ).toBe(true);
  expect(status, `${label} 词值逐字符比对`).toBe(expected);
}

/** 建一张可反馈的流转卡并回读 id（造数链与 24 号同款：建卡即存在） */
async function createFlowCard(page: Page): Promise<number> {
  const products = await apiCallRaw<{ items: Array<Row> }>(
    page,
    'GET',
    '/products?page=1&page_size=20'
  );
  const product = products.items?.[0];
  expect(product, '共享实体面 products 至少一行').toBeTruthy();
  const productId = readNumber(product.id, '产品 id');

  const created = await apiCallRaw<Row>(page, 'POST', '/production/flow-cards', {
    product_id: productId,
    quantity: 100,
    remarks: '514 反馈族用例卡',
  });
  const cardId = readNumber(created.id, '流转卡 id');
  return cardId;
}

/** 在指定卡上建一张质量反馈单，回读 id 与初始状态 */
async function createFeedback(
  page: Page,
  flowCardId: number,
  description: string
): Promise<{ feedbackId: number; status: string }> {
  const fb = await apiCallRaw<Row>(page, 'POST', '/production/flow-cards/feedbacks', {
    flow_card_id: flowCardId,
    feedback_type: 'quality',
    description,
    severity: 'major',
    remarks: '514 用例自建',
  });
  const id = readNumber(fb.id, '反馈单 id');
  expectStatusChar(fb.status, 'pending', '新建反馈单初态');
  expect(String(fb.description), '描述回读一致').toBe(description);
  expect(Number(fb.flow_card_id), '归属卡回读一致').toBe(flowCardId);
  return { feedbackId: id, status: String(fb.status) };
}

test('514-01 反馈单建读改关全链与按卡列表', async ({ page }) => {
  await ensureTestEntities(page);
  const cardId = await createFlowCard(page);

  // 建两张反馈单：一张走全链，一张留 pending 给关闭腿当非法前置
  const chain = await createFeedback(page, cardId, '514-01 全链反馈：缸号色差异常');
  const other = await createFeedback(page, cardId, '514-01 关闭腿前置：pending 直接关闭应被拒');

  // 详情读回
  const detail = await apiCallRaw<Row>(
    page,
    'GET',
    `/production/flow-cards/feedbacks/${chain.feedbackId}`
  );
  expect(Number(detail.id), '详情回读同 id').toBe(chain.feedbackId);
  expectStatusChar(detail.status, 'pending', '详情初态');

  // handle 无处理结果 → processing
  const processing = await apiCallRaw<Row>(
    page,
    'POST',
    `/production/flow-cards/feedbacks/${chain.feedbackId}/handle`,
    { handling_opinion: '先复检缸号与配料记录' }
  );
  expectStatusChar(processing.status, 'processing', '无结果处理落 processing');
  expect(
    Number(processing.handled_by) > 0,
    `处理人落服务端会话 id，raw=${JSON.stringify(processing.handled_by)}`
  ).toBe(true);

  // handle 带处理结果 → resolved
  const resolved = await apiCallRaw<Row>(
    page,
    'POST',
    `/production/flow-cards/feedbacks/${chain.feedbackId}/handle`,
    { handling_opinion: '已复检', handling_result: '属面料色差，转染整返工' }
  );
  expectStatusChar(resolved.status, 'resolved', '带结果处理落 resolved');

  // close 只允许 resolved → closed
  const closed = await apiCallRaw<Row>(
    page,
    'POST',
    `/production/flow-cards/feedbacks/${chain.feedbackId}/close`
  );
  expectStatusChar(closed.status, 'closed', 'resolved 关闭落 closed');

  // 按卡列表含两张自建反馈单
  const list = await apiCallRaw<Array<Row>>(
    page,
    'GET',
    `/production/flow-cards/${cardId}/feedbacks`
  );
  expect(Array.isArray(list), '按卡列表为数组').toBe(true);
  const ids = list.map(r => Number(r.id));
  expect(ids).toContain(chain.feedbackId);
  expect(ids).toContain(other.feedbackId);
});

test('514-02 closed 再处理被拒，pending 直接关闭被拒', async ({ page }) => {
  await ensureTestEntities(page);
  const cardId = await createFlowCard(page);

  // 腿一：closed 再 handle
  const fbA = await createFeedback(page, cardId, '514-02 closed 再处理前置');
  await apiCall(page, 'POST', `/production/flow-cards/feedbacks/${fbA.feedbackId}/handle`);
  const closed = await apiCallRaw<Row>(
    page,
    'POST',
    `/production/flow-cards/feedbacks/${fbA.feedbackId}/handle`,
    { handling_result: '已处置' }
  );
  expectStatusChar(closed.status, 'resolved', '带结果处理后 resolved');

  // 无结果 handle 一枚走到 processing 再 resolved 再 close，得 closed
  await apiCall(page, 'POST', `/production/flow-cards/feedbacks/${fbA.feedbackId}/close`);
  const fClosedHandle = await apiCallExpectFail(
    page,
    'POST',
    `/production/flow-cards/feedbacks/${fbA.feedbackId}/handle`
  );
  expect(
    fClosedHandle.status,
    `closed 再 handle 应 400，实际=${JSON.stringify(fClosedHandle)}`
  ).toBe(400);

  // 腿二：pending 直接 close
  const fbB = await createFeedback(page, cardId, '514-02 pending 直接关闭前置');
  const fPendingClose = await apiCallExpectFail(
    page,
    'POST',
    `/production/flow-cards/feedbacks/${fbB.feedbackId}/close`
  );
  expect(
    fPendingClose.status,
    `pending 直接 close 应 400，实际=${JSON.stringify(fPendingClose)}`
  ).toBe(400);

  // 读回确认两条腿状态都没被破坏
  const rereadA = await apiCallRaw<Row>(
    page,
    'GET',
    `/production/flow-cards/feedbacks/${fbA.feedbackId}`
  );
  expectStatusChar(rereadA.status, 'closed', '腿一终态 closed');
  const rereadB = await apiCallRaw<Row>(
    page,
    'GET',
    `/production/flow-cards/feedbacks/${fbB.feedbackId}`
  );
  expectStatusChar(rereadB.status, 'pending', '腿二保持 pending 未被非法流转');
});
