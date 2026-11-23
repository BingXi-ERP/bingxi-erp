/**
 * 功能：把「同名供应商重复建档被业务族点名拒绝」钉成真实 API 证据，并确认库里不落第二行。
 *
 * 六要素：
 * - 调用方：本 spec 自建唯一名称的供应商，连续调用两次建商口与一次列表口；不复用共享夹具供应商。
 * - 入参：同一 supplier_name 提交体两次，列表口用该唯一名称作 keyword。
 * - 传给谁：POST /purchase/suppliers、GET /purchase/suppliers、DELETE /purchase/suppliers/{id}。
 * - 存什么：断言落在第二次 HTTP 状态、字符串业务机器码、拒因回显和同名列表总数。
 * - 存哪里：suppliers 表；测试退出时删除自建且无引用的供应商行。
 *
 * 源码判据：services/supplier_service.rs::create_supplier 先调 check_supplier_name_unique；
 * 该函数按 supplier_name 精确查在册行，命中返回 business_displayable「供应商名称 '…' 已存在」
 * → HTTP 400 / BUSINESS_ERROR。supplier_code 由 DocumentNumberGenerator 取号，不能由请求注入，
 * 故本用例只验证名称这道服务层门，不把编码唯一性错算进来。列表口 keyword 覆盖 supplier_name，
 * 用唯一名称过滤后总数必须为 1。
 */
import { test, expect } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  expectBusinessRejection,
  failureCode,
  genName,
  tryCleanup,
} from './helpers';

interface SupplierRow {
  id: number;
  supplier_name: string;
}

interface SupplierPage {
  items: SupplierRow[];
  total: number;
}

test.describe.serial('610 同名供应商重复建档被业务族拒绝', () => {
  test('610-1 同名第二次 400 BUSINESS_ERROR 且列表同名仅一行', async ({ page }) => {
    const name = genName('610同名供应商');
    const body = {
      supplier_name: name,
      contact_person: '610校验员',
      contact_phone: '13800000045',
    };

    const first = await apiCallRaw<SupplierRow>(page, 'POST', '/purchase/suppliers', body);
    const supplierId = Number(first?.id);
    expect(supplierId, '[610-1] 首建供应商必须返回正整数主键').toBeGreaterThan(0);
    expect(String(first?.supplier_name), '[610-1] 建商口必须回读提交的 supplier_name').toBe(name);
    try {
      const second = await apiCallExpectFail(page, 'POST', '/purchase/suppliers', body);
      expectBusinessRejection(second, `[610-1] 同名供应商 ${name} 第二次建档必须业务拒绝`);
      expect(
        failureCode(second),
        `[610-1] 拒绝机器码必须是 BUSINESS_ERROR，实际 ${JSON.stringify(second.code)}`
      ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
      expect(
        String(second.message ?? ''),
        '[610-1] 拒因必须回显用户提交的同名值，否则无法定位冲突源'
      ).toContain(name);

      const list = await apiCallRaw<SupplierPage>(
        page,
        'GET',
        `/purchase/suppliers?keyword=${encodeURIComponent(name)}&page=1&page_size=100`
      );
      expect(Array.isArray(list.items), '[610-1] 供应商列表口必须回 items 数组').toBe(true);
      expect(list.total, `[610-1] 同名 ${name} 只能有 1 行，实际 ${list.total}`).toBe(1);
      expect(
        list.items.some(row => Number(row.id) === supplierId && String(row.supplier_name) === name),
        '[610-1] 唯一一行必须是首建的自建供应商'
      ).toBe(true);
    } finally {
      await tryCleanup(page, 'DELETE', `/purchase/suppliers/${supplierId}`, '[610-1] 自建供应商');
    }
  });
});
