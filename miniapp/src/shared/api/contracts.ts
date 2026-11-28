/**
 * miniapp 与后端的契约常量单一来源（阶段1 Task 3 产出，Task 5 apiClient / Task 6 会话库消费）。
 *
 * 路径一律写成 /api/v1/erp 全量形态：运行时 apiBaseUrl 只是主机地址，base 之后的相对路径
 * 不会被任何一层补全，CI 静态门 scripts/ci/miniapp-contract-check.mjs 对非全量形态直接判 MISS。
 * 本文件的导出常量按端点登记表校验：以 '/' 起头的常量逐条对 frontend/scripts/route-snapshot.txt
 * 核对（任意方法注册即算存在），写错前缀或未注册路由都会被判红，不等它被页面消费；
 * 常量定义必须留在 AST 可解析的子集内（字符串字面量或 `${已解析常量}/段` 模板），
 * 不可解析的导出常量显式判 UNRESOLVED，不提供集合或函数调用的豁免。
 * 端点在此单点定义，页面与 store 只消费常量（直接引用常量名，或经相对路径具名导入引用；
 * 同名常量出现在多个文件且本文件无声明/导入绑定时按歧义判 UNRESOLVED —— 同名那条即使其值来自
 * 函数调用等不可解析形态也算一条绑定，会连带把合法常量的引用判红）。
 * 新增端点常量前先确认快照里有对应行；
 * 例外：MINIAPP_LOGIN_PATH 对应的后端路由由阶段1计划的后续后端任务注册并进入快照，
 * 在后任务落地刷新快照前，门会对该常量判 MISS CONSTANT（契约先行的既定红，非判定器缺陷）。
 */
export const API_BASE_PATH = '/api/v1/erp'

export const AUTH_LOGIN_PATH = `${API_BASE_PATH}/auth/login`

export const AUTH_LOGOUT_PATH = `${API_BASE_PATH}/auth/logout`

export const AUTH_ME_PATH = `${API_BASE_PATH}/auth/me`

export const MINIAPP_LOGIN_PATH = `${API_BASE_PATH}/auth/miniapp/login`
