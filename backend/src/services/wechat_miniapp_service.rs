//! 微信小程序登录外部接口服务。
//!
//! 只调用 code2session、access_token 与 getPhoneNumber；不接入 AES 私密解密。
//! access_token 按 appid 写入现有 AppCache，并用共享异步锁覆盖“检查缓存—取号—写缓存”，
//! 避免并发登录请求重复取号导致微信侧旧令牌失效。日志不记录 code、secret、令牌、openid 或手机号。

use std::sync::{Arc, LazyLock};
use std::time::Duration;

use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use tokio::sync::Mutex;
use tracing::{error, info, warn};

use crate::config::settings::MiniappConfig;
use crate::utils::cache::{AppCache, Cache, CachedApiToken};
use crate::utils::error::AppError;

const REFRESH_AHEAD_SECS: u64 = 300;
const CONNECT_TIMEOUT_SECS: u64 = 10;
const REQUEST_TIMEOUT_SECS: u64 = 15;
static TOKEN_FETCH_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));
static HTTP_CLIENT: LazyLock<Option<Client>> = LazyLock::new(|| {
    Client::builder()
        .connect_timeout(Duration::from_secs(CONNECT_TIMEOUT_SECS))
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .ok()
});

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    expires_in: Option<i64>,
    errcode: Option<i64>,
}

/// 微信小程序登录服务；缓存引用由 AppState 注入，跨请求实例共享。
#[derive(Clone)]
pub struct WechatMiniappService {
    appid: String,
    secret: String,
    api_base_url: String,
    cache: Arc<AppCache>,
}

impl WechatMiniappService {
    /// 校验配置并构造服务；独立实例使用自己的缓存，适用于单服务测试。
    pub fn new(config: &MiniappConfig) -> Result<Self, AppError> {
        Self::with_cache(config, Arc::new(AppCache::new()))
    }

    /// 注入 AppState 的共享缓存，使同一进程内的请求实例复用 access_token。
    pub fn with_cache(config: &MiniappConfig, cache: Arc<AppCache>) -> Result<Self, AppError> {
        let appid = required_config(config.appid.as_deref(), "MINIAPP_APPID")?;
        let secret = required_config(config.secret.as_deref(), "MINIAPP_SECRET")?;
        let raw_base = required_config(Some(config.api_base_url.as_str()), "MINIAPP_API_BASE_URL")?;
        let parsed = reqwest::Url::parse(raw_base).map_err(|error| {
            AppError::service_unavailable(format!("MINIAPP_API_BASE_URL 不是合法 URL: {error}"))
        })?;
        if !matches!(parsed.scheme(), "http" | "https")
            || parsed.host_str().is_none()
            || !parsed.username().is_empty()
            || parsed.password().is_some()
            || parsed.query().is_some()
            || parsed.fragment().is_some()
        {
            return Err(AppError::service_unavailable(
                "MINIAPP_API_BASE_URL 必须是无凭据、查询串或片段的 HTTP(S) 绝对地址",
            ));
        }
        Ok(Self {
            appid: appid.to_string(),
            secret: secret.to_string(),
            api_base_url: raw_base.trim_end_matches('/').to_string(),
            cache,
        })
    }

    /// 使用临时登录 code 换取 openid 会话。
    pub async fn code2session(&self, code: &str) -> Result<Value, AppError> {
        if code.trim().is_empty() {
            return Err(AppError::validation_displayable("code 不能为空"));
        }
        let response = self
            .client()?
            .get(format!("{}/sns/jscode2session", self.api_base_url))
            .query(&[
                ("appid", self.appid.as_str()),
                ("secret", self.secret.as_str()),
                ("js_code", code),
                ("grant_type", "authorization_code"),
            ])
            .send()
            .await
            .map_err(|error| {
                let error = error.without_url();
                AppError::service_unavailable(format!("微信 code2session 请求失败: {error}"))
            })?
            .error_for_status()
            .map_err(|error| {
                let error = error.without_url();
                AppError::service_unavailable(format!("微信 code2session HTTP 失败: {error}"))
            })?
            .json::<Value>()
            .await
            .map_err(|error| {
                let error = error.without_url();
                AppError::service_unavailable(format!("微信 code2session 响应解析失败: {error}"))
            })?;

        reject_wechat_error(&response, "code2session")?;
        let openid = response
            .get("openid")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| {
                error!("微信 code2session 响应缺少 openid");
                AppError::service_unavailable("微信 code2session 响应缺少 openid")
            })?;
        info!(openid_len = openid.len(), "微信 code2session 成功");
        Ok(response)
    }

    /// 使用手机号授权 code 换取纯手机号；令牌在有效窗口内复用。
    pub async fn get_phone_number(&self, code: &str) -> Result<String, AppError> {
        if code.trim().is_empty() {
            return Err(AppError::validation_displayable("phone_code 不能为空"));
        }
        let access_token = self.access_token().await?;
        let response = self
            .client()?
            .post(format!(
                "{}/wxa/business/getuserphonenumber",
                self.api_base_url
            ))
            .query(&[("access_token", access_token.as_str())])
            .json(&serde_json::json!({ "code": code }))
            .send()
            .await
            .map_err(|error| {
                let error = error.without_url();
                AppError::service_unavailable(format!("微信手机号请求失败: {error}"))
            })?
            .error_for_status()
            .map_err(|error| {
                let error = error.without_url();
                AppError::service_unavailable(format!("微信手机号 HTTP 失败: {error}"))
            })?
            .json::<Value>()
            .await
            .map_err(|error| {
                let error = error.without_url();
                AppError::service_unavailable(format!("微信手机号响应解析失败: {error}"))
            })?;

        reject_wechat_error(&response, "getPhoneNumber")?;
        let phone = response
            .pointer("/phone_info/purePhoneNumber")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                error!("微信手机号响应缺少 purePhoneNumber");
                AppError::service_unavailable("微信手机号响应缺少 purePhoneNumber")
            })?;
        let normalized = normalize_mainland_phone(phone)?;
        info!("微信 getPhoneNumber 成功");
        Ok(normalized)
    }

    /// 取一枚尚未进入刷新窗口的 access_token。
    async fn access_token(&self) -> Result<String, AppError> {
        let _guard = TOKEN_FETCH_LOCK.lock().await;
        let key = format!("wechat:miniapp:{}", self.appid);
        if let Some(cached) = self.cache.api_token_cache.get(&key) {
            if std::time::Instant::now() < cached.expires_at {
                info!(appid_len = self.appid.len(), "复用小程序 access_token 缓存");
                return Ok(cached.token);
            }
            warn!(
                appid_len = self.appid.len(),
                "小程序 access_token 已到刷新窗口"
            );
        }

        let fetched = self.fetch_access_token().await?;
        let token = fetched.token;
        let ttl = fetched.ttl;
        let expires_at = std::time::Instant::now() + ttl;
        self.cache.api_token_cache.set(
            key,
            CachedApiToken {
                token: token.clone(),
                expires_at,
            },
            Some(ttl),
        );
        info!(
            appid_len = self.appid.len(),
            ttl_secs = ttl.as_secs(),
            "小程序 access_token 取号成功并缓存"
        );
        Ok(token)
    }

    async fn fetch_access_token(&self) -> Result<FetchedToken, AppError> {
        let response = self
            .client()?
            .get(format!("{}/cgi-bin/token", self.api_base_url))
            .query(&[
                ("grant_type", "client_credential"),
                ("appid", self.appid.as_str()),
                ("secret", self.secret.as_str()),
            ])
            .send()
            .await
            .map_err(|error| {
                let error = error.without_url();
                AppError::service_unavailable(format!("微信 access_token 请求失败: {error}"))
            })?
            .error_for_status()
            .map_err(|error| {
                let error = error.without_url();
                AppError::service_unavailable(format!("微信 access_token HTTP 失败: {error}"))
            })?
            .json::<TokenResponse>()
            .await
            .map_err(|error| {
                let error = error.without_url();
                AppError::service_unavailable(format!("微信 access_token 响应解析失败: {error}"))
            })?;

        if response.errcode.is_some_and(|code| code != 0) {
            error!(errcode = ?response.errcode, "微信 access_token 返回错误");
            return Err(AppError::service_unavailable("微信 access_token 返回错误"));
        }
        let token = response
            .access_token
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| {
                error!("微信 access_token 响应缺少 access_token");
                AppError::service_unavailable("微信 access_token 响应缺少 access_token")
            })?;
        let expires_in = response.expires_in.ok_or_else(|| {
            error!("微信 access_token 响应缺少 expires_in");
            AppError::service_unavailable("微信 access_token 响应缺少 expires_in")
        })?;
        if expires_in <= 0 {
            error!("微信 access_token 响应 expires_in 非正数");
            return Err(AppError::service_unavailable(
                "微信 access_token 响应 expires_in 非正数",
            ));
        }
        let ttl = Duration::from_secs((expires_in as u64).saturating_sub(REFRESH_AHEAD_SECS));
        Ok(FetchedToken { token, ttl })
    }

    fn client(&self) -> Result<&Client, AppError> {
        HTTP_CLIENT
            .as_ref()
            .ok_or_else(|| AppError::service_unavailable("微信小程序 HTTP 客户端初始化失败"))
    }
}

struct FetchedToken {
    token: String,
    ttl: Duration,
}

fn required_config<'a>(value: Option<&'a str>, name: &str) -> Result<&'a str, AppError> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::service_unavailable(format!("{name} 未配置")))
}

fn reject_wechat_error(response: &Value, operation: &str) -> Result<(), AppError> {
    if let Some(errcode) = response.get("errcode").and_then(Value::as_i64) {
        if errcode != 0 {
            error!(operation, errcode, "微信接口返回业务错误");
            return Err(AppError::service_unavailable(format!(
                "微信 {operation} 返回错误 errcode={errcode}"
            )));
        }
    }
    Ok(())
}

/// 将大陆手机号归一为 11 位数字；接受可选的 `+86` 前缀，其余字符一律拒绝。
pub(crate) fn normalize_mainland_phone(phone: &str) -> Result<String, AppError> {
    let trimmed = phone.trim();
    let national = trimmed.strip_prefix("+86").unwrap_or(trimmed);
    let valid = national.len() == 11
        && national.starts_with('1')
        && matches!(national.as_bytes()[1], b'3'..=b'9')
        && national.bytes().all(|byte| byte.is_ascii_digit());
    if !valid {
        return Err(AppError::internal("手机号不是有效的大陆手机号"));
    }
    Ok(national.to_string())
}
