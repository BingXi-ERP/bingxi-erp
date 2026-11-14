import { test, expect, type Page } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  loginViaUI,
} from './helpers';
import { pickListArray } from './ui-helpers';

/**
 * 社保公积金缴纳记录全生命周期写面与读面 — 516。
 *
 * 覆盖面。社保公积金域（V15 P1 batch-08 缺陷 23 落地的域）端点在配对门棘轮基线里
 * 全部孤儿：POST/GET 列表与详情、按工人按期间查询、确认缴纳、撤销、打印共 11 条
 * 零 e2e 引用。既有 54 号只走 UI 弹窗建一单再标记已缴（无落库契约回读），51 号只
 * 做列表健康探针，均未钉住五险一金自动计算的数值契约与状态机门。本文件把该域
 * 写面与读面钉成写后必回读的判据。
 *
 * 调用面（整串路径含 /api/v1/erp 前缀；挂载链 routes/mod.rs nest /api/v1/erp
 * 加 routes/social_insurance.rs 的 /social-insurance）：
 *   POST /api/v1/erp/social-insurance
 *   GET /api/v1/erp/social-insurance
 *   GET /api/v1/erp/social-insurance/{id}
 *   GET /api/v1/erp/social-insurance/by-worker/{worker_id}?period_year=&period_month=
 *   POST /api/v1/erp/social-insurance/{id}/mark-paid
 *   POST /api/v1/erp/social-insurance/{id}/cancel
 * 链路前置端点（本文件自建数据用，同为真实调用面）：
 *   GET /api/v1/erp/auth/me（worker_id 取当前会话用户 id；表列仅 NOT NULL 无外键，
 *   与 69 号体检档案取当前用户做 worker 的既有先例同源）
 *
 * 契约真相（逐段读后端源，非推测）。
 * 请求体字段面在 backend/src/services/social_insurance_service.rs：
 * CreateSocialInsuranceRequest 必填 worker_id 与 period_year 与 period_month 与
 * base_amount（缴费基数，必须落在默认费率配置的合规区间 [4250, 31884]，低于下限或
 * 高于上限都在任何写库前拒绝），payment_date 与 remarks 可空；带 payment_date 建单
 * 直落词表 paid，不带则落 pending。MarkPaidRequest 必填 payment_date。
 * 五险一金由服务端纯函数 calculate_insurance 按默认费率自动计算（费率常数
 * InsuranceRateConfig::default）：养老单位 16% 个人 8%；医疗单位 8% 个人 2%；
 * 失业单位 0.5% 个人 0.5%；工伤单位 0.4% 个人不缴；生育单位 1% 个人不缴；
 * 公积金单位 12% 个人 12%；单位合计=五险单位+公积金单位，个人合计=养老个人+
 * 医疗个人+失业个人+公积金个人。DECIMAL 列按 rust_decimal 出参为十进制字符串，
 * 比较一律 Number(String(v)) 归一。
 * 状态机：pending 待缴，mark-paid 后 paid，cancel 后 cancelled；仅 pending 可确认
 * 缴纳与撤销（服务层逐字符比较词表小写）；同工人同期间已有 pending 或 paid 记录时
 * 再建单被拒（唯一在缴门）。期间合法性：年份 2000 到 2100，月份 1 到 12，越界
 * bad_request。
 * 出参是实体全列 social_insurance_record（backend/src/models/social_insurance_record.rs），
 * 建单人 created_by 唯一来源是服务端会话身份（handler 不收请求体身份字段）。
 * 详情与确认与撤销三处写读面都有行级归属门：登记人不在当前会话数据范围报 403
 * 无权访问；本文件全部自建自用同会话，不会撞门。
 * 列表出参是 PaginatedResponse{items,total,page,page_size}（handler 用
 * serde_json::to_value(PaginatedResponse) 序列化），按工人按期间查询无记录时
 * data 为 null（Option<Model> 序列化）不报错。
 *
 * 假绿防线。每步写后按主键或按工人按期间独立回读逐列比对，不判接口 200 即通过；
 * 负例钉 HTTP 400 加机器码族（基数越界 business 族、期间越界 bad_request 族、
 * 状态门 business 族）；数据用唯一期间与 remarks 后缀隔离，并发 worker 互不干扰；
 * 社保记录无删除端点，属域内事实，不伪造清理。
 */

type Row = Record<string, unknown>;

/** 社保域前缀：routes/mod.rs nest /api/v1/erp 加 routes/social_insurance.rs /social-insurance */
const SI = '/social-insurance';

const num = (v: unknown): number => Number(String(v));
const str = (v: unknown): string => String(v);

/**
 * 功能 判定时间列出参是真实时间字符串且可解析。
 * 调用方 本文件创建时间与更新时间两处的非空判定。
 * 入参 value 出参原始值。
 * 传给谁 结果直接进 expect(...).toBe(true)，判红消息由调用方给出。
 * 存什么 不存储。为什么不能只判长度：String(null) 得到字符串 null 同样非空，
 * 会把审计时间没落库读成落了值，故先判 typeof string 再判 Date.parse。
 * 存哪里 无。
 */
function isRealTimestamp(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

/**
 * 功能 生成当天 YYYY-MM-DD 日期串，作 payment_date 的缺省提交值。
 * 调用方 本文件 mark-paid 载荷。
 * 入参 无。
 * 传给谁 直接进 POST /social-insurance/{id}/mark-paid 请求体 payment_date 键。
 * 存什么 不存储，纯函数。
 * 存哪里 无。
 */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 功能 从会话取当前用户 id 作 worker_id（表列仅 NOT NULL 无外键，先例见 69 号体检档案）。
 * 调用方 本文件全部用例的建单载荷。
 * 入参 page 会话页；tag 用例编号，进断言消息前缀。
 * 传给谁 返回的 workerId 交建单与按工人查询两处。
 * 存什么 不存储。
 * 存哪里 无。
 */
async function currentWorkerId(page: Page, tag: string): Promise<number> {
  const me = await apiCallRaw<Row>(page, 'GET', '/auth/me');
  const workerId = Number(me.id);
  expect(
    Number.isFinite(workerId) && workerId > 0,
    `[${tag}] 会话未回用户 id（worker_id 取当前用户），实际 ${JSON.stringify(me)}`
  ).toBe(true);
  return workerId;
}

test.describe.serial('社保公积金缴纳记录写面：建单计算、确认缴纳、撤销与唯一在缴门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('516-01 建社保记录：五险一金按费率自动计算且全列逐列回读', async ({ page }) => {
    const stamp = String(Date.now()).slice(-6);
    const workerId = await currentWorkerId(page, '516-01');
    // 基数 5000 落在合规区间 [4250, 31884]（InsuranceRateConfig::default）
    const created = await apiCallRaw<Row>(page, 'POST', `${SI}`, {
      worker_id: workerId,
      period_year: 2031,
      period_month: 3,
      base_amount: '5000.00',
      remarks: `E2E社保${stamp}`,
    });
    const id = Number(created.id);
    expect(
      Number.isFinite(id),
      `[516-01] 建社保记录未回主键 id，实际 ${JSON.stringify(created)}`
    ).toBe(true);
    expect(Number(created.worker_id), '[516-01] worker_id 应落提交值（当前会话用户）').toBe(
      workerId
    );
    expect(Number(created.period_year), '[516-01] period_year 应落提交值 2031').toBe(2031);
    expect(Number(created.period_month), '[516-01] period_month 应落提交值 3').toBe(3);
    expect(num(created.base_amount), '[516-01] 缴费基数应落库 5000').toBe(5000);
    // 五险一金数值契约（social_insurance_service.rs calculate_insurance 纯函数，
    // 费率常数 InsuranceRateConfig::default，基数 5000 逐项乘费率）：
    expect(num(created.pension_employer), '[516-01] 养老单位应 5000 的 16% = 800').toBe(800);
    expect(num(created.pension_employee), '[516-01] 养老个人应 5000 的 8% = 400').toBe(400);
    expect(num(created.medical_employer), '[516-01] 医疗单位应 5000 的 8% = 400').toBe(400);
    expect(num(created.medical_employee), '[516-01] 医疗个人应 5000 的 2% = 100').toBe(100);
    expect(num(created.unemployment_employer), '[516-01] 失业单位应 5000 的 0.5% = 25').toBe(25);
    expect(num(created.unemployment_employee), '[516-01] 失业个人应 5000 的 0.5% = 25').toBe(25);
    expect(num(created.work_injury_employer), '[516-01] 工伤单位应 5000 的 0.4% = 20').toBe(20);
    expect(num(created.maternity_employer), '[516-01] 生育单位应 5000 的 1% = 50').toBe(50);
    expect(num(created.housing_fund_employer), '[516-01] 公积金单位应 5000 的 12% = 600').toBe(600);
    expect(num(created.housing_fund_employee), '[516-01] 公积金个人应 5000 的 12% = 600').toBe(600);
    // 合计列：单位 = 五险单位 + 公积金单位，个人 = 养老/医疗/失业/公积金个人之和
    expect(num(created.total_employer), '[516-01] 单位合计应 800+400+25+20+50+600 = 1895').toBe(
      1895
    );
    expect(num(created.total_employee), '[516-01] 个人合计应 400+100+25+600 = 1125').toBe(1125);
    // 无 payment_date 建单落词表 pending（service :201-205 条件）
    expect(
      created.status,
      `[516-01] 无缴纳日期建单应落词表 pending，实际 ${str(created.status)}`
    ).toBe('pending');
    expect(
      created.payment_date,
      `[516-01] 未确认缴纳时缴纳日期应为 NULL，实际 ${JSON.stringify(created.payment_date)}`
    ).toBeNull();
    expect(str(created.remarks), '[516-01] 备注应原样落库').toBe(`E2E社保${stamp}`);
    expect(
      created.created_by,
      `[516-01] 建单人应取服务端会话身份（handler 不收请求体身份），实际 ${JSON.stringify(created.created_by)}`
    ).not.toBeNull();
    expect(
      isRealTimestamp(created.created_at),
      `[516-01] 创建时间应落库为可解析时间串，实际 ${JSON.stringify(created.created_at)}`
    ).toBe(true);
  });

  test('516-02 详情与按工人按期间查询：自建行双路回读一致', async ({ page }) => {
    const stamp = String(Date.now()).slice(-6);
    const workerId = await currentWorkerId(page, '516-02');
    const created = await apiCallRaw<Row>(page, 'POST', `${SI}`, {
      worker_id: workerId,
      period_year: 2031,
      period_month: 4,
      base_amount: '6000.00',
      remarks: `E2E社保${stamp}`,
    });
    const id = Number(created.id);
    // 详情路
    const detail = await apiCallRaw<Row>(page, 'GET', `${SI}/${id}`);
    expect(
      Number(detail.id),
      `[516-02] 详情应回同一主键 ${id}，实际 ${JSON.stringify(detail.id)}`
    ).toBe(id);
    expect(num(detail.base_amount), '[516-02] 详情缴费基数应落库 6000').toBe(6000);
    expect(num(detail.total_employer), '[516-02] 详情单位合计应 6000 基数费率合计 2274').toBe(2274);
    expect(num(detail.total_employee), '[516-02] 详情个人合计应 6000 基数费率合计 1350').toBe(1350);
    expect(str(detail.remarks), '[516-02] 详情备注应与创建行一致').toBe(`E2E社保${stamp}`);
    // 按工人按期间路（worker_id + period_year + period_month 三键过滤）
    const byWorker = await apiCallRaw<Row>(
      page,
      'GET',
      `${SI}/by-worker/${workerId}?period_year=2031&period_month=4`
    );
    expect(
      Number(byWorker.id),
      `[516-02] 按工人按期间应命中本行，实际 ${JSON.stringify(byWorker)}`
    ).toBe(id);
    expect(num(byWorker.base_amount), '[516-02] 按工人路缴费基数应一致 6000').toBe(6000);
  });

  test('516-03 确认缴纳：pending 转 paid 且缴纳日期落提交值', async ({ page }) => {
    const stamp = String(Date.now()).slice(-6);
    const workerId = await currentWorkerId(page, '516-03');
    const created = await apiCallRaw<Row>(page, 'POST', `${SI}`, {
      worker_id: workerId,
      period_year: 2031,
      period_month: 5,
      base_amount: '4250.00',
      remarks: `E2E社保${stamp}`,
    });
    const id = Number(created.id);
    expect(created.status, `[516-03] 建单初值应为 pending，实际 ${str(created.status)}`).toBe(
      'pending'
    );
    const paidDate = today();
    const paid = await apiCallRaw<Row>(page, 'POST', `${SI}/${id}/mark-paid`, {
      payment_date: paidDate,
    });
    expect(paid.status, `[516-03] 确认缴纳后状态应为词表 paid，实际 ${str(paid.status)}`).toBe(
      'paid'
    );
    expect(str(paid.payment_date), '[516-03] 缴纳日期应落提交值').toBe(paidDate);
    // 独立详情回读
    const readBack = await apiCallRaw<Row>(page, 'GET', `${SI}/${id}`);
    expect(readBack.status, `[516-03] 详情回读状态应为 paid，实际 ${str(readBack.status)}`).toBe(
      'paid'
    );
    expect(str(readBack.payment_date), '[516-03] 详情回读缴纳日期应一致').toBe(paidDate);
  });

  test('516-04 撤销：pending 转 cancelled 且撤销后详情回读一致', async ({ page }) => {
    const stamp = String(Date.now()).slice(-6);
    const workerId = await currentWorkerId(page, '516-04');
    const created = await apiCallRaw<Row>(page, 'POST', `${SI}`, {
      worker_id: workerId,
      period_year: 2031,
      period_month: 6,
      base_amount: '10000.00',
      remarks: `E2E社保${stamp}`,
    });
    const id = Number(created.id);
    const cancelled = await apiCallRaw<Row>(page, 'POST', `${SI}/${id}/cancel`);
    expect(
      cancelled.status,
      `[516-04] 撤销后状态应为词表 cancelled，实际 ${str(cancelled.status)}`
    ).toBe('cancelled');
    const readBack = await apiCallRaw<Row>(page, 'GET', `${SI}/${id}`);
    expect(
      readBack.status,
      `[516-04] 详情回读状态应为 cancelled，实际 ${str(readBack.status)}`
    ).toBe('cancelled');
    expect(
      readBack.payment_date,
      `[516-04] 撤销不写缴纳日期，应为 NULL，实际 ${JSON.stringify(readBack.payment_date)}`
    ).toBeNull();
  });

  test('516-05 唯一在缴门：同工人同期间已有 pending 或 paid 记录再建被拒', async ({ page }) => {
    const stamp = String(Date.now()).slice(-6);
    const workerId = await currentWorkerId(page, '516-05');
    await apiCallRaw<Row>(page, 'POST', `${SI}`, {
      worker_id: workerId,
      period_year: 2031,
      period_month: 7,
      base_amount: '5000.00',
      remarks: `E2E社保${stamp}`,
    });
    // pending 在缴记录挡住第二笔同期间建单（service :162-178 is_in pending/paid 门）
    const dupPending = await apiCallExpectFail(page, 'POST', `${SI}`, {
      worker_id: workerId,
      period_year: 2031,
      period_month: 7,
      base_amount: '5000.00',
      remarks: `E2E社保重复${stamp}`,
    });
    expect(
      dupPending.status,
      `[516-05] 同工人同期间重复建单应被业务门拒为 400，实际 ${dupPending.status}`
    ).toBe(400);
    expect(
      failureCode(dupPending),
      `[516-05] 重复建单机器码应为 BUSINESS_ERROR（AppError::business），实际 ${JSON.stringify(failureCode(dupPending))}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    // paid 后同样挡（撤掉第一笔的门不成立：mark-paid 后仍 is_in 集合）
    const second = await apiCallRaw<Row>(page, 'POST', `${SI}`, {
      worker_id: workerId,
      period_year: 2031,
      period_month: 8,
      base_amount: '5000.00',
      remarks: `E2E社保${stamp}-8月`,
    });
    const secondId = Number(second.id);
    await apiCallRaw(page, 'POST', `${SI}/${secondId}/mark-paid`, { payment_date: today() });
    const dupPaid = await apiCallExpectFail(page, 'POST', `${SI}`, {
      worker_id: workerId,
      period_year: 2031,
      period_month: 8,
      base_amount: '5000.00',
      remarks: `E2E社保已缴重复${stamp}`,
    });
    expect(
      dupPaid.status,
      `[516-05] 同期间已有 paid 记录再建也应被拒 400，实际 ${dupPaid.status}`
    ).toBe(400);
    expect(
      failureCode(dupPaid),
      `[516-05] paid 挡门机器码应为 BUSINESS_ERROR，实际 ${JSON.stringify(failureCode(dupPaid))}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    // cancelled 不挡：撤销后同期间可再建（is_in 只含 pending/paid）
    const blocked = await apiCallRaw<Row>(page, 'POST', `${SI}`, {
      worker_id: workerId,
      period_year: 2031,
      period_month: 9,
      base_amount: '5000.00',
      remarks: `E2E社保${stamp}-9月`,
    });
    const blockedId = Number(blocked.id);
    await apiCallRaw(page, 'POST', `${SI}/${blockedId}/cancel`);
    const reCreated = await apiCallRaw<Row>(page, 'POST', `${SI}`, {
      worker_id: workerId,
      period_year: 2031,
      period_month: 9,
      base_amount: '5000.00',
      remarks: `E2E社保撤销后重建${stamp}`,
    });
    expect(
      Number.isFinite(Number(reCreated.id)),
      `[516-05] cancelled 后同期间重建应放行（is_in 门只含 pending/paid），实际 ${JSON.stringify(reCreated)}`
    ).toBe(true);
    expect(
      str(reCreated.status),
      `[516-05] 重建行应为新 pending 记录，实际 ${str(reCreated.status)}`
    ).toBe('pending');
  });

  test('516-06 基数越界门：低于下限与高于上限都在写库前拒绝', async ({ page }) => {
    const stamp = String(Date.now()).slice(-6);
    const workerId = await currentWorkerId(page, '516-06');
    // 低于下限 4250（service :151 非正与 :156-159 区间校验）
    const belowMin = await apiCallExpectFail(page, 'POST', `${SI}`, {
      worker_id: workerId,
      period_year: 2031,
      period_month: 10,
      base_amount: '4249.99',
      remarks: `E2E社保低${stamp}`,
    });
    expect(
      belowMin.status,
      `[516-06] 基数低于下限应被业务门拒为 400，实际 ${belowMin.status}`
    ).toBe(400);
    expect(
      failureCode(belowMin),
      `[516-06] 基数下限机器码应为 BUSINESS_ERROR（AppError::business），实际 ${JSON.stringify(failureCode(belowMin))}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    // 高于上限 31884
    const aboveMax = await apiCallExpectFail(page, 'POST', `${SI}`, {
      worker_id: workerId,
      period_year: 2031,
      period_month: 10,
      base_amount: '31884.01',
      remarks: `E2E社保高${stamp}`,
    });
    expect(
      aboveMax.status,
      `[516-06] 基数高于上限应被业务门拒为 400，实际 ${aboveMax.status}`
    ).toBe(400);
    expect(
      failureCode(aboveMax),
      `[516-06] 基数上限机器码应为 BUSINESS_ERROR，实际 ${JSON.stringify(failureCode(aboveMax))}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    // 边界值本身合法：恰 4250 可建
    const atMin = await apiCallRaw<Row>(page, 'POST', `${SI}`, {
      worker_id: workerId,
      period_year: 2031,
      period_month: 10,
      base_amount: '4250.00',
      remarks: `E2E社保边界${stamp}`,
    });
    expect(
      Number.isFinite(Number(atMin.id)),
      `[516-06] 基数恰为下限 4250 应放行，实际 ${JSON.stringify(atMin)}`
    ).toBe(true);
    expect(num(atMin.base_amount), '[516-06] 边界行基数应落库 4250').toBe(4250);
  });

  test('516-07 期间越界门：月份出 1-12 与年份出 2000-2100 都拒为 400', async ({ page }) => {
    const stamp = String(Date.now()).slice(-6);
    const workerId = await currentWorkerId(page, '516-07');
    // 月份 13（service validate_period :419-427 bad_request 族）
    const badMonth = await apiCallExpectFail(page, 'POST', `${SI}`, {
      worker_id: workerId,
      period_year: 2031,
      period_month: 13,
      base_amount: '5000.00',
      remarks: `E2E社保月${stamp}`,
    });
    expect(badMonth.status, `[516-07] 月份 13 应被拒为 400，实际 ${badMonth.status}`).toBe(400);
    expect(
      failureCode(badMonth),
      `[516-07] 月份越界机器码应为 BAD_REQUEST（AppError::bad_request），实际 ${JSON.stringify(failureCode(badMonth))}`
    ).toBe(APP_ERROR_CODES.BAD_REQUEST);
    // 年份 1999
    const badYear = await apiCallExpectFail(page, 'POST', `${SI}`, {
      worker_id: workerId,
      period_year: 1999,
      period_month: 3,
      base_amount: '5000.00',
      remarks: `E2E社保年${stamp}`,
    });
    expect(badYear.status, `[516-07] 年份 1999 应被拒为 400，实际 ${badYear.status}`).toBe(400);
    expect(
      failureCode(badYear),
      `[516-07] 年份越界机器码应为 BAD_REQUEST，实际 ${JSON.stringify(failureCode(badYear))}`
    ).toBe(APP_ERROR_CODES.BAD_REQUEST);
  });

  test('516-08 状态门与悬空读面：paid 不可再确认再撤销，悬空 id 详情 404', async ({ page }) => {
    const stamp = String(Date.now()).slice(-6);
    const workerId = await currentWorkerId(page, '516-08');
    const created = await apiCallRaw<Row>(page, 'POST', `${SI}`, {
      worker_id: workerId,
      period_year: 2031,
      period_month: 11,
      base_amount: '31884.00',
      remarks: `E2E社保${stamp}`,
    });
    const id = Number(created.id);
    await apiCallRaw(page, 'POST', `${SI}/${id}/mark-paid`, { payment_date: today() });
    // paid 后再确认（service mark_paid :299 仅 pending 门）
    const rePaid = await apiCallExpectFail(page, 'POST', `${SI}/${id}/mark-paid`, {
      payment_date: today(),
    });
    expect(rePaid.status, `[516-08] paid 后再确认应被状态门拒为 400，实际 ${rePaid.status}`).toBe(
      400
    );
    expect(
      failureCode(rePaid),
      `[516-08] 再确认机器码应为 BUSINESS_ERROR（AppError::business），实际 ${JSON.stringify(failureCode(rePaid))}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    // paid 后再撤销（service cancel :317 仅 pending 门）
    const reCancel = await apiCallExpectFail(page, 'POST', `${SI}/${id}/cancel`);
    expect(
      reCancel.status,
      `[516-08] paid 后再撤销应被状态门拒为 400，实际 ${reCancel.status}`
    ).toBe(400);
    expect(
      failureCode(reCancel),
      `[516-08] 再撤销机器码应为 BUSINESS_ERROR，实际 ${JSON.stringify(failureCode(reCancel))}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    // 悬空 id 详情（service get_by_id not_found）
    const missing = await apiCallExpectFail(page, 'GET', `${SI}/99999999`);
    expect(
      missing.status,
      `[516-08] 悬空社保详情应恰为 HTTP 404（AppError::not_found），实际 ${missing.status}`
    ).toBe(404);
    expect(
      failureCode(missing),
      `[516-08] 悬空详情机器码应为 NOT_FOUND，实际 ${JSON.stringify(failureCode(missing))}`
    ).toBe(APP_ERROR_CODES.NOT_FOUND);
  });

  test('516-09 列表读面：分页信封四键与自建行按期间过滤命中', async ({ page }) => {
    const stamp = String(Date.now()).slice(-6);
    const workerId = await currentWorkerId(page, '516-09');
    const created = await apiCallRaw<Row>(page, 'POST', `${SI}`, {
      worker_id: workerId,
      period_year: 2032,
      period_month: 1,
      base_amount: '5000.00',
      remarks: `E2E社保${stamp}`,
    });
    const id = Number(created.id);
    const data = await apiCallRaw<Row>(
      page,
      'GET',
      `${SI}?worker_id=${workerId}&period_year=2032&period_month=1&page=1&page_size=20`
    );
    expect(
      Array.isArray(data.items),
      `[516-09] 列表 items 应为数组（PaginatedResponse 信封），实际 ${JSON.stringify(Object.keys(data))}`
    ).toBe(true);
    expect(typeof data.total, `[516-09] total 应为 number，实际 ${typeof data.total}`).toBe(
      'number'
    );
    expect(data.page, `[516-09] page 应回显 1，实际 ${JSON.stringify(data.page)}`).toBe(1);
    expect(
      data.page_size,
      `[516-09] page_size 应回显 20，实际 ${JSON.stringify(data.page_size)}`
    ).toBe(20);
    const rows = pickListArray<Row>(
      data,
      'items',
      `[516-09] 社保列表 worker_id=${workerId} 期间 2032-1`
    );
    expect(
      rows.length,
      `[516-09] 三键过滤应至少命中本行，实际 ${rows.length}`
    ).toBeGreaterThanOrEqual(1);
    const mine = rows.find(r => Number(r.id) === id);
    if (!mine)
      throw new Error(
        `[516-09] 本行 ${id} 应在过滤结果内，实际主键集 ${JSON.stringify(rows.map(r => Number(r.id)))}`
      );
    expect(mine.status, `[516-09] 过滤行状态应为 pending，实际 ${str(mine.status)}`).toBe(
      'pending'
    );
  });
});
