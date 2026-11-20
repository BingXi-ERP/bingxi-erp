// 4.31 数值与文本边界 + 4.14 字段长度门：供应商统一社会信用代码恰好 18 位。
// 后端判据：services/supplier_service.rs:1163-1172 CreateSupplierRequest.credit_code
//   #[validate(length(equal = 18, message = "统一社会信用代码长度必须为18位"))]；
//   handlers/supplier_handler.rs:129 create_supplier 首行 req.validate()? 真调；
//   validator crate 的 length 对 String 用 chars().count()（Unicode 字符数，非 UTF-8 字节数），
//   故中文 18 字（54 字节）放行；失败经 utils/error.rs 的 ValidationErrors→AppError
//   出 400 + VALIDATION_ERROR，文案含 "18位"。
// 判据未重复：credit_code 不做格式/大小写/唯一性二次校验（:124 直接落库），
//   故用 17/19 位拒、18 位字母数字放行、中文 18 字放行构成完整边界闭环。
// 与既有覆盖分工：flow/66-06 与 flow/30 只测 18 位正例落库，无 N±1 拒绝与中文按字符断言；
//   本例专补这条边界负例与中文口径零覆盖点。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  failureCode,
  genCode,
  loginViaUI,
  tryCleanup,
} from '../flow/helpers';

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.slice().reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
  CLEANUP.length = 0;
});

const VALID = '91310000MA1K3AB0X9';

async function reject(page: Page, creditCode: string, tag: string) {
  const name = `481信用码${tag}_${genCode('E481')}`;
  const r = await apiCallExpectFail(page, 'POST', '/purchase/suppliers', {
    supplier_name: name,
    credit_code: creditCode,
  });
  expect(r.status, `[481] ${tag} 须 400，实际 ${r.status}`).toBe(400);
  expect(failureCode(r), `[481] ${tag} 机器码须 VALIDATION_ERROR，实际=${failureCode(r)}`).toBe(
    APP_ERROR_CODES.VALIDATION_ERROR
  );
  expect(r.message ?? '', `[481] ${tag} 拒因须含 18位`).toContain('18位');
}

async function create(page: Page, creditCode: string, tag: string) {
  const name = `481信用码${tag}_${genCode('E481')}`;
  const created = await apiCall<{ data?: { id?: number } }>(page, 'POST', '/purchase/suppliers', {
    supplier_name: name,
    credit_code: creditCode,
  });
  const id = Number(created.data?.id);
  expect(id, `[481] ${tag} 18 位须放行并回 id：${JSON.stringify(created)}`).toBeGreaterThan(0);
  CLEANUP.push({ path: `/purchase/suppliers/${id}`, label: `supplier-${tag}` });

  const detail = await apiCallRaw<{ credit_code?: string }>(
    page,
    'GET',
    `/purchase/suppliers/${id}`
  );
  expect(detail.credit_code, `[481] ${tag} 回读 credit_code 须等于提交值`).toBe(creditCode);
}

test.describe('4.31 供应商信用码 18 位边界', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('481-01 17/19 位拒绝、18 位字母数字放行并回读', async ({ page }) => {
    await reject(page, '9'.repeat(17), 'N1');
    await create(page, VALID, 'N');
    await reject(page, '9'.repeat(19), 'Np1');
  });

  test('481-02 中文 18 字按字符计数放行（非 UTF-8 字节收紧）', async ({ page }) => {
    await create(page, '中'.repeat(18), '中文');
  });
});
