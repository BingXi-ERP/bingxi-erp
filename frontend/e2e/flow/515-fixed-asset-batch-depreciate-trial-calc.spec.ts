// 515 固定资产批量折旧试算：直线法公式腿 × 守卫 × 失败腿 × 不落库名实锁
//
// 判据全部来自源码实核：
// - 端点：POST /fixed-assets/batch-depreciate
//   （backend/src/routes/finance.rs:272-275 → handlers/fixed_asset_handler.rs:299-313 →
//   services/fixed_asset_service.rs:891-954 batch_calculate_depreciation）
// - 入参 BatchDepreciateRequest{asset_ids, calculation_date}（handler:319-323；无 user_id 字段，
//   操作人取鉴权上下文——批次 94 P2-9 语义，请求体伪造 user_id 不可达）。
// - 出参键 = DepreciationResult 七键 snake_case（service:1547-1556）：
//   asset_id/asset_no/original_value/accumulated_depreciation/current_depreciation/net_value/depreciation_method；
//   结果顺序 = 请求 asset_ids 的迭代顺序（service:933-950 for 循环逐 id 产出）。
// - 直线法公式（service:956-998 calculate_asset_depreciation）：
//   月折旧 =（原值 − 残值）/(使用年限 × 12)，round_dp(2)；
//   总应计 = 月折旧 × min(已用月数, 总月数)（封顶腿判据）；
//   本次应计提 = max(总应计 − 已计提, 0)；
//   已用月数 = (calc年−purchase年)×12 + (calc月−purchase月)，≤0 → 本次 0；useful_life≤0 → 本次 0。
// - 守卫族（service:898-912）：空数组 → 200 且 data=[]（不是错误）；len>10000 → validation 拒绝；
//   calculation_date 非 ISO 日期 → parse::<NaiveDate>() 失败 → validation("日期格式错误")。
//   两者均为 AppError::validation → HTTP 400、code=VALIDATION_ERROR、出参 message 脱敏
//   （utils/error.rs:378 非 Displayable 族），故断言只钉 status+机器码，不断中文文案。
// - 未知 asset_id → AppError::not_found("固定资产") → 404、code=NOT_FOUND（同样脱敏，service:936-938）；
//   混合请求（已知+未知）在循环处整体失败 → 原子性：拿不到部分结果。
// - 名实锁：service 体内 batch_calculate_depreciation 全程无 update/save（对比 per-asset
//   depreciate 落库腿 service:292 起），即本端点是「试算」而非「计提」；
//   故 GET /fixed-assets/{id} 回读与 /depreciation-records 必须纹丝不动——
//   若后续改动偷偷在此端点写库（重复计提缺陷族），515-11 直接判红。
//
// 造数纪律：三枚资产全部本文件自建（genCode 唯一编号 + 锚定固定日期，与运行日无关）；
// 直线法数值刻意取整除组合（120000/60月=2000/月），断言零舍入歧义；
// 尾腿按 fullflow/14-03 同形态清理（active 资产必 dispose 后才能 DELETE，删除门 service:857-863）。
// 金额断言：rust_decimal features=["serde"]（backend/Cargo.toml:60）线格式为字符串，
// 一律折 2 位分位按整数比，不在测试内再造舍入方向。
import { test, expect } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  failureCode,
  genCode,
  loginViaUI,
} from './helpers';

type Row = Record<string, unknown>;

/** DECIMAL 线格式（字符串/数字）折成 2 位分位；宽于分位的尾数必须全为零才截，出现非零即判红 */
function toScaled(v: unknown, scale: number, label: string): bigint {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  if (s === '') throw new Error(`${label}：Decimal 出参非 string|number，raw=${JSON.stringify(v)}`);
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`${label}：Decimal 出参形态非法，raw="${s}"`);
  const [, sign, intPart, frac = ''] = m;
  if (frac.length > scale && frac.slice(scale).replace(/0+$/, '') !== '') {
    throw new Error(`${label}：出参标度超出分位精度且非零，raw="${s}"`);
  }
  const padded = (intPart + frac.slice(0, scale)).padEnd(intPart.length + scale, '0');
  const value = BigInt(padded);
  return sign === '-' ? -value : value;
}

/** 字面金额 → 分 */
function cents(want: string): bigint {
  return toScaled(want, 2, `期望金额 ${want}`);
}

function eqAmount(actual: unknown, expectedCents: bigint, label: string): void {
  expect(
    toScaled(actual, 2, label),
    `${label}：期望(分)=${expectedCents} 实际=${JSON.stringify(actual)}`
  ).toBe(expectedCents);
}

function requireId(row: Row, label: string): number {
  const n = Number(row.id);
  if (!Number.isInteger(n) || n <= 0)
    throw new Error(`${label}：主键未落正整数，raw=${JSON.stringify(row.id)}`);
  return n;
}

function requireStr(v: unknown, label: string): string {
  if (typeof v !== 'string' || v === '')
    throw new Error(`${label}：出参非非空字符串，raw=${JSON.stringify(v)}`);
  return v;
}

/** 本文件三枚自建资产的句柄（515-01 造数腿填充，后续腿消费） */
const ctx: {
  assetA: { id: number; asset_no: string } | null;
  assetB: { id: number; asset_no: string } | null;
  assetC: { id: number; asset_no: string } | null;
} = { assetA: null, assetB: null, assetC: null };

function needAsset(which: 'assetA' | 'assetB' | 'assetC'): { id: number; asset_no: string } {
  const a = ctx[which];
  if (!a) throw new Error(`${which} 未就绪：造数腿 515-01 必须先通过`);
  return a;
}

/** 直建资产：CreateAssetRequestDto 字段逐枚显式给出（handler:55-69），不依赖后端缺省 */
async function seedAsset(
  page: import('@playwright/test').Page,
  opts: {
    name: string;
    original_value: number;
    useful_life: number;
    purchase_date: string;
  }
): Promise<Row> {
  return apiCallRaw<Row>(page, 'POST', '/fixed-assets', {
    asset_no: genCode('FA'),
    asset_name: opts.name,
    asset_category: 'E2E设备',
    specification: '515试算规格',
    location: 'E2E 515 车间',
    original_value: opts.original_value,
    useful_life: opts.useful_life,
    depreciation_method: 'straight_line',
    purchase_date: opts.purchase_date,
  });
}

/** 批量试算调用：出参必须是数组（Vec<DepreciationResult> 直接序列化），非数组先点名 */
async function batchTrial(
  page: import('@playwright/test').Page,
  assetIds: number[],
  calculationDate: string
): Promise<Row[]> {
  const rows = await apiCallRaw<Row[]>(page, 'POST', '/fixed-assets/batch-depreciate', {
    asset_ids: assetIds,
    calculation_date: calculationDate,
  });
  if (!Array.isArray(rows)) {
    throw new Error(
      `batch-depreciate 出参 data 必须是数组（handler:299-313 → Vec<DepreciationResult>），实际=${JSON.stringify(rows).slice(0, 200)}`
    );
  }
  return rows;
}

test.describe('515 固定资产批量折旧试算（公式/守卫/失败腿/不落库）', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('515-01 造数与基线回读：三枚自建资产落库形态逐字段核', async ({ page }) => {
    // A：120000 原值 / 5 年 / 2023-01-15 购置 → 月折旧 2000.00（120000/60 整除，零舍入歧义）
    const a = await seedAsset(page, {
      name: genCode('E2E-515-A'),
      original_value: 120000,
      useful_life: 5,
      purchase_date: '2023-01-15',
    });
    // B：购置日刻意晚于锚定计算日（2023-08-01 > 2023-07-15）→ 负月数守卫腿
    const b = await seedAsset(page, {
      name: genCode('E2E-515-B'),
      original_value: 60000,
      useful_life: 4,
      purchase_date: '2023-08-01',
    });
    // C：useful_life=0 → 零年限守卫腿（service:968-971 优先于月数计算）
    const c = await seedAsset(page, {
      name: genCode('E2E-515-C'),
      original_value: 30000,
      useful_life: 0,
      purchase_date: '2020-01-01',
    });
    ctx.assetA = { id: requireId(a, '资产A'), asset_no: requireStr(a.asset_no, '资产A编号') };
    ctx.assetB = { id: requireId(b, '资产B'), asset_no: requireStr(b.asset_no, '资产B编号') };
    ctx.assetC = { id: requireId(c, '资产C'), asset_no: requireStr(c.asset_no, '资产C编号') };
    // 显式传入的 asset_no 原样落库（service:125-128：manual_asset_no Some 分支不重编号）
    expect(a.asset_no, '显式编号必须原样使用').toBe(ctx.assetA.asset_no);

    // A 的基线回读：create 落库语义（service:147-168）——净额=原值、已计提=0、状态 active
    const readA = await apiCallRaw<Row>(page, 'GET', `/fixed-assets/${ctx.assetA.id}`);
    eqAmount(readA.original_value, cents('120000'), 'A 基线原值');
    eqAmount(readA.accumulated_depreciation, cents('0'), 'A 基线已计提');
    eqAmount(readA.net_value, cents('120000'), 'A 基线净额');
    expect(
      readA.status,
      '新建资产状态小写 active（master_data::ACTIVE，status/general.rs:132）'
    ).toBe('active');
    expect(readA.useful_life, 'A 使用年限原样回读').toBe(5);
    expect(String(readA.purchase_date), 'A 购置日期原样回读').toBe('2023-01-15');
    expect(String(readA.depreciation_method), 'A 折旧方法原样回读').toBe('straight_line');
  });

  test('515-02 直线法主腿：6 个月应计 = 2000.00 × 6 = 12000.00', async ({ page }) => {
    const a = needAsset('assetA');
    const rows = await batchTrial(page, [a.id], '2023-07-15');
    expect(rows.length, '单资产请求必须恰好一行结果').toBe(1);
    const r = rows[0];
    expect(Number(r.asset_id), 'asset_id 必须点名被请求资产').toBe(a.id);
    expect(String(r.asset_no), 'asset_no 与落库编号同源').toBe(a.asset_no);
    // 出参七键逐枚核（键名漂移 = 契约断，这里先全枚举）
    for (const key of [
      'asset_id',
      'asset_no',
      'original_value',
      'accumulated_depreciation',
      'current_depreciation',
      'net_value',
      'depreciation_method',
    ]) {
      expect(Object.prototype.hasOwnProperty.call(r, key), `出参必须含键 ${key}`).toBe(true);
    }
    eqAmount(r.original_value, cents('120000'), 'A 出参原值');
    eqAmount(r.current_depreciation, cents('12000'), 'A 本次应计提（2000/月 × 6 月）');
    eqAmount(r.accumulated_depreciation, cents('12000'), 'A 出参累计=已计提0+本次12000');
    eqAmount(r.net_value, cents('108000'), 'A 出参净额=原值120000−12000');
    expect(String(r.depreciation_method), 'A 出参折旧方法').toBe('straight_line');
  });

  test('515-03 封顶腿：已用月数 84 > 总月数 60 → 本次恰为全额 120000，净额归零不穿底', async ({
    page,
  }) => {
    const a = needAsset('assetA');
    const rows = await batchTrial(page, [a.id], '2030-01-15');
    expect(rows.length, '单资产封顶腿一行').toBe(1);
    const r = rows[0];
    eqAmount(r.current_depreciation, cents('120000'), 'A 封顶本次=2000×min(84,60)');
    eqAmount(r.accumulated_depreciation, cents('120000'), 'A 封顶累计=全额');
    eqAmount(r.net_value, cents('0'), 'A 封顶净额=120000−120000（残值 0，不穿底为负）');
  });

  test('515-04 月数守卫双腿：同月为 0、购置日在计算日之后（负差）均为 0', async ({ page }) => {
    const a = needAsset('assetA');
    const b = needAsset('assetB');
    // 同月：months_used=(7−7)=0 → 本次 0（service:983-991 ≤0 分支）
    const sameMonth = await batchTrial(page, [a.id], '2023-01-20');
    expect(sameMonth.length, '同月腿一行').toBe(1);
    eqAmount(sameMonth[0].current_depreciation, cents('0'), 'A 同月本次应计 0');
    eqAmount(sameMonth[0].accumulated_depreciation, cents('0'), 'A 同月累计 0');
    eqAmount(sameMonth[0].net_value, cents('120000'), 'A 同月净额不动');
    // 负差：B 购置 2023-08-01，计算 2023-07-15 → months_used=−1 → 本次 0
    const beforePurchase = await batchTrial(page, [b.id], '2023-07-15');
    expect(beforePurchase.length, '负差腿一行').toBe(1);
    eqAmount(beforePurchase[0].current_depreciation, cents('0'), 'B 未到期本次 0');
    eqAmount(beforePurchase[0].net_value, cents('60000'), 'B 净额=原值不动');
  });

  test('515-05 零年限守卫：useful_life=0 时即便计算日远超购置 10 年也 0 计提', async ({ page }) => {
    const c = needAsset('assetC');
    const rows = await batchTrial(page, [c.id], '2030-01-15');
    expect(rows.length, '零年限腿一行').toBe(1);
    eqAmount(rows[0].current_depreciation, cents('0'), 'C 零年限本次 0（service:968-971）');
    eqAmount(rows[0].accumulated_depreciation, cents('0'), 'C 零年限累计 0');
    eqAmount(rows[0].net_value, cents('30000'), 'C 净额=原值 30000');
  });

  test('515-06 多资产腿：结果顺序 = 请求 asset_ids 顺序，逐行金额各归各', async ({ page }) => {
    const a = needAsset('assetA');
    const b = needAsset('assetB');
    const c = needAsset('assetC');
    const rows = await batchTrial(page, [a.id, b.id, c.id], '2023-07-15');
    expect(rows.length, '三资产请求必须三行').toBe(3);
    expect(
      rows.map(r => Number(r.asset_id)),
      '出参顺序必须逐项等于请求顺序（service:933 迭代序）'
    ).toEqual([a.id, b.id, c.id]);
    eqAmount(rows[0].current_depreciation, cents('12000'), '混合腿 A 本次 12000');
    eqAmount(rows[1].current_depreciation, cents('0'), '混合腿 B 本次 0');
    eqAmount(rows[2].current_depreciation, cents('0'), '混合腿 C 本次 0');
    expect(String(rows[1].asset_no), 'B 行编号同源').toBe(b.asset_no);
    expect(String(rows[2].asset_no), 'C 行编号同源').toBe(c.asset_no);
  });

  test('515-07 空数组守卫腿：200 + data=[]，不是错误、不查库', async ({ page }) => {
    const rows = await batchTrial(page, [], '2023-07-15');
    expect(rows.length, '空请求必须空结果（service:899-901 Ok(Vec::new())）').toBe(0);
  });

  test('515-08 非法日期失败腿：非 ISO 与越界月日都拒 400 VALIDATION_ERROR', async ({ page }) => {
    const a = needAsset('assetA');
    for (const bad of ['2023-13-99', 'not-a-date']) {
      const f = await apiCallExpectFail(page, 'POST', '/fixed-assets/batch-depreciate', {
        asset_ids: [a.id],
        calculation_date: bad,
      });
      expect(f.status, `非法日期 "${bad}" 必须 400`).toBe(400);
      expect(
        failureCode(f),
        `非法日期 "${bad}" 机器码必须 VALIDATION_ERROR（脱敏族，只断码不断文案）`
      ).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
    }
  });

  test('515-09 未知资产失败腿与原子性：纯未知 404；已知+未知混合整体 404 无部分结果', async ({
    page,
  }) => {
    const a = needAsset('assetA');
    const ghost = 2_000_000_000;
    const fSolo = await apiCallExpectFail(page, 'POST', '/fixed-assets/batch-depreciate', {
      asset_ids: [ghost],
      calculation_date: '2023-07-15',
    });
    expect(fSolo.status, '未知资产必须 404').toBe(404);
    expect(failureCode(fSolo), '未知资产机器码').toBe(APP_ERROR_CODES.NOT_FOUND);

    const fMixed = await apiCallExpectFail(page, 'POST', '/fixed-assets/batch-depreciate', {
      asset_ids: [a.id, ghost],
      calculation_date: '2023-07-15',
    });
    expect(fMixed.status, '混合请求遇未知 id 整体拒绝，不得返回部分行').toBe(404);
    expect(failureCode(fMixed), '混合请求机器码同样 NOT_FOUND').toBe(APP_ERROR_CODES.NOT_FOUND);
  });

  test('515-10 超限守卫腿：10001 个 id 在任何 DB 查询前被 400 拒绝', async ({ page }) => {
    // id 全部取 2e9 以上保留段：即便守卫失守，IN 查询也是 0 行、循环首枚 404——
    // 用 400+VALIDATION_ERROR 而非 404 区分「守卫生效」与「守卫失守」两种现实
    const ids = Array.from({ length: 10_001 }, (_, i) => 2_000_000_000 + i);
    const f = await apiCallExpectFail(page, 'POST', '/fixed-assets/batch-depreciate', {
      asset_ids: ids,
      calculation_date: '2023-07-15',
    });
    expect(f.status, '超 10000 枚必须 400（service:902-908）').toBe(400);
    expect(failureCode(f), '超限拒绝机器码').toBe(APP_ERROR_CODES.VALIDATION_ERROR);
  });

  test('515-11 不落库名实锁：历次试算后资产账簿与折旧记录纹丝不动', async ({ page }) => {
    const a = needAsset('assetA');
    // 前面腿已对 A 做过 6 月/封顶/同月/混合/多资产共多次试算；若端点偷偷写库，此处必漂移
    const readA = await apiCallRaw<Row>(page, 'GET', `/fixed-assets/${a.id}`);
    eqAmount(readA.accumulated_depreciation, cents('0'), 'A 试算后已计提仍为 0（不落库判据）');
    eqAmount(readA.net_value, cents('120000'), 'A 试算后净额仍为原值');
    expect(Number(readA.id), 'A 未被软删/改状态').toBe(a.id);
    expect(String(readA.status), 'A 状态仍 active').toBe('active');
    const records = await apiCallRaw<Row[]>(
      page,
      'GET',
      `/fixed-assets/${a.id}/depreciation-records`
    );
    if (!Array.isArray(records)) {
      throw new Error(
        `折旧记录出参必须是数组（handler:228-240 Vec<Model>），实际=${JSON.stringify(records).slice(0, 150)}`
      );
    }
    expect(records.length, '试算不得产生任何折旧记录').toBe(0);
  });

  test('515-12 清理腿：active 直接删被业务门拒 → dispose → delete → 404 点清', async ({ page }) => {
    const assets = [needAsset('assetA'), needAsset('assetB'), needAsset('assetC')];
    // 删除门实核（service:857-863）：非 INACTIVE/disposed 拒 business_displayable
    const fDel = await apiCallExpectFail(page, 'DELETE', `/fixed-assets/${assets[0].id}`);
    expect(fDel.status, 'active 资产删除必须 400').toBe(400);
    expect(failureCode(fDel), '删除门机器码 BUSINESS_ERROR').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    expect(
      String(fDel.message),
      'business_displayable 族必须外显删除门原因（service:860-862）'
    ).toContain('只能删除未使用或已处置状态的资产');

    for (const a of assets) {
      await apiCall(page, 'POST', `/fixed-assets/${a.id}/dispose`, {
        disposal_type: '变卖',
        disposal_value: 1,
        disposal_date: '2023-07-15',
        reason: 'E2E 515 清理',
      });
      await apiCall(page, 'DELETE', `/fixed-assets/${a.id}`);
      const gone = await apiCallExpectFail(page, 'GET', `/fixed-assets/${a.id}`);
      expect(gone.status, `资产 ${a.id} 清理后必须 404`).toBe(404);
    }
  });
});
