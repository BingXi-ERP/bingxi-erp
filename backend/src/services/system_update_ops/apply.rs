//! 更新应用主流程子模块（system_update_ops/apply）
//!
//! 从原 `system_update_service.rs` 迁移 10 个方法：
//! - `apply_local_update`：应用本地发布包（pub，handler 调用，委托 `apply_update`）
//! - `apply_update`：更新主入口，加锁防重入（pub，handler + github 子模块 `download_and_update` 调用）
//! - `do_update`：更新 5 步主流程（备份→解压→校验→应用→验证，私有，仅 `apply_update` 调用）
//! - `extract_update_package`：解压 zip 到 temp_update 目录（私有）
//! - `prepare_extract_dir`：清理并创建解压目录（私有）
//! - `validate_update_package`：校验 VERSION + UPDATE_MANIFEST.json 存在（私有）
//! - `read_version_from_dir`：从目录读取 VERSION 文件（私有）
//! - `apply_files`：把解压目录的 backend/frontend/config/VERSION 应用到 app_dir（私有）
//! - `verify_update`：验证更新后 backend 可执行文件或 VERSION 存在（私有）
//! - `log_update`：追加写入 update.log（`pub(crate)`，供 backup/github 子模块调用）
//!
//! 跨模块依赖：
//! - `do_update` 调用 `status::get_current_version`（pub）、`backup::create_backup` /
//!  `rollback` / `cleanup_old_backups`（`pub(crate)`）
//! - `apply_files` 调用 `backup::copy_dir`（`pub(crate)`）
//! - `extract_update_package` 调用 facade 纯函数 `extract_zip_entry`（`pub(crate)`）
//! - `log_update` 被 `backup::rollback` / `github::download_update` /
//!  `github::download_and_update` 跨模块调用

use crate::services::system_update_service::{
    LocalRelease, SystemUpdateService, UpdateError, extract_zip_entry,
};
use chrono::Utc;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;

impl SystemUpdateService {
    pub async fn apply_local_update(&self, release: &LocalRelease) -> Result<String, UpdateError> {
        self.apply_update(&release.file_path).await
    }

    pub async fn apply_update(&self, update_file: &Path) -> Result<String, UpdateError> {
        self.apply_update_expected(update_file, None).await
    }

    /// 应用更新包；传入目标版本时，解压后必须先核对 VERSION，再触碰任何运行文件。
    pub(crate) async fn apply_update_expected(
        &self,
        update_file: &Path,
        expected_version: Option<&str>,
    ) -> Result<String, UpdateError> {
        if self
            .is_updating
            .swap(true, std::sync::atomic::Ordering::SeqCst)
        {
            return Err(UpdateError::AlreadyUpdating);
        }

        struct UpdateLockGuard(Arc<std::sync::atomic::AtomicBool>);

        impl Drop for UpdateLockGuard {
            fn drop(&mut self) {
                self.0.store(false, std::sync::atomic::Ordering::SeqCst);
            }
        }

        let _lock_guard = UpdateLockGuard(Arc::clone(&self.is_updating));
        self.do_update(update_file, expected_version).await
    }

    async fn do_update(
        &self,
        update_file: &Path,
        expected_version: Option<&str>,
    ) -> Result<String, UpdateError> {
        let current_version = self.get_current_version();
        self.log_update(&format!("开始更新，当前版本: {}", current_version));

        self.log_update("步骤1: 创建备份");
        let backup_path = self.create_backup(&current_version)?;
        self.log_update(&format!("备份已创建: {:?}", backup_path));

        self.log_update("步骤2: 解压更新包");
        let extract_dir = self.extract_update_package(update_file)?;
        self.log_update(&format!("更新包已解压到: {:?}", extract_dir));

        self.log_update("步骤3: 验证更新包");
        self.validate_update_package(&extract_dir)?;
        self.log_update("更新包验证通过");

        let new_version = self.read_version_from_dir(&extract_dir)?;
        if let Some(expected) = expected_version
            && expected != new_version
        {
            return Err(UpdateError::VersionError(format!(
                "更新包版本 {new_version} 与请求版本 {expected} 不一致，已拒绝应用"
            )));
        }

        self.log_update("步骤4: 应用更新");
        if let Err(e) = self.apply_files(&extract_dir) {
            self.log_update(&format!("应用更新文件失败: {}，正在回滚", e));
            if let Err(rollback_err) = self.rollback(&backup_path) {
                tracing::error!(
                    apply_error = %e,
                    rollback_error = %rollback_err,
                    "应用更新失败且回滚失败，需人工检查"
                );
                return Err(UpdateError::BackupError(format!(
                    "应用文件失败: {e}；回滚也失败: {rollback_err}，需人工检查"
                )));
            }
            return Err(UpdateError::ValidationError(format!(
                "应用文件失败并已回滚: {}",
                e
            )));
        }
        self.log_update("文件已更新");

        self.log_update("步骤5: 验证更新结果");
        if !self.verify_update(&new_version) {
            self.log_update("更新验证失败，正在回滚");
            if let Err(rollback_err) = self.rollback(&backup_path) {
                tracing::error!(
                    rollback_error = %rollback_err,
                    "更新验证失败且回滚失败，需人工检查"
                );
                return Err(UpdateError::BackupError(format!(
                    "更新验证失败: 目标版本 {new_version} 的 backend/server 或 VERSION 不匹配；回滚也失败: {rollback_err}，需人工检查"
                )));
            }
            return Err(UpdateError::ValidationError(
                "更新验证失败，已回滚".to_string(),
            ));
        }

        self.log_update(&format!("更新成功，新版本: {}", new_version));

        // batch-17 P3: 记录版本更新日志
        self.log_update(&format!(
            "版本更新记录: {} -> {}",
            current_version, new_version
        ));

        // batch-21 P3: 升级通知机制 - 记录升级事件
        tracing::info!(
            event = "SYSTEM_UPGRADE",
            from_version = %current_version,
            to_version = %new_version,
            "系统升级完成通知"
        );

        self.cleanup_old_backups();

        Ok(format!("系统已成功更新到版本 {}", new_version))
    }

    fn extract_update_package(&self, update_file: &Path) -> Result<PathBuf, UpdateError> {
        let extract_dir = self.app_dir.join("temp_update");

        self.prepare_extract_dir(&extract_dir)?;

        let file = fs::File::open(update_file)?;
        let mut archive =
            zip::ZipArchive::new(file).map_err(|e| UpdateError::UnzipError(e.to_string()))?;

        // P1-03-6 修复：累计总解压大小，超过 500MB 视为 zip bomb 拒绝
        const MAX_TOTAL_EXTRACT_SIZE: u64 = 500 * 1024 * 1024;
        let mut total_extracted: u64 = 0;

        for i in 0..archive.len() {
            let mut zip_entry = archive
                .by_index(i)
                .map_err(|e| UpdateError::UnzipError(e.to_string()))?;
            let copied = extract_zip_entry(&mut zip_entry, &extract_dir)?;
            total_extracted = total_extracted
                .checked_add(copied)
                .ok_or_else(|| UpdateError::ValidationError("解压大小累计溢出".to_string()))?;
            if total_extracted > MAX_TOTAL_EXTRACT_SIZE {
                return Err(UpdateError::ValidationError(format!(
                    "总解压大小超过限制 ({}MB)，疑似 zip bomb",
                    MAX_TOTAL_EXTRACT_SIZE / 1024 / 1024
                )));
            }
        }

        Ok(extract_dir)
    }

    /// 准备解压目录（清理旧目录 + 创建新目录）（批次 323 v9 复审低危修复：从 extract_update_package 拆分，保持单一职责。）
    fn prepare_extract_dir(&self, extract_dir: &Path) -> Result<(), UpdateError> {
        if extract_dir.exists() {
            fs::remove_dir_all(extract_dir)?;
        }
        fs::create_dir_all(extract_dir)?;
        Ok(())
    }

    fn backend_executable_relative_path() -> PathBuf {
        if cfg!(windows) {
            Path::new("backend").join("server.exe")
        } else {
            Path::new("backend").join("server")
        }
    }

    fn validate_update_package(&self, extract_dir: &Path) -> Result<(), UpdateError> {
        let version_file = extract_dir.join("VERSION");
        if !version_file.exists() {
            return Err(UpdateError::ValidationError(
                "更新包缺少 VERSION 文件".to_string(),
            ));
        }

        let manifest_file = extract_dir.join("UPDATE_MANIFEST.json");
        if !manifest_file.is_file() {
            return Err(UpdateError::ValidationError(
                "更新包缺少 UPDATE_MANIFEST.json 文件".to_string(),
            ));
        }

        let backend_exe = extract_dir.join(Self::backend_executable_relative_path());
        if !backend_exe.is_file() {
            return Err(UpdateError::ValidationError(format!(
                "更新包缺少 {} 可执行文件",
                Self::backend_executable_relative_path().display()
            )));
        }

        Ok(())
    }

    fn read_version_from_dir(&self, dir: &Path) -> Result<String, UpdateError> {
        let version_file = dir.join("VERSION");
        fs::read_to_string(&version_file)
            .map(|v| v.trim().to_string())
            .map_err(|e| UpdateError::VersionError(e.to_string()))
    }

    fn apply_files(&self, extract_dir: &Path) -> Result<(), UpdateError> {
        let dirs_to_update = ["backend", "frontend", "config"];

        for dir in dirs_to_update {
            let src = extract_dir.join(dir);
            let dst = self.app_dir.join(dir);

            if src.exists() {
                if dst.exists() {
                    // Windows 下尝试重命名运行中的文件，而不是直接删除
                    let old_dst = self.app_dir.join(format!("{}.old", dir));
                    if old_dst.exists() {
                        // 批次 98 P2-C 修复（v5 复审）：吞错改日志记录，清理旧 .old 目录失败不阻塞更新
                        if let Err(e) = fs::remove_dir_all(&old_dst) {
                            tracing::warn!("清理旧 .old 目录失败 {:?}: {}", old_dst, e);
                        }
                    }
                    if let Err(e) = fs::rename(&dst, &old_dst) {
                        // 如果重命名失败，退退回直接删除（对非运行中的文件有效）
                        fs::remove_dir_all(&dst).map_err(|_| e)?;
                    }
                }
                self.copy_dir(&src, &dst)?;
            }
        }

        let version_src = extract_dir.join("VERSION");
        let version_dst = self.app_dir.join("VERSION");
        if version_src.exists() {
            fs::copy(&version_src, &version_dst)?;
        }

        Ok(())
    }

    fn verify_update(&self, expected_version: &str) -> bool {
        let backend_exe = self.app_dir.join(Self::backend_executable_relative_path());
        if !backend_exe.is_file() {
            return false;
        }

        match fs::read_to_string(self.app_dir.join("VERSION")) {
            Ok(version) => version.trim() == expected_version,
            Err(_) => false,
        }
    }

    pub(crate) fn log_update(&self, message: &str) {
        let log_file = self.app_dir.join("update.log");
        let timestamp = Utc::now().format("%Y-%m-%d %H:%M:%S");
        let log_entry = format!("[{}] {}\n", timestamp, message);

        if let Ok(mut file) = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_file)
        {
            // 批次 98 P2-C 修复（v5 复审）：吞错改日志记录，日志写入失败不应阻塞业务
            if let Err(e) = file.write_all(log_entry.as_bytes()) {
                tracing::warn!("写入更新日志失败 {:?}: {}", log_file, e);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[tokio::test]
    async fn expected_version_mismatch_is_rejected_before_files_are_applied() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("系统时间应可读取")
            .as_nanos();
        let app_dir = std::env::temp_dir().join(format!(
            "bingxi_system_update_expected_version_{}_{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&app_dir).expect("创建测试目录失败");
        fs::write(app_dir.join("VERSION"), b"1.0.0\n").expect("写入当前 VERSION 失败");
        let service = SystemUpdateService {
            app_dir: app_dir.clone(),
            backup_dir: app_dir.join("backups"),
            is_updating: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        };

        let update_file = app_dir.join("candidate.zip");
        let file = fs::File::create(&update_file).expect("创建测试更新包失败");
        let mut archive = zip::ZipWriter::new(file);
        for (name, content) in [
            ("VERSION", b"2.0.0\n".as_slice()),
            ("UPDATE_MANIFEST.json", b"{}".as_slice()),
            ("backend/server", b"backend".as_slice()),
            ("backend/server.exe", b"backend".as_slice()),
        ] {
            archive
                .start_file(name, zip::write::SimpleFileOptions::default())
                .expect("写入更新包条目失败");
            archive.write_all(content).expect("写入更新包内容失败");
        }
        archive.finish().expect("完成测试更新包失败");

        let err = service
            .apply_update_expected(&update_file, Some("3.0.0"))
            .await
            .expect_err("目标版本不一致必须在应用前拒绝");
        assert!(
            matches!(err, UpdateError::VersionError(_)),
            "版本不一致应返回 VersionError，实得: {err:?}"
        );
        assert_eq!(
            fs::read(app_dir.join("VERSION")).expect("读取当前 VERSION 失败"),
            b"1.0.0\n",
            "拒绝目标版本不一致时不得改写当前版本"
        );

        fs::remove_dir_all(app_dir).expect("清理测试目录失败");
    }

    #[tokio::test]
    async fn package_without_backend_binary_is_rejected_before_files_are_applied() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("系统时间应可读取")
            .as_nanos();
        let app_dir = std::env::temp_dir().join(format!(
            "bingxi_system_update_missing_backend_{}_{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&app_dir).expect("创建测试目录失败");
        fs::write(app_dir.join("VERSION"), b"1.0.0\n").expect("写入当前 VERSION 失败");
        let service = SystemUpdateService {
            app_dir: app_dir.clone(),
            backup_dir: app_dir.join("backups"),
            is_updating: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        };

        let update_file = app_dir.join("candidate.zip");
        let file = fs::File::create(&update_file).expect("创建测试更新包失败");
        let mut archive = zip::ZipWriter::new(file);
        for (name, content) in [
            ("VERSION", b"2.0.0\n".as_slice()),
            ("UPDATE_MANIFEST.json", b"{}".as_slice()),
        ] {
            archive
                .start_file(name, zip::write::SimpleFileOptions::default())
                .expect("写入更新包条目失败");
            archive.write_all(content).expect("写入更新包内容失败");
        }
        archive.finish().expect("完成测试更新包失败");

        let err = service
            .apply_update_expected(&update_file, Some("2.0.0"))
            .await
            .expect_err("缺少后端二进制的更新包必须拒绝");
        let expected_backend = SystemUpdateService::backend_executable_relative_path();
        assert!(
            matches!(err, UpdateError::ValidationError(ref message) if message.contains(&expected_backend.display().to_string())),
            "应明确缺少后端二进制，实得: {err:?}"
        );
        assert_eq!(
            fs::read(app_dir.join("VERSION")).expect("读取当前 VERSION 失败"),
            b"1.0.0\n",
            "拒绝缺少二进制的更新包时不得改写当前版本"
        );

        fs::remove_dir_all(app_dir).expect("清理测试目录失败");
    }
}
