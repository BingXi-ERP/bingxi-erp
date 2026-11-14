import { test, expect } from './helpers';

// 调用面（baseURL = /api/v1/erp，helper 内相对路径）：
// POST /api/v1/erp/lab-dip/resamples 建复样记录
// GET /api/v1/erp/lab-dip/resamples/{id} 复样详情
// POST /api/v1/erp/lab-dip/resamples/{id}/result 录复样结果
// POST /api/v1/erp/lab-dip/resamples/{id}/tech-card 发工艺卡
// GET /api/v1/erp/lab-dip/resamples/by-request/{request_id} 按打样申请单列举

test('511 骨架占位，待补全', async () => {
  expect(true).toBe(true);
});
