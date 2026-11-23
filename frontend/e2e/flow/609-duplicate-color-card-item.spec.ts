/**
 * 功能：锁定「同卡同 color_code 重复建色号」的可观测行为：第二次非 2xx、不落第二行，换码仍放行。
 *
 * 六要素：
 * - 调用方：本 spec 自建草稿色卡，连续调用色号建行口两次同码、一次换码，并回读列表与卡详情。
 * - 入参：本用例唯一 color_code、合法 HEX/RGB 三元组与 sequence；换码仅改 color_code。
 * - 传给谁：POST /color-cards、POST /color-cards/{id}/items、GET /color-cards/{id}/items、GET /color-cards/{id}。
 * - 存什么：断言只落在第二次 HTTP 状态、色号列表行数与卡详情 total_colors；不把缺失的业务机器码写成绿色断言。
 * - 存哪里：color_cards 与 color_card_items 表；色号随自建卡归档收尾，不留草稿卡。
 *
 * 源码判据：m0044_integrate_unreferenced_migrations.rs:334 建 UNIQUE(color_card_id, color_code)；
 * services/color_card_item_service.rs::create 无同卡查重，重复撞库由
 * handlers/color_card/error_map.rs::item_err 的 ItemError::Database 转 AppError::database。
 * 现实错误族是 DATABASE_ERROR，**业务族点名拒绝属功能缺失、待决策**：本 spec 只钉非 2xx、
 * 行数与换码放行，不断言业务码、不断言拒因外显字段名，缺口写入调研与交付报告。
 */
import { test, expect } from '../diagnose-fixture';
import { apiCall, apiCallExpectFail, apiCallRaw, genCode, genName } from './helpers';

interface CardRow {
  id: number;
}

interface ColorItemRow {
  id: number;
  color_code: string;
}

interface ItemListPage {
  items: ColorItemRow[];
  total: number;
}

interface CardDetail {
  total_colors: number;
}

const mkItem = (code: string, seq: number): Record<string, unknown> => ({
  color_code: code,
  color_name: `609色号${code}`,
  rgb_r: 30,
  rgb_g: 144,
  rgb_b: 255,
  hex_value: '#1E90FF',
  sequence: seq,
});

/** 自建卡归档队列：色卡 DELETE 是归档语义，必须带 reason 体，不能用通用无体清理。 */
const ARCHIVE: Array<{ id: number; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const card of ARCHIVE.reverse()) {
    try {
      await apiCall(page, 'DELETE', `/color-cards/${card.id}`, {
        reason: '609 用例自建卡收尾归档',
      });
    } catch (error) {
      console.warn(`[609] ${card.label} 归档未成功：${(error as Error).message}`);
    }
  }
  ARCHIVE.length = 0;
});

test.describe.serial('609 同卡同色号重复建行被拒且换码放行', () => {
  test('609-1 重复 color_code 第二次非 2xx、只一行，换码后 total_colors 为 2', async ({ page }) => {
    const card = await apiCallRaw<CardRow>(page, 'POST', '/color-cards', {
      card_no: genCode('CC609'),
      card_name: genName('609重复色号卡'),
      card_type: 'CUSTOM',
    });
    const cardId = Number(card?.id);
    expect(cardId, '[609-1] 自建草稿色卡必须返回正整数主键').toBeGreaterThan(0);
    ARCHIVE.push({ id: cardId, label: '[609-1] 自建卡' });

    const itemPath = `/color-cards/${cardId}/items?page=1&page_size=100`;
    const colorCode = genCode('C609');
    const body = mkItem(colorCode, 1);

    const first = await apiCallRaw<ColorItemRow>(
      page,
      'POST',
      `/color-cards/${cardId}/items`,
      body
    );
    expect(Number(first?.id), '[609-1] 首枚色号必须返回正整数主键').toBeGreaterThan(0);
    expect(String(first?.color_code), '[609-1] 建行口必须回读提交的 color_code').toBe(colorCode);

    const before = await apiCallRaw<ItemListPage>(page, 'GET', itemPath);
    expect(Array.isArray(before.items), '[609-1] 色号列表口必须回 items 数组').toBe(true);
    expect(before.total, `[609-1] 首枚色号建成后应恰有 1 行，实际 ${before.total}`).toBe(1);

    const second = await apiCallExpectFail(page, 'POST', `/color-cards/${cardId}/items`, body);
    expect(
      second.status,
      `[609-1] 同卡同 color_code 第二次建行必须非 2xx，实际 ${second.status}；2xx 即重复行已落库`
    ).toBeGreaterThanOrEqual(400);

    const after = await apiCallRaw<ItemListPage>(page, 'GET', itemPath);
    expect(Array.isArray(after.items), '[609-1] 重复提交后色号列表口必须回 items 数组').toBe(true);
    expect(after.total, '[609-1] 重复色号被拒后仍只能有 1 行').toBe(before.total);
    expect(
      after.items.some(row => String(row.color_code) === colorCode),
      '[609-1] 唯一一行必须是首枚提交的 color_code'
    ).toBe(true);

    const changedCode = genCode('C609N');
    const changed = await apiCallRaw<ColorItemRow>(
      page,
      'POST',
      `/color-cards/${cardId}/items`,
      mkItem(changedCode, 2)
    );
    expect(String(changed?.color_code), '[609-1] 换码建行必须回读新 color_code').toBe(changedCode);

    const cardAfter = await apiCallRaw<CardDetail>(page, 'GET', `/color-cards/${cardId}`);
    expect(
      Number(cardAfter?.total_colors),
      '[609-1] 同卡换码成功后卡详情 total_colors 必须为 2'
    ).toBe(2);
    const finalList = await apiCallRaw<ItemListPage>(page, 'GET', itemPath);
    expect(finalList.total, '[609-1] 换码成功后色号列表总数必须为 2').toBe(2);
  });
});
