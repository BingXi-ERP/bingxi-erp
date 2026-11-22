// 530 导入模板元数据契约：客户模板固定列清单 + 未知类型统一拒绝。
// 后端判据：routes/analytics.rs:199-202 注册 GET /templates/meta/{import_type}，
//   handlers/import_export_handler.rs:178-189 从 ImportExportService::get_import_template 取登记表，
//   原样回 {import_type,name,description,columns}；services/import_export_service.rs:115-127 的
//   match 只为 products/customers/inventory/sku_mapping/crm_leads 放行，
//   未知类型走 AppError::validation_displayable → HTTP 400 / VALIDATION_ERROR（error.rs:220-221/823）。
//   客户列清单同源定义在同文件 :163-199；ImportColumnDef 固定五键 field/title/data_type/required/example。
// 路径说明：服务层旧注释写 /import/templates/meta/...，但 route-snapshot.txt:957 与前端
//   src/api/import-template.ts:34 的真实注册路径均为 /templates/meta/...，故本例钉真实端点，
//   不对不存在的 /import 前缀做假绿断言。
// 纯 GET：不建数据、不清理；唯一 unknown type 由 genCode 派生，避免与后端登记类型相撞。
import { expect, test } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  failureCode,
  genCode,
  loginViaUI,
} from '../flow/helpers';

interface ImportColumnDef {
  field: string;
  title: string;
  data_type: string;
  required: boolean;
  example: string | null;
}

interface ImportTemplateMeta {
  import_type: string;
  name: string;
  description: string;
  columns: ImportColumnDef[];
}

const EXPECTED_TOP_KEYS = ['columns', 'description', 'import_type', 'name'];
const EXPECTED_COLUMN_KEYS = ['data_type', 'example', 'field', 'required', 'title'];
const EXPECTED_COLUMNS = [
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
];

test.describe('530 导入模板元数据契约', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('530-01 customers 模板列清单逐字段固定且未知类型 400/VALIDATION_ERROR', async ({ page }) => {
    const meta = await apiCallRaw<ImportTemplateMeta>(page, 'GET', '/templates/meta/customers');

    expect(
      meta !== null && typeof meta === 'object',
      `[530] customers 元数据 data 须为对象，实际=${JSON.stringify(meta)}`
    ).toBe(true);
    expect(
      Object.keys(meta).sort(),
      `[530] customers 元数据只含四键，实际=${JSON.stringify(Object.keys(meta).sort())}`
    ).toEqual(EXPECTED_TOP_KEYS);
    expect(meta.import_type, `[530] import_type 须为 customers，实际=${meta.import_type}`).toBe(
      'customers'
    );
    expect(meta.name, `[530] name 须逐字符等于后端登记表，实际=${JSON.stringify(meta.name)}`).toBe(
      '客户导入模板'
    );
    expect(
      meta.description,
      `[530] description 须逐字符等于后端登记表，实际=${JSON.stringify(meta.description)}`
    ).toBe('用于批量导入客户信息');
    expect(
      Array.isArray(meta.columns),
      `[530] columns 须为数组，实际=${JSON.stringify(meta.columns)}`
    ).toBe(true);
    expect(meta.columns.length, `[530] customers 固定四列，实际列数=${meta.columns.length}`).toBe(
      4
    );

    const shape = meta.columns.map(column => ({
      field: column.field,
      title: column.title,
      data_type: column.data_type,
      required: column.required,
      example: column.example,
    }));
    expect(
      shape,
      `[530] customers 四列须逐字段等于权威列清单，实际=${JSON.stringify(shape)}`
    ).toEqual(EXPECTED_COLUMNS);

    for (const [index, column] of meta.columns.entries()) {
      expect(
        Object.keys(column).sort(),
        `[530] 第 ${index + 1} 列只含五键，实际=${JSON.stringify(Object.keys(column).sort())}`
      ).toEqual(EXPECTED_COLUMN_KEYS);
      expect(
        typeof column.required === 'boolean',
        `[530] 第 ${index + 1} 列 required 须严格布尔，实际=${JSON.stringify(column.required)}`
      ).toBe(true);
      expect(
        typeof column.example === 'string' && column.example.length > 0,
        `[530] 第 ${index + 1} 列 example 须非空字符串，实际=${JSON.stringify(column.example)}`
      ).toBe(true);
    }

    const unknownType = genCode('E530UNKNOWN');
    const failure = await apiCallExpectFail(page, 'GET', `/templates/meta/${unknownType}`);
    expect(failure.status, `[530] 未知类型 ${unknownType} 须 400，实际=${failure.status}`).toBe(
      400
    );
    expect(
      failureCode(failure),
      `[530] 未知类型 ${unknownType} 机器码须 VALIDATION_ERROR，实际=${failureCode(failure)}`
    ).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
    expect(
      failure.message ?? '',
      `[530] 未知类型 ${unknownType} 文案须点名不支持的导入类型，实际=${JSON.stringify(
        failure.message
      )}`
    ).toBe(`不支持的导入类型: ${unknownType}`);
  });
});
