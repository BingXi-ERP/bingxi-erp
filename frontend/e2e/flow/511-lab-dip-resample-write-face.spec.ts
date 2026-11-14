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
 * 打样复样（resample）族五端点写面与读面 — 511。
 *
 * 覆盖面。复样是 OK 样确认后、大货生产前的投产验证：用车间半制品布与生产染化料
 * 模拟大生产，色差达 4 级方可投产，通过后由研发开染色技术卡。既有 210 已钉判定线
 * 与状态门，本文件专钉五枚复样端点的写后必回读契约与悬空读面负例。
 *
 * 调用面（五枚复样端点，整串路径含 /api/v1/erp 前缀；挂载链 routes/mod.rs nest
 * /api/v1/erp/production 加 routes/production.rs 的 /lab-dip）：
 *   POST /api/v1/erp/production/lab-dip/resamples
 *   GET /api/v1/erp/production/lab-dip/resamples/{id}
 *   POST /api/v1/erp/production/lab-dip/resamples/{id}/result
 *   POST /api/v1/erp/production/lab-dip/resamples/{id}/tech-card
 *   GET /api/v1/erp/production/lab-dip/resamples/by-request/{request_id}
 * 链路前置端点（本文件自建数据用，同为真实调用面）：
 *   POST /api/v1/erp/production/lab-dip/requests
 *   POST /api/v1/erp/production/lab-dip/requests/{id}/start-sampling
 *   POST /api/v1/erp/production/lab-dip/samples
 *   POST /api/v1/erp/production/lab-dip/samples/{id}/matching
 *   POST /api/v1/erp/production/lab-dip/requests/{id}/submit
 *   POST /api/v1/erp/production/lab-dip/requests/{id}/approve
 *   GET /api/v1/erp/production/lab-dip/samples/{id}
 *
 * 契约真相（逐段读后端源，非推测）。
 * 请求体字段面在 backend/src/services/lab_dip_ops/types.rs：CreateResampleRequest
 * 必填 request_id 与 source_sample_id，workshop_fabric_batch 在 service 层强校验
 * 非空（复样必须用车间半制品布），其余复样条件与处方列可缺席；
 * RecordResampleResultRequest 必填 color_difference_grade（取值域 1 到 5 级），
 * color_difference_value 与 review_comment 可空；技术卡端点不绑定请求体提取器。
 * request_id 有强校验：validate_resample_request 查通知单存在且状态 approved，
 * source_sample_id 必须属于该通知单且对色结果为 selected，所以复样必须挂在
 * 自建并审批通过的链上，不能传自编 id。
 * 出参是实体全列 lab_dip_resample（backend/src/models/lab_dip_resample.rs），
 * DECIMAL 列按 rust_decimal 出参为十进制字符串，比较一律 Number(String(v)) 归一。
 * 状态词表小写：pending 与 passed 与 failed 与 adjusted（backend/src/models/status/
 * quality_dyeing.rs 的 lab_dip_resample 模块）；判定线色差 4 级及以上判 passed、
 * 低于 4 级判 failed（resample.rs 的 record_result）；技术卡仅 passed 可开且不可
 * 重复开（resample.rs 的 issue_tech_card），卡号由服务端生成，形如
 * TC-年月日-复样主键六位补零。
 * 登记人、复核人、开卡人三列唯一来源是服务端会话身份（handler 不收请求体身份字段）。
 * 详情端点有行级归属门：登记人不在当前会话数据范围报 403 无权查看；本文件全部
 * 自建自用同会话，不会撞门。
 * 按申请单列举出参为裸数组（handlers/lab_dip_handler.rs 直接序列化 Model 数组），
 * 悬空申请单不报错、回空数组。
 *
 * 假绿防线。每步写后按主键独立回读逐列比对，不判接口 200 即通过；负例钉 HTTP 404
 * 加机器码 NOT_FOUND；数据用唯一时间戳后缀隔离，并发 worker 互不干扰；复样无删除
 * 端点、通知单 approved 后删除被状态门拒，属域内事实，不伪造清理。
 */

type Row = Record<string, unknown>;

/** 面料打样域前缀：routes/mod.rs nest /api/v1/erp/production 加 routes/production.rs /lab-dip */
const LIP = '/production/lab-dip';

const num = (v: unknown): number => Number(String(v));
const str = (v: unknown): string => String(v);

/**
 * 功能 判定时间列出参是真实时间字符串且可解析。
 * 调用方 本文件复核时间与开卡时间两处的非空判定。
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
 * 功能 生成 N 天后的 YYYY-MM-DD 日期串，作打样通知单必填的 required_date。
 * 调用方 本文件链路前置建单载荷。
 * 入参 daysFromNow 距今天数（正整数）。
 * 传给谁 直接进 POST /lab-dip/requests 请求体 required_date 键。
 * 存什么 不存储，纯函数。
 * 存哪里 无。
 */
function dateInDays(daysFromNow: number): string {
  const d = new Date(Date.now() + daysFromNow * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/**
 * 功能 从零建一条已审批的打样通知单链，返回通知单主键与 selected 状态的 OK 样主键。
 * 调用方 本文件全部正向用例的链路前置（复样门要求通知单 approved 且源样 selected）。
 * 入参 page 会话页；stamp 当日用例时间戳后缀，用于单号与批号唯一化。
 * 传给谁 返回的 requestId 与 okId 交 createResample 与各用例的回读断言。
 * 存什么 不存储，链路数据全部落库，靠 stamp 隔离不同用例与并发 worker。
 * 存哪里 lab_dip_request 与 lab_dip_sample 表。
 */
async function createApprovedChain(
  page: Page,
  stamp: string
): Promise<{ requestId: number; okId: number }> {
  const created = await apiCallRaw<Row>(page, 'POST', `${LIP}/requests`, {
    light_source: 'D65',
    sample_versions: 2,
    required_date: dateInDays(12),
    remarks: `E2E复样链${stamp}`,
  });
  const requestId = Number(created.id);
  expect(
    Number.isFinite(requestId),
    `[511 链] 建打样通知单未回主键 id，实际 ${JSON.stringify(created)}`
  ).toBe(true);
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
  expect(
    Number.isFinite(okId) && Number.isFinite(altId) && okId !== altId,
    `[511 链] 两版小样应各自回主键，实际 OK=${JSON.stringify(sampleOk.id)} ALT=${JSON.stringify(sampleAlt.id)}`
  ).toBe(true);
  await apiCallRaw(page, 'POST', `${LIP}/samples/${okId}/matching`, {
    color_difference_grade: 4,
    color_difference_value: '2.00',
  });
  await apiCallRaw(page, 'POST', `${LIP}/samples/${altId}/matching`, {
    color_difference_grade: 5,
    color_difference_value: '1.00',
  });
  await apiCallRaw(page, 'POST', `${LIP}/requests/${requestId}/submit`);
  const approved = await apiCallRaw<Row>(page, 'POST', `${LIP}/requests/${requestId}/approve`, {
    sample_id: okId,
    comment: `OK 样${stamp}`,
  });
  expect(
    approved.status,
    `[511 链] 客户确认后通知单状态应为 approved，实际 ${str(approved.status)}`
  ).toBe('approved');
  const okRead = await apiCallRaw<Row>(page, 'GET', `${LIP}/samples/${okId}`);
  expect(
    okRead.matching_result,
    `[511 链] 被选中 OK 样对色结果应为 selected，实际 ${str(okRead.matching_result)}`
  ).toBe('selected');
  return { requestId, okId };
}

/**
 * 功能 在已审批链上建一笔复样，写满全部可填的复样条件与处方列。
 * 调用方 本文件全部正向用例的建复样步。
 * 入参 page 会话页；requestId 通知单主键；okId selected 源样主键；
 *       stamp 时间戳后缀；suffix 同单多笔复样的区分后缀。
 * 传给谁 返回创建响应（lab_dip_resample 实体全列）交调用方逐列断言。
 * 存什么 不存储，落库由后端完成。
 * 存哪里 lab_dip_resample 表。
 */
async function createResample(
  page: Page,
  requestId: number,
  okId: number,
  stamp: string,
  suffix: string
): Promise<Row> {
  return apiCallRaw<Row>(page, 'POST', `${LIP}/resamples`, {
    request_id: requestId,
    source_sample_id: okId,
    workshop_fabric_batch: `E2E-WIP-${stamp}-${suffix}`,
    dye_batch_no: `E2E-DB-${stamp}-${suffix}`,
    auxiliary_batch_no: `E2E-AUX-${stamp}-${suffix}`,
    adjusted_formula: `加成 5% ${suffix}`,
    adjustment_factor: '1.05',
    adjusted_temperature: '62.00',
    adjusted_time_minutes: 50,
    adjusted_liquor_ratio: '1:8',
    remarks: `E2E复样${suffix}${stamp}`,
  });
}

test.describe.serial('打样复样族写面：建复样回读、详情、按单列举、录结果、发工艺卡与悬空读面', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('511-01 建复样记录：请求体全字段落库与创建响应逐列回读', async ({ page }) => {
    const stamp = String(Date.now()).slice(-6);
    const { requestId, okId } = await createApprovedChain(page, stamp);
    const fabricBatch = `E2E-WIP-${stamp}-A`;
    const created = await apiCallRaw<Row>(page, 'POST', `${LIP}/resamples`, {
      request_id: requestId,
      source_sample_id: okId,
      workshop_fabric_batch: fabricBatch,
      dye_batch_no: `E2E-DB-${stamp}`,
      auxiliary_batch_no: `E2E-AUX-${stamp}`,
      adjusted_formula: '加成 5% 冲减 1%',
      adjustment_factor: '1.05',
      adjusted_temperature: '62.00',
      adjusted_time_minutes: 50,
      adjusted_liquor_ratio: '1:8',
      remarks: `E2E复样A${stamp}`,
    });
    const id = Number(created.id);
    expect(Number.isFinite(id), `[511-01] 建复样未回主键 id，实际 ${JSON.stringify(created)}`).toBe(
      true
    );
    expect(
      str(created.resample_no).startsWith('RS'),
      `[511-01] 复样单号应由服务端生成器出 RS 前缀（lab_dip_service.rs 单号常量），实际 ${str(created.resample_no)}`
    ).toBe(true);
    expect(Number(created.request_id), '[511-01] request_id 应落提交值').toBe(requestId);
    expect(Number(created.source_sample_id), '[511-01] source_sample_id 应落提交值').toBe(okId);
    expect(
      created.result,
      `[511-01] 新建复样结果应为词表 pending（quality_dyeing.rs lab_dip_resample 模块），实际 ${str(created.result)}`
    ).toBe('pending');
    expect(str(created.workshop_fabric_batch), '[511-01] 车间半制品布批号应原样落库').toBe(
      fabricBatch
    );
    expect(str(created.dye_batch_no), '[511-01] 染料批号应原样落库').toBe(`E2E-DB-${stamp}`);
    expect(str(created.auxiliary_batch_no), '[511-01] 助剂批号应原样落库').toBe(
      `E2E-AUX-${stamp}`
    );
    expect(str(created.adjusted_formula), '[511-01] 调整后处方应原样落库').toBe('加成 5% 冲减 1%');
    expect(
      num(created.adjustment_factor),
      '[511-01] 加成系数应回落库值 1.05（DECIMAL 出参为字符串）'
    ).toBe(1.05);
    expect(num(created.adjusted_temperature), '[511-01] 调整后温度应回落库值 62').toBe(62);
    expect(Number(created.adjusted_time_minutes), '[511-01] 调整后时间应回落库值 50').toBe(50);
    expect(str(created.adjusted_liquor_ratio), '[511-01] 调整后浴比应原样落库').toBe('1:8');
    expect(str(created.remarks), '[511-01] 备注应原样落库').toBe(`E2E复样A${stamp}`);
    expect(
      created.production_plan_id,
      `[511-01] 未提交生产计划关联时该列应为 NULL，实际 ${JSON.stringify(created.production_plan_id)}`
    ).toBeNull();
    expect(
      created.color_difference_grade,
      `[511-01] 未录结果前色差等级应为 NULL，实际 ${JSON.stringify(created.color_difference_grade)}`
    ).toBeNull();
    expect(
      created.color_difference_value,
      `[511-01] 未录结果前 Delta E 应为 NULL，实际 ${JSON.stringify(created.color_difference_value)}`
    ).toBeNull();
    expect(
      created.reviewed_by,
      `[511-01] 未复核前审核人应为 NULL，实际 ${JSON.stringify(created.reviewed_by)}`
    ).toBeNull();
    expect(
      created.reviewed_at,
      `[511-01] 未复核前审核时间应为 NULL，实际 ${JSON.stringify(created.reviewed_at)}`
    ).toBeNull();
    expect(
      created.review_comment,
      `[511-01] 未复核前审核意见应为 NULL，实际 ${JSON.stringify(created.review_comment)}`
    ).toBeNull();
    expect(
      created.production_recipe_id,
      `[511-01] 未升级大货处方时该列应为 NULL，实际 ${JSON.stringify(created.production_recipe_id)}`
    ).toBeNull();
    expect(
      created.tech_card_no,
      `[511-01] 开卡前技术卡号应为 NULL，实际 ${JSON.stringify(created.tech_card_no)}`
    ).toBeNull();
    expect(
      created.tech_card_issued_by,
      `[511-01] 开卡前开卡人应为 NULL，实际 ${JSON.stringify(created.tech_card_issued_by)}`
    ).toBeNull();
    expect(
      created.tech_card_issued_at,
      `[511-01] 开卡前开卡时间应为 NULL，实际 ${JSON.stringify(created.tech_card_issued_at)}`
    ).toBeNull();
    expect(created.is_deleted, `[511-01] 新建行软删标记应为 false，实际 ${created.is_deleted}`).toBe(
      false
    );
    expect(
      created.created_by,
      `[511-01] 登记人应取服务端会话身份（handler 不收请求体身份字段），实际 ${JSON.stringify(created.created_by)}`
    ).not.toBeNull();
    expect(
      isRealTimestamp(created.created_at),
      `[511-01] 创建时间应落库为可解析时间串，实际 ${JSON.stringify(created.created_at)}`
    ).toBe(true);
    expect(
      isRealTimestamp(created.updated_at),
      `[511-01] 更新时间应落库为可解析时间串，实际 ${JSON.stringify(created.updated_at)}`
    ).toBe(true);
  });

  test('511-02 复样详情按主键回读与创建行逐列一致', async ({ page }) => {
    const stamp = String(Date.now()).slice(-6);
    const { requestId, okId } = await createApprovedChain(page, stamp);
    const created = await createResample(page, requestId, okId, stamp, 'B');
    const id = Number(created.id);
    const detail = await apiCallRaw<Row>(page, 'GET', `${LIP}/resamples/${id}`);
    expect(Number(detail.id), `[511-02] 详情应回同一主键 ${id}，实际 ${JSON.stringify(detail.id)}`).toBe(
      id
    );
    expect(Number(detail.request_id), '[511-02] 详情 request_id 应与创建行一致').toBe(requestId);
    expect(Number(detail.source_sample_id), '[511-02] 详情 source_sample_id 应与创建行一致').toBe(
      okId
    );
    expect(
      str(detail.resample_no),
      `[511-02] 详情单号应与创建响应一致，实际 ${str(detail.resample_no)}`
    ).toBe(str(created.resample_no));
    expect(
      detail.result,
      `[511-02] 详情结果应为词表 pending，实际 ${str(detail.result)}`
    ).toBe('pending');
    expect(
      str(detail.workshop_fabric_batch),
      '[511-02] 详情车间半制品布批号应与创建行一致'
    ).toBe(str(created.workshop_fabric_batch));
    expect(str(detail.dye_batch_no), '[511-02] 详情染料批号应与创建行一致').toBe(
      str(created.dye_batch_no)
    );
    expect(str(detail.auxiliary_batch_no), '[511-02] 详情助剂批号应与创建行一致').toBe(
      str(created.auxiliary_batch_no)
    );
    expect(
      num(detail.adjustment_factor),
      '[511-02] 详情加成系数应与创建行一致（DECIMAL 出参为字符串）'
    ).toBe(1.05);
    expect(num(detail.adjusted_temperature), '[511-02] 详情调整后温度应与创建行一致').toBe(62);
    expect(Number(detail.adjusted_time_minutes), '[511-02] 详情调整后时间应与创建行一致').toBe(50);
    expect(str(detail.adjusted_liquor_ratio), '[511-02] 详情调整后浴比应与创建行一致').toBe('1:8');
    expect(str(detail.remarks), '[511-02] 详情备注应与创建行一致').toBe(str(created.remarks));
    expect(
      detail.tech_card_no,
      `[511-02] 未开卡详情技术卡号应为 NULL，实际 ${JSON.stringify(detail.tech_card_no)}`
    ).toBeNull();
  });

  test('511-03 按打样申请单列举复样：自建两行全部命中且行数恰为二', async ({ page }) => {
    const stamp = String(Date.now()).slice(-6);
    const { requestId, okId } = await createApprovedChain(page, stamp);
    const first = await createResample(page, requestId, okId, stamp, 'C1');
    const second = await createResample(page, requestId, okId, stamp, 'C2');
    const idFirst = Number(first.id);
    const idSecond = Number(second.id);
    expect(
      Number.isFinite(idFirst) && Number.isFinite(idSecond) && idFirst !== idSecond,
      `[511-03] 两笔复样应各自回主键，实际 ${JSON.stringify(first.id)} 与 ${JSON.stringify(second.id)}`
    ).toBe(true);
    const data = await apiCallRaw<unknown>(
      page,
      'GET',
      `${LIP}/resamples/by-request/${requestId}`
    );
    const rows = pickListArray<Row>(data, 'bare', `[511-03] 通知单 ${requestId} 的复样列表`);
    expect(
      rows.length,
      `[511-03] 新建通知单下应恰有两笔复样（出参为裸数组），实际 ${rows.length}`
    ).toBe(2);
    const ids = rows.map((r) => Number(r.id)).sort((a, b) => a - b);
    expect(
      ids,
      `[511-03] 两笔复样主键都应在列表中，实际 ${JSON.stringify(ids)}`
    ).toEqual([idFirst, idSecond].sort((a, b) => a - b));
    const batches = rows.map((r) => str(r.workshop_fabric_batch)).sort();
    expect(
      batches,
      `[511-03] 两笔复样的车间半制品布批号都应原样在列，实际 ${JSON.stringify(batches)}`
    ).toEqual([str(first.workshop_fabric_batch), str(second.workshop_fabric_batch)].sort());
    for (const r of rows) {
      expect(r.result, `[511-03] 列表行 ${JSON.stringify(r.id)} 结果应为 pending`).toBe('pending');
      expect(
        Number(r.request_id),
        `[511-03] 列表行 ${JSON.stringify(r.id)} request_id 应回指本单`
      ).toBe(requestId);
      expect(
        Number(r.source_sample_id),
        `[511-03] 列表行 ${JSON.stringify(r.id)} source_sample_id 应回指 OK 样`
      ).toBe(okId);
    }
  });

  test('511-04 录复样结果：色差 4 级判 passed 且复核三列与色差两列落库', async ({ page }) => {
    const stamp = String(Date.now()).slice(-6);
    const { requestId, okId } = await createApprovedChain(page, stamp);
    const created = await createResample(page, requestId, okId, stamp, 'D');
    const id = Number(created.id);
    const recorded = await apiCallRaw<Row>(
      page,
      'POST',
      `${LIP}/resamples/${id}/result`,
      {
        color_difference_grade: 4,
        color_difference_value: '0.85',
        review_comment: '达判定线可投产',
      }
    );
    expect(
      recorded.result,
      `[511-04] 色差 4 级应判 passed（判定线上，resample.rs 判定线取 4），实际 ${str(recorded.result)}`
    ).toBe('passed');
    expect(Number(recorded.color_difference_grade), '[511-04] 色差等级应落提交值 4').toBe(4);
    expect(
      num(recorded.color_difference_value),
      '[511-04] Delta E 应落库 0.85（DECIMAL 出参为字符串）'
    ).toBe(0.85);
    expect(str(recorded.review_comment), '[511-04] 复核意见应原样落库').toBe('达判定线可投产');
    expect(
      recorded.reviewed_by,
      `[511-04] 复核人应取会话身份（handler 不收请求体身份），实际 ${JSON.stringify(recorded.reviewed_by)}`
    ).not.toBeNull();
    expect(
      isRealTimestamp(recorded.reviewed_at),
      `[511-04] 复核时间应落库为可解析时间串，实际 ${JSON.stringify(recorded.reviewed_at)}`
    ).toBe(true);
    // 独立详情口回读，确认落库而非仅响应体携带
    const readBack = await apiCallRaw<Row>(page, 'GET', `${LIP}/resamples/${id}`);
    expect(readBack.result, `[511-04] 详情回读结果应为 passed，实际 ${str(readBack.result)}`).toBe(
      'passed'
    );
    expect(Number(readBack.color_difference_grade), '[511-04] 详情回读色差等级应为 4').toBe(4);
    expect(num(readBack.color_difference_value), '[511-04] 详情回读 Delta E 应为 0.85').toBe(0.85);
    expect(str(readBack.review_comment), '[511-04] 详情回读复核意见应一致').toBe('达判定线可投产');
    expect(
      readBack.reviewed_by,
      `[511-04] 详情回读复核人应与会话一致，实际 ${JSON.stringify(readBack.reviewed_by)}`
    ).toEqual(recorded.reviewed_by);
    // 通过后源样复样状态联动为 resampled（resample.rs record_result 同事务联动）
    const okRead = await apiCallRaw<Row>(page, 'GET', `${LIP}/samples/${okId}`);
    expect(
      str(okRead.resample_status),
      `[511-04] 复样通过应把源样复样状态联动为 resampled，实际 ${str(okRead.resample_status)}`
    ).toBe('resampled');
  });

  test('511-05 发染色技术卡：passed 复样开卡成功且卡号与开卡人时间落库', async ({ page }) => {
    const stamp = String(Date.now()).slice(-6);
    const { requestId, okId } = await createApprovedChain(page, stamp);
    const created = await createResample(page, requestId, okId, stamp, 'E');
    const id = Number(created.id);
    await apiCallRaw<Row>(page, 'POST', `${LIP}/resamples/${id}/result`, {
      color_difference_grade: 5,
      color_difference_value: '0.50',
      review_comment: '色差优秀可投产',
    });
    const card = await apiCallRaw<Row>(page, 'POST', `${LIP}/resamples/${id}/tech-card`);
    const techCardNo = str(card.tech_card_no);
    expect(
      techCardNo.startsWith('TC-'),
      `[511-05] 技术卡号应由服务端生成 TC 前缀（resample.rs issue_tech_card），实际 ${techCardNo}`
    ).toBe(true);
    expect(
      techCardNo.endsWith(`-${String(id).padStart(6, '0')}`),
      `[511-05] 卡号应含复样主键六位补零段，实际 ${techCardNo}`
    ).toBe(true);
    expect(
      card.tech_card_issued_by,
      `[511-05] 开卡人应取会话身份（handler 不绑定请求体），实际 ${JSON.stringify(card.tech_card_issued_by)}`
    ).not.toBeNull();
    expect(
      isRealTimestamp(card.tech_card_issued_at),
      `[511-05] 开卡时间应落库为可解析时间串，实际 ${JSON.stringify(card.tech_card_issued_at)}`
    ).toBe(true);
    expect(
      card.result,
      `[511-05] 开卡不改复样结果，仍应为 passed，实际 ${str(card.result)}`
    ).toBe('passed');
    // 独立详情口回读技术卡三列
    const readBack = await apiCallRaw<Row>(page, 'GET', `${LIP}/resamples/${id}`);
    expect(str(readBack.tech_card_no), '[511-05] 详情回读卡号应与开卡响应一致').toBe(techCardNo);
    expect(
      readBack.tech_card_issued_by,
      `[511-05] 详情回读开卡人应非空，实际 ${JSON.stringify(readBack.tech_card_issued_by)}`
    ).not.toBeNull();
    expect(
      isRealTimestamp(readBack.tech_card_issued_at),
      `[511-05] 详情回读开卡时间应为可解析时间串，实际 ${JSON.stringify(readBack.tech_card_issued_at)}`
    ).toBe(true);
  });

  test('511-06 悬空复样主键详情回 404 加机器码 NOT_FOUND', async ({ page }) => {
    const failed = await apiCallExpectFail(page, 'GET', `${LIP}/resamples/99999999`);
    expect(
      failed.status,
      `[511-06] 悬空复样详情应恰为 HTTP 404（AppError::not_found），实际 ${failed.status}`
    ).toBe(404);
    expect(
      failureCode(failed),
      `[511-06] 失败信封机器码应为 NOT_FOUND（helpers APP_ERROR_CODES），实际 ${JSON.stringify(failureCode(failed))}`
    ).toBe(APP_ERROR_CODES.NOT_FOUND);
  });

  test('511-07 悬空申请单列举复样回空数组不报错', async ({ page }) => {
    const data = await apiCallRaw<unknown>(
      page,
      'GET',
      `${LIP}/resamples/by-request/99999999`
    );
    const rows = pickListArray<Row>(data, 'bare', '[511-07] 悬空申请单的复样列表');
    expect(
      rows.length,
      `[511-07] 悬空申请单应回空数组（list_by_request 仅按 request_id 过滤），实际 ${rows.length}`
    ).toBe(0);
  });

  test('511-08 录复样结果：色差 3 级低于判定线判 failed 且详情回读一致', async ({ page }) => {
    const stamp = String(Date.now()).slice(-6);
    const { requestId, okId } = await createApprovedChain(page, stamp);
    const created = await createResample(page, requestId, okId, stamp, 'H');
    const id = Number(created.id);
    const recorded = await apiCallRaw<Row>(
      page,
      'POST',
      `${LIP}/resamples/${id}/result`,
      {
        color_difference_grade: 3,
        color_difference_value: '4.80',
        review_comment: '低于判定线不可投产',
      }
    );
    expect(
      recorded.result,
      `[511-08] 色差 3 级应判 failed（低于判定线 4），实际 ${str(recorded.result)}`
    ).toBe('failed');
    expect(Number(recorded.color_difference_grade), '[511-08] 色差等级应落提交值 3').toBe(3);
    expect(num(recorded.color_difference_value), '[511-08] Delta E 应落库 4.80').toBe(4.8);
    // 详情口独立回读
    const readBack = await apiCallRaw<Row>(page, 'GET', `${LIP}/resamples/${id}`);
    expect(readBack.result, `[511-08] 详情回读结果应为 failed，实际 ${str(readBack.result)}`).toBe(
      'failed'
    );
    expect(str(readBack.review_comment), '[511-08] 详情回读复核意见应一致').toBe(
      '低于判定线不可投产'
    );
    // 失败后源样复样状态联动为 failed
    const okRead = await apiCallRaw<Row>(page, 'GET', `${LIP}/samples/${okId}`);
    expect(
      str(okRead.resample_status),
      `[511-08] 复样失败应把源样复样状态联动为 failed，实际 ${str(okRead.resample_status)}`
    ).toBe('failed');
    // failed 复样不可开技术卡（仅 passed 可开，resample.rs issue_tech_card 门）
    const cardOnFailed = await apiCallExpectFail(
      page,
      'POST',
      `${LIP}/resamples/${id}/tech-card`
    );
    expect(
      cardOnFailed.status,
      `[511-08] failed 复样开卡应被业务门拒为 400，实际 ${cardOnFailed.status}`
    ).toBe(400);
    expect(
      failureCode(cardOnFailed),
      `[511-08] 开卡拒绝应带字符串机器码（AppError::business 族），实际 ${JSON.stringify(failureCode(cardOnFailed))}`
    ).toBeTruthy();
  });
});
