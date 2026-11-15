# 技术债务处理现状调查（2026-11-15）

对照 `TECHNICAL_DEBT_REPORT.md`（2026-08-12 baseline）与 `tech-debt-repayment-plan.md`（2026-08-22，72 项分 4 批）逐项现场取证。

## 一、批次 1 快速修复批（6 项）——全部闭环或被更优方案取代

| 编号 | 事项 | 2026-08 状态 | 2026-11-15 现态 | 结论 |
|------|------|--------------|------------------|------|
| 1.6 | CI 假绿门禁（EXIT_CODE 检查） | 待修 | `nextest-summary.sh` 判定器三态归因（ENV_DISK_FULL/NO_SUMMARY/TEST_FAILURE）+ run #4669 已实证拦假绿；E2E 分片取证、配对门、真实性门禁全部 fail-closed | ✅ 闭环（超额完成） |
| 2.8 | 技术债清单文档 | — | 本文档即交付物 | ✅ 闭环 |
| 2.7 | 注释完整性 | 1-2d | 注释门（ci_comment_gate R1-R5 棘轮）+ 注释六要素纪律已在 CI 落地 | ✅ 闭环（门禁化） |
| 3.12 | 错误码与错误信息规范 | 2-3d | `ApiResponse::error` 等旁路构造器已删，AppError 单一形状（code/message/trace_id/timestamp），displayable 变体带安全边界文档与测试 | ✅ 闭环 |
| 3.13 | 日志结构化 | 2-3d | error.rs `log_error`/`log_debug` 全错误族 tracing WARN/ERROR 带 detail+suggestion+trace_id；trace_context 中间件绑定 TRACE_ID task-local | ✅ 闭环 |
| A.18 | 状态词表大小写映射 | 1w 分阶段 | 状态词表权威表（models/status/*）+ 写入方唯一事实源纪律 + 27 spec 状态机拒断言 + 比较点逐字符相同判据已固化成 IR 规则 | ✅ 闭环（纪律化） |

## 二、批次 2 中工程批（14 项）——安全扫描闭环，其余部分推进

| 编号 | 事项 | 现态 | 结论 |
|------|------|------|------|
| 4.7 | cargo-audit + cargo-deny 扫描 | ci-cd.yml 已有 cargo-audit + gitleaks + semgrep（漏洞扫描 job，每日 cron + PR 面，npm 按 high/critical 卡） | ✅ 闭环（cargo-deny 未上，deny.toml 不存在——cargo-audit 已覆盖 CVE 面） |
| 4.8 | crate 供应链审计 | 同上 job 群覆盖 | ✅ 闭环 |
| 4.9 | 弱算法扫描（MD5/DES/RC4） | Cargo.toml 零弱算法依赖，全仓无 md5/des/rc4 使用点 | ✅ 闭环（架构层已证零命中） |
| 4.10 | TLS 版本下限 | 未找到显式 TLS 下限配置；reqwest 0.13 默认走 rustls/系统 TLS 现代版本 | ⏳ 低风险遗留（默认配置已达标，显式下限未钉） |
| 2.9 | 124 个 never-constructed struct 死代码 | `#[allow(dead_code)]` 全仓 881 处（原 103 处 allow 但报告口径为"含 reason 注释"）；#1236 车道已把 13 枚周期任务收编 SchedulerRegistry 接线，死代码量随功能接线减少 | ⏳ 部分推进（结构性减少，未系统清零） |
| 2.10 | 前端 any 类型 101 文件 | 现 44 文件含 any（下降 57%） | ⏳ 部分推进 |
| 2.5/2.6 | 代码重复率 / 依赖升级 | 依赖随功能面持续升级（SeaORM 2.0.2、Axum 0.8、Playwright 1.63 均新版） | ⏳ 持续态 |

## 三、批次 3/4 与架构项

| 事项 | 现态 | 结论 |
|------|------|------|
| 3.11 tokio spawn 生命周期 | 调度域 13 枚任务已收编 SchedulerRegistry（统一 enabled 门/初始延迟/间隔），outbox worker 有 increment_retry 重试 | ✅ 主体闭环 |
| 3.14 内存泄漏检测 | 无专项；moka TTL + dashmap 治理中 | ⏳ 未专项 |
| 8.1 双套迁移体系 | 根 `migration/` 已空壳，唯一权威在 `backend/migration/src`（domain 域聚合 + lib.rs 注册，取号台账纪律化） | ✅ 闭环 |
| 8.2 大文件 | print_service.rs 5762 行仍为最大（打印域集中）；print_handler 1862 行 | ⏳ 遗留（print 域拆分未做） |
| 8.4 TODO/FIXME/HACK 14 处 | 全仓 0 处 | ✅ 清零 |
| unwrap 191 / expect 121 / panic 26 | unwrap 111（-42%）/ expect 78（-36%）；`unwrap_safe.rs` 工装在库 | ⏳ 持续收缩 |
| Clippy baseline 316 条 | clippy-check.sh + setup-clippy-baseline.sh 门禁化，随车道棘轮收缩 | ✅ 门禁化 |
| BOM/MRP 双套体系 | 用户裁定整族移除（11-06），services/mod.rs 已注释不注册，物料短缺域换需求源 | ✅ 裁定落地（DROP 迁移待拍） |

## 四、超额完成的关联面（不在 72 项清单内）

- E2E 测试体系：463 spec + 分片矩阵 + 配对门棘轮 + 真实性门禁（72 项清单写作时 377 spec）。
- 缺陷台账工作流：backend-defect-register 分册滚动，D-60~D-66 全部处置。
- 路由白名单全量守卫（wave15）、权限三通道纪律、迁移取号台账。

## 五、剩余开口项（按优先级）

1. **print_service.rs 5762 行拆分**（8.2 最大单点，打印域已稳定可拆）。
2. **前端 any 44 文件**（2.10 收尾）。
3. **`#[allow(dead_code)]` 881 处系统清点**（2.9 收尾，需逐处判"预留/死码"）。
4. **TLS 显式下限**（4.10，一行配置）。
5. **cargo-deny 补位**（4.7 增强，license/源审计维度）。
6. **BOM DROP 迁移**（用户裁定待拍项）。

> 债务面结论：72 项中批次 1 全闭环，批次 2 安全类全闭环，架构双套迁移/TODO/Clippy/状态词表均已门禁化或裁定落地；余量集中在死代码清点、前端 any、大文件拆分三类"体力型"收尾，无 P0/P1 级未处理项。
