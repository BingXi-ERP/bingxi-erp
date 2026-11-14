import { test, expect, type Page } from '../diagnose-fixture';
import { apiCallRaw, apiCallExpectFail, expectStateGateRejection } from './helpers';

/**
 * 打样复样族写面（resample）。
 *
 * 覆盖面。lab-dip/resamples 五端点在 e2e 语料里零覆盖（主干顶点全库检索
 * lab-dip/resamples 零命中，210 号只覆盖通知单与小样对色段）：建复样、
 * 详情回读、录复样结果、发染色技术卡、按通知单列举。
 *
 * 调用面（配对门登记，整串含挂载前缀）。
 * POST /api/v1/erp/production/lab-dip/resamples
 * GET /api/v1/erp/production/lab-dip/resamples/{id}
 * POST /api/v1/erp/production/lab-dip/resamples/{id}/result
 * POST /api/v1/erp/production/lab-dip/resamples/{id}/tech-card
 * GET /api/v1/erp/production/lab-dip/resamples/by-request/{request_id}
 *
 * 契约真相（逐段读后端源，非推测）。
 * 路由装配在 backend/src/routes/production.rs 的 lab_dip()，挂载前缀
 * /api/v1/erp/production（routes/mod.rs nest）。handler 在
 * backend/src/handlers/lab_dip_handler.rs（create_resample 473、get_resample
 * 455 带 created_by 行级归属门、record_resample_result 487、issue_tech_card
 * 504 无请求体）。请求体字段面在 backend/src/services/lab_dip_ops/types.rs：
 * 建复样必填 request_id 与 source_sample_id 与 workshop_fabric_batch（车间
 * 半制品布批号必填门在 resample.rs:127），录结果必填 color_difference_grade。
 * 前置门（resample.rs:94-137）：通知单必须 approved、源样必须 selected。
 * 判定线：色差 4-5 级 passed，低于 4 级 failed（resample.rs 判定同 210 号）；
 * 复样结果非 pending 不可重复记录；技术卡仅 passed 可开且不可重复开。
 * 出参是 lab_dip_resample Model 全列，result 初值 pending，单号 RS 前缀。
 */
const LIP = '/production/lab-dip';

type Row = Record<string, unknown>;

const num = (v: unknown): number => Number(String(v));
const str = (v: unknown): string => (v == null ? '' : String(v));

/** 前置造数：通知单建单到客户确认批准，B 版为 selected OK 样（复用 210 号已钉的链路）。 */
async function seedApprovedRequestWithSelectedSample(
  page: Page,
  stamp: string
): Promise<{ requestId: number; okSampleId: number; notMatchedSampleId: number }> {
  const created = await apiCallRaw<Row>(page, 'POST', `${LIP}/requests`, {
    light_source: 'D65',
    required_date: '2027-06-30',
    customer_color_no: `E2E-RS-${stamp}`,
    customer_color_name: `复样链色${stamp}`,
    fabric_component: '棉 100',
    sample_type: 'lab_dip',
    sample_size: '25*25',
    sample_versions: 2,
  });
  const requestId = num(created.id);

  await apiCallRaw<Row>(page, 'POST', `${LIP}/requests/${requestId}/start-sampling`);

  const sampleBase = {
    request_id: requestId,
    formula: '活性三原配色',
    formula_detail: [
      { dye_name: '活性红 195', amount: '1.25', unit: '%(o.w.f)', percentage: '1.25' },
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
    recipe_no: `E2E-RS-A-${stamp}`,
    color_difference_grade: 3,
    color_difference_value: '4.20',
  });
  const sampleB = await apiCallRaw<Row>(page, 'POST', `${LIP}/samples`, {
    ...sampleBase,
    recipe_no: `E2E-RS-B-${stamp}`,
    color_difference_grade: 4,
    color_difference_value: '2.60',
  });
  const idA = num(sampleA.id);
  const idB = num(sampleB.id);

  await apiCallRaw<Row>(page, 'POST', `${LIP}/samples/${idA}/matching`, {
    color_difference_grade: 3,
    color_difference_value: '4.20',
    approval_comment: '色差不足需重打',
  });
  await apiCallRaw<Row>(page, 'POST', `${LIP}/samples/${idB}/matching`, {
    color_difference_grade: 4,
    color_difference_value: '2.60',
    approval_comment: '达 4 级可送客户',
  });

  await apiCallRaw<Row>(page, 'POST', `${LIP}/requests/${requestId}/submit`);
  await apiCallRaw<Row>(page, 'POST', `${LIP}/requests/${requestId}/approve`, {
    sample_id: idB,
    comment: `确认 B 版为 OK 样${stamp}`,
  });
  return { requestId, okSampleId: idB, notMatchedSampleId: idA };
}

test('511-01 建复样回读全字段与单号 RS 前缀', async ({ page }) => {
  const tag = '511-01';
  const stamp = `${String(Date.now()).slice(-6)}A`;
  const seed = await seedApprovedRequestWithSelectedSample(page, stamp);

  const created = await apiCallRaw<Row>(page, 'POST', `${LIP}/resamples`, {
    request_id: seed.requestId,
    source_sample_id: seed.okSampleId,
    workshop_fabric_batch: `E2E-半制品批-${stamp}`,
    dye_batch_no: `E2E-染料批-${stamp}`,
    adjusted_formula: '加成 5 percent',
    adjustment_factor: '1.05',
    adjusted_temperature: '62.00',
    adjusted_time_minutes: 50,
    adjusted_liquor_ratio: '1:8',
    remarks: `E2E复样${stamp}`,
  });

  expect(num(created.request_id), `[${tag}] request_id 应回落建单提交值`).toBe(seed.requestId);
  expect(num(created.source_sample_id), `[${tag}] source_sample_id 应回落 OK 样主键`).toBe(
    seed.okSampleId
  );
  expect(
    str(created.resample_no).startsWith('RS-'),
    `[${tag}] 复样单号应以 RS 前缀，实际 ${str(created.resample_no)}`
  ).toBe(true);
  expect(created.workshop_fabric_batch, `[${tag}] 车间半制品布批号应原样落库`).toBe(
    `E2E-半制品批-${stamp}`
  );
  expect(created.dye_batch_no, `[${tag}] 染料批号应原样落库`).toBe(`E2E-染料批-${stamp}`);
  expect(num(created.adjustment_factor), `[${tag}] 加成系数应落库 1.05`).toBe(1.05);
  expect(num(created.adjusted_temperature), `[${tag}] 调整后温度应落库 62`).toBe(62);
  expect(num(created.adjusted_time_minutes), `[${tag}] 调整后时间应落库 50`).toBe(50);
  expect(created.adjusted_liquor_ratio, `[${tag}] 调整后浴比应落库 1:8`).toBe('1:8');
  expect(
    created.result,
    `[${tag}] 新建复样 result 初值应为词表 pending，实际 ${str(created.result)}`
  ).toBe('pending');
});

test('511-02 车间半制品布批号缺席应被门拒绝', async ({ page }) => {
  const tag = '511-02';
  const stamp = `${String(Date.now()).slice(-6)}B`;
  const seed = await seedApprovedRequestWithSelectedSample(page, stamp);

  const fail = await apiCallExpectFail(page, 'POST', `${LIP}/resamples`, {
    request_id: seed.requestId,
    source_sample_id: seed.okSampleId,
  });
  expectStateGateRejection(fail, `[${tag}] 车间半制品布批号必填门应拒绝`);

  const list = await apiCallRaw<Row[]>(
    page,
    'GET',
    `${LIP}/resamples/by-request/${seed.requestId}`
  );
  expect(Array.isArray(list), `[${tag}] 被拒后按通知单列举应仍是空数组`).toBe(true);
  expect(list.length, `[${tag}] 被拒后不得有复样行落库，实际 ${list.length}`).toBe(0);
});

test('511-03 通知单未 approved 建复样被状态门拒绝', async ({ page }) => {
  const tag = '511-03';
  const stamp = `${String(Date.now()).slice(-6)}C`;
  const seed = await seedApprovedRequestWithSelectedSample(page, stamp);

  const fail = await apiCallExpectFail(page, 'POST', `${LIP}/resamples`, {
    request_id: seed.requestId,
    source_sample_id: seed.notMatchedSampleId,
    workshop_fabric_batch: `E2E-批-${stamp}`,
  });
  expectStateGateRejection(fail, `[${tag}] 源样非 selected 不可复样，应被门拒绝`);
});

test('511-04 详情按 id 回读与悬空 404 形状', async ({ page }) => {
  const tag = '511-04';
  const stamp = `${String(Date.now()).slice(-6)}D`;
  const seed = await seedApprovedRequestWithSelectedSample(page, stamp);
  const created = await apiCallRaw<Row>(page, 'POST', `${LIP}/resamples`, {
    request_id: seed.requestId,
    source_sample_id: seed.okSampleId,
    workshop_fabric_batch: `E2E-批-${stamp}`,
  });
  const id = num(created.id);

  const detail = await apiCallRaw<Row>(page, 'GET', `${LIP}/resamples/${id}`);
  expect(num(detail.id), `[${tag}] 详情应回落同主键`).toBe(id);
  expect(detail.workshop_fabric_batch, `[${tag}] 详情应回落车间批号`).toBe(`E2E-批-${stamp}`);

  const dangling = 999999999;
  const fail = await apiCallExpectFail(page, 'GET', `${LIP}/resamples/${dangling}`);
  expectStateGateRejection(fail, `[${tag}] 悬空 id 详情应 404`);
});

test('511-05 录结果 5 级判 passed 并锁重录', async ({ page }) => {
  const tag = '511-05';
  const stamp = `${String(Date.now()).slice(-6)}E`;
  const seed = await seedApprovedRequestWithSelectedSample(page, stamp);
  const created = await apiCallRaw<Row>(page, 'POST', `${LIP}/resamples`, {
    request_id: seed.requestId,
    source_sample_id: seed.okSampleId,
    workshop_fabric_batch: `E2E-批-${stamp}`,
  });
  const id = num(created.id);

  const recorded = await apiCallRaw<Row>(page, 'POST', `${LIP}/resamples/${id}/result`, {
    color_difference_grade: 5,
    color_difference_value: '0.80',
    review_comment: `达 4-5 级可投产${stamp}`,
  });
  expect(recorded.result, `[${tag}] 色差 5 级应判词表 passed，实际 ${str(recorded.result)}`).toBe(
    'passed'
  );
  expect(num(recorded.color_difference_grade), `[${tag}] 色差等级应落库 5`).toBe(5);
  expect(num(recorded.color_difference_value), `[${tag}] ΔE 应落库 0.80`).toBe(0.8);
  expect(recorded.reviewed_by, `[${tag}] 复核人应取会话身份而非请求体`).not.toBeNull();
  expect(str(recorded.review_comment), `[${tag}] 审核意见应原样落库`).toBe(
    `达 4-5 级可投产${stamp}`
  );

  const again = await apiCallExpectFail(page, 'POST', `${LIP}/resamples/${id}/result`, {
    color_difference_grade: 2,
  });
  expectStateGateRejection(again, `[${tag}] 复样结果非 pending 不可重复记录`);
});

test('511-06 录结果 3 级判 failed 且技术卡被通过门拒绝', async ({ page }) => {
  const tag = '511-06';
  const stamp = `${String(Date.now()).slice(-6)}F`;
  const seed = await seedApprovedRequestWithSelectedSample(page, stamp);
  const created = await apiCallRaw<Row>(page, 'POST', `${LIP}/resamples`, {
    request_id: seed.requestId,
    source_sample_id: seed.okSampleId,
    workshop_fabric_batch: `E2E-批-${stamp}`,
  });
  const id = num(created.id);

  const recorded = await apiCallRaw<Row>(page, 'POST', `${LIP}/resamples/${id}/result`, {
    color_difference_grade: 3,
    color_difference_value: '4.50',
    review_comment: '色差不足需调整重打',
  });
  expect(recorded.result, `[${tag}] 色差 3 级应判词表 failed，实际 ${str(recorded.result)}`).toBe(
    'failed'
  );

  const fail = await apiCallExpectFail(page, 'POST', `${LIP}/resamples/${id}/tech-card`);
  expectStateGateRejection(fail, `[${tag}] 复样未 passed 不可开染色技术卡`);
  expect(
    str((await apiCallRaw<Row>(page, 'GET', `${LIP}/resamples/${id}`)).tech_card_no),
    `[${tag}] 被拒后技术卡号应仍为空`
  ).toBe('');
});

test('511-07 复样 passed 后开染色技术卡且重复开卡被拒', async ({ page }) => {
  const tag = '511-07';
  const stamp = `${String(Date.now()).slice(-6)}G`;
  const seed = await seedApprovedRequestWithSelectedSample(page, stamp);
  const created = await apiCallRaw<Row>(page, 'POST', `${LIP}/resamples`, {
    request_id: seed.requestId,
    source_sample_id: seed.okSampleId,
    workshop_fabric_batch: `E2E-批-${stamp}`,
  });
  const id = num(created.id);
  await apiCallRaw<Row>(page, 'POST', `${LIP}/resamples/${id}/result`, {
    color_difference_grade: 5,
    color_difference_value: '0.80',
  });

  const issued = await apiCallRaw<Row>(page, 'POST', `${LIP}/resamples/${id}/tech-card`);
  const cardNo = str(issued.tech_card_no);
  expect(
    cardNo.length > 0,
    `[${tag}] 开卡后技术卡号应落库，实际 ${JSON.stringify(issued.tech_card_no)}`
  ).toBe(true);
  expect(issued.tech_card_issued_by, `[${tag}] 开卡人应取会话身份`).not.toBeNull();

  const again = await apiCallExpectFail(page, 'POST', `${LIP}/resamples/${id}/tech-card`);
  expectStateGateRejection(again, `[${tag}] 技术卡不可重复开`);
  expect(
    str((await apiCallRaw<Row>(page, 'GET', `${LIP}/resamples/${id}`)).tech_card_no),
    `[${tag}] 重复开卡被拒后卡号不变`
  ).toBe(cardNo);
});

test('511-08 按通知单列举含全部自建复样与悬空请求空数组', async ({ page }) => {
  const tag = '511-08';
  const stamp = `${String(Date.now()).slice(-6)}H`;
  const seed = await seedApprovedRequestWithSelectedSample(page, stamp);
  const first = await apiCallRaw<Row>(page, 'POST', `${LIP}/resamples`, {
    request_id: seed.requestId,
    source_sample_id: seed.okSampleId,
    workshop_fabric_batch: `E2E-批一-${stamp}`,
  });
  const second = await apiCallRaw<Row>(page, 'POST', `${LIP}/resamples`, {
    request_id: seed.requestId,
    source_sample_id: seed.okSampleId,
    workshop_fabric_batch: `E2E-批二-${stamp}`,
  });

  const list = await apiCallRaw<Row[]>(
    page,
    'GET',
    `${LIP}/resamples/by-request/${seed.requestId}`
  );
  expect(list.length, `[${tag}] 同单两枚复样都应被列举，实际 ${list.length}`).toBe(2);
  const ids = list.map(r => num(r.id));
  expect(
    ids.includes(num(first.id)) && ids.includes(num(second.id)),
    `[${tag}] 列举应含两枚自建主键，实际 ${JSON.stringify(ids)}`
  ).toBe(true);

  const danglingRequest = 999999999;
  const empty = await apiCallRaw<Row[]>(
    page,
    'GET',
    `${LIP}/resamples/by-request/${danglingRequest}`
  );
  expect(empty.length, `[${tag}] 悬空通知单列举应空数组`).toBe(0);
});
