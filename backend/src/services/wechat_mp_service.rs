//! 微信公众号通知腿：接口调用令牌获取与缓存 + 模板消息发送 + 按业务对象去重
//!
//! ## 六要素
//! - **功能**:向已绑定 openid 的用户投递公众号模板消息。三支能力——
//!   ① `access_token()` 取接口调用令牌并按有效期缓存，提前量刷新，并发下同一时刻只放行一次
//!   真实取号请求；② `send_template_message()` 按 openid/模板 id/跳转目标/字段集合投递一条
//!   模板消息，成功与失败都打显式日志，失败带上公众号 errcode 与 errmsg 供追溯；
//!   ③ `notify_template()` 在②外面套一层"事件类型 + 业务对象"去重与模板配置解析，
//!   同一业务对象的同一类通知只轰炸一次，发送失败时回收去重占位使该通知可重试。
//! - **调用方**:通知调度与业务事件方（`services/notification_scheduler.rs`、
//!   `services/event_notification_service.rs` 后续接入报价与对账事件时调用 `notify_template()`；
//!   本次改动不插业务调用点）。凭证与模板 ID 只从 `config::settings::global_wechat_mp_config()`
//!   取，缺配时本模块把通知腿判为不可用并显式记日志。
//! - **入参**:`openid`（收件人，来自 `user_wechat_mp_binding` 表）、`template_id`（公众号模板 ID）、
//!   `jump_url`（点消息后跳转的目标地址，`None` 表示不带跳转）、`fields`（模板字段集合，
//!   键为公众号后台模板的占位符名，值为渲染文本）。`notify_template()` 另收
//!   `WechatMpTemplateKind`（事件类型）与 `business_key`（业务对象标识）。
//! - **传给谁**:HTTP 出站只投固定官方主机 `api.weixin.qq.com`（不走任何环境变量与用户输入拼 URL，
//!   避免把 appsecret 与令牌发往可控地址）；去重占位与回收交给
//!   `services/event_idempotency_service::EventIdempotencyService`。
//! - **存什么**:进程级令牌缓存存 `access_token` 与 `expires_at`（不落库、不进日志）；
//!   去重占位存进 `processed_events` 表，`consumer_id = "wechat_mp_notification"`、
//!   `event_key = "{事件类型 code}:{业务对象标识}"`、`event_type` 取事件类型 code、
//!   `processed_at` 为占位时刻。
//! - **存哪里**:令牌缓存在本模块的进程级 `ACCESS_TOKEN_CACHE`（重启即失效，由公众号侧
//!   自然过期语义兜住）；去重台账在 PostgreSQL `public.processed_events`。
//!
//! ## 设计说明
//! - **单飞取号**:公众号同一 appid 的接口调用令牌全局唯一，重复取号会把上一次签发的令牌挤成
//!   "上次调用生成的 token 未过期，本次调用又生成了新的"并触发 45009 频率限制。缓存用一把
//!   `tokio::sync::Mutex` 覆盖"检查有效期 + 发一次真实取号请求"整段，后来者在锁上排队，
//!   拿到锁时看到的已是新令牌，因此任意时刻最多一个真实取号请求在飞。锁只在取令牌这段持有，
//!   跨的是 `await`（用的是异步锁，不是同步锁），不覆盖消息发送。
//! - **提前量刷新**:令牌有效期以响应 `expires_in` 为准，`expires_in - 提前量` 即判过期，
//!   避免在到期边界上发出必然 42001 的请求。
//! - **令牌失效自愈**:发送侧拿到 40001/40002/42001（凭证无效、令牌过期或被子协议挤掉）时清空
//!   缓存并显式记 WARN，下一次调用自然重取，不在缓存里保留坏令牌反复撞墙。
//! - **去重占位可回收**:先占位再发送；发送失败立刻 `unmark_processed` 回收占位，
//!   否则一次网络抖动会把该业务对象的该类通知永久静音。回收本身失败只记 WARN，
//!   不掩盖原始发送失败（原始失败照常返回）。
//! - **未配置不是成功**:凭证缺失返回 `SERVICE_UNAVAILABLE`，模板 ID 缺失返回 `NOT_FOUND`
//!   且文案点名该配的环境变量名；两者都先记显式日志，绝不静默跳过、绝不给密钥兜底值。

use std::sync::Arc;

use chrono::{DateTime, Utc};
use once_cell::sync::Lazy;
use reqwest::Client;
use sea_orm::DatabaseConnection;
use serde::Deserialize;
use serde_json::{Map, Value, json};
use tokio::sync::Mutex;
use tracing::{error, info, warn};

use crate::config::settings::{WechatMpTemplateKind, global_wechat_mp_config};
use crate::services::event_idempotency_service::EventIdempotencyService;
use crate::utils::error::AppError;

/// 公众号接口固定主机名——凭证与令牌只发往官方地址，不接受环境变量或用户输入拼接。
const WECHAT_MP_API_HOST: &str = "https://api.weixin.qq.com";
/// 接口调用令牌获取端点（`GET /cgi-bin/token`）。
const ACCESS_TOKEN_PATH: &str = "/cgi-bin/token";
/// 模板消息发送端点（`POST /cgi-bin/message/template/send`）。
const TEMPLATE_SEND_PATH: &str = "/cgi-bin/message/template/send";

/// 令牌到期提前刷新量（秒）。公众号令牌有效期 7200 秒，提前 300 秒判过期，
/// 留出一次重取的网络往返，避免在到期边界上撞 42001。
const ACCESS_TOKEN_REFRESH_AHEAD_SECS: i64 = 300;
/// 令牌有效期缺省值（秒）：仅在响应未回 `expires_in` 时按公众号文档口径取 7200。
const ACCESS_TOKEN_DEFAULT_TTL_SECS: i64 = 7200;
/// 出站连接建立超时（秒）。
const CONNECT_TIMEOUT_SECS: u64 = 10;
/// 出站单次请求总超时（秒）——取号与发送都是短请求，超时即判失败，不无限等。
const REQUEST_TIMEOUT_SECS: u64 = 15;

/// 通知腿在幂等台账里的消费者标识（`processed_events.consumer_id`）。
/// 与事件总线的消费者分列，避免通知去重与业务副作用幂等互相顶掉占位。
const NOTIFICATION_CONSUMER_ID: &str = "wechat_mp_notification";

/// 公众号侧"接口调用令牌失效"一族的错误码：40001 凭证无效、40002 凭证类型不对、
/// 42001 令牌超时、40014 令牌不合法。命中即清缓存，让下一次调用重取。
const ACCESS_TOKEN_INVALID_ERRCODES: [i64; 4] = [40001, 40002, 40014, 42001];

/// 进程级接口调用令牌缓存：`None` = 尚未取号或已判失效。
/// 单飞语义由这把异步锁提供（见模块头"单飞取号"）。
static ACCESS_TOKEN_CACHE: Lazy<Mutex<Option<CachedAccessToken>>> = Lazy::new(|| Mutex::new(None));

/// 进程级共享出站客户端：取号链（静态关联函数）与模板消息发送腿共用一份连接池，
/// 固定请求超时、连接超时与禁重定向，不按服务实例各自新建。
static HTTP_CLIENT: Lazy<Client> = Lazy::new(|| {
    Client::builder()
        .timeout(std::time::Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .connect_timeout(std::time::Duration::from_secs(CONNECT_TIMEOUT_SECS))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| {
            error!("公众号通知腿 HTTP 客户端构建失败: {}", e);
            e
        })
        .expect("公众号通知腿 HTTP 客户端参数均为固定值，构建不应失败")
});

/// 缓存中的一枚接口调用令牌及其到期时刻。
#[derive(Debug, Clone)]
struct CachedAccessToken {
    token: String,
    expires_at: DateTime<Utc>,
}

impl CachedAccessToken {
    /// 是否仍在可用窗口内（已扣掉提前刷新量）。
    fn is_fresh(&self) -> bool {
        Utc::now() < self.expires_at
    }
}

/// `GET /cgi-bin/token` 响应体。
///
/// 成功回 `access_token` + `expires_in`；失败回 `errcode` + `errmsg` 且不带 `access_token`。
/// 两组字段都是 `Option`，由 `parse_token_response` 判定属于哪一路，不做默认值兜底。
#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    expires_in: Option<i64>,
    errcode: Option<i64>,
    errmsg: Option<String>,
}

/// `POST /cgi-bin/message/template/send` 响应体。
///
/// 成功回 `{"errcode":0,"errmsg":"ok","msgid":...}`；`errcode` 缺省按 0 解释是公众号接口契约
/// （成功样例不回 errcode 时视为 0），不是失败静默。
#[derive(Debug, Deserialize)]
struct SendResponse {
    #[serde(default)]
    errcode: i64,
    errmsg: Option<String>,
    msgid: Option<i64>,
}

/// 模板消息的一个字段占位：`key` 是公众号后台模板里的占位符名（如 `first`、`keyword1`），
/// `value` 是渲染文本。
pub struct TemplateField<'a> {
    pub key: &'a str,
    pub value: &'a str,
}

impl<'a> TemplateField<'a> {
    /// 构造一枚模板字段占位。
    pub fn new(key: &'a str, value: &'a str) -> Self {
        Self { key, value }
    }
}

/// 一次 `notify_template()` 的落地结果，供调用方区分"真发出去了"与"被去重挡下"。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NotificationOutcome {
    /// 已成功投递给公众号
    Sent,
    /// 该业务对象的该类通知此前已占位，本次不重复发
    SkippedDuplicate,
}

/// 微信公众号通知腿。
pub struct WechatMpService {
    db: Arc<DatabaseConnection>,
}

impl WechatMpService {
    /// 以共享的数据库连接建服务实例；出站客户端为进程级共享的 `HTTP_CLIENT`。
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
    }

    /// 通知腿当前是否可用：接口凭证齐备即可用。
    ///
    /// 供调度侧在挂载后台任务前一次性判据（不可用时任务可以不挂或照挂由发送处显式失败），
    /// 缺配成因由 [`Self::require_credentials`] 在真正要发的时候点名。
    pub fn is_available() -> bool {
        global_wechat_mp_config().has_credentials()
    }

    /// 校验并取回接口凭证；缺失时记显式 WARN 并返回 `SERVICE_UNAVAILABLE`，
    /// 日志与错误信息只点名环境变量名，绝不回显任何取值。
    fn require_credentials() -> Result<(String, String), AppError> {
        let cfg = global_wechat_mp_config();
        let missing = cfg.missing_credential_env_names();
        if !missing.is_empty() {
            warn!(
                "公众号通知腿不可用：接口凭证缺失 {:?}，本次模板消息不发送",
                missing
            );
            return Err(AppError::service_unavailable(format!(
                "公众号通知腿不可用：接口凭证缺失 {:?}",
                missing
            )));
        }
        // 上一步已确认两枚都在，此处取值必然成功
        let appid = cfg
            .appid
            .expect("missing_credential_env_names 已确认 WECHAT_MP_APPID 在场");
        let secret = cfg
            .secret
            .expect("missing_credential_env_names 已确认 WECHAT_MP_SECRET 在场");
        Ok((appid, secret))
    }

    /// 取一枚可用的接口调用令牌。
    ///
    /// 单飞：整段（判有效期 → 取新号 → 写缓存）在同一把异步锁内完成，
    /// 因此并发调用同一时刻只会放行一次真实取号请求，后来者排队后直接复用新令牌。
    /// 锁不跨发送，只在取号这段持有。
    pub async fn access_token() -> Result<String, AppError> {
        let mut guard = ACCESS_TOKEN_CACHE.lock().await;
        if let Some(cached) = guard.as_ref() {
            if cached.is_fresh() {
                info!("公众号通知腿复用缓存中的接口调用令牌");
                return Ok(cached.token.clone());
            }
            warn!("公众号接口调用令牌已到刷新窗口，重新取号");
        }

        let (appid, secret) = Self::require_credentials()?;
        let fetched = Self::fetch_access_token(&appid, &secret).await?;
        info!(
            "公众号接口调用令牌取号成功，到期时刻 {}",
            fetched.expires_at.to_rfc3339()
        );
        let token = fetched.token.clone();
        *guard = Some(fetched);
        Ok(token)
    }

    /// 真实向公众号取一次号，按响应 `expires_in` 扣掉提前量算出到期时刻。
    async fn fetch_access_token(appid: &str, secret: &str) -> Result<CachedAccessToken, AppError> {
        let url = format!("{}{}", WECHAT_MP_API_HOST, ACCESS_TOKEN_PATH);
        let response = Self::send_form_query(&url, appid, secret).await?;

        let body: TokenResponse = response
            .json()
            .await
            .map_err(|e| AppError::service_unavailable(format!("公众号取号响应解析失败: {}", e)))?;

        Self::parse_token_response(body)
    }

    /// 发送取号请求：appid/secret 只走查询串参数化拼接，不进任何日志。
    async fn send_form_query(
        url: &str,
        appid: &str,
        secret: &str,
    ) -> Result<reqwest::Response, AppError> {
        let response = Self::http()
            .get(url)
            .query(&[
                ("grant_type", "client_credential"),
                ("appid", appid),
                ("secret", secret),
            ])
            .send()
            .await
            .map_err(|e| {
                error!("公众号取号请求失败: {}", e);
                AppError::service_unavailable(format!("公众号取号请求失败: {}", e))
            })?;
        Ok(response)
    }

    /// 出站客户端（进程内共享一份连接池）。
    fn http() -> &'static Client {
        &HTTP_CLIENT
    }

    /// 把取号响应判成"令牌 + 到期时刻"或显式失败。
    fn parse_token_response(body: TokenResponse) -> Result<CachedAccessToken, AppError> {
        let token = match body.access_token {
            Some(t) if !t.trim().is_empty() => t,
            _ => {
                let errcode = body.errcode.unwrap_or_default();
                let errmsg = body.errmsg.unwrap_or_else(|| "无 errmsg".to_string());
                error!("公众号取号失败: errcode={} errmsg={}", errcode, errmsg);
                return Err(AppError::service_unavailable(format!(
                    "公众号取号失败: errcode={} errmsg={}",
                    errcode, errmsg
                )));
            }
        };
        if let Some(errcode) = body.errcode {
            if errcode != 0 {
                // 带 errcode 又带了 access_token 属异常响应形态，按失败处理，不猜哪边可信
                error!(
                    "公众号取号响应形态异常: errcode={} errmsg={:?}",
                    errcode, body.errmsg
                );
                return Err(AppError::service_unavailable(format!(
                    "公众号取号响应形态异常: errcode={}",
                    errcode
                )));
            }
        }
        let ttl = body.expires_in.unwrap_or(ACCESS_TOKEN_DEFAULT_TTL_SECS);
        let expires_at = Utc::now()
            + chrono::Duration::seconds(ttl.saturating_sub(ACCESS_TOKEN_REFRESH_AHEAD_SECS));
        Ok(CachedAccessToken { token, expires_at })
    }

    /// 清空令牌缓存（下一次 [`Self::access_token`] 必然重新取号）。
    async fn invalidate_access_token(reason: &str) {
        let mut guard = ACCESS_TOKEN_CACHE.lock().await;
        if guard.take().is_some() {
            warn!("公众号接口调用令牌已失效并清出缓存：{}", reason);
        }
    }

    /// 按 openid 与模板 id 投一条模板消息，不带去重与配置解析（发送腿本体）。
    ///
    /// 入参：`openid` 收件人、`template_id` 公众号模板 ID、`jump_url` 点击跳转目标
    /// （`None` = 不带 `url` 字段）、`fields` 模板字段集合。
    /// 成功与失败都打显式日志；失败返回的 `AppError` 文案带 errcode 与 errmsg，可追溯。
    pub async fn send_template_message(
        &self,
        openid: &str,
        template_id: &str,
        jump_url: Option<&str>,
        fields: &[TemplateField<'_>],
    ) -> Result<(), AppError> {
        if openid.trim().is_empty() {
            return Err(AppError::validation("模板消息收件人 openid 为空"));
        }
        if template_id.trim().is_empty() {
            return Err(AppError::validation("模板消息模板 ID 为空"));
        }
        if fields.is_empty() {
            return Err(AppError::validation("模板消息字段集合为空"));
        }

        let token = Self::access_token().await?;
        let payload = Self::build_template_payload(openid, template_id, jump_url, fields);
        let url = format!(
            "{}{}?access_token={}",
            WECHAT_MP_API_HOST, TEMPLATE_SEND_PATH, token
        );

        let response = Self::http()
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| {
                error!(
                    "公众号模板消息请求失败: openid={} template_id={} err={}",
                    openid, template_id, e
                );
                AppError::service_unavailable(format!("公众号模板消息请求失败: {}", e))
            })?;

        let status = response.status().as_u16();
        let body: SendResponse = response.json().await.map_err(|e| {
            AppError::service_unavailable(format!("公众号模板消息响应解析失败: {}", e))
        })?;

        if body.errcode == 0 {
            info!(
                "公众号模板消息发送成功: openid={} template_id={} msgid={} http_status={}",
                openid,
                template_id,
                body.msgid.unwrap_or_default(),
                status
            );
            return Ok(());
        }

        let errmsg = body.errmsg.unwrap_or_else(|| "无 errmsg".to_string());
        if ACCESS_TOKEN_INVALID_ERRCODES.contains(&body.errcode) {
            Self::invalidate_access_token(&format!("errcode={}", body.errcode)).await;
        }
        error!(
            "公众号模板消息发送失败: openid={} template_id={} errcode={} errmsg={} http_status={}",
            openid, template_id, body.errcode, errmsg, status
        );
        Err(AppError::service_unavailable(format!(
            "公众号模板消息发送失败: errcode={} errmsg={}",
            body.errcode, errmsg
        )))
    }

    /// 组装公众号模板消息请求体（`touser` / `template_id` / 可选 `url` / `data`）。
    fn build_template_payload(
        openid: &str,
        template_id: &str,
        jump_url: Option<&str>,
        fields: &[TemplateField<'_>],
    ) -> Value {
        let mut data = Map::new();
        for field in fields {
            data.insert(field.key.to_string(), json!({ "value": field.value }));
        }
        let mut payload = Map::new();
        payload.insert("touser".to_string(), json!(openid));
        payload.insert("template_id".to_string(), json!(template_id));
        if let Some(url) = jump_url {
            payload.insert("url".to_string(), json!(url));
        }
        payload.insert("data".to_string(), Value::Object(data));
        Value::Object(payload)
    }

    /// 按事件类型发一条带去重保护的通知。
    ///
    /// 入参：`kind` 事件类型（决定用哪枚模板 ID）、`openid` 收件人、`business_key` 业务对象标识
    /// （如报价单号、对账单号）、`jump_url` 跳转目标、`fields` 模板字段集合。
    /// 流程：解析模板 ID（未配置显式失败）→ 占位去重（已占位则返回 [`NotificationOutcome::SkippedDuplicate`]）
    /// → 发送（失败回收占位，使该通知可重试）。
    pub async fn notify_template(
        &self,
        kind: WechatMpTemplateKind,
        openid: &str,
        business_key: &str,
        jump_url: Option<&str>,
        fields: &[TemplateField<'_>],
    ) -> Result<NotificationOutcome, AppError> {
        let template_id = global_wechat_mp_config()
            .template_id(kind)
            .map(|s| s.to_string())
            .ok_or_else(|| {
                warn!(
                    "公众号通知腿模板未配置：{}（{}），{} 不发送",
                    kind.env_name(),
                    kind.label(),
                    business_key
                );
                AppError::not_found_displayable(format!(
                    "公众号通知模板未配置：{}",
                    kind.env_name()
                ))
            })?;

        if business_key.trim().is_empty() {
            return Err(AppError::validation("模板消息去重业务对象标识为空"));
        }

        let idempotency = EventIdempotencyService::new(self.db.clone());
        let event_key = format!("{}:{}", kind.code(), business_key);
        let claimed = idempotency
            .try_mark_processed(NOTIFICATION_CONSUMER_ID, &event_key, kind.code())
            .await?;
        if !claimed {
            info!("公众号通知去重命中，跳过重复轰炸: event_key={}", event_key);
            return Ok(NotificationOutcome::SkippedDuplicate);
        }

        match self
            .send_template_message(openid, &template_id, jump_url, fields)
            .await
        {
            Ok(()) => Ok(NotificationOutcome::Sent),
            Err(e) => {
                // 发送没成，占位必须回收，否则这条通知永久静音；回收失败只点名，不掩盖原始失败
                if let Err(release_err) = idempotency
                    .unmark_processed(NOTIFICATION_CONSUMER_ID, &event_key)
                    .await
                {
                    warn!(
                        "公众号通知发送失败后的去重占位回收也失败: event_key={} err={}",
                        event_key, release_err
                    );
                }
                Err(e)
            }
        }
    }
}
