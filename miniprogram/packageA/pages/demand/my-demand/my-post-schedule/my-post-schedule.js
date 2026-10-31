var util = require("../../../../utils/util"),
  services_demand = require("../../../../services/services-demand"),
  n = util.utils.formatDateTime;
Page({
  data: {
    steps: [
      {
        text: "",
        desc: "",
        askId: "",
        id: "",
        optTime: "",
        optUserId: "",
        optUserName: "",
      },
    ],
  },
  getData: function (e) {
    var o = this,
      a = e.itemId;
    console.log(a);
    var i = a;
    a &&
      services_demand.ServicesDemand.getAskProcess({
        id: i,
      }).then(function (e) {
        var services_demand = e.data;
        o.setData({
          steps: services_demand.map(function (e) {
            return {
              text: e.title,
              desc: n(e.optTime),
              id: e.id,
              askId: e.askId,
              optUserName: e.optUserName,
            };
          }),
        });
      });
  },
  onLoad: function (e) {
    this.getData(e);
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
