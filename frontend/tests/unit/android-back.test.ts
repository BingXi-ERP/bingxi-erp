/**
 * android-back.test.ts - 安卓系统返回桥行为锁。
 *
 * 功能 锁定 useAndroidBack 的栈式优先级、消费短路、dispose 语义、
 *      非安卓环境零副作用与哨兵撤销。
 * 调用方 vitest run（tests/unit）。
 * 入参 无（自包含用例）。
 * 传给谁 expect 断言。
 * 存什么 只在内存记录 pushState/back 调用。
 * 存哪里 本文件。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = vi.hoisted(() => ({
  android: false,
  pushStateCalls: 0,
  backCalls: 0,
}));

vi.mock('@/utils/bluetooth-print', () => ({
  isAndroidClient: () => state.android,
}));

import { pushAndroidBackHandler, resetAndroidBackForTest } from '@/composables/useAndroidBack';

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36';

function setAndroid(value: boolean): void {
  state.android = value;
  Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: ANDROID_UA });
}

describe('useAndroidBack', () => {
  beforeEach(() => {
    state.pushStateCalls = 0;
    state.backCalls = 0;
    vi.spyOn(window.history, 'pushState').mockImplementation(() => {
      state.pushStateCalls++;
    });
    vi.spyOn(window.history, 'back').mockImplementation(() => {
      state.backCalls++;
    });
    setAndroid(true);
  });

  afterEach(() => {
    resetAndroidBackForTest();
    vi.restoreAllMocks();
  });

  it('后注册的处理器先消费（栈式优先级）', () => {
    const order: string[] = [];
    const disposeBottom = pushAndroidBackHandler(() => {
      order.push('bottom');
      return true;
    });
    pushAndroidBackHandler(() => {
      order.push('top');
      return true;
    });
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(order, '栈顶应先于栈底被调用').toEqual(['top']);
    disposeBottom();
  });

  it('处理器返回 false 时不短路，继续询问下一层', () => {
    const order: string[] = [];
    pushAndroidBackHandler(() => {
      order.push('declined');
      return false;
    });
    pushAndroidBackHandler(() => {
      order.push('consumed');
      return true;
    });
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(order).toEqual(['consumed']);
  });

  it('消费后补哨兵位（pushState 一次）', () => {
    const dispose = pushAndroidBackHandler(() => true);
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(state.pushStateCalls, '武装 1 次 + 消费后补 1 次').toBe(2);
    dispose();
  });

  it('dispose 后处理器不再被调用，栈空撤销哨兵', () => {
    const handler = vi.fn(() => true);
    const dispose = pushAndroidBackHandler(handler);
    dispose();
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(handler, 'dispose 后不应再被调用').not.toHaveBeenCalled();
    expect(state.backCalls, '栈空应撤销哨兵').toBe(1);
  });

  it('非安卓环境注册为空操作，不装监听不改历史', () => {
    setAndroid(false);
    const handler = vi.fn(() => true);
    const dispose = pushAndroidBackHandler(handler);
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(handler).not.toHaveBeenCalled();
    expect(state.pushStateCalls, '非安卓不应武装哨兵').toBe(0);
    dispose();
    expect(state.backCalls).toBe(0);
  });

  it('处理器全部返回 false 时不补哨兵也不调 back', () => {
    pushAndroidBackHandler(() => false);
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(state.pushStateCalls, '仅武装 1 次，未补哨兵').toBe(1);
    expect(state.backCalls, '未消费不应撤销哨兵').toBe(0);
    // 未消费时哨兵位已被浏览器用掉：内部标记须回未武装，
    // dispose 不得再按"还有哨兵"多触发一次 back。
    resetAndroidBackForTest();
  });

  it('未消费后 dispose 不多触发 back', () => {
    const dispose = pushAndroidBackHandler(() => false);
    window.dispatchEvent(new PopStateEvent('popstate'));
    dispose();
    expect(state.backCalls, '哨兵已用掉，dispose 不应再 back').toBe(0);
  });
});
