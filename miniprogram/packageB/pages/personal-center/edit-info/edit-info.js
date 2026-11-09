/**
 * 个人资料编辑页（packageB）
 * ---------------------------------------------------------------
 * 功能：展示当前账号的头像与昵称与手机号，并允许换头像
 * 调用方：packageB/pages/personal-center 的资料入口（wxml 绑定 changeAvatar 与 changeNickName）
 * 入参：无（读 app.globalData.userInfo 与 wx.chooseMedia 选中的临时文件）
 * 传给谁：头像上传经 libs/utils/uploadGateway.js 的 upload（内部由 apiGateway.requestContract
 *   发出），打到 POST /api/v1/erp/user/avatar（frontend/scripts/route-snapshot.txt:1630
 *   user_handler::upload_avatar，multipart 字段名就是 avatar，服务端写库并回 avatar_url）；
 *   档案回读经 libs/utils/login.js 的 getUserInfo 走网关打 GET /api/v1/erp/users/me（快照:968）
 * 存什么：只由 login.js 落用户档案键（avatar 由后端持久化，前端不再自存凭据）
 * 存哪里：wx.storage（键由 libs/utils/login.js 定义）
 *
 * 三处形态按真实契约改掉：
 * 一 原直发 wx.uploadFile 并自拼 Authorization: wx.getStorageSync("token")。后端凭据是 httpOnly
 *   Cookie（backend/src/middleware/auth.rs 的优先级 access_token Cookie 到 jwt Cookie 到
 *   Authorization 头），JS 侧 storage 里从来没有 token，这条头永远为空值，
 *   而 auth.rs 只接受带 Bearer 前缀的形式，空值直接被拒，属凭据冒充登录态。
 * 二 原打 /app-api/file/upload 并附 filePath: "/bdd/head" 表单字段。仓内权威面没有通用文件上传
 *   端点（快照内 multipart 腿只有 user/avatar 与 supplier 资质附件 与 system-update/upload
 *   与 data-import），而头像有专用端点且服务端自己落库，故按真实契约改接，
 *   并删掉 upload_avatar 不读取的 filePath 参数（不传空串占位）。
 * 三 原在上传成功后再 PUT /api/v1/erp/user/profile 回写 avatar 与 nickName。该端点的入参
 *   UpdateCurrentUserProfileRequest 只有 real_name 与 email 与 phone
 *   （backend/src/handlers/user_handler.rs:221 到 225），既无 avatar 也无 nickName，
 *   等于一次改了个空的假接入；头像已由 upload_avatar 在服务端持久化，
 *   故本页的 formSubmit 这条腿按零活引用证据退场（除上传回调外无调用方，
 *   wxml 只绑 changeAvatar 与 changeNickName，昵称改在 edit-info-nickname 页保存）。
 */
var login = require("../../../libs/utils/login.js").login,
  uploadGateway = require("../../../libs/utils/uploadGateway.js"),
  app = getApp();

/** 头像上传与静态服务地址（backend/src/routes/static.rs:225 在同域下服务该路径） */
var AVATAR_PATH = "/api/v1/erp/user/avatar";

Page({
  data: {
    cameraImg: "".concat(app.config.imgHost, "/img/customer/duibuIcon/camera@2x.png"),
    avatar: "",
    nickName: "",
    mobile: "",
  },
  onShow: function () {
    var ServicesCenter = this;
    this.getUserInfo().then(function () {
      ServicesCenter.setData({
        avatar: app.globalData.userInfo.avatar,
        nickName: app.globalData.userInfo.nickName,
        mobile: app.globalData.userInfo.phone,
        shopName: app.globalData.userInfo.companyName,
      });
    });
  },
  /**
   * 选图并上传头像
   * 调用方：本页 wxml 的头像区
   * 入参：wx.chooseMedia 回调里的首个临时文件
   * 传给谁：uploadGateway.upload -> apiGateway.requestContract -> POST /api/v1/erp/user/avatar
   * 存什么/存哪里：不在本地存头像凭据，头像地址由后端持久化后再回读进档案键
   * 判据一条：经网关后成功信封 code 200 归一成 0，失败原因一律 toast 外显；
   *   原写法失败分支取 e.msg.result（把响应头的 msg 当对象再取 result）必抛 TypeError
   */
  changeAvatar: function () {
    var ServicesCenter = this;
    wx.chooseMedia({
      count: 1,
      sizeType: ["original", "compressed"],
      sourceType: ["album", "camera"],
      mediaType: ["image"],
      success: function (e) {
        wx.showLoading({
          title: "头像上传中",
        });
        uploadGateway
          .upload({
            url: "".concat(app.config.bingxiHost).concat(AVATAR_PATH),
            filePath: e.tempFiles[0].tempFilePath,
            name: "avatar",
            header: {
              terminalType: 81,
            },
          })
          .then(
            function (res) {
              wx.hideLoading();
              if (!res || 0 !== res.code) {
                wx.showToast({
                  title: (res && res.msg) || "头像上传失败",
                  icon: "none",
                });
                return;
              }
              var url = (res.data && res.data.avatar_url) || "";
              if (!url) {
                wx.showToast({
                  title: "后端未返回头像地址",
                  icon: "none",
                });
                return;
              }
              ServicesCenter.setData({
                avatar: "".concat(app.config.bingxiHost).concat(url),
                "icon.avatar": url,
              });
              wx.showToast({
                title: "头像上传成功",
              });
              // 头像已由 upload_avatar 在服务端落库，这里只回读档案确认，不再假PUT 一遍
              return ServicesCenter.getUserInfo();
            },
            function (err) {
              wx.hideLoading();
              wx.showToast({
                title: (err && err.errMsg) || "头像上传失败",
                icon: "none",
              });
            },
          );
      },
    });
  },
  changeNickName: function () {
    wx.navigateTo({
      url: "/packageB/pages/personal-center/edit-info-nickname/edit-info-nickname?nickName="
        .concat(this.data.nickName, "&avatar=")
        .concat(this.data.avatar),
    });
  },
  /**
   * 回读当前会话的用户档案
   * 调用方：本页 onShow 与 changeAvatar 的成功分支
   * 入参：无
   * 传给谁：libs/utils/login.js 的 getUserInfo（经网关打 GET /api/v1/erp/users/me，快照:968）
   * 存什么/存哪里：档案键（id 与 nickName 与 fullName 与 mobile 与 avatar 与 myShopId 与
   *   resCodeList 与 userType）由 login.js 单点落 wx.storage
   * 原先在此手写的一批落盘键全部退场：userRole 与 lastAccessShopId 与 loginToken 与 logoutFlag
   *   与 wxId 与 wxOpenId 与 category 与 shopName 与 shopAddress 与 telephone 都不是
   *   UserResponse 的出参（backend/src/handlers/user_handler.rs:108 到 123），
   *   写入值永远是 undefined；其中 loginToken 与 logoutFlag 属凭据冒充登录态，
   *   其余十键实测全仓零读方（复核命令与输出见交付报告）
   */
  getUserInfo: function () {
    return login.getUserInfo();
  },
});
