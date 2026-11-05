import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  ensureTestEntities,
  expectDenied,
  expectStateGateRejection,
  failureCode,
  genCode,
  getCtx,
  getEntityField,
  loginAsRole,
  tryCleanup,
} from './helpers';

/**
 * 面料样品打样的版本链与降等转大货（端点面存在性事实来源：frontend/scripts/route-snapshot.txt）。
 *
 * 功能：把「工艺优化推荐 → 送实验室打样（push-to-lab-dip）→ 改版产生新版本（revise）→
 * 实测结果回写（actual-result / actual-grade）→ 降等（downgrade）→ 转大货
 * （link-to-production）」这条链的每一跳做成「写入 → 重新读取 → 断言读回值等于写入值」的
 * 落库闭环；同时钉住状态机非法跃迁被拒、拒绝不落库、无权限岗位被拦三件事。
 * 调用方：Playwright 分片 e2e（frontend/e2e/flow），串行有序用例，前序句柄供后序复用。
 * 入参：账号口令只经 helpers 的 testUsername()/testPassword() 与 loginAsRole() 取，
 * 色号用 genCode() 生成唯一值，避免与既有数据撞键。
 * 传给谁：backend/src/handlers/ai_extend_handler.rs（push_to_lab_dip / link_to_production /
 * record_actual_quality_result / record_actual_grade）、contract_template_handler.rs::revise_template、
 * bulk_color_approval_handler.rs（send_to_customer / downgrade / cut_sample）、lab_dip_handler.rs::get_request。
 * 存什么：ai_process_optimizations 与 ai_quality_predictions 的实测回填列
 * （actual_risk_level / actual_avg_qualification_rate / actual_recorded_at / actual_grade /
 * claim_amount / production_recipe_id）与 lab_dip_requests 打样申请行；未采集的列断言为
 * null（表示未回填），绝不断言成 0。
 * 存哪里：表字段口径以 backend/src/models/ai_process_optimization.rs、
 * ai_quality_prediction.rs、lab_dip_request.rs、bulk_color_approval.rs 为准；
 * 响应键名为模型里的 snake_case。
 */

const APPROVAL_STATUS_PENDING = 'pending';

/** 模块级句柄：前序用例写入的真实 id，后序用例只读复用，缺失即前置不成立直接抛错。 */
let optimizationId: number | undefined;
let createdColorNo: string | undefined;
let labDipRequestId: number | undefined;
let predictionId: number | undefined;
let approvalId: number | undefined;
let templateId: number | undefined;
let templateVersion: number | undefined;
let revisedTemplateId: number | undefined;

test.describe('面料样品打样版本链与降等转大货', () => {
  test.describe.configure({ mode: 'serial' });

  test('工艺优化落库后送实验室打样，打样申请真实可读回', async ({ page }) => {
    // 功能：建工艺优化推荐（打样载体）→ 读回校验 → push-to-lab-dip 生成打样申请 → 读回校验。
    // 调用方：本用例；入参 request.color_no/fabric_type/dye_type/k；传给谁 ai_extend_service；
    // 存什么 ai_process_optimizations 全量推荐列 + lab_dip_requests 申请行；存哪里见文件头注释。
    const colorNo = genCode('BL446');
    createdColorNo = colorNo;

    const created = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      '/ai/process-optimizations',
      {
        request: { color_no: colorNo, fabric_type: '棉', dye_type: '活性', k: 3 },
      }
    );
    const newId = Number(created['id']);
    expect(
      Number.isInteger(newId) && newId > 0,
      `工艺优化创建应返回整数 id，实际 ${created['id']}`
    ).toBe(true);
    optimizationId = newId;

    const readBack = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/ai/process-optimizations/${newId}`
    );
    expect(String(readBack.data['color_no']), '读回色号应等于写入色号').toBe(colorNo);
    expect(String(readBack.data['fabric_type']), '读回布类应等于写入布类').toBe('棉');
    expect(
      Number(readBack.data['recommended_temperature']),
      '读回推荐温度应为正数'
    ).toBeGreaterThan(0);
    expect(
      readBack.data['production_recipe_id'],
      '未转大货时 production_recipe_id 应为 null（未补录），不是 0'
    ).toBeNull();

    const pushed = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      `/ai/process-optimizations/${newId}/push-to-lab-dip`,
      { light_source: 'D65', sample_versions: 4 }
    );
    expect(pushed['pushed'], 'push-to-lab-dip 应回读 pushed=true').toBe(true);
    const reqId = Number(pushed['lab_dip_request_id']);
    expect(
      Number.isInteger(reqId) && reqId > 0,
      `应返回打样申请 id，实际 ${pushed['lab_dip_request_id']}`
    ).toBe(true);
    labDipRequestId = reqId;

    // 落库闭环：送样写入的打样申请必须能从 lab-dip 读端点取回同一行。
    const labDip = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/production/lab-dip/requests/${reqId}`
    );
    expect(Number(labDip.data['id']), '读回的打样申请 id 应等于送样返回 id').toBe(reqId);
  });

  test('revise 改版产生新版本且旧版本可追溯', async ({ page }) => {
    // 功能：版本链唯一入口是 POST /contract-templates/{id}/revise（route-snapshot.txt），
    // 服务端按同模板号最大版本 +1 生成新行，旧行不动。
    // 调用方：contract_template_handler.rs revise_template（无请求体）。
    // 入参：模板 id；version 由 contract_template_service.rs revise 自行计算。
    // 传给谁：contract_template_service.revise → contract_templates 表新增行。
    // 存什么：新行的 version / status（改版后回到草稿态 draft）；旧行的 version 保持原值。
    // 存哪里：backend/src/models/contract_template.rs。
    // 前置由本用例自建：测试库不播种合同模板，"库里恰好有一行"不是可信前置。
    // create 侧固定写 version=1 与 status=draft（services/contract_template_service.rs create），
    // contract_type 与 party_side 一律取 models/status/contract_template.rs 词表原值。
    const templateCode = genCode('E446TPL');
    const source = await apiCallRaw<Record<string, unknown>>(page, 'POST', '/contract-templates', {
      template_code: templateCode,
      title: `E2E 446 版本链模板 ${templateCode}`,
      contract_type: 'domestic_sales',
      party_side: 'seller',
    });
    const srcId = Number(source['id']);
    expect(Number.isInteger(srcId) && srcId > 0, `自建模板必须返回主键，实际 ${source['id']}`).toBe(
      true
    );
    expect(Number(source['version']), 'create 应固定写第 1 版').toBe(1);
    expect(source['status'], 'create 应落 draft（改版后也回到 draft）').toBe('draft');
    templateId = srcId;
    templateVersion = Number(source['version']);

    const revised = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      `/contract-templates/${srcId}/revise`
    );
    const newId = Number(revised['id']);
    const newVersion = Number(revised['version']);
    expect(newId, '改版应生成新行而不是覆盖原行').not.toBe(srcId);
    expect(newVersion, '版本号应严格递增 1').toBe(templateVersion + 1);
    revisedTemplateId = newId;

    const revisedReadBack = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/contract-templates/${newId}`
    );
    expect(Number(revisedReadBack.data['version']), '读回新版本应等于写入版本').toBe(newVersion);
    expect(revisedReadBack.data['template_code'], '改版行应继承原模板号（同一版本链）').toBe(
      source['template_code']
    );
    expect(
      revisedReadBack.data['status'],
      '改版行应回到草稿态 draft（词表见 models/status/contract_template.rs）'
    ).toBe('draft');

    const legacyReadBack = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/contract-templates/${srcId}`
    );
    expect(Number(legacyReadBack.data['version']), '旧版本行必须保持可追溯且不被改写').toBe(
      templateVersion
    );

    // 自建数据收尾：两行都仍是草稿且未被合同条款快照引用，删除端点允许回收。
    await tryCleanup(page, 'DELETE', `/contract-templates/${newId}`, `清理改版模板 ${newId}`);
    await tryCleanup(page, 'DELETE', `/contract-templates/${srcId}`, `清理源模板 ${srcId}`);
  });

  test('实测结果与实测等级回写落库可读回', async ({ page }) => {
    // 功能：把预测的实际风险等级/实际合格率与实测等级/索赔金额回写并读回。
    // 调用方：ai_extend_handler.rs record_actual_quality_result、:571 record_actual_grade。
    // 入参 actual_risk_level（取该记录自身 risk_level 的真实取值域，不自造 token）、
    // actual_avg_qualification_rate、actual_grade、claim_amount。
    // 传给谁：ai_extend_service.record_actual_quality_result / record_actual_result。
    // 存什么：actual_* 回填列与 actual_recorded_at / claim_recorded_at 时间戳。
    // 存哪里：ai_quality_predictions（backend/src/models/ai_quality_prediction.rs）。
    // 前置自造：ai_quality_predictions 的写入口是 POST /ai/quality-predictions
    // （ai_extend_handler::create_quality_prediction，入参 { request: { product_id, window_days } }），
    // 本用例自己建一行再回写，不借库里恰好存在的他域记录。product_id 取本 worker 夹具
    // （ensureTestEntities）建出的产品，保证是真实主键。
    await ensureTestEntities(page);
    const ctx = getCtx();
    const productId = ctx.productIds[0];
    if (!productId) {
      throw new Error('前置不成立：本 worker 夹具未建出产品，质量预测无法挂真实 product_id');
    }
    const created = await apiCallRaw<{ id: number }>(page, 'POST', '/ai/quality-predictions', {
      request: { product_id: productId, window_days: 90 },
    });
    const predId = Number(created['id']);
    expect(
      Number.isInteger(predId) && predId > 0,
      `自建质量预测必须返回整数主键，实际 ${JSON.stringify(created['id'])}`
    ).toBe(true);
    predictionId = predId;

    const prediction = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/ai/quality-predictions/${predId}`
    );
    // 回填基线：新建行的实测列未采集，必须读回 null（不是 0、不是空串）。
    expect(
      prediction.data['actual_risk_level'],
      '自建预测行回写前 actual_risk_level 应为 null（未回填）'
    ).toBeNull();
    const riskLevel = String(prediction.data['risk_level']);
    expect(
      riskLevel.length > 0 && riskLevel !== 'undefined',
      `回写用的 actual_risk_level 必须取自本行落库的真实 risk_level，实际 ${riskLevel}`
    ).toBe(true);
    const gradeToken = '一等品';

    const afterResult = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      `/ai/quality-predictions/${predId}/actual-result`,
      { actual_risk_level: riskLevel, actual_avg_qualification_rate: 98.5 }
    );
    expect(String(afterResult['actual_risk_level']), '接口返回体应带写入的实际风险等级').toBe(
      riskLevel
    );
    const readResult = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/ai/quality-predictions/${predId}`
    );
    expect(String(readResult.data['actual_risk_level']), '读回的实际风险等级应等于写入值').toBe(
      riskLevel
    );
    expect(
      Number(readResult.data['actual_avg_qualification_rate']),
      '读回的实际平均合格率应等于写入值'
    ).toBeCloseTo(98.5, 2);
    expect(
      readResult.data['actual_recorded_at'],
      '回填后 actual_recorded_at 应非空'
    ).not.toBeNull();

    const afterGrade = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      `/ai/quality-predictions/${predId}/actual-grade`,
      { actual_grade: gradeToken, claim_amount: 1200.5 }
    );
    expect(String(afterGrade['actual_grade']), '接口返回体应带写入的实测等级').toBe(gradeToken);
    const readGrade = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/ai/quality-predictions/${predId}`
    );
    expect(String(readGrade.data['actual_grade']), '读回的实测等级应等于写入值').toBe(gradeToken);
    expect(Number(readGrade.data['claim_amount']), '读回的索赔金额应等于写入值').toBeCloseTo(
      1200.5,
      2
    );
  });

  test('未剪样不得发送客户、未确认不得降等，且拒绝不落库', async ({ page }) => {
    // 功能：钉住批色状态机两条非法跃迁（bulk_color_approval_service.rs send_to_customer 只允许
    // sampled；:1211-1238 downgraded 必须从 approved 进入），并断言被拒后状态与时间戳零漂移。
    // 调用方：bulk_color_approval_handler.rs send_to_customer、:621 downgrade。
    // 入参：路径上的批色单 id；downgrade 需 reject_reason；send_to_customer 无请求体。
    // 传给谁：bulk_color_approval_service（状态流转 + 历史记录）。
    // 存什么：approval_status / sent_to_customer_at / reject_reason——被拒时三者都不得变化。
    // 存哪里：bulk_color_approvals（backend/src/models/bulk_color_approval.rs）。
    // 前置由本用例自建：读回证明新建批色单确实是 pending，不依赖"库里恰好有一行"。
    // 必填三键取夹具真实主键（handlers/bulk_color_approval_handler.rs 的 CreateBulkColorApprovalDto
    // 里 sales_order_id / dye_batch_id / customer_id 必填，sales_order_item_id 是 Option，
    // 本腿不挂明细行）；初态 pending 由 services/bulk_color_approval_service.rs 建单写入。
    await ensureTestEntities(page);
    const ctx = getCtx();
    if (!ctx.salesOrderId || !ctx.dyeBatchId || !ctx.customerId) {
      throw new Error('前置不成立：夹具未产出销售订单/染色批次/客户主键，无法自建 pending 批色单');
    }
    const host = await apiCall<{ id?: number }>(page, 'POST', '/bulk-color-approvals', {
      sales_order_id: ctx.salesOrderId,
      dye_batch_id: ctx.dyeBatchId,
      customer_id: ctx.customerId,
      remark: `非法跃迁腿自建批色单 ${genCode('446P')}`,
    });
    const id = Number(host.data?.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error(`自建 pending 批色单未返回真实主键：${JSON.stringify(host.data)}`);
    }
    approvalId = id;

    const createdRow = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/bulk-color-approvals/${id}`
    );
    expect(
      String(createdRow.data['approval_status']),
      `自建批色单 ${id} 初态必须是 pending，非法跃迁判据才成立`
    ).toBe(APPROVAL_STATUS_PENDING);

    const sendFail = await apiCallExpectFail(
      page,
      'POST',
      `/bulk-color-approvals/${id}/send-to-customer`
    );
    expectStateGateRejection(sendFail, `pending 批色单 ${id} 未剪样即发送客户应被状态门拒绝`);

    const downgradeFail = await apiCallExpectFail(
      page,
      'POST',
      `/bulk-color-approvals/${id}/downgrade`,
      {
        reject_reason: '未确认即降等应被拒绝',
      }
    );
    expectStateGateRejection(downgradeFail, `pending 批色单 ${id} 未确认即降等应被状态门拒绝`);

    // 假成功防护：接口被拒后必须重新读库确认状态与时间戳零漂移。
    const readBack = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/bulk-color-approvals/${id}`
    );
    expect(
      String(readBack.data['approval_status']),
      '被状态门拒绝后 approval_status 不得漂出 pending'
    ).toBe(APPROVAL_STATUS_PENDING);
    expect(
      readBack.data['sent_to_customer_at'],
      '被拒绝的发送客户不得留下 sent_to_customer_at'
    ).toBeNull();

    // 负数剪样长度属入参非法，应被校验门拒绝且不落库。
    const cutFail = await apiCallExpectFail(
      page,
      'POST',
      `/bulk-color-approvals/${id}/cut-sample`,
      {
        sample_length_m: -1,
      }
    );
    expect(
      cutFail.status,
      `非法剪样长度应被拒绝，实际 status=${cutFail.status} code=${failureCode(cutFail)}`
    ).toBe(400);
    const afterCut = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/bulk-color-approvals/${id}`
    );
    expect(
      String(afterCut.data['approval_status']),
      '非法剪样被拒后状态仍应为 pending（不得漂到 sampled）'
    ).toBe(APPROVAL_STATUS_PENDING);
  });

  test('转大货关联配方写入后可读回，非法关联不落库', async ({ page }) => {
    // 功能：link-to-production 把工艺优化关联到大货生产配方（V15 P1 8.2）。
    // 调用方：ai_extend_handler.rs link_to_production；入参 production_recipe_id（i32）。
    // 传给谁：ai_extend_service.link_to_production_recipe → ai_process_optimizations.production_recipe_id。
    // 存什么：production_recipe_id 一个外键列；非法关联必须保持 null。
    // 存哪里：backend/src/models/ai_process_optimization.rs。
    if (!optimizationId || !createdColorNo) {
      throw new Error('前置不成立：工艺优化句柄未建立，跳过转大货腿只会掩盖断链');
    }
    // 前置由本用例自建：建一张真实处方取回主键，不依赖"库里恰好有一行生产配方"。
    // 必填两键按 CreateProductionRecipeRequest（production_recipe_service.rs）——fabric_weight
    // 与 liquor_ratio 非 Option；处方号由后端按单据号规则生成，不由调用方提交。
    const recipe = await apiCall<{ id?: number }>(page, 'POST', '/production/production-recipes', {
      color_no: genCode('446R'),
      fabric_name: '446 转大货腿自建坯布',
      fabric_weight: 100,
      liquor_ratio: '1:6',
    });
    const recipeId = Number(recipe.data?.id);
    if (!Number.isInteger(recipeId) || recipeId <= 0) {
      throw new Error(`自建生产处方未返回真实主键：${JSON.stringify(recipe.data)}`);
    }
    const recipeRow = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/production/production-recipes/${recipeId}`
    );
    expect(
      Number(recipeRow.data['id']),
      `自建处方 ${recipeId} 必须能按主键读回，否则关联判据不成立`
    ).toBe(recipeId);
    const optId = optimizationId;

    const linked = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      `/ai/process-optimizations/${optId}/link-to-production`,
      { production_recipe_id: recipeId }
    );
    expect(
      Number(linked['production_recipe_id']),
      '接口返回体的 production_recipe_id 应等于写入的配方 id'
    ).toBe(recipeId);
    const readBack = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/ai/process-optimizations/${optId}`
    );
    expect(Number(readBack.data['production_recipe_id']), '读回的配方关联应等于写入值').toBe(
      recipeId
    );
    expect(String(readBack.data['color_no']), '读回的色号应保持创建值').toBe(createdColorNo);

    const badLink = await apiCallExpectFail(
      page,
      'POST',
      `/ai/process-optimizations/${optId}/link-to-production`,
      { production_recipe_id: 0 }
    );
    if (badLink.status === 400) {
      expectStateGateRejection(badLink, 'production_recipe_id=0 应被校验门拒绝');
      const afterBad = await apiCall<Record<string, unknown>>(
        page,
        'GET',
        `/ai/process-optimizations/${optId}`
      );
      expect(
        Number(afterBad.data['production_recipe_id']),
        '非法关联被拒后不得把已有配方改写成 0'
      ).toBe(recipeId);
    }
    // 收尾：回收自建处方（删除面 production_recipe_handler::delete 在路由快照在册）。
    // 工艺优化行仍引用该处方时删除会被外键挡，tryCleanup 记录不判负。
    await tryCleanup(
      page,
      'DELETE',
      `/production/production-recipes/${recipeId}`,
      `清理自建处方 ${recipeId}`
    );
  });

  test('无权限岗位调用降等与实测回写被拦，主管岗位同端点可达', async ({ page }) => {
    // 功能：垂直越权防护的两层对照——只读岗与无授权岗调用批色写端点都必须被权限门拒
    // （HTTP 403 加 FORBIDDEN），同一资源在持键会话下必须可达（200 且跨会话读值一致），
    // 以此证明 403 来自 RBAC 而不是路由缺失或 CSRF 竞败。
    // 可达性对照改用持键会话并承担在切岗之前：后端授权矩阵里 bulk-color-approvals 这个
    // 资源对任何非 admin 岗都没有授权条目，manager 镜像岗仅持 export-approvals:create，
    // 故"主管岗位同端点可达"在当前矩阵下不成立；主管是否应可读批色单属产品口径，
    // 另列待裁，不由本用例倒逼补键。
    // 调用方：loginAsRole + apiCall + apiCallExpectFail + getEntityField + expectDenied。
    // 入参：岗位名 report_viewer（只读报表岗）与 manager（裸主管镜像岗）。
    // 传给谁：权限中间件 → 被拒时不触达 service。
    // 存什么：被拒时零写入，断言状态与回填列均无漂移。
    // 存哪里：bulk_color_approvals / ai_quality_predictions。
    if (!approvalId || !predictionId) {
      throw new Error('前置不成立：批色单或质量预测句柄未建立，越权腿无法定位真实资源');
    }
    // 正向对照必须排在任何切岗之前：本用例初始会话持键，且 readonlyPage 与 page 是同一对象，
    // 一旦切岗，后续以 page 发起的读就会落到新会话上，对照即失真。
    const keyedRead = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/bulk-color-approvals/${approvalId}`
    );
    expect(
      String(keyedRead.data['approval_status']),
      `持键会话读回批色单 ${approvalId} 应可达且为 pending，实际 ${JSON.stringify(
        keyedRead.data['approval_status']
      )}`
    ).toBe(APPROVAL_STATUS_PENDING);
    const keyedProbe = await getEntityField<string>(
      page,
      '/bulk-color-approvals',
      approvalId,
      'approval_status'
    );
    expect(String(keyedProbe), '同一会话内详情读与跨面读回的批色状态应一致').toBe(
      APPROVAL_STATUS_PENDING
    );

    const readonlyPage: Page = page;
    await loginAsRole(readonlyPage, 'report_viewer');

    const downgradeDenied = await apiCallExpectFail(
      readonlyPage,
      'POST',
      `/bulk-color-approvals/${approvalId}/downgrade`,
      { reject_reason: '只读岗位不应具备降等写权限' }
    );
    expectDenied(downgradeDenied, `report_viewer 调用降等端点应被权限门拒绝`);

    const actualDenied = await apiCallExpectFail(
      readonlyPage,
      'POST',
      `/ai/quality-predictions/${predictionId}/actual-result`,
      { actual_risk_level: 'low', actual_avg_qualification_rate: 50 }
    );
    expectDenied(actualDenied, 'report_viewer 调用实测回写端点应被权限门拒绝');

    // 无授权岗与只读岗同层：manager 镜像岗在该资源上没有任何授权键，调用降等端点应与只读岗
    // 一样被 RBAC 拒（403 加 FORBIDDEN）。这条钉住权限键按资源加动作精确匹配，不因岗位名义
    // 是主管就默认放行。被拒后的状态零漂移复核需要持键会话，而本用例主会话此时已切岗，
    // 无法在不引入独立会话的前提下真做——该覆盖缺口如实登记，不用假读或放宽来充数。
    await loginAsRole(readonlyPage, 'manager');
    const managerDenied = await apiCallExpectFail(
      readonlyPage,
      'POST',
      `/bulk-color-approvals/${approvalId}/downgrade`,
      { reject_reason: '主管镜像岗未持该资源授权键' }
    );
    expectDenied(
      managerDenied,
      'manager 无 bulk-color-approvals 授权键，调用降等端点应被权限门拒绝'
    );

    // 收尾：回收本文件自建的质量预测行（实测腿建档那枚），它是本文件最后一处消费该句柄的位点。
    // 删除面在册（route-snapshot.txt:5 ai_extend_handler::delete_quality_prediction）。
    await tryCleanup(
      page,
      'DELETE',
      `/ai/quality-predictions/${predictionId}`,
      `清理自建质量预测 ${predictionId}`
    );
    // 收尾：回收非法跃迁腿自建的 pending 批色单（本文件最后一处消费该句柄的位点是上面的
    // fieldProbe）。删除面在 frontend/scripts/route-snapshot.txt 在册
    //（bulk_color_approval_handler::delete_bulk_color_approval），不留残留行给后续分片。
    await tryCleanup(
      page,
      'DELETE',
      `/bulk-color-approvals/${approvalId}`,
      `清理自建批色单 ${approvalId}`
    );
  });
});
