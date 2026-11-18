//! 中文金额大写工具——打印单据「货款总计(大写)」字段的唯一取值来源。
//!
//! 背景：面料细码单 / 调样单 / 销售单三类真实业务单据（WPS 表格取证）均带
//! 「货款总计(大写)」字段。本函数是被 `utils/xlsx_export.rs` 及后续单据取数切片
//! 调用的独立纯函数，无 DB 依赖、与导出格式无关。
//!
//! 读法依据中国人民银行《支付结算办法》附件的中文大写金额书写规则：
//! - 数字：零壹贰叁肆伍陆柒捌玖；位权：拾佰仟 / 万亿兆京垓秭穰沟涧正载（四位一组进位）；
//! - 元角分：整数部分到「元」；无角无分时「元」后写「整」；
//! - 到「角」为止时「角」后**不写**「整」（办法允许不写，与取证样例
//!   110.40 → 「壹佰壹拾元肆角」一致，故统一不写，保证输出确定）；
//! - 零：中间连续零只读一个「零」（1050 → 壹仟零伍拾元整）；末尾零不读
//!   （300 → 叁佰元整）；万位/亿位组内零按中间零处理；
//! - 元位为 0 且分位非 0 时「元」后写「零」（16409.02 → …零玖元零贰分）；
//! - 组内拾位开头读「壹拾」（15 → 壹拾伍元整，10 → 壹拾元整，按办法例式不省「壹」）。
//!
//! 口径决策：
//! - 入参声明为**两位小数口径**（单据金额落库即 2 位）。若调用方传入更多小数位，
//!   按 `round_dp(2)`（四舍五入）收敛后再读，属防御性归一而非业务规则；
//! - 业务单据金额恒非负。负数输入是调用方数据缺陷，防御分支输出「负」前缀
//!   （如 -12.50 → 「负壹拾贰元伍角」）而不是静默吞掉符号——吞符号会让涂改风险
//!   直接出现在打印单据上，「负」前缀至少把异常暴露在字面上。

use rust_decimal::Decimal;
use rust_decimal::RoundingStrategy;

/// 大写数字词表（下标 = 0..9）。
const DIGITS: [&str; 10] = ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"];

/// 组内位权词表（下标 = 幂次对 4 取模：0=个、1=拾、2=佰、3=仟）。
const UNIT_IN_GROUP: [&str; 4] = ["", "拾", "佰", "仟"];

/// 节单位词表（下标 = 幂次除以 4；四位一组，覆盖 i128 全域，Decimal 量级用不到末端）。
const SECTION_UNITS: [&str; 12] = [
    "", "万", "亿", "兆", "京", "垓", "秭", "穰", "沟", "涧", "正", "载",
];

/// 把金额（已两位小数口径）转成中文大写字符串，如 5545.35 → 「伍仟伍佰肆拾伍元叁角伍分」。
pub fn amount_in_words(amount: Decimal) -> String {
    // 防御性收敛：声明口径是两位小数，超位小数按四舍五入（MidpointAwayFromZero）
    // 收敛后再读；round_dp 默认是银行家舍入（0.125 → 0.12），不符合四舍五入口径。
    let normalized = amount.round_dp_with_strategy(2, RoundingStrategy::MidpointAwayFromZero);
    let is_negative = normalized.is_sign_negative() && !normalized.is_zero();
    let magnitude = if is_negative { -normalized } else { normalized };

    // Decimal 尾数是 96 位有符号整数，×100 后仍远小于 i128 上界，乘法不溢出。
    let scale = magnitude.scale();
    let total_cents = magnitude.mantissa() * 10_i128.pow(2 - scale);
    let yuan = total_cents / 100;
    let jiao = (total_cents / 10 % 10) as usize;
    let fen = (total_cents % 10) as usize;

    let mut out = String::new();
    if is_negative {
        out.push('负');
    }

    if yuan > 0 {
        out.push_str(&integer_to_words(yuan));
        out.push('元');
    }

    match (jiao, fen) {
        (0, 0) => {
            if yuan > 0 {
                out.push('整');
            } else {
                // 零元整：0 / 0.00 的唯一合法读法。
                out.push_str("零元整");
            }
        }
        (j, 0) => {
            // 到角为止不写「整」，与取证样例 110.40 → 壹佰壹拾元肆角一致。
            out.push_str(DIGITS[j]);
            out.push('角');
        }
        (0, f) => {
            // 元位为 0、角位为 0、分位非 0：「元」后写「零」（《支付结算办法》例式）。
            // 整数部分本身为 0 时（如 0.03）不写「元」也不写该「零」。
            if yuan > 0 {
                out.push('零');
            }
            out.push_str(DIGITS[f]);
            out.push('分');
        }
        (j, f) => {
            out.push_str(DIGITS[j]);
            out.push('角');
            out.push_str(DIGITS[f]);
            out.push('分');
        }
    }
    out
}

/// 正整数的中文大写（不含「元」「整」），输入必须 > 0。
///
/// 逐位处理（幂次从高到低）：
/// - 遇 0 且低位还有非 0 → 置「待读零」标记，后续第一个非 0 位前只读一个「零」；
/// - 非 0 位读 数字 + 组内位权，幂次落在组边界（%4==0）时补节单位；
/// - 整组全 0 时不补节单位（如 100000001 → 壹亿零壹元，中间「万」组不读）；
/// - 万位/元位是 0 而千位非 0 的情形，办法允许「读一个零」或「不读零」二选一，
///   本实现固定读一个零（107000 → 壹拾万零柒仟元…，10005000 → 壹仟万零伍仟元整），
///   输出确定、可被单测精确锚定。
fn integer_to_words(yuan: i128) -> String {
    let text = yuan.to_string();
    let digits: Vec<usize> = text.bytes().map(|b| usize::from(b - b'0')).collect();
    let len = digits.len();

    let mut out = String::new();
    let mut zero_pending = false;
    for (idx, &d) in digits.iter().enumerate() {
        let power = len - 1 - idx;
        if d == 0 {
            // 低位还有非 0 数字时，这个 0 属于「中间零」。
            if digits[idx + 1..].iter().any(|&x| x != 0) {
                zero_pending = true;
            }
            // 组边界上的 0：该组若含非 0 数字，仍要补节单位（如 107000 的「万」）。
            if power.is_multiple_of(4) && power > 0 {
                // 整组理论覆盖 4 位，但最高组的实际位数可能不足（如 107000 的万组只有 2 位），
                // 用 saturating_sub 收敛到 0 防下溢。
                let group_start = len.saturating_sub(4 * (power / 4 + 1));
                if digits[group_start..idx + 1].iter().any(|&x| x != 0) {
                    out.push_str(SECTION_UNITS[power / 4]);
                }
            }
        } else {
            if zero_pending {
                out.push('零');
                zero_pending = false;
            }
            out.push_str(DIGITS[d]);
            out.push_str(UNIT_IN_GROUP[power % 4]);
            if power.is_multiple_of(4) {
                // 非 0 数字落在组边界时该组必然非全 0，直接补节单位。
                out.push_str(SECTION_UNITS[power / 4]);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    fn amount(s: &str) -> Decimal {
        Decimal::from_str(s).unwrap()
    }

    #[test]
    fn real_world_samples_from_evidenced_documents() {
        // 真实取证样例（面料细码单 / 调样单 / 销售单）
        assert_eq!(
            amount_in_words(amount("5545.35")),
            "伍仟伍佰肆拾伍元叁角伍分"
        );
        assert_eq!(amount_in_words(amount("963.75")), "玖佰陆拾叁元柒角伍分");
        assert_eq!(amount_in_words(amount("110.40")), "壹佰壹拾元肆角");
    }

    #[test]
    fn trailing_zero_not_read() {
        assert_eq!(amount_in_words(amount("300")), "叁佰元整");
        assert_eq!(amount_in_words(amount("100")), "壹佰元整");
    }

    #[test]
    fn middle_zero_read_once() {
        assert_eq!(amount_in_words(amount("1050")), "壹仟零伍拾元整");
        assert_eq!(amount_in_words(amount("6007.14")), "陆仟零柒元壹角肆分");
    }

    #[test]
    fn jiao_only_no_zheng_suffix() {
        assert_eq!(amount_in_words(amount("0.5")), "伍角");
    }

    #[test]
    fn zero_amount() {
        assert_eq!(amount_in_words(amount("0")), "零元整");
        assert_eq!(amount_in_words(amount("0.00")), "零元整");
    }

    #[test]
    fn fen_only_no_yuan_section() {
        assert_eq!(amount_in_words(amount("0.03")), "叁分");
    }

    #[test]
    fn yi_section_carries() {
        // 亿段：组内无中间零，角分正常续读
        assert_eq!(amount_in_words(amount("100000000.99")), "壹亿元玖角玖分");
        // 亿段进位 + 元后零分（元位 0、角位 0、分位非 0）
        assert_eq!(
            amount_in_words(amount("123456789.01")),
            "壹亿贰仟叁佰肆拾伍万陆仟柒佰捌拾玖元零壹分"
        );
    }

    #[test]
    fn zero_wan_group_bridges_with_single_zero() {
        // 全零中间组：亿组非 0、万组全 0 → 只读一个零
        assert_eq!(amount_in_words(amount("100000001")), "壹亿零壹元整");
    }

    #[test]
    fn wan_boundary_zero_and_low_group() {
        // 万位是 0、千位非 0：办法允许读一个零，本实现固定读（口径见函数文档）
        assert_eq!(
            amount_in_words(amount("107000.53")),
            "壹拾万零柒仟元伍角叁分"
        );
        assert_eq!(amount_in_words(amount("1000100")), "壹佰万零壹佰元整");
        assert_eq!(amount_in_words(amount("10005000")), "壹仟万零伍仟元整");
    }

    #[test]
    fn yuan_zero_but_fen_nonzero_writes_zero_after_yuan() {
        // 《支付结算办法》例式：角位 0、分位非 0 → 元后写零
        assert_eq!(
            amount_in_words(amount("16409.02")),
            "壹万陆仟肆佰零玖元零贰分"
        );
        assert_eq!(amount_in_words(amount("325.04")), "叁佰贰拾伍元零肆分");
    }

    #[test]
    fn shi_position_keeps_yi_prefix() {
        // 拾位开头不省「壹」：按办法例式（壹拾万柒仟），10 → 壹拾元整
        assert_eq!(amount_in_words(amount("15")), "壹拾伍元整");
        assert_eq!(amount_in_words(amount("10")), "壹拾元整");
        assert_eq!(amount_in_words(amount("1680.32")), "壹仟陆佰捌拾元叁角贰分");
    }

    #[test]
    fn single_yuan() {
        assert_eq!(amount_in_words(amount("1")), "壹元整");
    }

    #[test]
    fn negative_input_prefixed_defensively() {
        // 负数是调用方数据缺陷，防御分支输出「负」前缀（口径见模块文档）
        assert_eq!(amount_in_words(amount("-12.50")), "负壹拾贰元伍角");
    }

    #[test]
    fn negative_zero_reads_as_zero() {
        assert_eq!(amount_in_words(amount("-0.00")), "零元整");
    }

    #[test]
    fn extra_decimal_places_are_rounded_to_two() {
        // 超两位小数属调用方越界，按 round_dp(2) 四舍五入收敛（0.125 → 0.13）
        assert_eq!(amount_in_words(amount("0.125")), "壹角叁分");
    }
}
