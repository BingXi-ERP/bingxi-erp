/**
 * 小程序侧权限判定——单一判据模块。
 *
 * 数据源（唯一权威，不自造第二套词表）：
 * - 后端登录出参 permissions：`"{resource}:{action}"` 资源键清单
 *   （backend/src/handlers/auth_handler.rs LoginResponse，admin 注入 `*:*`，
 *   其余角色来自 role_permission 表 allowed=true 的角色级授权行）；
 *   经 libs/utils/apiGateway.js adaptLogin 落 storage 键 resCodeList。
 * - 判定语义与 Web 端 frontend/src/router/index.ts::hasRoutePermission 同源，
 *   该函数本身与后端 middleware/permission.rs::matches_permission 的
 *   资源段等值＋`*` 通配、动作段等值＋`*` 通配一致；Web 侧另对
 *   read/view、update/edit 两套 action 命名做兼容（后端注释明示命名不统一），
 *   本模块逐字移植该兼容，保证三端对同一 permissions 清单判得一致。
 *
 * 与 Web 的差异只在声明面：小程序各入口一律声明**细资源键**
 * （如 "orders:read"），不使用 Web 路由的粗域键（COARSE_DOMAIN_RESOURCES
 * 是 Web router meta 的便利层，不在本模块复刻，避免多一份会漂移的表）。
 */
var permEntries = require("./permEntries.js");

/** 拆分权限码 "{resource}:{action}"（无冒号时动作段为空串），与 Web splitPermissionCode 同式 */
function splitPermissionCode(code) {
  var sepIdx = String(code).indexOf(":");
  return sepIdx > 0
    ? { resource: String(code).slice(0, sepIdx), action: String(code).slice(sepIdx + 1) }
    : { resource: String(code), action: "" };
}

/** 动作等价匹配，与 Web actionEquivalent 同式（read/view 等价、update/edit 等价、`*` 通配） */
function actionEquivalent(userAction, requiredAction) {
  if (userAction === "*" || userAction === requiredAction) return true;
  if (
    (userAction === "read" && requiredAction === "view") ||
    (userAction === "view" && requiredAction === "read")
  )
    return true;
  if (
    (userAction === "update" && requiredAction === "edit") ||
    (userAction === "edit" && requiredAction === "update")
  )
    return true;
  return false;
}

/**
 * 单个细资源键是否命中 permissions 清单。
 * 语义 = 后端 matches_permission 的资源段与动作段判据（角色级授权行覆盖全部实例，
 * 登录出参不携带 resource_id，故无需 ID 维度判定，与 Web canAccessDetailPermission 一致）。
 */
function matchesCode(required, perms) {
  var req = splitPermissionCode(required);
  return perms.some(function (up) {
    var got = splitPermissionCode(up);
    if (got.resource === "*" && got.action === "*") return true;
    if (got.resource !== req.resource && got.resource !== "*") return false;
    return actionEquivalent(got.action, req.action);
  });
}

/** 读登录落盘的权威 permissions；缺键返回空数组（未登录＝全部不可见，不兜底放行） */
function getPerms() {
  var list;
  try {
    list = wx.getStorageSync("resCodeList");
  } catch (e) {
    return [];
  }
  return Array.isArray(list) ? list : [];
}

/**
 * 入口权限码判定：required 为细资源键或其数组（任一命中即通过）。
 * 空 required 视作公共入口（与 Web 守卫 "无 meta.permission 即放行" 同口径）。
 */
function hasPerm(required, perms) {
  var list = perms || getPerms();
  if (required === undefined || required === null || required === "") return true;
  var reqArr = Array.isArray(required) ? required : [required];
  return reqArr.some(function (code) {
    return matchesCode(code, list);
  });
}

/**
 * 构造页面消费的 userAuthList 映射：视图沿用厂商时代的入口键
 * （"order:saveBilling" 等），键→仓内权威权限码的对应表在
 * libs/utils/permEntries.js 单点声明；判定一律走本模块 hasPerm，
 * 视图里不出现第二套判据。
 * @param {string[]} perms 权威 permissions 清单（缺省自动读 storage）
 * @param {string[]} uiKeys 需要取值的入口键（UI 侧写死出现的键），缺省全表
 */
function buildAuthMap(perms, uiKeys) {
  var list = perms || getPerms();
  var keys = uiKeys || Object.keys(permEntries.ENTRY_PERMS);
  var map = {};
  keys.forEach(function (k) {
    var def = permEntries.ENTRY_PERMS[k];
    if (!def) {
      // 表内未登记的键不判可见（宁缺勿假），矩阵校验脚本会点名缺登记项
      map[k] = false;
      return;
    }
    if (def.public) {
      map[k] = true;
      return;
    }
    // 仓内无对应能力（codes 为空）的入口：显式隐藏，等能力面拍板接线后放开
    map[k] = def.codes && def.codes.length > 0 ? hasPerm(def.codes, list) : false;
  });
  return map;
}

module.exports = {
  splitPermissionCode: splitPermissionCode,
  actionEquivalent: actionEquivalent,
  matchesCode: matchesCode,
  getPerms: getPerms,
  hasPerm: hasPerm,
  buildAuthMap: buildAuthMap,
};
