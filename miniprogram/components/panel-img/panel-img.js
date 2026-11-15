/**
 * 宫格面板组件
 * ---------------------------------------------------------------
 * 调用方：pages/demand-square 等页面在 wxml 里以 <panel-img> 使用，form-submit 事件取 formId
 * 入参：properties 里的 list 与 rightType 等展示配置；getformId 无入参，读组件内 formId
 * 传给谁：getformId 经 libs/services/global.js 取上报地址，再由 libs/services/request.js 的传输层
 *   发出，最后由 libs/utils/apiGateway.js 的 requestContract 做响应归一化与 CSRF 取用轮换；
 *   凭据是后端 httpOnly Cookie，由 wx.request 自动携带，本组件不再自拼 Authorization 头
 * 存什么：不落盘
 * 存哪里：无
 *
 * 旧路径 /app-api/pubMsg/saveFormId 在本仓 route-snapshot.txt 里没有等价端点，路径按原样保留，
 *   已登记待拍板清单；apiGateway.consumesCsrf 只认 /api/v1/erp 前缀，这条旧路径不会吞掉会话令牌。
 */
var global = require("../../libs/services/global"),
  request = require("../../libs/services/request.js").request;
Component({
  properties: {
    list: {
      type: Object,
      value: {},
    },
    rightType: {
      type: String,
      value: "1",
    },
    showBorder: {
      type: Boolean,
      value: !1,
    },
    fontRed: {
      type: Boolean,
      value: !1,
    },
    iconSize: {
      type: Object,
      value: {
        width: 80,
        height: 80,
      },
    },
  },
  data: {
    BlockType: "",
  },
  ready: function () {
    this.setData({
      BlockType: this.properties.rightType,
    });
  },
  methods: {
    toCustomDetail: function (t) {
      var e = t.currentTarget.dataset,
        o = e.customertype,
        r = e.id,
        i = e.action;
      this.triggerEvent("toCustomDetail", {
        customertype: o,
        id: r,
        action: i,
      });
    },
    formSubmit: function (t) {
      this.data.formId = t.detail.formId;
    },
    getformId: function (e) {
      var o = this,
        r = (0, global.saveFormId)();
      wx.login({
        success: function (t) {
          var e = {
            formId: o.data.formId,
            code: t.code,
          };
          request.POST(r, e, {
            headers: {
              "content-type": "application/x-www-form-urlencoded",
              terminalSource: 6,
            },
          });
        },
      });
    },
  },
});
