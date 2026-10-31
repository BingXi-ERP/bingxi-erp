var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  i = createClass(function t(i) {
    (classCallCheck(this, t),
      (this.redPoint = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/goods/ask/statusChangeWarn"),
          t,
        );
      }),
      (this.accountList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/users"), t);
      }),
      /**
       * 功能 读取本组织岗位（角色）列表，供子账号选岗
       * 调用方 本文件 delRole 之外的三处读方，即 packageB pages personal-center children 下的
       *   children.js 与 job.js 与 edit-children.js 的 getRoleList
       * 入参 t 旧侧的分页对象（pageNo 与 pageSize），本仓该口不出分页、一次返全量，故不向后端转译分页键
       * 传给谁 本仓角色列表读口（在册 GET 方法，路径见交付报告映射表），出参是 RoleListResponse 的
       *   roles 数组（backend 侧 role_handler.rs）
       * 存什么 只在响应对象的 data 上补一个与旧侧同名的 content 别名，值就是后端 roles 数组本体，
       *   不复制不裁剪；出参里没有 roles 数组即点名拒绝，不放空让读方拿 undefined
       * 存哪里 不写本地缓存
       * 形态差异 旧侧随列表带 menuIds 与 menuNames（岗位勾选的菜单权限树），本仓角色不持菜单表，
       *   该两键不出，已登记待拍板
       */
      (this.roleList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/roles"), {}).then(
          function (res) {
            if (res && res.code === 0) {
              if (!res.data || !Array.isArray(res.data.roles)) {
                return {
                  code: 500,
                  msg: "角色列表出参缺 roles 数组，与本仓契约不符",
                  data: {},
                };
              }
              res.data.content = res.data.roles;
            }
            return res;
          },
        );
      }),
      (this.authList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/shop/user/role/getMenus"), t);
      }),
      (this.addOrChangeRole = function (t, o) {
        return request.POST(o, t);
      }),
      /**
       * 功能 删除一个岗位（本仓即角色）
       * 调用方 packageB pages personal-center children add-job 的 delRole，其入参对象只有 roleId 一键
       * 入参 t.roleId 岗位标识，从入参取出后内联进路径
       * 传给谁 本仓角色删除口（在册 DELETE 方法，按 id 定位，路径见交付报告映射表），
       *   旧侧是 POST 加请求体，本仓是 DELETE 且无请求体；服务端另有两道硬门，
       *   非 admin 一律拒（403）与系统内置角色拒删（backend 侧 role_handler.rs 的 delete_role）
       * 存什么 不落盘
       * 存哪里 无
       */
      (this.delRole = function (t) {
        return request.DELETE("".concat(app.config.bingxiHost, "/api/v1/erp/roles/", t.roleId), {});
      }),
      (this.createChildrenQRCode = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/customer/two/createInviteQRCode"),
          t,
        );
      }),
      (this.checkChildrenQRCode = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/user/subAccount/checkInviteQRCodeStatus"),
          t,
        );
      }),
      (this.changeChildrenName = function (t) {
        return request.PUT("".concat(app.config.bingxiHost, "/api/v1/erp/user/profile"), t);
      }),
      (this.editChilder = function (t) {
        return request.PUT("".concat(app.config.bingxiHost, "/api/v1/erp/user/profile"), params);
      }),
      (this.switchChildren = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/user/subAccount/subAccountSwith"),
          t,
        );
      }),
      (this.saveChildrenRole = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/user/subAccount/saveSubAccountRole"),
          t,
        );
      }),
      (this.getChildrenInfo = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/user/subAccount/subAccountInfo"),
          t,
        );
      }),
      (this.delChildren = function (t) {
        return request.DELETE("".concat(app.config.bingxiHost, "/api/v1/erp/users/", t.subAccountId),
        );
      }),
      (this.colorCardCollectList = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/visitor/goods/goodsFavoriteList"),
          t,
        );
      }),
      (this.shopCollectList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/visitor/shop/shopList"), t);
      }),
      (this.addOrUpdateColorCard = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/visitor/goods/addOrUpdateFavoriteRemark"),
          t,
        );
      }),
      (this.shopDetail = function (t, o) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/shop/").concat(o), t);
      }),
      (this.shopDetail2 = function (t) {
        // 功能 读取本公司档案详情用于店铺资料页回显
        // 调用方 packageB/pages/personal-center/edit-shop/edit-shop.js 的 shopDetail2
        // 入参 t 旧侧按表单键提交的查询对象，本仓该口按会话取当前公司，无查询参数
        // 传给谁 本仓 company-profile 全量读口 GET（route-snapshot.txt 第 349 行）
        // 存什么 不落盘，回给页面的列名是 company_profile 表的 name 与 short_name 与
        //   credit_code 与 legal_representative 与 bank_name 与 bank_account 与 phone 与
        //   address 与 logo 等（backend/src/models/company_profile.rs 第 21 行起），
        //   与旧侧店铺字段名不同，差异点已登记进映射报告
        // 存哪里 不写本地缓存
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/company-profile/full"), {});
      }),
      (this.updateShop = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/setting/company/modify"), t);
      }),
      (this.updateUser = function (t) {
        return request.PUT("".concat(app.config.bingxiHost, "/api/v1/erp/user/profile"), t);
      }),
      (this.combo = function () {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/pay/membership/status"));
      }));
  });
module.exports = {
  servicesCenter: new i(),
};
