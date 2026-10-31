/**
 * packageA 登录态校验入口
 * ---------------------------------------------------------------
 * 调用方：packageA/services/request.js（401 会话回读重发）
 * 入参：无
 * 传给谁：主包 libs/utils/checkToken.js 的同一实现
 * 存什么 / 存哪里：本文件不落任何数据；会话快照与登录标记由主包实现读写 wx.storage
 *
 * 分包不再自持一份判据实现：登录态的唯一判据是后端 GET /api/v1/erp/users/me 的回读结果，
 * 多份副本会各自漂移（历史副本还把登录态写成 storage 里的 token，而登录响应体根本没有 token 字段）
 */
module.exports = require("../../libs/utils/checkToken.js");
