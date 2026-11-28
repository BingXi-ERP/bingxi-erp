interface PermissionCode {
  resource: string
  action: string
}

function split(code: string): PermissionCode {
  const index = code.indexOf(':')
  return index > 0
    ? { resource: code.slice(0, index), action: code.slice(index + 1) }
    : { resource: code, action: '' }
}

function actionMatches(got: string, required: string): boolean {
  return got === '*' || got === required
}

/** 后端权限码的唯一匹配入口； required 数组按“任一命中”语义执行。 */
export function hasPermission(required: string | string[], permissions: string[]): boolean {
  const list = Array.isArray(required) ? required : [required]
  return list.some((wanted) => {
    const req = split(wanted)
    return permissions.some((code) => {
      const got = split(code)
      return (
        (got.resource === '*' || got.resource === req.resource) &&
        actionMatches(got.action, req.action)
      )
    })
  })
}
