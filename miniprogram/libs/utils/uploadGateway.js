/**
 * 文件上传通道（bingxi-erp 会话凭据版）
 * ---------------------------------------------------------------
 * 功能：把小程序里直发 wx.uploadFile 的上传站点收进契约层，使其与 libs/services/request.js
 *   一样获得响应归一化、CSRF 一次性令牌取用与轮换、403 重放与写请求串行化
 * 调用方：components/upload-img/upload-img.js、components/panel-img/panel-img.js、
 *   packageB 的 edit-info 与 edit-shop 与 accountsetting/QR-code、pages/index、
 *   pages/color-card 与 pages/color-card-management 的上传站点、
 *   pages/register/submission 与 writeApplyInfo、pages/search-img/search
 * 入参：spec { url, filePath, name, formData, header }
 *   url 完整地址、filePath 本地临时文件、name 表单文件字段名（默认 file）、
 *   formData 附带的表单字段、header 非凭据的上下文头（terminalSource 一类）
 * 传给谁：libs/utils/apiGateway.js 的 requestContract 决定令牌取用与串行，
 *   实际传输由本文件的 wx.uploadFile 完成；归一化后的响应体回给调用页
 * 存什么：不存任何凭据。会话凭据是后端写入的 httpOnly Cookie，由 wx 网络层自动维护，
 *   JS 侧既不读也不构造 Authorization 头（backend/src/middleware/auth.rs 的凭据优先级里
 *   Authorization 只在两枚 Cookie 全缺席时才被读，且只认带 Bearer 前缀的形式，
 *   而 backend/src/handlers/auth_handler.rs 的 LoginResponse 根本没有 token 字段）
 * 存哪里：无
 *
 * wx.uploadFile 的 success 回调里 res.data 是字符串，因此先按 JSON 解析并补齐传输信息
 * （statusCode 与 header 与 cookies），再交给 apiGateway.tagResponse 与 normalize，
 * 这样调用方既能用 code === 0 判成功，也能拿到 code === 401 与 403 判鉴权面
 */
var apiGateway = require("./apiGateway.js");

/**
 * 解析 wx.uploadFile 的响应体
 * 入参 res wx.uploadFile 的原始成功回调对象、isBingxi 该地址是否指向本仓后端
 * 传给谁：apiGateway.tagResponse 与 apiGateway.normalize（仅本仓后端做信封归一，第三方地址原样交出）
 * 存什么/存哪里：不落盘
 */
function parseUploadBody(res, isBingxi) {
  var body = res && res.data;
  var parsed = body;
  if (typeof body === "string") {
    try {
      parsed = JSON.parse(body);
    } catch (e) {
      // 非 JSON 响应（网关 HTML 错误页一类）必须外显，不能静默当成功
      return {
        code: (res && res.statusCode) || 500,
        msg: "上传响应无法解析",
        data: "",
        __raw: body,
      };
    }
  }
  if (!parsed || typeof parsed !== "object") {
    return {
      code: (res && res.statusCode) || 500,
      msg: "上传响应形态异常",
      data: "",
    };
  }
  return apiGateway.normalize(
    apiGateway.tagResponse({
      statusCode: res.statusCode,
      header: res.header || {},
      cookies: res.cookies || [],
      data: parsed,
    }),
    isBingxi,
  );
}

/**
 * 经契约层发送一次文件上传
 * 入参 spec 见文件头；额外支持 timeout 与上传失败回调
 * 传给谁：调用页的 Promise 链（resolve 归一化后的响应体）
 * 存什么/存哪里：不落盘
 */
function upload(spec) {
  var s = spec || {};
  if (!s.url || !s.filePath) {
    return Promise.reject(new Error("上传缺少 url 或 filePath"));
  }
  var g = apiGateway.adapt(s.url, "POST", s.formData);
  var contextHeaders = Object.assign({ terminalSource: 6 }, s.header || {});
  var send = function (contractHeaders) {
    return new Promise(function (resolve, reject) {
      wx.uploadFile({
        url: g.url,
        filePath: s.filePath,
        name: s.name || "file",
        formData: g.data || {},
        header: Object.assign({}, contextHeaders, contractHeaders || {}),
        timeout: s.timeout || 60000,
        success: function (res) {
          resolve(parseUploadBody(res, g.isBingxi));
        },
        fail: function (err) {
          reject(err);
        },
      });
    });
  };
  return apiGateway.requestContract({
    url: g.url,
    method: "POST",
    send: send,
  });
}

/**
 * wx.uploadFile 的回调式替身（调用点迁移用）
 * 功能：保持 wx.uploadFile({url, filePath, name, header, formData, success, fail}) 的入参形态，
 *   但实际发送交给 upload，即经 apiGateway.requestContract 走契约层
 * 调用方：pages/color-card 与 pages/color-card-management 的上传站点、pages/print 与
 *   pages/search-img/search 与 pages/register 的申请资料页等沿用回调式写法的调用点
 * 入参：spec 同 wx.uploadFile，另 success(res) 收到的 res 是归一化后的响应体对象
 *   （不是 wx 的原始回调对象，因此调用点原先的 JSON.parse(x.data) 一律改为直接用 res）
 * 传给谁：upload 的 Promise，再落回 success 与 fail
 * 存什么/存哪里：不落盘
 * 一条硬约束：本替身不接收也不发送 Authorization，凭据由 httpOnly Cookie 承载；
 *   同时不再让调用点写死无 boundary 的 Content-Type，multipart 的分隔符必须留给
 *   wx.uploadFile 自己生成，否则后端解析不到文件字段
 */
function uploadFile(spec) {
  var s = spec || {};
  var settle = function (fn, arg) {
    if (typeof fn === "function") fn(arg);
  };
  return upload(s).then(
    function (res) {
      settle(s.success, res);
    },
    function (err) {
      settle(s.fail, err);
    },
  );
}

module.exports = {
  upload: upload,
  uploadFile: uploadFile,
  parseUploadBody: parseUploadBody,
};

