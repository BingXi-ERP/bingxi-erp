use bingxi_backend::observability::config::*;
use config::{Config, File, FileFormat};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Deserialize)]
struct BackendConfig {
    server: BackendServerConfig,
}

#[derive(Debug, Deserialize)]
struct BackendServerConfig {
    port: String,
}

#[derive(Debug, Deserialize)]
struct PrometheusConfig {
    scrape_configs: Vec<ScrapeConfig>,
}

#[derive(Debug, Deserialize)]
struct ScrapeConfig {
    job_name: String,
    static_configs: Vec<StaticConfig>,
    metrics_path: Option<String>,
}

#[derive(Debug, Deserialize)]
struct StaticConfig {
    targets: Vec<String>,
}

fn repo_root() -> &'static Path {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("backend crate must have a repository parent")
}

#[test]
fn backend_default_and_env_example_use_deployment_port_8082() {
    let backend_path = repo_root().join("backend/config.yaml.example");
    let backend: BackendConfig = Config::builder()
        .add_source(File::from(backend_path.as_path()).format(FileFormat::Yaml))
        .build()
        .expect("backend config example must parse")
        .try_deserialize()
        .expect("backend config example must deserialize");
    assert_eq!(backend.server.port, "8082");

    let env_path = repo_root().join(".env.example");
    let env: HashMap<String, String> = dotenvy::from_path_iter(&env_path)
        .expect("root env example must parse")
        .map(|entry| entry.expect("env example entry must parse"))
        .collect();
    assert_eq!(
        env.get("SERVER__PORT").map(String::as_str),
        Some("8082"),
        "SERVER__PORT overrides YAML and must match the deployment port"
    );
}

#[test]
fn prometheus_scrapes_backend_on_configured_port_8082() {
    let backend_path = repo_root().join("backend/config.yaml.example");
    let backend: BackendConfig = Config::builder()
        .add_source(File::from(backend_path.as_path()).format(FileFormat::Yaml))
        .build()
        .expect("backend config example must parse")
        .try_deserialize()
        .expect("backend config example must deserialize");

    let prometheus_path = repo_root().join("monitoring/prometheus/prometheus.yml");
    let prometheus: PrometheusConfig = Config::builder()
        .add_source(File::from(prometheus_path.as_path()).format(FileFormat::Yaml))
        .build()
        .expect("Prometheus config must parse")
        .try_deserialize()
        .expect("Prometheus config must deserialize");
    let backend_job = prometheus
        .scrape_configs
        .iter()
        .find(|job| job.job_name == "bingxi-backend")
        .expect("bingxi-backend scrape job must exist");

    assert_eq!(backend_job.metrics_path.as_deref(), Some("/metrics"));
    assert_eq!(backend_job.static_configs.len(), 1);
    assert_eq!(
        backend_job.static_configs[0].targets,
        vec![format!("localhost:{}", backend.server.port)]
    );
}

#[test]
fn test_default_config() {
    let cfg = ObservabilityConfig::default();
    assert_eq!(cfg.service_name, "bingxi-backend");
    assert!(cfg.trace_enabled);
    assert!(cfg.metrics_enabled);
    assert_eq!(cfg.sample_ratio, 1.0);
    // from_env 生产环境默认 10% 采样率
    let env_cfg = ObservabilityConfig::from_env();
    assert!(env_cfg.sample_ratio <= 1.0);
}

#[test]
fn test_from_env() {
    let cfg = ObservabilityConfig::from_env();
    // 至少 service_name 应有默认值
    assert!(!cfg.service_name.is_empty());
}

#[test]
fn test_resource_attrs() {
    let cfg = ObservabilityConfig::default();
    let attrs = ResourceAttrs::from_config(&cfg);
    assert_eq!(attrs.service_namespace, "erp");
    assert_eq!(attrs.service_name, "bingxi-backend");
}
