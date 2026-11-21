// 506 色卡库存预警：四档阈值与归档不对称。
// 后端判据：services/color_card_inventory_warning_service.rs:9-42 以 serde lowercase 输出
// forbidden/red/yellow/normal，from_stock 精确映射 0/1/2..=4/>=5；:55-75 全量预警过滤
// status != archived 且只保留非 normal 行；:78-84 单体预警按主键查实体，不过滤 archived。
// handlers/color_card/analytics.rs:230-253 的响应分别为 WarningItem 数组与 WarningLevel 字符串。
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

interface Card {
  id?: number;
  card_no?: string;
  card_name?: string;
  status?: string;
  stock_quantity?: number;
}

interface WarningItem {
  color_card_id: number;
  color_card_name: string;
  current_stock: number;
  warning_level: string;
}

function int(value: unknown, label: string): number {
  expect(
    Number.isInteger(value) && (value as number) > 0,
    `[506] ${label} 须正整数，实际=${JSON.stringify(value)}`
  ).toBe(true);
  return value as number;
}

function text(value: unknown, label: string): string {
  expect(
    typeof value === 'string' && (value as string).length > 0,
    `[506] ${label} 须非空字符串，实际=${JSON.stringify(value)}`
  ).toBe(true);
  return value as string;
}

async function seedCard(page: Page, tag: string, suffix: string): Promise<Card> {
  const created = await apiCallRaw<Card>(page, 'POST', '/color-cards', {
    card_no: `${tag}-${suffix}`,
    card_name: `506色卡${suffix}-${tag}`,
    card_type: 'CUSTOM',
  });
  int(created?.id, `建色卡 ${suffix} 返回 id`);
  expect(created.status, `[506] 新色卡 ${suffix} 初始状态须 draft`).toBe('draft');
  expect(created.stock_quantity, `[506] 新色卡 ${suffix} 初始库存须 0`).toBe(0);
  return created;
}

async function readCard(page: Page, id: number): Promise<Card> {
  const found = await apiCallRaw<Card>(page, 'GET', `/color-cards/${id}`);
  expect(found.id, `[506] GET /color-cards/${id} 回读 id`).toBe(id);
  return found;
}

async function setStock(page: Page, id: number, stock: number): Promise<void> {
  await apiCallRaw(page, 'PUT', `/color-cards/${id}`, { stock_quantity: stock });
  const after = await readCard(page, id);
  expect(after.stock_quantity, `[506] 色卡 ${id} 库存须落 ${stock}`).toBe(stock);
}

async function archiveCard(page: Page, id: number, reason: string): Promise<void> {
  await apiCallRaw(page, 'DELETE', `/color-cards/${id}`, { reason });
  const after = await readCard(page, id);
  expect(after.status, `[506] 色卡 ${id} 归档后状态须 archived`).toBe('archived');
}

async function singleLevel(page: Page, id: number, expected: string): Promise<void> {
  const level = await apiCallRaw<string>(page, 'GET', `/color-cards/warnings/${id}`);
  expect(
    typeof level === 'string',
    `[506] 单体预警须返回字符串级别，实际=${JSON.stringify(level)}`
  ).toBe(true);
  expect(level, `[506] 色卡 ${id} 单体预警级别`).toBe(expected);
}

test.describe('506 色卡库存预警矩阵', () => {
  test('506-01 四档阈值落库，全量预警排除归档但单体预警仍可读', async ({ page }) => {
    await loginViaUI(page, undefined, undefined, true);
    const tag = genCode('E506');
    const cards: Card[] = [];
    const archived: number[] = [];
    try {
      for (const suffix of ['A', 'B', 'C', 'D', 'E']) {
        cards.push(await seedCard(page, tag, suffix));
      }
      const [forbidden, red, yellow, normal, archivedRed] = cards.map(card =>
        int(card.id, `色卡 ${text(card.card_no, 'card_no')} 的 id`)
      );

      await setStock(page, forbidden, 0);
      await setStock(page, red, 1);
      await setStock(page, yellow, 3);
      await setStock(page, normal, 5);
      await setStock(page, archivedRed, 1);
      await archiveCard(page, archivedRed, `${tag}-ARCHIVE-REASON`);

      const warnings = await apiCallRaw<WarningItem[]>(page, 'GET', '/color-cards/warnings');
      expect(
        Array.isArray(warnings),
        `[506] 全量预警须返回数组，实际=${JSON.stringify(warnings)}`
      ).toBe(true);
      const ownIds = [forbidden, red, yellow, normal, archivedRed];
      const mine = warnings.filter(warning => ownIds.includes(warning.color_card_id));
      expect(mine.length, `[506] 自建卡须恰好三条预警，实际=${JSON.stringify(mine)}`).toBe(3);
      const expected: Record<number, { name: string; stock: number; level: string }> = {
        [forbidden]: { name: text(cards[0].card_name, 'A 卡名'), stock: 0, level: 'forbidden' },
        [red]: { name: text(cards[1].card_name, 'B 卡名'), stock: 1, level: 'red' },
        [yellow]: { name: text(cards[2].card_name, 'C 卡名'), stock: 3, level: 'yellow' },
      };
      for (const warning of mine) {
        const want = expected[warning.color_card_id];
        expect(
          want !== undefined,
          `[506] 非预期色卡出现在预警中，实际=${JSON.stringify(warning)}`
        ).toBe(true);
        expect(Object.keys(warning).sort(), '[506] 预警行键须逐字来自 WarningItem').toEqual([
          'color_card_id',
          'color_card_name',
          'current_stock',
          'warning_level',
        ]);
        expect(warning.color_card_name, '[506] 预警卡名须等于建卡原文').toBe(want.name);
        expect(warning.current_stock, '[506] 预警库存须等于登记库存').toBe(want.stock);
        expect(warning.warning_level, '[506] 预警级别须按阈值映射').toBe(want.level);
      }

      await singleLevel(page, forbidden, 'forbidden');
      await singleLevel(page, red, 'red');
      await singleLevel(page, yellow, 'yellow');
      await singleLevel(page, normal, 'normal');
      await singleLevel(page, archivedRed, 'red');

      const missing = await apiCallExpectFail(page, 'GET', '/color-cards/warnings/-1');
      expect(missing.status, `[506] 不存在色卡须 404，实际=${missing.status}`).toBe(404);
      expect(
        failureCode(missing),
        `[506] 不存在色卡机器码须 NOT_FOUND，实际=${JSON.stringify(missing)}`
      ).toBe(APP_ERROR_CODES.NOT_FOUND);
    } finally {
      for (const card of cards) {
        const id = card.id;
        if (id === undefined || archived.includes(id)) continue;
        try {
          await apiCallRaw(page, 'DELETE', `/color-cards/${id}`, {
            reason: `${tag}-CLEANUP`,
          });
        } catch (error) {
          console.warn(`[cleanup] 506 色卡 ${id} 失败: ${(error as Error).message}`);
        }
      }
    }
  });
});
