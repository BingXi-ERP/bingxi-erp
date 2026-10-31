// 环境切换调试页（反编译还原，基于根目录 envConfig.js 的数据源）
// 入口：个人中心 -> toDebug（reLaunch 到此页）
// 功能：列出 envConfig 中的全部环境，点击切换写入本地覆盖（storage.key = "envPage"），
//       重启小程序后由 app.js initEnv 优先读取生效。
var envConfig = require("../../../envConfig");

function nameOf(key) {
  var list = envConfig.envList || {};
  var item = list[key];
  return item && item.name ? item.name : key;
}

Page({
  data: {
    envList: [],
    currentKey: "",
    overrideKey: "",
  },
  onLoad: function () {
    var list = envConfig.envList || {};
    var arr = Object.keys(list).map(function (k) {
      var item = list[k];
      return {
        key: k,
        name: item.name || k,
        rootHost: item.rootHost || "",
      };
    });
    var override = wx.getStorageSync("envPage") || "";
    var current = override || envConfig.envPage || "";
    this.setData({
      envList: arr,
      currentKey: current,
      overrideKey: override,
    });
  },
  onSwitch: function (e) {
    var key = e.currentTarget.dataset.key;
    var self = this;
    wx.showModal({
      title: "切换环境",
      content: "切换为「" + nameOf(key) + "」？修改后需重启小程序生效。",
      success: function (r) {
        if (r.confirm) {
          wx.setStorageSync("envPage", key);
          self.setData({ currentKey: key, overrideKey: key });
          wx.showToast({ title: "已切换，请重启", icon: "none" });
        }
      },
    });
  },
  onReset: function () {
    var self = this;
    wx.showModal({
      title: "恢复默认",
      content: "清除本地环境覆盖，恢复为发布默认环境？",
      success: function (r) {
        if (r.confirm) {
          wx.removeStorageSync("envPage");
          var def = envConfig.envPage || "";
          self.setData({ currentKey: def, overrideKey: "" });
          wx.showToast({ title: "已恢复默认", icon: "none" });
        }
      },
    });
  },
  onBack: function () {
    wx.reLaunch({ url: "/pages/personal-center/personal-center" });
  },
});
