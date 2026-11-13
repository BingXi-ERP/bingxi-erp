import { test, expect } from '../diagnose-fixture';
import { loginViaUI, apiCall, apiCallExpectFail, genCode, tryCleanup } from './helpers';

/**
 * 509 批十五两枚「前端可达 + 全仓零覆盖」写面端点：
 * PUT /crm/customers/{id}/tier 与 POST /finance/accounting-periods/year-end-closing
 *
 * 覆盖面取证（写断言前逐字对过 backend 源码，非设想；本批候选由端点级扫描
 * 加模板串复核两道工序筛出，非陈旧清单转抄）：
 * - PUT /customers/{id}/tier：routes/crm.rs:54（tier 列唯一 HTTP 入口）→
 *   handlers/customer_handler.rs::update_customer_tier。读门与整行更新腿同源
 *   （get_customer 行级数据范围 + crm_write_guard::ensure_cross_owner_write_allowed
 *   跨 owner 写门），值域门在服务写口 services/customer_ops/update.rs:323：
 *   词表外档位走 business_displayable，文案外显列可选档位（VIP/GOLD/SILVER/
 *   NORMAL 四值，constants/customer_tier.rs::ALLOWED，与 DB CHECK
 *   chk_customers_tier 逐值同源；NULL 是未定档不是档位，不在词表）。
 *   出参收口只回 id 与 tier 两键（handler 注释明写不复刻整实体序列化形态）。
 * - POST /accounting-periods/year-end-closing：routes/finance.rs:97 →
 *   handlers/accounting_period_handler.rs::year_end_closing，Query 参数 year。
 *   service 门（accounting_period_service.rs::year_end_closing）第一道确定性拒绝：
 *   年度期间不足 12 个 → AppError::business（文案外显「年结失败：年度 N 仅有
 *   M 个期间，需 12 个月完整」）；第二道：存在非 CLOSED 期间 → business 门。
 *   两道门都用可展示 business 族，message 可断言；不满足门时零副作用（事务回滚）。
 *   成功腿需 12 个月全 CLOSED 的真实夹具，属重埋场景，本 spec 只钉两道拒绝门的
 *   确定性形态（这也正是 e2e 态唯一可稳定复现的路径），成功链路的结转逻辑归
 *   单测面（已有 accounting_period 单测）。
 *
 * 前置自建自清：tier 腿自建客户（name/code 必填，无 owner 特化），用后删除；
 * year-end 腿零前置（用一个确定无 12 个期间的年份，如 1999）。
 */

interface Envelope<T> {
  code: string;
  message: string;
  data: T;
}

interface TierOut {
  id: number;
  tier: string;
}

test.describe('509 客户分层改单与年度结账两枚写面（真实契约正负双腿）', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('509-01 PUT customers/{id}/tier：NORMAL 改 GOLD 落库回读且出参只含 id 与 tier 两键，词表外档位被拒且文案点名可选档位', async ({
    page,
  }) => {
    // 前置：自建客户（最小必填集）
    const created = await apiCall<Envelope<{ id: number }>>(page, 'POST', '/customers', {
      name: `分层夹具-${genCode('C9')}`,
      code: genCode('C9'),
    });
    const cid = created.data.id;
    expect(cid, '[509-01] 前置建客户应拿到 id').toBeGreaterThan(0);

    // 正腿：NORMAL → GOLD
    const put = await apiCall<Envelope<TierOut>>(page, 'PUT', `/customers/${cid}/tier`, {
      tier: 'GOLD',
    });
    expect(put.data, '[509-01] 改档应 200').toBeTruthy();
    expect(put.data.id, '[509-01] 出参 id 应等于路径 id').toBe(cid);
    expect(put.data.tier, '[509-01] 出参 tier 应为新档 GOLD').toBe('GOLD');
    // 出参收口契约：只含 id 与 tier 两键（handler 明写不复刻整实体形态）
    expect(
      Object.keys(put.data).sort().join(','),
      `[509-01] 出参键应恰为 id,tier，实际 ${JSON.stringify(Object.keys(put.data))}`
    ).toBe('id,tier');

    // 回读复核：客户详情 tier 列落库
    const got = await apiCall<Envelope<{ id: number; tier: string | null }>>(
      page,
      'GET',
      `/customers/${cid}`
    );
    expect(got.data.tier, '[509-01] 详情回读 tier 应为 GOLD').toBe('GOLD');

    // 负腿：词表外档位（词表只有 VIP/GOLD/SILVER/NORMAL）
    const bad = await apiCallExpectFail(page, 'PUT', `/customers/${cid}/tier`, {
      tier: 'DIAMOND',
    });
    expect(bad.status, '[509-01] 词表外档位应 400').toBe(400);
    expect(
      String(bad.message),
      `[509-01] business_displayable 文案应外显可选档位，实际 ${JSON.stringify(bad.message)}`
    ).toContain('VIP');
    // 被拒不落库
    const got2 = await apiCall<Envelope<{ tier: string | null }>>(page, 'GET', `/customers/${cid}`);
    expect(got2.data.tier, '[509-01] 被拒后 tier 不应被改写').toBe('GOLD');

    await tryCleanup(page, 'DELETE', `/customers/${cid}`, '[509-01] 删夹具客户');
  });

  test('509-02 POST accounting-periods/year-end-closing：无 12 期间年份被确定性拒 400 且文案点名年度与期间数，零副作用', async ({
    page,
  }) => {
    const fail = await apiCallExpectFail(
      page,
      'POST',
      '/accounting-periods/year-end-closing?year=1999'
    );
    expect(fail.status, '[509-02] 期间不足年应被拒 400').toBe(400);
    expect(
      String(fail.message),
      `[509-02] 文案应点名年度与期间数，实际 ${JSON.stringify(fail.message)}`
    ).toContain('年结失败');
    expect(String(fail.message)).toContain('1999');
    // 零副作用自证：1999 年的期间数在调用前后不变（门在事务内，拒绝即回滚）
    const list = await apiCall<Envelope<{ items: Array<{ year: number }> }>>(
      page,
      'GET',
      '/accounting-periods?page=1&page_size=100'
    );
    const in1999 = (list.data.items ?? []).filter(p => p.year === 1999);
    expect(in1999.length, '[509-02] 被拒年结不得新造期间').toBe(0);
  });
});
