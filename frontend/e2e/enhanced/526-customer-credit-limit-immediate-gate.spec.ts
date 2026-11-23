/**
 * 526 客户信用额度调整即时生效面
 *
 * 目标：补 4.1-K「主管修改客户信用额度后，业务员下一秒开单，新额度立即生效」
 * 与 4.22「主数据修改的级联影响」在真实双角色会话上的缺口。
 *
 * 契约事实（比较值一律照抄写入方）：
 * 1. 信用额度写口是 PUT /crm/customer-credits/{customer_id}，路径参数是客户自然键，
 *    不是评级行主键；UpdateCreditDto 的 credit_limit 为 Some(v) 时显式落新值，
 *    set_credit_rating 同步把 available_credit 重写为 new_limit - used_credit。
 * 2. 建销售订单时 create_order 在开事务后调用 check_credit_available，按
 *    available_credit 判档；金额 450 大于新额度 400 必须业务族拒绝，文案点名额度不足，
 *    且拒绝腿零落库。
 * 3. 金额恰好等于新额度的订单放行；建单只校验不占用，草稿不推进 used_credit，
 *    所以放行后回读信用行仍是额度 400、可用 400、已用 0。
 *
 * 前置全部自建：admin 建客户与初始额度，finance_manager 降额，sales_rep 建单；
 * 三棒身份互异由 relay 守卫。收尾按各自会话逆序删除订单、信用行与客户。
 */
import { test, expect } from '../diagnose-fixture';
import { createRelay } from '../fixtures/relay';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
} from '../flow/helpers';

type Row = Record<string, unknown>;

const INITIAL_LIMIT = '500.00';
const UPDATED_LIMIT = '400.00';
const REJECT_AMOUNT = '450.00';
const ACCEPT_AMOUNT = '400.00';

/**
 * 功能：严格取正整数主键，缺键或非整数即判前置失败。
 * 调用方：客户、信用行、订单与产品主键读取。
 * 入参：value=响应字段；label=点位描述，进错误文案。
 * 传给谁：请求路径与断言消息。存什么：不落库。
 */
function requireId(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label}：期望正整数 id，实际 ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * 功能：构造只含契约字段的销售订单请求体。
 * 调用方：sales_rep 的 450 拒绝腿与 400 放行腿。
 * 入参：customerId/client 自然键；productId/夹具产品；unitPrice/单价；notes/唯一标记。
 * 传给谁：POST /sales/orders。存什么：请求体只在此处构造。
 */
function orderBody(
  customerId: number,
  productId: number,
  unitPrice: string,
  notes: string
): Record<string, unknown> {
  return {
    customer_id: customerId,
    order_date: new Date().toISOString(),
    items: [
      {
        product_id: productId,
        quantity: '5',
        unit_price: unitPrice,
        tax_percent: '0',
        quantity_tolerance_pct: '0',
      },
    ],
    notes,
  };
}

test.describe('526 客户信用额度调整即时生效面', () => {
  test('526-01 主管降额后业务员超额被拒且零落库，等于新额度放行', async ({ browser }) => {
    const relay = await createRelay(browser);
    try {
      await relay.runSteps([
        {
          role: 'admin',
          label: '建客户与初始信用额度 500',
          run: async ({ session, registerCleanup }) => {
            await ensureTestEntities(session.page);
            const ctx = getCtx();
            const productId = requireId(ctx.productIds[0], '夹具产品主键');
            const code = genCode('C526');

            const created = await apiCall<Row>(session.page, 'POST', '/crm/customers', {
              customer_name: `526额度即时${code}`,
              status: 'active',
            });
            const customerId = requireId(created.data?.id, '建客户返回主键');
            registerCleanup({
              method: 'DELETE',
              path: `/crm/customers/${customerId}`,
              label: `526 客户 ${customerId}`,
            });

            const credit = await apiCall<Row>(session.page, 'POST', '/crm/customer-credits', {
              customer_id: customerId,
              credit_level: 'B',
              credit_score: 60,
              credit_limit: INITIAL_LIMIT,
              credit_days: 30,
            });
            expect(
              String(credit.data?.credit_limit),
              `初始信用额度应落 ${INITIAL_LIMIT}，实际 ${JSON.stringify(credit.data)}`
            ).toBe(INITIAL_LIMIT);
            registerCleanup({
              method: 'DELETE',
              path: `/crm/customer-credits/${customerId}`,
              label: `526 客户 ${customerId} 信用行`,
            });

            return {
              artifacts: [
                { key: 'customerId', value: customerId },
                { key: 'productId', value: productId },
              ],
            };
          },
        },
        {
          role: 'finance_manager',
          label: '额度从 500 降到 400 并回读',
          run: async ({ session, require }) => {
            const customerId = Number(require('customerId'));
            const before = await apiCallRaw<Row>(
              session.page,
              'GET',
              `/crm/customer-credits/${customerId}`
            );
            expect(
              String(before.credit_limit),
              `降额前必须是 ${INITIAL_LIMIT}，实际 ${JSON.stringify(before)}`
            ).toBe(INITIAL_LIMIT);

            const updated = await apiCall<Row>(
              session.page,
              'PUT',
              `/crm/customer-credits/${customerId}`,
              { credit_limit: UPDATED_LIMIT }
            );
            expect(
              String(updated.data?.credit_limit),
              `PUT 出参额度应为 ${UPDATED_LIMIT}，实际 ${JSON.stringify(updated.data)}`
            ).toBe(UPDATED_LIMIT);

            const after = await apiCallRaw<Row>(
              session.page,
              'GET',
              `/crm/customer-credits/${customerId}`
            );
            expect(
              String(after.credit_limit),
              `回读额度应为 ${UPDATED_LIMIT}，实际 ${JSON.stringify(after)}`
            ).toBe(UPDATED_LIMIT);
            expect(
              Number(after.available_credit),
              `回读可用额度应随新额度变为 400，实际 ${JSON.stringify(after)}`
            ).toBe(400);
            expect(
              Number(after.used_credit),
              `新客户已用额度应为 0，实际 ${JSON.stringify(after)}`
            ).toBe(0);

            // 接力契约（fixtures/relay.ts）：每棒必须交出真实业务标识；本棒的业务动作是
            // 降额回写，产出=降额后回读的信用行主键（三读断言已先行证明回读真实发生）。
            return {
              artifacts: [{ key: 'creditRowId', value: requireId(after.id, '信用行主键') }],
            };
          },
        },
        {
          role: 'sales_rep',
          label: '新额度立即生效：450 拒绝、400 放行',
          run: async ({ session, registerCleanup, require }) => {
            const customerId = Number(require('customerId'));
            const productId = Number(require('productId'));
            const tag = genCode('S526');

            const rejected = await apiCallExpectFail(
              session.page,
              'POST',
              '/sales/orders',
              orderBody(customerId, productId, '90.00', `526超额${tag}`)
            );
            expect(rejected.status, `金额 ${REJECT_AMOUNT} 超新额度应被业务门拒绝`).toBe(400);
            expect(
              failureCode(rejected),
              `超额拒绝须归业务族，实际 status=${rejected.status} message=${String(rejected.message)}`
            ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
            expect(
              String(rejected.message),
              `拒因须点名信用额度不足，实际 ${String(rejected.message)}`
            ).toContain('信用额度不足');

            const listed = await apiCallRaw<{ items?: Row[]; total?: number }>(
              session.page,
              'GET',
              `/sales/orders?customer_id=${customerId}&page=1&page_size=10`
            );
            if (!Array.isArray(listed.items)) {
              throw new Error(
                `前置不成立：订单列表未回 items 数组，实际 ${JSON.stringify(listed).slice(0, 200)}`
              );
            }
            expect(
              listed.items.length,
              `超额被拒后客户 ${customerId} 不应残留订单，实际 ${listed.items.length} 行`
            ).toBe(0);

            const accepted = await apiCall<Row>(
              session.page,
              'POST',
              '/sales/orders',
              orderBody(customerId, productId, '80.00', `526等额${tag}`)
            );
            const orderId = requireId(accepted.data?.id, '等额建单返回主键');
            registerCleanup({
              method: 'DELETE',
              path: `/sales/orders/${orderId}`,
              label: `526 订单 ${orderId}`,
            });

            const back = await apiCallRaw<Row>(session.page, 'GET', `/sales/orders/${orderId}`);
            expect(
              String(back.total_amount),
              `订单总额应精确为 ${ACCEPT_AMOUNT}，实际 ${JSON.stringify(back)}`
            ).toBe(ACCEPT_AMOUNT);
            expect(
              Number(back.customer_id),
              `订单客户应为自建客户 ${customerId}，实际 ${JSON.stringify(back)}`
            ).toBe(customerId);

            const creditAfter = await apiCallRaw<Row>(
              session.page,
              'GET',
              `/crm/customer-credits/${customerId}`
            );
            expect(
              Number(creditAfter.available_credit),
              `草稿单只校验不占额，可用额度应仍为 400，实际 ${JSON.stringify(creditAfter)}`
            ).toBe(400);

            return { artifacts: [{ key: 'orderId', value: orderId }] };
          },
        },
      ]);
    } finally {
      await relay.close();
    }
  });
});
