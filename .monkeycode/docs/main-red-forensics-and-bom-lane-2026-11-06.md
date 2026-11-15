# 主线红取证与 BOM 下线车道状态（2026-11-06 夜）

本册只记"取证结论 + 修法口径 + 车道状态"，缺陷本体仍登记在
`backend-defect-register-2026-11-06.md`（D-57 至 D-59）。

## 一、PR #1172 `flow(16/20)` 定性：本支真红，红因在用例清理前置不全

取证全文在 `E:/tmp/1172-flow16-findings.md`（只读实例落盘），要点：

- `head.sha = b1f0d66374d53201182b827ecbef21c8f29b56ad`，`run_id = 42209550040`，
  job id `127880489192`（job id 只从 `html_url` 的 `/job/` 段取）。
- `mergeable_state = unstable`（不是 dirty 支，pull_request 流水线确实触发）。
- 耗时 932 秒、日志 156633 字节、`E2E-ASSERT` 块非空、apt 403 零命中、
  `os error 28` 与 `Disk quota exceeded` 均零命中 ⇒ 排除装配型红与容量红，判**真断言失败**。
- 失败位：`frontend/e2e/flow/451-tier-price-and-attachment-flow.spec.ts:805` 的 `451-05`，
  抛出形态是 helper 的"非 2xx 即 throw"：
  `API DELETE /products/23 failed: code=BUSINESS_ERROR message=该产品已被1 条色号阶梯价引用，无法删除…`
- 同族先前经验：产品硬删被拒的引用面除 `inventory_stocks` 外还有 color-prices 一族。
  后端"有引用即拒删并点名阻塞面与行数"是**正确契约**。
- **修法口径（不许换方向）**：给清理通道**分档**，按引用面逐档先清再删产品；
  断言仍要同时覆盖"未清引用时删除被拒且文案点名阻塞面与行数"与"清完后删除成功"两段。
  禁止 try/catch 吞、禁止放宽或删除断言、禁止改执行次序凑绿。
- 同 run 另有 `🧪 Rust 测试 (5/10)` failure（job id `127901502796`）待定性；
  取证只认 `test-report-partition-N` 制品（与 job 名同为 1 基）里 `nextest-output.txt` 的 panicked 段，
  控制台日志行首带时间戳，锚定 grep 恒零命中。

## 二、BOM 下线的三条裁定（本域唯一车道 `E:/work/bingxi/wt-bom-1106`）

1. **投纱四维与库存行同构**：`flow_card_materials` 带 `warehouse_id / batch_no / color_no /
   dye_lot_no / grade`，扣料按 `(仓库, 纱线, 批次, 色号, 等级)` 定位唯一库存行，带缸号再按缸号收敛；
   未登记缸号且同组多缸 ⇒ 显式拒绝。目的是让 D-57 真修，而不是把批次折平搬到另一处。
2. **计量口径显式受控**：单位只有 `kg` 与 `m`，`kg` 扣公斤列、`m` 扣米列，另一列按被命中行自身的
   米公斤比值等比随行；不做跨单位折算，避免 D-58 的"按米扣公斤"。
3. **完工前置只在完工判定一处**：`crud.rs` 建单期的 `has_bom` 告警整块删除（建单时流转卡还不存在，
   投纱事实只在完工时成立），避免建单期与完工期各判一次而口径分叉。

缺料预警（`material_shortage_alerts` 与 `material_shortage_threshold_configs`）**保留不删**；
先前误删的那两笔已各自独立 revert（`2949da42d`、`58e2216e2`）。

## 三、车道提交序列（全部未推送，推送需用户当轮授权）

| 提交 | 内容 |
|---|---|
| `a778e01dc` | 下线 BOM 与 MRP 前端入口（api/views/router/navigation） |
| `363fe7266` + `58e2216e2` | i18n 键删除与其回退（残留待办：只删 bom/mrp 键） |
| `da94e5a3c` + `2949da42d` | 缺料预警前端入口删除与其回退 |
| `f68bf5cdc` | 投纱表 m0131 与实体（四维与库存行同构） |
| `fbdaa711a` | 投纱域迁移调用的 rustfmt 折行 |
| `4a74c1d4b` | 投纱 service/handler/路由，复用 `flow-cards` 权限键 |
| `0eff4268c` | 完工扣料换源到投纱（D-57 D-58 修法本体） |
| `6e579b190` | CI 巡检字典去 BOM 与服务条款功能清单同步 |

## 四、六支在途载体 PR 的 CI 面（14:33 实测，工装 `E:/tmp/board_six.mjs`，原始输出 `E:/tmp/board_six.out`）

六支全部 `mergeable=true/unstable`、`base=a7a6272f`，全部**未收口**（`queued` 仍有 14 到 34 枚，runner 侧积压），因此"某支 fail=0"此刻不能读成可合并。逐枚红点：

| PR | head | done/queued/running | fail | 红在哪 |
|---|---|---|---|---|
| #1172 | b1f0d66 | 58/26/2 | 2 | `flow(16/20)` 与 `Rust 测试 (5/10)` |
| #1169 | 82d0e8f | 52/30/4 | 0 | 尚无红，未收口 |
| #1168 | 227ab47 | 57/25/4 | 1 | `flow(16/20)` |
| #1167 | f15e5ba | 49/34/3 | 0 | 尚无红，未收口 |
| #1165 | a95455b | 65/18/2 | 1 | `flow(4/20)` |
| #1146 | 376a86c | 71/14/1 | 0 | 尚无红，未收口 |

**关键待判事实**：`flow(16/20)` 同时在 #1172 与 #1168 红，而 #1168 不含 #1172 新增的 `451-05` 用例。两种可能必须分开处置：属主干侧共享红 ⇒ 处置是主干最小解锁支 + 各支并基重推（仅 rerun 不够）；属两条独立红 ⇒ 各支自己修。已派只读实例取证 `#1168 flow(16/20)` 与 `#1165 flow(4/20)`，判据三证与排除装配型红/容量红/编译连带 skipped 的口径都写进派工单，交付 `E:/tmp/shared-e2e-reds-1168-1165.md`。

开放 PR 数当前正好 6 支（目标值），BOM 车道在收口前不开新支；要开先按"一个功能域只开一支"与"主线红必须收在同一支 PR"两条裁定评估名额。

## 五、号段与分支纪律事实

- **e2e 号段**：`470` 已被 `wt-credit-d49` 的 `470-customer-credit-gate-single-count.spec.ts` 占用，
  投纱域用例改派 **471**（投纱完工闭环，D-59 的 PRODUCTION_CONSUMPTION 零断言缺口）与
  **472**（投纱受控取值与拒绝面）。`463` 至 `467` 属并发族、`468` 属 D-51、`469` 属 E8（既有分配不变）。
- **分支纪律**：BOM 下线这一个功能域只开一支（`refactor/remove-bom-by-flow-card`），
  功能面、迁移面、测试面同支，不再按改动类型另开支。
- 并行实例按目录树硬切：`backend/src` 一支、`backend/migration` 与 `backend/tests` 一支、
  `frontend` 一支、e2e 每实例一枚 spec 文件且互不重叠。
