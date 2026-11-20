/**
 * 531 看板账龄档位配置契约。
 *
 * 功能：钉住 GET /dashboard/aging-config 的固定四桶与默认单位，防止账龄看板颜色或区间被静默改动。
 * 调用方：账龄看板与风险提示；本用例只做 API 回归，不打开页面。
 * 入参：仅 loginViaUI 的 admin 会话，无 query、无 body、不造数。
 * 传给谁：请求经 flow/helpers 发出，路径相对前端 baseURL /api/v1/erp。
 * 存什么：不出参落库；响应必须与 handler 的固定四桶逐字段相等。
 * 存哪里：backend/src/handlers/dashboard_handler.rs:369-417 的 AgingBucketConfig。
 *
 * 判据出处：路由在 frontend/scripts/route-snapshot.txt:437，挂在 /dashboard/aging-config；
 * 四桶依次为 0-30天、31-60天、61-90天、90天以上，最后一桶 max_days 必须为 null。
 */
import { test, expect } from '../diagnose-fixture';
import { apiCallRaw, loginViaUI } from '../flow/helpers';

interface AgingBucket {
  name: string;
  min_days: number;
  max_days: number | null;
  color: string;
}

interface AgingConfig {
  buckets: AgingBucket[];
  default_unit: string;
}

const EXPECTED: AgingConfig = {
  buckets: [
    { name: '0-30天', min_days: 0, max_days: 30, color: '#52c41a' },
    { name: '31-60天', min_days: 31, max_days: 60, color: '#faad14' },
    { name: '61-90天', min_days: 61, max_days: 90, color: '#fa8c16' },
    { name: '90天以上', min_days: 91, max_days: null, color: '#f5222d' },
  ],
  default_unit: '天',
};

test('531-01 账龄档位配置四桶与默认单位逐字段回读不漂移', async ({ page }) => {
  await loginViaUI(page);
  const config = await apiCallRaw<AgingConfig>(page, 'GET', '/dashboard/aging-config');
  console.warn('[531] GET /dashboard/aging-config 已返回，开始逐字段核对');

  expect(config, '账龄配置须逐字段等于后端固定四桶').toEqual(EXPECTED);
  for (const bucket of config.buckets) {
    expect(
      Object.keys(bucket).sort(),
      `${bucket.name} 只允许 name/min_days/max_days/color 四键`
    ).toEqual(['color', 'max_days', 'min_days', 'name']);
  }
  expect(Object.keys(config).sort(), '配置只含 buckets 与 default_unit 两键').toEqual([
    'buckets',
    'default_unit',
  ]);
});
