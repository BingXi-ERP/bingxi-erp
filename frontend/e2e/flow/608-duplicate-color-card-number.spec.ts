/**
 * 功能：锁定「同 card_no 重复建色卡」的可观测行为：第二次必须非 2xx，且库里不落第二行。
 *
 * 六要素：
 * - 调用方：本 spec 自建唯一 card_no 的草稿卡，连续调用两次建卡口与一次列表口；不碰共享夹具色卡。
 * - 入参：同一 card_no/card_name/card_type='CUSTOM' 提交体两次，列表口用唯一 card_name 作 keyword。
 * - 传给谁：POST /color-cards、GET /color-cards、DELETE /color-cards/{id}（归档清理）。
 * - 存什么：断言只落在第二次 HTTP 状态、列表总数与回读 card_no；不把缺失的业务机器码写成绿色断言。
 * - 存哪里：color_cards 表；测试退出时把自建草稿卡走归档口收尾。
 *
 * 源码判据：m0044_integrate_unreferenced_migrations.rs:274 给 card_no 建 UNIQUE；
 * services/color_card_crud_service.rs::create 无同名预检，重复插入撞约束后由
 * handlers/color_card/error_map.rs::crud_err 的 CrudError::Database 转 AppError::database。
 * 现实错误族是 DATABASE_ERROR，**业务族点名拒绝属功能缺失、待决策**：本 spec 只钉非 2xx
 * 与列表不落第二行，不断言业务码、不断言拒因外显字段名，缺口写入调研与交付报告。
 * 列表口 keyword 只匹配 card_name（color_card_crud_service.rs::list），故用本用例唯一卡名过滤，
 * 再逐行核对 card_no，避免拿无关卡冒充「同 card_no 只有一行」。
 */
import { test, expect } from '../diagnose-fixture';
import { apiCall, apiCallExpectFail, apiCallRaw, genCode, genName } from './helpers';

interface CardRow {
  id: number;
  card_no: string;
}

interface CardListPage {
  items: CardRow[];
  total: number;
}

/** 自建卡归档队列：色卡 DELETE 是归档语义，必须带 reason 体，不能用通用无体清理。 */
const ARCHIVE: Array<{ id: number; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const card of ARCHIVE.reverse()) {
    try {
      const res = await apiCall(page, 'DELETE', `/color-cards/${card.id}`, {
        reason: '608 用例自建卡收尾归档',
      });
      if (res.status < 200 || res.status >= 300) {
        console.warn(`[608] ${card.label} 归档未成功 status=${res.status}`);
      }
    } catch (error) {
      console.warn(`[608] ${card.label} 归档异常：${(error as Error).message}`);
    }
  }
  ARCHIVE.length = 0;
});

test.describe.serial('608 同 card_no 重复建色卡被拒且不落第二行', () => {
  test('608-1 重复 card_no 第二次非 2xx 且列表仍仅一行', async ({ page }) => {
    const cardNo = genCode('CC608');
    const cardName = genName('608重复卡');
    const body = { card_no: cardNo, card_name: cardName, card_type: 'CUSTOM' };

    const first = await apiCallRaw<CardRow>(page, 'POST', '/color-cards', body);
    const cardId = Number(first?.id);
    expect(cardId, '[608-1] 首张色卡必须返回正整数主键').toBeGreaterThan(0);
    expect(String(first?.card_no), '[608-1] 建卡口必须回读提交的 card_no').toBe(cardNo);
    ARCHIVE.push({ id: cardId, label: '[608-1] 自建卡' });

    const listPath = `/color-cards?page=1&page_size=100&keyword=${encodeURIComponent(cardName)}`;
    const before = await apiCallRaw<CardListPage>(page, 'GET', listPath);
    expect(Array.isArray(before.items), '[608-1] 列表口必须回 items 数组').toBe(true);
    expect(before.total, `[608-1] 首张卡建成后该卡名应恰有 1 行，实际 ${before.total}`).toBe(1);

    const second = await apiCallExpectFail(page, 'POST', '/color-cards', body);
    expect(
      second.status,
      `[608-1] 同 card_no 第二次建卡必须非 2xx，实际 ${second.status}；2xx 即重复行已落库`
    ).toBeGreaterThanOrEqual(400);

    const after = await apiCallRaw<CardListPage>(page, 'GET', listPath);
    expect(Array.isArray(after.items), '[608-1] 重复提交后列表口必须回 items 数组').toBe(true);
    expect(after.total, '[608-1] 重复 card_no 被拒后该卡名仍只能有 1 行').toBe(before.total);
    expect(
      after.items.some(row => Number(row.id) === cardId && String(row.card_no) === cardNo),
      '[608-1] 唯一一行必须是首张自建卡及其 card_no'
    ).toBe(true);
  });
});
