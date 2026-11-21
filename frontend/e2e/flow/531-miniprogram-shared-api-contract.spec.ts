// 微信小程序独立用例集 · 第一层：与 PC/H5 共用业务链路的 API 契约
//
// 守的是什么：小程序与 PC/H5 共用同一套 /api/v1/erp 端点与统一错误信封。小程序原生
// 运行时（授权登录、订阅消息、扫码、分享、图片预览）在 ubuntu-latest CI 上无法驱动，
// 登记为手工回归边界，不写成会被空跑的 spec；本文件只钉"共用业务链路"的服务面契约：
//   - 小程序实际调用的标准 CRUD 资源，对不存在的 id 恒返回 404 + NOT_FOUND 机器码；
//   - 统一错误信封四键（message 为脱敏固定文案，不断言细节；trace_id 非空；timestamp
//     为 epoch 秒数）。
// 这些断言不依赖浮动业务数据、不写库、不 mock，可进 flow 分片常驻回归（新建独立
// 目录不会被 CI 分片扫到，那样等于假绿，故按仓库惯例落 flow 目录）。
//
// 调用方：CI flow 分片（按当轮用例全集哈希均分，新 spec 会进入分片）。
// 入参：无。
// 传给谁：无（本文件是被测契约的断言方，不向其它模块输出）。
// 存什么：不写库、不改状态，全部为只读 GET 负例。
// 存哪里：不存；trace_id 仅断言存在与非空，不落盘。
import { test, expect } from '../diagnose-fixture';
import { APP_ERROR_CODES, apiCallExpectFail, loginViaUI } from './helpers';

/** 不存在的业务记录 id：取远超自增序列的高位值，避免撞上分片库真实记录（同 459 范式） */
const MISSING_ID = 99999999;

test.describe('小程序独立用例集 · 共用业务链路 API 契约', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  const readEndpoints = [
    { name: '客户档案详情', path: `/crm/customers/${MISSING_ID}` },
    { name: '面料产品详情', path: `/products/${MISSING_ID}` },
    { name: '销售订单详情', path: `/sales/orders/${MISSING_ID}` },
  ] as const;

  for (const { name, path } of readEndpoints) {
    test(`${name}：记录不存在 → 404 + NOT_FOUND + 统一错误信封`, async ({ page }) => {
      const fail = await apiCallExpectFail(page, 'GET', path);
      expect(fail.status, `${name}不存在记录应 404`).toBe(404);
      expect(fail.code, `${name}错误机器码应为 NOT_FOUND`).toBe(APP_ERROR_CODES.NOT_FOUND);
      expect(typeof fail.message, '错误信封应带 message（脱敏固定文案）').toBe('string');
      expect(typeof fail.trace_id, '错误信封应带 trace_id').toBe('string');
      expect((fail.trace_id as string).length, 'trace_id 应非空').toBeGreaterThan(0);
      expect(typeof fail.timestamp, '错误信封应带 timestamp（epoch 秒数）').toBe('number');
    });
  }
});
