var t = require("../../../../@babel/runtime/helpers/interopRequireDefault").default,
  objectSpread2 = require("../../../../@babel/runtime/helpers/objectSpread2"),
  a = require("../../../../@babel/runtime/helpers/defineProperty"),
  services_demand = require("../../../services/services-demand"),
  util = require("../../../utils/util"),
  wxTimer = t(require("../../../utils/wxTimer")),
  app = getApp();
Page({
  data: {
    curtomerPhone: "123",
    showIcon: "",
    timerId: "",
    showPop: !0,
    customer: "",
    customerPhone: "",
    closeForm: {
      id: "",
      closeReason: "",
    },
    icon: {
      hongBao: "".concat(app.config.imgHost, "/img/customer/Icon_HB.png"),
      NO1: "".concat(app.config.imgHost, "/img/customer/Tag_NoOne.png"),
      contact: "".concat(app.config.imgHost, "/img/customer/Icon_Phone@2x.png"),
      service: "".concat(app.config.imgHost, "/img/customer/Icon_Contact@2x.png"),
    },
    popup: {
      showPopup: !1,
      popupRadio: "",
    },
    goback: !1,
    showBtn: !1,
    itemId: "",
    reply: "0",
    replyId: "",
    swiperError: 0,
    current: 0,
    itemType: "",
    productDate: {
      lastTime: "",
      isMatch: "",
      isMyAsk: "",
      id: "",
      askNo: "",
      logoImg: "",
      remainTime: null,
      userName: "",
      text: "",
      browse: "",
      num: null,
      price: null,
      createTime: null,
      contentImg: [],
      province: "",
      city: "",
    },
    myPostData: {
      auditNoPassReason: "",
      bulkPrice: 0,
      bulkPriceUnit: "",
      bulkStatus: 0,
      fetchColorCardStatus: 0,
      id: "",
      imgArr: [],
      headImg: "",
      matchStatus: 0,
      goodsInfo: "",
      imgColorCardArr: "",
      imgDetailArr: "",
      rank: "",
      rewardType: "",
      rewardAmount: "",
      deviation: "",
      noMatchReason: "",
      deliveryDay: "",
      partPrice: "",
      partPriceUnit: "",
      bulkPrice: "",
      bulkPriceUnit: "",
      replyNo: "",
      stockGoods: 0,
    },
  },
  toService: function () {
    wx.makePhoneCall({
      phoneNumber: app.customsPhoneNum,
    });
  },
  makeCall: function () {
    var t = this.data.myPostData;
    t && t.buyerTelephone
      ? (services_demand.ServicesDemand.contactLog({
          replyId: this.data.replyId,
        }).then(function (t) {
          0 !== t.code && console.log("联系商家日志提交错误" + t.msg);
        }),
        wx.makePhoneCall({
          phoneNumber: t.buyerTelephone,
        }))
      : wx.showToast({
          title: "暂无联系电话",
          icon: "none",
        });
  },
  changeGoodsSwip: function (t) {
    "touch" == t.detail.source &&
      this.setData({
        current: t.detail.current,
      });
  },
  toPost: function (t) {
    var objectSpread2 = this.data.productDate.id;
    wx.navigateTo({
      url: "/packageA/pages/demand/demand-detail/post-demand/post-demand?itemId=".concat(
        objectSpread2,
      ),
    });
  },
  toPostResult: function (t) {
    var objectSpread2 = this.data.productDate.id;
    wx.navigateTo({
      url: "/packageA/pages/demand/my-demand/my-post-result/my-post-result?itemId=".concat(
        objectSpread2,
      ),
    });
  },
  toPath: function (t) {
    var objectSpread2 = this.data.productDate.id,
      a = this.data.productDate.askNo,
      services_demand = this.data.replyId;
    services_demand && 3 !== this.data.myPostData.status
      ? wx.navigateTo({
          url: "/packageA/pages/demand/demand-detail/offer-info/offer-onfo?listId="
            .concat(objectSpread2, "&&askNo=")
            .concat(a, "&&replyId=")
            .concat(services_demand),
        })
      : wx.navigateTo({
          url: "/packageA/pages/demand/demand-detail/offer-info/offer-onfo?listId="
            .concat(objectSpread2, "&&askNo=")
            .concat(a),
        });
  },
  toHome: function () {
    wx.reLaunch({
      url: "/pages/index/index",
    });
  },
  getPageInfo: function (t) {
    var objectSpread2 = t.replyId,
      a = (t.itemType, t.pageReply),
      services_demand = t.itemId,
      util = t.goback,
      wxTimer = t.showBtn,
      app = t.listId;
    (t.showIcon &&
      this.setData({
        showIcon: 1,
      }),
      objectSpread2 &&
        (this.setData({
          replyId: objectSpread2,
        }),
        this.getOtherPost(objectSpread2)),
      a &&
        this.setData({
          reply: a,
        }),
      services_demand &&
        this.setData({
          itemId: services_demand,
        }),
      util &&
        this.setData({
          goback: util,
        }),
      wxTimer &&
        (this.setData({
          showBtn: !0,
        }),
        this.getList(services_demand)),
      app && this.getList(app));
  },
  closeDemand: function (t) {
    var objectSpread2 = t.currentTarget.dataset.itemId;
    this.setData({
      "popup.showPopup": !0,
      "closeForm.id": objectSpread2,
    });
  },
  popupClose: function () {
    this.setData({
      "popup.showPopup": !1,
    });
  },
  inputgetName: function (t) {
    this.setData({
      [t.currentTarget.dataset.name]: t.detail.value,
    });
  },
  popupClick: function (t) {
    var objectSpread2 = t.currentTarget.dataset.name,
      a = "";
    (this.setData({
      "popup.popupRadio": objectSpread2,
    }),
      "1" === objectSpread2 && (a = "已找到，无需匹配"),
      "2" === objectSpread2 && (a = "填写错误，需重新发起需求"),
      this.setData({
        "closeForm.closeReason": a,
      }));
  },
  popupChange: function (t) {
    var objectSpread2 = t.detail,
      a = "";
    (this.setData({
      "popup.popupRadio": objectSpread2,
    }),
      "1" === objectSpread2 && (a = "已找到，无需匹配"),
      "2" === objectSpread2 && (a = "填写错误，需重新发起需求"),
      this.setData({
        "closeForm.closeReason": a,
      }));
  },
  popupComfirm: function (t) {
    var objectSpread2 = this.data.productDate.id,
      a = this.data.closeForm.closeReason;
    this.toCloseDemand({
      id: objectSpread2,
      closeReason: a,
    });
  },
  popupCancle: function () {
    (this.setData({
      "closeForm.id": "",
      "closeForm.closeReason": "",
      "popup.popupRadio": "",
    }),
      this.popupClose());
  },
  previewImage: function (t) {
    var objectSpread2 = t.target.dataset.src;
    wx.previewImage({
      current: objectSpread2,
      urls: this.data.productDate.contentImg,
    });
  },
  getList: function (t) {
    var a = this,
      wxTimer = t;
    (wx.showLoading(),
      services_demand.ServicesDemand.demandDetail({
        id: wxTimer,
      }).then(function (t) {
        if (0 === t.code) {
          wx.hideLoading();
          var services_demand = t.data,
            wxTimer = "",
            app = "";
          1 === t.data.isMatch ? ((i = ""), (s = "")) : ((i = "找版失败"), (s = "已关闭"));
          var r = {
            5: app,
            10: "审核中",
            15: "审核失败",
            20: "找版中",
            30: "已领色卡",
            40: "已剪版",
            50: "已下大货",
            60: wxTimer,
          };
          (a.setData({
            itemType: services_demand.askStatus,
            itemTypeName: r[services_demand.askStatus],
            productDate: objectSpread2(
              objectSpread2({}, services_demand),
              {},
              {
                id: services_demand.id,
                isMatch: services_demand.isMatch,
                isMyAsk: services_demand.isMyAsk,
                askNo: services_demand.askNo,
                createTime: services_demand.createTime,
                logoImg: util.utils.addDefaultAvatar(services_demand.headImg),
                lastTime: Number(services_demand.remainTime),
                userName: services_demand.createUserName,
                text: services_demand.remark,
                quantity: services_demand.quantity,
                quantityUnit: services_demand.quantityUnit,
                price: services_demand.price,
                contentImg: services_demand.imgArr,
                category: services_demand.category,
                bottomType: services_demand.bottomType,
                breadth: services_demand.breadth,
                ingredient: services_demand.ingredient,
                acceptDeliveryDay: services_demand.acceptDeliveryDay,
                acceptMatching: Number(services_demand.acceptMatching),
                matchStatusName: services_demand.matchStatusName,
                province: services_demand.province,
                city: services_demand.city,
              },
            ),
          }),
            services_demand.replyId && !a.data.replyId && a._posted(services_demand.replyId),
            a.timeCount());
        }
      }));
  },
  _posted: function (t) {
    (this.setData({
      replyId: t,
      reply: "1",
    }),
      this.getOtherPost(t));
  },
  getOtherPost: function (t) {
    var objectSpread2 = this;
    services_demand.ServicesDemand.otherPost({
      replyId: t,
    }).then(function (t) {
      var a = t.data;
      objectSpread2.setData({
        myPostData: a,
      });
    });
  },
  toCloseDemand: function (t) {
    var objectSpread2 = this,
      a = t.id,
      util = t.closeReason,
      wxTimer = getCurrentPages(),
      app = wxTimer.find(function (t) {
        return "packageA/pages/demand/my-demand/my-demand" === t.route;
      });
    app
      ? (app.toCloseDemand({
          id: a,
          closeReason: util,
        }),
        wx.navigateBack({
          delta: 1,
        }))
      : services_demand.ServicesDemand.closeDemand({
          id: a,
          closeReason: util,
        }).then(function (t) {
          0 === t.code &&
            (wx.showToast({
              title: "关闭成功",
              icon: "none",
            }),
            objectSpread2.popupCancle());
        });
  },
  timeCount: function () {
    var t = this,
      objectSpread2 = t.data.productDate;
    objectSpread2.lastTimeStr = new wxTimer.default().dateFormat(objectSpread2.lastTime);
    var a = Date.now(),
      services_demand = new Date(a + objectSpread2.lastTime).getTime();
    ((objectSpread2.countdownTime = a),
      (objectSpread2.countdownEndTime = services_demand),
      t.setData({
        productDate: t.data.productDate,
      }),
      t.data.timerId && clearInterval(t.data.timerId));
    var util = setInterval(this.countdown, 350);
    t.setData({
      timerId: util,
    });
  },
  countdown: function () {
    var t = this,
      objectSpread2 = t.data.productDate,
      a = objectSpread2.countdownEndTime - Date.now();
    ((objectSpread2.lastTimeStr = new wxTimer.default().dateFormat(a)),
      t.setData({
        productDate: t.data.productDate,
      }));
  },
  startCountUser: function () {
    var t = new Date();
    this.data.startTime = t;
  },
  endCountUser: function () {
    var t = new Date() - this.data.startTime,
      objectSpread2 = this.data.productDate.id,
      a = t;
    services_demand.ServicesDemand.addAskDetailLog({
      askId: objectSpread2,
      stayTime: a,
    });
  },
  onLoad: function (t) {
    (console.log(t), this.getPageInfo(t));
  },
  onShow: function () {
    "0" !== this.data.reply || this.data.showBtn || this.startCountUser();
  },
  onHide: function () {
    "0" !== this.data.reply || this.data.showBtn || this.endCountUser();
  },
  onUnload: function () {
    ("0" !== this.data.reply || this.data.showBtn || this.endCountUser(),
      this.data.goback &&
        wx.reLaunch({
          url: "/pages/demand-square/demand-square",
        }));
  },
});
