// 4.14 色卡关键词与状态筛选 E2E — enhanced/603-color-card-keyword-filter
// 功能：色卡列表按 card_name 关键词命中、跳过无关关键词，并与状态、类型筛选叠加收敛。
// 调用方：Playwright enhanced 分片；管理员会话态由 diagnose-fixture 按 worker 注入。
// 入参：无外部入参；两张 CUSTOM 色卡的编号与中英混排名称片段均自建唯一值。
// 传给谁：POST /color-cards 建两张卡 → GET /color-cards?keyword=&status=&card_type=&page=1&page_size=100
//   逐条件读取 → DELETE /color-cards/{id} 归档清理。
// 存什么：color_cards 两行，card_name 分别含独有 A/B 片段，状态保持建档默认 draft。
// 存哪里：color_cards 表。
// 口径说明：服务层对 card_name 做转义后的 LIKE，关键词只覆盖名称；archived 是合法状态词表值，
//   本例前缀下没有归档卡，因此 archived 必须零命中。断言只比较本批主键，不依赖共享库总量。
import { test, expect, type Page } from '../diagnose-fixture';
import { apiCallRaw, genCode, loginViaUI } from '../flow/helpers';

interface CardRow {
  id: number;
  card_name: string;
  card_type: string;
  status: string;
}

interface CardPage {
  items: CardRow[];
  total: number;
  page: number;
  page_size: number;
}

const createdCardIds: number[] = [];

test.afterEach(async ({ page }) => {
  for (const id of createdCardIds.splice(0)) {
    try {
      await apiCallRaw(page, 'DELETE', `/color-cards/${id}`, {
        reason: `603 清理色卡 ${id}`,
      });
    } catch (error) {
      console.warn(`[603] 清理色卡 ${id} 失败`, error);
    }
  }
});

async function readCards(page: Page, query: string): Promise<CardPage> {
  const data = await apiCallRaw<CardPage>(page, 'GET', `/color-cards?${query}`);
  expect(Array.isArray(data.items), '色卡列表 items 必须是数组').toBe(true);
  expect(Number.isSafeInteger(data.total), '色卡列表 total 必须是整数').toBe(true);
  expect(data.page === 1, '色卡列表页码必须回显请求值 1').toBe(true);
  expect(data.page_size === 100, '色卡列表页宽必须回显请求值 100').toBe(true);
  for (const row of data.items) {
    expect(typeof row.card_name === 'string', '色卡名称必须是字符串').toBe(true);
    expect(typeof row.card_type === 'string', '色卡类型必须是字符串').toBe(true);
    expect(typeof row.status === 'string', '色卡状态必须是字符串').toBe(true);
  }
  return data;
}

test('603-01 色卡名称关键词与状态类型叠加筛选只收敛到目标卡', async ({ page }: { page: Page }) => {
  await loginViaUI(page);

  const tag = `E603${genCode('C').replace(/-/g, '')}`;
  const seedCard = async (suffix: string): Promise<CardRow> => {
    const created = await apiCallRaw<CardRow>(page, 'POST', '/color-cards', {
      card_no: `${tag}-${suffix}`,
      card_name: `${tag}-${suffix}蓝Card`,
      card_type: 'CUSTOM',
    });
    expect(Number.isSafeInteger(created.id) && created.id > 0, '建色卡必须返回正整数主键').toBe(
      true
    );
    expect(created.card_name === `${tag}-${suffix}蓝Card`, '建色卡回显名称必须一致').toBe(true);
    expect(created.status === 'draft', '新建色卡默认状态必须是 draft').toBe(true);
    createdCardIds.push(created.id);
    return created;
  };

  const cardA = await seedCard('A');
  const cardB = await seedCard('B');
  console.warn('[603] 已建两张专属色卡', { cardAId: cardA.id, cardBId: cardB.id });

  const hitA = await readCards(
    page,
    `keyword=${encodeURIComponent(`${tag}-A蓝`)}&page=1&page_size=100`
  );
  expect(
    hitA.items.some(row => row.id === cardA.id),
    '关键词 A 必须命中对应色卡'
  ).toBe(true);
  expect(
    hitA.items.some(row => row.id === cardB.id),
    '关键词 A 不得命中另一张色卡'
  ).toBe(false);

  const hitB = await readCards(
    page,
    `keyword=${encodeURIComponent(`${tag}-B蓝`)}&page=1&page_size=100`
  );
  expect(
    hitB.items.some(row => row.id === cardB.id),
    '关键词 B 必须命中对应色卡'
  ).toBe(true);
  expect(
    hitB.items.some(row => row.id === cardA.id),
    '关键词 B 不得命中另一张色卡'
  ).toBe(false);

  const miss = await readCards(
    page,
    `keyword=${encodeURIComponent(`${tag}-Z不存在片段`)}&page=1&page_size=100`
  );
  expect(miss.items.length === 0, '不存在的关键词必须零命中').toBe(true);
  expect(miss.total === 0, '不存在的关键词总数必须为 0').toBe(true);

  const draft = await readCards(page, `keyword=${tag}&status=draft&page=1&page_size=100`);
  expect(
    draft.items.some(row => row.id === cardA.id),
    'draft 状态查询必须含 A 卡'
  ).toBe(true);
  expect(
    draft.items.some(row => row.id === cardB.id),
    'draft 状态查询必须含 B 卡'
  ).toBe(true);

  const archived = await readCards(page, `keyword=${tag}&status=archived&page=1&page_size=100`);
  expect(archived.items.length === 0, '合法但未出现的 archived 状态必须零命中').toBe(true);
  expect(archived.total === 0, 'archived 状态查询总数必须为 0').toBe(true);

  const custom = await readCards(
    page,
    `keyword=${tag}&card_type=CUSTOM&status=draft&page=1&page_size=100`
  );
  expect(custom.total === 2, '关键词加类型加状态叠加后总数必须为 2').toBe(true);
  expect(
    custom.items.some(row => row.id === cardA.id),
    '叠加筛选必须含 A 卡'
  ).toBe(true);
  expect(
    custom.items.some(row => row.id === cardB.id),
    '叠加筛选必须含 B 卡'
  ).toBe(true);
  console.warn('[603] 色卡关键词、状态与类型断言完成', { tag });
});
