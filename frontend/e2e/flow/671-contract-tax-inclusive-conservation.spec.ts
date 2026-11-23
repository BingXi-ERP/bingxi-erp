// 671 合同含税标记与总金额原样守恒：采购合同 tax_inclusive=true、销售合同 false 建单回读不被重算。
//
// 功能：分别在采购与销售合同建单面显式提交含税标记三态中的 true/false，回读确认标记原样落库，
//       且 total_amount 按传入值存储，不因含税标记被服务层反算小计/税额而改写。
// 判据来源（写入方为准）：models/purchase_contract.rs:58 与 models/sales_contract.rs:63 的 tax_inclusive: Option<bool>，
//       handlers/purchase_contract_handler.rs:66、sales_contract_handler.rs:72 原样透传到 service
//       （services/purchase_contract_service.rs:278 与 sales_contract_service.rs:327 Set(req.tax_inclusive)）；
//       两个模型的 total_amount 均为 Option<Decimal> 单列，无小计/税额/币种/汇率列可供重算。
// 调用方与端点：POST /purchase/purchase-contracts 与 /sales/sales-contracts 建单，GET 同名 /{id} 回读，DELETE /{id} 清理。
// 数据形状与存储：total_amount 为 DECIMAL，JSON 出参为字符串，定点分位比较；tax_inclusive 必须逐值等于 true/false，
//       不是字符串也不是缺键；币种/汇率按模型存在性断言（模型无列时出参不得自造字段）。
// 状态词表与失败：本例不涉状态流转；失败仅 AppError 字符串码，建单失败直接抛错不掩盖。
// 与 451 分工：451 钉报价单含税，本例专钉采购/销售合同建单字段与金额守恒，不重复报价断言。
import { test, expect } from '../diagnose-fixture';
import {
  apiCall,
  apiCallRaw,
  ensureTestEntities,
  genCode,
  getCtx,
  loginViaUI,
  tryCleanup,
} from './helpers';

type Row = Record<string, unknown>;

/** 功能：DECIMAL 定点转分；入参：JSON 值+字段名；出参：bigint 分；异常：非数字或超两位尾数抛错。 */
function decimalCents(value: unknown, label: string): bigint {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`${label} 非 DECIMAL 出参：${JSON.stringify(value)}`);
  }
  const matched = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!matched) throw new Error(`${label} 无法定点解析：${String(value)}`);
  const fraction = (matched[3] ?? '').padEnd(2, '0');
  if (fraction.length > 2 && /[1-9]/.test(fraction.slice(2))) {
    throw new Error(`${label} 精度超过两位：${String(value)}`);
  }
  return BigInt(`${matched[1]}${matched[2]}${fraction.slice(0, 2)}`);
}

/** 功能：必填正整数 id；入参：未知值+标签；出参：number；异常：非正整数抛错。 */
function requireId(value: unknown, label: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`${label} 非法：${JSON.stringify(value)}`);
  return id;
}

/** 功能：核对合同回读守恒；入参：回读行+传入金额(分)+期望含税标记+标签；出参：void；异常：字段缺失或漂移抛错。 */
function expectContractConserved(
  row: Row,
  amountCents: bigint,
  taxInclusive: boolean,
  label: string
): void {
  expect(row.tax_inclusive, `${label} 含税标记须原样落库`).toBe(taxInclusive);
  expect(decimalCents(row.total_amount, `${label} total_amount`), `${label} 金额不得被重算`).toBe(
    amountCents
  );
  for (const extra of ['currency', 'exchange_rate']) {
    expect(
      Object.prototype.hasOwnProperty.call(row, extra),
      `${label} 模型无 ${extra} 列，出参不得自造该字段`
    ).toBe(false);
  }
}

test.describe.serial('671 合同含税标记与金额原样守恒', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('采购含税与销售不含税建单，回读标记和总额均不漂移', async ({ page }) => {
    const ctx = getCtx();
    const tag = genCode('671');
    const supplierId = requireId(ctx.supplierId, '基础供应商');
    const customerId = requireId(ctx.customerId, '基础客户');

    const purchaseAmount = '12345.67';
    const purchaseCreated = await apiCall<{ id?: number }>(
      page,
      'POST',
      '/purchase/purchase-contracts',
      {
        contract_name: `E2E671-采购-${tag}`,
        supplier_id: supplierId,
        total_amount: purchaseAmount,
        tax_inclusive: true,
      }
    );
    const purchaseId = requireId(purchaseCreated.data?.id, '建采购合同');
    try {
      const purchase = await apiCallRaw<Row>(
        page,
        'GET',
        `/purchase/purchase-contracts/${purchaseId}`
      );
      expectContractConserved(
        purchase,
        decimalCents(purchaseAmount, '采购传入金额'),
        true,
        '采购合同'
      );
    } finally {
      await tryCleanup(
        page,
        'DELETE',
        `/purchase/purchase-contracts/${purchaseId}`,
        `purchase-contract#${purchaseId}`
      );
    }

    const salesAmount = '23456.78';
    const salesCreated = await apiCall<{ id?: number }>(page, 'POST', '/sales/sales-contracts', {
      contract_name: `E2E671-销售-${tag}`,
      customer_id: customerId,
      total_amount: salesAmount,
      tax_inclusive: false,
    });
    const salesId = requireId(salesCreated.data?.id, '建销售合同');
    try {
      const sales = await apiCallRaw<Row>(page, 'GET', `/sales/sales-contracts/${salesId}`);
      expectContractConserved(sales, decimalCents(salesAmount, '销售传入金额'), false, '销售合同');
    } finally {
      await tryCleanup(
        page,
        'DELETE',
        `/sales/sales-contracts/${salesId}`,
        `sales-contract#${salesId}`
      );
    }
  });
});
