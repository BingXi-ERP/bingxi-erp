/**
 * useAndroidBack.ts - 安卓系统返回手势的前端桥
 *
 * 功能：安卓 WebView 手势/物理返回默认直接退出页面；本 composable 提供一个栈式
 *      处理器注册表，让已打开的弹层（搜索面板/导航抽屉等）先消费返回手势，
 *      无弹层时才走浏览器默认后退。仅安卓壳环境装 popstate 哨兵，桌面浏览器
 *      不改变任何行为。
 * 调用方 MainLayout.vue（接线搜索面板与移动抽屉）、tests/unit/android-back.test.ts。
 * 入参 无（应用级单例；栈由 push/dispose 维护）。
 * 传给谁 history popstate；处理器返回 true 表示已消费本次返回。
 * 存什么 处理器栈（模块级数组）与哨兵位标记。
 * 存哪里 内存 + history 栈顶哨兵条目。
 */
import { isAndroidClient } from '@/utils/bluetooth-print';

export type AndroidBackHandler = () => boolean;

const handlers: AndroidBackHandler[] = [];
let sentinelArmed = false;
let listenerAttached = false;

function onPopState(): void {
  if (handlers.length === 0) return;
  const top = handlers[handlers.length - 1];
  if (top()) {
    // 处理器已消费本次返回：补一个哨兵位，保证下一次手势仍先进入本监听。
    window.history.pushState({ androidBackSentinel: true }, '');
  }
}

function ensureListener(): void {
  if (listenerAttached || typeof window === 'undefined') return;
  window.addEventListener('popstate', onPopState);
  listenerAttached = true;
}

function armSentinel(): void {
  if (sentinelArmed || typeof window === 'undefined') return;
  window.history.pushState({ androidBackSentinel: true }, '');
  sentinelArmed = true;
}

/**
 * 注册返回处理器；仅安卓壳环境生效，其余环境返回空操作。
 * 返回 dispose 函数：移除处理器并撤销哨兵。
 */
export function pushAndroidBackHandler(handler: AndroidBackHandler): () => void {
  if (!isAndroidClient()) return () => {};
  ensureListener();
  armSentinel();
  handlers.push(handler);
  return () => {
    const idx = handlers.indexOf(handler);
    if (idx >= 0) handlers.splice(idx, 1);
    disarmSentinelIfIdle();
  };
}

function disarmSentinelIfIdle(): void {
  if (handlers.length > 0 || !sentinelArmed || typeof window === 'undefined') return;
  // 栈空后撤销哨兵：history.back 只清哨兵位（不触发路由后退），状态回未武装。
  sentinelArmed = false;
  window.history.back();
}

/** 测试钩子：清空栈与哨兵状态（仅测试用，业务代码不得调用）。 */
export function resetAndroidBackForTest(): void {
  handlers.length = 0;
  sentinelArmed = false;
  listenerAttached = false;
}
