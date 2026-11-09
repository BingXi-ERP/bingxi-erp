var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  e = createClass(function t(e) {
    (classCallCheck(this, t),
      (this.customerIndex = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/dashboard/overview"), t);
      }),
      (this.customersData = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/customer/two/statistics/").concat(t.grouping),
          t,
        );
      }),
      (this.customersList = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/customer/two/groupingList"),
          t,
        );
      }),
      (this.allCustomerList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/crm/customers"), t);
      }),
      (this.selectPageList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/crm/customers"),
          t,
        );
      }),
      (this.shopNews = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/message/shop"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.sysNews = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/notifications"), t);
      }),
      (this.sysFeedbackList = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/message/feedback/list"), t);
      }),
      (this.customerDetail = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/crm/customers/", t.customerId),
          t,
        );
      }),
      (this.trackRecordList = function (t) {
        // 功能 分页读取指定客户的跟进记录列表
        // 调用方 pages/customer-management/all-customer-detail/all-customer-detail.js 的 trackRecordList
        // 入参 t.id 客户标识 t.page 页码 t.size 每页条数
        // 传给谁 本仓 crm customers 跟进子资源 GET 口（route-snapshot.txt 第 370 行）
        // 存什么 只带页码与每页条数两枚查询参数，旧侧的 size 改名为 page_size
        // 存哪里 不写本地缓存，结果只回给调用页
        return request.GET(
          "".concat(app.config.bingxiHost, "/api/v1/erp/crm/customers/", t.id, "/follow-ups"),
          {
            page: t.page,
            page_size: t.size,
          },
        );
      }),
      (this.saveCustomer = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/crm/customers"), t);
      }),
      (this.editCustomer = function (t) {
        return request.PUT("".concat(app.config.bingxiHost, "/api/v1/erp/crm/customers/", t.id || t.customerId || ""), t);
      }),
      (this.colorCardList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/products"), t);
      }),
      (this.goodsDetail = function (t, o) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/products/", t), o);
      }),
      (this.saveTrackRecord = function (t) {
        // 功能 为指定客户新增一条跟进记录
        // 调用方 pages/customer-management/add-record/add-record.js 的 submit
        // 入参 t.customerId 客户标识 t.content 跟进内容
        // 传给谁 本仓 crm customers 跟进子资源 POST 口（route-snapshot.txt 第 1183 行）
        // 存什么 只提交 content 一个正文键，旧侧的 recordImgPathList 与 goodsIdList
        //   在本仓 FollowUpRequest 里没有对应列（backend/src/models/dto/crm_dto.rs:9 到 17），
        //   已登记为待拍板项，不做空值冒充
        // 存哪里 不落本地缓存
        return request.POST(
          "".concat(
            app.config.bingxiHost,
            "/api/v1/erp/crm/customers/",
            t.customerId,
            "/follow-ups",
          ),
          {
            content: t.content,
          },
        );
      }),
      (this.sendInviteMsg = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/send/message/customer/sendInviteMsg/").concat(t),
        );
      }),
      (this.trackRecordDetail = function (t) {
        return request.GET(
          ""
            .concat(app.config.bingxiHost, "/app-api/customer/two/trackDetail/")
            .concat(t.trackRecordId),
          t,
        );
      }),
      (this.removeTrackRecord = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/customer/two/track/delete"),
          t,
        );
      }),
      (this.customerOrderRecordNum = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/sales/orders?customer_id=", t.customerId),
          t,
        );
      }),
      (this.customerOrderList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/sales/orders"), t);
      }),
      (this.customerDealNum = function (t) {
        // 功能 读取指定客户的色卡成交台账
        // 调用方 当前全仓零调用方（复核 grep 只命中本定义行），保留方法形状并接回在册读口
        // 入参 t.customerId 客户标识，本仓该口按路径段定位
        // 传给谁 本仓色卡客户台账读口 GET /api/v1/erp/color-cards/reports/customer-ledger/ 下挂
        //   客户标识路径段（route-snapshot.txt 第 329 行 customer_color_card_ledger，
        //   backend/src/handlers/color_card/analytics.rs 的 Path(customer_id) 与 require_issue_permission read）
        // 存什么 customerId 缺席即点名拒绝，不拼空路径段去撞 404；不写本地缓存，结果只回调用方
        // 存哪里 不写本地缓存
        if (!t || t.customerId === undefined || t.customerId === "") {
          return Promise.resolve({
            code: 500,
            msg: "台账读取缺 customerId，本仓该口按客户标识路径段定位",
            data: {},
          });
        }
        return request.GET(
          "".concat(
            app.config.bingxiHost,
            "/api/v1/erp/color-cards/reports/customer-ledger/",
          ).concat(t.customerId),
          {},
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.refundrOrderList = function (t) {
        // 功能 分页读取指定客户的退货单列表
        // 调用方 pages/customer-management/all-customer-detail/all-customer-detail.js 的 refundOrderList
        // 入参 t.customerId 客户标识 t.pageNum 页码 t.pageSize 每页条数
        // 传给谁 本仓 sales sales-returns 列表 GET 口（route-snapshot.txt 第 911 行），
        //   入参名按后端 SalesReturnQueryParams 改形（backend/src/handlers/sales_return_handler.rs:24 到 30）
        // 存什么 只带 customer_id 与 page 与 page_size 三枚查询参数
        // 存哪里 不落本地缓存
        return request.GET(
          "".concat(app.config.bingxiHost, "/api/v1/erp/sales/sales-returns"),
          {
            customer_id: t.customerId,
            page: t.pageNum,
            page_size: t.pageSize,
          },
        );
      }));
  });
module.exports = {
  servicesCustomer: new e(),
};
