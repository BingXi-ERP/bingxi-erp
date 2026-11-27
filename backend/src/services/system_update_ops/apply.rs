//! 更新应用主流程子模块（system_update_ops/apply）
//!
//! 从原 `system_update_service.rs` 迁移并扩展更新应用流程：
//! - `apply_local_update`：应用本地发布包，版本以发布记录为准（pub，handler 调用）
//! - `apply_update`：应用本地 ZIP 更新包（pub，handler 调用）
//! - `apply_update_expected`：应用指定版本 ZIP 或 CI 正式 tar.gz（`pub(crate)`，github 子模块调用）
//! - `do_update`：更新 5 步主流程（备份→解压→校验→应用→验证，私有）
//! - `extract_update_package`：按扩展名解压 ZIP 或 tar.gz 到 temp_update（私有）
//! - `validate_update_package`：校验 backend 二进制、frontend 与版本来源（私有）
//! - `apply_files`：应用 backend/frontend/config，并写入真实目标 VERSION（私有）
//! - `verify_update`：核对 backend 字节哈希、Unix 执行权限与 VERSION（私有）
//! - `log_update`：追加写入 update.log（`pub(crate)`，供 backup/github 子模块调用）
//!
//! 跨模块依赖：
//! - `do_update` 调用 `status::get_current_version`（pub）、`backup::create_backup` /
//!  `rollback` / `cleanup_old_backups`（`pub(crate)`）
//! - `apply_files` 调用 `backup::copy_dir`（`pub(crate)`）
//! - `extract_update_package` 调用 facade 纯函数 `extract_zip_entry`（`pub(crate)`）
//! - `log_update` 被 `backup::rollback` / `github::download_update` /
//!  `github::download_and_update` 跨模块调用

#[cfg(unix)]
use crate::services::system_update_service::set_safe_permissions;
use crate::services::system_update_service::{
    LocalRelease, MAX_SINGLE_UPDATE_FILE_SIZE, SystemUpdateService, UpdateError, extract_zip_entry,
    sha256_hex_of_file,
};
use chrono::Utc;
use std::fs;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

const MAX_SINGLE_EXTRACT_SIZE: u64 = MAX_SINGLE_UPDATE_FILE_SIZE;
const MAX_TOTAL_EXTRACT_SIZE: u64 = 500 * 1024 * 1024;

impl SystemUpdateService {
    pub async fn apply_local_update(&self, release: &LocalRelease) -> Result<String, UpdateError> {
        self.apply_update_expected(&release.file_path, Some(&release.version))
            .await
    }

    pub async fn apply_update(&self, update_file: &Path) -> Result<String, UpdateError> {
        self.apply_update_expected(update_file, None).await
    }

    /// 应用更新包；传入目标版本时，包内有 VERSION 必须逐字一致；官方 tar.gz 无内嵌
    /// VERSION 时使用已校验的 Release tag 版本。任何版本或结构校验都在改写运行文件前完成。
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
        let extract_root = self.extract_update_package(update_file)?;
        let package_dir = Self::resolve_package_root(&extract_root);
        self.log_update(&format!("更新包已解压到: {:?}", package_dir));

        self.log_update("步骤3: 验证更新包");
        self.validate_update_package(&package_dir, expected_version)?;
        let new_version = Self::resolve_package_version(&package_dir, expected_version)?;
        self.log_update(&format!("更新包验证通过，目标版本: {}", new_version));

        self.log_update("步骤4: 应用更新");
        if let Err(e) = self.apply_files(&package_dir, &new_version) {
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
        if let Err(e) = self.verify_update(&package_dir, &new_version) {
            self.log_update(&format!("更新验证失败: {}，正在回滚", e));
            if let Err(rollback_err) = self.rollback(&backup_path) {
                tracing::error!(
                    verify_error = %e,
                    rollback_error = %rollback_err,
                    "更新验证失败且回滚失败，需人工检查"
                );
                return Err(UpdateError::BackupError(format!(
                    "更新验证失败: {e}；回滚也失败: {rollback_err}，需人工检查"
                )));
            }
            return Err(UpdateError::ValidationError(format!(
                "更新验证失败并已回滚: {e}"
            )));
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

        let file_name = update_file
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| UpdateError::ValidationError("更新包文件名无效".to_string()))?;
        if file_name.ends_with(".zip") {
            self.extract_zip_package(update_file, &extract_dir)?;
        } else if file_name.ends_with(".tar.gz") {
            self.extract_tar_gz_package(update_file, &extract_dir)?;
        } else {
            return Err(UpdateError::ValidationError(
                "更新包仅支持 .zip 或 .tar.gz".to_string(),
            ));
        }

        Ok(extract_dir)
    }

    fn extract_zip_package(
        &self,
        update_file: &Path,
        extract_dir: &Path,
    ) -> Result<(), UpdateError> {
        let file = fs::File::open(update_file)?;
        let mut archive =
            zip::ZipArchive::new(file).map_err(|e| UpdateError::UnzipError(e.to_string()))?;
        let mut total_extracted = 0_u64;

        for i in 0..archive.len() {
            let mut zip_entry = archive
                .by_index(i)
                .map_err(|e| UpdateError::UnzipError(e.to_string()))?;
            let copied = extract_zip_entry(&mut zip_entry, extract_dir)?;
            total_extracted = Self::accumulate_extracted_size(total_extracted, copied)?;
        }

        Ok(())
    }

    fn extract_tar_gz_package(
        &self,
        update_file: &Path,
        extract_dir: &Path,
    ) -> Result<(), UpdateError> {
        let file = fs::File::open(update_file)?;
        let decoder = flate2::read::GzDecoder::new(file);
        let mut archive = tar::Archive::new(decoder);
        let mut total_extracted = 0_u64;

        for entry in archive
            .entries()
            .map_err(|e| UpdateError::UnzipError(format!("读取 tar.gz 条目失败: {e}")))?
        {
            let mut entry =
                entry.map_err(|e| UpdateError::UnzipError(format!("读取 tar.gz 条目失败: {e}")))?;
            let copied = Self::extract_tar_entry(&mut entry, extract_dir)?;
            total_extracted = Self::accumulate_extracted_size(total_extracted, copied)?;
        }

        Ok(())
    }

    fn accumulate_extracted_size(total: u64, copied: u64) -> Result<u64, UpdateError> {
        let total = total
            .checked_add(copied)
            .ok_or_else(|| UpdateError::ValidationError("解压大小累计溢出".to_string()))?;
        if total > MAX_TOTAL_EXTRACT_SIZE {
            return Err(UpdateError::ValidationError(format!(
                "总解压大小超过限制 ({}MB)，疑似压缩炸弹",
                MAX_TOTAL_EXTRACT_SIZE / 1024 / 1024
            )));
        }
        Ok(total)
    }

    fn extract_tar_entry<R: Read>(
        entry: &mut tar::Entry<'_, R>,
        extract_dir: &Path,
    ) -> Result<u64, UpdateError> {
        let entry_path = entry
            .path()
            .map_err(|e| UpdateError::ValidationError(format!("tar 条目路径无效: {e}")))?;
        let relative_path = Self::safe_archive_relative_path(&entry_path)?;
        let outpath = extract_dir.join(relative_path);
        if !outpath.starts_with(extract_dir) {
            return Err(UpdateError::ValidationError(
                "检测到路径遍历攻击，更新包中包含不安全的路径".to_string(),
            ));
        }

        let entry_type = entry.header().entry_type();
        if entry_type.is_dir() {
            fs::create_dir_all(&outpath)?;
            #[cfg(unix)]
            set_safe_permissions(&outpath, entry.header().mode(), true);
            return Ok(0);
        }
        if !entry_type.is_file() {
            return Err(UpdateError::ValidationError(format!(
                "更新包包含不支持的 tar 条目类型（拒绝符号链接/硬链接）: {}",
                entry_path.display()
            )));
        }

        if let Some(parent) = outpath.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut outfile = fs::File::create(&outpath)?;
        let copied = std::io::copy(
            &mut (&mut *entry).take(MAX_SINGLE_EXTRACT_SIZE + 1),
            &mut outfile,
        )?;
        if copied > MAX_SINGLE_EXTRACT_SIZE {
            return Err(UpdateError::ValidationError(format!(
                "单文件解压大小超过限制 ({}MB)，疑似压缩炸弹",
                MAX_SINGLE_EXTRACT_SIZE / 1024 / 1024
            )));
        }
        #[cfg(unix)]
        set_safe_permissions(&outpath, entry.header().mode(), false);

        Ok(copied)
    }

    fn safe_archive_relative_path(path: &Path) -> Result<PathBuf, UpdateError> {
        if path.as_os_str().is_empty() || path.is_absolute() {
            return Err(UpdateError::ValidationError(format!(
                "更新包中包含无效的绝对路径: {}",
                path.display()
            )));
        }

        let mut relative = PathBuf::new();
        for component in path.components() {
            match component {
                Component::Normal(value) => relative.push(value),
                Component::CurDir => {}
                _ => {
                    return Err(UpdateError::ValidationError(format!(
                        "更新包中包含不安全的路径: {}",
                        path.display()
                    )));
                }
            }
        }
        if relative.as_os_str().is_empty() {
            return Err(UpdateError::ValidationError(
                "更新包条目路径为空".to_string(),
            ));
        }
        Ok(relative)
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

    fn resolve_package_root(extract_root: &Path) -> PathBuf {
        if extract_root.join("backend").exists() {
            return extract_root.to_path_buf();
        }
        let nested_root = extract_root.join("bingxi-erp");
        if nested_root.join("backend").exists() {
            nested_root
        } else {
            extract_root.to_path_buf()
        }
    }

    fn validate_update_package(
        &self,
        package_dir: &Path,
        expected_version: Option<&str>,
    ) -> Result<(), UpdateError> {
        let backend_exe = package_dir.join(Self::backend_executable_relative_path());
        if !backend_exe.is_file() {
            return Err(UpdateError::ValidationError(format!(
                "更新包缺少 {} 可执行文件",
                Self::backend_executable_relative_path().display()
            )));
        }
        if !package_dir.join("frontend").is_dir() {
            return Err(UpdateError::ValidationError(
                "更新包缺少 frontend 目录".to_string(),
            ));
        }
        if expected_version.is_none() && !package_dir.join("VERSION").is_file() {
            return Err(UpdateError::ValidationError(
                "更新包缺少 VERSION 文件，且调用方未提供已校验的目标版本".to_string(),
            ));
        }

        Ok(())
    }

    fn resolve_package_version(
        package_dir: &Path,
        expected_version: Option<&str>,
    ) -> Result<String, UpdateError> {
        let version_file = package_dir.join("VERSION");
        let new_version = if version_file.is_file() {
            let version = fs::read_to_string(&version_file)
                .map_err(|e| UpdateError::VersionError(e.to_string()))?
                .trim()
                .to_string();
            if version.is_empty() {
                return Err(UpdateError::VersionError(
                    "更新包 VERSION 文件内容为空".to_string(),
                ));
            }
            version
        } else {
            expected_version
                .filter(|version| !version.trim().is_empty())
                .map(str::to_string)
                .ok_or_else(|| UpdateError::VersionError("更新包缺少 VERSION 文件".to_string()))?
        };

        if let Some(expected) = expected_version
            && expected != new_version
        {
            return Err(UpdateError::VersionError(format!(
                "更新包版本 {new_version} 与请求版本 {expected} 不一致，已拒绝应用"
            )));
        }

        Ok(new_version)
    }

    fn apply_files(&self, package_dir: &Path, target_version: &str) -> Result<(), UpdateError> {
        let dirs_to_update = ["backend", "frontend", "config"];

        for dir in dirs_to_update {
            let src = package_dir.join(dir);
            let dst = self.app_dir.join(dir);

            if src.exists() {
                if dst.exists() {
                    let old_dst = self.app_dir.join(format!("{}.old", dir));
                    if old_dst.exists() {
                        if let Err(e) = fs::remove_dir_all(&old_dst) {
                            tracing::warn!("清理旧 .old 目录失败 {:?}: {}", old_dst, e);
                        }
                    }
                    if let Err(e) = fs::rename(&dst, &old_dst) {
                        fs::remove_dir_all(&dst).map_err(|_| e)?;
                    }
                }
                self.copy_dir(&src, &dst)?;
            }
        }

        #[cfg(unix)]
        {
            let backend_exe = self.app_dir.join(Self::backend_executable_relative_path());
            set_safe_permissions(&backend_exe, 0o700, false);
        }

        let version_src = package_dir.join("VERSION");
        let version_dst = self.app_dir.join("VERSION");
        if version_src.exists() {
            fs::copy(&version_src, &version_dst)?;
        } else {
            fs::write(&version_dst, format!("{target_version}\n"))?;
        }

        Ok(())
    }

    fn verify_update(&self, package_dir: &Path, expected_version: &str) -> Result<(), UpdateError> {
        let relative_backend = Self::backend_executable_relative_path();
        let source_backend = package_dir.join(&relative_backend);
        let target_backend = self.app_dir.join(&relative_backend);
        if !target_backend.is_file() {
            return Err(UpdateError::ValidationError(format!(
                "应用后缺少 {}",
                relative_backend.display()
            )));
        }

        let source_hash = sha256_hex_of_file(&source_backend)?;
        let target_hash = sha256_hex_of_file(&target_backend)?;
        if source_hash != target_hash {
            return Err(UpdateError::ValidationError(
                "应用后的 backend 可执行文件与更新包不一致".to_string(),
            ));
        }

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(&target_backend)?.permissions().mode();
            if mode & 0o100 == 0 {
                return Err(UpdateError::ValidationError(
                    "应用后的 backend 可执行文件缺少所有者执行权限".to_string(),
                ));
            }
        }

        let version = fs::read_to_string(self.app_dir.join("VERSION"))
            .map_err(|e| UpdateError::VersionError(e.to_string()))?;
        if version.trim() != expected_version {
            return Err(UpdateError::VersionError(format!(
                "应用后的 VERSION {} 与目标版本 {expected_version} 不一致",
                version.trim()
            )));
        }

        Ok(())
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

    fn write_release_tar_gz(path: &Path, entries: &[(&str, &[u8])]) {
        let file = fs::File::create(path).expect("创建 tar.gz 测试发布包失败");
        let encoder = flate2::write::GzEncoder::new(file, flate2::Compression::default());
        let mut builder = tar::Builder::new(encoder);
        for &(name, content) in entries {
            let mut header = tar::Header::new_gnu();
            header.set_size(content.len() as u64);
            header.set_mode(
                if name.ends_with("/server") || name.ends_with("/server.exe") {
                    0o755
                } else {
                    0o644
                },
            );
            // 直接写 GNU 头 path 字段，保留构造恶意 `..` 条目的能力，用来验证解压端防穿越。
            let path_bytes = name.as_bytes();
            assert!(path_bytes.len() <= 100, "测试 tar 路径过长: {name}");
            header.as_mut_bytes()[..path_bytes.len()].copy_from_slice(path_bytes);
            header.as_mut_bytes()[path_bytes.len()] = 0;
            header.set_cksum();
            builder
                .append(&mut header, content)
                .unwrap_or_else(|e| panic!("写入 tar 条目 {name} 失败: {e}"));
        }
        builder
            .into_inner()
            .expect("完成 tar 写入失败")
            .finish()
            .expect("完成 gzip 写入失败");
    }

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
        fs::write(app_dir.join("VERSION"), b"1.0.0\n").expect("写入当前 VERSION 失败");
        let service = SystemUpdateService {
            app_dir: app_dir.clone(),
            backup_dir: app_dir.join("backups"),
            is_updating: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        };
        (service, app_dir)
    }

    #[test]
    fn single_file_limit_accommodates_real_release_binary() {
        assert!(
            MAX_SINGLE_EXTRACT_SIZE >= 128 * 1024 * 1024,
            "真实 Release 的 backend/server 约 131MB，单文件上限不得沿用 ZIP 的 100MB"
        );
    }

    #[tokio::test]
    async fn official_release_tar_gz_without_embedded_version_installs_expected_version() {
        let (service, app_dir) = temp_service("official_tar");
        let update_file = app_dir.join("release-2.0.0.tar.gz");
        write_release_tar_gz(
            &update_file,
            &[
                ("bingxi-erp/backend/server", b"new-backend".as_slice()),
                ("bingxi-erp/backend/server.exe", b"new-backend".as_slice()),
                ("bingxi-erp/frontend/index.html", b"new-frontend".as_slice()),
                ("bingxi-erp/deploy/deploy.sh", b"deploy".as_slice()),
            ],
        );

        let message = service
            .apply_update_expected(&update_file, Some("2.0.0"))
            .await
            .expect("CI 真实 release-<version>.tar.gz 结构必须可安装");
        assert!(
            message.contains("2.0.0"),
            "成功信息应包含真实目标版本: {message}"
        );
        assert_eq!(
            fs::read_to_string(app_dir.join("VERSION")).expect("读取应用后 VERSION 失败"),
            "2.0.0\n",
            "官方包无内嵌 VERSION 时，必须用已校验的 Release tag 版本落盘"
        );
        assert_eq!(
            fs::read(app_dir.join("backend/server")).expect("读取应用后 backend 失败"),
            b"new-backend"
        );
        assert_eq!(
            fs::read(app_dir.join("frontend/index.html")).expect("读取应用后 frontend 失败"),
            b"new-frontend"
        );

        fs::remove_dir_all(app_dir).expect("清理测试目录失败");
    }

    #[tokio::test]
    async fn release_tar_gz_path_traversal_is_rejected_before_files_are_applied() {
        let (service, app_dir) = temp_service("tar_traversal");
        let update_file = app_dir.join("release-2.0.0.tar.gz");
        write_release_tar_gz(
            &update_file,
            &[
                ("bingxi-erp/backend/server", b"new-backend".as_slice()),
                ("bingxi-erp/frontend/index.html", b"new-frontend".as_slice()),
                ("bingxi-erp/../../outside.txt", b"escape".as_slice()),
            ],
        );

        let err = service
            .apply_update_expected(&update_file, Some("2.0.0"))
            .await
            .expect_err("tar 路径穿越必须拒绝");
        assert!(
            matches!(err, UpdateError::ValidationError(_)),
            "路径穿越应返回 ValidationError，实得: {err:?}"
        );
        assert!(!app_dir.join("outside.txt").exists(), "不得写出解压目录");
        assert_eq!(
            fs::read_to_string(app_dir.join("VERSION")).expect("读取当前 VERSION 失败"),
            "1.0.0\n",
            "拒绝路径穿越时不得改写运行版本"
        );

        fs::remove_dir_all(app_dir).expect("清理测试目录失败");
    }

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
            ("frontend/index.html", b"frontend".as_slice()),
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
            ("frontend/index.html", b"frontend".as_slice()),
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
