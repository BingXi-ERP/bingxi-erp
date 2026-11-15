# 遗留问题处理规划（2026-11-15）

输入：tech-debt-status-audit-2026-11-15.md 第五节、capability-gap 复核存活清单、终审待裁项、主线在途。

## 一、本轮取证修正（规划前置）

- **A3 事实修正**：`#[allow(dead_code)]` 881 处中 837 处已带 `reason` 注释（serde/DTO 形态合规标注），真正的裸标注仅 **44 处**——原"881 处系统清点"的范围被高估，实际工时从 5-10d 缩到 1d。
- **A4 事实修正**：reqwest 0.13.4 默认 rustls 后端（Cargo.lock 实证），rustls 0.23 架构性禁用 TLS<1.2——TLS 下限已被依赖树保证，**无需改代码**，结案（登记审计口径）。
- **A6 修正**：BOM DROP 属用户裁定待拍项，不在本轮擅动。

## 二、可立即开工项（按价值/风险排序）

| 序号 | 项 | 工时 | 风险 | 价值 |
|------|-----|------|------|------|
| W1 | cargo-deny 补位（deny.toml + vuln-scan action 第八面：license/ban/source 审计） | 0.5-1d | 低（fail-closed 只对 license 冲突与 ban，初始 deny 集空跑观察一轮） | 补齐 4.7 供应链审计最后一维 |
| W2 | 裸 allow(dead_code) 44 处补 reason 或删码 | 1d | 低（逐处判死码/框架形态） | 2.9 真正收口 |
| W3 | print_service.rs 5762 行拆分 | 2-3d | 中（打印域 API 稳定、e2e 面齐全可护航；拆子模块不动签名） | 8.2 最大单点 |
| W4 | 前端 any 44 文件清零 | 2-3d | 中低（api 层先清，views 层逐文件） | 2.10 收口 |

## 三、待用户拍板项（不擅动，一次摆清）

1. **v-permission 灰化 vs 移除**（方案 4.1 O 有判据，但 481/482 count()==0 断言需同支改）。
2. **列表状态入 URL**（109 视图，产品口径）。
3. **余码/打样逐版前端建页**（功能补齐立项）。
4. **移动端体验批次**（排期）。
5. **报价独立版本表**（增强候选，现由审计快照承载）。
6. **BOM DROP 迁移**（11-06 裁定的最后一步）。

## 四、执行序

- 立即：W1（cargo-deny）→ W2（44 处 reason）——同域打包成一支"技术债收尾"车道，测试面单独 PR。
- 随后：W3（print 拆分）单开车道（hub 文件大改，避撞在途）；W4（any 清零）前端车道。
- C 类主线：五支 PR 由合并编排器自动收口；本地 1 笔报告未推（<10 阈值）攒批随下一波。

## 五、验收判据

- W1：vuln-scan action 新增 deny 面，首次 CI 全量面绿；deny.toml 的 license 允许集与 Cargo.lock 实际 license 零冲突。
- W2：`grep -rn '#\[allow(dead_code)\]' backend/src` 零命中（全带 reason 或删除）。
- W3：print_service.rs 拆为 print/ 子模块（模板/渲染/任务三域），`route-snapshot --check` 逐字节不变，print e2e 面全绿。
- W4：`grep -rln ': any\b\|<any>\|as any' frontend/src` 零命中，vue-tsc 过。
