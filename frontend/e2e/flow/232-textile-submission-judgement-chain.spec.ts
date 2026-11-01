/**
 * 纺织品安全送检单：送检到判定的全流程跃迁与完整性门与三态判定
 *
 * 功能：两枚同品种不同批次单据把送检流程腿走穿并钉死每一档跃迁判据——
 * 一，合格链（B 类）：草稿态非法跃迁逐一被拦（draft 直推 judged 与 reported 被状态机白名单拒并
 *    点名产出通道，draft 无清单推 sampling 被拦，judgement 在非 reported 态被拦点名"只从已收报告态推进"），
 *    推清单进入待取样 已送检（sent 联动回显零批次时 matched 0 且 scope_note 点名未登记，不静默），
 *    登记缺要素报告（受理态恒 pending 且 sent 自动推进 reported），完整性门先落 rejected
 *    并逐条点名缺项（cma 与 cnas 与 material_composition），修正要素复位 pending 后过门落 accepted，
 *    逐项目结果按限值矩阵判出 pass 与 na 两态（甲醛 30 对 75 上限 pass，pH 7.0 对区间 pass，
 *    异味 none 对必须为无 pass，耐水等级 3 恰等于 B 类下限 3.0 为 pass 钉 gte 边界含等，
 *    芳香胺 15 与 none 双行合取 pass，耐唾液 B 类法定不考核出 na 不得折算合格），
 *    报告级判定先行在未受理时被拦点名"完整性门未放行"，整单判定产 pass 与 judged，
 *    judged 到 closed 正向跃迁后封账门拦修改与删除（错误消息点名可编辑态集与仅草稿可删），
 *    每一档跃迁后按接口回读库里真值；
 * 二，不合格链（C 类）：另一身份质检员把甲醛 350 越 300 上限的实测判出 fail，整单结论 fail，
 *    回读钉住单据状态与逐行 verdict 与采信面（唯一采信本链报告，排除集为空）；
 * 三，结果录入侧的旁路拒绝：清单外项目编码（LEAD 属童装加考组不入成人单清单）被点名拒绝，
 *    等级 token 越词表（"9"）被点名拒绝，证明录入面白名单不是摆设。
 *
 * 调用方：Playwright E2E 套件，由 CI 的 e2e flow 分片按文件哈希收集执行。
 * 入参：API_BASE 与 BASE_URL 取环境变量；角色凭证取 env 优先、回退 e2e/.auth/role-credentials.json；
 *      被测端点为 POST /textile-submissions 与 PUT /{id} 与 /{id}/status 与 /{id}/items 与 /{id}/judgement、
 *      POST /textile-reports 与 PUT /{id} 与 /{id}/acceptance 与 /{id}/results 与 /{id}/judgement、
 *      GET /textile-submissions/{id} 与 GET /textile-reports/{id}、
 *      GET /product-categories 与 POST /products（admin 腿自建品种）。
 * 传给谁：请求走 flow/helpers 的 apiCallRaw 与 apiCallExpectFail 与 expectStateGateRejection，
 *      会话与跨棒标识走 fixtures/relay；两腿分别用质量经理与质检员两个真身份执行。
 * 存什么：送检单 2 枚（一 judged→closed 一 judged）、第三方报告 2 份（均 accepted）、
 *      逐项目结果行 8 枚（pass 六枚含 na 一枚与 fail 一枚的逐 verdict 落库）、产品档案 1 枚。
 * 存哪里：PostgreSQL textile_safety_submission 与 textile_third_party_report 与
 *      textile_report_item_result 与 products 表。
 *
 * 【清理腿不可达声明（按判红口径不造规避）】
 * 本用例落库的两枚送检单终态 judged 与 closed：
 * - DELETE /textile-submissions/{id} 有仅草稿可删门（textile_safety_submission_service.rs delete_draft，
 *   非 draft 点名"已推进的单据请走撤回留痕"）；
 * - 状态机白名单（同文件 ALLOWED_TRANSITIONS）无 judged 或 closed 到 withdrawn 的通路，撤回只从
 *   draft sampling sent reported 进入；
 * - 报告与结果行对送检单与报告本体是 RESTRICT 与 CASCADE 挂链（m0110 建表外键口径），单据不可删则报告不可清。
 * 因此登记必败的假清理等于零，残留 2 单 2 报告 8 结果行 1 产品（产品被送检单外键 RESTRICT 锁死同不可回收）
 * 属已知不可回收面，交主编排裁定环境级回收。
 *
 * 【判据出处（文件名为准，行号随主干演进不写死）】
 * 状态机白名单与仅草稿删除门与可编辑态封账：backend/src/services/textile_safety_submission_service.rs；
 * 完整性门缺项点名与受理态复位与采信规则与有效期窗口：backend/src/services/textile_safety_report_service.rs
 *   （select_adopted_reports 与 validity_window_on 与 run_acceptance_gate）；
 * 三态判定与合取与边界含等（gte 3.0 对实测 3.0 判 pass）与 na 不折算：
 *   backend/src/services/textile_safety_limit_judge.rs 与其单元测试 lte_both_directions 与
 *   between_inclusive_bounds 与 saliva_b_is_statutory_na 与 azo_conjunction_needs_both_rows_satisfied；
 * 限值数字（甲醛 B 75 与 C 300，pH B 4.0~8.5，耐唾液 B 与 C 不考核，芳香胺禁用加 20 上限）：
 *   backend/migration/src/domain/textile_safety/m0112_seed_textile_safety_matrix.rs；
 * 等级 token 词表与半级编码：backend/src/models/status/textile_safety.rs 的 textile_fastness_grade。
 *
 * 【为什么整条链写成单个 test 且放在 serial 描述块里】
 * CI 分片按文件哈希分配，接力棒次不能跨文件；跨 test 会把接力句柄与会话拆到不同 worker，
 * 棒间传标识随之失真（与 233 同口径）。
 */
import { test, expect } from '../diagnose-fixture';
import {
  apiCallExpectFail,
  apiCallRaw,
  expectStateGateRejection,
  genCode,
} from './helpers';
import { createRelay } from '../fixtures/relay';

type Row = Record<string, unknown>;

/** 合格链申报要素（B 类最终产品，内销，成人直接接触） */
const CATEGORY_B = 'GB18401_B';
const CATEGORY_C = 'GB18401_C';
/** 检验依据原文形态（完整性门判格式：标准号加类别展示形态，词表 display_label 同源） */
const BASIS_B = 'GB 18401-2010 B类';
const BASIS_C = 'GB 18401-2010 C类';
/** 签发与有效期（ISO 日历日，签发今天，有效期 180 天后，窗口恒覆盖今日） */
const isoDay = (d: Date): string => d.toISOString().slice(0, 10);
const TODAY_ISO = isoDay(new Date());
const VALID_UNTIL_ISO = isoDay(new Date(Date.now() + 180 * 86_400_000));

test.describe.serial('纺织品安全：送检全流程跃迁、完整性门点名拒绝、三态判定与回读', () => {
  test('合格链走穿七档跃迁并逐值回读，不合格链另一身份产 fail，非法跃迁全部点名拒绝', async ({
    browser,
  }) => {
    const relay = await createRelay(browser);
    try {
      await relay.runSteps([
        {
          role: 'admin',
          label: '管理员建两链共用真实品种并回读建档状态',
          run: async ({ session }) => {
            const cats = await apiCallRaw<{ items?: Row[] }>(
              session.page,
              'GET',
              '/product-categories'
            );
            const categoryId = Number(cats?.items?.[0]?.id);
            expect(
              Number.isFinite(categoryId) && categoryId > 0,
              `必须取到已种产品分类作建档来源，实际=${JSON.stringify(cats?.items?.[0])?.slice(0, 200)}`
            ).toBe(true);
            const productName = genCode('E2E-TS1-FABRIC');
            const created = await apiCallRaw<Row>(session.page, 'POST', '/products', {
              name: productName,
              category_id: categoryId,
              unit: '米',
              product_type: '辅料',
              status: 'active',
            });
            const productId = Number(created?.id);
            expect(
              Number.isFinite(productId) && productId > 0,
              `建档应返回主键，实际=${JSON.stringify(created)?.slice(0, 200)}`
            ).toBe(true);
            const back = await apiCallRaw<Row>(session.page, 'GET', `/products/${productId}`);
            expect(
              String(back?.name ?? ''),
              `按 id 回读品名应逐字符等于写入值 ${productName}，实际=${JSON.stringify(back?.name)}`
            ).toBe(productName);
            expect(
              String(back?.status ?? ''),
              `产品建档状态应落 active（products 无 created_by 列，会话注入面在送检单 created_by 钉，见 230），实际=${JSON.stringify(back?.status)}`
            ).toBe('active');
            return {
              artifacts: [
                { key: 'productId', value: productId },
                { key: 'productName', value: productName },
              ],
              // 清理位：产品被 judged 单外键 RESTRICT 锁死，登记回收只会在 close 时点名失败——
              // 按"不登记必败的假清理"口径不登记，残留见文件头不可达声明。
            };
          },
        },
        {
          role: 'qc_manager',
          label: '质量经理把合格链从草稿推到 closed 并逐档钉真值',
          run: async ({ session, require }) => {
            const productId = Number(require('productId'));
            const colorNo = genCode('E2E-TS1-COLOR');
            const processNo = genCode('E2E-TS1-PROC');

            const created = await apiCallRaw<Row>(session.page, 'POST', '/textile-submissions', {
              submission_no: genCode('E2E-TS1-PASS'),
              product_id: productId,
              color_no: colorNo,
              process_no: processNo,
              end_user_group: 'adult',
              contact_type: 'direct',
              safety_category: CATEGORY_B,
              product_form: 'final',
              target_market: 'dom',
              remarks: '合格链全流程专项单',
            });
            const submissionId = Number(created?.id);
            expect(
              Number.isFinite(submissionId) && submissionId > 0,
              `建单应返回主键，实际=${JSON.stringify(created)?.slice(0, 200)}`
            ).toBe(true);

            // 非法跃迁三连拦（全部 400 且点名产出通道或前置缺口，不静默不兜底）
            const jumpJudged = await apiCallExpectFail(
              session.page,
              'PUT',
              `/textile-submissions/${submissionId}/status`,
              { status: 'judged' }
            );
            expectStateGateRejection(jumpJudged, 'draft 直跳 judged 应被拦');
            expect(
              String(jumpJudged.message ?? '').includes('judged'),
              `拦截消息应点名 judged 由整单判定自动产出，实际 message=${JSON.stringify(jumpJudged.message)}`
            ).toBe(true);

            const jumpReported = await apiCallExpectFail(
              session.page,
              'PUT',
              `/textile-submissions/${submissionId}/status`,
              { status: 'reported' }
            );
            expectStateGateRejection(jumpReported, 'draft 直跳 reported 应被拦');
            expect(
              String(jumpReported.message ?? '').includes('reported'),
              `拦截消息应点名 reported 由报告登记自动产出，实际 message=${JSON.stringify(jumpReported.message)}`
            ).toBe(true);

            const earlyJudge = await apiCallExpectFail(
              session.page,
              'PUT',
              `/textile-submissions/${submissionId}/judgement`
            );
            expectStateGateRejection(earlyJudge, '未送检未收报告直接整单判合格应被拦');
            expect(
              String(earlyJudge.message ?? '').includes('只从已收报告态推进'),
              `拦截消息应点名"只从已收报告态推进"，实际 message=${JSON.stringify(earlyJudge.message)}`
            ).toBe(true);

            const earlySampling = await apiCallExpectFail(
              session.page,
              'PUT',
              `/textile-submissions/${submissionId}/status`,
              { status: 'sampling' }
            );
            expectStateGateRejection(earlySampling, '空清单进入待取样应被拦');
            expect(
              String(earlySampling.message ?? '').includes('尚未生成检测项目清单'),
              `拦截消息应点名"尚未生成检测项目清单"，实际 message=${JSON.stringify(earlySampling.message)}`
            ).toBe(true);

            // 正向推进：清单（内销成人档恒 false 缺口）→ sampling → sent（零批次联动点名）
            const generated = await apiCallRaw<{
              items: unknown[];
              scope_note: string;
              needs_attention: boolean;
            }>(session.page, 'POST', `/textile-submissions/${submissionId}/items`, {});
            expect(
              (generated?.items ?? []).length,
              `成人内销单应推出 GB18401 十枚清单，实际=${generated?.items?.length}`
            ).toBe(10);
            expect(
              generated?.needs_attention,
              `内销成人档无出口与童装缺口，needs_attention 应恰为 false，实际=${JSON.stringify(generated?.needs_attention)}`
            ).toBe(false);

            const toSampling = await apiCallRaw<{ submission: Row }>(
              session.page,
              'PUT',
              `/textile-submissions/${submissionId}/status`,
              { status: 'sampling' }
            );
            expect(
              String(toSampling?.submission?.status),
              `推清单后进入待取样应为 sampling，实际=${JSON.stringify(toSampling?.submission?.status)}`
            ).toBe('sampling');

            const toSent = await apiCallRaw<{ submission: Row; stock_link: Row }>(
              session.page,
              'PUT',
              `/textile-submissions/${submissionId}/status`,
              { status: 'sent' }
            );
            expect(
              String(toSent?.submission?.status),
              `推进送检应为 sent，实际=${JSON.stringify(toSent?.submission?.status)}`
            ).toBe('sent');
            expect(
              Number(toSent?.stock_link?.matched),
              `无批次号联动应命中 0 行库存（不静默假装挂起），实际=${JSON.stringify(toSent?.stock_link)}`
            ).toBe(0);
            expect(
              String((toSent?.stock_link as Row)?.scope_note ?? '').includes('未登记批次号'),
              `联动回显必须点名"未登记批次号"，实际=${JSON.stringify((toSent?.stock_link as Row)?.scope_note)}`
            ).toBe(true);

            // 登记缺要素报告（has_cma 与 has_cnas 双缺、缺材质成分）——受理态恒 pending，单据自动 reported
            const mkReportBody = (overrides: Row = {}): Row => ({
              report_no: genCode('E2E-TS1-RPT'),
              submission_id: submissionId,
              inspection_agency: 'E2E 第三方检测机构',
              has_cma: false,
              has_cnas: false,
              sample_name: '全棉针织汗布样品',
              material_composition: '100% 棉',
              color_no: colorNo,
              process_no: processNo,
              test_basis: BASIS_B,
              conclusion: '按 GB 18401-2010 B类判定，所检项目符合要求',
              issue_date: TODAY_ISO,
              valid_until: VALID_UNTIL_ISO,
              ...overrides,
            });
            const reportBody = mkReportBody({ material_composition: null });
            const report = await apiCallRaw<Row>(
              session.page,
              'POST',
              '/textile-reports',
              reportBody
            );
            const reportId = Number(report?.id);
            const reportNo = String(report?.report_no);
            expect(
              Number.isFinite(reportId) && reportId > 0,
              `报告登记应返回主键，实际=${JSON.stringify(report)?.slice(0, 200)}`
            ).toBe(true);
            expect(
              String(report?.acceptance_status),
              `新登记报告受理态必须恒 pending（请求体不可直填 accepted），实际=${JSON.stringify(report?.acceptance_status)}`
            ).toBe('pending');

            const afterRegister = await apiCallRaw<{ submission: Row }>(
              session.page,
              'GET',
              `/textile-submissions/${submissionId}`
            );
            expect(
              String(afterRegister?.submission?.status),
              `登记报告应把 sent 自动推进 reported，实际=${JSON.stringify(afterRegister?.submission?.status)}`
            ).toBe('reported');

            // 要素缺失的报告先过门——rejected 且缺项逐条点名（cma 与 cnas 双缺逐枚点名，材质成分点名）
            const gate1 = await apiCallRaw<{ report: Row; missing_elements: string[] }>(
              session.page,
              'PUT',
              `/textile-reports/${reportId}/acceptance`
            );
            expect(
              String(gate1?.report?.acceptance_status),
              `缺要素报告过门应落 rejected，实际=${JSON.stringify(gate1?.report?.acceptance_status)}`
            ).toBe('rejected');
            const missing = (gate1?.missing_elements ?? []).map(m => String(m));
            for (const code of ['cma', 'cnas', 'material_composition']) {
              expect(
                missing.includes(code),
                `完整性门缺项清单应点名 ${code}，实际=${JSON.stringify(missing)}`
              ).toBe(true);
            }
            expect(
              String(gate1?.report?.rejection_detail ?? '').includes('cma'),
              `落库 rejection_detail 应持久化点名串，实际=${JSON.stringify(gate1?.report?.rejection_detail)}`
            ).toBe(true);

            // 修正材质与资质位——受理态复位 pending（改后必须重新过门）
            const fixedReport = await apiCallRaw<Row>(
              session.page,
              'PUT',
              `/textile-reports/${reportId}`,
              mkReportBody({ has_cma: true })
            );
            expect(
              String(fixedReport?.acceptance_status),
              `修正要素后受理态应复位 pending，实际=${JSON.stringify(fixedReport?.acceptance_status)}`
            ).toBe('pending');

            // 逐项目实测结果（值 等级token flag 三路承载）；两枚录入负例先行点名拒绝
            const badGrade = await apiCallExpectFail(
              session.page,
              'POST',
              `/textile-reports/${reportId}/results`,
              { rows: [{ item_code: 'FAST_WATER', measured_token: '9' }] }
            );
            expectStateGateRejection(badGrade, '等级 token 越词表应被拒');
            expect(
              String(badGrade.message ?? '').includes('3-4'),
              `拒绝应点名等级取值域（含半级 3-4），实际 message=${JSON.stringify(badGrade.message)}`
            ).toBe(true);

            const offList = await apiCallExpectFail(
              session.page,
              'POST',
              `/textile-reports/${reportId}/results`,
              { rows: [{ item_code: 'LEAD', measured_value: 10 }] }
            );
            expectStateGateRejection(offList, '清单外项目录入应被拒');
            expect(
              String(offList.message ?? '').includes('不在该送检单清单内'),
              `拒绝应点名"不在该送检单清单内"，实际 message=${JSON.stringify(offList.message)}`
            ).toBe(true);

            const results = await apiCallRaw<Row[]>(
              session.page,
              'POST',
              `/textile-reports/${reportId}/results`,
              {
                rows: [
                  { item_code: 'HCHO', measured_value: 30, measured_unit: 'mg/kg' },
                  { item_code: 'PH', measured_value: 7.0 },
                  { item_code: 'ODOR', measured_text: 'none' },
                  { item_code: 'FAST_WATER', measured_token: '3' },
                  { item_code: 'AZO', measured_value: 15, measured_text: 'none' },
                  { item_code: 'FAST_SALIVA', measured_token: '4' },
                ],
              }
            );
            expect(
              (results ?? []).length,
              `六枚结果行应全部落库回显，实际=${JSON.stringify(results)?.slice(0, 200)}`
            ).toBe(6);
            expect(
              (results ?? []).every(r => String(r.verdict) === 'pending'),
              `新录入结果行应全部待判定（旧结论不得跨输入版本存活），实际=${JSON.stringify((results ?? []).map(r => r.verdict))}`
            ).toBe(true);

            // 报告级判定先行——未过受理门不得产结论
            const judgeBeforeAccept = await apiCallExpectFail(
              session.page,
              'PUT',
              `/textile-reports/${reportId}/judgement`
            );
            expectStateGateRejection(judgeBeforeAccept, '未受理报告直接判合格应被拦');
            expect(
              String(judgeBeforeAccept.message ?? '').includes('完整性门未放行'),
              `拦截应点名"完整性门未放行"，实际 message=${JSON.stringify(judgeBeforeAccept.message)}`
            ).toBe(true);

            // 重新过门 accepted → 报告级判定三态逐行钉
            const gate2 = await apiCallRaw<{ report: Row; missing_elements: string[] }>(
              session.page,
              'PUT',
              `/textile-reports/${reportId}/acceptance`
            );
            expect(
              String(gate2?.report?.acceptance_status),
              `补齐要素后过门应 accepted 且缺项清零，实际=${JSON.stringify(gate2?.report?.acceptance_status)} 缺项=${JSON.stringify(gate2?.missing_elements)}`
            ).toBe('accepted');
            expect(
              (gate2?.missing_elements ?? []).length,
              `accepted 时缺项清单应为空，实际=${JSON.stringify(gate2?.missing_elements)}`
            ).toBe(0);

            const judged = await apiCallRaw<Row[]>(
              session.page,
              'PUT',
              `/textile-reports/${reportId}/judgement`
            );
            expect(
              Array.isArray(judged) && judged.length === 6,
              `报告级判定应覆盖全部 6 行，实际=${JSON.stringify(judged)?.slice(0, 300)}`
            ).toBe(true);
            const verdictByItem = new Map<number, string>();
            for (const row of judged ?? []) {
              verdictByItem.set(Number(row.item_id), String(row.verdict));
            }
            const detailItems = (
              await apiCallRaw<{ items: Row[] }>(
                session.page,
                'GET',
                `/textile-submissions/${submissionId}`
              )
            )?.items;
            const idByCode = new Map<string, number>();
            for (const it of detailItems ?? []) {
              idByCode.set(String(it.item_code), Number(it.item_id));
            }
            for (const [code, expected] of [
              ['HCHO', 'pass'],
              ['PH', 'pass'],
              ['ODOR', 'pass'],
              ['FAST_WATER', 'pass'],
              ['AZO', 'pass'],
              ['FAST_SALIVA', 'na'],
            ] as const) {
              const itemId = idByCode.get(code);
              expect(
                itemId !== undefined ? verdictByItem.get(itemId) : '<缺行>',
                `${code} 判定应逐字符等于 ${expected}（B 类限值矩阵产出，等级 3 恰压 3.0 下限含等，耐唾液 B 类法定不考核），实际=${JSON.stringify(verdictByItem.get(itemId))}`
              ).toBe(expected);
            }

            // 整单判定：唯一采信本报告，排除集与有效期点名集均为空，结论 pass 状态 judged
            const judge = await apiCallRaw<{
              submission: Row;
              adoption: { adopted: Row | null; excluded: unknown[] };
              expired_reports_named: unknown[];
              stock_link: Row;
            }>(session.page, 'PUT', `/textile-submissions/${submissionId}/judgement`);
            expect(
              String(judge?.submission?.status),
              `整单判定后状态应为 judged，实际=${JSON.stringify(judge?.submission?.status)}`
            ).toBe('judged');
            expect(
              String(judge?.submission?.overall_verdict),
              `全行 pass 与 na 汇总整单应为 pass（na 不折算 fail 也不参与投票），实际=${JSON.stringify(judge?.submission?.overall_verdict)}`
            ).toBe('pass');
            expect(
              String((judge?.adoption?.adopted as Row)?.report_no ?? ''),
              `采信对象应恰为本报告 ${reportNo}，实际=${JSON.stringify(judge?.adoption?.adopted)}`
            ).toBe(reportNo);
            expect(
              JSON.stringify(judge?.adoption?.excluded ?? []),
              `单报告在窗场景排除清单应为空集（集合式判据不依赖顺序），实际=${JSON.stringify(judge?.adoption?.excluded)}`
            ).toBe('[]');
            expect(
              JSON.stringify(judge?.expired_reports_named ?? []),
              `有效期点名集应为空集，实际=${JSON.stringify(judge?.expired_reports_named)}`
            ).toBe('[]');
            expect(
              String((judge?.stock_link as Row)?.scope_note ?? '').includes('未登记批次号'),
              `放行联动的零命中仍必须点名未登记批次，实际=${JSON.stringify((judge?.stock_link as Row)?.scope_note)}`
            ).toBe(true);

            // 接口回读复核库里真值
            const readBack = await apiCallRaw<{ submission: Row; reports: Row[] }>(
              session.page,
              'GET',
              `/textile-submissions/${submissionId}`
            );
            expect(
              String(readBack?.submission?.overall_verdict),
              `回读整单结论应为 pass，实际=${JSON.stringify(readBack?.submission?.overall_verdict)}`
            ).toBe('pass');
            expect(
              String(readBack?.reports?.[0]?.acceptance_status),
              `回读报告受理态应为 accepted，实际=${JSON.stringify(readBack?.reports?.[0])?.slice(0, 200)}`
            ).toBe('accepted');

            // judged 到 closed 正向跃迁；封账后修改与删除被拦并点名口径
            const toClosed = await apiCallRaw<{ submission: Row }>(
              session.page,
              'PUT',
              `/textile-submissions/${submissionId}/status`,
              { status: 'closed' }
            );
            expect(
              String(toClosed?.submission?.status),
              `judged 推进归档应为 closed，实际=${JSON.stringify(toClosed?.submission?.status)}`
            ).toBe('closed');
            const editAfterClosed = await apiCallExpectFail(
              session.page,
              'PUT',
              `/textile-submissions/${submissionId}`,
              {
                submission_no: String(created?.submission_no),
                product_id: productId,
                color_no: colorNo,
                process_no: processNo,
                end_user_group: 'adult',
                contact_type: 'direct',
                safety_category: CATEGORY_B,
                product_form: 'final',
                target_market: 'dom',
              }
            );
            expectStateGateRejection(editAfterClosed, 'closed 态改要素应被拦');
            expect(
              String(editAfterClosed.message ?? '').includes('draft,sampling,sent'),
              `封账拦截应点名可编辑态集 draft sampling sent，实际 message=${JSON.stringify(editAfterClosed.message)}`
            ).toBe(true);
            const delAfterClosed = await apiCallExpectFail(
              session.page,
              'DELETE',
              `/textile-submissions/${submissionId}`
            );
            expectStateGateRejection(delAfterClosed, 'closed 态删除应被拦');
            expect(
              String(delAfterClosed.message ?? '').includes('仅草稿可删除'),
              `删除拦截应点名"仅草稿可删除"，实际 message=${JSON.stringify(delAfterClosed.message)}`
            ).toBe(true);

            return {
              artifacts: [
                { key: 'passSubmissionId', value: submissionId },
                { key: 'passSubmissionNo', value: String(created?.submission_no) },
                { key: 'passReportId', value: reportId },
              ],
              // 清理位说明：closed 单不可删（本步刚钉过拦截），不登记必败的假清理，见文件头声明。
            };
          },
        },
        {
          role: 'quality_inspector',
          label: '质检员另一批次走不合格链并在报告级判出 fail',
          run: async ({ session, require }) => {
            const productId = Number(require('productId'));
            const colorNo = genCode('E2E-TS1-FCOLOR');
            const processNo = genCode('E2E-TS1-FPROC');

            const created = await apiCallRaw<Row>(session.page, 'POST', '/textile-submissions', {
              submission_no: genCode('E2E-TS1-FAIL'),
              product_id: productId,
              color_no: colorNo,
              process_no: processNo,
              end_user_group: 'adult',
              contact_type: 'indirect',
              safety_category: CATEGORY_C,
              product_form: 'final',
              target_market: 'dom',
              remarks: '不合格链全流程专项单',
            });
            const submissionId = Number(created?.id);
            expect(
              Number.isFinite(submissionId) && submissionId > 0,
              `不合格链建单应返回主键，实际=${JSON.stringify(created)?.slice(0, 200)}`
            ).toBe(true);

            const generated = await apiCallRaw<{ items: unknown[]; needs_attention: boolean }>(
              session.page,
              'POST',
              `/textile-submissions/${submissionId}/items`,
              {}
            );
            expect(
              (generated?.items ?? []).length,
              `成人内销 C 类单应推出十枚清单，实际=${generated?.items?.length}`
            ).toBe(10);
            expect(
              generated?.needs_attention,
              `内销成人档无口径缺口，needs_attention 应恰为 false，实际=${JSON.stringify(generated?.needs_attention)}`
            ).toBe(false);

            await apiCallRaw(session.page, 'PUT', `/textile-submissions/${submissionId}/status`, {
              status: 'sampling',
            });
            await apiCallRaw(session.page, 'PUT', `/textile-submissions/${submissionId}/status`, {
              status: 'sent',
            });

            const report = await apiCallRaw<Row>(session.page, 'POST', '/textile-reports', {
              report_no: genCode('E2E-TS1-FRPT'),
              submission_id: submissionId,
              inspection_agency: 'E2E 第三方检测机构',
              has_cma: true,
              has_cnas: false,
              sample_name: '涤纶梭运样品',
              material_composition: '100% 聚酯纤维',
              color_no: colorNo,
              process_no: processNo,
              test_basis: BASIS_C,
              conclusion: '按 GB 18401-2010 C类判定，甲醛超标不符合要求',
              issue_date: TODAY_ISO,
              valid_until: VALID_UNTIL_ISO,
            });
            const reportId = Number(report?.id);
            expect(
              Number.isFinite(reportId) && reportId > 0,
              `不合格链报告登记应返回主键，实际=${JSON.stringify(report)?.slice(0, 200)}`
            ).toBe(true);

            await apiCallRaw(session.page, 'POST', `/textile-reports/${reportId}/results`, {
              rows: [
                { item_code: 'HCHO', measured_value: 350, measured_unit: 'mg/kg' },
                { item_code: 'ODOR', measured_text: 'none' },
                { item_code: 'PH', measured_value: 6.5 },
              ],
            });
            const gate = await apiCallRaw<{ report: Row }>(
              session.page,
              'PUT',
              `/textile-reports/${reportId}/acceptance`
            );
            expect(
              String(gate?.report?.acceptance_status),
              `全要素报告过门应 accepted，实际=${JSON.stringify(gate?.report?.acceptance_status)}`
            ).toBe('accepted');

            const judged = await apiCallRaw<Row[]>(
              session.page,
              'PUT',
              `/textile-reports/${reportId}/judgement`
            );
            const verdicts = (judged ?? []).map(r => String(r.verdict));
            expect(
              verdicts.includes('fail'),
              `甲醛 350 越 C 类 300 上限应判出 fail，实际=${JSON.stringify(judged)?.slice(0, 300)}`
            ).toBe(true);

            const judge = await apiCallRaw<{
              submission: Row;
              adoption: { adopted: Row | null; excluded: unknown[] };
            }>(session.page, 'PUT', `/textile-submissions/${submissionId}/judgement`);
            expect(
              String(judge?.submission?.status),
              `不合格链整单判定后状态应为 judged，实际=${JSON.stringify(judge?.submission?.status)}`
            ).toBe('judged');
            expect(
              String(judge?.submission?.overall_verdict),
              `任一 fail 汇总整单必须 fail（不被多数 pass 稀释），实际=${JSON.stringify(judge?.submission?.overall_verdict)}`
            ).toBe('fail');
            expect(
              JSON.stringify(judge?.adoption?.excluded ?? []),
              `单报告在窗排除清单应为空集（集合式判据不依赖顺序），实际=${JSON.stringify(judge?.adoption?.excluded)}`
            ).toBe('[]');

            // judged 不可回改要素（封账门在 reported 之后即生效）
            const lateEdit = await apiCallExpectFail(
              session.page,
              'PUT',
              `/textile-submissions/${submissionId}`,
              {
                submission_no: String(created?.submission_no),
                product_id: productId,
                color_no: colorNo,
                process_no: processNo,
                end_user_group: 'adult',
                contact_type: 'indirect',
                safety_category: CATEGORY_C,
                product_form: 'final',
                target_market: 'dom',
              }
            );
            expectStateGateRejection(lateEdit, 'judged 态改要素应被拦');

            // 库里真值两路复核：详情回读 fail 与 judged
            const readBack = await apiCallRaw<{ submission: Row }>(
              session.page,
              'GET',
              `/textile-submissions/${submissionId}`
            );
            expect(
              String(readBack?.submission?.overall_verdict),
              `回读整单结论应为 fail，实际=${JSON.stringify(readBack?.submission?.overall_verdict)}`
            ).toBe('fail');
            expect(
              String(readBack?.submission?.status),
              `回读状态应为 judged，实际=${JSON.stringify(readBack?.submission?.status)}`
            ).toBe('judged');

            return {
              artifacts: [
                { key: 'failSubmissionId', value: submissionId },
                { key: 'failOverallVerdict', value: 'fail' },
              ],
            };
          },
        },
      ]);

      // 链尾对账：两执行棒是不同真身份，产出全部登记在链上
      const userIds = relay.sessions.map(s => s.userId);
      expect(new Set(userIds).size, `三棒应三个不同用户，实际=${userIds.join(', ')}`).toBe(3);
      expect(
        Number(relay.artifacts.passSubmissionId) > 0 &&
          Number(relay.artifacts.failSubmissionId) > 0 &&
          Number(relay.artifacts.passSubmissionId) !== Number(relay.artifacts.failSubmissionId),
        `两链单据应各自独立落库，实际=${JSON.stringify({
          pass: relay.artifacts.passSubmissionId,
          fail: relay.artifacts.failSubmissionId,
        })}`
      ).toBe(true);
    } finally {
      await relay.close();
    }
  });
});
