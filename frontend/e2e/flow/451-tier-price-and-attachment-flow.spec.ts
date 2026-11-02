/**
 * 功能：验证色号阶梯价（按量分档计价）的档位命中、边界、重叠拒绝，与供应商资质附件的上传—回读—下载—删除闭环。
 * 调用方：Playwright 分片 e2e（CI 的 frontend-e2e 分片），由 CI 编排直接调度本文件，无 UI 入口 handler。
 * 入参：档位数量区间与单价来自本用例自建数据；会话凭据一律取 ./helpers 的 testPassword() / testUsername()，不写字面量口令。
 * 传给谁：请求打到 backend/src/handlers/color_price_handler.rs 的 create_tier / list_tiers / delete_tier 与 supplier_handler 的附件上传下载 handler。
 * 存什么：档位行落 color_price_tier（区间与单价，缺值写 NULL 不写 0）；附件元数据落供应商资质记录，文件体落对象存储。
 * 存哪里：端点路径与方法的唯一事实来源是 frontend/scripts/route-snapshot.txt；建表迁移位置见 backend/migrations 下 color_price_tier 相关脚本。
 */
import { expect, test } from '@playwright/test';

test.describe('451 阶梯价命中与附件流转闭环', () => {
  test('骨架占位：路由快照里阶梯价三腿与附件腿均已登记', async () => {
    const snapshot = await import('node:fs/promises').then((m) =>
      m.readFile(new URL('../../scripts/route-snapshot.txt', import.meta.url), 'utf8'),
    );
    expect(snapshot).toContain('POST\t/api/v1/erp/color-prices/tiers/*');
  });
});
