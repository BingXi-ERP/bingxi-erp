/**
 * packageB 登录门禁入口
 * ---------------------------------------------------------------
 * 调用方：packageB/pages/personal-center/device-connection（打印设备连接页）
 * 入参：无
 * 传给谁：主包 libs/utils/isVisitor.js 的同一实现
 * 存什么 / 存哪里：本文件不落任何数据；会话快照与登录标记由主包实现经 apiGateway 读写 wx.storage
 *
 * 分包不再自持一份判据实现：登录态的唯一判据是后端 GET /api/v1/erp/users/me 的回读结果
 * （与 packageA/utils/checkToken.js、packageB/libs/utils/checkToken.js 同一惯例）。
 *
 * 退场口径：本副本原以 `5 === app.globalData.userInfo.type` 作门，判据取自用户档案的角色字段，
 * 而全仓没有任何一处给 globalData.userInfo 写过 type（libs/services/ServicesUser.js 与
 * libs/utils/apiGateway.js 的 adaptLogin 产出的 user 形状里都没有 type 字段，
 * 角色只写进 wx.storage 的 userType 键），所以 `5 === undefined` 恒为假，
 * 这枚门对游客也一律 resolve —— 属假登录：未登录用户可直接进入打印设备连接页。
 * 同时退场的还有它的跳转写法 wx.navigateTo({ url: "../../../pages/register/login/login" })：
 * 小程序的 navigateTo 不接受相对路径，那是一条落不到页面的死跳转。
 * 导出形状保持主包实现的 __esModule 与 default，调用方的 isVisitor.default.isVisitor() 无需改动。
 */
module.exports = require("../../../libs/utils/isVisitor.js");
