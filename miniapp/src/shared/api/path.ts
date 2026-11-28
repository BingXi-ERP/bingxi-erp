export type ApiPathParams = Record<string, string | number>

export function resolveApiPath(path: string, params: ApiPathParams = {}): string {
  const placeholders = [...path.matchAll(/\{([^}]+)\}/g)]
    .map((match) => match[1])
    .filter((key): key is string => key !== undefined)
  const expected = new Set(placeholders)
  const provided = new Set(Object.keys(params))

  for (const key of expected) {
    if (!provided.has(key)) throw new Error(`Missing path parameter: ${key}`)
  }
  for (const key of provided) {
    if (!expected.has(key)) throw new Error(`Unexpected path parameter: ${key}`)
  }

  return path.replace(/\{([^}]+)\}/g, (_match, key: string) => {
    const value = params[key]
    if (value === undefined) throw new Error(`Missing path parameter: ${key}`)
    return encodeURIComponent(String(value))
  })
}
