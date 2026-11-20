// 516 财务报表穿透：过账门 + period/subject_code/subject_prefix 入参门 + 分录级字段守恒。
// 后端判据：routes/finance.rs:159-162 挂载 GET /finance/reports/drill-down；
//   handlers/finance_report_handler.rs:221-232 定义 DrillDownQuery，:240-272 分派并构造
//   validation_displayable 拒绝；services/finance_report_service.rs:765-804 只取 posted
//   凭证且按日期闭区间与 subject_code.starts_with 过滤，:806-840 解析 period=YYYY-MM；
//   models/dto/finance_report_dto.rs:143-160 定义十三条出参键；status/finance.rs:65-77
//   凭证状态小写，过账门只认 posted；utils/error.rs:220/379/817 => 400 + VALIDATION_ERROR。
// 金额出参为 Decimal 字符串，统一解析到整数分比较，不做浮点精确相等。
import { expect, test } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  failureCode,
  genCode,
  loginViaUI,
  tryCleanup,
} from '../flow/helpers';

const PATH = '/finance/reports/drill-down';
const VOUCHER_TYPE = '记账凭证';
const SOURCE_TYPE_MANUAL = 'MANUAL';
const SOURCE_MODULE_E2E = 'E2E';
const DIRECTION_DEBIT = 'debit';
const DIRECTION_CREDIT = 'credit';
const STATUS_DRAFT = 'draft';
const STATUS_SUBMITTED = 'submitted';
const STATUS_REVIEWED = 'reviewed';
const STATUS_POSTED = 'posted';
const DEBIT_AMOUNT_CENTS = 12_345;
const MSG_PERIOD_REQUIRED = 'trial_balance 穿透需要 period 参数';
const MSG_SUBJECT_CODE_REQUIRED = 'trial_balance 穿透需要 subject_code 参数';
const MSG_SUBJECT_PREFIX_REQUIRED = '报表穿透需要 subject_prefix 参数';
const MSG_PERIOD_FORMAT = 'period 格式必须为 YYYY-MM';
const MSG_PERIOD_YEAR = 'period 年份无效';
const MSG_PERIOD_MONTH = 'period 月份无效';
const MSG_PERIOD_RANGE = 'period 月份必须在 1-12 之间';

const DRILL_DOWN_KEYS = [
  'voucher_id',
  'voucher_no',
  'voucher_date',
  'line_no',
  'subject_code',
  'subject_name',
  'summary',
  'debit',
  'credit',
  'source_type',
  'source_module',
  'source_bill_id',
  'source_bill_no',
].sort();

interface SubjectSeed {
  id: number;
  code: string;
  name: string;
}

interface VoucherSeed {
  id: number;
  voucherNo: string;
  voucherDate: string;
  sourceBillNo: string;
  summary: string;
}

type DrillDownEntry = Record<string, unknown>;

interface CleanupTarget {
  path: string;
  label: string;
}

const CLEANUP: CleanupTarget[] = [];

function dateStr(daysFromToday: number): string {
  return new Date(Date.now() + daysFromToday * 86_400_000).toISOString().slice(0, 10);
}

function queryString(parts: Record<string, string>): string {
  return Object.entries(parts)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  expect(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    `[516] ${label} 必须是对象，实际 ${JSON.stringify(value)}`
  ).toBe(true);
  return value as Record<string, unknown>;
}

function requireInteger(value: unknown, label: string, min: number): number {
  const parsed = Number(value);
  expect(
    Number.isSafeInteger(parsed) && parsed >= min,
    `[516] ${label} 必须是 >=${min} 的整数，实际 ${JSON.stringify(value)}`
  ).toBe(true);
  return parsed;
}

function requireString(value: unknown, label: string): string {
  expect(
    typeof value === 'string' && value.length > 0,
    `[516] ${label} 必须是非空字符串，实际 ${JSON.stringify(value)}`
  ).toBe(true);
  return value as string;
}

function decimalCents(value: unknown, label: string): number {
  expect(
    typeof value === 'string',
    `[516] ${label} 必须是 Decimal 字符串，实际 ${JSON.stringify(value)}`
  ).toBe(true);
  const raw = value as string;
  const matched = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);
  expect(matched !== null, `[516] ${label} 不是合法 Decimal：${raw}`).toBe(true);
  if (matched === null) throw new Error(`[516] ${label} 不是合法 Decimal：${raw}`);
  const fraction = matched[3] ?? '';
  expect(!/[1-9]/.test(fraction.slice(2)), `[516] ${label} 精度超过分位，实际 ${raw}`).toBe(true);
  const whole = Number(matched[2]);
  const cents = whole * 100 + Number(fraction.slice(0, 2).padEnd(2, '0'));
  expect(
    Number.isSafeInteger(whole) && Number.isSafeInteger(cents),
    `[516] ${label} 超出安全整数范围，实际 ${raw}`
  ).toBe(true);
  return matched[1] === '-' ? -cents : cents;
}

function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new Error(`[516] 金额分必须为非负安全整数，实际 ${String(cents)}`);
  }
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

async function createSubject(
  page: Page,
  direction: typeof DIRECTION_DEBIT | typeof DIRECTION_CREDIT,
  prefix: string
): Promise<SubjectSeed> {
  const code = genCode(prefix);
  const row = asObject(
    await apiCallRaw<unknown>(page, 'POST', '/subjects', {
      code,
      name: `516科目${code}`,
      level: 1,
      parent_id: null,
      balance_direction: direction,
      assist_customer: false,
      assist_supplier: false,
      assist_batch: false,
      assist_color_no: false,
      enable_dual_unit: false,
    }),
    `创建科目 ${code}`
  );
  const id = requireInteger(row.id, `科目 ${code} 主键`, 1);
  expect(requireString(row.code, `科目 ${id} 回读编码`)).toBe(code);
  const name = requireString(row.name, `科目 ${id} 回读名称`);
  CLEANUP.push({ path: `/subjects/${id}`, label: `516科目 ${code}` });
  return { id, code, name };
}

async function createVoucher(
  page: Page,
  debit: SubjectSeed,
  credit: SubjectSeed,
  voucherDate: string
): Promise<VoucherSeed> {
  const sourceBillNo = genCode('VBLSRC');
  const summary = genCode('SUM');
  const row = asObject(
    await apiCallRaw<unknown>(page, 'POST', '/vouchers', {
      voucher_type: VOUCHER_TYPE,
      voucher_date: voucherDate,
      source_type: SOURCE_TYPE_MANUAL,
      source_module: SOURCE_MODULE_E2E,
      source_bill_no: sourceBillNo,
      batch_no: 'B-516-V',
      color_no: 'C-516-V',
      items: [
        {
          line_no: 1,
          subject_id: debit.id,
          debit: formatCents(DEBIT_AMOUNT_CENTS),
          credit: '0',
          summary,
        },
        {
          line_no: 2,
          subject_id: credit.id,
          debit: '0',
          credit: formatCents(DEBIT_AMOUNT_CENTS),
          summary,
        },
      ],
    }),
    '创建平衡凭证'
  );
  const id = requireInteger(row.id, '凭证主键', 1);
  const voucherNo = requireString(row.voucher_no, '凭证号');
  CLEANUP.push({ path: `/vouchers/${id}`, label: `516凭证 ${voucherNo}` });
  return { id, voucherNo, voucherDate, sourceBillNo, summary };
}

async function readVoucher(page: Page, id: number): Promise<Record<string, unknown>> {
  return asObject(await apiCallRaw<unknown>(page, 'GET', `/vouchers/${id}`), `凭证详情 ${id}`);
}

async function transitionVoucher(
  page: Page,
  id: number,
  action: 'submit' | 'review' | 'post',
  expectedStatus: string
): Promise<void> {
  const row = asObject(
    await apiCallRaw<unknown>(page, 'POST', `/vouchers/${id}/${action}`),
    `${action} 凭证 ${id}`
  );
  expect(requireInteger(row.id, `${action} 回包主键`, 1), `[516] ${action} 回包 id 漂移`).toBe(id);
  expect(
    requireString(row.status, `${action} 回包状态`),
    `[516] ${action} 后状态应为 ${expectedStatus}`
  ).toBe(expectedStatus);
  expect(
    requireString((await readVoucher(page, id)).status, `${action} 后详情状态`),
    `[516] ${action} 后详情状态应为 ${expectedStatus}`
  ).toBe(expectedStatus);
}

async function drill(page: Page, parts: Record<string, string>, label: string): Promise<unknown[]> {
  const data = await apiCallRaw<unknown>(page, 'GET', `${PATH}?${queryString(parts)}`);
  expect(Array.isArray(data), `[516] ${label} data 必须是数组，实际 ${JSON.stringify(data)}`).toBe(
    true
  );
  return data as unknown[];
}

function asEntry(value: unknown, label: string): DrillDownEntry {
  const entry = asObject(value, label);
  expect(
    Object.keys(entry).sort(),
    `[516] ${label} 必须恰好包含 VoucherItemDetail 十三键，实际 ${JSON.stringify(Object.keys(entry))}`
  ).toEqual(DRILL_DOWN_KEYS);
  return entry;
}

function expectValidationFailure(
  fail: { status: number; message?: string | null },
  message: string,
  label: string
): void {
  expect(fail.status, `[516] ${label} 必须 400，实际 ${fail.status} ${JSON.stringify(fail)}`).toBe(
    400
  );
  expect(
    failureCode(fail),
    `[516] ${label} 机器码必须为 VALIDATION_ERROR，实际 ${JSON.stringify(fail)}`
  ).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
  expect(
    fail.message,
    `[516] ${label} 必须外显原文 ${message}，实际 ${JSON.stringify(fail.message)}`
  ).toBe(message);
}

test.afterEach(async ({ page }) => {
  for (const target of CLEANUP.slice().reverse()) {
    await tryCleanup(page, 'DELETE', target.path, target.label);
  }
  CLEANUP.length = 0;
});

test.describe('财务报表穿透明细', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('516-01 过账门、逐字段分录与日期区间', async ({ page }) => {
    const debit = await createSubject(page, DIRECTION_DEBIT, '516SD');
    const credit = await createSubject(page, DIRECTION_CREDIT, '516SC');
    const voucherDate = dateStr(0);
    const period = voucherDate.slice(0, 7);
    const voucher = await createVoucher(page, debit, credit, voucherDate);
    const trialParts = {
      report_type: 'trial_balance',
      period,
      subject_code: debit.code,
    };

    expect(
      requireString((await readVoucher(page, voucher.id)).status, '过账前凭证状态'),
      '[516] 新凭证必须处于 draft'
    ).toBe(STATUS_DRAFT);
    expect(
      await drill(page, trialParts, '过账前试算平衡穿透'),
      '[516] draft 凭证不得进入穿透结果'
    ).toEqual([]);

    await transitionVoucher(page, voucher.id, 'submit', STATUS_SUBMITTED);
    await transitionVoucher(page, voucher.id, 'review', STATUS_REVIEWED);
    await transitionVoucher(page, voucher.id, 'post', STATUS_POSTED);

    const rows = await drill(page, trialParts, '过账后试算平衡穿透');
    expect(rows.length, `[516] 过账后按唯一科目应恰得一条，实际 ${JSON.stringify(rows)}`).toBe(1);
    const entry = asEntry(rows[0], '试算平衡穿透明细');
    expect(
      requireInteger(entry.voucher_id, '明细 voucher_id', 1),
      `[516] voucher_id 应为 ${voucher.id}，实际 ${JSON.stringify(entry.voucher_id)}`
    ).toBe(voucher.id);
    expect(
      requireString(entry.voucher_no, '明细 voucher_no'),
      `[516] voucher_no 应为 ${voucher.voucherNo}`
    ).toBe(voucher.voucherNo);
    expect(
      requireString(entry.voucher_date, '明细 voucher_date'),
      `[516] voucher_date 应为 ${voucherDate}`
    ).toBe(voucherDate);
    expect(requireInteger(entry.line_no, '明细 line_no', 1), '[516] 借方分录行号应为 1').toBe(1);
    expect(
      requireString(entry.subject_code, '明细 subject_code'),
      `[516] subject_code 应为 ${debit.code}`
    ).toBe(debit.code);
    expect(
      requireString(entry.subject_name, '明细 subject_name'),
      `[516] subject_name 应为 ${debit.name}`
    ).toBe(debit.name);
    expect(
      requireString(entry.summary, '明细 summary'),
      `[516] summary 应为 ${voucher.summary}`
    ).toBe(voucher.summary);
    expect(
      decimalCents(entry.debit, '明细 debit'),
      `[516] 借方金额应为 ${formatCents(DEBIT_AMOUNT_CENTS)}，实际 ${JSON.stringify(entry.debit)}`
    ).toBe(DEBIT_AMOUNT_CENTS);
    expect(
      decimalCents(entry.credit, '明细 credit'),
      `[516] 借方行贷方金额应为 0，实际 ${JSON.stringify(entry.credit)}`
    ).toBe(0);
    expect(entry.source_type, '[516] source_type 应回读建单原值').toBe(SOURCE_TYPE_MANUAL);
    expect(entry.source_module, '[516] source_module 应回读建单原值').toBe(SOURCE_MODULE_E2E);
    expect(
      entry.source_bill_id,
      `[516] 未提交 source_bill_id 时出参应为 null，实际 ${JSON.stringify(entry.source_bill_id)}`
    ).toBeNull();
    expect(
      requireString(entry.source_bill_no, '明细 source_bill_no'),
      `[516] source_bill_no 应为 ${voucher.sourceBillNo}`
    ).toBe(voucher.sourceBillNo);

    const prefixParts = {
      report_type: 'income_statement',
      subject_prefix: debit.code,
      start_date: voucherDate,
      end_date: voucherDate,
    };
    const prefixRows = await drill(page, prefixParts, '收入表前缀穿透');
    expect(
      prefixRows.length,
      `[516] 日期闭区间内应恰得一条，实际 ${JSON.stringify(prefixRows)}`
    ).toBe(1);
    expect(
      requireInteger(asEntry(prefixRows[0], '前缀穿透明细').voucher_id, '前缀穿透 voucher_id', 1),
      `[516] 前缀穿透应命中同一凭证 ${voucher.id}`
    ).toBe(voucher.id);

    expect(
      await drill(
        page,
        {
          ...prefixParts,
          start_date: dateStr(-1),
          end_date: dateStr(-1),
        },
        '日期区间外前缀穿透'
      ),
      '[516] 凭证日的前一天不得命中穿透结果'
    ).toEqual([]);
    expect(
      await drill(page, { ...trialParts, period: '2000-01' }, '凭证月外试算平衡穿透'),
      '[516] 非凭证月不得命中穿透结果'
    ).toEqual([]);
  });

  test('516-02 period/subject_code/subject_prefix 与 period 解析负例原文', async ({ page }) => {
    const cases: Array<{ label: string; parts: Record<string, string>; message: string }> = [
      {
        label: 'trial_balance 缺 period',
        parts: { report_type: 'trial_balance', subject_code: '516PLACEHOLDER' },
        message: MSG_PERIOD_REQUIRED,
      },
      {
        label: 'trial_balance 缺 subject_code',
        parts: { report_type: 'trial_balance', period: '2026-01' },
        message: MSG_SUBJECT_CODE_REQUIRED,
      },
      {
        label: 'period 格式错误',
        parts: { report_type: 'trial_balance', period: '202606', subject_code: '516PLACEHOLDER' },
        message: MSG_PERIOD_FORMAT,
      },
      {
        label: 'period 年份无效',
        parts: { report_type: 'trial_balance', period: 'abcd-06', subject_code: '516PLACEHOLDER' },
        message: MSG_PERIOD_YEAR,
      },
      {
        label: 'period 月份无效',
        parts: { report_type: 'trial_balance', period: '2026-ab', subject_code: '516PLACEHOLDER' },
        message: MSG_PERIOD_MONTH,
      },
      {
        label: 'period 月份越界',
        parts: { report_type: 'trial_balance', period: '2026-13', subject_code: '516PLACEHOLDER' },
        message: MSG_PERIOD_RANGE,
      },
      {
        label: '非 trial_balance 缺 subject_prefix',
        parts: { report_type: 'income_statement' },
        message: MSG_SUBJECT_PREFIX_REQUIRED,
      },
    ];

    for (const item of cases) {
      const fail = await apiCallExpectFail(page, 'GET', `${PATH}?${queryString(item.parts)}`);
      expectValidationFailure(fail, item.message, item.label);
    }
  });
});
