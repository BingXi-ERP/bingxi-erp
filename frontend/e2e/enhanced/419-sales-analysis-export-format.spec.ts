// 4.19 打印与导出格式：销售分析报告导出的 format 参数门（csv 禁用、未知格式拒绝、xlsx 大小写不敏感放行）。
// 后端判据：services/sales_analysis_service.rs:865-879 export_report 真调
//   let format = params.format.as_deref().unwrap_or("xlsx").to_lowercase();
//   "xlsx" => 放行；"csv" => Err(validation_displayable "CSV 格式已禁用，请使用 xlsx 格式导出（规则 3 合规）")；
//   other => Err("不支持的导出格式：{}，当前仅支持 xlsx")。
//   调用链 handlers/sales_analysis_handler.rs:257-268 export_analysis → service.export_report；
//   路由 routes/crm.rs:205 GET /crm/sales-analysis/export。
// 检测力：若删掉 format 门，csv 与未知格式会返回 200 二进制即红；若把大写 XLSX 误拒，正例即红。
// 与 02-bi-aggregate-truth 正交：那条只做默认端点的 2xx 健康检查（verifyDownloadEndpointHealthy），
//   不传 format、不判 csv/未知格式的拒绝分支；本条专钉 format 三分支。
import { test, expect } from '../diagnose-fixture';
import {
  loginViaUI,
  ensureTestEntities,
  apiCallExpectFail,
  expectStateGateRejection,
  failureCode,
  APP_ERROR_CODES,
  verifyDownloadEndpointHealthy,
} from '../flow/helpers';

test.describe('4.19 销售分析导出格式门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('419-01 csv 与未知格式被拒，xlsx 大小写不敏感且缺省放行', async ({ page }) => {
    const endpoint = '/crm/sales-analysis/export';

    // csv：规则 3 合规禁用，须 VALIDATION_ERROR 且拒因点名"CSV 格式已禁用"。
    const csv = await apiCallExpectFail(page, 'GET', `${endpoint}?format=csv`);
    expectStateGateRejection(csv, 'csv 格式导出');
    expect(failureCode(csv), 'csv 拒绝须归 VALIDATION_ERROR').toBe(
      APP_ERROR_CODES.VALIDATION_ERROR
    );
    expect(
      String(csv.message ?? ''),
      '拒因须点名 CSV 格式已禁用，实际 ' + JSON.stringify(csv.message)
    ).toContain('CSV 格式已禁用');

    // 未知格式：须点名不支持的格式并给出可用口径，不能笼统失败。
    const unknown = await apiCallExpectFail(page, 'GET', `${endpoint}?format=pdf`);
    expectStateGateRejection(unknown, '未知格式导出');
    expect(
      String(unknown.message ?? ''),
      '拒因须点名不支持的导出格式，实际 ' + JSON.stringify(unknown.message)
    ).toContain('不支持的导出格式');

    // 正例：大写 XLSX 经 to_lowercase 后须放行（二进制下载端点，用 download 健康校验，
    // 不能用 JSON helper——02-bi 已证该端点返回 xlsx 字节流）。
    await verifyDownloadEndpointHealthy(page, `${endpoint}?format=XLSX`);

    // 正例：不传 format 走默认 xlsx，须放行。
    await verifyDownloadEndpointHealthy(page, endpoint);
  });
});
