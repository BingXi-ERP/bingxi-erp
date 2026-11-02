/**
 * 库位全周期写后回读 × 扫码族契约配对
 *
 * 功能：把九枚「主干有 UI 但 e2e 从未配对」的端点钉进真实读写闭环——
 * 一，库位族（GET 列表/GET 详情/POST/PUT/DELETE /warehouses/locations[/...]）走完整写后回读：
 *    POST 建一条带唯一 location_code marker 的库位，详情与列表按主键回读逐字段自证落库，
 *    PUT 改编码并写入 max_weight 后再读回确认持久化，DELETE 后回读确认 404 且列表不再含该 id；
 * 二，负向门三枚：PUT 对 NOT NULL 列 location_code 显式传 null 被入口拒绝（逐字符比对
 *    backend warehouse_handler.rs:283-286 的外显文案）；不存在 id 走 GET/PUT 断言 404
 *    「库位不存在」（:270、:290），走 DELETE 断言 404「warehouse_location 记录不存在」
 *    （audit_log_service.rs:501-504 以 resource_type "warehouse_location" 拼接）；
 * 三，扫码族（/scanner/scan-inventory、scan-statistics、scan-to-ship 的 GET 与 POST）按
 *    barcode_scanner_handler.rs 的出参形状逐字段断言类型与归属：统计五列均为数值且
 *    total_count 覆盖各分项；scan-to-ship 无 barcode 时返回分页信封（items 数组、
 *    total/page/page_size 数值且回显请求的分页参数）；缺参与条码不存在两类业务拒绝
 *    按源码文案逐字符断言，不接受被脱敏后的通用文案。
 *
 * 调用方：Playwright E2E 套件，由 CI 的 e2e flow 分片按文件哈希收集执行。
 * 入参：BASE_URL 与 API_BASE 取环境变量；admin 角色凭证由 global-setup 写入
 *       e2e/.auth/role-credentials.json（SEED_ROLES 含 admin，permission.rs:586 admin 短路）。
 * 传给谁：会话由 fixtures/relay 的 createRelay 建立（单角色 admin 两棒），请求走 flow/helpers 的
 *       apiCall/apiCallRaw/apiCallExpectFail（内置 CSRF 有界重放与会话同步），唯一标识走 genCode，
 *       不另造登录或请求函数。
 * 存什么：warehouse_locations 表 1 行（创建→更新→删除，终态不留存）；扫码族全部走只读与
 *       业务拒绝腿，不写库存事实。
 * 存哪里：warehouse_locations 业务表（backend warehouse_handler create/update/delete）；
 *       扫码统计与出库读的是 inventory_piece 既有事实。
 *
 * 【scan-inventory 成功面未覆盖的如实声明】
 * scan-inventory 成功出参按 barcode 命中 inventory_piece 行（handler :134-144 出 barcode/piece_no/
 * status 等业务列），本环境无确定性种子能造出带条码的在册布卷（seedDyedPieceChain 依赖染色委外
 * 全链，代价与脆性不成比例），故成功面以两条确定性业务拒绝腿替代形状断言：缺 barcode 参数
 * 断言「缺少 barcode 参数」（handler :125），未知条码断言 404「未找到该条码对应的布卷」（:131）。
 * 成功形状断言留待带条码种子链路就绪时补腿。
 *
 * 【断言判据与后端口径出处】
 * 出参键 = models/location.rs Model 字段名（serde 直出 snake_case：id/warehouse_id/location_code/
 * location_type/max_weight/max_height/is_batch_managed/is_color_managed/created_at/updated_at）；
 * 列表为 PaginatedResponse{items,total,page,page_size}（warehouse_handler.rs:211-217），
 * 分页入参键 page/page_size，warehouse_id 为过滤列（:201）；
 * max_weight 为 Decimal，编码形态（数值或字符串）不可预判，统一 Number() 归一后逐值判；
 * scan-to-ship GET 无 barcode 时返回 items=[] 的空分页信封且 page_size clamp(1,100)
 * （barcode_scanner_handler.rs:60-70）；缺 order_id 走 validation_displayable
 * 「扫码发货缺少 order_id 参数」（:73-76）；POST 与 GET 同走 scan_to_ship_impl，未知条码
 * not_found「未找到该条码对应的布卷」（:95-97）。
 * 扫码统计五列 available_count/shipped_count/defect_count/reserved_count/total_count
 * 由 COUNT FILTER 聚合出（:243-288），total_count 为全表计数，故各分项必不大于合计。
 */
import { test, expect } from '../diagnose-fixture'
import { apiCall, apiCallExpectFail, apiCallRaw, genCode } from './helpers'
import { createRelay } from '../fixtures/relay'

type Row = Record<string, unknown>

/** 主键大数负例：落在 i32 域内、业务上不可能存在的库位 id */
const MISSING_LOCATION_ID = 912345678
/** 必不存在的条码：带 E2E 前缀的非法条码字面量，用于扫码族的业务拒绝腿 */
const E2E_BARCODE = 'E2E-NO-SUCH-BARCODE-217'
/** 以下文案与 backend 源码字符串逐字符同源（warehouse_handler.rs / audit_log_service.rs / barcode_scanner_handler.rs） */
const MSG_LOCATION_NOT_FOUND = '库位不存在'
const MSG_LOCATION_CODE_CLEAR = '库位编码不能清空：该字段为必填项'
const MSG_DELETE_NOT_FOUND = 'warehouse_location 记录不存在'
const MSG_BARCODE_PARAM_MISSING = '缺少 barcode 参数'
const MSG_BARCODE_NOT_FOUND = '未找到该条码对应的布卷'
const MSG_ORDER_ID_MISSING = '扫码发货缺少 order_id 参数'

test.describe.serial('库位全周期写后回读与扫码族契约配对', () => {
  test('库位增改删逐字段回读且非法输入与不存在主键按 404/4xx 拒绝，扫码族出参形状与业务拒绝逐字符命中', async ({
    browser,
  }) => {
    const relay = await createRelay(browser)
    try {
      await relay.runSteps([
        {
          role: 'admin',
          label: '库位 POST→读回→PUT→读回→DELETE→读回 与负向门',
          run: async ({ session }) => {
            const page = session.page

            // 前置：取一个真实仓库作为外键归属，列表非空否则环境异常显式判红
            const whRes = await apiCallRaw<{ items: Row[] }>(
              page,
              'GET',
              '/warehouses?page=1&page_size=50'
            )
            expect(Array.isArray(whRes.items)).toBe(true)
            expect(whRes.items.length).toBeGreaterThan(0)
            const warehouseId = Number(whRes.items[0].id)
            expect(Number.isInteger(warehouseId) && warehouseId > 0).toBe(true)

            const marker = genCode('E2E-LOC')
            const created = await apiCall<Row>(page, 'POST', '/warehouses/locations', {
              warehouse_id: warehouseId,
              location_code: marker,
              location_type: 'e2e',
            })
            expect(created.message).toBe('库位创建成功')
            const locationId = Number(created.data.id)
            expect(Number.isInteger(locationId) && locationId > 0).toBe(true)
            expect(created.data.location_code).toBe(marker)
            expect(Number(created.data.warehouse_id)).toBe(warehouseId)
            expect(created.data.location_type).toBe('e2e')

            // 详情回读：字段逐字符等于写入值，时间戳为字符串
            const detail = await apiCallRaw<Row>(
              page,
              'GET',
              `/warehouses/locations/${locationId}`
            )
            expect(detail.location_code).toBe(marker)
            expect(detail.location_type).toBe('e2e')
            expect(Number(detail.id)).toBe(locationId)
            expect(Number(detail.warehouse_id)).toBe(warehouseId)
            expect(typeof detail.created_at).toBe('string')
            expect(typeof detail.updated_at).toBe('string')

            // 列表回读：分页信封四键类型正确，按 warehouse_id 过滤后含该主键且编码一致
            const list = await apiCallRaw<{
              items: Row[]
              total: number
              page: number
              page_size: number
            }>(
              page,
              'GET',
              `/warehouses/locations?warehouse_id=${warehouseId}&page=1&page_size=200`
            )
            expect(Array.isArray(list.items)).toBe(true)
            expect(typeof list.total).toBe('number')
            expect(list.page).toBe(1)
            expect(list.page_size).toBe(200)
            const listed = list.items.find(r => Number(r.id) === locationId)
            if (!listed) {
              throw new Error(
                `[217] 列表回读缺失库位 id=${locationId}（warehouse_id=${warehouseId} 过滤下共 ${list.items.length} 行）`
              )
            }
            expect(listed.location_code).toBe(marker)

            // 更新腿：改编码 + 写入 max_weight，返回体与独立读回双重确认持久化
            const updatedCode = `${marker}-U`
            const updated = await apiCall<Row>(
              page,
              'PUT',
              `/warehouses/locations/${locationId}`,
              { location_code: updatedCode, max_weight: 1234.56 }
            )
            expect(updated.message).toBe('库位更新成功')
            expect(updated.data.location_code).toBe(updatedCode)
            const reread = await apiCallRaw<Row>(
              page,
              'GET',
              `/warehouses/locations/${locationId}`
            )
            expect(reread.location_code).toBe(updatedCode)
            expect(Number(reread.max_weight)).toBeCloseTo(1234.56, 2)

            // 负向门一：NOT NULL 列 location_code 显式 null 在入口被业务拒绝，文案逐字符同源
            const clearFail = await apiCallExpectFail(
              page,
              'PUT',
              `/warehouses/locations/${locationId}`,
              { location_code: null }
            )
            expect(clearFail.status).toBeGreaterThanOrEqual(400)
            expect(clearFail.status).toBeLessThan(500)
            expect(clearFail.message).toBe(MSG_LOCATION_CODE_CLEAR)

            // 负向门二/三/四：不存在主键走 GET/PUT/DELETE 一律 404，绝不接受 200
            const getFail = await apiCallExpectFail(
              page,
              'GET',
              `/warehouses/locations/${MISSING_LOCATION_ID}`
            )
            expect(getFail.status).toBe(404)
            expect(getFail.message).toBe(MSG_LOCATION_NOT_FOUND)
            const putFail = await apiCallExpectFail(
              page,
              'PUT',
              `/warehouses/locations/${MISSING_LOCATION_ID}`,
              { location_code: genCode('E2E-LOCX') }
            )
            expect(putFail.status).toBe(404)
            expect(putFail.message).toBe(MSG_LOCATION_NOT_FOUND)
            const deleteFail = await apiCallExpectFail(
              page,
              'DELETE',
              `/warehouses/locations/${MISSING_LOCATION_ID}`
            )
            expect(deleteFail.status).toBe(404)
            expect(deleteFail.message).toBe(MSG_DELETE_NOT_FOUND)

            // 删除腿：成功文案断言后，详情 404 且列表不再含该 id（不可见性双确认）
            const deleted = await apiCall<null>(
              page,
              'DELETE',
              `/warehouses/locations/${locationId}`
            )
            expect(deleted.message).toBe('库位删除成功')
            const afterDelete = await apiCallExpectFail(
              page,
              'GET',
              `/warehouses/locations/${locationId}`
            )
            expect(afterDelete.status).toBe(404)
            expect(afterDelete.message).toBe(MSG_LOCATION_NOT_FOUND)
            const listAfter = await apiCallRaw<{ items: Row[] }>(
              page,
              'GET',
              `/warehouses/locations?warehouse_id=${warehouseId}&page=1&page_size=200`
            )
            expect(
              listAfter.items.some(r => Number(r.id) === locationId)
            ).toBe(false)
          },
        },
        {
          role: 'admin',
          label: '扫码族出参形状与业务拒绝',
          run: async ({ session }) => {
            const page = session.page

            // scan-statistics：五列均数值，total_count 为非负整数且覆盖各分项（归属关系）
            const stats = await apiCallRaw<Row>(page, 'GET', '/scanner/scan-statistics')
            const parts = [
              stats.available_count,
              stats.shipped_count,
              stats.defect_count,
              stats.reserved_count,
            ]
            for (const v of parts) {
              expect(typeof v).toBe('number')
            }
            expect(typeof stats.total_count).toBe('number')
            expect(stats.total_count).toBeGreaterThanOrEqual(0)
            for (const v of parts) {
              expect(stats.total_count).toBeGreaterThanOrEqual(v)
            }

            // scan-to-ship GET 无 barcode：空分页信封形状 + 回显请求的分页参数
            const shipList = await apiCallRaw<{
              items: unknown[]
              total: number
              page: number
              page_size: number
            }>(page, 'GET', '/scanner/scan-to-ship?page=2&page_size=10')
            expect(Array.isArray(shipList.items)).toBe(true)
            expect(typeof shipList.total).toBe('number')
            expect(shipList.page).toBe(2)
            expect(shipList.page_size).toBe(10)

            // scan-to-ship GET 带 barcode 缺 order_id：业务拒绝，文案与 :73-76 逐字符同源
            const shipNoOrder = await apiCallExpectFail(
              page,
              'GET',
              `/scanner/scan-to-ship?barcode=${E2E_BARCODE}`
            )
            expect(shipNoOrder.status).toBe(400)
            expect(shipNoOrder.message).toBe(MSG_ORDER_ID_MISSING)

            // scan-to-ship GET 带 barcode+order_id：未知条码 404「未找到该条码对应的布卷」
            const shipMissing = await apiCallExpectFail(
              page,
              'GET',
              `/scanner/scan-to-ship?barcode=${E2E_BARCODE}&order_id=1`
            )
            expect(shipMissing.status).toBe(404)
            expect(shipMissing.message).toBe(MSG_BARCODE_NOT_FOUND)

            // scan-inventory 缺 barcode 参数与未知条码两腿（成功面缺口见文件头声明）
            const invNoParam = await apiCallExpectFail(
              page,
              'GET',
              '/scanner/scan-inventory'
            )
            expect(invNoParam.status).toBe(400)
            expect(invNoParam.message).toBe(MSG_BARCODE_PARAM_MISSING)
            const invMissing = await apiCallExpectFail(
              page,
              'GET',
              `/scanner/scan-inventory?barcode=${E2E_BARCODE}`
            )
            expect(invMissing.status).toBe(404)
            expect(invMissing.message).toBe(MSG_BARCODE_NOT_FOUND)

            // POST scan-to-ship 非法前置（未知条码）：按业务规则拒绝，同一文案同源，绝不 200
            const postFail = await apiCallExpectFail(
              page,
              'POST',
              '/scanner/scan-to-ship',
              { barcode: E2E_BARCODE, order_id: 1 }
            )
            expect(postFail.status).toBe(404)
            expect(postFail.message).toBe(MSG_BARCODE_NOT_FOUND)
          },
        },
      ])
    } finally {
      await relay.close()
    }
  })
})
