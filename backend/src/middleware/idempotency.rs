//! HTTP 请求级幂等重放防护中间件
//!
//! 挂在鉴权链最内侧：鉴权、CSRF、权限三道门都放行以后才占位，避免被拦截的请求
//! 白白消费掉一个幂等键（那种键之后重试会被误判成重复提交）。
//!
//! 判据：仅当请求同时满足「方法为 POST / PUT / PATCH / DELETE」与「带非空
//! Idempotency-Key 请求头」时启用；不带该头的请求逐字节保持原样，现有前端与
//! 小程序调用零影响。作用域是 (登录账号, 幂等键)：键只在提交者自己名下唯一，
//! 不同账号用同一串互不影响。
//!
//! 拒绝原因分开点名（都只涉及提交者自己产生的数据，可外显）：
//! - 同键同内容且上一次已受理成功：重复提交被拦截
//! - 同键同内容且上一次仍在处理中：并发重复提交被拦截
//! - 上一次已受理或正在处理，但本次内容（方法 / 路径 / 请求体）不一致：键复用判负，
//!   点名要求换新键，避免拿同一把键把两次不同意图混成一次
//!
//! 上一次请求没被受理（4xx 与 5xx）时把占位释放成 failed 并显式记日志：操作者
//! 改完内容还要用同一把键再提交一次，锁死键会让防护变成不可用的墙；服务端一旦
//! 在部署中被打断，未受理的请求也必须能重试。claimed 状态另有存活时限，超时的
//! 占位按 abandoned 放行重试，防止进程被杀留下的死占位把键锁住。表的保留期清理
//! 走审计清理的定时任务，不在请求路径上删除。
//!
//! 幂等存储自身不可用（表未建、库连接异常）时记录 error 并放行：本门是对
//! 重复提交的纵深防护，不能因为防护存储故障把所有写接口打成 500。

use crate::constants::MAX_HTTP_BODY_BYTES;
use crate::container::AppState;
use crate::middleware::auth_context::AuthContext;
use crate::models::http_request_dedupe::{
    ActiveModel as DedupeActiveModel, Column as DedupeColumn, DEDUPE_STATUS_CLAIMED,
    DEDUPE_STATUS_COMPLETED, DEDUPE_STATUS_FAILED, Entity as DedupeEntity,
};
use crate::utils::error::AppError;
use axum::extract::State;
use axum::http::{Method, Request, header::HeaderName};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ActiveValue, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter, SqlErr,
};
use sha2::{Digest, Sha256};

/// 幂等键请求头名（小写形态，HeaderMap 查找按大小写不敏感）
pub const IDEMPOTENCY_KEY_HEADER: &str = "idempotency-key";

/// 幂等键列宽上限，与迁移里 idem_key VARCHAR(200) 同源
const IDEMPOTENCY_KEY_MAX_LEN: usize = 200;

/// 路径列宽上限，与迁移里 path VARCHAR(255) 同源；超宽路径不占位、显式记日志放行
const DEDUPE_PATH_MAX_LEN: usize = 255;

/// claimed 占位的存活时限（分钟）：进程被杀或连接中断留下的死占位超时后可被重试接管
const CLAIM_TTL_MINUTES: i64 = 15;

/// 本门接管的方法集合。GET / HEAD / OPTIONS 是安全方法，重复执行不产生副作用，不进表。
fn is_guarded_method(method: &Method) -> bool {
    matches!(
        *method,
        Method::POST | Method::PUT | Method::PATCH | Method::DELETE
    )
}

/// 计算一次提交的内容指纹：方法 + 路径 + 请求体。
///
/// 把方法与路径一起折进哈希，是为了让「同一个键打到不同接口」也判成键复用，
/// 而不是被当成同一笔提交的重复。
fn request_fingerprint(method: &str, path: &str, body: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(method.as_bytes());
    hasher.update([0u8]);
    hasher.update(path.as_bytes());
    hasher.update([0u8]);
    hasher.update(body);
    format!("{:x}", hasher.finalize())
}

/// 请求级幂等去重中间件。
///
/// 入参：整个请求（需要 `AuthContext` 已在 extensions 里，由鉴权层注入）。
/// 传给谁：占位成功后交给内层 handler；占位失败直接返回 AppError 信封。
/// 存什么：`http_request_dedupe` 一行 (user_id, idem_key) 主键记录，含方法、路径、
/// 内容指纹、claimed / completed / failed 状态与占位时间。
pub async fn idempotency_middleware(
    State(state): State<AppState>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Response {
    let method = request.method().clone();
    if !is_guarded_method(&method) {
        return next.run(request).await;
    }

    let Some(raw_key) = request
        .headers()
        .get(HeaderName::from_static(IDEMPOTENCY_KEY_HEADER))
        .and_then(|v| v.to_str().ok())
    else {
        return next.run(request).await;
    };
    let idem_key = raw_key.trim().to_string();
    if idem_key.is_empty() {
        return next.run(request).await;
    }

    let Some(auth) = request.extensions().get::<AuthContext>().cloned() else {
        // 未认证（公开路由与登录前的调用）没有账号作用域，键的作用域无从确定，原样放行
        tracing::debug!(path = %request.uri().path(), "幂等门跳过：请求无登录上下文");
        return next.run(request).await;
    };

    if idem_key.chars().count() > IDEMPOTENCY_KEY_MAX_LEN {
        tracing::warn!(
            user_id = auth.user_id,
            key_len = idem_key.chars().count(),
            "幂等键超出列宽，拒绝本次提交"
        );
        return AppError::validation_displayable(format!(
            "幂等键长度不得超过 {} 字符",
            IDEMPOTENCY_KEY_MAX_LEN
        ))
        .into_response();
    }

    let path = request.uri().path().to_string();
    if path.len() > DEDUPE_PATH_MAX_LEN {
        tracing::warn!(
            user_id = auth.user_id,
            path_len = path.len(),
            "幂等门跳过：路径超出列宽，本请求不做去重"
        );
        return next.run(request).await;
    }

    // 取出请求体算指纹，再原样放回，内层 handler 仍按正常流读取同一份字节
    let (parts, body) = request.into_parts();
    let bytes = match axum::body::to_bytes(body, MAX_HTTP_BODY_BYTES).await {
        Ok(bytes) => bytes,
        Err(err) => {
            // 体都读不全就没法算指纹，此时既不占位也不放行（放行会让重复提交穿过后端），
            // 显式判负并点名是读取环节失败；原始错误只进日志。
            tracing::error!(
                error = %err,
                user_id = auth.user_id,
                method = method.as_str(),
                path,
                "幂等门读取请求体失败，本次提交判负"
            );
            return AppError::validation(format!("读取带幂等键的请求体失败: {err}"))
                .into_response();
        }
    };
    // AuthContext 随 parts.extensions 一起被取出，重新组装请求时原样带回去
    let fingerprint = request_fingerprint(method.as_str(), &path, bytes.as_ref());
    let request = Request::from_parts(parts, axum::body::Body::from(bytes));

    let claimed = match claim_slot(
        &state,
        auth.user_id,
        &idem_key,
        method.as_str(),
        &path,
        &fingerprint,
    )
    .await
    {
        Ok(ClaimOutcome::Claimed) => true,
        Ok(ClaimOutcome::Rejected(reason)) => {
            tracing::warn!(
                user_id = auth.user_id,
                method = method.as_str(),
                path,
                idem_key,
                reason,
                "幂等门拦截重复提交"
            );
            return AppError::business_displayable(reason).into_response();
        }
        Err(err) => {
            tracing::error!(
                error = %err,
                user_id = auth.user_id,
                path,
                "幂等存储不可用，本次请求不做去重直接放行（详见模块文档的故障放行约定）"
            );
            false
        }
    };

    let response = next.run(request).await;

    if claimed {
        // 只有 2xx / 3xx 算受理成功。4xx 是提交本身被拒（校验、业务规则、权限之外的
        // 公开规则），操作者改完内容还要用同一把键再提交一次，因此与 5xx 同样释放占位；
        // 若不释放，改一次内容就得换一次键，防护会退化成一堵墙。
        let accepted = response.status().is_success() || response.status().is_redirection();
        if !accepted {
            tracing::warn!(
                user_id = auth.user_id,
                method = method.as_str(),
                path,
                idem_key,
                status = response.status().as_u16(),
                "该提交未被受理，幂等占位已释放，允许同一键改后重试"
            );
        }
        let new_status = if accepted {
            DEDUPE_STATUS_COMPLETED
        } else {
            DEDUPE_STATUS_FAILED
        };
        if let Err(err) = finalize_slot(&state, auth.user_id, &idem_key, new_status).await {
            tracing::error!(
                error = %err,
                user_id = auth.user_id,
                path,
                idem_key,
                new_status,
                "幂等占位状态回写失败（响应已按原样返回，不掩盖存储故障）"
            );
        }
    }

    response
}

/// 占位结果：抢到槽位，或者按点名原因拒绝。
enum ClaimOutcome {
    Claimed,
    Rejected(String),
}

/// 原子占位：先 INSERT，主键冲突再读回既有行按状态与指纹裁决。
///
/// 走 INSERT 优先而不是先查后插，是为了让并发同时到达的两笔里只有一笔成功，
/// 另一笔必然落到冲突分支，不依赖读侧的乐观判断。
async fn claim_slot(
    state: &AppState,
    user_id: i32,
    idem_key: &str,
    method: &str,
    path: &str,
    fingerprint: &str,
) -> Result<ClaimOutcome, AppError> {
    let active = DedupeActiveModel {
        user_id: ActiveValue::Set(user_id),
        idem_key: ActiveValue::Set(idem_key.to_string()),
        method: ActiveValue::Set(method.to_string()),
        path: ActiveValue::Set(path.to_string()),
        request_hash: ActiveValue::Set(fingerprint.to_string()),
        status: ActiveValue::Set(DEDUPE_STATUS_CLAIMED.to_string()),
        created_at: ActiveValue::Set(Utc::now()),
    };

    match active.insert(&*state.db).await {
        Ok(_) => Ok(ClaimOutcome::Claimed),
        Err(err) => {
            let unique_conflict =
                matches!(err.sql_err(), Some(SqlErr::UniqueConstraintViolation(_)));
            if !unique_conflict {
                return Err(AppError::from(err));
            }
            let existing = DedupeEntity::find()
                .filter(DedupeColumn::UserId.eq(user_id))
                .filter(DedupeColumn::IdemKey.eq(idem_key))
                .one(&*state.db)
                .await?
                .ok_or_else(|| AppError::database("幂等占位冲突后读不回既有行"))?;

            let abandoned = existing.status == DEDUPE_STATUS_CLAIMED
                && existing.created_at < Utc::now() - chrono::Duration::minutes(CLAIM_TTL_MINUTES);

            if existing.status == DEDUPE_STATUS_COMPLETED {
                if existing.request_hash == fingerprint {
                    return Ok(ClaimOutcome::Rejected(format!(
                        "该提交（幂等键 {}）已受理成功，重复提交已被拦截",
                        idem_key
                    )));
                }
                return Ok(ClaimOutcome::Rejected(format!(
                    "幂等键 {} 已被另一份已受理的提交使用，本次内容与之不一致，请为新提交使用新的幂等键",
                    idem_key
                )));
            }
            if existing.status == DEDUPE_STATUS_CLAIMED && !abandoned {
                if existing.request_hash == fingerprint {
                    return Ok(ClaimOutcome::Rejected(format!(
                        "该提交（幂等键 {}）正在处理中，请勿重复提交",
                        idem_key
                    )));
                }
                return Ok(ClaimOutcome::Rejected(format!(
                    "幂等键 {} 的一次提交正在处理中，同一把键不能同时用于两份不同内容",
                    idem_key
                )));
            }

            // failed（或超时的 claimed）：同一笔提交的重试，接管占位并刷新指纹与时间
            let mut retry: DedupeActiveModel = existing.into_active_model();
            retry.method = ActiveValue::Set(method.to_string());
            retry.path = ActiveValue::Set(path.to_string());
            retry.request_hash = ActiveValue::Set(fingerprint.to_string());
            retry.status = ActiveValue::Set(DEDUPE_STATUS_CLAIMED.to_string());
            retry.created_at = ActiveValue::Set(Utc::now());
            retry.update(&*state.db).await?;
            tracing::info!(
                user_id,
                idem_key,
                path,
                "幂等占位由失败或超时的上一任接管，放行重试"
            );
            Ok(ClaimOutcome::Claimed)
        }
    }
}

/// 回写占位终态（completed / failed）。
async fn finalize_slot(
    state: &AppState,
    user_id: i32,
    idem_key: &str,
    status: &str,
) -> Result<(), AppError> {
    let Some(existing) = DedupeEntity::find()
        .filter(DedupeColumn::UserId.eq(user_id))
        .filter(DedupeColumn::IdemKey.eq(idem_key))
        .one(&*state.db)
        .await?
    else {
        // 存储故障分支下没有占位行可写，直接返回（调用方已按 claimed=false 跳过本函数）
        return Ok(());
    };
    let mut model: DedupeActiveModel = existing.into_active_model();
    model.status = ActiveValue::Set(status.to_string());
    model.update(&*state.db).await?;
    Ok(())
}
