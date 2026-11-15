/**
 * 入口键 → 仓内权威权限码 对应表（单一声明点）。
 *
 * 视图层沿用厂商入口键（userAuthList['order:saveBilling'] 等形态）不变，
 * 判定全部经 libs/utils/perm.js::hasPerm 走登录出参 permissions（"{resource}:{action}"）。
 * 本表只是"入口需要哪些码"的声明面（等价 Web 路由 meta.permission），
 * 不是第二套判据；码面必须能在后端授权矩阵
 * （backend/src/services/init_service_ops/permission.rs 的角色分组 +
 *  utils/admin_checker 的 admin `*:*` 注入）里被命中或通配命中，
 * 由 E:/tmp/mp_audit/perm_matrix.mjs 逐角色逐入口验证，登记不上的直接点名。
 *
 * 字段含义：
 * - codes：任一命中即放行；空数组＝仓内无对应能力（见 note），入口显式隐藏，
 *   不放行任何角色——点了必 404/403 的入口不假装可用，待能力面拍板（任务 #213）
 *   接线后回填 codes 即放开。
 * - public：无需权限码的本地能力入口（纯 storage/本地逻辑，后端无对应受权资源）。
 * - evidence：入口实际调用的仓内端点或"仓内无端点"的判据出处。
 */
var ENTRY_PERMS = {
  // ===== 销售单域（libs/services/ServicesOrder.js → /api/v1/erp/sales/orders*）=====
  "order:saveBilling": {
    codes: ["orders:create"],
    evidence: "POST /api/v1/erp/sales/orders 建单",
  },
  "order:query": {
    codes: ["orders:read"],
    evidence: "GET /api/v1/erp/sales/orders 列表",
  },
  "order:manage": {
    codes: ["orders:read"],
    evidence: "tab 销售单列表页 GET /api/v1/erp/sales/orders",
  },
  "order:cancel": {
    codes: ["orders:cancel"],
    evidence: "POST /api/v1/erp/sales/orders/{id}/cancel",
  },
  "order:closeOrder": {
    codes: ["orders:cancel"],
    evidence: "同 cancel 端点（关单＝作废该单）",
  },
  "order:refund": {
    codes: ["sales-returns:create"],
    evidence: "POST /api/v1/erp/sales/sales-returns（ServicesReturn.js）",
  },
  "order:cancelRefund": {
    codes: ["sales-returns:update"],
    evidence: "退货单撤销走 PUT /api/v1/erp/sales/sales-returns/{id}",
  },
  "order:print": {
    codes: [],
    note: "小票打印走厂商 BLE 打印域 /app-api/neadend/print/*，仓内无端点（#213 硬件打印族）",
    evidence: "ServicesPrint.js 除商品读腿外全部 /app-api/*",
  },

  // ===== 产品域（/api/v1/erp/products*、/api/v1/erp/product-categories*）=====
  "goods:query": {
    codes: ["products:read"],
    evidence: "GET /api/v1/erp/products（ServicesCard.js）",
  },
  "goods:goodsImgSearch": {
    codes: ["products:read"],
    evidence: "GET /api/v1/erp/search/products 以图搜布的产品腿",
  },
  "goods:add": {
    codes: ["products:create"],
    evidence: "POST /api/v1/erp/products（manager 等持 products:* 角色经通配命中）",
  },
  "goods:manage": {
    codes: ["products:update"],
    evidence: "PUT /api/v1/erp/products/{id}",
  },
  "goods:delete": {
    codes: ["products:delete"],
    evidence: "DELETE /api/v1/erp/products/{id}（ServicesCard.js）",
  },
  "goods:category:manage": {
    codes: ["product-categories:update"],
    evidence: "POST /api/v1/erp/product-categories 与分类挂接腿",
  },

  // ===== 客户域（/api/v1/erp/crm/customers*）=====
  "crm:query": {
    codes: ["customers:read"],
    evidence: "GET /api/v1/erp/crm/customers（ServicesCustomer.js）",
  },
  "crm:contact": {
    codes: ["customers:read"],
    evidence: "客户联系方式随行数据，读权限同列表腿",
  },
  "crm:saveCustomer": {
    codes: ["customers:create"],
    evidence: "POST /api/v1/erp/crm/customers",
  },
  "crm:editCustomer": {
    codes: ["customers:update"],
    evidence: "PUT /api/v1/erp/crm/customers/{id}",
  },
  "crm:msgCenter:shopDynamics": {
    codes: [],
    note: "店铺动态为厂商域，仓内无端点",
    evidence: "全库无 /api/v1/erp 对应路由",
  },

  // ===== 工作台统计域（/api/v1/erp/dashboard*）=====
  "stat:summary": {
    codes: ["dashboard:read"],
    evidence: "GET /api/v1/erp/dashboard/sales-stats（ServicesIndex.js）",
  },
  "stat:summary:person": {
    codes: ["dashboard:read"],
    evidence: "个人/全店切换只是数据范围，后端 new_with_data_scope 收窄，权限键同一枚",
  },
  "stat:center": {
    codes: ["dashboard:read"],
    evidence: "数据中心首屏落 dashboard/overview",
  },
  "stat:balance:due": {
    codes: [],
    note: "客户余额欠款页现走厂商 /app-api/data2/*，仓内应收族（ar-invoices/ar-aging）接线属 #213 拍板面",
    evidence: "customer-balance-receivables 入口腿为 vendor 域",
  },

  // ===== 本地能力（后端无受权资源，公共可见）=====
  "search_record": {
    public: true,
    codes: [],
    evidence: "搜索历史仅 wx.storage 本地读写，无网络腿",
  },

  // ===== 撮合/发布/账号族：仓内无端点，隐藏待 #213 拍板（补后端或退场）=====
  "release:cargo:pass:add": {
    codes: [],
    note: "发布放单撮合域，对照 route-snapshot.txt 仓内无端点（#213 releaseCargoPass 族）",
    evidence: "仅 /app-api/releaseCargoPass/*",
  },
  "release:cargo:pass:list": {
    codes: [],
    note: "同上",
    evidence: "仅 /app-api/releaseCargoPass/*",
  },
  "release:cargo:pass:stop": {
    codes: [],
    note: "同上",
    evidence: "仅 /app-api/releaseCargoPass/*",
  },
  "purchasing:model:list": {
    codes: [],
    note: "求购撮合域，仓内无端点（#213 purchasing 族）",
    evidence: "仅 /app-api/purchasing/*",
  },
  "fabric_search:all_search": {
    codes: [],
    note: "搜布撮合域，仓内无端点（#213 cloth 族）",
    evidence: "仅 /app-api/cloth/*",
  },
  "basic:bank:list": {
    codes: [],
    note: "银行账户档案域，仓内无端点（#213 配置域）",
    evidence: "仅 /app-api/basic/bank/*",
  },
  "basic:user:subAccount": {
    codes: [],
    note: "员工子账号页现走厂商域；仓内 users 族是后台管理面，非同形态，接线与否属 #213",
    evidence: "仅 /app-api/user/children*",
  },
};

module.exports = {
  ENTRY_PERMS: ENTRY_PERMS,
};
