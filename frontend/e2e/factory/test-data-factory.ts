// 测试数据工厂：统一封装面料业务 E2E 的高频造数入口，替代散落在各 spec 内重复拼装的 apiCall。
// 调用方：需要自建客户/线索/色卡的 E2E spec（首个消费者见 data-factory.spec.ts）。
// 入参：构造函数收当前会话 Page 与日志标签；各原子方法收可选字段覆盖。
// 传给谁：返回实体 id 与编号供 spec 建单、回读；cleanup() 回收本工厂创建的实体。
// 存什么：仅实例内待清理清单（path + label），不落业务库。
// 存哪里：清单在工厂实例字段；实体本身经后端 API 写入测试库。
import type { Page } from '@playwright/test';
import { apiCall, genCode, genName, seedColorCardArchive, tryCleanup } from '../flow/helpers';

type CleanupTarget = { path: string; label: string };

export class TestDataFactory {
  private readonly cleanupTargets: CleanupTarget[] = [];

  constructor(
    private readonly page: Page,
    private readonly tag = 'TestDataFactory'
  ) {}

  async createCustomer(overrides: { name?: string; status?: string } = {}): Promise<{
    id: number;
    name: string;
  }> {
    const name = overrides.name ?? `E2E客户${genName('DF')}`;
    const status = overrides.status ?? 'active';
    // 契约 Customer：customer_name/status 必填，返回体必含 id；缺 id 即抛错，不退回假 id
    const created = await apiCall<{ id?: number }>(this.page, 'POST', '/crm/customers', {
      customer_name: name,
      status,
    });
    if (!created.data?.id) {
      throw new Error(`[${this.tag}] 客户创建未返回 id：${JSON.stringify(created)}`);
    }
    const id = created.data.id;
    this.cleanupTargets.push({ path: `/crm/customers/${id}`, label: `客户 ${name}` });
    console.warn(`[${this.tag}] 客户已建 id=${id} name=${name}`);
    return { id, name };
  }

  async createLead(overrides: { prefix?: string; amount?: string } = {}): Promise<{
    id: number;
    leadNo: string;
  }> {
    const prefix = overrides.prefix ?? 'E2E-DFLEAD';
    const amount = overrides.amount ?? '50000';
    const leadNo = genCode(prefix);
    // 载荷对照 02-write-idor.spec.ts 已验证的线索建单字段，避免自造键导致 CI 红
    const created = await apiCall<{ id?: number }>(this.page, 'POST', '/crm/leads', {
      lead_no: leadNo,
      lead_status: 'new',
      company_name: `工厂造数 ${leadNo}`,
      contact_name: '测试联系人',
      lead_source: 'WEBSITE',
      mobile_phone: '13700137001',
      email: `${leadNo}@test.com`,
      priority: 'LOW',
      estimated_amount: amount,
    });
    if (!created.data?.id) {
      throw new Error(`[${this.tag}] 线索创建未返回 id：${JSON.stringify(created)}`);
    }
    const id = created.data.id;
    this.cleanupTargets.push({ path: `/crm/leads/${id}`, label: `线索 ${leadNo}` });
    console.warn(`[${this.tag}] 线索已建 id=${id} leadNo=${leadNo}`);
    return { id, leadNo };
  }

  async createColorCard(): Promise<{
    cardId: number;
    colorCode: string;
    colorName: string;
    itemId: number;
  }> {
    // 色卡档案是归档语义（seedColorCardArchive 内部不清理），故不加入 cleanupTargets
    const result = await seedColorCardArchive(this.page, { context: this.tag });
    console.warn(
      `[${this.tag}] 色卡已建 cardId=${result.cardId} colorCode=${result.colorCode}（归档语义不回收）`
    );
    return result;
  }

  get pendingCount(): number {
    return this.cleanupTargets.length;
  }

  async cleanup(): Promise<void> {
    // 后建先删（LIFO），避免下游单据引用未释放时先删上游
    for (const target of [...this.cleanupTargets].reverse()) {
      await tryCleanup(this.page, 'DELETE', target.path, target.label);
    }
    this.cleanupTargets.length = 0;
  }
}
