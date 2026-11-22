// 数据工厂消费用例：验证 TestDataFactory 造出的实体真实落库、可按 id 回读、并可统一回收。
// 功能：用工厂建客户与线索，逐项 GET 回读确认字段与唯一编号一致，覆盖目标 4.1-C 客户档案落库。
// 调用方：Playwright 分片（frontend/playwright.config.ts），依赖 diagnose-fixture 的登录会话。
// 入参：无外部入参；工厂自带唯一编号前缀与字段覆盖能力。
// 传给谁：回读结果只用于本用例断言；实体由工厂 cleanup() 在 finally 中回收。
// 存什么：不落额外数据；客户/线索实体的生命周期由工厂追踪。
// 存哪里：断言与日志进测试报告；实体写入测试库对应业务表。
import { test, expect } from '../diagnose-fixture';
import { apiCallRaw } from '../flow/helpers';
import { TestDataFactory } from './test-data-factory';

test.describe('统一测试数据工厂（DC-003）', () => {
  test('工厂造数落库可按 id 回读，cleanup 后待清理清单清空', async ({ page }) => {
    const factory = new TestDataFactory(page, 'data-factory.spec');
    try {
      const customer = await factory.createCustomer();
      const lead = await factory.createLead();

      expect(factory.pendingCount, '客户+线索应进入待清理清单').toBe(2);

      const readCustomer = await apiCallRaw<{ id: number; customer_name: string }>(
        page,
        'GET',
        `/crm/customers/${customer.id}`
      );
      expect(readCustomer.id, '客户按 id 回读应一致').toBe(customer.id);
      expect(readCustomer.customer_name, '客户名称回读应与工厂写入一致').toBe(customer.name);

      const readLead = await apiCallRaw<{ id: number; lead_no: string }>(
        page,
        'GET',
        `/crm/leads/${lead.id}`
      );
      expect(readLead.id, '线索按 id 回读应一致').toBe(lead.id);
      expect(readLead.lead_no, '线索编号回读应与工厂写入一致').toBe(lead.leadNo);
    } finally {
      await factory.cleanup();
    }

    expect(factory.pendingCount, 'cleanup 后备清理清单应清空').toBe(0);
  });
});
