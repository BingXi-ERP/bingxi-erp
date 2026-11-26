// 首次访问的服务器地址设置页；已有地址时直接重进工作台。
// 入参：表单 host 或 wx.storage 的规范化源站。传给谁：deploymentConfig 与 app.config。
// 存什么：仅存部署源站，不存凭证。存哪里：wx.storage 的 bingxiDeploymentHost。
var deploymentConfig = require('../../deploymentConfig.js');
var app = getApp();

Page({
  data: {
    host: '',
    savedHost: '',
    formVisible: true,
    error: '',
  },
  onLoad: function () {
    try {
      var saved = deploymentConfig.readHost(wx);
      this.setData({ savedHost: saved, formVisible: !saved });
      if (saved) this.enter(saved);
    } catch (error) {
      this.setData({ savedHost: '', formVisible: true, error: error.message });
    }
  },
  enter: function (host) {
    app.applyDeploymentHost(host);
    wx.reLaunch({ url: '/pages/index/index' });
  },
  onSubmit: function (event) {
    event.preventDefault();
    try {
      var host = deploymentConfig.saveHost(wx, this.data.host);
      app.clearDeploymentSession();
      this.setData({ savedHost: host, error: '' });
      this.enter(host);
    } catch (error) {
      this.setData({ error: error.message });
    }
  },
  onChange: function () {
    this.setData({ host: '', formVisible: true, error: '' });
  },
  onHostInput: function (event) {
    this.setData({ host: event.detail.value });
  },
  onEnterSaved: function () {
    this.enter(this.data.savedHost);
  },
});
