//! double 到 Decimal 的换算单点。
//!
//! 存在的理由：`rust_decimal` 只提供 `Decimal::from_f64_retain`，它把 double 的二进制尾数
//! 原样搬进 Decimal（`12.8` 变成 `12.800000000000000710542735756`），而落库列与比较门用的
//! 是库侧刻度（金额 2 位、汇率 8 位）。尾数外溢会让"等额出库"被算成超量拒掉，也让存出来的
//! 小数位宽于列刻度。仓内所有由 f64 造 Decimal 的入口统一走本模块，不再各自决定要不要舍入。

use rust_decimal::Decimal;

/// 业务 DECIMAL 列的最宽小数位：汇率 `currencies.rate DECIMAL(20,8)` 是全仓最宽的一档，
/// 比它更宽的小数位不可能是业务事实，只会是二进制尾数。
const MAX_BUSINESS_SCALE: u32 = 8;

/// 把 double 折成 Decimal，并把二进制尾数按业务最宽刻度舍掉。
///
/// 调用方：各 handler 与 service 里由入参或复用点 f64 建 Decimal 的站点。
/// 入参：`value` 待换算的 double。
/// 出参：`None` 当且仅当 `value` 是 NaN 或无穷——与 `from_f64_retain` 同口径，
/// 调用方原有的"坏值不外传成 0"分支不受影响；`Some` 里的小数位不超过
/// [`MAX_BUSINESS_SCALE`]，且 `0` 保持为 `0`（不把 `0.0` 折成 `0.00000000`）。
pub fn from_f64(value: f64) -> Option<Decimal> {
    Decimal::from_f64_retain(value).map(|decimal| decimal.round_dp(MAX_BUSINESS_SCALE).normalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_f64_drops_binary_mantissa() {
        let converted = from_f64(12.8).expect("12.8 必须可换算");
        // 未换算的 retain 带着二进制尾数，规范化后与本函数的结果不再相等
        let raw = Decimal::from_f64_retain(12.8).expect("12.8 必须可换算");
        assert_ne!(raw, converted, "尾数应被舍掉，否则换算单点没有意义");
        assert_eq!(converted, Decimal::from_parts(128, 0, 0, false, 1));
        // 从未舍入的尾数版按 2 位折一次，走的是真正的截断分支
        let scaled = raw.round_dp(2);
        let expected = Decimal::from_parts(1280, 0, 0, false, 2);
        assert_eq!(scaled, expected);
    }

    #[test]
    fn from_f64_keeps_non_finite_as_none() {
        assert!(from_f64(f64::NAN).is_none());
        assert!(from_f64(f64::INFINITY).is_none());
        assert_eq!(from_f64(0.0), Some(Decimal::ZERO));
    }

    #[test]
    fn from_f64_keeps_rate_scale_eight() {
        // 汇率列宽 8 位，7.00012500 这类合法精度不得被舍掉
        let rate = from_f64(7.000125).expect("汇率必须可换算");
        assert_eq!(rate, Decimal::from_parts(7000125, 0, 0, false, 6));
    }
}
