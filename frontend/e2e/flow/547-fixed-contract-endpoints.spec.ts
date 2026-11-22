// 功能：钉三个固定契约端点的稳定出参（AI 健康、凭证类型、网络指标）；调用方 CI e2e flow 分片；
// 入参仅登录态与真实 HTTP GET；传给谁，断言后端在册词表与结构，不读源码文本；
// 存什么，不写库、不建单据；存哪里，无。
// 检测力自证：端点缺失、信封异常、键集漂移或固定词表改写，逐字段断言即红。
import { test, expect } from '../diagnose-fixture';
import { apiCallRaw, loginViaUI } from './helpers';

interface AiHealth {
  status?: string;
  version?: string;
  modules?: Record<string, Record<string, unknown>>;
}

interface VoucherType {
  code?: string;
  name?: string;
}

interface NetworkMetrics {
  requests_per_second?: number;
  average_response_time_ms?: number;
  error_rate?: number;
  active_connections?: number;
  bytes_received?: number;
  bytes_sent?: number;
}

test.describe('547 固定契约端点深度断言', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('547-1 AI 健康端点返回在册状态、版本与两模块元数据', async ({ page }) => {
    const health = await apiCallRaw<AiHealth>(page, 'GET', '/ai/health');
    expect(health, 'AI 健康响应不应为空').toBeTruthy();
    expect(health.status, 'AI 健康状态应固定为 ok').toBe('ok');
    expect(health.version, 'AI 健康版本应固定为 P2-4').toBe('P2-4');
    expect(health.modules, 'AI 健康应返回模块元数据').toBeTruthy();
    const modules = health.modules!;
    expect(Object.keys(modules).sort(), 'AI 健康模块键集应与在册算法元数据一致').toEqual([
      'process_optimization',
      'quality_prediction',
    ]);
    const processOpt = modules.process_optimization;
    const qualityPred = modules.quality_prediction;
    expect(processOpt, '工艺优化模块元数据不应缺失').toBeTruthy();
    expect(qualityPred, '质量预测模块元数据不应缺失').toBeTruthy();
    expect(processOpt!.algorithm, '工艺优化算法应逐字来自服务元数据').toBe('k-NN + 加权平均');
    expect(qualityPred!.algorithm, '质量预测算法应逐字来自服务元数据').toBe('趋势分析 + 风险评分');
    expect(typeof processOpt!.fallback, '工艺优化降级策略应是可读文案').toBe('string');
    expect(typeof qualityPred!.fallback, '质量预测降级策略应是可读文案').toBe('string');
  });

  test('547-2 凭证类型端点返回四类固定词表', async ({ page }) => {
    const types = await apiCallRaw<VoucherType[]>(page, 'GET', '/vouchers/types');
    expect(Array.isArray(types), '凭证类型应为裸数组').toBe(true);
    expect(types).toEqual([
      { code: '记', name: '记账凭证' },
      { code: '收', name: '收款凭证' },
      { code: '付', name: '付款凭证' },
      { code: '转', name: '转账凭证' },
    ]);
  });

  test('547-3 网络指标端点保持固定六字段数值契约', async ({ page }) => {
    const metrics = await apiCallRaw<NetworkMetrics>(page, 'GET', '/dashboard/network-metrics');
    expect(metrics, '网络指标响应不应为空').toBeTruthy();
    const metricObject = metrics!;
    expect(Object.keys(metricObject).sort(), '网络指标键集应固定为六字段').toEqual([
      'active_connections',
      'average_response_time_ms',
      'bytes_received',
      'bytes_sent',
      'error_rate',
      'requests_per_second',
    ]);
    for (const [key, value] of Object.entries(metricObject)) {
      expect(typeof value, `网络指标 ${key} 应为 number`).toBe('number');
      expect(Number.isFinite(value), `网络指标 ${key} 不应为 NaN 或无穷`).toBe(true);
      expect(Number(value) >= 0, `网络指标 ${key} 不应为负数`).toBe(true);
    }
  });
});
