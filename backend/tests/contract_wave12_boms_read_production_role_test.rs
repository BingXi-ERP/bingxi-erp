//! BOM/MRP 授权撤除的三通道一致静态锁（不连库、不启服务）
//!
//! 功能：BOM 与 MRP 整族功能下线后，钉死这两枚权限资源在三条通道上**都已缺席**、彼此同源——
//!       ① 新装库角色矩阵（走 `InitService::all_role_permission_definition_groups()` 这份权威
//!          定义，不抄副本）：不得再出现 boms 或 mrp 的任何 (角色×动作) 行；
//!       ② 存量库撤权迁移 `bom_mrp_permission_withdrawal/m0133_withdraw_bom_mrp_permissions.rs`：
//!          必须有一条按 `resource_type` 删除这两枚键授权行的语句（不按角色硬编码单行）；
//!       ③ 前端路由门 `router/index.ts`：不得再声明 `boms:read`。
//!       资源名另与 `PERMISSION_RESOURCES` 对拍（两枚键须已从注册表摘除）。任一处仍持有即判红。
//! 调用方：集成测试 crate 的可执行用例，CI 里由测试运行器调用。
//! 入参：无（三条通道都以 include_str! 读入真源文本，矩阵以生产函数取真值）。
//! 传给谁：把解析出的集合交给缺席/包含断言；资源名与 `PERMISSION_RESOURCES` 对拍。
//! 存什么：不落库、不产文件，只把"这两枚键已撤、三通道不得复现"固化为回归断言。
//! 存哪里：仅本测试源文件一份，随源码进版本库。
//!
//! 为什么反过来锁：BOM 与 MRP 下线后 `boms`/`mrp` 端点与其授权行都已成悬空对象，留着只会让
//! 「看着已授权」掩盖端点已不存在；本锁与被测口径同步翻转，让"撤权"这件事本身有测试保护
//! （源码/迁移先撤、测试跟着撤断言，不是放宽断言消红）。撤权的存量库通道是 m0133，历史授予
//! 迁移 m0092 按其不可篡改原则原样保留、不再作为"当前有效授权"判据。

use std::collections::BTreeSet;

use bingxi_backend::services::init_service::{InitService, PERMISSION_RESOURCES};

/// 被下线并撤权的两枚资源名（与运行期派生键同形）。
const RES_BOMS: &str = "boms";
const RES_MRP: &str = "mrp";

/// 摊平矩阵为 (角色码, 资源码, 动作码) 三元组（同一份定义表，不抄副本）。
fn matrix_rows() -> Vec<(&'static str, &'static str, &'static str)> {
    let mut rows = Vec::new();
    for definitions in InitService::all_role_permission_definition_groups() {
        for &(role_code, resources) in definitions {
            for &(resource, action) in resources {
                rows.push((role_code, resource, action));
            }
        }
    }
    rows
}

/// 通道② 真源（存量库撤权迁移）。
fn revocation_src() -> String {
    include_str!(
        "../migration/src/domain/bom_mrp_permission_withdrawal/m0133_withdraw_bom_mrp_permissions.rs"
    )
    .replace('\r', "")
}

/// 只保留执行体：逐行剔除整行注释与文档注释（注释里出现的资源名不是删除动作，计入即假判）。
fn code_only(src: &str) -> String {
    src.lines()
        .filter(|line| !line.trim_start().starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n")
}

/// 撤权迁移是否含一条「按 resource_type 删除 role_permissions 里某枚资源全部授权行」的语句。
/// 判据三件事同时成立：目标表是 role_permissions、是 DELETE、且以资源名（非角色）匹配该键。
fn revocation_deletes_resource(code: &str, resource: &str) -> bool {
    code.contains("DELETE FROM \"role_permissions\"")
        && code.contains("resource_type")
        && code.contains(&format!("'{resource}'"))
}

/// 资源名是否仍在注册表里（撤权后两枚都应缺席）。
fn resource_registered(resource: &str) -> bool {
    PERMISSION_RESOURCES.contains(&resource)
}

/// 通道①：矩阵里不得再出现 boms 或 mrp 的任何 (角色×动作) 行。
#[test]
fn matrix_has_no_boms_or_mrp_grant_rows() {
    let rows = matrix_rows();
    let offenders: BTreeSet<(String, String, String)> = rows
        .iter()
        .filter(|(_, res, _)| *res == RES_BOMS || *res == RES_MRP)
        .map(|(r, res, act)| (r.to_string(), res.to_string(), act.to_string()))
        .collect();
    assert!(
        offenders.is_empty(),
        "BOM/MRP 已下线，授权矩阵不得再出现 boms/mrp 任何行，实际残留：{offenders:?}"
    );
}

/// 资源名必须已从注册表摘除（否则运行期仍把这枚键当合法资源校验，等于假在册）。
#[test]
fn boms_and_mrp_removed_from_permission_resources_registry() {
    assert!(
        !resource_registered(RES_BOMS),
        "{RES_BOMS} 必须已从 init_service::PERMISSION_RESOURCES 摘除，否则资源名仍在册"
    );
    assert!(
        !resource_registered(RES_MRP),
        "{RES_MRP} 必须已从 init_service::PERMISSION_RESOURCES 摘除（mrp-history 是另一枚独立键、不在本次下线范围，故只断言裸 mrp 缺席）"
    );
}

/// 通道②：存量库撤权迁移必须按资源名删除这两枚键的历史授权行（覆盖所有岗位，不按角色硬编码单行）。
#[test]
fn revocation_migration_deletes_boms_and_mrp_by_resource_type() {
    let code = code_only(&revocation_src());
    assert!(
        revocation_deletes_resource(&code, RES_BOMS),
        "撤权迁移必须含按 resource_type 删除 {RES_BOMS} 授权行的语句，否则存量库升级后仍持该键"
    );
    assert!(
        revocation_deletes_resource(&code, RES_MRP),
        "撤权迁移必须含按 resource_type 删除 {RES_MRP} 授权行的语句，否则存量库升级后仍持该键"
    );
}

/// 通道③：前端路由门不得再声明 boms:read（键已撤，前端留着只会指向不存在的端点）。
#[test]
fn frontend_route_gate_no_longer_declares_boms_read() {
    let router = include_str!("../../frontend/src/router/index.ts").replace('\r', "");
    assert!(
        !router.contains("boms:read"),
        "router/index.ts 不得再按 boms:read 门控任何路由——BOM 页与 boms 资源均已下线"
    );
}

/// 反空操作自证：证明上面几条缺席/包含判据有判别力，而不是恒真。
#[test]
fn lock_detects_revocation_drift_instead_of_passing_silently() {
    // 一、矩阵解析非空：若定义表解析塌成空集，缺席断言会因"两边都空"而假绿。
    let rows = matrix_rows();
    assert!(
        rows.len() > 100,
        "矩阵三元组总数异常偏低（实得 {}），定义表解析面失效，本锁无从判定缺席",
        rows.len()
    );
    // 二、撤权删除判据有牙：真实迁移对两枚键都判真；把资源名替换掉后必须翻假
    //    （证明"漏撤某枚键"会被抓到，不是恒真）。
    let code = code_only(&revocation_src());
    assert!(
        revocation_deletes_resource(&code, RES_BOMS) && revocation_deletes_resource(&code, RES_MRP),
        "真实撤权迁移必须先被判据认出覆盖两枚键（否则下面的反向自证无从谈起）"
    );
    let doctored = code.replace("'mrp'", "'other-resource'");
    assert!(
        !revocation_deletes_resource(&doctored, RES_MRP),
        "撤权迁移若漏删 mrp（替换成别的资源名）必须被本判据翻假——漏撤却不被抓到即恒真假绿"
    );
}
