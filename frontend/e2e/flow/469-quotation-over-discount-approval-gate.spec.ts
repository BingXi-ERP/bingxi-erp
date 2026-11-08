/**
 * 超折扣审批门：阈值配置读写校验、权限拒绝、超阈提交强制审批与未超阈自批
 *
 * 功能：把 E8 新增的两端点（GET 与 PUT /quotations/discount-config）与提交腿的超折扣
 *   强制审批门做端到端验证。管理员读阈值、写阈值并回读坐实持久化，越界与超精度入参
 *   被 400 拒绝；sales_rep 对配置面只读（GET 200 读到规则值，m0134 三通道授予）、
 *   写面 PUT 被权限门 403 拒绝；设阈值为 5 后
 *   sales_rep 建行折扣率 10 的报价单（金额 1 远低于 10 万自批档）提交，断言状态进
 *   pending_approval 且 submitted_by 留痕为操作人（超折扣门取更严者，金额再小也不自批）；
 *   改阈值为 20 后同角色建行折扣率 5 的报价单提交，断言状态直接 approved 且 approved_by
 *   为操作人（金额可自批且折扣未超阈走自批腿）。收尾恢复原阈值。
 *
 * 调用方：Playwright E2E 套件，由 CI 的 e2e flow 分片按文件哈希收集执行。
 *
 * 入参：BASE_URL 与 API_BASE 取环境变量；admin 与 sales_rep 凭证取 env 优先，
 *   回退 e2e/.auth/role-credentials.json。
 *
 * 传给谁：多角色会话由 fixtures/relay 的 createRelay 与 runSteps 建与查；
 *   端点正负例走 flow/helpers 的 apiCall、apiCallRaw、apiCallExpectFail 与 expectDenied。
 *
 * 存什么：阈值配置单行（quotation_discount_approval_configs id=1）被读写多次后恢复原值；
 *   产品一行、客户一行、报价单两行（超阈件进 pending_approval、未超阈件进 approved）
 *   与各自明细行；阈值变更经审计单点落 audit_logs。
 *
 * 存哪里：阈值配置落 quotation_discount_approval_configs，产品落 products，客户落
 *   crm_customers，报价单落 sales_quotations 与 sales_quotation_items，审计行落 audit_logs；
 *   报价单族没有 DELETE 路由，两张报价单与明细行按业务事实留库不回收；
 *   客户删除是软删（status=inactive），由 admin 步注册清理在接力收尾时执行；
 *   产品被明细行外键钉住删不掉，随单留库不登记清理。
 */
import { test, expect } from '../diagnose-fixture';
import {
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  expectDenied,
  genCode,
  loginViaUI,
} from './helpers';
import { createRelay } from '../fixtures/relay';

type Row = Record<string, unknown>;

function isoDate(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
}

/** 超阈测试阈值：行折扣率 10 严格大于 5 即超阈 */
const OVER_THRESHOLD = '5.00';
/** 超阈测试行折扣率（百分点） */
const OVER_DISCOUNT_RATE = '10';
/** 未超阈测试阈值：行折扣率 5 不大于 20 即未超阈 */
const UNDER_THRESHOLD = '20.00';
/** 未超阈测试行折扣率（百分点） */
const UNDER_DISCOUNT_RATE = '5';
/** 报价单金额控制：quantity=1 unit_price=1 使 total_amount 远低于 10 万自批档 */
const SMALL_QUANTITY = '1';
const SMALL_UNIT_PRICE = '1';

test.describe.serial('超折扣审批门：阈值配置、权限拒绝、超阈提交与未超阈自批', () => {
  test('配置读写校验、sales_rep 权限拒绝、超阈 pending_approval 与未超阈 approved', async ({
    page,
    browser,
  }) => {
    await loginViaUI(page);

    // ── 1 阈值配置读写往返 ──
    const original = await apiCallRaw<Row>(page, 'GET', '/quotations/discount-config');
    const originalThreshold = Number(original.over_discount_threshold_pct);
    expect(originalThreshold, '初始阈值应为 0 到 100 之间的有效数值').toBeGreaterThanOrEqual(0);
    expect(originalThreshold, '初始阈值应不超过 100').toBeLessThanOrEqual(100);
    expect(original.updated_at, '初始阈值配置应带更新时间').toBeTruthy();

    const updated = await apiCall<Row>(page, 'PUT', '/quotations/discount-config', {
      over_discount_threshold_pct: '15.50',
    });
    expect(updated.message, 'PUT 响应文案应含超折扣审批阈值已更新').toContain(
      '超折扣审批阈值已更新'
    );
    expect(
      Number(updated.data.over_discount_threshold_pct),
      'PUT 出参阈值应与入参 15.50 一致'
    ).toBe(15.5);
    expect(updated.data.updated_at, 'PUT 出参应带更新时间').toBeTruthy();

    const readback = await apiCallRaw<Row>(page, 'GET', '/quotations/discount-config');
    expect(
      Number(readback.over_discount_threshold_pct),
      'GET 回读阈值应与 PUT 写入值 15.50 一致'
    ).toBe(15.5);

    // ── 2 校验拒绝：越界与超精度 ──
    const over100 = await apiCallExpectFail(page, 'PUT', '/quotations/discount-config', {
      over_discount_threshold_pct: '101',
    });
    expect(over100.status, '阈值 101 超出上界 100 应被 400 拒绝').toBe(400);

    const under0 = await apiCallExpectFail(page, 'PUT', '/quotations/discount-config', {
      over_discount_threshold_pct: '-1',
    });
    expect(under0.status, '阈值 -1 超出下界 0 应被 400 拒绝').toBe(400);

    const overPrecision = await apiCallExpectFail(page, 'PUT', '/quotations/discount-config', {
      over_discount_threshold_pct: '10.123',
    });
    expect(overPrecision.status, '阈值 10.123 超出列刻度两位小数应被 400 拒绝').toBe(400);

    // 恢复原值，后续测试从干净基线出发
    await apiCall(page, 'PUT', '/quotations/discount-config', {
      over_discount_threshold_pct: String(originalThreshold),
    });

    // ── 3 建产品与客户、设超阈阈值、sales_rep 权限拒绝与超阈提交 ──
    const relay = await createRelay(browser);
    try {
      await relay.runSteps([
        {
          role: 'admin',
          label: '建报价专用产品与客户并设阈值为 5',
          run: async ({ session, registerCleanup }) => {
            const code = genCode('E2E-DISC-P');
            const created = await apiCallRaw<Row>(session.page, 'POST', '/products', {
              code,
              name: `E2E超折扣门产品${code}`,
              unit: '米',
              product_type: '辅料',
            });
            const productId = Number(created?.id);
            expect(productId, '建产品应返回有效 id').toBeGreaterThan(0);
            const detail = await apiCallRaw<Row>(session.page, 'GET', `/products/${productId}`);
            const unit = String(detail?.unit ?? '');
            expect(unit, '产品回读应有交易单位供报价行取值').toBeTruthy();

            const customerName = genCode('E2E-DISC-CUS');
            const customer = await apiCallRaw<Row>(session.page, 'POST', '/crm/customers', {
              customer_name: customerName,
              contact_phone: '13800000000',
            });
            const customerId = Number(customer?.id);
            expect(customerId, '建客户应返回有效 id').toBeGreaterThan(0);
            registerCleanup({
              method: 'DELETE',
              path: `/crm/customers/${customerId}`,
              label: `超折扣门客户 ${customerName}`,
            });

            await apiCall(session.page, 'PUT', '/quotations/discount-config', {
              over_discount_threshold_pct: OVER_THRESHOLD,
            });

            return {
              artifacts: [
                { key: 'productId', value: productId },
                { key: 'productUnit', value: unit },
                { key: 'customerId', value: customerId },
              ],
            };
          },
        },
        {
          role: 'sales_rep',
          label: '权限拒绝与超阈提交强制审批',
          run: async ({ session, require }) => {
            const productId = Number(require('productId'));
            const productUnit = String(require('productUnit'));
            const customerId = Number(require('customerId'));

            // 阈值读面按角色矩阵与 m0134 补授契约归 sales_rep 只读（提交前须看到
            // 超阈规则值），写面只归 gm 与 system_admin，本岗 PUT 仍 403。
            const repConfig = await apiCallRaw<Row>(
              session.page,
              'GET',
              '/quotations/discount-config'
            );
            expect(
              Number(repConfig.over_discount_threshold_pct),
              'sales_rep 应可读阈值配置且读到的就是 admin 刚设的超阈阈值 5'
            ).toBe(5);

            const putDenied = await apiCallExpectFail(
              session.page,
              'PUT',
              '/quotations/discount-config',
              { over_discount_threshold_pct: '10' }
            );
            expectDenied(putDenied, 'sales_rep PUT discount-config 应被权限门 403');

            // 建报价单：行折扣率 10 严格大于阈值 5，金额 1 远低于 10 万自批档
            const created = await apiCall<Row>(session.page, 'POST', '/quotations', {
              customer_id: customerId,
              sales_user_id: session.userId,
              quotation_date: isoDate(0),
              valid_until: isoDate(30),
              currency: 'CNY',
              exchange_rate: '1',
              base_currency: 'CNY',
              price_terms: 'FOB',
              tax_inclusive: true,
              tax_rate: '0',
              items: [
                {
                  product_id: productId,
                  unit: productUnit,
                  quantity: SMALL_QUANTITY,
                  unit_price: SMALL_UNIT_PRICE,
                  unit_price_with_tax: SMALL_UNIT_PRICE,
                  discount_rate: OVER_DISCOUNT_RATE,
                },
              ],
              notes: 'E2E超折扣门 超阈提交件',
            });
            const quotationId = Number(created.data?.id);
            expect(quotationId, '建报价单应返回有效 id').toBeGreaterThan(0);

            // 提交：超折扣门取更严者，金额再小也不自批，强制 pending_approval
            const submitted = await apiCall<Row>(
              session.page,
              'POST',
              `/quotations/${quotationId}/submit`
            );
            expect(
              submitted.data?.status,
              '超阈提交后状态应为 pending_approval（折扣门优先于金额自批档）'
            ).toBe('pending_approval');
            expect(
              Number(submitted.data?.submitted_by),
              '超阈提交后 submitted_by 应留痕为操作人 user_id'
            ).toBe(session.userId);

            // 回读坐实持久化
            const back = await apiCallRaw<Row>(session.page, 'GET', `/quotations/${quotationId}`);
            expect(back.status, '回读状态应为 pending_approval').toBe('pending_approval');
            expect(Number(back.submitted_by), '回读 submitted_by 应为操作人 user_id').toBe(
              session.userId
            );

            return {
              artifacts: [
                { key: 'overThresholdQuotationId', value: quotationId },
                { key: 'repUserId', value: session.userId },
              ],
            };
          },
        },
      ]);

      // ── 4 admin 改阈值为 20，sales_rep 未超阈小额自批 ──
      await apiCall(page, 'PUT', '/quotations/discount-config', {
        over_discount_threshold_pct: UNDER_THRESHOLD,
      });

      await relay.runSteps([
        {
          role: 'sales_rep',
          label: '未超阈小额自批',
          // 未超阈且低于自批金额档时提交人自审是业务契约，与提交棒同身份属预期，
          // 显式豁免重复身份守卫；其余棒次仍受守卫约束
          allowRepeatIdentity: true,
          run: async ({ session, require }) => {
            const productId = Number(require('productId'));
            const productUnit = String(require('productUnit'));
            const customerId = Number(require('customerId'));

            // 建报价单：行折扣率 5 不大于阈值 20，金额 1 低于 10 万自批档
            const created = await apiCall<Row>(session.page, 'POST', '/quotations', {
              customer_id: customerId,
              sales_user_id: session.userId,
              quotation_date: isoDate(0),
              valid_until: isoDate(30),
              currency: 'CNY',
              exchange_rate: '1',
              base_currency: 'CNY',
              price_terms: 'FOB',
              tax_inclusive: true,
              tax_rate: '0',
              items: [
                {
                  product_id: productId,
                  unit: productUnit,
                  quantity: SMALL_QUANTITY,
                  unit_price: SMALL_UNIT_PRICE,
                  unit_price_with_tax: SMALL_UNIT_PRICE,
                  discount_rate: UNDER_DISCOUNT_RATE,
                },
              ],
              notes: 'E2E超折扣门 未超阈自批件',
            });
            const quotationId = Number(created.data?.id);
            expect(quotationId, '建报价单应返回有效 id').toBeGreaterThan(0);

            // 提交：金额可自批且折扣未超阈，走自批腿直接 approved
            const submitted = await apiCall<Row>(
              session.page,
              'POST',
              `/quotations/${quotationId}/submit`
            );
            expect(submitted.data?.status, '未超阈小额提交后状态应为 approved（自批腿）').toBe(
              'approved'
            );
            expect(
              Number(submitted.data?.approved_by),
              '自批后 approved_by 应为操作人 user_id'
            ).toBe(session.userId);

            // 回读坐实持久化
            const back = await apiCallRaw<Row>(session.page, 'GET', `/quotations/${quotationId}`);
            expect(back.status, '回读状态应为 approved').toBe('approved');
            expect(Number(back.approved_by), '回读 approved_by 应为操作人 user_id').toBe(
              session.userId
            );

            return {
              artifacts: [{ key: 'underThresholdQuotationId', value: quotationId }],
            };
          },
        },
      ]);
    } finally {
      await relay.close();
    }

    // ── 5 恢复原阈值 ──
    await apiCall(page, 'PUT', '/quotations/discount-config', {
      over_discount_threshold_pct: String(originalThreshold),
    });
    const restored = await apiCallRaw<Row>(page, 'GET', '/quotations/discount-config');
    expect(Number(restored.over_discount_threshold_pct), '收尾阈值应恢复到原值').toBe(
      originalThreshold
    );
  });
});
