// Wave3 财务域：银企对账的多票在途守恒、对账单日期含当日/排除前一日与 0.01 严格阈值。
// 后端判据：handlers/fund_management_handler.rs:493-520 POST /fund-management/bank-reconciliation
//   DTO account_id/bank_statement_balance/statement_date，handler 原样透传 service；
//   services/fund_management_service.rs:39-44 只放行 bank/alipay/wechat，否则 AppError::validation
//   → 400 / VALIDATION_ERROR（utils/error.rs:378,822，出参脱敏故不断言文案）；
//   :389-448 转账额 >10000 落 PENDING 且不扣余额、transfer_date=Local::now().date()；
//   :828-849 差异/在途按 From/ToAccountId + TransferDate<=statement_date + Status!="COMPLETED"
//   逐笔 Decimal 求和；:852-859 |adjusted|<0.01 为 balanced，否则 >0 system_missing / <0 system_excess；
//   models/dto/fund_management_dto.rs:68-95 出参 snake_case，Decimal 线格式为字符串。
// 造数隔离：账户号由 genCode 唯一后缀派生；对账日期取转账记录回读的 transfer_date（不用 JS UTC
//   日期冒充服务器本地日期）；不依赖共享库余额/总数；清理按审批→提现→删户顺序，失败仅告警。
import type { Page } from '@playwright/test';
import { expect, test } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  failureCode,
  genCode,
  loginViaUI,
  tryCleanup,
} from '../flow/helpers';

const ACCOUNTS = '/fund-management/accounts';
const TRANSFERS = '/fund-management/transfers';
const RECONCILIATION = '/fund-management/bank-reconciliation';

// 全部金额用整数分表达，避免浮点 toBe 精确相等。
const A_START_CENTS = 5_000_000;
const B_START_CENTS = 1_200_000;
const T_A_TO_B_FIRST_CENTS = 2_000_000;
const T_A_TO_B_SECOND_CENTS = 1_500_000;
const T_B_TO_A_CENTS = 1_200_000;
const BALANCED_STATEMENT_CENTS = 2_700_000;

interface FundAccount {
  id?: number;
  account_no?: string;
  account_name?: string;
  account_type?: string;
  balance?: unknown;
  available_balance?: unknown;
}

interface FundTransfer {
  id?: number;
  transfer_no?: string;
  from_account_id?: number | null;
  to_account_id?: number | null;
  amount?: unknown;
  transfer_date?: string;
  status?: string | null;
}

interface ReconciliationResult {
  account_id?: number;
  account_no?: string;
  account_name?: string;
  statement_date?: string;
  system_balance?: unknown;
  bank_statement_balance?: unknown;
  difference?: unknown;
  timing_difference?: unknown;
  adjusted_difference?: unknown;
  diff_type?: string;
  pending_out_count?: number;
  pending_in_count?: number;
}

interface TransferSeed {
  from: number;
  to: number;
  cents: number;
  label: string;
}

interface CleanupAccount {
  role: string;
  id: number;
  withdrawCents: number;
}

interface CleanupState {
  transfers: number[];
  accounts: CleanupAccount[];
}

function money(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

function centsOf(value: unknown, label: string): number {
  expect(
    typeof value,
    `[501] ${label} 须为 rust_decimal 字符串线格式，实际 ${JSON.stringify(value)}`
  ).toBe('string');
  const text = value as string;
  // available_balance 列刻度 DECIMAL(18,4)：接受 4 位小数，百分位以下须为零尾数，不静默截断。
  expect(/^-?\d+(\.\d{1,4})?$/.test(text), `[501] ${label} 金额格式异常: ${text}`).toBe(true);
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = (negative ? text.slice(1) : text).split('.');
  expect(
    fraction.length <= 2 || fraction.slice(2) === '00',
    `[501] ${label} 含百分位以下非零尾数，超出分精度: ${text}`
  ).toBe(true);
  const magnitude = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  const cents = negative ? -magnitude : magnitude;
  expect(Number.isSafeInteger(cents), `[501] ${label} 金额超出安全整数范围: ${text}`).toBe(true);
  return cents;
}

function expectCents(actual: unknown, expected: number, label: string): void {
  expect(
    centsOf(actual, label),
    `[501] ${label} 应为 ${money(expected)}，实际 ${JSON.stringify(actual)}`
  ).toBe(expected);
}

function previousDay(date: string): string {
  expect(/^\d{4}-\d{2}-\d{2}$/.test(date), `[501] 转账日期格式异常: ${date}`).toBe(true);
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  expect(Number.isFinite(timestamp), `[501] 转账日期无法解析: ${date}`).toBe(true);
  return new Date(timestamp - 86_400_000).toISOString().slice(0, 10);
}

async function createAccount(
  page: Page,
  tag: string,
  role: string,
  accountType: 'bank' | 'cash'
): Promise<FundAccount> {
  const accountNo = `E2E501-${tag}-${role}`;
  const row = await apiCallRaw<FundAccount>(page, 'POST', ACCOUNTS, {
    account_name: `E2E501 ${role} ${tag}`,
    account_no: accountNo,
    account_type: accountType,
    currency: 'CNY',
  });
  expect(typeof row?.id, `[501] ${role} 建户须返回 id，实际 ${JSON.stringify(row)}`).toBe('number');
  expect(
    row?.account_no,
    `[501] ${role} 账户号回读应为 ${accountNo}，实际 ${String(row?.account_no)}`
  ).toBe(accountNo);
  expect(
    row?.account_type,
    `[501] ${role} 类型回读应为 ${accountType}，实际 ${String(row?.account_type)}`
  ).toBe(accountType);
  expectCents(row?.balance, 0, `${role} 新建账户余额`);
  return row;
}

async function deposit(page: Page, accountId: number, cents: number, role: string): Promise<void> {
  await apiCallRaw(page, 'POST', `${ACCOUNTS}/${accountId}/deposit`, { amount: money(cents) });
  const row = await apiCallRaw<FundAccount>(page, 'GET', `${ACCOUNTS}/${accountId}`);
  expectCents(row?.balance, cents, `${role} 存款后 balance`);
  expectCents(row?.available_balance, cents, `${role} 存款后 available_balance`);
}

async function createPendingTransfer(
  page: Page,
  seed: TransferSeed
): Promise<{ id: number; transferDate: string }> {
  const row = await apiCallRaw<FundTransfer>(page, 'POST', '/fund-management/transfer', {
    from_account_id: seed.from,
    to_account_id: seed.to,
    amount: money(seed.cents),
    reason: `E2E501 ${seed.label}`,
  });
  expect(typeof row?.id, `[501] ${seed.label} 转账须返回 id，实际 ${JSON.stringify(row)}`).toBe(
    'number'
  );
  const id = Number(row?.id);
  const detail = await apiCallRaw<FundTransfer>(page, 'GET', `${TRANSFERS}/${id}`);
  // service.rs:390-396：金额 >10000 落 PENDING；字节级大写，不做状态归一化。
  expect(
    detail?.status,
    `[501] ${seed.label} 状态须为 PENDING，实际 ${String(detail?.status)}`
  ).toBe('PENDING');
  expectCents(detail?.amount, seed.cents, `${seed.label} 转账金额`);
  expect(Number(detail?.from_account_id), `[501] ${seed.label} 转出账户应为 ${seed.from}`).toBe(
    seed.from
  );
  expect(Number(detail?.to_account_id), `[501] ${seed.label} 转入账户应为 ${seed.to}`).toBe(
    seed.to
  );
  expect(
    typeof detail?.transfer_date,
    `[501] ${seed.label} 须回读 transfer_date，实际 ${JSON.stringify(detail)}`
  ).toBe('string');
  const transferDate = detail?.transfer_date as string;
  expect(
    /^\d{4}-\d{2}-\d{2}$/.test(transferDate),
    `[501] ${seed.label} 转账日期格式异常: ${transferDate}`
  ).toBe(true);
  return { id, transferDate };
}

async function reconcile(
  page: Page,
  accountId: number,
  statementCents: number,
  statementDate: string
): Promise<ReconciliationResult> {
  return apiCallRaw<ReconciliationResult>(page, 'POST', RECONCILIATION, {
    account_id: accountId,
    bank_statement_balance: money(statementCents),
    statement_date: statementDate,
  });
}

async function cleanup(page: Page, state: CleanupState): Promise<void> {
  for (const id of state.transfers) {
    await tryCleanup(page, 'POST', `${TRANSFERS}/${id}/approve`, `[501] transfer#${id} 审批`);
  }
  for (const account of state.accounts) {
    if (account.withdrawCents <= 0) continue;
    try {
      await apiCallRaw(page, 'POST', `${ACCOUNTS}/${account.id}/withdraw`, {
        amount: money(account.withdrawCents),
        remark: `E2E501 cleanup ${account.role}`,
      });
    } catch (e) {
      console.warn(
        `[cleanup] [501] ${account.role} 提现 ${money(account.withdrawCents)} 失败: ${(e as Error).message}`
      );
    }
  }
  for (const account of state.accounts) {
    await tryCleanup(page, 'DELETE', `${ACCOUNTS}/${account.id}`, `[501] ${account.role} 账户删除`);
  }
}

test('501 银企对账：多票在途差异守恒、日期区间与 0.01 严格阈值', async ({ page }) => {
  const tag = genCode('W3F501').replace(/-/g, '');
  const state: CleanupState = { transfers: [], accounts: [] };
  await loginViaUI(page);

  try {
    const accountA = await createAccount(page, tag, 'A', 'bank');
    const accountB = await createAccount(page, tag, 'B', 'bank');
    const accountC = await createAccount(page, tag, 'C', 'cash');
    expect(typeof accountA?.id, '[501] A 账户 id 缺失，无法继续造数').toBe('number');
    expect(typeof accountB?.id, '[501] B 账户 id 缺失，无法继续造数').toBe('number');
    expect(typeof accountC?.id, '[501] C 账户 id 缺失，无法继续造数').toBe('number');
    const accountAId = Number(accountA.id);
    const accountBId = Number(accountB.id);
    const accountCId = Number(accountC.id);

    state.accounts.push(
      {
        role: 'A',
        id: accountAId,
        withdrawCents:
          A_START_CENTS - T_A_TO_B_FIRST_CENTS - T_A_TO_B_SECOND_CENTS + T_B_TO_A_CENTS,
      },
      {
        role: 'B',
        id: accountBId,
        withdrawCents:
          B_START_CENTS + T_A_TO_B_FIRST_CENTS + T_A_TO_B_SECOND_CENTS - T_B_TO_A_CENTS,
      },
      { role: 'C', id: accountCId, withdrawCents: 0 }
    );

    await deposit(page, accountAId, A_START_CENTS, 'A');
    await deposit(page, accountBId, B_START_CENTS, 'B');
    expectCents(
      (await apiCallRaw<FundAccount>(page, 'GET', `${ACCOUNTS}/${accountCId}`))?.balance,
      0,
      'C 现金账户余额'
    );

    const seeds: TransferSeed[] = [
      { from: accountAId, to: accountBId, cents: T_A_TO_B_FIRST_CENTS, label: 'A->B-20000' },
      { from: accountAId, to: accountBId, cents: T_A_TO_B_SECOND_CENTS, label: 'A->B-15000' },
      { from: accountBId, to: accountAId, cents: T_B_TO_A_CENTS, label: 'B->A-12000' },
    ];
    let transferDate: string | undefined;
    for (const seed of seeds) {
      const created = await createPendingTransfer(page, seed);
      state.transfers.push(created.id);
      if (transferDate === undefined) {
        transferDate = created.transferDate;
      } else {
        expect(
          created.transferDate,
          `[501] 三笔转账的 transfer_date 须同一天（对账单日期口径），${seed.label} 为 ${created.transferDate}，首笔为 ${transferDate}`
        ).toBe(transferDate);
      }
    }
    expect(typeof transferDate, '[501] 三笔转账至少须回读到一条 transfer_date').toBe('string');
    const statementDate = transferDate as string;
    const previousStatementDate = previousDay(statementDate);
    expect(previousStatementDate, `[501] 前一日须与转账日不同: ${statementDate}`).not.toBe(
      statementDate
    );

    // 当日：在途出 35000、在途入 12000，system_balance 不因 PENDING 扣减。
    const balanced = await reconcile(page, accountAId, BALANCED_STATEMENT_CENTS, statementDate);
    expect(
      Number(balanced?.account_id),
      `[501] 当日对账账户应为 ${accountAId}，实际 ${JSON.stringify(balanced)}`
    ).toBe(accountAId);
    expect(balanced?.account_no, `[501] 当日对账账户号应为 ${String(accountA.account_no)}`).toBe(
      accountA.account_no
    );
    expect(balanced?.statement_date, `[501] 当日对账单日期应为 ${statementDate}`).toBe(
      statementDate
    );
    expectCents(balanced?.system_balance, A_START_CENTS, '当日 system_balance');
    expectCents(
      balanced?.bank_statement_balance,
      BALANCED_STATEMENT_CENTS,
      '当日 bank_statement_balance'
    );
    expectCents(balanced?.difference, BALANCED_STATEMENT_CENTS - A_START_CENTS, '当日 difference');
    expectCents(
      balanced?.timing_difference,
      T_B_TO_A_CENTS - T_A_TO_B_FIRST_CENTS - T_A_TO_B_SECOND_CENTS,
      '当日 timing_difference'
    );
    expectCents(balanced?.adjusted_difference, 0, '当日 adjusted_difference');
    expect(
      balanced?.diff_type,
      `[501] 当日 diff_type 应为 balanced，实际 ${String(balanced?.diff_type)}`
    ).toBe('balanced');
    expect(
      Number(balanced?.pending_out_count),
      `[501] 当日在途转出应为 2 笔，实际 ${JSON.stringify(balanced)}`
    ).toBe(2);
    expect(
      Number(balanced?.pending_in_count),
      `[501] 当日在途转入应为 1 笔，实际 ${JSON.stringify(balanced)}`
    ).toBe(1);

    // 前一日：三笔转账日为今天，TransferDate <= statement_date 过滤必须排除全部在途。
    const previous = await reconcile(
      page,
      accountAId,
      BALANCED_STATEMENT_CENTS,
      previousStatementDate
    );
    expect(previous?.statement_date, `[501] 前一日对账单日期应为 ${previousStatementDate}`).toBe(
      previousStatementDate
    );
    expectCents(previous?.system_balance, A_START_CENTS, '前一日 system_balance');
    expectCents(
      previous?.difference,
      BALANCED_STATEMENT_CENTS - A_START_CENTS,
      '前一日 difference'
    );
    expectCents(previous?.timing_difference, 0, '前一日 timing_difference');
    expectCents(
      previous?.adjusted_difference,
      BALANCED_STATEMENT_CENTS - A_START_CENTS,
      '前一日 adjusted_difference'
    );
    expect(
      Number(previous?.pending_out_count),
      `[501] 前一日在途转出应为 0 笔，实际 ${JSON.stringify(previous)}`
    ).toBe(0);
    expect(
      Number(previous?.pending_in_count),
      `[501] 前一日在途转入应为 0 笔，实际 ${JSON.stringify(previous)}`
    ).toBe(0);
    expect(
      previous?.diff_type,
      `[501] 前一日 diff_type 应为 system_excess，实际 ${String(previous?.diff_type)}`
    ).toBe('system_excess');

    // 0.01 严格边界：adjusted 恰为 +0.01 / -0.01，分别落 system_missing / system_excess。
    const plusOneCent = await reconcile(
      page,
      accountAId,
      BALANCED_STATEMENT_CENTS + 1,
      statementDate
    );
    expectCents(plusOneCent?.adjusted_difference, 1, '+0.01 adjusted_difference');
    expect(
      plusOneCent?.diff_type,
      `[501] +0.01 应分类 system_missing，实际 ${String(plusOneCent?.diff_type)}`
    ).toBe('system_missing');
    const minusOneCent = await reconcile(
      page,
      accountAId,
      BALANCED_STATEMENT_CENTS - 1,
      statementDate
    );
    expectCents(minusOneCent?.adjusted_difference, -1, '-0.01 adjusted_difference');
    expect(
      minusOneCent?.diff_type,
      `[501] -0.01 应分类 system_excess，实际 ${String(minusOneCent?.diff_type)}`
    ).toBe('system_excess');

    // 账户类型门：cash 不在白名单，只断 400 + 机器码，不碰脱敏文案。
    const failure = await apiCallExpectFail(page, 'POST', RECONCILIATION, {
      account_id: accountCId,
      bank_statement_balance: money(BALANCED_STATEMENT_CENTS),
      statement_date: statementDate,
    });
    expect(failure.status, `[501] cash 账户对账须 400，实际 ${failure.status}`).toBe(400);
    expect(
      failureCode(failure),
      `[501] cash 账户对账机器码须 VALIDATION_ERROR，实际 ${String(failureCode(failure))}`
    ).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
  } finally {
    await cleanup(page, state);
  }
});
