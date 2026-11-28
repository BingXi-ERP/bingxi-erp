// miniapp/src/shared/api/logger.ts

/**
 * 结构化日志单点出口（阶段1 Task 5）。
 * console.info/warn/error 是小程序运行期唯一可用的日志面；三条通道都输出
 * 「消息名 + 结构化上下文」两段，供后续日志采集按消息名聚合。
 * 红线：context 只允许方法、路径、状态码、耗时、traceId 等元数据，
 * 禁止放入令牌、Cookie、会话快照或任何用户敏感字段。
 */
export type LogLevel = 'info' | 'warn' | 'error'

export interface LogContext {
  traceId?: string
  method?: string
  path?: string
  status?: number
  durationMs?: number
  [key: string]: unknown
}

const PREFIX = '[miniapp]'

function emit(level: LogLevel, message: string, context: LogContext): void {
  const sink = level === 'info' ? console.info : level === 'warn' ? console.warn : console.error
  sink(`${PREFIX} ${message}`, context)
}

export const logger = {
  info(message: string, context: LogContext = {}): void {
    emit('info', message, context)
  },
  warn(message: string, context: LogContext = {}): void {
    emit('warn', message, context)
  },
  error(message: string, context: LogContext = {}): void {
    emit('error', message, context)
  },
}
