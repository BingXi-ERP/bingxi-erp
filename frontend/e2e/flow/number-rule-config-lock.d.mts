export interface NumberRuleConfigLockOptions {
  lockPath?: string;
  timeoutMs?: number;
  retryMs?: number;
}

export declare function withNumberRuleConfigLock<T>(
  fn: () => T | Promise<T>,
  options?: NumberRuleConfigLockOptions
): Promise<T>;
