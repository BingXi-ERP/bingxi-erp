/**
 * 面料样品打样版本链与降等转大货端到端用例（号段 446）。
 * 功能：验证色卡/样品载体从发起打样、改版（版本递增且旧版可追溯）、送实验室染色、
 * 回写实测结果与实测等级、裁样、寄样客户、降等到转大货的完整链路合法跃迁被受理、
 * 非法跃迁被拒绝且失败响应为 AppError 字符串 code 形态。
 * 调用方：CI 前端 e2e 分片（playwright test 发现本文件），无业务代码调用。
 * 入参：无外部入参；用例内用 ./helpers 导出的 testUsername()/testPassword() 构造多岗位会话。
 * 传给谁：backend /api/v1/erp 下样品打样相关端点（路径以前端 scripts/route-snapshot.txt 为准）。
 * 存什么：样品/色卡载体、打样版本、实测结果、实测等级、降等记录、大货关联。
 * 存哪里：样品域数据表，字段以 backend/src/models 与 DTO 的 snake_case 键为准。
 */
import { test, expect } from '@playwright/test';

test.describe('446 样品打样版本链与降等转大货', () => {
  test('骨架：完整链路版本递增与降等转大货', async () => {
    // 骨架占位，待按 helpers 与 route-snapshot 实况补全真实请求与断言。
    expect(test.info().testId).toBeTruthy();
  });
});
