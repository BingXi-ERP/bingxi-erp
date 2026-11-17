use bingxi_backend::utils::error::AppError;
use bingxi_backend::utils::ssrf_guard::is_blocked_ip;
use bingxi_backend::utils::ssrf_guard::*;
use std::net::IpAddr;
use std::net::{Ipv4Addr, Ipv6Addr};

// ============ IPv4 黑名单测试 ============

#[test]
fn test_ipv4_loopback_blocked() {
    assert!(is_blocked_ip(&IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1))));
    assert!(is_blocked_ip(&IpAddr::V4(Ipv4Addr::new(
        127, 255, 255, 255
    ))));
}

#[test]
fn test_ipv4_rfc1918_blocked() {
    // 10.0.0.0/8
    assert!(is_blocked_ip(&IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1))));
    assert!(is_blocked_ip(&IpAddr::V4(Ipv4Addr::new(10, 255, 255, 255))));
    // 172.16.0.0/12
    assert!(is_blocked_ip(&IpAddr::V4(Ipv4Addr::new(172, 16, 0, 1))));
    assert!(is_blocked_ip(&IpAddr::V4(Ipv4Addr::new(172, 31, 255, 255))));
    // 192.168.0.0/16
    assert!(is_blocked_ip(&IpAddr::V4(Ipv4Addr::new(192, 168, 0, 1))));
    assert!(is_blocked_ip(&IpAddr::V4(Ipv4Addr::new(
        192, 168, 255, 255
    ))));
}

#[test]
fn test_ipv4_link_local_blocked() {
    // 169.254.0.0/16（含云元数据 169.254.169.254）
    assert!(is_blocked_ip(&IpAddr::V4(Ipv4Addr::new(169, 254, 0, 1))));
    assert!(is_blocked_ip(&IpAddr::V4(Ipv4Addr::new(
        169, 254, 169, 254
    ))));
}

#[test]
fn test_ipv4_unspecified_blocked() {
    assert!(is_blocked_ip(&IpAddr::V4(Ipv4Addr::new(0, 0, 0, 0))));
}

#[test]
fn test_ipv4_broadcast_blocked() {
    assert!(is_blocked_ip(&IpAddr::V4(Ipv4Addr::new(
        255, 255, 255, 255
    ))));
}

#[test]
fn test_ipv4_public_allowed() {
    assert!(!is_blocked_ip(&IpAddr::V4(Ipv4Addr::new(8, 8, 8, 8))));
    assert!(!is_blocked_ip(&IpAddr::V4(Ipv4Addr::new(1, 1, 1, 1))));
    assert!(!is_blocked_ip(&IpAddr::V4(Ipv4Addr::new(140, 82, 121, 4))));
}

#[test]
fn test_ipv4_cgnat_blocked() {
    // 100.64.0.0/10
    assert!(is_blocked_ip(&IpAddr::V4(Ipv4Addr::new(100, 64, 0, 1))));
    assert!(is_blocked_ip(&IpAddr::V4(Ipv4Addr::new(
        100, 127, 255, 255
    ))));
}

// ============ IPv6 黑名单测试 ============

#[test]
fn test_ipv6_loopback_blocked() {
    assert!(is_blocked_ip(&IpAddr::V6(Ipv6Addr::LOCALHOST)));
}

#[test]
fn test_ipv6_unspecified_blocked() {
    assert!(is_blocked_ip(&IpAddr::V6(Ipv6Addr::UNSPECIFIED)));
}

#[test]
fn test_ipv6_link_local_blocked() {
    let ip = Ipv6Addr::new(0xfe80, 0, 0, 0, 0, 0, 0, 1);
    assert!(is_blocked_ip(&IpAddr::V6(ip)));
}

#[test]
fn test_ipv6_ula_blocked() {
    // fc00::/7（含 fd00::/8）
    assert!(is_blocked_ip(&IpAddr::V6(Ipv6Addr::new(
        0xfc00, 0, 0, 0, 0, 0, 0, 1
    ))));
    assert!(is_blocked_ip(&IpAddr::V6(Ipv6Addr::new(
        0xfd00, 0, 0, 0, 0, 0, 0, 1
    ))));
}

#[test]
fn test_ipv4_mapped_ipv6_blocked() {
    // ::ffff:127.0.0.1（IPv4-mapped IPv6 loopback）
    let segments = [0, 0, 0, 0, 0, 0xffff, 0x7f00, 0x0001];
    let ip = Ipv6Addr::from(segments);
    assert!(is_blocked_ip(&IpAddr::V6(ip)));
}

// ============ 主机名黑名单测试 ============

#[test]
fn test_blocked_hostname_localhost() {
    assert!(is_blocked_hostname("localhost"));
    assert!(is_blocked_hostname("LOCALHOST"));
    assert!(is_blocked_hostname("LocalHost"));
}

#[test]
fn test_blocked_hostname_suffixes() {
    assert!(is_blocked_hostname("foo.local"));
    assert!(is_blocked_hostname("BAR.LOCAL"));
    assert!(is_blocked_hostname("printer.internal"));
    assert!(is_blocked_hostname("gitlab.intranet"));
}

#[test]
fn test_blocked_hostname_public_allowed() {
    assert!(!is_blocked_hostname("example.com"));
    assert!(!is_blocked_hostname("github.com"));
    assert!(!is_blocked_hostname("api.bingxi-erp.com"));
}

// ============ URL 校验集成测试 ============

#[test]
fn test_validate_url_invalid_format() {
    let result = validate_url("not-a-url");
    assert!(result.is_err());
    // 解析失败的原文携带 url crate 错误详情，只锁错误族与前缀（ssrf_guard.rs:36）
    let err = result.unwrap_err();
    assert_eq!(err.error_code(), "VALIDATION_ERROR");
    assert!(err.to_string().contains("URL 格式无效"), "实际: {err}");
}

#[test]
fn test_validate_url_disallowed_scheme() {
    let result = validate_url("file:///etc/passwd");
    assert!(result.is_err());
    assert!(
        matches!(result.unwrap_err(), AppError::ValidationErrorDisplayable(ref m) if m == "URL 协议不允许：file（仅允许 http/https）"),
        "file 协议必须被协议白名单拒绝（ssrf_guard.rs:42）"
    );
    let result = validate_url("gopher://example.com");
    assert!(result.is_err());
    assert!(
        matches!(result.unwrap_err(), AppError::ValidationErrorDisplayable(ref m) if m == "URL 协议不允许：gopher（仅允许 http/https）"),
        "gopher 协议必须被协议白名单拒绝（ssrf_guard.rs:42）"
    );
}

#[test]
fn test_validate_url_localhost_blocked() {
    let result = validate_url("http://localhost/webhook");
    assert!(result.is_err());
    assert!(
        matches!(result.unwrap_err(), AppError::ValidationError(ref m) if m == "Webhook URL 主机名被禁止：localhost（可能指向本地或私有网络）"),
        "localhost 必须被主机名黑名单拒绝（ssrf_guard.rs:56）"
    );
}

#[test]
fn test_validate_url_loopback_ip_blocked() {
    let result = validate_url("http://127.0.0.1/webhook");
    assert!(result.is_err());
    assert!(
        matches!(result.unwrap_err(), AppError::ValidationError(ref m) if m == "Webhook URL 指向被禁止的 IP 地址：127.0.0.1"),
        "loopback IP 必须被 IP 黑名单拒绝（ssrf_guard.rs:65）"
    );
}

#[test]
fn test_validate_url_rfc1918_blocked() {
    let result = validate_url("http://10.0.0.1/webhook");
    assert!(result.is_err());
    let err = result.unwrap_err();
    assert!(
        matches!(err, AppError::ValidationError(ref m) if m == "Webhook URL 指向被禁止的 IP 地址：10.0.0.1"),
        "实际: {err:?}"
    );
    let result = validate_url("http://172.16.0.1/webhook");
    assert!(result.is_err());
    let err = result.unwrap_err();
    assert!(
        matches!(err, AppError::ValidationError(ref m) if m == "Webhook URL 指向被禁止的 IP 地址：172.16.0.1"),
        "实际: {err:?}"
    );
    let result = validate_url("http://192.168.1.1/webhook");
    assert!(result.is_err());
    let err = result.unwrap_err();
    assert!(
        matches!(err, AppError::ValidationError(ref m) if m == "Webhook URL 指向被禁止的 IP 地址：192.168.1.1"),
        "实际: {err:?}"
    );
}

#[test]
fn test_validate_url_metadata_service_blocked() {
    let result = validate_url("http://169.254.169.254/latest/meta-data/");
    assert!(result.is_err());
    assert!(
        matches!(result.unwrap_err(), AppError::ValidationError(ref m) if m == "Webhook URL 指向被禁止的 IP 地址：169.254.169.254"),
        "云元数据 IP 必须被 IP 黑名单拒绝（ssrf_guard.rs:65）"
    );
}

#[test]
fn test_validate_url_public_ip_allowed() {
    // 公网 IP 应当通过（但此测试需要网络，可能 flaky）
    // 仅测试不需要 DNS 解析的 IP 字面量
    let result = validate_url("http://8.8.8.8/webhook");
    assert!(result.is_ok(), "公网 IP 应允许：{:?}", result);
}
