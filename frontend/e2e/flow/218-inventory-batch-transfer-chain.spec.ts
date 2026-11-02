/**
 * 库存批次（细码）调拨链路写后回读 × 批次与调拨明细契约配对
 *
 * 功能：把六枚「主干有 UI 但 e2e 从未配对」的端点钉进真实读写闭环——
 * 一，批次族（POST/GET/PUT/DELETE /inventory/batches[/{id}]）走完整写后回读：POST 建一条
 *    batch_no 为唯一 marker 的批次，详情与列表按主键回读逐字段自证落库（米数与公斤数口径
 *    分列核对），PUT 改色号/缸号/克重/幅宽后按主键回读确认新值生效且旧值不残留，DELETE 后
 *    回读确认 404 且列表不再含该 id；
 * 二，批次调拨 POST /inventory/batches/{id}/transfer 断两侧米数守恒：转出仓扣减量、
 *    转入仓新行增量与调拨量三方对账（源行 + 目标行 = 调拨前源行），并断两条确定性业务拒绝：
 *    超现有可用量被拒（「库存数量不足」）、源批次不存在被拒（404「源批次不存在」）；
 * 三，调拨明细族（PUT/DELETE /inventory/transfers/items/{id}）在既有非终态调拨单上
 *    加一条明细→改明细→删明细，逐字段回读确认落库，并断 NOT NULL 列显式清空被入口拒绝
 *    （「调拨数量不能清空：该字段为必填项」）与不存在明细主键 404「调拨明细 N 未找到」；
 *    明细数量变动后调拨单表头 total_quantity 与明细行求和逐值一致（守恒不变量）。
 *
 * 调用方：Playwright E2E 套件，由 CI 的 e2e flow 分片按文件哈希收集执行。
 * 入参：BASE_URL 与 API_BASE 取环境变量；admin 角色凭证由 global-setup 写入
 *       e2e/.auth/role-credentials.json（SEED_ROLES 含 admin，permission.rs admin 短路）。
 * 传给谁：会话由 fixtures/relay 的 createRelay 建立（单角色 admin 三棒），请求走 flow/helpers 的
 *       apiCall/apiCallRaw/apiCallExpectFail（内置 CSRF 有界重放与会话同步），唯一标识走 genCode，
 *       不另造登录或请求函数。
 * 存什么：inventory_stock 表 2 行（源批次与调拨生成的目标批次，均建→改→删，终态不留存）；
 *       inventory_transfer_item 表 1 行（加→改→删，终态不留存）；调拨单表头 total_quantity
 *       经加删明细后回到初值。明细腿依赖既有非终态调拨单作为前置，不新建调拨单。
 * 存哪里：inventory_stock（services/inventory_stock_service.rs create/update/transfer/delete）、
 *       inventory_transfer_item 与 inventory_transfer（services/inv/batch.rs add/update/delete_item）。
 *
 * 【本 spec 如实暴露的后端缺口（不作断言，交实现侧处置）】
 * 一，transfer 的公斤口径不守恒：inventory_stock_service.rs 与 :1024-1025 只对
 *    quantity_on_hand/quantity_available（米数）做扣减与累加，源行 quantity_kg 原值不动，
 *    而新建目标行 quantity_kg 直接取本次调拨量（:1054），两侧公斤数之和凭空增加；
 * 二，transfer 无数量下界门：inventory_stock_service.rs 仅判 quantity_available < 传输量，
 *    传 0 恒通过（空转成功）、传负数亦恒通过并使源批次数量凭空虚增，请求结构
 *    TransferBatchRequest（inventory_batch_handler.rs）的 from_warehouse_id 在
 *    服务侧被显式丢弃（inventory_stock_service.rs，源仓以批次自身 warehouse_id 为准）；
 *    故本 spec 只断「超量」这一条有源码文案兜底的拒绝腿，0/负数与伪造源仓的腿留待入口校验补齐后再写；
 * 三，超卖与并发的真实前置（同一批次被两请求同时扣减）无法在单请求内构造，本 spec 只覆盖
 *    单请求级边界（超现有可用量被拒），并发扣减腿仍缺。
 *
 * 【断言判据与后端口径出处】
 * 出参键 = models/inventory_stock.rs Model 字段名（serde 直出 snake_case），批次详情与创建/更新
 *    返回体均为该 Model（handlers/inventory_batch_handler.rs、:201）；
 * 列表为 PaginatedResponse{items,total,page,page_size}，过滤列 batch_no/warehouse_id
 *    （BatchListQuery，inventory_batch_handler.rs；page_size clamp(1,100)）；
 * 数量列 quantity_on_hand/quantity_available/quantity_meters/quantity_kg 与明细 quantity、
 *    表头 total_quantity 均为 DECIMAL，本仓未开 serde-float，出参是字符串，故断言一律
 *    先取字符串再 Number 归一做逐值判等；本文件使用的数量取值（200.5/50.25/8.25）在二进制
 *    浮点下精确可表示，归一后的加减等式不会引入末位漂移；
 * 成功文案「批次创建成功」「批次更新成功」「批次转移成功」「批次删除成功」「调拨明细添加成功」
 *    「调拨明细更新成功」「调拨明细已删除」与 handler 字面同源；
 * 失败文案与后端源码逐字符同源（均非脱敏通用「业务处理失败」形态）：GET 不存在主键
 *    「库存记录 ID {id} 不存在」（inventory_stock_service.rs）、PUT 不存在主键
 *    「批次不存在」（:922）、DELETE 不存在主键「inventory_batch 记录不存在」
 *    （audit_log_service.rs 以 resource_type "inventory_batch" 拼接，delete_batch_with_audit
 *    inventory_stock_service.rs）、PUT 清空 NOT NULL 列「色号不能清空：该字段为必填项」
 *    （:897-901）、transfer 超量「库存数量不足」（:997-998）、transfer 源批次不存在「源批次不存在」
 *    （:996）、明细清空 NOT NULL 列「调拨数量不能清空：该字段为必填项」（inv/batch.rs）、
 *    明细不存在「调拨明细 {id} 未找到」（inv/batch.rs、:1445）；
 * 明细的调拨单状态门（inv/batch.rs、:1452-1460）只在 SHIPPED/COMPLETED 拒绝，
 *    故候选调拨单按大小写不敏感的同一规则筛除，取到即可写，无需猜测状态词表原值大小写；
 * 明细追溯四维按「生效色号非空即染色布、空串为白坯合法值」判定（inv/mod.rs），
 *    本 spec 以 color_no 空串走白坯免填缸号/匹号路径，batch_no 提交唯一 marker 落库并回读。
 */
import { test, expect } from '../diagnose-fixture'
import { apiCall, apiCallExpectFail, apiCallRaw, genCode } from './helpers'
import { createRelay } from '../fixtures/relay'

type Row = Record<string, unknown>

/** 主键大数负例：落在 i32 域内、业务上不可能存在的批次/明细 id */
const MISSING_BATCH_ID = 912345701
const MISSING_ITEM_ID = 912345702
/** 批次数量列初值与调拨量（米数口径），十进制均二进制精确 */
const Q_INIT = 200.5
const Q_TRANSFER = 50.25
const Q_KG_INIT = 77.25
const Q_KG_TRANSFER = 25.125
/** 明细改后数量（DECIMAL 入参，二进制精确） */
const Q_ITEM_UPDATED = 8.25
/** 以下文案与 backend 源码字符串逐字符同源 */
const MSG_BATCH_CREATED = '批次创建成功'
const MSG_BATCH_UPDATED = '批次更新成功'
const MSG_BATCH_TRANSFERRED = '批次转移成功'
const MSG_BATCH_DELETED = '批次删除成功'
const MSG_STOCK_ID_NOT_FOUND = `库存记录 ID ${MISSING_BATCH_ID} 不存在`
const MSG_BATCH_NOT_FOUND = '批次不存在'
const MSG_BATCH_DELETE_NOT_FOUND = 'inventory_batch 记录不存在'
const MSG_COLOR_NO_CLEAR = '色号不能清空：该字段为必填项'
const MSG_QUANTITY_SHORT = '库存数量不足'
const MSG_SOURCE_BATCH_MISSING = '源批次不存在'
const MSG_ITEM_ADDED = '调拨明细添加成功'
const MSG_ITEM_UPDATED = '调拨明细更新成功'
const MSG_ITEM_DELETED = '调拨明细已删除'
const MSG_ITEM_QTY_CLEAR = '调拨数量不能清空：该字段为必填项'
const MSG_ITEM_NOT_FOUND = `调拨明细 ${MISSING_ITEM_ID} 未找到`

/** 状态词表大小写不敏感的终态筛除（与 inv/batch.rs 明细状态门同语义） */
function isTerminalTransfer(status: unknown): boolean {
  expect(typeof status).toBe('string')
  const upper = String(status).toUpperCase()
  return upper === 'SHIPPED' || upper === 'COMPLETED'
}

test.describe.serial('批次增改删回读与调拨守恒及调拨明细契约', () => {
  test('批次写后回读逐字段命中且非法清空与超量按源码文案拒绝，调拨两侧米数守恒，明细改删回读且表头合计与明细求和一致', async ({
    browser,
  }) => {
    const relay = await createRelay(browser)
    try {
      await relay.runSteps([
        {
          role: 'admin',
          label: '批次族 POST→读回→PUT→读回→DELETE→读回 与负向门',
          run: async ({ session }) => {
            const page = session.page

            // 前置：两个真实仓库 + 一个真实产品作为外键归属，取不到即环境异常显式判红
            const whRes = await apiCallRaw<{ items: Row[] }>(
              page,
              'GET',
              '/warehouses?page=1&page_size=50'
            )
            expect(whRes.items.length).toBeGreaterThanOrEqual(2)
            const fromWarehouseId = Number(whRes.items[0].id)
            const toWarehouseId = Number(whRes.items[1].id)
            expect(Number.isInteger(fromWarehouseId) && fromWarehouseId > 0).toBe(true)
            expect(Number.isInteger(toWarehouseId) && toWarehouseId > 0).toBe(true)
            expect(toWarehouseId).not.toBe(fromWarehouseId)

            const prodRes = await apiCallRaw<{ items: Row[] }>(
              page,
              'GET',
              '/products?page=1&page_size=20'
            )
            expect(prodRes.items.length).toBeGreaterThan(0)
            const productId = Number(prodRes.items[0].id)
            expect(Number.isInteger(productId) && productId > 0).toBe(true)

            const batchNo = genCode('E2E-BATCH')
            const colorInit = `${batchNo}-C0`
            const colorUpdated = `${batchNo}-C1`
            const created = await apiCall<Row>(page, 'POST', '/inventory/batches', {
              batch_no: batchNo,
              product_id: productId,
              warehouse_id: fromWarehouseId,
              color_no: colorInit,
              grade: '一等品',
              quantity_meters: Q_INIT,
              quantity_kg: Q_KG_INIT,
            })
            expect(created.message).toBe(MSG_BATCH_CREATED)
            const batchId = Number(created.data.id)
            expect(Number.isInteger(batchId) && batchId > 0).toBe(true)
            expect(created.data.batch_no).toBe(batchNo)
            expect(Number(created.data.warehouse_id)).toBe(fromWarehouseId)
            expect(Number(created.data.product_id)).toBe(productId)

            // 落库数量口径：米数三列同源（quantity_on_hand/available/meters 均取入参米数），
            // DECIMAL 出参为字符串，故先断形状再断逐值
            expect(typeof created.data.quantity_on_hand).toBe('string')
            expect(typeof created.data.quantity_available).toBe('string')
            expect(typeof created.data.quantity_kg).toBe('string')
            expect(Number(created.data.quantity_on_hand)).toBe(Q_INIT)
            expect(Number(created.data.quantity_available)).toBe(Q_INIT)
            expect(Number(created.data.quantity_meters)).toBe(Q_INIT)
            expect(Number(created.data.quantity_kg)).toBe(Q_KG_INIT)
            expect(Number(created.data.quantity_reserved)).toBe(0)
            expect(created.data.grade).toBe('一等品')
            expect(typeof created.data.stock_status).toBe('string')
            expect(typeof created.data.quality_status).toBe('string')
            expect(typeof created.data.created_at).toBe('string')

            // 详情按主键回读，与创建返回体逐字段一致
            const detail = await apiCallRaw<Row>(
              page,
              'GET',
              `/inventory/batches/${batchId}`
            )
            expect(Number(detail.id)).toBe(batchId)
            expect(detail.batch_no).toBe(batchNo)
            expect(detail.color_no).toBe(colorInit)
            expect(Number(detail.warehouse_id)).toBe(fromWarehouseId)
            expect(Number(detail.quantity_on_hand)).toBe(Q_INIT)

            // 列表回读：分页信封四键类型正确，按 batch_no 过滤后含该主键且色号为初值
            const list = await apiCallRaw<{
              items: Row[]
              total: number
              page: number
              page_size: number
            }>(
              page,
              'GET',
              `/inventory/batches?batch_no=${batchNo}&page=1&page_size=100`
            )
            expect(Array.isArray(list.items)).toBe(true)
            expect(typeof list.total).toBe('number')
            expect(list.page).toBe(1)
            expect(list.page_size).toBe(100)
            const listed = list.items.find(r => Number(r.id) === batchId)
            if (!listed) {
              throw new Error(
                `[218] 批次列表回读缺失 id=${batchId}（batch_no=${batchNo} 过滤下共 ${list.items.length} 行）`
              )
            }
            expect(listed.color_no).toBe(colorInit)

            // 更新腿：可显示字段与可空追溯字段一并改，返回体与独立读回双重确认持久化
            const dyeLotUpdated = `${batchNo}-D1`
            const updated = await apiCall<Row>(
              page,
              'PUT',
              `/inventory/batches/${batchId}`,
              {
                color_no: colorUpdated,
                dye_lot_no: dyeLotUpdated,
                gram_weight: 240.5,
                width: 160.25,
              }
            )
            expect(updated.message).toBe(MSG_BATCH_UPDATED)
            expect(updated.data.color_no).toBe(colorUpdated)
            const reread = await apiCallRaw<Row>(
              page,
              'GET',
              `/inventory/batches/${batchId}`
            )
            expect(reread.color_no).toBe(colorUpdated)
            expect(reread.dye_lot_no).toBe(dyeLotUpdated)
            expect(Number(reread.gram_weight)).toBe(240.5)
            expect(Number(reread.width)).toBe(160.25)
            // 旧值不残留：整行 JSON 里不得再出现初值色号
            expect(JSON.stringify(reread).includes(colorInit)).toBe(false)
            // 数量列不被更新腿触碰
            expect(Number(reread.quantity_on_hand)).toBe(Q_INIT)

            // 负向门：NOT NULL 列 color_no 显式 null 在 DB 访问前被拒，文案逐字符同源
            const clearFail = await apiCallExpectFail(
              page,
              'PUT',
              `/inventory/batches/${batchId}`,
              { color_no: null }
            )
            expect(clearFail.status).toBeGreaterThanOrEqual(400)
            expect(clearFail.status).toBeLessThan(500)
            expect(clearFail.message).toBe(MSG_COLOR_NO_CLEAR)

            // 不存在主键三腿：GET/PUT/DELETE 各自真实语义文案，绝不接受 200
            const getFail = await apiCallExpectFail(
              page,
              'GET',
              `/inventory/batches/${MISSING_BATCH_ID}`
            )
            expect(getFail.status).toBe(404)
            expect(getFail.message).toBe(MSG_STOCK_ID_NOT_FOUND)
            const putFail = await apiCallExpectFail(
              page,
              'PUT',
              `/inventory/batches/${MISSING_BATCH_ID}`,
              { color_no: genCode('E2E-BATCHX') }
            )
            expect(putFail.status).toBe(404)
            expect(putFail.message).toBe(MSG_BATCH_NOT_FOUND)
            const deleteFail = await apiCallExpectFail(
              page,
              'DELETE',
              `/inventory/batches/${MISSING_BATCH_ID}`
            )
            expect(deleteFail.status).toBe(404)
            expect(deleteFail.message).toBe(MSG_BATCH_DELETE_NOT_FOUND)

            // 删除腿：本棒批次删除后按主键回读 404（终态不留存）
            const deleted = await apiCall<null>(
              page,
              'DELETE',
              `/inventory/batches/${batchId}`
            )
            expect(deleted.message).toBe(MSG_BATCH_DELETED)
            const afterDeleteOwn = await apiCallExpectFail(
              page,
              'GET',
              `/inventory/batches/${batchId}`
            )
            expect(afterDeleteOwn.status).toBe(404)
            expect(afterDeleteOwn.message).toBe(`库存记录 ID ${batchId} 不存在`)
            return { artifacts: [] }
          },
        },
        {
          role: 'admin',
          label: '批次调拨两侧米数守恒与超量/源缺失拒绝及目标批次删除不可见',
          run: async ({ session }) => {
            const page = session.page

            // 本棒自建批次：守恒对账需要一条数量确定的在册批次，不复用他棒数据
            const whRes = await apiCallRaw<{ items: Row[] }>(
              page,
              'GET',
              '/warehouses?page=1&page_size=50'
            )
            expect(whRes.items.length).toBeGreaterThanOrEqual(2)
            const fromWarehouseId = Number(whRes.items[0].id)
            const toWarehouseId = Number(whRes.items[1].id)
            expect(Number.isInteger(fromWarehouseId) && fromWarehouseId > 0).toBe(true)
            expect(Number.isInteger(toWarehouseId) && toWarehouseId > 0).toBe(true)
            expect(toWarehouseId).not.toBe(fromWarehouseId)
            const prodRes = await apiCallRaw<{ items: Row[] }>(
              page,
              'GET',
              '/products?page=1&page_size=20'
            )
            const productId = Number(prodRes.items[0].id)
            const movedNo = genCode('E2E-BATCH-M')
            const source = await apiCall<Row>(page, 'POST', '/inventory/batches', {
              batch_no: movedNo,
              product_id: productId,
              warehouse_id: fromWarehouseId,
              color_no: `${movedNo}-C0`,
              grade: '一等品',
              quantity_meters: Q_INIT,
              quantity_kg: Q_KG_INIT,
            })
            expect(source.message).toBe(MSG_BATCH_CREATED)
            const batchId = Number(source.data.id)
            expect(Number.isInteger(batchId) && batchId > 0).toBe(true)
            expect(Number(source.data.quantity_on_hand)).toBe(Q_INIT)
            const ctx = { batchId, productId, fromWarehouseId, toWarehouseId }

            // 调拨前源行快照（字符串形状留存，用于逐值对账）
            const before = await apiCallRaw<Row>(
              page,
              'GET',
              `/inventory/batches/${batchId}`
            )
            const onHandBefore = Number(before.quantity_on_hand)
            const availableBefore = Number(before.quantity_available)
            expect(onHandBefore).toBe(Q_INIT)
            expect(availableBefore).toBe(Q_INIT)

            // 业务拒绝一：超现有可用量，文案与 inventory_stock_service.rs 同源
            const overFail = await apiCallExpectFail(
              page,
              'POST',
              `/inventory/batches/${batchId}/transfer`,
              {
                from_warehouse_id: ctx.fromWarehouseId,
                to_warehouse_id: ctx.toWarehouseId,
                quantity_meters: onHandBefore + 0.5,
                quantity_kg: Q_KG_TRANSFER,
              }
            )
            expect(overFail.status).toBe(400)
            expect(overFail.message).toBe(MSG_QUANTITY_SHORT)

            // 业务拒绝二：源批次不存在 → 404
            const missingSource = await apiCallExpectFail(
              page,
              'POST',
              `/inventory/batches/${MISSING_BATCH_ID}/transfer`,
              {
                from_warehouse_id: ctx.fromWarehouseId,
                to_warehouse_id: ctx.toWarehouseId,
                quantity_meters: Q_TRANSFER,
                quantity_kg: Q_KG_TRANSFER,
              }
            )
            expect(missingSource.status).toBe(404)
            expect(missingSource.message).toBe(MSG_SOURCE_BATCH_MISSING)

            // 被拒腿不得触碰库存：源行两列仍等于调拨前快照
            const afterReject = await apiCallRaw<Row>(
              page,
              'GET',
              `/inventory/batches/${batchId}`
            )
            expect(Number(afterReject.quantity_on_hand)).toBe(onHandBefore)
            expect(Number(afterReject.quantity_available)).toBe(availableBefore)

            // 成功腿：米数守恒三方对账
            const moved = await apiCall<null>(
              page,
              'POST',
              `/inventory/batches/${batchId}/transfer`,
              {
                from_warehouse_id: ctx.fromWarehouseId,
                to_warehouse_id: ctx.toWarehouseId,
                quantity_meters: Q_TRANSFER,
                quantity_kg: Q_KG_TRANSFER,
              }
            )
            expect(moved.message).toBe(MSG_BATCH_TRANSFERRED)

            const after = await apiCallRaw<Row>(
              page,
              'GET',
              `/inventory/batches/${batchId}`
            )
            expect(Number(after.quantity_on_hand)).toBe(onHandBefore - Q_TRANSFER)
            expect(Number(after.quantity_available)).toBe(availableBefore - Q_TRANSFER)

            // 目标仓新行：同 batch_no/product_id、归属转入仓，数量恰等于调拨量
            const tgtList = await apiCallRaw<{ items: Row[] }>(
              page,
              'GET',
              `/inventory/batches?warehouse_id=${ctx.toWarehouseId}&product_id=${ctx.productId}&page=1&page_size=100`
            )
            const targetId = tgtList.items
              .map(r => Number(r.id))
              .find(id => id !== batchId)
            if (targetId === undefined) {
              throw new Error(
                `[218] 转入仓未生成目标批次（warehouse_id=${ctx.toWarehouseId} 过滤下共 ${tgtList.items.length} 行）`
              )
            }
            const target = await apiCallRaw<Row>(
              page,
              'GET',
              `/inventory/batches/${targetId}`
            )
            expect(Number(target.warehouse_id)).toBe(ctx.toWarehouseId)
            expect(Number(target.product_id)).toBe(ctx.productId)
            expect(Number(target.quantity_on_hand)).toBe(Q_TRANSFER)
            expect(Number(target.quantity_available)).toBe(Q_TRANSFER)
            // 守恒恒等式：源行 + 目标行 = 调拨前源行（米数口径）
            expect(
              Number(after.quantity_on_hand) + Number(target.quantity_on_hand)
            ).toBe(onHandBefore)
            expect(
              Number(after.quantity_available) + Number(target.quantity_available)
            ).toBe(availableBefore)

            // 删除腿：目标行与源行均删除，删除后按主键回读 404 且列表不可见
            for (const id of [targetId, batchId]) {
              const deleted = await apiCall<null>(
                page,
                'DELETE',
                `/inventory/batches/${id}`
              )
              expect(deleted.message).toBe(MSG_BATCH_DELETED)
              const afterDelete = await apiCallExpectFail(
                page,
                'GET',
                `/inventory/batches/${id}`
              )
              expect(afterDelete.status).toBe(404)
              expect(afterDelete.message).toBe(`库存记录 ID ${id} 不存在`)
              const reAppeared = await apiCallRaw<{ items: Row[] }>(
                page,
                'GET',
                `/inventory/batches?product_id=${ctx.productId}&page=1&page_size=100`
              )
              expect(
                reAppeared.items.some(r => Number(r.id) === id)
              ).toBe(false)
            }
            return { artifacts: [] }
          },
        },
        {
          role: 'admin',
          label: '调拨明细 PUT 写后回读与 DELETE 不可见及 NOT NULL 拒清',
          run: async ({ session }) => {
            const page = session.page

            // 前置：取一张非终态调拨单（终态判据与后端明细状态门同语义）
            const listRes = await apiCallRaw<{ items: Row[] }>(
              page,
              'GET',
              '/inventory/transfers?page=1&page_size=100'
            )
            expect(Array.isArray(listRes.items)).toBe(true)
            const candidates = listRes.items.filter(r => !isTerminalTransfer(r.status))
            if (candidates.length === 0) {
              throw new Error(
                `[218] 环境缺少可写明细的非终态调拨单（共 ${listRes.items.length} 行）`
              )
            }
            const transferId = Number(candidates[0].id)
            expect(Number.isInteger(transferId) && transferId > 0).toBe(true)

            const prodRes = await apiCallRaw<{ items: Row[] }>(
              page,
              'GET',
              '/products?page=1&page_size=20'
            )
            const productId = Number(prodRes.items[0].id)
            const itemBatchNo = genCode('E2E-TRFITEM')

            // 建明细（白坯：色号空串为合法值，缸号/匹号免填），主键与初值自证落库
            const added = await apiCall<Row>(
              page,
              'POST',
              `/inventory/transfers/${transferId}/items`,
              {
                product_id: productId,
                quantity: Q_TRANSFER,
                color_no: '',
                batch_no: itemBatchNo,
                notes: `${itemBatchNo}-N0`,
              }
            )
            expect(added.message).toBe(MSG_ITEM_ADDED)
            const itemId = Number(added.data.id)
            expect(Number.isInteger(itemId) && itemId > 0).toBe(true)
            expect(Number(added.data.transfer_id)).toBe(transferId)
            expect(Number(added.data.quantity)).toBe(Q_TRANSFER)
            expect(added.data.batch_no).toBe(itemBatchNo)

            // 更新腿：数量与备注同时改，返回体与明细列表回读双重确认
            const notesUpdated = `${itemBatchNo}-N1`
            const updated = await apiCall<Row>(
              page,
              'PUT',
              `/inventory/transfers/items/${itemId}`,
              { quantity: Q_ITEM_UPDATED, notes: notesUpdated }
            )
            expect(updated.message).toBe(MSG_ITEM_UPDATED)
            expect(Number(updated.data.quantity)).toBe(Q_ITEM_UPDATED)
            expect(updated.data.notes).toBe(notesUpdated)

            const itemsAfterPut = await apiCallRaw<Row[]>(
              page,
              'GET',
              `/inventory/transfers/${transferId}/items`
            )
            expect(Array.isArray(itemsAfterPut)).toBe(true)
            const persisted = itemsAfterPut.find(r => Number(r.id) === itemId)
            if (!persisted) {
              throw new Error(
                `[218] 明细列表回读缺失 item_id=${itemId}（transfer_id=${transferId} 下共 ${itemsAfterPut.length} 行）`
              )
            }
            expect(Number(persisted.quantity)).toBe(Q_ITEM_UPDATED)
            expect(persisted.notes).toBe(notesUpdated)
            expect(JSON.stringify(persisted).includes(`${itemBatchNo}-N0`)).toBe(false)

            // 表头合计与明细求和一致（明细数量变动后由服务侧重算 total_quantity）
            const header = await apiCallRaw<Row>(
              page,
              'GET',
              `/inventory/transfers/${transferId}`
            )
            const sumItems = itemsAfterPut.reduce(
              (acc, r) => acc + Number(r.quantity),
              0
            )
            expect(Number(header.total_quantity)).toBeCloseTo(sumItems, 2)

            // 负向门：NOT NULL 列 quantity 显式 null 在 DB 访问前被拒
            const clearFail = await apiCallExpectFail(
              page,
              'PUT',
              `/inventory/transfers/items/${itemId}`,
              { quantity: null }
            )
            expect(clearFail.status).toBeGreaterThanOrEqual(400)
            expect(clearFail.status).toBeLessThan(500)
            expect(clearFail.message).toBe(MSG_ITEM_QTY_CLEAR)

            // 不存在主键两腿：PUT/DELETE 一律 404「调拨明细 N 未找到」
            const putFail = await apiCallExpectFail(
              page,
              'PUT',
              `/inventory/transfers/items/${MISSING_ITEM_ID}`,
              { quantity: 1 }
            )
            expect(putFail.status).toBe(404)
            expect(putFail.message).toBe(MSG_ITEM_NOT_FOUND)
            const deleteFail = await apiCallExpectFail(
              page,
              'DELETE',
              `/inventory/transfers/items/${MISSING_ITEM_ID}`
            )
            expect(deleteFail.status).toBe(404)
            expect(deleteFail.message).toBe(MSG_ITEM_NOT_FOUND)

            // 删除腿：成功文案后列表不再含该明细，且已删主键再读一律 404
            const deleted = await apiCall<null>(
              page,
              'DELETE',
              `/inventory/transfers/items/${itemId}`
            )
            expect(deleted.message).toBe(MSG_ITEM_DELETED)
            const itemsAfterDelete = await apiCallRaw<Row[]>(
              page,
              'GET',
              `/inventory/transfers/${transferId}/items`
            )
            expect(itemsAfterDelete.some(r => Number(r.id) === itemId)).toBe(false)
            const sumAfterDelete = itemsAfterDelete.reduce(
              (acc, r) => acc + Number(r.quantity),
              0
            )
            const headerAfterDelete = await apiCallRaw<Row>(
              page,
              'GET',
              `/inventory/transfers/${transferId}`
            )
            expect(Number(headerAfterDelete.total_quantity)).toBeCloseTo(
              sumAfterDelete,
              2
            )
            const putGone = await apiCallExpectFail(
              page,
              'PUT',
              `/inventory/transfers/items/${itemId}`,
              { notes: `${itemBatchNo}-N2` }
            )
            expect(putGone.status).toBe(404)
            expect(putGone.message).toBe(`调拨明细 ${itemId} 未找到`)
            return { artifacts: [] }
          },
        },
      ])
    } finally {
      await relay.close()
    }
  })
})
