// 531 看板账龄配置契约（纯 GET）。
// 后端判据：routes/system.rs:79-83 注册 GET /dashboard/aging-config；
//   handlers/dashboard_handler.rs:366-382 定义出参 AgingBucketConfig{buckets,default_unit} 与
//   AgingBucket{name,min_days,max_days,color}；:385-419 返回固定四桶与默认单位「天」，
//   末桶 max_days 为 None（JSON null），其余三桶为 Some(整数天)。
// 路径核对：route-snapshot.txt:437 的注册路径为 /api/v1/erp/dashboard/aging-config，
//   前端调用只写 baseURL 之后的 /dashboard/aging-config。
// 纯 GET：不建数据、不清理；键集合与值逐字符比较，不用兜底掩盖缺键。
import { expect, test } from '../diagnose-fixture';
import { apiCallRaw, loginViaUI } from '../flow/helpers';

interface AgingBucket {
  name: string;
  min_days: number;
  max_days: number | null;
  color: string;
}

interface AgingBucketConfig {
  buckets: AgingBucket[];
  default_unit: string;
}

const TOP_KEYS = ['buckets', 'default_unit'];
const BUCKET_KEYS = ['color', 'max_days', 'min_days', 'name'];
const EXPECTED_BUCKETS: AgingBucket[] = [
  { name: '0-30天', min_days: 0, max_days: 30, color: '#52c41a' },
  { name: '31-60天', min_days: 31, max_days: 60, color: '#faad14' },
  { name: '61-90天', min_days: 61, max_days: 90, color: '#fa8c16' },
  { name: '90天以上', min_days: 91, max_days: null, color: '#f5222d' },
];

test('531-01 看板账龄配置固定四桶与默认单位逐字段回读', async ({ page }) => {
  await loginViaUI(page);
  const config = await apiCallRaw<AgingBucketConfig>(page, 'GET', '/dashboard/aging-config');
  console.warn('[531] GET /dashboard/aging-config 已返回，开始逐字段核对');

  expect(Object.keys(config).sort(), '[531] 顶层只允许 buckets/default_unit 两键').toEqual(
    TOP_KEYS
  );
  expect(config.default_unit, '[531] 默认单位须逐字符等于「天」').toBe('天');
  expect(Array.isArray(config.buckets), '[531] buckets 须为数组').toBe(true);
  expect(config.buckets, '[531] 四桶顺序、名称、天数边界与颜色须逐字段一致').toEqual(
    EXPECTED_BUCKETS
  );

  for (const bucket of config.buckets) {
    expect(
      Object.keys(bucket).sort(),
      `[531] ${bucket.name} 只允许 name/min_days/max_days/color 四键`
    ).toEqual(BUCKET_KEYS);
    expect(
      Number.isInteger(bucket.min_days),
      `[531] ${bucket.name} min_days 须整数，实际=${JSON.stringify(bucket.min_days)}`
    ).toBe(true);
    if (bucket.max_days === null) {
      expect(bucket.name, '[531] 唯一无上界桶须为 90天以上').toBe('90天以上');
    } else {
      expect(
        Number.isInteger(bucket.max_days),
        `[531] ${bucket.name} max_days 须整数或 null，实际=${JSON.stringify(bucket.max_days)}`
      ).toBe(true);
    }
  }
});
