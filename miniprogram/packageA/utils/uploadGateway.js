/**
 * packageA 文件上传通道入口
 * ---------------------------------------------------------------
 * 调用方：packageA 内经契约层上传文件的页面与组件
 * 入参：透传给主包实现的 spec { url, filePath, name, formData, header }
 * 传给谁：主包 libs/utils/uploadGateway.js 的同一实现，再由它交给 libs/utils/apiGateway.js
 *   的 requestContract
 * 存什么 / 存哪里：本文件不落任何数据；凭据是后端 httpOnly Cookie，JS 侧不读写
 *
 * 分包不再自持一份上传实现：CSRF 一次性令牌的取用与轮换与 403 重放只在契约层有一份判据，
 * 多副本会各自漂移（历史副本还自拼 Authorization: wx.getStorageSync("token")，
 * 而后端登录出参根本没有 token 字段，那条头永远为空并被 auth.rs 拒绝）
 */
module.exports = require("../../libs/utils/uploadGateway.js");
