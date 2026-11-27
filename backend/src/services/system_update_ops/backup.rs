//! 备份与回滚子模块（system_update_ops/backup）
//!
//! 从原 `system_update_service.rs` 迁移 5 个方法：
//! - `create_backup`：创建版本备份目录（`pub(crate)`，供 apply 子模块 `do_update` 调用）
//! - `copy_dir`：递归复制目录（`pub(crate)`，供 apply 子模块 `apply_files` 调用）
//! - `rollback`：从备份路径回滚 backend/frontend/config/VERSION（`pub(crate)`，供 apply 子模块 `do_update` 调用）
//! - `rollback_to_version`：按版本号查找备份并回滚（pub，handler 调用）
//! - `cleanup_old_backups`：保留最近 3 个备份，清理更旧版本（`pub(crate)`，仅在版本元数据成功提交后调用）
//!
//! 跨模块依赖：`rollback` / `rollback_to_version` 调用 `apply` 子模块的 `log_update`（`pub(crate)`）；
//! `rollback_to_version` / `cleanup_old_backups` 调用 `status` 子模块的 `list_backup_versions`（pub）。

use crate::services::system_update_service::{SystemUpdateService, UpdateError};
use chrono::Utc;
use std::fs;
use std::path::{Path, PathBuf};

impl SystemUpdateService {
    pub(crate) fn create_backup(&self, version: &str) -> Result<PathBuf, UpdateError> {
        if !self.backup_dir.exists() {
            fs::create_dir_all(&self.backup_dir)?;
        }

        let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
        let backup_version = self
            .applied_version()
            .unwrap_or_else(|| version.to_string());
        let backup_name = format!("v{}_{}", backup_version, timestamp);
        let backup_path = self.backup_dir.join(&backup_name);

        fs::create_dir_all(&backup_path)?;

        let dirs_to_backup = ["backend", "frontend", "config"];
        for dir in dirs_to_backup {
            let src = self.app_dir.join(dir);
            let dst = backup_path.join(dir);
            if src.exists() {
                self.copy_dir(&src, &dst)?;
            }
        }

        let version_file = self.app_dir.join("VERSION");
        if version_file.exists() {
            fs::copy(&version_file, backup_path.join("VERSION"))?;
        }

        Ok(backup_path)
    }

    /// 统计备份目录中真实文件的字节数，供备份记录展示实际大小。
    pub fn directory_size(path: &Path) -> std::io::Result<u64> {
        let metadata = fs::metadata(path)?;
        if !metadata.is_dir() {
            return Ok(metadata.len());
        }

        let mut total = 0_u64;
        for entry in fs::read_dir(path)? {
            let entry = entry?;
            let path = entry.path();
            let metadata = fs::metadata(&path)?;
            if metadata.is_dir() {
                total = total
                    .checked_add(Self::directory_size(&path)?)
                    .ok_or_else(|| {
                        std::io::Error::new(std::io::ErrorKind::InvalidData, "备份目录大小累计溢出")
                    })?;
            } else {
                total = total.checked_add(metadata.len()).ok_or_else(|| {
                    std::io::Error::new(std::io::ErrorKind::InvalidData, "备份目录大小累计溢出")
                })?;
            }
        }
        Ok(total)
    }

    pub(crate) fn copy_dir(&self, src: &Path, dst: &Path) -> std::io::Result<()> {
        fs::create_dir_all(dst)?;

        for entry in fs::read_dir(src)? {
            let entry = entry?;
            let ty = entry.file_type()?;
            let src_path = entry.path();
            let dst_path = dst.join(entry.file_name());

            if ty.is_dir() {
                self.copy_dir(&src_path, &dst_path)?;
            } else {
                fs::copy(&src_path, &dst_path)?;
            }
        }

        Ok(())
    }

    /// L9 修复（v8 复审）：降为 `pub(crate)`，仅内部 `do_update` 调用，不对外暴露
    ///
    /// 审计 limitation（26.9 部署后自动回滚监控）：
    /// - 本方法仅回滚文件系统（backend/frontend/config/VERSION），不回滚 DB migration。
    ///   若新版本包含破坏性 migration（如 DROP COLUMN / RENAME TABLE），回滚后旧版二进制
    ///   将面对不兼容的 DB schema，可能导致服务启动失败或数据访问异常。
    ///   后续需引入 migration 回滚机制（如 sea-orm-migration 的 down 步骤或
    ///   DB 备份/恢复流程），当前仅文件级回滚属于已知技术债务。
    /// - 本方法回滚后不执行健康检查（如 HTTP /health 探活或可执行文件冒烟测试），
    ///   调用方（apply::do_update）在回滚后直接返回错误，运维需人工确认服务可用性。
    ///   后续应在回滚完成后补充自动健康检查，失败时触发告警或二次回滚。
    pub fn rollback(&self, backup_path: &Path) -> Result<(), UpdateError> {
        self.log_update(&format!("正在回滚到备份: {:?}", backup_path));

        // 审计提醒（26.9）：仅回滚文件，不回滚 DB migration，存在 schema 不一致风险
        tracing::warn!(
            backup_path = ?backup_path,
            "文件级回滚开始：本次回滚不包含 DB migration 回滚，若新版本含破坏性 migration 需人工处理 DB schema"
        );

        let dirs_to_restore = ["backend", "frontend", "config"];
        for dir in dirs_to_restore {
            let src = backup_path.join(dir);
            let dst = self.app_dir.join(dir);

            if dst.exists() {
                fs::remove_dir_all(&dst)?;
            }

            if src.exists() {
                self.copy_dir(&src, &dst)?;
            }
        }

        let version_src = backup_path.join("VERSION");
        let version_dst = self.app_dir.join("VERSION");
        if version_src.exists() {
            fs::copy(&version_src, &version_dst)?;
        }

        self.log_update("回滚完成");

        // 审计提醒（26.9）：回滚后无健康检查，需后续补充自动探活
        tracing::warn!(
            "文件级回滚完成：当前未执行回滚后健康检查，运维需人工确认服务可用性（后续需补自动 /health 探活）"
        );

        Ok(())
    }

    pub fn rollback_to_version(&self, version: &str) -> Result<String, UpdateError> {
        let backup_versions = self.list_backup_versions();
        let backup_path = backup_versions
            .iter()
            .find(|v| v.starts_with(&format!("v{}_", version)))
            .map(|v| self.backup_dir.join(v))
            .ok_or_else(|| UpdateError::BackupError(format!("找不到版本 {} 的备份", version)))?;
        let backup_version = fs::read_to_string(backup_path.join("VERSION"))
            .map_err(|e| UpdateError::BackupError(format!("读取备份 VERSION 失败: {e}")))?
            .trim()
            .to_string();
        if backup_version != version {
            return Err(UpdateError::BackupError(format!(
                "备份目录版本与内部 VERSION 不一致：目录请求 {version}，备份实际 {backup_version}"
            )));
        }

        self.rollback(&backup_path)?;
        Ok(format!("已回滚到版本 {}", version))
    }

    pub(crate) fn cleanup_old_backups(&self) {
        let mut versions = self.list_backup_versions();
        if versions.len() > 3 {
            for old_version in versions.drain(3..) {
                let old_path = self.backup_dir.join(&old_version);
                if let Err(e) = fs::remove_dir_all(&old_path) {
                    tracing::warn!("清理旧备份失败: {}", e);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_service(test_name: &str) -> (SystemUpdateService, PathBuf) {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("系统时间应可读取")
            .as_nanos();
        let app_dir = std::env::temp_dir().join(format!(
            "bingxi_system_update_{test_name}_{}_{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&app_dir).expect("创建测试目录失败");
        let service = SystemUpdateService {
            app_dir: app_dir.clone(),
            backup_dir: app_dir.join("backups"),
            is_updating: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        };
        (service, app_dir)
    }

    #[test]
    fn create_backup_uses_disk_applied_version_for_backup_identity() {
        let (service, app_dir) = temp_service("backup_version");
        fs::write(app_dir.join("VERSION"), b"2.0.0\n").expect("写入磁盘 VERSION 失败");
        fs::create_dir_all(app_dir.join("backend")).expect("创建 backend 测试目录失败");
        fs::write(app_dir.join("backend/server"), b"new-backend").expect("写入 backend 失败");

        let backup_path = service.create_backup("1.0.0").expect("创建备份失败");
        let backup_name = backup_path
            .file_name()
            .and_then(|name| name.to_str())
            .expect("备份目录名应可读取");
        assert!(
            backup_name.starts_with("v2.0.0_"),
            "待重启窗口的备份名必须使用磁盘已应用版本，实得: {backup_name}"
        );
        assert_eq!(
            fs::read_to_string(backup_path.join("VERSION")).expect("读取备份 VERSION 失败"),
            "2.0.0\n"
        );

        fs::remove_dir_all(app_dir).expect("清理测试目录失败");
    }

    #[test]
    fn rollback_to_version_rejects_backup_with_mismatched_internal_version() {
        let (service, app_dir) = temp_service("rollback_version");
        fs::write(app_dir.join("VERSION"), b"1.0.0\n").expect("写入当前 VERSION 失败");
        let backup_path = app_dir.join("backups/v2.0.0_20261127_120000");
        fs::create_dir_all(&backup_path).expect("创建备份目录失败");
        fs::write(backup_path.join("VERSION"), b"3.0.0\n").expect("写入备份 VERSION 失败");

        let err = service
            .rollback_to_version("2.0.0")
            .expect_err("备份目录名与内部 VERSION 不一致时必须拒绝");
        assert!(
            matches!(err, UpdateError::BackupError(_)),
            "版本不匹配应返回 BackupError，实得: {err:?}"
        );
        assert_eq!(
            fs::read_to_string(app_dir.join("VERSION")).expect("读取当前 VERSION 失败"),
            "1.0.0\n",
            "拒绝错配备份时不得改写当前版本"
        );

        fs::remove_dir_all(app_dir).expect("清理测试目录失败");
    }

    #[test]
    fn create_backup_copies_real_files_and_reports_their_size() {
        let (service, app_dir) = temp_service("backup");
        fs::create_dir_all(app_dir.join("backend")).expect("创建 backend 测试目录失败");
        fs::create_dir_all(app_dir.join("frontend")).expect("创建 frontend 测试目录失败");
        fs::create_dir_all(app_dir.join("config")).expect("创建 config 测试目录失败");
        fs::write(app_dir.join("backend/main.rs"), b"backend").expect("写入 backend 测试文件失败");
        fs::write(app_dir.join("frontend/index.html"), b"frontend").expect("写入前端测试文件失败");
        fs::write(app_dir.join("config/app.toml"), b"config").expect("写入配置测试文件失败");
        fs::write(app_dir.join("VERSION"), b"1.2.3\n").expect("写入 VERSION 测试文件失败");

        let backup_path = service.create_backup("1.2.3").expect("真实文件备份应成功");
        assert_eq!(
            fs::read(backup_path.join("backend/main.rs")).unwrap(),
            b"backend"
        );
        assert_eq!(
            fs::read(backup_path.join("frontend/index.html")).unwrap(),
            b"frontend"
        );
        assert_eq!(
            fs::read(backup_path.join("config/app.toml")).unwrap(),
            b"config"
        );
        assert_eq!(fs::read(backup_path.join("VERSION")).unwrap(), b"1.2.3\n");
        assert_eq!(
            SystemUpdateService::directory_size(&backup_path).expect("统计备份大小应成功"),
            27,
            "备份大小应为四个真实文件字节数之和"
        );

        fs::remove_dir_all(app_dir).expect("清理测试目录失败");
    }
}
