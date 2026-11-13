# 后端缺陷取证报告的证伪与撤回（2026-11-03）

## 结论先行

2026-11-03 由只读调查实例交付的"五枚后端真缺陷根因报告"（登记为 D-40 到 D-44）在当前主干代码上**不成立**，整份撤回，不得据此改代码。撤回理由逐条给证据，不给人情判断。

## 证伪证据（全部在车道 wt-bedf，基点 origin/main c6f0e61ac 上实量）

- 报告称 backend/src/services/sales_return_service.rs 第 156 到 167 行把 `request.total_amount_inclusive` 当不含税基数。实读该行区间是读模型 `SalesReturnItemView` 的字段声明（subtotal、tax_amount、discount_amount、total_amount），与金额计算无关；真正的明细计算在第 341 到 358 行，走的是"不含税单价乘数量得小计、小计减折扣得应税基、应税基乘税率得税额、应税基加税额得含税"这条正向链，与 utils/tax.rs 的口径一致。
- 全后端源码 grep `total_amount_inclusive` 零命中，即该字段在本仓不存在，报告描述的入参与落库路径无对应物。
- 全后端源码 grep `lot_lock`、`calculate_kg_to_meters`、`convert_with_tax` 均零命中；报告点名的文件 `backend/src/services/lot_lock_service.rs` 与 `backend/src/services/piece_split_service.rs` 不存在，仓内只有 `backend/src/handlers/piece_split_handler.rs`。
- 报告 D-44 指向 `frontend/e2e/flow/27-…spec.ts` 第 182 与 187 行写死期望比率 0.3；该文件内 grep `conversion` 与 `ratio` 零命中。真实的换算断言在 452-meterage-shrinkage-unit-conversion-conservation.spec.ts 第 295 到 298 行，该用例自己传 `width_cm: 150`，并按文件头声明的公式 1000 除以（克重乘幅宽米）期望 3.3333，断言与自身口径自洽，因此那一枚属"待核后端单位口径"，不属"测试写死错值"。

## 这一撤回影响的判断

- 之前"销售退货审批返回 DATABASE_ERROR 因税额方向反"的因果链不成立，真因待重取。
- 之前"米公斤换算偏 100 倍因取产品级幅宽"的因果链不成立，真因待重取。
- 之前"锁缸释放按米数取数致公斤腿不释放"与"细码拆分写 pending 撞中文 CHECK"两枚连文件都不存在，属虚构点位。
- 0.5% 阈值一枚的"测试写死 0.3"不成立，不改测试。

## 重取的唯一依据

判定器丢 trace_id 与 timestamp 的缺陷修好后（PR #1169），e2e 分片日志里能看到断言原文与服务端返回的 code 与 trace_id。后端真缺陷的定性一律以该批断言原文为准，逐枚重新登记，不再接受无点位可核的根因报告。派工单里"报告与实读不一致时以实读为准并立刻停下回报"这条已经写过，本轮由主编排实读兜住，未把任何虚构补丁落进代码，wt-bedf 工作树全程零改动。

## 不做的事

不因为报告出自只读调查实例就沿用其点位；不把"改断言让分片变绿"当作处理手段；不在没有断言原文的情况下动后端源码与迁移。
