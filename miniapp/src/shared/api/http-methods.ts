/** 幂等且符合重试/鉴权语义的方法集合（HTTP 语义方法，大写）。 */
export const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
