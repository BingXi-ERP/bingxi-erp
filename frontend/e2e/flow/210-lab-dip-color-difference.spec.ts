import { test, expect, type Locator, type Page } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  BASE_URL,
  ensureTestEntities,
  expectStateGateRejection,
  failureCode,
  getCtx,
  loginViaUI,
  tryCleanup,
} from './helpers';
import { pickListArray } from './ui-helpers';
import { columnIndex, rowByText, rowCellText, waitFirstRow } from './table-column';

/**
 * 化验室打样与缸差（色差）登记回读。
 *
 * 覆盖面。面料专项的缸差判定全部落在化验室打样链上：打样通知单 → 多版小样（ABCD）→
 * 对色登记（色差等级 + ΔE 色差值）→ 客户确认 OK 样 → 复样（大货前用车间半制品布验证）→
 * 染色技术卡。既有 e2e 对该链零命中（frontend/e2e 全库检索「缸差」零命中），而前端页面
 * 只接通了通知单一段（frontend/src/api/lab-dip.ts 无 samples / matching / resamples 任何
 * 请求函数，色差两列在 frontend/src 全库零消费面），所以色差判定线目前只有后端在算、
 * 无人回读。本 spec 把这条链钉成写后必回读的判据。
 *
 * 契约真相（逐段读后端源，非推测）。
 * 路由装配在 backend/src/routes/production.rs 的 lab_dip()，挂载前缀
 * /api/v1/erp/production/lab-dip（同文件 routes() merge、routes/mod.rs nest）。
 * 请求体字段面在 backend/src/services/lab_dip_ops/types.rs：建通知单必填 light_source
 * 与 required_date（其余可缺席），小样必填 request_id，对色必填 color_difference_grade
 * 且 color_difference_value 可空，复样必填 request_id 与 source_sample_id，
 * 技术卡端点无请求体（handler 不绑定 Json 提取器，lab_dip_handler.rs）。
 * 出参是实体全列（lab_dip_request / lab_dip_sample / lab_dip_resample Model），
 * DECIMAL 列按 rust_decimal 默认为十进制字符串出参，比较一律 Number(String(v)) 归一。
 *
 * 判定线与状态机（唯一来源，不照字面猜大写）。
 * 通知单状态机 pending→sampling→submitted→approved|rejected→completed，
 * rejected→sampling 重打，completed 终态（lab_dip_service.rs-75）；取值小写，
 * 白名单来自 backend/src/models/status/quality_dyeing.rs 的 lab_dip_request 模块
 * （lab_dip_* 三张表在 migration/src/domain/v15/mod.rs-3077 建表时未施加状态 CHECK，
 * 故本 spec 的状态判据以该词表常量的字面值为准，不另发明取值）。
 * 小样对色结果 pending / matched / not_matched / selected 同源（同文件 lab_dip_sample）。
 * 色差判定线 COLOR_DIFF_OK_GRADE = 4（lab_dip_service.rs）：等级 ≥4 判 matched、
 * <4 判 not_matched；复样同线判 passed / failed（resample.rs-223）。
 * 等级取值域 1-5，越界在任何 DB 访问前拒绝（sample.rs、resample.rs）。
 * 写入门：小样必须挂在 sampling 状态的通知单下（sample.rs），版数受通知单
 * sample_versions 上限约束且同单版本标识唯一（sample.rs-120）；
 * 对色结果非 pending 不可更新也不可删除（sample.rs、:318）；
 * 送客户确认前至少 1 个小样（request.rs）；复样需通知单 approved 且源样 selected
 * 且车间半制品布批号必填（resample.rs、:127、:137）；复样结果非 pending 不可重复记录、
 * 技术卡仅 passed 可开且不可重复开（resample.rs、:326、:334）。
 *
 * 假绿防线。每步写后按主键或按单号过滤独立回读逐列比对，不判「接口 200」即通过；
 * 负例钉 HTTP 400 + 状态门机器族（expectStateGateRejection，403/404/5xx 都不算门生效）
 * 并在拒绝后回读原值确认零写入；单号前缀按服务端生成器口径断（LD / RS 前缀常量
 * lab_dip_service.rs、:128）；建单人审核人复核人开卡人三列都断非空，
 * 因为它们的唯一来源是会话身份（handler 不接收请求体身份字段）。
 * 造数用唯一色号与色名后缀，并发 worker 互不干扰。
 */

type Row = Record<string, unknown>;

/** 面料打样域前缀：routes/mod.rs nest /api/v1/erp/production + routes/production.rs /lab-dip */
const LIP = '/production/lab-dip';

/** 色差判定线的权威值（lab_dip_service.rs COLOR_DIFF_OK_GRADE），只用于文案，判据按行为断 */
const COLOR_DIFF_OK_GRADE_TEXT = '4 级';

const num = (v: unknown): number => Number(String(v));
const str = (v: unknown): string => String(v);

/**
 * 功能 两个十进制出参按数值等值判定，容差 1e-9。
 * 调用方 本文件成本合计一类的加和断言。
 * 入参 actual 与 expected 均为待比数的原始出参（rust_decimal 字符串或数字）。
 * 传给谁 结果直接进 expect(...).toBe(true)，判红消息由调用方给出。
 * 存什么 不存储。容差取 1e-9，远小于本域任何一列的最小线值 0.0001（DECIMAL(10,4)），
 * 只吸收 JS 双精度加法的表示误差，不放宽业务精度；单值比较仍用 num() 直接等值。
 * 存哪里 无。
 */
function decimalEq(actual: unknown, expected: unknown): boolean {
  const a = num(actual);
  const b = num(expected);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;
}

/**
 * 功能 判定时间列出参是真实时间字符串且可解析。
 * 调用方 本文件对色时间、客户确认时间、开卡时间三处的非空判定。
 * 入参 value 出参原始值。
 * 传给谁 结果直接进 expect(...).toBe(true)，判红消息由调用方给出。
 * 存什么 不存储。为什么不能只判长度：String(null) 得到 "null" 同样非空，
 * 会把「审计时间没落库」读成「落了值」，故先判 typeof string 再判 Date.parse。
 * 存哪里 无。
 */
function isRealTimestamp(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

/**
 * 功能 生成 N 天后的 YYYY-MM-DD 日期串，作打样通知单必填的 required_date。
 * 调用方 本文件三枚用例的建单载荷。
 * 入参 daysFromNow 距今天数（正整数）。
 * 传给谁 直接进 POST /lab-dip/requests 请求体 required_date 键，由后端
 * services/lab_dip_ops/request.rs 与当天比较（早于今天即拒）。
 * 存什么 不存储，纯函数。
 * 存哪里 无。
 */
function dateInDays(daysFromNow: number): string {
  const d = new Date(Date.now() + daysFromNow * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/**
 * 功能 进入打样通知管理页并返回主表 Locator，供列头实时求下标、逐格读值。
 * 调用方 本文件断言通知单状态列渲染真值的各步骤。
 * 入参 page 当前 Playwright Page。
 * 传给谁 返回的 Locator 交 table-column 原语（columnIndex / rowByText / rowCellText）消费。
 * 存什么 不存储。该页 el-table 未挂 aria-label（views/lab-dip/index.vue:27），
 * 共享原语 openPageTable 以 aria-label 锚定不可用，故本文件本地按页面 h2 标题锚定后
 * 取第一个 el-table（对话框未开时页面上唯一主表），不改共享夹具。
 * 存哪里 无。
 */
async function openLabDipTable(page: Page): Promise<Locator> {
  await page.goto(`${BASE_URL}/lab-dip`);
  await expect(
    page.getByRole('heading', { level: 2, name: '打样通知管理' }),
    `未渲染打样通知页标题，实际落点 ${page.url()}`
  ).toBeVisible({ timeout: 30_000 });
  const table = page.locator('.el-table').first();
  await table.waitFor({ state: 'visible', timeout: 30_000 });
  await waitFirstRow(table);
  return table;
}

/**
 * 功能 读通知单列表页某单号行的状态列文本（词表渲染后的中文标签）。
 * 调用方 本文件每步状态流转后的 UI 回读。
 * 入参 page 当前页；requestNo 服务端生成的通知单号。
 * 传给谁 文本回调用例断言，与后端 status 原值逐字比对词表渲染值
 * （views/lab-dip/index.vue:258-265 statusTextMap 取 locales/zh-CN.ts labDip.index.status*）。
 * 存什么 不存储。
 * 存哪里 无。
 */
async function readRequestStatusCodeCell(page: Page, requestNo: string): Promise<string> {
  const table = await openLabDipTable(page);
  const statusIdx = await columnIndex(table, '状态');
  const row = await rowByText(table, requestNo);
  return rowCellText(row, statusIdx);
}

/**
 * 功能 按小样主键回读单行，并断言回读成功。
 * 调用方 本文件对色登记与三态更新后的逐列比对。
 * 入参 page 会话页；id 小样主键。
 * 传给谁 返回行交调用方逐列断言。读的是 GET /lab-dip/samples/{id}
 * （handlers/lab_dip_handler.rs）。
 * 存什么 不存储。
 * 存哪里 无。
 */
async function readSample(page: Page, id: number): Promise<Row> {
  const row = await apiCallRaw<Row>(page, 'GET', `${LIP}/samples/${id}`);
  expect(Number.isFinite(Number(row.id)), `小样回读应带主键 id，实际 ${JSON.stringify(row)}`).toBe(
    true
  );
  return row;
}

/**
 * 功能 按通知单主键回读单行，并断言回读成功。
 * 调用方 本文件建单与每步状态流转后的逐列比对。
 * 入参 page 会话页；id 通知单主键。
 * 传给谁 返回行交调用方逐列断言。读的是 GET /lab-dip/requests/{id}
 * （handlers/lab_dip_handler.rs）。
 * 存什么 不存储。
 * 存哪里 无。
 */
async function readRequest(page: Page, id: number): Promise<Row> {
  const row = await apiCallRaw<Row>(page, 'GET', `${LIP}/requests/${id}`);
  expect(
    Number.isFinite(Number(row.id)),
    `打样通知单回读应带主键 id，实际 ${JSON.stringify(row)}`
  ).toBe(true);
  return row;
}

/**
 * 功能 按通知单读全部小样（裸数组出参），并断言形状。
 * 调用方 本文件版数上限与逐列回读。
 * 入参 page 会话页；requestId 通知单主键。
 * 传给谁 返回数组交调用方按下标与 version_seq 升序断言
 * （GET /lab-dip/samples/by-request/{request_id}，services/lab_dip_ops/sample.rs 按 version_seq 升序）。
 * 存什么 不存储。
 * 存哪里 无。
 */
async function readSamples(page: Page, requestId: number): Promise<Row[]> {
  const data = await apiCallRaw<unknown>(page, 'GET', `${LIP}/samples/by-request/${requestId}`);
  return pickListArray<Row>(data, 'bare', `通知单 ${requestId} 的小样列表`);
}

/**
 * 功能 按通知单读全部复样记录（裸数组出参）。
 * 调用方 本文件复样门拒绝后的零写入回读与两笔复样的合计回读。
 * 入参 page 会话页；requestId 通知单主键。
 * 传给谁 返回数组交调用方断言行数与逐列取值
 * （GET /lab-dip/resamples/by-request/{request_id}，services/lab_dip_ops/resample.rs）。
 * 存什么 不存储。
 * 存哪里 无。
 */
async function readResamples(page: Page, requestId: number): Promise<Row[]> {
  const data = await apiCallRaw<unknown>(page, 'GET', `${LIP}/resamples/by-request/${requestId}`);
  return pickListArray<Row>(data, 'bare', `通知单 ${requestId} 的复样列表`);
}

test.describe.serial('化验室打样缸差登记：多版对色与复样开卡全链逐列回读', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('打样通知到 OK 样确认：色差 4 级判定线、版数上限、逐列与列表页状态回读', async ({
    page,
  }) => {
    const stamp = String(Date.now()).slice(-6);
    const ctx = getCtx();
    const requiredDate = dateInDays(7);
    const customerColorNo = `E2E-CD-${stamp}`;

    const created = await apiCallRaw<Row>(page, 'POST', `${LIP}/requests`, {
      customer_id: ctx.customerId,
      customer_color_no: customerColorNo,
      customer_color_name: `缸差回归色${stamp}`,
      sample_type: 'lab_dip',
      fabric_spec: '40S*40S 13372',
      fabric_component: '100%棉',
      sample_size: '25*25',
      light_source: 'D65',
      secondary_light_source: 'TL84',
      color_fastness_req: '4 级',
      eco_requirement: 'OEKO-TEX 100',
      sample_versions: 2,
      dye_category: 'reactive',
      required_date: requiredDate,
      expected_days: 5,
      remarks: `E2E缸差${stamp}`,
    });
    const requestId = Number(created.id);
    expect(Number.isFinite(requestId), `建单未回主键 id：${JSON.stringify(created)}`).toBe(true);

    // 建单逐列回读：状态初值、版数、光源、交期、会话建单人
    expect(created.status, '通知单初值应为词表 pending').toBe('pending');
    expect(
      str(created.request_no).startsWith('LD'),
      `通知单号应由服务端生成器出 LD 前缀（lab_dip_service.rs），实际 ${created.request_no}`
    ).toBe(true);
    expect(Number(created.sample_versions), '版数应落建单提交值 2').toBe(2);
    expect(created.light_source, '主光源应落提交值 D65').toBe('D65');
    expect(str(created.required_date), '要求交期应落提交日期').toBe(requiredDate);
    expect(
      created.created_by,
      `建单人应取会话身份（handler 不收请求体身份，lab_dip_handler.rs），实际 ${JSON.stringify(created.created_by)}`
    ).not.toBeNull();
    expect(
      created.approved_sample_id,
      `未确认前 approved_sample_id 必须为 NULL，实际 ${JSON.stringify(created.approved_sample_id)}`
    ).toBeNull();

    // 列表页逐格回读：状态列渲染词表标签「待打样」
    expect(
      await readRequestStatusCodeCell(page, str(created.request_no)),
      '列表页状态列未按 pending 渲染词表标签'
    ).toBe('待打样');

    // pending → sampling
    const sampling = await apiCallRaw<Row>(
      page,
      'POST',
      `${LIP}/requests/${requestId}/start-sampling`
    );
    expect(sampling.status, '开始打样后状态应为词表 sampling').toBe('sampling');
    const samplingReadBack = await readRequest(page, requestId);
    expect(samplingReadBack.status, '开始打样回读状态漂移').toBe('sampling');
    expect(
      await readRequestStatusCodeCell(page, str(created.request_no)),
      '列表页状态列未随 sampling 更新为词表标签'
    ).toBe('打样中');

    // 空小样直接送客户：至少 1 个小样的业务门
    const submitTooEarly = await apiCallExpectFail(
      page,
      'POST',
      `${LIP}/requests/${requestId}/submit`
    );
    expectStateGateRejection(submitTooEarly, '送客户确认前应强制至少 1 个小样');

    // 两版小样（A/B），带工艺参数与初测色差
    const sampleBase = {
      request_id: requestId,
      formula: '活性三原配色',
      formula_detail: [
        { dye_name: '活性红 195', amount: '1.25', unit: '%(o.w.f)', percentage: '1.25' },
        { dye_name: '活性黄 145', amount: '0.80', unit: '%(o.w.f)', percentage: '0.80' },
      ],
      temperature: '60.00',
      time_minutes: 45,
      liquor_ratio: '1:5',
      ph_value: '6.50',
      dyeing_method: 'dip',
      dye_cost: '12.3456',
      auxiliary_cost: '1.0555',
      total_cost: '13.4011',
    };
    const sampleA = await apiCallRaw<Row>(page, 'POST', `${LIP}/samples`, {
      ...sampleBase,
      recipe_no: `E2E-FRM-A-${stamp}`,
      color_difference_grade: 3,
      color_difference_value: '4.20',
      remarks: `E2E缸差A${stamp}`,
    });
    const sampleB = await apiCallRaw<Row>(page, 'POST', `${LIP}/samples`, {
      ...sampleBase,
      recipe_no: `E2E-FRM-B-${stamp}`,
      color_difference_grade: 4,
      color_difference_value: '2.60',
      remarks: `E2E缸差B${stamp}`,
    });
    const idA = Number(sampleA.id);
    const idB = Number(sampleB.id);
    expect(
      Number.isFinite(idA) && Number.isFinite(idB) && idA !== idB,
      `两版小样应各自回主键，实际 A=${JSON.stringify(sampleA.id)} B=${JSON.stringify(sampleB.id)}`
    ).toBe(true);

    // 版数上限：通知单只允许 2 版，第 3 版必须整单拒绝
    const overLimit = await apiCallExpectFail(page, 'POST', `${LIP}/samples`, {
      ...sampleBase,
      request_id: requestId,
      remarks: `E2E缸差C${stamp}`,
    });
    expectStateGateRejection(overLimit, '小样版数已达通知单上限 2 时应拒绝第 3 版');

    const samples = await readSamples(page, requestId);
    expect(samples.length, `上限拒绝后小样数必须仍为 2，实际 ${samples.length}`).toBe(2);
    // 版本标识与序号由服务端按版序自动生成（label_from_seq：1→A、2→B）
    expect(samples[0].version_label, '首版标识应为 A').toBe('A');
    expect(Number(samples[0].version_seq), '首版序号应为 1').toBe(1);
    expect(samples[1].version_label, '次版标识应为 B').toBe('B');
    expect(Number(samples[1].version_seq), '次版序号应为 2').toBe(2);
    for (const s of samples) {
      expect(s.matching_result, `新建小样对色结果应为词表 pending，实际 ${s.matching_result}`).toBe(
        'pending'
      );
      expect(s.resample_status, `新建小样复样状态应为 none，实际 ${s.resample_status}`).toBe(
        'none'
      );
      expect(num(s.temperature), '染色温度应回落库值 60').toBe(60);
      expect(num(s.ph_value), 'pH 应回落库值 6.5').toBe(6.5);
      expect(s.liquor_ratio, '浴比应回落库值 1:5').toBe('1:5');
      expect(
        decimalEq(s.total_cost, num(s.dye_cost) + num(s.auxiliary_cost)),
        `总成本应等于染料加助剂成本，实际 总=${JSON.stringify(s.total_cost)} 染料=${JSON.stringify(s.dye_cost)} 助剂=${JSON.stringify(s.auxiliary_cost)}`
      ).toBe(true);
      const detail = s.formula_detail as unknown[];
      expect(
        Array.isArray(detail) && detail.length === 2,
        `处方明细 JSON 应原样落两行，实际 ${JSON.stringify(s.formula_detail)}`
      ).toBe(true);
    }

    // 对色判定线：3 级 → not_matched，4 级 → matched（色差 ≥4 为 OK）
    const matchedA = await apiCallRaw<Row>(page, 'POST', `${LIP}/samples/${idA}/matching`, {
      color_difference_grade: 3,
      color_difference_value: '4.20',
      approval_comment: `色差不足${COLOR_DIFF_OK_GRADE_TEXT}需重打`,
    });
    expect(matchedA.matching_result, '色差 3 级应判 not_matched（低于判定线）').toBe('not_matched');
    const readA = await readSample(page, idA);
    expect(Number(readA.color_difference_grade), '对色等级应落库 3').toBe(3);
    expect(num(readA.color_difference_value), 'ΔE 色差值应落库 4.20').toBe(4.2);
    expect(
      readA.approved_by,
      `对色审核人应取会话身份而非请求体，实际 ${JSON.stringify(readA.approved_by)}`
    ).not.toBeNull();
    expect(
      isRealTimestamp(readA.approved_at),
      `对色时间应落库，实际 ${JSON.stringify(readA.approved_at)}`
    ).toBe(true);
    expect(str(readA.approval_comment), '对色意见应原样落库').toBe(
      `色差不足${COLOR_DIFF_OK_GRADE_TEXT}需重打`
    );

    const matchedB = await apiCallRaw<Row>(page, 'POST', `${LIP}/samples/${idB}/matching`, {
      color_difference_grade: 4,
      color_difference_value: '2.60',
      approval_comment: '达 4 级可送客户',
    });
    expect(matchedB.matching_result, '色差 4 级应判 matched（判定线上）').toBe('matched');
    expect(num((await readSample(page, idB)).color_difference_value), 'B 版 ΔE 应落库 2.60').toBe(
      2.6
    );

    // 同一版重复对色必须被拒（对色结果非 pending）
    const rematch = await apiCallExpectFail(page, 'POST', `${LIP}/samples/${idB}/matching`, {
      color_difference_grade: 5,
      color_difference_value: '0.50',
    });
    expectStateGateRejection(rematch, '对色结果已记录后不可重复记录');
    expect(
      num((await readSample(page, idB)).color_difference_value),
      '重复对色被拒后 ΔE 不得被改写'
    ).toBe(2.6);

    // 已对色小样不可删除（仅 pending 可删）
    const deleteMatched = await apiCallExpectFail(page, 'DELETE', `${LIP}/samples/${idA}`);
    expectStateGateRejection(deleteMatched, '非 pending 对色结果不可删除小样');

    // sampling → submitted（此时已有 2 个小样）
    const submitted = await apiCallRaw<Row>(page, 'POST', `${LIP}/requests/${requestId}/submit`);
    expect(submitted.status, '送客户确认后状态应为词表 submitted').toBe('submitted');
    expect(
      await readRequestStatusCodeCell(page, str(created.request_no)),
      '列表页状态列未随 submitted 渲染'
    ).toBe('已送客户');

    // submitted → approved：客户从两版中选中 4 级那版为 OK 样
    const approved = await apiCallRaw<Row>(page, 'POST', `${LIP}/requests/${requestId}/approve`, {
      sample_id: idB,
      comment: `确认 B 版为 OK 样${stamp}`,
    });
    expect(approved.status, '客户确认后状态应为词表 approved').toBe('approved');
    const approvedReadBack = await readRequest(page, requestId);
    expect(Number(approvedReadBack.approved_sample_id), 'OK 样主键应落库为被选中版本').toBe(idB);
    expect(str(approvedReadBack.customer_approval_comment), '客户确认意见应原样落库').toBe(
      `确认 B 版为 OK 样${stamp}`
    );
    // 取值断言而非布尔断言：布尔与空串比（expect(x.length>0).not.toBe('')）恒成立，
    // 时间列为 null 时也放行，属假绿面，改为直接比字符串本体。
    expect(
      str(approvedReadBack.customer_approved_at),
      `客户确认时间应落库为非空时间串，实际=${JSON.stringify(approvedReadBack.customer_approved_at)}`
    ).not.toBe('');

    // 选中样升 selected，未选中样保持 not_matched（同单两版各自终值）
    expect((await readSample(page, idB)).matching_result, 'OK 样应转词表 selected').toBe(
      'selected'
    );
    expect(
      (await readSample(page, idA)).matching_result,
      '未选中样应维持 not_matched，不被连带改写'
    ).toBe('not_matched');

    // 列表端点按单号过滤回读：同筛选同口径
    const list = await apiCallRaw<{ items?: Row[]; total?: number }>(
      page,
      'GET',
      `${LIP}/requests?request_no=${encodeURIComponent(str(created.request_no))}&page=1&page_size=10`
    );
    const listRow = (list.items ?? []).find(r => Number(r.id) === requestId);
    // 未命中与命错态都在同一枚值断言里点名：取值式里把"没这行"落成可读哨兵，
    // 不再用布尔断言先行放行（布尔放行会让下一行的 listRow! 变成不可诊断的空引用）。
    expect(
      listRow
        ? String(listRow.status ?? '')
        : `<列表未命中 id=${requestId}：items=${JSON.stringify(list.items)?.slice(0, 200)}>`,
      '列表按单号过滤应命中本单，且行内 status 与详情口同为 approved'
    ).toBe('approved');
    expect(
      await readRequestStatusCodeCell(page, str(created.request_no)),
      '列表页状态列未随 approved 渲染词表标签'
    ).toBe('客户确认');

    // 复样尚未发生：按单读复样必须空集（不被历史脏数据污染）
    expect((await readResamples(page, requestId)).length, '未建复样时按单读复样应为空集').toBe(0);

    // approved 单不可再开始打样（终态方向只允许 completed）
    const illegalRestart = await apiCallExpectFail(
      page,
      'POST',
      `${LIP}/requests/${requestId}/start-sampling`
    );
    expectStateGateRejection(illegalRestart, 'approved 状态不可回到 sampling');

    // 清理：状态门只放行 pending 删除，本单已 approved，删除必被拒；
    // 如实发起并让失败可见（不静默当通过），拒绝原因本身也是本用例的判据之一
    const deleteApproved = await apiCallExpectFail(page, 'DELETE', `${LIP}/requests/${requestId}`);
    expectStateGateRejection(deleteApproved, 'approved 通知单不可删除');
    await tryCleanup(
      page,
      'DELETE',
      `${LIP}/requests/${requestId}`,
      `lab-dip-request#${requestId}`
    );
  });

  test('小样色差三态更新与等级取值域：显式 null 清空、覆盖、越界拒绝、非 pending 拒改', async ({
    page,
  }) => {
    const stamp = String(Date.now()).slice(-6);
    const created = await apiCallRaw<Row>(page, 'POST', `${LIP}/requests`, {
      light_source: 'TL84',
      sample_versions: 1,
      required_date: dateInDays(10),
      remarks: `E2E缸差三态${stamp}`,
    });
    const requestId = Number(created.id);
    expect(Number.isFinite(requestId), `建单未回主键 id：${JSON.stringify(created)}`).toBe(true);
    expect(
      created.customer_id,
      `客户缺席应落 NULL（建单口可空列），实际 ${JSON.stringify(created.customer_id)}`
    ).toBeNull();

    await apiCallRaw(page, 'POST', `${LIP}/requests/${requestId}/start-sampling`);
    const sample = await apiCallRaw<Row>(page, 'POST', `${LIP}/samples`, {
      request_id: requestId,
      temperature: '98.00',
      ph_value: '7.00',
      color_difference_grade: 5,
      color_difference_value: '2.50',
      dye_cost: '9.0001',
      remarks: `E2E缸差三态样${stamp}`,
    });
    const sampleId = Number(sample.id);
    expect(num((await readSample(page, sampleId)).temperature), '初值温度应落库 98').toBe(98);
    expect(
      num((await readSample(page, sampleId)).color_difference_value),
      '初值 ΔE 应落库 2.5'
    ).toBe(2.5);

    // 三态：显式 null 清空可空列，键缺席保持原值
    const cleared = await apiCallRaw<Row>(page, 'PUT', `${LIP}/samples/${sampleId}`, {
      color_difference_value: null,
      temperature: '85.00',
    });
    const afterClear = await readSample(page, sampleId);
    expect(
      afterClear.color_difference_value,
      `显式 null 应把 ΔE 清空为 NULL（lab_dip_sample 该列可空），实际 ${JSON.stringify(afterClear.color_difference_value)}`
    ).toBeNull();
    expect(num(afterClear.temperature), '有值键应覆盖为 85').toBe(85);
    expect(num(afterClear.ph_value), '键缺席应保持原值 7，不被清空').toBe(7);
    expect(str(afterClear.dye_cost) === str(cleared.dye_cost), '更新响应与详情口回读必须同值').toBe(
      true
    );

    // 等级取值域 1-5：0 与 6 都在任何落库前拒绝，且拒绝后零写入
    for (const badGrade of [0, 6]) {
      const rejected = await apiCallExpectFail(
        page,
        'POST',
        `${LIP}/samples/${sampleId}/matching`,
        {
          color_difference_grade: badGrade,
          color_difference_value: '1.00',
        }
      );
      expect(
        rejected.status,
        `等级 ${badGrade} 越界应被拒（HTTP 400），实际 status=${rejected.status} code=${JSON.stringify(rejected.code)}`
      ).toBe(400);
      expect(
        ['VALIDATION_ERROR', 'BUSINESS_ERROR', 'BAD_REQUEST'].includes(failureCode(rejected) ?? ''),
        `等级越界的拒绝族应为状态/校验族机器码，实际 code=${JSON.stringify(rejected.code)}`
      ).toBe(true);
      const untouched = await readSample(page, sampleId);
      expect(
        untouched.matching_result,
        `越界等级 ${badGrade} 被拒后对色结果不得被推进，实际 ${untouched.matching_result}`
      ).toBe('pending');
      expect(
        untouched.color_difference_grade,
        `越界等级被拒后落库等级不得被改写，实际 ${JSON.stringify(untouched.color_difference_grade)}`
      ).toBe(5);
    }

    // 判定线上沿：5 级 → matched，并把 ΔE 一并登记
    const matched = await apiCallRaw<Row>(page, 'POST', `${LIP}/samples/${sampleId}/matching`, {
      color_difference_grade: 5,
      color_difference_value: '1.05',
      approval_comment: '缸差合格',
    });
    expect(matched.matching_result, '色差 5 级应判 matched').toBe('matched');
    const finalSample = await readSample(page, sampleId);
    expect(num(finalSample.color_difference_value), '对色提交的 ΔE 应覆盖此前被清空的列').toBe(
      1.05
    );

    // 非 pending 后小样不可更新
    const updateAfterMatch = await apiCallExpectFail(page, 'PUT', `${LIP}/samples/${sampleId}`, {
      color_difference_value: '9.99',
    });
    expectStateGateRejection(updateAfterMatch, '已对色小样不可再更新');
    expect(
      num((await readSample(page, sampleId)).color_difference_value),
      '更新被拒后 ΔE 不得被改写'
    ).toBe(1.05);

    // sampling 状态的通知单不可删除；未推进的 pending 单可删且删后读不到
    const deleteSamplingRequest = await apiCallExpectFail(
      page,
      'DELETE',
      `${LIP}/requests/${requestId}`
    );
    expectStateGateRejection(deleteSamplingRequest, 'sampling 状态通知单不可删除');

    const scratch = await apiCallRaw<Row>(page, 'POST', `${LIP}/requests`, {
      light_source: 'CWF',
      sample_versions: 1,
      required_date: dateInDays(3),
      remarks: `E2E缸差可删${stamp}`,
    });
    const scratchId = Number(scratch.id);
    expect(scratch.status, '新建辅助单初值应为 pending').toBe('pending');
    await apiCallRaw(page, 'DELETE', `${LIP}/requests/${scratchId}`);
    const afterDelete = await apiCallExpectFail(page, 'GET', `${LIP}/requests/${scratchId}`);
    expect(
      afterDelete.status,
      `软删后详情口应读不到本单（HTTP 404），实际 status=${afterDelete.status}`
    ).toBe(404);
    expect(
      failureCode(afterDelete),
      `软删后详情口机器码应为 NOT_FOUND，实际 code=${JSON.stringify(afterDelete.code)}`
    ).toBe(APP_ERROR_CODES.NOT_FOUND);

    await tryCleanup(
      page,
      'DELETE',
      `${LIP}/requests/${requestId}`,
      `lab-dip-request#${requestId}`
    );
  });

  test('复样与染色技术卡：车间布批号必填、色差判定线联动复样状态、开卡门与重复开卡门', async ({
    page,
  }) => {
    const stamp = String(Date.now()).slice(-6);
    const created = await apiCallRaw<Row>(page, 'POST', `${LIP}/requests`, {
      light_source: 'U3000',
      sample_versions: 2,
      required_date: dateInDays(12),
      remarks: `E2E复样${stamp}`,
    });
    const requestId = Number(created.id);
    await apiCallRaw(page, 'POST', `${LIP}/requests/${requestId}/start-sampling`);

    const sampleOk = await apiCallRaw<Row>(page, 'POST', `${LIP}/samples`, {
      request_id: requestId,
      recipe_no: `E2E-FRM-OK-${stamp}`,
      temperature: '60.00',
    });
    const sampleAlt = await apiCallRaw<Row>(page, 'POST', `${LIP}/samples`, {
      request_id: requestId,
      recipe_no: `E2E-FRM-ALT-${stamp}`,
      temperature: '60.00',
    });
    const okId = Number(sampleOk.id);
    const altId = Number(sampleAlt.id);
    await apiCallRaw(page, 'POST', `${LIP}/samples/${okId}/matching`, {
      color_difference_grade: 4,
      color_difference_value: '2.00',
    });
    await apiCallRaw(page, 'POST', `${LIP}/samples/${altId}/matching`, {
      color_difference_grade: 5,
      color_difference_value: '1.00',
    });
    await apiCallRaw(page, 'POST', `${LIP}/requests/${requestId}/submit`);
    await apiCallRaw(page, 'POST', `${LIP}/requests/${requestId}/approve`, {
      sample_id: okId,
      comment: `OK 样${stamp}`,
    });
    expect((await readSample(page, okId)).matching_result, 'OK 样应为 selected').toBe('selected');
    expect((await readSample(page, altId)).matching_result, '另一版应仍为 matched').toBe('matched');

    // 缺车间半制品布批号：复样必须用车间半制品布，必填门在任何写库前拒绝
    const noBatch = await apiCallExpectFail(page, 'POST', `${LIP}/resamples`, {
      request_id: requestId,
      source_sample_id: okId,
      adjusted_formula: '加成 5%',
    });
    expectStateGateRejection(noBatch, '复样缺车间半制品布批号应被拒');
    expect((await readResamples(page, requestId)).length, '批号必填门拒绝后不应产生复样行').toBe(0);

    // 源样非 selected：matched 但未被客户选中的样不可复样
    const wrongSource = await apiCallExpectFail(page, 'POST', `${LIP}/resamples`, {
      request_id: requestId,
      source_sample_id: altId,
      workshop_fabric_batch: `E2E-WIP-${stamp}`,
    });
    expectStateGateRejection(wrongSource, '仅 selected OK 样可复样');
    expect((await readResamples(page, requestId)).length, '源样门拒绝后仍不应产生复样行').toBe(0);

    const resampleFailed = await apiCallRaw<Row>(page, 'POST', `${LIP}/resamples`, {
      request_id: requestId,
      source_sample_id: okId,
      workshop_fabric_batch: `E2E-WIP-${stamp}`,
      dye_batch_no: `E2E-DB-${stamp}`,
      auxiliary_batch_no: `E2E-AUX-${stamp}`,
      adjusted_formula: '加成 5%',
      adjustment_factor: '1.05',
      adjusted_temperature: '62.00',
      adjusted_time_minutes: 50,
      adjusted_liquor_ratio: '1:8',
      remarks: `E2E复样一${stamp}`,
    });
    const resampleFailedId = Number(resampleFailed.id);
    expect(
      str(resampleFailed.resample_no).startsWith('RS'),
      `复样单号应由服务端生成器出 RS 前缀（lab_dip_service.rs），实际 ${resampleFailed.resample_no}`
    ).toBe(true);
    expect(resampleFailed.result, '新建复样结果应为词表 pending').toBe('pending');
    expect(Number(resampleFailed.source_sample_id), '复样应回指源 OK 样').toBe(okId);
    expect(
      resampleFailed.color_difference_grade,
      `复样未记录前色差等级应为 NULL，实际 ${JSON.stringify(resampleFailed.color_difference_grade)}`
    ).toBeNull();
    expect(
      resampleFailed.tech_card_no,
      `开卡前技术卡号应为 NULL，实际 ${JSON.stringify(resampleFailed.tech_card_no)}`
    ).toBeNull();
    expect(
      str((await apiCallRaw<Row>(page, 'GET', `${LIP}/samples/${okId}`)).resample_status),
      '建复样后源样复样状态应转 resampling'
    ).toBe('resampling');

    // 复样色差 3 级：低于判定线 → failed，并联动源样 resample_status=failed
    const failedResult = await apiCallRaw<Row>(
      page,
      'POST',
      `${LIP}/resamples/${resampleFailedId}/result`,
      {
        color_difference_grade: 3,
        color_difference_value: '4.80',
        review_comment: '缸差偏大不可投产',
      }
    );
    expect(failedResult.result, '复样色差 3 级应判 failed').toBe('failed');
    const failedReadBack = await apiCallRaw<Row>(
      page,
      'GET',
      `${LIP}/resamples/${resampleFailedId}`
    );
    expect(Number(failedReadBack.color_difference_grade), '复样色差等级应落库 3').toBe(3);
    expect(num(failedReadBack.color_difference_value), '复样 ΔE 应落库 4.80').toBe(4.8);
    expect(
      failedReadBack.reviewed_by,
      `复样复核人应取会话身份，实际 ${JSON.stringify(failedReadBack.reviewed_by)}`
    ).not.toBeNull();
    expect(str(failedReadBack.review_comment), '复样复核意见应原样落库').toBe('缸差偏大不可投产');
    expect(
      str((await readSample(page, okId)).resample_status),
      '复样失败应把源样复样状态联动为 failed'
    ).toBe('failed');

    // failed 复样不可开卡（仅 passed 可开），且结果不可重复记录
    const cardOnFailed = await apiCallExpectFail(
      page,
      'POST',
      `${LIP}/resamples/${resampleFailedId}/tech-card`
    );
    expectStateGateRejection(cardOnFailed, '复样 failed 不可开染色技术卡');
    const reRecord = await apiCallExpectFail(
      page,
      'POST',
      `${LIP}/resamples/${resampleFailedId}/result`,
      {
        color_difference_grade: 5,
        color_difference_value: '0.50',
      }
    );
    expectStateGateRejection(reRecord, '复样结果不可重复记录');
    expect(
      (await apiCallRaw<Row>(page, 'GET', `${LIP}/resamples/${resampleFailedId}`)).result,
      '重复记录被拒后复样结果不得被改写'
    ).toBe('failed');

    // 第二笔复样：色差 4 级 → passed，源样联动 resampled，开卡成功且三列齐
    const resamplePassed = await apiCallRaw<Row>(page, 'POST', `${LIP}/resamples`, {
      request_id: requestId,
      source_sample_id: okId,
      workshop_fabric_batch: `E2E-WIP2-${stamp}`,
      adjusted_temperature: '60.00',
      adjusted_liquor_ratio: '1:6',
      remarks: `E2E复样二${stamp}`,
    });
    const passedId = Number(resamplePassed.id);
    const passedResult = await apiCallRaw<Row>(
      page,
      'POST',
      `${LIP}/resamples/${passedId}/result`,
      {
        color_difference_grade: 4,
        color_difference_value: '0.60',
        review_comment: '达判定线可投产',
      }
    );
    expect(passedResult.result, '复样色差 4 级应判 passed（判定线上）').toBe('passed');
    expect(
      str((await readSample(page, okId)).resample_status),
      '复样通过应把源样复样状态联动为 resampled'
    ).toBe('resampled');

    const techCard = await apiCallRaw<Row>(page, 'POST', `${LIP}/resamples/${passedId}/tech-card`);
    expect(
      str(techCard.tech_card_no).startsWith('TC-'),
      `染色技术卡号应服务端出 TC- 前缀，实际 ${techCard.tech_card_no}`
    ).toBe(true);
    expect(
      str(techCard.tech_card_no).endsWith(`-${String(passedId).padStart(6, '0')}`),
      `技术卡号应含本复样主键六位补零段（resample.rs），实际 ${techCard.tech_card_no}`
    ).toBe(true);
    expect(
      techCard.tech_card_issued_by,
      `开卡人应取会话身份（研发组长），实际 ${JSON.stringify(techCard.tech_card_issued_by)}`
    ).not.toBeNull();
    expect(
      str(techCard.tech_card_issued_at),
      `开卡时间应落库为非空时间串，实际=${JSON.stringify(techCard.tech_card_issued_at)}`
    ).not.toBe('');
    const cardReadBack = await apiCallRaw<Row>(page, 'GET', `${LIP}/resamples/${passedId}`);
    expect(str(cardReadBack.tech_card_no), '技术卡号详情口回读应与动作响应同值').toBe(
      str(techCard.tech_card_no)
    );

    // 重复开卡必须被拒，且已落库的卡号不被改写
    const reIssue = await apiCallExpectFail(page, 'POST', `${LIP}/resamples/${passedId}/tech-card`);
    expectStateGateRejection(reIssue, '染色技术卡不可重复开具');
    expect(
      str((await apiCallRaw<Row>(page, 'GET', `${LIP}/resamples/${passedId}`)).tech_card_no),
      '重复开卡被拒后卡号不得被改写'
    ).toBe(str(cardReadBack.tech_card_no));

    // 按单读复样：两笔都在册，result 各自保持终值
    const all = await readResamples(page, requestId);
    expect(all.length, '按单读复样应命中两笔').toBe(2);
    const byId = new Map(all.map(r => [Number(r.id), r]));
    expect(byId.get(resampleFailedId)?.result, '失败复样行结果应保持 failed').toBe('failed');
    expect(byId.get(passedId)?.result, '通过复样行结果应保持 passed').toBe('passed');

    await tryCleanup(
      page,
      'DELETE',
      `${LIP}/requests/${requestId}`,
      `lab-dip-request#${requestId}`
    );
  });
});
