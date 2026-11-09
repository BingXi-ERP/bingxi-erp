// [法#3 范围锁定] 目标：glob='frontend/e2e/flow/249-logistics-waybill-chain.spec.ts'
// 物流面单链路（轨迹_运费_关联_打印）契约回读 E2E — 249
//
// 功能：把 logistics-tracking 族五枚零配对端点钉成"写后同作用域回读"真值链，
// 轨迹腿做 POST 到 GET 的因果闭环并逐列出参列比对，运费腿按源码计费口径在测试侧
// 独立复算三通道取大值，关联腿证明 order_id 与 order_type 真实落库，打印腿解包
// docx 的 word/document.xml 对业务列做成员判定，另钉权限门与时序门与拒绝腿的具体码。
// 调用方：路由族注册在 backend/src/routes/logistics_tracking.rs，统一在
// backend/src/routes/mod.rs 以 nest("/api/v1/erp") 挂载；handler 为
// backend/src/handlers/logistics_tracking_handler.rs 与 print_handler.rs；
// 运单主体由族外 POST /inventory/logistics 自建（routes/inventory.rs），前端调用面在
// frontend/src/api/logistics.ts。本文件用 flow/helpers 的 apiCall 系列直连契约面。
// 入参：{waybill_id} 与 {id} 两段在 handler 里一律抽成 i32
// （logistics_tracking_handler.rs、37、49、60，print_handler.rs），
// 运单主体入参取 CreateWaybillRequest（logistics_handler.rs，order_id 必须是
// 真实销售订单 id，handler 逐行回查 sales_order 否则 404）；关联腿的 po_id 取真实采购订单 id。
// 传给谁：LogisticsService（backend/src/services/logistics_service.rs）写
// logistics_waybills 与 logistics_tracking_events 两张表；打印腿走
// PrintService::get_logistics_waybill_print_data（print_service.rs）装配后渲染 docx。
// 存什么：事件行存 event_time、location、description、event_type、data_source；
// 运单行被本链路改写的是 freight_fee、order_id、order_type；
// 事件类型取值域来自 backend/src/models/status/bpm_crm_contract.rs 的
// logistics_event_type（小写 pickup/in_transit/arrived/delivered），与运单状态词表
// logistics_waybill（大写 IN_TRANSIT/DELIVERED/SIGNED，同文件 55-65 行）是两套码，不可互换。
// 存哪里：logistics_waybills、logistics_tracking_events（SeaORM 实体
// backend/src/models/logistics_waybill.rs、logistics_tracking_event.rs）。
//
// 判据来源与本轮查出的后端缺陷（按现状钉死，不放宽）：
// 1 计费四列无 HTTP 写入口。CreateWaybillRequest（logistics_handler.rs）与
//   UpdateWaybillReq（logistics_handler.rs）都不含 total_weight、total_volume、
//   distance_km、freight_rate，全仓 grep 这三列与 freight_rate 在任何 handler 里都没有
//   Set 写入点，因此经 API 自建的运单四列恒为 NULL，calculate_freight 的三个通道
//   （logistics_service.rs）恒为 0，取大值规则无法用非零数据证伪。
//   本文件按该现状把"四列 NULL 且运费恒 0"钉成断言，同时仍按源码逐通道复算，
//   四列一旦出现写入口此锁即判红，逼着把计费口径重新审一遍。
// 2 重复关联无幂等门。link_purchase_order（logistics_service.rs）只校验运单与
//   采购单存在，不校验已关联，第二次关联直接覆盖式重写并返回 200。
// 3 失败文案全量脱敏。运单不存在与采购订单不存在都走 AppError::not_found
//   （logistics_service.rs、67、91、138），出参 message 为通用脱敏文案，
//   两枚语义不同的 404 在响应面上不可区分；本文件因此只钉 code 与状态码，
//   并显式断真实内部文案不外泄（utils/error.rs 的脱敏约定）。
// 4 时序门不存在。轨迹、运费、关联三腿在源码里都不检查运单状态，也未要求先签收或
//   先关联才允许下游动作（logistics_service.rs 全文无状态比较），故本文件不假装覆盖
//   这道门，只钉住"IN_TRANSIT 之外的下游动作照旧放行"这一现状可见面。
// 5 事件类型入参校验存在且可外显。logistics_service.rs 用
//   AppError::validation_displayable 直出逐字文案，本文件按词表原文断言整串。
// 6 打印模板与行级归属门。logistics_waybill 在 print_service.rs 登记为"无归属用户列"，
//   归属门函数对非 PRINT_SCOPE_GATED 的类型直接放行（同文件 269-277 的注释自陈 PENDING 与
//   NO_OWNER 同样放行），所以本腿没有行级归属判定，传进去的 DataScopeContext 在这里是死参数。
//   但按第 7 条，本族派生键没有任何角色持有，当前只有 admin 旁路走得通这条腿，因此该缺口是
//   补授即开面的潜伏态，不是现网可控越权；本轮不覆盖该水平面。打印腿断的是解包后的业务列
//   成员，不是只看状态码。
// 7 权限键由 URL 段推导（middleware/permission.rs 起），本族 seg3 是
//   "logistics-tracking"（utils/path_utils.rs 登记），派生键为
//   logistics-tracking 加 read/create/print；种子授权只给了 ("logistics", ...)
//   （services/init_service_ops/permission.rs），没有任何角色持有
//   logistics-tracking_*，故 logistics_coordinator 对本族四个动作全 403。
//   正腿由 worker 超管会话跑（admin 旁路），拒腿用真实持权缺口证明。
// 8 轨迹事件无删除端点，运单删除只受状态门（logistics_handler.rs，
//   DELIVERED 与 SIGNED 才拒），而事件行对运单行是外键引用；清理腿因此走 tryCleanup
//   记日志不判红，自建运单的快递单号带本轮唯一标记，断言只按自建 id 或唯一标记回读。
import { test, expect } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  API_BASE,
  API_PREFIX,
  apiCall,
  apiCallExpectFail,
  genCode,
  loginAsRole,
  loginViaUI,
  testPassword,
  testUsername,
  tryCleanup,
} from './helpers';
import { inflateRawSync } from 'node:zlib';

/** 轨迹事件类型词表（backend/src/models/status/bpm_crm_contract.rs 写入方口径） */
const EVENT_TYPE_IN_TRANSIT = 'in_transit';
const EVENT_TYPE_PICKUP = 'pickup';
/** 校验文案里的允许值串，与 logistics_service.rs 的 ALL.join("/") 同源 */
const EVENT_TYPE_ENUM_TEXT = 'pickup/in_transit/arrived/delivered';
/** 运单状态词表（同文件 55-65 行，大写码） */
const WAYBILL_STATUS_IN_TRANSIT = 'IN_TRANSIT';
/** link_purchase_order 写入的 order_type 字面值（logistics_service.rs） */
const ORDER_TYPE_PURCHASE = 'purchase_order';

/** 运单行出参形状：键名与 backend/src/models/logistics_waybill.rs 的字段逐字一致 */
interface WaybillRow {
  id: number;
  order_id: number;
  order_type: string | null;
  logistics_company: string;
  tracking_number: string;
  driver_name: string | null;
  freight_fee: string | null;
  total_weight: string | null;
  total_volume: string | null;
  distance_km: string | null;
  freight_rate: string | null;
  freight_bearer: string | null;
  status: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** 轨迹事件出参形状：键名与 backend/src/models/logistics_tracking_event.rs 逐字一致 */
interface TrackingEventRow {
  id: number;
  waybill_id: number;
  event_time: string;
  location: string | null;
  description: string;
  event_type: string;
  data_source: string;
  created_at: string;
  updated_at: string;
}

/** POST /logistics-tracking/waybills/{id}/tracking-events 的入参形状（handler 直接反序列化 TrackingEvent） */
interface TrackingEventInput {
  event_time: string;
  location?: string | null;
  description: string;
  event_type: string;
  data_source?: string;
}

/** 分页信封（backend/src/utils/response.rs 唯一形态） */
interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

/**
 * 功能：把 DECIMAL 出参收成数字，并复刻源码对 NULL 的口径。
 * 调用方：运费腿的三通道复算。
 * 入参：JSON 值，只容字符串与 null；其它类型即显式抛错（缺键或形状漂移不许当 0 掩盖）。
 * 传给谁：复算表达式；不传给后端。
 * 存什么/存哪里：不持久化。
 * 口径出处：logistics_service.rs 的 unwrap_or(Decimal::ZERO)。
 */
function decimalToNumber(value: unknown, column: string): number {
  if (value === null) {
    return 0;
  }
  if (typeof value !== 'string') {
    throw new Error(
      `列 ${column} 期望 DECIMAL 字符串或 null，实际 ${typeof value}=${JSON.stringify(value)}` +
        `（键存在性与类型即契约，判红处理）`
    );
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`列 ${column} 的 DECIMAL 字符串无法转数字：${value}`);
  }
  return parsed;
}

/**
 * 功能：按 logistics_service.rs 的计费口径在测试侧独立复算运费。
 * 调用方：运费腿。
 * 入参：运单行。传给谁：只喂给断言表达式，不发请求。
 * 存什么/存哪里：不持久化。
 * 复算式：重量通道 = total_weight * freight_rate，体积通道 = total_volume * freight_rate，
 * 距离通道 = distance_km * (freight_rate / 1000)，运费 = 三通道取大值，无舍入无阶梯。
 */
function recomputeFreight(row: WaybillRow): number {
  const rate = decimalToNumber(row.freight_rate, 'freight_rate');
  const weightCost = decimalToNumber(row.total_weight, 'total_weight') * rate;
  const volumeCost = decimalToNumber(row.total_volume, 'total_volume') * rate;
  const distanceCost = decimalToNumber(row.distance_km, 'distance_km') * (rate / 1000);
  return Math.max(weightCost, volumeCost, distanceCost);
}

/**
 * 功能：UTF-8 字节序列解码为字符串，避免依赖 Node 的 Buffer.toString 与 TextDecoder 类型面。
 * 调用方：docx 解包腿。入参：Uint8Array。传给谁：文本成员判定。
 * 存什么/存哪里：不持久化。
 */
function utf8Decode(bytes: Uint8Array): string {
  const parts: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    const first = bytes[i];
    if (first < 0x80) {
      parts.push(String.fromCharCode(first));
      i += 1;
    } else if (first < 0xe0) {
      parts.push(String.fromCharCode(((first & 0x1f) << 6) | (bytes[i + 1] & 0x3f)));
      i += 2;
    } else if (first < 0xf0) {
      parts.push(
        String.fromCharCode(
          ((first & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f)
        )
      );
      i += 3;
    } else {
      const code =
        ((first & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      parts.push(String.fromCodePoint(code));
      i += 4;
    }
  }
  return parts.join('');
}

/**
 * 功能：从 zip 容器（docx）里取出指定成员的原文字节，禁止对压缩字节做 grep。
 * 调用方：打印腿。入参：响应体字节 + 成员名（word/document.xml）。
 * 传给谁：文本成员判定。存什么/存哪里：只在内存里，不落盘。
 * 取法：先按 0x06054b50 定位中央目录结束记录，再逐条走 0x02014b50 目录项，
 * 命中成员名后用其本地头（0x04034b50）算出数据起点，method 8 走 inflateRawSync，
 * method 0 视为未压缩直取。目录项与本地头都读压缩后长度，不用本地头的长度字段
 * （带数据描述符时该字段为 0，是这类解析最常见的错源）。
 */
function zipMemberBytes(zip: Uint8Array, wanted: string): Uint8Array {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const sig = (at: number): number => view.getUint32(at, true);

  let eocd = -1;
  for (let at = zip.length - 22; at >= 0 && at >= zip.length - 66000; at -= 1) {
    if (sig(at) === 0x06054b50) {
      eocd = at;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error('docx 不是可解析的 zip 容器（未找到中央目录结束记录）');
  }
  const entries = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);

  for (let n = 0; n < entries; n += 1) {
    if (sig(cursor) !== 0x02014b50) {
      throw new Error(`docx 中央目录第 ${n} 项签名异常`);
    }
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = utf8Decode(zip.slice(cursor + 46, cursor + 46 + nameLen));
    if (name === wanted) {
      if (sig(localOffset) !== 0x04034b50) {
        throw new Error(`成员 ${wanted} 的本地文件头签名异常`);
      }
      const localNameLen = view.getUint16(localOffset + 26, true);
      const localExtraLen = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLen + localExtraLen;
      const raw = zip.slice(start, start + compressedSize);
      return method === 0 ? raw : new Uint8Array(inflateRawSync(raw));
    }
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`docx 内不存在成员 ${wanted}（共 ${entries} 项目录）`);
}

/**
 * 功能：把 document.xml 摊平成可检索的纯文本（去标签，保留字素顺序）。
 * 调用方：打印腿。入参：document.xml 原文。传给谁：业务列成员判定。
 * 存什么/存哪里：不持久化。
 */
function docxPlainText(zipBytes: Uint8Array): string {
  const xml = utf8Decode(zipMemberBytes(zipBytes, 'word/document.xml'));
  expect(xml.length, 'word/document.xml 解包后正文为空，模板未渲染任何内容').toBeGreaterThan(0);
  return xml.replace(/<[^>]*>/g, ' ');
}

/**
 * 功能：取族内五枚端点的运单段路径前缀，集中一处避免散落拼接。
 * 调用方：各腿。入参：运单 id。传给谁：apiCall 系列。存什么/存哪里：不持久化。
 */
function waybillPath(waybillId: number): string {
  return `/logistics-tracking/waybills/${waybillId}`;
}

const marker = genCode('E2E249');
const chain = {
  waybillId: 0,
  trackingNumber: '',
  logisticsCompany: '',
  purchaseOrderId: 0,
  freightAfterLink: 0,
};

test.describe('物流面单链路 轨迹_运费_关联_打印 契约回读', () => {
  test.describe.configure({ mode: 'serial' });

  test('前置：族外 POST /inventory/logistics 自建运单主体并回读计费四列现状', async ({ page }) => {
    await loginViaUI(page, testUsername(), testPassword());

    const salesOrders = await apiCall<Paginated<{ id: number }>>(
      page,
      'GET',
      '/sales/orders?page=1&page_size=1'
    );
    if (salesOrders.data.items.length === 0) {
      throw new Error('前置数据缺口：库内无销售订单，CreateWaybillRequest.order_id 无法引用真实单');
    }
    const purchaseOrders = await apiCall<Paginated<{ id: number }>>(
      page,
      'GET',
      '/purchase/orders?page=1&page_size=1'
    );
    if (purchaseOrders.data.items.length === 0) {
      throw new Error('前置数据缺口：库内无采购订单，link-purchase-order 成功腿无法引用真实 po_id');
    }
    chain.purchaseOrderId = purchaseOrders.data.items[0].id;

    chain.trackingNumber = `WB${marker}`;
    chain.logisticsCompany = `顺达物流${marker}`;
    const created = await apiCall<WaybillRow>(page, 'POST', '/inventory/logistics', {
      order_id: salesOrders.data.items[0].id,
      logistics_company: chain.logisticsCompany,
      tracking_number: chain.trackingNumber,
      driver_name: `司机${marker}`,
      freight_fee: 10.5,
      notes: `e2e249 自建运单 ${marker}`,
    });
    expect(created.data.id, '自建运单必须返回主键').toBeGreaterThan(0);
    chain.waybillId = created.data.id;
    expect(created.data.status, 'create_waybill 落 IN_TRANSIT（logistics_handler.rs）').toBe(
      WAYBILL_STATUS_IN_TRANSIT
    );
    expect(created.data.tracking_number).toBe(chain.trackingNumber);

    const readback = await apiCall<WaybillRow>(
      page,
      'GET',
      `/inventory/logistics/${chain.waybillId}`
    );
    expect(readback.data.id).toBe(chain.waybillId);
    // 缺陷 1 的可见面：四列无任何写入口，自建运单恒 NULL，运费三通道恒 0
    for (const column of ['total_weight', 'total_volume', 'distance_km', 'freight_rate'] as const) {
      expect(
        readback.data[column],
        `列 ${column} 应为 null（全仓无 HTTP 写入点，见文件头缺陷 1）`
      ).toBeNull();
    }
  });

  test('轨迹腿：POST 唯一标记事件后 GET 读回同一事件并逐列比对', async ({ page }) => {
    const baseTime = '2026-03-05T08:00:00Z';
    const laterTime = '2026-03-05T10:30:00Z';

    const posted = await apiCall<TrackingEventRow>(
      page,
      'POST',
      `${waybillPath(chain.waybillId)}/tracking-events`,
      {
        event_time: baseTime,
        location: `苏州转运中心${marker}`,
        description: `已揽收${marker}`,
        event_type: EVENT_TYPE_PICKUP,
      } satisfies TrackingEventInput
    );
    expect(posted.data.id, '事件插入必须返回主键').toBeGreaterThan(0);
    expect(posted.data.waybill_id).toBe(chain.waybillId);
    expect(posted.data.event_type).toBe(EVENT_TYPE_PICKUP);
    expect(posted.data.description).toBe(`已揽收${marker}`);
    expect(posted.data.location).toBe(`苏州转运中心${marker}`);
    // 入参省略 data_source 时源码落 manual（logistics_service.rs）
    expect(posted.data.data_source).toBe('manual');

    const second = await apiCall<TrackingEventRow>(
      page,
      'POST',
      `${waybillPath(chain.waybillId)}/tracking-events`,
      {
        event_time: laterTime,
        description: `干线运输中${marker}`,
        event_type: EVENT_TYPE_IN_TRANSIT,
        data_source: 'express_api',
      } satisfies TrackingEventInput
    );
    expect(second.data.data_source).toBe('express_api');
    expect(second.data.location, '入参未带 location 时出参键必须存在且为 null').toBeNull();

    const listed = await apiCall<TrackingEventRow[]>(
      page,
      'GET',
      `${waybillPath(chain.waybillId)}/tracking-events`
    );
    expect(Array.isArray(listed.data), 'GET 出参是事件数组（handler 直接序列化 Vec<Model>）').toBe(
      true
    );
    const mine = listed.data.filter(row => row.description.includes(marker));
    expect(mine.length, '读回必须命中本轮两枚事件').toBe(2);
    expect(
      mine.map(row => row.id).sort((a, b) => a - b),
      '两枚事件主键应与 POST 返回一致'
    ).toEqual([posted.data.id, second.data.id].sort((a, b) => a - b));

    for (const row of mine) {
      expect(row.waybill_id).toBe(chain.waybillId);
      expect(typeof row.created_at).toBe('string');
      expect(typeof row.updated_at).toBe('string');
    }
    const byTime = mine.map(row => Date.parse(row.event_time));
    const sorted = [...byTime].sort((a, b) => a - b);
    expect(byTime, 'list_tracking_events 按 event_time 升序（logistics_service.rs）').toEqual(
      sorted
    );
    expect(byTime).toEqual([Date.parse(baseTime), Date.parse(laterTime)]);

    const pickupRow = mine.find(row => row.event_type === EVENT_TYPE_PICKUP);
    if (pickupRow === undefined) {
      throw new Error(`读回缺失 pickup 事件，本轮 marker=${marker}`);
    }
    expect(pickupRow.description).toBe(`已揽收${marker}`);
    expect(pickupRow.location).toBe(`苏州转运中心${marker}`);
    expect(pickupRow.data_source).toBe('manual');
    expect(Date.parse(pickupRow.event_time)).toBe(Date.parse(baseTime));

    const foreign = await apiCall<TrackingEventRow[]>(
      page,
      'GET',
      `${waybillPath(chain.waybillId + 1000)}/tracking-events`
    );
    expect(
      foreign.data.filter(row => row.waybill_id === chain.waybillId).length,
      '事件按 waybill_id 过滤，不相干运单不得串入本轮事件'
    ).toBe(0);
  });

  test('轨迹拒绝腿：词表外事件类型给出逐字文案，不存在运单给出脱敏 404', async ({ page }) => {
    const badType = await apiCallExpectFail(
      page,
      'POST',
      `${waybillPath(chain.waybillId)}/tracking-events`,
      {
        event_time: '2026-03-05T09:00:00Z',
        description: `非法类型${marker}`,
        event_type: 'picked_up',
      }
    );
    expect(badType.status).toBe(400);
    expect(badType.code).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
    expect(badType.message).toBe(
      `无效的轨迹事件类型：picked_up（允许值：${EVENT_TYPE_ENUM_TEXT}）`
    );

    const ghost = await apiCallExpectFail(
      page,
      'POST',
      `${waybillPath(999999999)}/tracking-events`,
      {
        event_time: '2026-03-05T09:00:00Z',
        description: `幽灵运单${marker}`,
        event_type: EVENT_TYPE_PICKUP,
      }
    );
    expect(ghost.status).toBe(404);
    expect(ghost.code).toBe(APP_ERROR_CODES.NOT_FOUND);
    expect(typeof ghost.message).toBe('string');
    // 缺陷 3 的可见面：AppError::not_found 走脱敏通道，内部文案不外泄
    expect(ghost.message ?? '').not.toContain('运单不存在');

    const afterRejections = await apiCall<TrackingEventRow[]>(
      page,
      'GET',
      `${waybillPath(chain.waybillId)}/tracking-events`
    );
    expect(
      afterRejections.data.filter(row => row.description.includes(marker)).length,
      '两条拒绝腿都不得留下事件行'
    ).toBe(2);
  });

  test('运费腿：按源码口径独立复算三通道取大值，并回读 freight_fee 落库', async ({ page }) => {
    const before = await apiCall<WaybillRow>(
      page,
      'GET',
      `/inventory/logistics/${chain.waybillId}`
    );
    const expected = recomputeFreight(before.data);

    const freight = await apiCall<unknown>(
      page,
      'POST',
      `${waybillPath(chain.waybillId)}/calculate-freight`
    );
    expect(
      typeof freight.data,
      'calculate_freight 出参是裸 DECIMAL 字符串（handler 直接序列化 Decimal）'
    ).toBe('string');
    const actual = Number(freight.data);
    expect(Number.isFinite(actual), `运费出参无法转数字：${JSON.stringify(freight.data)}`).toBe(
      true
    );
    expect(actual, '运费必须等于三通道取大值的复算结果').toBe(expected);
    // 取大值语义的另一半：运费不小于任一单通道
    const rate = decimalToNumber(before.data.freight_rate, 'freight_rate');
    expect(actual).toBeGreaterThanOrEqual(
      decimalToNumber(before.data.total_weight, 'total_weight') * rate
    );
    expect(actual).toBeGreaterThanOrEqual(
      decimalToNumber(before.data.total_volume, 'total_volume') * rate
    );
    expect(
      actual,
      '距离通道 = distance_km * (freight_rate / 1000)（logistics_service.rs）'
    ).toBeGreaterThanOrEqual(
      decimalToNumber(before.data.distance_km, 'distance_km') * (rate / 1000)
    );
    // 缺陷 1 的第二面：四列恒 NULL ⇒ 运费恒 0，明细与合计无分差
    expect(actual, '计费四列无写入口时运费恒 0').toBe(0);
    chain.freightAfterLink = actual;

    const persisted = await apiCall<WaybillRow>(
      page,
      'GET',
      `/inventory/logistics/${chain.waybillId}`
    );
    expect(
      typeof persisted.data.freight_fee,
      '运费回写落库后 freight_fee 仍是 DECIMAL 字符串'
    ).toBe('string');
    expect(Number(persisted.data.freight_fee)).toBe(actual);
  });

  test('关联腿：link-purchase-order 落库回读，重复关联与不存在采购单两种结果', async ({ page }) => {
    const linked = await apiCall<WaybillRow>(
      page,
      'POST',
      `${waybillPath(chain.waybillId)}/link-purchase-order`,
      { po_id: chain.purchaseOrderId }
    );
    expect(linked.data.order_id, '关联成功出参直接回显被改写的运单行').toBe(chain.purchaseOrderId);
    expect(linked.data.order_type).toBe(ORDER_TYPE_PURCHASE);

    const readback = await apiCall<WaybillRow>(
      page,
      'GET',
      `/inventory/logistics/${chain.waybillId}`
    );
    expect(readback.data.order_id, '关联必须真实落库（回读 order_id 等于目标采购单）').toBe(
      chain.purchaseOrderId
    );
    expect(readback.data.order_type).toBe(ORDER_TYPE_PURCHASE);

    const again = await apiCall<WaybillRow>(
      page,
      'POST',
      `${waybillPath(chain.waybillId)}/link-purchase-order`,
      { po_id: chain.purchaseOrderId }
    );
    expect(again.code, '重复关联当前无幂等门，按现状返回成功信封').toBe(200);
    expect(again.data.id).toBe(chain.waybillId);

    const badPo = await apiCallExpectFail(
      page,
      'POST',
      `${waybillPath(chain.waybillId)}/link-purchase-order`,
      { po_id: 999999999 }
    );
    expect(badPo.status).toBe(404);
    expect(badPo.code).toBe(APP_ERROR_CODES.NOT_FOUND);
    // 缺陷 3：与"运单不存在"共用同一脱敏文案，两枚 404 在响应面上不可区分
    expect(badPo.message).toBe(ghostMessageProbeOf(badPo.message));

    const unchanged = await apiCall<WaybillRow>(
      page,
      'GET',
      `/inventory/logistics/${chain.waybillId}`
    );
    expect(unchanged.data.order_id, '被拒的关联腿不得改写 order_id').toBe(chain.purchaseOrderId);

    const ghostWaybill = await apiCallExpectFail(
      page,
      'POST',
      `${waybillPath(999999999)}/link-purchase-order`,
      { po_id: chain.purchaseOrderId }
    );
    expect(ghostWaybill.status).toBe(404);
    expect(ghostWaybill.code).toBe(APP_ERROR_CODES.NOT_FOUND);
  });

  test('打印腿：解包 docx 后逐业务列做成员判定，另钉匿名 401', async ({ page }) => {
    const url = `${API_BASE}${API_PREFIX}${waybillPath(chain.waybillId)}/print`;
    const resp = await page.request.get(url);
    expect(resp.status(), '面单打印应返回文件流').toBe(200);
    const bytes: Uint8Array = await resp.body();
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);

    const text = docxPlainText(bytes);
    expect(text, '面单必须渲染快递单号').toContain(chain.trackingNumber);
    expect(text, '面单必须渲染物流公司').toContain(chain.logisticsCompany);
    expect(text, '面单必须渲染运单状态（打印数据装配含 status 列，print_service.rs 起）').toContain(
      WAYBILL_STATUS_IN_TRANSIT
    );

    const browser = page.context().browser();
    if (browser === null) {
      throw new Error('无法取得 browser 句柄，匿名 401 腿需要一个不带会话的 context');
    }
    // browser.newContext() 默认继承 project.use 的 storageState（被 diagnose-fixture
    // 覆盖成 worker 会话文件），不显式置空会带登录态而非匿名
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const anonResp = await anon.request.get(url);
      expect(anonResp.status(), '未登录取面单必须 401').toBe(401);
    } finally {
      await anon.close();
    }
  });

  test('权限腿：logistics_coordinator 对本族四个动作全 403，被拒后数据未变', async ({ page }) => {
    const beforeEvents = await apiCall<TrackingEventRow[]>(
      page,
      'GET',
      `${waybillPath(chain.waybillId)}/tracking-events`
    );
    const beforeFreight = await apiCall<WaybillRow>(
      page,
      'GET',
      `/inventory/logistics/${chain.waybillId}`
    );

    await loginAsRole(page, 'logistics_coordinator');
    const readDenied = await apiCallExpectFail(
      page,
      'GET',
      `${waybillPath(chain.waybillId)}/tracking-events`
    );
    const createDenied = await apiCallExpectFail(
      page,
      'POST',
      `${waybillPath(chain.waybillId)}/tracking-events`,
      {
        event_time: '2026-03-05T11:00:00Z',
        description: `越权事件${marker}`,
        event_type: EVENT_TYPE_PICKUP,
      }
    );
    const linkDenied = await apiCallExpectFail(
      page,
      'POST',
      `${waybillPath(chain.waybillId)}/link-purchase-order`,
      { po_id: chain.purchaseOrderId }
    );
    const freightDenied = await apiCallExpectFail(
      page,
      'POST',
      `${waybillPath(chain.waybillId)}/calculate-freight`
    );
    for (const [label, denied] of [
      ['GET tracking-events 派生 read', readDenied],
      ['POST tracking-events 派生 create', createDenied],
      ['POST link-purchase-order 派生 create', linkDenied],
      ['POST calculate-freight 派生 create', freightDenied],
    ] as const) {
      expect(denied.status, `${label} 应被权限门拒（种子无角色持 logistics-tracking_*）`).toBe(403);
      expect(denied.code, `${label} 的 403 必须归因权限门机器码`).toBe(APP_ERROR_CODES.FORBIDDEN);
    }

    const printDenied = await page.request.get(
      `${API_BASE}${API_PREFIX}${waybillPath(chain.waybillId)}/print`
    );
    expect(
      printDenied.status(),
      '打印腿派生 print 动作键（middleware/permission.rs 关键字表），同属未授予面'
    ).toBe(403);

    await loginViaUI(page, testUsername(), testPassword(), true);
    const afterEvents = await apiCall<TrackingEventRow[]>(
      page,
      'GET',
      `${waybillPath(chain.waybillId)}/tracking-events`
    );
    expect(afterEvents.data.length, '被拒的轨迹腿不得新增事件行').toBe(beforeEvents.data.length);
    expect(
      afterEvents.data.filter(row => row.description.includes(`越权事件${marker}`)).length,
      '越权事件必须零落库'
    ).toBe(0);
    const afterFreight = await apiCall<WaybillRow>(
      page,
      'GET',
      `/inventory/logistics/${chain.waybillId}`
    );
    expect(afterFreight.data.freight_fee, '被拒的运费腿不得改写 freight_fee').toBe(
      beforeFreight.data.freight_fee
    );
    expect(afterFreight.data.order_id, '被拒的关联腿不得改写 order_id').toBe(
      beforeFreight.data.order_id
    );
  });

  test('收数据：删除本轮自建运单（状态门之外的清理尝试只记日志）', async ({ page }) => {
    await tryCleanup(page, 'DELETE', `/inventory/logistics/${chain.waybillId}`, '本轮自建运单');
    const readback = await apiCallExpectFail(
      page,
      'GET',
      `/inventory/logistics/${chain.waybillId}`
    );
    expect(
      [200, 404].includes(readback.status),
      `清理回读只认删除成功后的 404 或删除被外键挡住后的 200，实际 ${readback.status}`
    ).toBe(true);
    if (readback.status === 404) {
      expect(readback.code).toBe(APP_ERROR_CODES.NOT_FOUND);
    }
  });
});

/**
 * 功能：把两枚不同语义的 404 文案收敛为同一脱敏常量的判据具名化，避免在断言里散写魔法串。
 * 调用方：关联腿的"不存在采购单"断言。
 * 入参：失败体 message 原值。传给谁：同一条 expect 的右值。
 * 存什么/存哪里：不持久化。
 * 口径：AppError::not_found 默认脱敏（utils/error.rs），源码里的
 * "采购订单 {id} 不存在" 只进 tracing，不外显（logistics_service.rs）。
 */
function ghostMessageProbeOf(message: string | null | undefined): string | null | undefined {
  expect(message ?? '', '脱敏文案不得泄露采购订单 id').not.toContain('999999999');
  return message;
}
