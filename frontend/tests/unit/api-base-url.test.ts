import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { API_BASE_URL, apiUrl, apiWsUrl } from '@/api/base-url';

const srcRoot = resolve(process.cwd(), 'src');

describe('SPA API 前缀单源', () => {
  it('拼接相对路径且不重复前缀', () => {
    expect(apiUrl('/system/info')).toBe(`${API_BASE_URL}/system/info`);
    expect(apiUrl('system/info')).toBe(`${API_BASE_URL}/system/info`);
    expect(apiUrl('/')).toBe(`${API_BASE_URL}/`);
  });

  it('WebSocket 相对地址沿用当前站点', () => {
    expect(apiWsUrl('/ws/notifications')).toBe(
      `ws://localhost:3000${API_BASE_URL}/ws/notifications`
    );
  });

  it('WebSocket 绝对地址使用 API 主机并升级安全协议', () => {
    expect(apiWsUrl('/ws/notifications', 'https://api.example.com/api/v1/erp/')).toBe(
      'wss://api.example.com/api/v1/erp/ws/notifications'
    );
    expect(apiWsUrl('/ws/notifications', 'http://api.example.com/api/v1/erp')).toBe(
      'ws://api.example.com/api/v1/erp/ws/notifications'
    );
  });

  it('request 与 raw fetch 不得再传完整 ERP 前缀', () => {
    const files = [
      'store/system.ts',
      'router/index.ts',
      'views/Setup.vue',
      'utils/performance.ts',
      'utils/monitor.ts',
    ];

    for (const file of files) {
      const source = readFileSync(resolve(srcRoot, file), 'utf8');
      expect(source, `${file} 的 request 路径必须相对 baseURL`).not.toMatch(
        /request\.(?:get|post|put|patch|delete)(?:<[^>]+>)?\(\s*['"`]\/api\/v1\/erp/
      );
      expect(source, `${file} 的 fetch 必须使用统一 API 地址`).not.toMatch(
        /fetch\(\s*['"`]\/api\/v1\/erp/
      );
    }
  });

  it('运行时 baseURL 只允许在 api/base-url.ts 声明一次', () => {
    const files = [
      'api/request.ts',
      'api/certificate-of-origin.ts',
      'api/export-inspection.ts',
      'api/textile-safety.ts',
      'api/tax-rebate.ts',
      'composables/useNotificationWs.ts',
      'utils/export.ts',
    ];

    for (const file of files) {
      const source = readFileSync(resolve(srcRoot, file), 'utf8');
      expect(source, `${file} 必须复用 API_BASE_URL`).not.toContain(
        "import.meta.env.VITE_API_BASE_URL || '/api/v1/erp'"
      );
      expect(source, `${file} 不得残留旧 BASE_URL 常量`).not.toMatch(/\bBASE_URL\b/);
    }
  });
});
