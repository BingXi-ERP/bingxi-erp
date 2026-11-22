/**
 * 529 数据范围类型五值契约。
 *
 * 功能：钉住 GET /data-permissions/scope-types 的后端权威词表，防止五值被删改、重命名或换序。
 * 调用方：Playwright E2E 套件，由 CI 的 e2e enhanced 分片按文件哈希收集执行。
 * 入参：仅 loginViaUI 的 admin 会话，无 query、无 body、不造数。
 * 传给谁：请求经 flow/helpers 的 apiCallRaw 发出，路径相对前端 baseURL /api/v1/erp。
 * 存什么：不落库；响应必须与 handler 固定数组逐字段相等。
 * 存哪里：backend/src/handlers/data_permission_handler.rs:298-330 的静态词表。
 *
 * 判据出处：路由在 frontend/scripts/route-snapshot.txt:456；handler 返回五个固定对象，
 * 顺序为 ALL、DEPT、DEPT_AND_BELOW、SELF、CUSTOM，且只含 value/label/description 三键。
 * 该词表与写入侧白名单同源，不能与 utils/data_scope.rs 的小写三值行级词表混用。
 */
import { test, expect } from '../diagnose-fixture';
import { apiCallRaw, loginViaUI } from '../flow/helpers';

type ScopeType = { value: string; label: string; description: string };

const EXPECTED: ScopeType[] = [
  { value: 'ALL', label: '全部数据', description: '可以查看所有数据' },
  { value: 'DEPT', label: '本部门数据', description: '只能查看本部门的数据' },
  {
    value: 'DEPT_AND_BELOW',
    label: '本部门及以下数据',
    description: '可以查看本部门及下级部门的数据',
  },
  { value: 'SELF', label: '仅本人数据', description: '只能查看自己创建的数据' },
  {
    value: 'CUSTOM',
    label: '自定义数据范围',
    description: '通过自定义条件过滤数据',
  },
];

test('529-01 数据范围类型端点返回固定五值且键集合精确', async ({ page }) => {
  await loginViaUI(page);
  const types = await apiCallRaw<ScopeType[]>(page, 'GET', '/data-permissions/scope-types');

  expect(Array.isArray(types), '数据范围类型出参必须是裸数组').toBe(true);
  console.warn(`[529] GET /data-permissions/scope-types 返回 ${types.length} 项，开始逐字段核对`);
  expect(types, '五个类型的顺序、值与键集合须逐字段等于后端权威词表').toEqual(EXPECTED);
  for (const item of types) {
    expect(Object.keys(item).sort(), `${item.value} 只能含 value/label/description 三键`).toEqual([
      'description',
      'label',
      'value',
    ]);
  }
});
