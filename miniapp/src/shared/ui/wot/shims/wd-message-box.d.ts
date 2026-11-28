/**
 * wot-design-uni 的 composable 类型补位，理由与盲区范围同 shims/wd-toast.d.ts：
 * 只把 specifier 指到声明文件，避免把第三方未收紧的实现源码纳入本项目的类型检查；
 * useMessage 的导出存在性与签名不受 vue-tsc 校验，由 tests/contract/wot-runtime-api.test.ts
 * 在 CI 里对真实模块断言兜住。上游给出声明文件后删除本 shim。
 */
import type { Message } from 'wot-design-uni/components/wd-message-box/types'

export declare function useMessage(selector?: string): Message
