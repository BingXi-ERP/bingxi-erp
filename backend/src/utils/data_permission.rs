//! 数据权限过滤工具
//!
//! 提供数据库层面的字段过滤和行级过滤功能

/// 数据权限过滤器
pub struct DataPermissionFilter {
    /// 允许查询的字段列表
    pub allowed_fields: Vec<String>,
    /// 需要隐藏的字段列表
    pub hidden_fields: Vec<String>,
}

impl DataPermissionFilter {
    /// 创建新的过滤器
    pub fn new(allowed: Vec<String>, hidden: Vec<String>) -> Self {
        Self {
            allowed_fields: allowed,
            hidden_fields: hidden,
        }
    }

    /// 获取允许查询的字段列表（有 allowed_fields 返回 allowed_fields，有 hidden_fields 返回全字段减去 hidden_fields）
    pub fn get_select_fields(&self, all_fields: &[&str]) -> Vec<String> {
        if !self.allowed_fields.is_empty() {
            return self.allowed_fields.clone();
        }

        if !self.hidden_fields.is_empty() {
            return all_fields
                .iter()
                .filter(|f| !self.hidden_fields.contains(&f.to_string()))
                .map(|f| f.to_string())
                .collect();
        }

        all_fields.iter().map(|f| f.to_string()).collect()
    }
}

/// 客户实体所有字段列表
pub const CUSTOMER_ALL_FIELDS: &[&str] = &[
    "id",
    "customer_code",
    "customer_name",
    "contact_person",
    "contact_phone",
    "contact_email",
    "address",
    "city",
    "province",
    "country",
    "postal_code",
    "credit_limit",
    "payment_terms",
    "tax_id",
    "bank_name",
    "bank_account",
    "status",
    "owner_id",
    "customer_type",
    "notes",
    "created_by",
    "created_at",
    "updated_at",
    "customer_industry",
    "main_products",
    "annual_purchase",
    "quality_requirement",
    "inspection_standard",
];

/// 默认隐藏的敏感字段（非管理员角色）
///
/// 只放**资金类**字段：这些字段没有掩码层兜底，无权限配置行时必须整列缺失才是 fail-closed。
/// `contact_phone`/`contact_email`/`address` 不在此列——客户域 PII 的默认脱敏契约是
/// 「掩码保留键」（`services/crm/cust.rs` `mask_customer_pii_defaults` + `utils/field_mask`
/// 掩码手机/邮箱并移除 address，见 contract_wave6_crm_customer_read_exits_mask_test），
/// 若在此整列隐藏，选择层先删键，掩码层永远够不到，非 admin 列表/详情恒拿不到掩码值，
/// 掩码保留键契约在这两条出口被架空（4.33 e2e 443 钉的就是这个洞）。
pub const DEFAULT_HIDDEN_FIELDS: &[&str] = &[
    "credit_limit",
    "payment_terms",
    "tax_id",
    "bank_name",
    "bank_account",
];
