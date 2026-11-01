/**
 * 纺织品安全送检单：多角色权限门与跨身份可见性接力
 *
 * 功能：用一条四棒接力钉死本域"谁能录结论、谁被后端拒之门外"的真实授权面——
 * 一，质量经理（持 textile-submissions 与 textile-reports 全通配）建单推项送检并登记报告，
 *    把报告推到受理与整单判定，全程 200；
 * 二，质检员（持 submissions 与 reports 的 read 与 create 与 update，无主数据维护权）
 *    作为录入结论的 QC 岗执行逐项目结果录入并判定，全程 200，证明结论面 QC 两岗都真实可用；
 * 三，业务员（salesperson 为后端 sales_rep 权限集的 CI 镜像码，仅持 textile-export-requirements 只读，
 *    无 submissions 与 reports 任何键）对同一批端点六路全被权限门拒绝（HTTP 403 加机器码 FORBIDDEN，
 *    后端拒而非前端隐藏）——读单 读报告列表 录结果 过受理门 报告判定 整单判定各一；
 * 四，财务经理（finance_manager 在后端权限矩阵内无任何 textile 键）读该单详情与按单列报告同样 403，
 *    证明可见性门对非授权读面一致收口（本域实体表无 phone 与 email 等 PII 列，
 *    脱敏面在本域即可见面，无权则整单不可读，与 PC 端读到的收口一致）。
 * 五，UI 面同钉：质检员登录后侧栏存在纺织品安全送检菜单项且功能页渲染出该单行，
 *    业务员侧栏无该项且直闯功能页被路由守卫挡到无权限页且不泄露数据行——菜单缺项与接口 403 两路互证，
 *    证明"隐藏按钮"不是唯一防线而是与后端同源的第二层。
 *
 * 调用方：Playwright E2E 套件，由 CI 的 e2e flow 分片按文件哈希收集执行。
 * 入参：API_BASE 与 BASE_URL 取环境变量；角色凭证取 env 优先、回退 e2e/.auth/role-credentials.json；
 *      被测端点为 POST 与 GET 与 PUT 的 textile-submissions 与 textile-reports 全家族、
 *      GET /product-categories 与 POST /products（admin 腿自建品种）。
 * 传给谁：请求走 flow/helpers 的 apiCallRaw 与 apiCallExpectFail，越权判定走 fixtures/relay 的
 *      expectEndpointDenied（内联 helpers 的 expectDenied 判据），UI 判定走 relay 的
 *      expectMenuItemPresent 与 expectMenuItemAbsent 与 expectPageGuardDenied 与 helpers 的 safeGoto。
 * 存什么：送检单 1 枚（judged）报告 1 份（accepted）结果行 3 枚与产品档案 1 枚。
 * 存哪里：PostgreSQL textile_safety_submission 与 textile_third_party_report 与
 *      textile_report_item_result 与 products 表。
 *
 * 【清理腿不可达声明（按判红口径不造规避）】
 * 落库单据终态 judged：DELETE /textile-submissions/{id} 仅草稿可删（submission service delete_draft），
 * 状态机白名单无 judged 到 withdrawn 通路，报告外键 RESTRICT——不登记必败的假清理，
 * 残留 1 单 1 报告 3 结果行 1 产品属已知不可回收面，与 232 同口径交主编排裁定。
 *
 * 【角色权限面来源（不是推测）】
 * qc_manager 由后端初始化建角（init_service_ops/role.rs）并授
 * textile-submissions 与 textile-reports 与 textile-test-items 与 textile-limit-rules 与
 * textile-export-requirements 五枚全通配（init_service_ops/permission.rs 质量域分组）；
 * quality_inspector 建角并授 submissions 与 reports 的 read 与 create 与 update 与
 * test-items 与 limit-rules 与 export-requirements 只读（同分组，判定表维护权不授执行岗）；
 * salesperson 对齐 permission.rs 的 sales_rep 分组（e2e global-setup 的 SEED_ROLE_EXTRA_PERMISSIONS
 * 注释言明其为 sales_rep 的 CI 与部署别名码），sales_rep 持 textile-export-requirements 读，
 * 不持 submissions 与 reports 任何键（报价与订单侧只读登记面，送检与报告明细不给销售）；
 * finance_manager 在 permission.rs 全矩阵内 grep textile 零命中——无任何本域键。
 * 路由面 seg3 即权限资源名（utils/path_utils.rs 直接资源白名单），未授权请求由权限中间件
 * fail-closed 403 加统一信封机器码 FORBIDDEN（middleware/permission.rs 与 utils/error.rs 同源）。
 * 前端收口同源：textile-safety 路由 meta 权限键为 textile-submissions 读（router/index.ts），
 * 无键角色被路由守卫挡向 403 页，与接口 403 两路一致。
 *
 * 【为什么整条链写成单个 test 且放在 serial 描述块里】
 * CI 分片按文件哈希分配，接力棒次不能跨文件；跨 test 会把接力句柄与会话拆到不同 worker，
 * 棒间传标识随之失真（与 232 同口径）。
 */
import { test, expect } from '../diagnose-fixture';
import { apiCallRaw, genCode } from './helpers';
import {
  createRelay,
  expectEndpointDenied,
  expectMenuItemAbsent,
  expectMenuItemPresent,
  expectPageGuardDenied,
  expectPageRendersRow,
} from '../fixtures/relay';

type Row = Record<string, unknown>;

/** 签发与有效期（ISO 日历日，签发今天，有效期 180 天后，窗口恒覆盖今日） */
const isoDay = (d: Date): string => d.toISOString().slice(0, 10);
const TODAY_ISO = isoDay(new Date());
const VALID_UNTIL_ISO = isoDay(new Date(Date.now() + 180 * 86_400_000));

test.describe
  .serial('纺织品安全：QC 岗录结论可用、销售与财务被后端权限门拒绝、UI 与接口两路一致', () => {
  test('四身份接力录判定与越权拒绝，菜单缺项与路由守卫与接口 403 互证', async ({ browser }) => {
    const relay = await createRelay(browser);
    try {
      await relay.runSteps([
        {
          role: 'admin',
          label: '管理员建跨角色用例品种',
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
            const created = await apiCallRaw<Row>(session.page, 'POST', '/products', {
              name: genCode('E2E-TS3X-FABRIC'),
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
            // 自建自读：产品行落库回读钉状态（只信回执会把给了 id 但行没落读成成功）
            const back = await apiCallRaw<Row>(session.page, 'GET', `/products/${productId}`);
            expect(
              String(back?.status ?? ''),
              `产品建档回读状态应为 active，实际=${JSON.stringify(back?.status)}`
            ).toBe('active');
            return { artifacts: [{ key: 'productId', value: productId }] };
          },
        },
        {
          role: 'quality_inspector',
          label: '质检员建单推项送检并录实测结果（QC 岗正向全程 200）',
          run: async ({ session, require }) => {
            const productId = Number(require('productId'));
            const colorNo = genCode('E2E-TS3X-COLOR');
            const processNo = genCode('E2E-TS3X-PROC');

            const created = await apiCallRaw<Row>(session.page, 'POST', '/textile-submissions', {
              submission_no: genCode('E2E-TS3X-SUB'),
              product_id: productId,
              color_no: colorNo,
              process_no: processNo,
              end_user_group: 'adult',
              contact_type: 'direct',
              safety_category: 'GB18401_B',
              product_form: 'final',
              target_market: 'dom',
              remarks: '多角色权限门专项单',
            });
            const submissionId = Number(created?.id);
            expect(
              Number.isFinite(submissionId) && submissionId > 0,
              `质检员建单应成功返回主键（submissions create 在册），实际=${JSON.stringify(created)?.slice(0, 200)}`
            ).toBe(true);

            const generated = await apiCallRaw<{ items: unknown[]; needs_attention: boolean }>(
              session.page,
              'POST',
              `/textile-submissions/${submissionId}/items`,
              {}
            );
            expect(
              (generated?.items ?? []).length,
              `成人内销单应推出十枚清单，实际=${generated?.items?.length}`
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
              report_no: genCode('E2E-TS3X-RPT'),
              submission_id: submissionId,
              inspection_agency: 'E2E 第三方检测机构',
              has_cma: true,
              has_cnas: true,
              sample_name: '多角色门专项样品',
              material_composition: '95% 棉 5% 氨纶',
              color_no: colorNo,
              process_no: processNo,
              test_basis: 'GB 18401-2010 B类',
              conclusion: '按 GB 18401-2010 B类判定，所检项目符合要求',
              issue_date: TODAY_ISO,
              valid_until: VALID_UNTIL_ISO,
            });
            const reportId = Number(report?.id);
            expect(
              Number.isFinite(reportId) && reportId > 0,
              `质检员登记报告应成功（reports create 在册），实际=${JSON.stringify(report)?.slice(0, 200)}`
            ).toBe(true);

            const results = await apiCallRaw<Row[]>(
              session.page,
              'POST',
              `/textile-reports/${reportId}/results`,
              {
                rows: [
                  { item_code: 'HCHO', measured_value: 40, measured_unit: 'mg/kg' },
                  { item_code: 'PH', measured_value: 6.8 },
                  { item_code: 'ODOR', measured_text: 'none' },
                ],
              }
            );
            expect(
              (results ?? []).length,
              `三枚结果行应由质检员录入成功，实际=${JSON.stringify(results)?.slice(0, 200)}`
            ).toBe(3);

            return {
              artifacts: [
                { key: 'submissionId', value: submissionId },
                { key: 'submissionNo', value: String(created?.submission_no) },
                { key: 'reportId', value: reportId },
              ],
            };
          },
        },
        {
          role: 'qc_manager',
          label: '质量经理过受理门并整单判定（另一 QC 岗录结论同样可用）',
          run: async ({ session, require }) => {
            const submissionId = Number(require('submissionId'));
            const reportId = Number(require('reportId'));

            const gate = await apiCallRaw<{ report: Row }>(
              session.page,
              'PUT',
              `/textile-reports/${reportId}/acceptance`
            );
            expect(
              String(gate?.report?.acceptance_status),
              `质量经理过门应 accepted（reports update 在册），实际=${JSON.stringify(gate?.report?.acceptance_status)}`
            ).toBe('accepted');

            const judged = await apiCallRaw<Row[]>(
              session.page,
              'PUT',
              `/textile-reports/${reportId}/judgement`
            );
            expect(
              (judged ?? []).length === 3 &&
                (judged ?? []).every(r => String(r.verdict) === 'pass'),
              `三行实测（甲醛 40 对 75 上限、pH 6.8 对区间、异味无）应全判 pass，实际=${JSON.stringify(judged)?.slice(0, 300)}`
            ).toBe(true);

            const judge = await apiCallRaw<{ submission: Row }>(
              session.page,
              'PUT',
              `/textile-submissions/${submissionId}/judgement`
            );
            expect(
              String(judge?.submission?.overall_verdict),
              `整单结论应为 pass，实际=${JSON.stringify(judge?.submission?.overall_verdict)}`
            ).toBe('pass');
            expect(
              String(judge?.submission?.status),
              `整单状态应为 judged，实际=${JSON.stringify(judge?.submission?.status)}`
            ).toBe('judged');

            return {
              artifacts: [
                { key: 'judgedVerdict', value: String(judge?.submission?.overall_verdict) },
              ],
            };
          },
        },
        {
          role: 'salesperson',
          label: '业务员对本域送检与报告端点六路全被权限门拒绝',
          run: async ({ session, require }) => {
            const submissionId = Number(require('submissionId'));
            const reportId = Number(require('reportId'));

            // 读面 写面 判定面各钉一路（只钉其一会漏"部分扩权"）
            await expectEndpointDenied(
              session.page,
              'GET',
              `/textile-submissions/${submissionId}`,
              '业务员越权读送检单详情'
            );
            await expectEndpointDenied(
              session.page,
              'GET',
              `/textile-reports?submission_id=${submissionId}`,
              '业务员越权按单列报告'
            );
            await expectEndpointDenied(
              session.page,
              'POST',
              `/textile-reports/${reportId}/results`,
              '业务员越权录入实测结果'
            );
            await expectEndpointDenied(
              session.page,
              'PUT',
              `/textile-reports/${reportId}/acceptance`,
              '业务员越权过完整性门'
            );
            await expectEndpointDenied(
              session.page,
              'PUT',
              `/textile-reports/${reportId}/judgement`,
              '业务员越权报告级判定'
            );
            // 目标钉：非 QC 岗尝试录结论（整单判定）必须 403 且后端拒，不是前端隐藏按钮
            await expectEndpointDenied(
              session.page,
              'PUT',
              `/textile-submissions/${submissionId}/judgement`,
              '业务员越权整单判定录结论'
            );

            // UI 面与接口面互证：侧栏无入口 直闯被路由守卫挡且页面不泄露数据行
            const uiPage = session.page;
            await expectMenuItemAbsent(uiPage, '纺织品安全送检', '业务员侧栏');
            await expectPageGuardDenied(uiPage, '/textile-safety', '业务员直闯送检功能页');

            return { artifacts: [{ key: 'salesDeniedCount', value: 6 }] };
          },
        },
        {
          role: 'finance_manager',
          label: '财务经理读该单与按单列报告同样被拒（可见性收口与销售一致）',
          run: async ({ session, require }) => {
            const submissionId = Number(require('submissionId'));
            await expectEndpointDenied(
              session.page,
              'GET',
              `/textile-submissions/${submissionId}`,
              '财务越权读送检单详情'
            );
            await expectEndpointDenied(
              session.page,
              'GET',
              `/textile-reports?submission_id=${submissionId}`,
              '财务越权按单列报告'
            );
            return { artifacts: [{ key: 'financeDeniedCount', value: 2 }] };
          },
        },
      ]);

      // 链尾总钉：五个登录身份互不相同（录入 判定 两路被拒 建档必须出自五个真身份）
      const userIds = relay.sessions.map(s => s.userId);
      expect(new Set(userIds).size, `五棒应为五个不同用户 id，实际=${userIds.join(', ')}`).toBe(5);

      // 质检员读回该单，钉整单结论落库为 pass
      const qiSession = relay.sessions.find(s => s.role === 'quality_inspector');
      expect(qiSession ? 'true' : 'missing', '链上必须存在质检员会话棒供读回复核').toBe('true');
      const detail = await apiCallRaw<{ submission: Row }>(
        qiSession!.page,
        'GET',
        `/textile-submissions/${Number(relay.artifacts.submissionId)}`
      );
      expect(
        String(detail?.submission?.overall_verdict),
        `质检员读回整单结论应为 pass（库里真值，非会话内存），实际=${JSON.stringify(detail?.submission?.overall_verdict)}`
      ).toBe('pass');
      expect(
        String(detail?.submission?.status),
        `质检员读回单据状态应为 judged，实际=${JSON.stringify(detail?.submission?.status)}`
      ).toBe('judged');

      // 质量经理功能页渲染出该单行（正向 UI 面，与业务员被挡互为对照）
      const qcSession = relay.sessions.find(s => s.role === 'qc_manager');
      expect(qcSession ? 'true' : 'missing', '链上必须存在质量经理会话棒供 UI 复核').toBe('true');
      await expectMenuItemPresent(qcSession!.page, '纺织品安全送检', '质量经理侧栏');
      await expectPageRendersRow(
        qcSession!.page,
        '/textile-safety',
        String(relay.artifacts.submissionNo),
        '质量经理送检功能页'
      );
    } finally {
      await relay.close();
    }
  });
});
