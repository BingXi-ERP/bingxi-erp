# e2e 覆盖疑点台账 2026-11-03

本台账记录存量漏测疑点的度量口径与结论，作为后续补测支的选题来源。度量只到路径形状级，不等于用例级覆盖，逐组须人工确认后才立项。

## 度量方法

两个工装，都在 E:/tmp/tools，都带合成夹具自证检测力，检不出即非零退出。

- e2e_coverage_gap.mjs 把 backend 挂载出的路由快照 frontend/scripts/route-snapshot.txt 的路径，与 frontend/e2e 全目录（含 helpers 与 ui-helpers）里出现的字符串字面量做形状差集。两侧同规则归一，剥掉前端 baseURL 前缀 api v1 erp，去查询串，把纯数字段、花括号占位段与以 id 结尾的段统一成同一个通配段。
- e2e_gap_refine.mjs 把差集再分两档，硬缺口指该端点最后一段实义名在全部 e2e 语料里连一次字面都没出现过，疑似已覆盖指实义名出现过但形状没对上（多为路径由模板字符串拼接或 helper 内改写所致）。

夹具自证结果，控制组一条命中一条缺口全部判对，coverage_gap 侧 routes=1383 时 referenced_shapes=626，refine 侧硬缺口与疑似合计与差集数守恒。

## 结论口径

主干顶点实测，路由形状 1383 枚，被 e2e 语料按形状对上的 176 枚，差集 1207 枚，差集里硬缺口 383 枚、疑似已覆盖 824 枚。

硬缺口是可信的下限，疑似档必须逐条人工确认，不能当缺陷计数。覆盖率不写成单一百分比，因为分母含大量前端从不消费的纯后端端点，这类端点本就不该由 e2e 承担。

## 硬缺口按子feature 前 25 组

crm/customers 10，production/business-modes 6，bi/sales 5，production/lab-dip 5，production/flow-cards 4，production/outsourcing-orders 4，production/production-recipes 4，purchase/orders 4，purchase/supplier-evaluations 4，reports/enhanced 4，contract-templates 3，crm/leads 3，device-connections 3，logistics-tracking/waybills 3，production/dye-batch-lifecycle-logs 3，production/dye-batch-operations 3，production/greige-fabrics 3，production/quality-inspection 3，production/wage-rates 3，production/wage-records 3，purchase/suppliers 3。

## 与面料主链路目标的对应

项目长期目标点名的面料模块里，样品打样、委外染整、质检三条腿的硬缺口最集中，lab-dip、flow-cards、dye-batch-lifecycle-logs、dye-batch-operations、greige-fabrics、quality-inspection、outsourcing-orders 七组直接落在染整与打样段。据此排定的下一批补测选题，459 缸差与色差登记，460 打样小样与流程卡链路，461 染整批次生命周期日志与坯布收发钩稽。

## 未处理事项

- 疑似已覆盖那 824 枚还没逐条人工确认，确认前不得据此声称任何覆盖率。
- 纯后端消费、前端无入口的端点需要单独分类，否则差集会长期虚高。
- wage-rates 与 wage-records 两组属 HR 域，不在面料主链路，暂不排期。
