/**
 * 530 导入模板元数据契约。
 *
 * 功能：钉住 GET /templates/meta/{import_type} 的模板列清单与未知类型拒绝，防止前端复制列定义后与后端解析表漂移。
 * 调用方：数据导入中心的列说明面板；本用例仅作为 CI 回归，不点击 UI。
 * 入参：路径参数 customers 与 no-such-type，无 query、无 body、无造数。
 * 传给谁：apiCallRaw/apiCallExpectFail 发出相对 baseURL /api/v1/erp 的请求；auth 由 loginViaUI 提供。
 * 存什么：成功 data 的四个模板键与四列逐字段断言；失败只断 HTTP、机器码与外显原因。
 * 存哪里：后端 ImportExportService 的模板登记表（services/import_export_service.rs:116-128,163-199），不写库。
 *
 * 判据出处：路由在 frontend/scripts/route-snapshot.txt:957；handler 在 handlers/import_export_handler.rs:178-190；
 * 未知类型经 AppError::validation_displayable 落 400/VALIDATION_ERROR，中文原因用于导入面板提示，故可断言。
 */
import { test, expect } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  failureCode,
  loginViaUI,
} from '../flow/helpers';

interface ImportColumn {
  field: string;
  title: string;
  data_type: string;
  required: boolean;
  example: string;
}

interface ImportTemplateMeta {
  import_type: string;
  name: string;
  description: string;
  columns: ImportColumn[];
}

const CUSTOMERS_TEMPLATE: ImportTemplateMeta = {
  import_type: 'customers',
  name: '客户导入模板',
  description: '用于批量导入客户信息',
  columns: [
    { field: 'code', title: '客户编码', data_type: 'string', required: true, example: 'C001' },
    { field: 'name', title: '客户名称', data_type: 'string', required: true, example: 'ABC公司' },
    { field: 'contact', title: '联系人', data_type: 'string', required: false, example: '张三' },
    {
      field: 'phone',
      title: '电话',
      data_type: 'string',
      required: false,
      example: '13800138000',
    },
  ],
};

test('530-01 客户导入模板元数据四列逐字段回读不漂移', async ({ page }) => {
  await loginViaUI(page);
  const meta = await apiCallRaw<ImportTemplateMeta>(page, 'GET', '/templates/meta/customers');
  expect(meta, '客户模板出参须逐字段等于后端模板登记表').toEqual(CUSTOMERS_TEMPLATE);
  for (const column of meta.columns) {
    expect(
      Object.keys(column).sort(),
      `${column.field} 列只允许 field/title/data_type/required/example 五键`
    ).toEqual(['data_type', 'example', 'field', 'required', 'title']);
  }
});

test('530-02 未知导入类型返回 400 机器码并提示具体类型', async ({ page }) => {
  await loginViaUI(page);
  const invalidType = 'no-such-type';
  const failure = await apiCallExpectFail(page, 'GET', `/templates/meta/${invalidType}`);

  expect(failure.status, `未知导入类型须 400，实际 ${failure.status}`).toBe(400);
  expect(
    failureCode(failure),
    `未知导入类型机器码，实际 ${String(failure.code)} message=${String(failure.message)}`
  ).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
  expect(failure.message, '外显原因须点名未知类型，不能退化成通用失败').toContain(
    `不支持的导入类型: ${invalidType}`
  );
});
