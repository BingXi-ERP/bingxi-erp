import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  API_BASE,
  API_PREFIX,
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  expectDenied,
  failureCode,
  genCode,
  genDyeLotNo,
  getCtx,
  loginAsRole,
  loginViaUI,
  testPassword,
  testUsername,
  type ApiFailureBody,
} from './helpers';

/**
 * 256 production 族按色号与供应商与工人反查与产能汇总趋势的真实契约配对
 *
 * 覆盖端点（全部相对 baseURL=/api/v1/erp 书写）
 * GET  /production/dye-batches/by-color/{color_no} 按色号反查染缸批次
 * GET  /production/dye-recipes/by-color/{color_code} 按色号反查染整配方
 * GET  /production/greige-fabrics/by-supplier/{supplier_id} 按供应商反查坯布
 * GET  /production/wage-details/by-worker/{worker_id} 按工人反查计件明细
 * GET  /production/capacity/summary 产能汇总
 * GET  /production/capacity/trend 产能趋势
 *
 * 判据来源（逐段读后端源，非推测）。
 * 路由装配 backend/src/routes/production.rs 反查四腿分别在 :46（dye-batches/by-color）、
 * :131（dye-recipes/by-color）、:95（greige-fabrics/by-supplier）、:338（wage-details/by-worker），
 * 产能两腿在 :700 与 :707。出参键名即实体列原文（snake_case），来源
 * backend/src/models/dye_batch.rs、models/dye_recipe.rs、
 * models/greige_fabric.rs、models/wage_record_detail.rs，
 * DECIMAL 列（models 里带 column_type 注解者）经 rust_decimal 默认 serde 出串，
 * 本 spec 一律先断 typeof 为 string 再 Number 比较，不用 String 强转掩盖类型异常。
 *
 * 反查四腿的归属列各不相同，这是本族最容易测错的点。
 * dye-batches 腿过滤的是 dye_batch.color_no（handlers/dye_batch_handler.rs 的
 * Column::ColorNo），而路由段却叫 {color_code}（routes/production.rs），实体里另有
 * NOT NULL 的 color_code 列（models/dye_batch.rs）从未被本腿用作条件。
 * dye-recipes 腿过滤的是 dye_recipe.color_code（services/dye_recipe_service.rs），
 * 并叠加 status='approved'（同文件 :606，词表来源 models/status/quality_dyeing.rs 的
 * dye_recipe 子模块，全小写 draft、pending_approval、approved、rejected、disabled）与
 * is_deleted=false（:607），按 version 降序（:608）。
 * greige-fabrics 腿过滤 greige_fabric.supplier_id 加 is_deleted=false
 * （handlers/greige_fabric_handler.rs），supplier_id 列可空（同文件:17），
 * 故 NULL 行不属于任何供应商键。wage-details 腿过滤 wage_record_detail.worker_id 加
 * is_deleted=false 并支持 grade 与 process_type 两枚查询过滤（handlers/wage_handler.rs）。
 * 归属正确性一律做正反双向对账 正向断 结果集每一行的归属列逐字符等于入参键 且我自己写入的那条
 * 在其中 反向断 换一个库里真实存在但与我那行无关联的键 我那行必须不在结果集里。
 *
 * 不存在键的形态以源码为准（不写"任一非 2xx"）。
 * 四条反查腿的 Path 抽取成功后直接进 SeaORM 过滤，没有任何主键存在性校验，也没有 404 分支，
 * 因此语法合法但库里不存在的键一律 200 加空集合（空数组或 total=0 的空页），本 spec 按该
 * 现状直接取成功信封断集合为空，不把它包装成拒绝腿。段值本身不可解析为目标类型时
 * （worker_id 与 supplier_id 是 Path<i32>），axum 的纯文本报错被
 * middleware/trace_context.rs 的 normalize_extractor_rejection 收口成 400 加
 * VALIDATION_ERROR 加固定公开文案（utils/error.rs 的 REQUEST_DECODING_PUBLIC 与
 * :895 的 request_decoding_failed），serde 原文只进服务端日志不外显，故本 spec 断这条固定
 * 文案而不是断报错细节。查询串类型不符（?page=abc）走同一收口路径。
 *
 * 计件明细的钩稽恒等式与容差来源。
 * 落库口径见 services/wage_ops/calculation.rs 与 :290-294 明细行的工资三分量按工人
 * 人数各自独立拆分（split_wage_among_workers 在 wage_service.rs 是纯除法，无余数
 * 归位），再进 DECIMAL(12,2) 列，因此逐行 wage_amount 与 piece_wage 加 time_wage 加
 * overtime_pay 之间存在最多每分量半分的拆分残差。本 spec 按分位整数比较并把容差显式定为
 * 每行 2 分（不是"长度不限"式放宽），容差之外的差额即判红。
 * 同一条明细还断 worker_id 等于入参、is_deleted 恒 false（源码过滤列回显）、
 * 身份证列若非空则不得为 18 位全量号码（models/wage_record_detail.rs 声明脱敏存储）。
 *
 * 产能两腿的口径自洽与交叉核对。
 * routes/production.rs 把 /capacity/summary 与 /capacity/overview 指向同一 handler，
 * :707 把 /capacity/trend 与 /capacity/bottlenecks 指向同一 handler（handlers/
 * capacity_handler.rs 与 :52），所以 summary 与 trend 不是两个口径而是同一服务的两种视图。
 * get_capacity_overview 只抽 State 与 AuthContext，没有 Query 抽取器，即汇总腿在结构上
 * 不可能接受区间参数；services/capacity_service.rs 的 overview() 又恒定以
 * date_from=None、date_to=None、work_center_id=None 调 load_analysis，因此本 spec 断
 * 给 summary 挂 ?date_from=2020-01-01&date_to=2020-01-02 与不挂参数返回体逐字节相同。
 * load_analysis 返回的是按工作中心展开的行（models/dto/capacity_dto.rs 的
 * CapacityLoadItem 十键加 gap_quantity 与 suggestions），全结构里没有任何日期字段，
 * :131 按 load_rate 降序排序，故"趋势"既无时间轴也无时间序，本 spec 只能断当前可确定性
 * 成立的形状（键集合、负荷率非增序、work_center_id 归属过滤），把时间序列缺失写进下方缺口。
 * 逐项恒等式取源码原样 每行 total_demand 等于 planned_quantity 加 in_progress_quantity
 * （capacity_service.rs）；load_rate 等于 total_demand 除以 daily_capacity 乘 100 后
 * 两位半分向上取整（:299-304，daily_capacity<=0 时恒 0）；status 由 load_rate 与
 * 100、80、20 三档严格大于比较得 OVERLOADED、HIGH、NORMAL、IDLE（:305-313，全大写）；
 * 汇总侧 total_work_centers 等于 trend 长度、active_work_centers 加 idle_count 等于
 * total_work_centers、total_daily_capacity 与 total_planned_demand 分别等于 trend 对应列
 * 求和、overall_load_rate 等于两者之比百分化两位（:401-416）、bottleneck_work_centers 恰为
 * load_rate>80 的子集且其 gap_quantity 等于 total_demand 减 daily_capacity 取非负
 * （:421-431）。订单口径只认 SCHEDULED 与 IN_PROGRESS 两态（:263），日期过滤作用在
 * planned_end_date 与 planned_start_date 上（:265、:268），工作中心侧只认 status=ACTIVE
 * （:244）。
 *
 * 已核实的后端缺陷（按现状钉桩，不改源码，不改判据方向）。
 * D1 routes/production.rs 的路由段名 {color_code} 与 handlers/dye_batch_handler.rs
 *    实际过滤的 Column::ColorNo 不是同一列，实体里 NOT NULL 的 color_code 列
 *    （models/dye_batch.rs）在该反查面永不可查；而 dye_batch.color_no 可空（同文件:18），
 *    建档时留空色号者（handlers/dye_batch_handler.rs 允许白坯即 color_no=None）
 *    永远无法被任何色号键反查到，追溯面存在结构性盲区。本 spec 用同一批数据分别钉住两腿
 *    命中的列（配方腿按 color_code 命中、缸号腿按 color_no 命中），让错位可失败判定，
 *    而不是只写在注释里。
 * D2 handlers/dye_batch_handler.rs 与 handlers/greige_fabric_handler.rs，
 *    两腿对 is_deleted 的过滤写在实体列上却无行级归属门（同域详情与列表腿有 data_scope 门），
 *    任一持有该权限键的账号可按色号或供应商读到全库匹配行，含他人建档坯布的供应商列与米数；
 *    对照 handlers/dye_recipe_handler.rs 的版本列表腿明确前置归属门，本族的门不齐。
 * D3 handlers/dye_recipe_handler.rs 的 get_recipes_by_color 刻意不注入 AuthContext
 *    （:222-224 注释写明是跨部门共享工艺参考面），代价是该腿没有行级数据范围，与主列表
 *    机密面口径不一致 同一 Model 的化学式与助剂结构在两个腿上可见性不同。
 * D4 handlers/wage_handler.rs 的 by-worker 腿没有归属门，worker_id 由调用方任意指定，
 *    任何持权限账号可枚举他人计件明细与单价快照，而 wage_record_detail 携带 piece_price、
 *    time_price、individual_income_tax 与 id_card_no 四枚敏感列。
 * D5 handlers/capacity_handler.rs、:66 的 date_from 与 date_to 用
 *    NaiveDate::parse_from_str(...).ok() 丢弃解析失败，非法日期串（如 2026-13-45）静默降级
 *    为不设该侧边界，即"写错日期"等于"查全部"，参数门缺失且无对外告警。
 * D6 services/capacity_service.rs 的 load_analysis 只按 work_center_id 收窄行集，
 *    区间参数只改变订单归属不改变行集合，故 /capacity/trend 无法表达时间序列；
 *    /capacity/summary 侧（:395-399）连区间都不接受，两腿对"同一区间"无法交叉，
 *    本 spec 的交叉核对只能在无参数态做同源等值断言，并把该结论按现状钉住。
 * D7 handlers/dye_batch_handler.rs 与 handlers/greige_fabric_handler.rs
 *    返回裸 Vec 且无 limit（对照同文件 :610 的导出腿显式 limit(10000)），单个热色号或大
 *    供应商可拉全表；出参也无 PaginatedResponse 四键（utils/response.rs），前端分页控件
 *    拿不到 page 与 page_size 回显。
 *
 * 缺口（非确定性种子所致，如实写明，不在测试侧凑绿）。
 * G1 计件明细的成功面需要真实 wage_record_detail 行，其产生链是 流转卡 工序记录 工价方案
 *    工资记录 calculate（routes/production.rs），本 spec 不重复建链（避免与既有
 *    92 与 213 号写面互踩），改为只读扫描当期工资记录的明细端点收割真实 worker_id；
 *    扫描窗口内一条明细都不存在时，本文件断"扫描窗口内每条记录的明细 total 与其 items
 *    长度一致且为 0"这一可确定性成立的负向事实，归属对账与钩稽恒等式随该次收割的行集
 *    自然收缩，绝不改写成"长度不限"。
 * G2 由 D6 派生 /capacity/trend 无日期字段，"序列长度与请求区间一致且时间有序"这条判据
 *    在源码里没有可断言的载体，本 spec 以 work_center_id 归属过滤 加 远端未来窗口需求归零
 *    加 负荷率非增序 三条替代并点名原因，不是回避。
 * G3 产能行集只暴露 ACTIVE 工作中心（capacity_service.rs 的过滤结果），非 ACTIVE 的
 *    真实主键无法从本族出参取得，故反向空集腿用"trend 已出现的另一真实工作中心必须互斥"
 *    加"语法合法的不存在 id"两支承担，ACTIVE 门本身只以行集不随区间变化间接钉住。
 *
 * 假绿防线。色号键取 ensureTestEntities 现建的专属色卡档案值（同一次运行现建，不与历史
 * 数据混），缸号与坯布与配方一律本 worker 自建并带唯一标记，反查结果按 id 集合与归属列
 * 双重对账；分页腿断四键齐全且 page 与 page_size 回显等于钳位后的值（钳位本身是现状，见
 * handlers/wage_handler.rs）；空态一律断 status 与 total 双值，不用 ?? 与默认值
 * 兜底，缺键与类型不符当场点名列名抛错；权限档覆盖六腿未登录 401 一次 加 非授权角色 403
 * 一次（角色取 role-credentials 的 cashier，与 33 号纵向越权矩阵同源账号，该角色不持有
 * production 资源键），敏感面另断身份证列不得为全量号码。
 */

/** 后端固定公开文案（utils/messages.rs 的权限拒绝口径，与 utils/error.rs public_message 同源） */
const PERMISSION_PUBLIC = '无权限';
/** 抽取失败收口的固定公开文案（utils/error.rs REQUEST_DECODING_PUBLIC 起句） */
const REQUEST_DECODING_HEAD = '请求格式不正确';

type Json = Record<string, unknown>;

interface DyeBatchRow {
  id: number;
  batch_no: string;
  dye_lot_no: string;
  color_code: string;
  color_no: string | null;
  status: string | null;
  is_deleted: boolean | null;
  created_at: string;
}

interface DyeRecipeRow {
  id: number;
  recipe_no: string;
  color_code: string | null;
  color_no: string | null;
  status: string | null;
  is_deleted: boolean | null;
  version: number | null;
}

interface GreigeRow {
  id: number;
  fabric_no: string;
  supplier_id: number | null;
  quantity_meters: string | null;
  quantity_kg: string | null;
  is_deleted: boolean | null;
}

interface WageDetailRow {
  id: number;
  wage_record_id: number;
  worker_id: number;
  worker_name: string | null;
  grade: string;
  wage_type: string;
  actual_quantity: string;
  qualified_quantity: string;
  piece_wage: string;
  time_wage: string;
  overtime_pay: string;
  wage_amount: string;
  id_card_no: string | null;
  is_deleted: boolean;
}

interface Page4<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

interface LoadItem {
  work_center_id: number;
  work_center_code: string;
  work_center_name: string;
  daily_capacity: string;
  capacity_unit: string | null;
  planned_quantity: string;
  in_progress_quantity: string;
  total_demand: string;
  load_rate: string;
  status: string;
  gap_quantity: string;
  suggestions: unknown[];
}

interface CapacitySummary {
  total_work_centers: number;
  active_work_centers: number;
  total_daily_capacity: string;
  total_planned_demand: string;
  overall_load_rate: string;
  bottleneck_work_centers: LoadItem[];
  overloaded_count: number;
  idle_count: number;
}

/** CapacityOverview 的八键（models/dto/capacity_dto.rs），排序后用于信封锁定 */
const SUMMARY_KEYS = [
  'active_work_centers',
  'bottleneck_work_centers',
  'idle_count',
  'overall_load_rate',
  'overloaded_count',
  'total_daily_capacity',
  'total_planned_demand',
  'total_work_centers',
].sort();

/** rust_decimal 的 JSON 出参必须是串，类型不符即点名抛错，不静默 String 强转 */
function decField(v: unknown, label: string): number {
  expect(
    typeof v,
    `${label} 必须是 DECIMAL 字符串口径（models 里带 column_type 注解的列经 rust_decimal serde 出串），实际 ${JSON.stringify(v)}`
  ).toBe('string');
  const n = Number(v as string);
  expect(Number.isFinite(n), `${label} 字符串应可解析为有限数，实际 ${JSON.stringify(v)}`).toBe(
    true
  );
  return n;
}

/** 可空 DECIMAL NULL 返回 null 非 NULL 走字符串口径 */
function decFieldOpt(v: unknown, label: string): number | null {
  if (v === null) return null;
  return decField(v, label);
}

/** 分位整数（金额与米数比较一律折成分，避开浮点末位噪声） */
const cents = (n: number): number => Math.round(n * 100);

function asList<T>(data: unknown, label: string): T[] {
  expect(
    Array.isArray(data),
    `${label} 出参必须是裸数组（handler 直接 serde_json Vec<Model>），实际 ${JSON.stringify(data)}`
  ).toBe(true);
  return data as T[];
}

function idsOf<T extends { id: number }>(rows: T[]): number[] {
  return rows.map(r => r.id);
}

/** 裸数组信封不得携带分页四键中的任何一枚（D7 的现状钉桩） */
function assertNoPagingKeys(data: unknown, label: string): void {
  const obj = data as Json;
  for (const key of ['items', 'total', 'page', 'page_size']) {
    expect(obj[key], `${label} 裸数组不应携带分页键 ${key}（D7 点名）`).toBeUndefined();
  }
}

/** 未登录直连（独立 context，不带本 worker 会话 cookie） */
async function fetchAnonymous(
  page: Page,
  method: 'GET' | 'POST',
  path: string
): Promise<{ status: number; json: ApiFailureBody }> {
  const browser = page.context().browser();
  if (!browser) {
    throw new Error('fetchAnonymous 需要 page.context().browser() 可用（当前 context 无 browser）');
  }
  const iso = await browser.newContext();
  try {
    const resp = await iso.request.fetch(`${API_BASE}${API_PREFIX}${path}`, {
      method,
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    const text = await resp.text();
    let json: ApiFailureBody = {};
    try {
      json = JSON.parse(text) as ApiFailureBody;
    } catch {
      throw new Error(
        `fetchAnonymous ${method} ${path} 失败体非 JSON，status=${resp.status()} 原文前 120 字符 ${text.slice(0, 120)}`
      );
    }
    return { status: resp.status(), json };
  } finally {
    await iso.close();
  }
}

/** 本文件私有延迟清理队列（断言之后再清，清理失败同样判红，避免自建数据外溢） */
interface CleanupItem {
  path: string;
  label: string;
}
const CLEANUP: CleanupItem[] = [];
function deferCleanup(path: string, label: string): void {
  CLEANUP.push({ path, label });
}
test.afterEach(async ({ page }) => {
  const failures: string[] = [];
  for (const item of CLEANUP.splice(0, CLEANUP.length)) {
    try {
      await apiCall(page, 'DELETE', item.path);
    } catch (e) {
      failures.push(`${item.label} ${(e as Error).message}`);
    }
  }
  expect(
    failures,
    `256 清理腿残留失败（自建数据未回收会污染同库后续用例）${failures.join(' | ')}`
  ).toEqual([]);
});

const ymd = (daysFromToday: number): string =>
  new Date(Date.now() + daysFromToday * 86_400_000).toISOString().slice(0, 10);

/** 本 worker 专属色号键（同一次运行现建，两次运行不撞） 缸号腿的写入与反查都取它 */
async function pickTwoColorNos(page: Page): Promise<string[]> {
  await ensureTestEntities(page);
  const all = getCtx().colorNos;
  const nos = all.filter(v => typeof v === 'string' && v.trim() !== '');
  expect(
    nos.length,
    `前置：ctx.colorNos 至少两条专属色号（来源 ensureTestEntities 现建色卡档案），实际 ${JSON.stringify(all)}`
  ).toBeGreaterThanOrEqual(2);
  return [nos[0], nos[1]];
}

/** 建一条带色号的缸号（写入腿 反查键的已知存在来源） */
async function createDyeBatch(page: Page, colorNo: string): Promise<DyeBatchRow> {
  const lotNo = genDyeLotNo();
  const res = await apiCall<DyeBatchRow>(page, 'POST', '/production/dye-batches', {
    color_no: colorNo,
    dye_lot_no: lotNo,
    remarks: `256缸号反查标记 ${lotNo}`,
  });
  const row = res.data;
  expect(Number(row?.id), `缸号建单应返回 id，实际 ${JSON.stringify(res)}`).toBeGreaterThan(0);
  deferCleanup(`/production/dye-batches/${row.id}`, `[256] dye-batch ${lotNo}`);
  return row;
}

/** 建一条坯布 供应商键可空（可空分支正是反向事实的载体） */
async function createGreige(
  page: Page,
  supplierId: number | null,
  meters: string,
  kg: string,
  tag: string
): Promise<GreigeRow> {
  const no = genCode(`FAB${tag}`);
  const body: Json = {
    fabric_no: no,
    fabric_name: `256坯布${tag} ${no}`,
    quantity_meters: meters,
    quantity_kg: kg,
    remarks: `256 供应商反查 ${tag}`,
  };
  if (supplierId !== null) body.supplier_id = supplierId;
  const res = await apiCall<GreigeRow>(page, 'POST', '/production/greige-fabrics', body);
  const id = Number(res.data?.id);
  expect(id, `坯布 ${tag} 建单应返回 id，实际 ${JSON.stringify(res)}`).toBeGreaterThan(0);
  deferCleanup(`/production/greige-fabrics/${id}`, `[256] greige ${no}`);
  return res.data;
}

test.describe.serial('256 production 反查与产能 归属对账 钩稽恒等式 口径交叉', () => {
  test('256-01 缸号按色号反查 归属列是 color_no 正向含我反向排他 不存在键 200 空集', async ({
    page,
  }) => {
    const [colorA, colorB] = await pickTwoColorNos(page);
    const batchA = await createDyeBatch(page, colorA);
    const batchB = await createDyeBatch(page, colorB);

    expect(
      batchA.color_no,
      '建单回显的 color_no 应逐字符等于入参（models/dye_batch.rs 可空列，落库后不得被清洗）'
    ).toBe(colorA);
    // D1 钉桩 实体里 NOT NULL 的 color_code 列由色卡档案解析回填（dye_batch_handler.rs 起），
    // 与本腿的检索键 color_no 是两个不同列，故反查键取 color_no 而非 color_code。
    expect(typeof batchA.color_code, 'color_code 列应回显为字符串').toBe('string');

    const hitA = asList<DyeBatchRow>(
      await apiCallRaw(
        page,
        'GET',
        `/production/dye-batches/by-color/${encodeURIComponent(colorA)}`
      ),
      `缸号按色号 ${colorA} 反查`
    );
    assertNoPagingKeys(hitA, '缸号按色号反查 A');
    expect(
      idsOf(hitA).includes(batchA.id),
      `正向 色号 ${colorA} 的反查结果必须含自建缸号 ${batchA.id}，实际 id 集 ${JSON.stringify(idsOf(hitA))}`
    ).toBe(true);
    for (const row of hitA) {
      expect(
        row.color_no,
        `归属对账 结果行 ${row.id} 的 color_no 必须逐字符等于入参 ${colorA}，实际 ${JSON.stringify(row.color_no)}`
      ).toBe(colorA);
      expect(
        row.is_deleted ?? false,
        `结果行 ${row.id} 不得携带已删除行（handler :591 过滤 is_deleted=false）`
      ).toBe(false);
    }
    expect(
      idsOf(hitA).includes(batchB.id),
      `反向 另一色号建的缸号 ${batchB.id} 不得出现在色号 ${colorA} 的结果里（无归属过滤即串数据）`
    ).toBe(false);

    const hitB = asList<DyeBatchRow>(
      await apiCallRaw(
        page,
        'GET',
        `/production/dye-batches/by-color/${encodeURIComponent(colorB)}`
      ),
      `缸号按色号 ${colorB} 反查`
    );
    expect(idsOf(hitB).includes(batchB.id), `正向 色号 ${colorB} 必须含自建缸号 ${batchB.id}`).toBe(
      true
    );
    expect(idsOf(hitB).includes(batchA.id), '两键结果必须互斥（同值不得跨列命中）').toBe(false);
    for (const row of hitB) {
      expect(row.color_no, `结果行 ${row.id} 的 color_no 必须等于入参 ${colorB}`).toBe(colorB);
    }

    // 不存在键 以源码为准 无主键存在性校验 无 404 分支 恒 200 空数组（D1 的追溯面）
    const ghost = encodeURIComponent(genCode('256GHOST'));
    const ghostHit = asList<DyeBatchRow>(
      await apiCallRaw(page, 'GET', `/production/dye-batches/by-color/${ghost}`),
      '缸号按不存在色号反查'
    );
    expect(ghostHit, '不存在色号必须 200 空集（handler 无存在性门，不返回 404）').toEqual([]);

    // 排序口径 created_at 降序（handler :592）
    const times = hitA.map(r => Date.parse(r.created_at));
    for (let i = 1; i < times.length; i++) {
      expect(
        times[i - 1] >= times[i],
        `反查结果应按 created_at 降序，第 ${i} 位 ${times[i - 1]} 早于 ${times[i]}`
      ).toBe(true);
    }
  });

  test('256-02 配方按色号反查 只出 approved 且命中列是 color_code 而非 color_no', async ({
    page,
  }) => {
    const [knownColorNo] = await pickTwoColorNos(page);
    const marker = genCode('256RCC');
    const created = await apiCall<DyeRecipeRow>(page, 'POST', '/production/dye-recipes', {
      recipe_name: `256配方反查 ${marker}`,
      color_code: marker,
      color_no: knownColorNo,
      temperature: '98.00',
      time_minutes: 45,
      remarks: `256 反查标记 ${marker}`,
    });
    const recipeId = Number(created.data?.id);
    expect(recipeId, `配方建单应返回 id，实际 ${JSON.stringify(created)}`).toBeGreaterThan(0);
    deferCleanup(`/production/dye-recipes/${recipeId}`, `[256] dye-recipe ${marker}`);

    expect(
      created.data?.status,
      '建单缺省状态必须逐字符等于写入方词表 draft（models/status/quality_dyeing.rs）'
    ).toBe('draft');

    // 状态门 草稿与待审核都不该被共享参考面命中（dye_recipe_service.rs）
    const draftHit = asList<DyeRecipeRow>(
      await apiCallRaw(
        page,
        'GET',
        `/production/dye-recipes/by-color/${encodeURIComponent(marker)}`
      ),
      '配方按色号反查（草稿态）'
    );
    expect(
      idsOf(draftHit).includes(recipeId),
      `草稿配方不得被 by-color 命中（仅 approved 可见），实际 id 集 ${JSON.stringify(idsOf(draftHit))}`
    ).toBe(false);

    await apiCall(page, 'POST', `/production/dye-recipes/${recipeId}/submit`);
    const pendingView = await apiCallRaw<DyeRecipeRow>(page, 'GET', `/production/dye-recipes/${recipeId}`);
    expect(
      pendingView.status,
      '提交后状态必须逐字符等于写入方词表 pending_approval（同文件 :44）'
    ).toBe('pending_approval');
    const pendingHit = asList<DyeRecipeRow>(
      await apiCallRaw(
        page,
        'GET',
        `/production/dye-recipes/by-color/${encodeURIComponent(marker)}`
      ),
      '配方按色号反查（待审核态）'
    );
    expect(
      idsOf(pendingHit).includes(recipeId),
      '待审核配方仍不得被 by-color 命中（状态门只认 approved 单值）'
    ).toBe(false);

    await apiCall(page, 'POST', `/production/dye-recipes/${recipeId}/approve`);
    const approvedView = await apiCallRaw<DyeRecipeRow>(
      page,
      'GET',
      `/production/dye-recipes/${recipeId}`
    );
    expect(approvedView.status, '审核通过必须逐字符等于 approved').toBe('approved');

    const hit = asList<DyeRecipeRow>(
      await apiCallRaw(
        page,
        'GET',
        `/production/dye-recipes/by-color/${encodeURIComponent(marker)}`
      ),
      '配方按色号反查（已审核）'
    );
    assertNoPagingKeys(hit, '配方按色号反查');
    expect(idsOf(hit).includes(recipeId), '已审核配方必须被自身 color_code 命中').toBe(true);
    for (const row of hit) {
      expect(
        row.color_code,
        `归属对账 结果行 ${row.id} 的 color_code 必须逐字符等于入参 ${marker}，实际 ${JSON.stringify(row.color_code)}`
      ).toBe(marker);
      expect(
        row.status,
        `状态门 结果行 ${row.id} 的 status 必须逐字符等于 approved，实际 ${JSON.stringify(row.status)}`
      ).toBe('approved');
    }
    // D1 交叉证明 本腿命中列是 color_code，故我埋在 color_no 上的已知色号值不得成为检索键
    const byOther = asList<DyeRecipeRow>(
      await apiCallRaw(
        page,
        'GET',
        `/production/dye-recipes/by-color/${encodeURIComponent(knownColorNo)}`
      ),
      `配方按 color_no 面值 ${knownColorNo} 反查`
    );
    expect(
      idsOf(byOther).includes(recipeId),
      `配方腿按 color_code 过滤（dye_recipe_service.rs），用该行 color_no 值 ${knownColorNo} 反查必须不命中自己`
    ).toBe(false);

    // 版本降序（:608）
    const versions = hit.map(r => Number(r.version ?? 0));
    for (let i = 1; i < versions.length; i++) {
      expect(
        versions[i - 1] >= versions[i],
        `配方反查应按 version 降序，第 ${i} 位 ${versions[i - 1]} 小于 ${versions[i]}`
      ).toBe(true);
    }
  });

  test('256-03 坯布按供应商反查 与分页列表腿交叉对账 米数千克走 DECIMAL 口径', async ({
    page,
  }) => {
    await ensureTestEntities(page);
    const supplierId = Number(getCtx().supplierId);
    expect(
      Number.isInteger(supplierId) && supplierId > 0,
      `前置：ctx.supplierId 必须是真实供应商 id，实际 ${JSON.stringify(getCtx().supplierId)}`
    ).toBe(true);

    const metersA = '123.45';
    const kgA = '41.15';
    const fabricA = await createGreige(page, supplierId, metersA, kgA, 'A');
    // 未挂供应商的一行（supplier_id 可空列）它不属于任何供应商键
    const fabricNoSupplier = await createGreige(page, null, '55.00', '10.00', 'N');

    const hitA = asList<GreigeRow>(
      await apiCallRaw(page, 'GET', `/production/greige-fabrics/by-supplier/${supplierId}`),
      `坯布按供应商 ${supplierId} 反查`
    );
    for (const row of hitA) {
      expect(
        row.supplier_id,
        `归属对账 结果行 ${row.id} 的 supplier_id 必须逐字等于入参 ${supplierId}，实际 ${JSON.stringify(row.supplier_id)}（NULL 行不得混入）`
      ).toBe(supplierId);
      expect(row.is_deleted ?? false, `结果行 ${row.id} 不得为已删除行`).toBe(false);
      decFieldOpt(row.quantity_meters, `坯布行 ${row.id} quantity_meters`);
      decFieldOpt(row.quantity_kg, `坯布行 ${row.id} quantity_kg`);
    }
    expect(idsOf(hitA).includes(fabricA.id), `正向 自建坯布 ${fabricA.id} 必须被本供应商键命中`).toBe(
      true
    );
    expect(
      idsOf(hitA).includes(fabricNoSupplier.id),
      `反向 未挂供应商的坯布 ${fabricNoSupplier.id}（supplier_id NULL）不得混入任何供应商键`
    ).toBe(false);

    // 换一个库里真实存在但与我那行无关联的供应商键 我那行必须不在结果集里
    const window = await apiCallRaw<Page4<GreigeRow>>(
      page,
      'GET',
      '/production/greige-fabrics?page=1&page_size=200'
    );
    expect(
      Object.keys(window).sort().join(','),
      '坯布列表必须是 PaginatedResponse 四键（utils/response.rs）'
    ).toBe('items,page,page_size,total');
    const otherSupplier = window.items
      .map(r => r.supplier_id)
      .find(id => typeof id === 'number' && id > 0 && id !== supplierId);
    if (otherSupplier === undefined) {
      // 窗口内除本供应商外没有第二个真实供应商键 该事实本身可失败判定（不是兜底掩盖）
      expect(
        window.items.filter(r => r.supplier_id !== null && r.supplier_id !== supplierId).length,
        `扫描窗口 ${window.items.length} 行里不得存在第三个供应商取值`
      ).toBe(0);
    } else {
      const hitOther = asList<GreigeRow>(
        await apiCallRaw(page, 'GET', `/production/greige-fabrics/by-supplier/${otherSupplier}`),
        `坯布按另一供应商 ${otherSupplier} 反查`
      );
      for (const row of hitOther) {
        expect(
          row.supplier_id,
          `归属对账 结果行 ${row.id} 的 supplier_id 必须等于入参 ${otherSupplier}`
        ).toBe(otherSupplier);
      }
      expect(
        idsOf(hitOther).includes(fabricA.id),
        `反向 坯布 ${fabricA.id} 属供应商 ${supplierId}，不得出现在供应商 ${otherSupplier} 结果里`
      ).toBe(false);
    }

    // 语法合法但不存在的主键 恒 200 空集（handler :861-871 无存在性门 不 404）
    const ghostHit = asList<GreigeRow>(
      await apiCallRaw(page, 'GET', '/production/greige-fabrics/by-supplier/2000000002'),
      '坯布按不存在供应商反查'
    );
    expect(ghostHit, '不存在供应商键必须 200 空集').toEqual([]);

    // 与同谓词的列表腿交叉对账 行集与米数求和必须一致
    const listLeg = await apiCallRaw<Page4<GreigeRow>>(
      page,
      'GET',
      `/production/greige-fabrics?supplier_id=${supplierId}&page=1&page_size=500`
    );
    expect(
      new Set(idsOf(hitA)).size,
      `反查腿自身 id 不得重复（同一谓词取行）`
    ).toBe(hitA.length);
    expect(
      listLeg.total,
      '列表腿 total 必须等于反查腿行数（同一 supplier_id 谓词，反查腿无分页）'
    ).toBe(hitA.length);
    const metersSumCents = (rows: GreigeRow[]): number =>
      cents(
        rows.reduce(
          (acc, r) => acc + (decFieldOpt(r.quantity_meters, `行 ${r.id} quantity_meters`) ?? 0),
          0
        )
      );
    expect(
      metersSumCents(listLeg.items),
      `两腿米数求和必须分位相等（列表腿 ${listLeg.items.length} 行 反查腿 ${hitA.length} 行）`
    ).toBe(metersSumCents(hitA));
    const mine = hitA.find(r => r.id === fabricA.id);
    expect(mine, `反查结果里必须找回自建坯布 ${fabricA.id}`).toBeTruthy();
    expect(
      cents(decField(mine?.quantity_meters, `自建坯布 ${fabricA.id} quantity_meters`)),
      `写入米数 ${metersA} 与落库回显必须分位相等`
    ).toBe(cents(Number(metersA)));
    expect(
      cents(decField(mine?.quantity_kg, `自建坯布 ${fabricA.id} quantity_kg`)),
      `写入千克 ${kgA} 与落库回显必须分位相等`
    ).toBe(cents(Number(kgA)));

    // 非法 id 段 Path<i32> 抽取失败 收口 400 VALIDATION_ERROR 加固定公开文案
    const bad = await apiCallExpectFail(page, 'GET', '/production/greige-fabrics/by-supplier/abc');
    expect(bad.status, '非法供应商 id 段必须 400').toBe(400);
    expect(failureCode(bad), '非法供应商 id 段机器码').toBe(APP_ERROR_CODES.VALIDATION_ERROR);
    expect(
      bad.message,
      '抽取失败必须收敛为固定公开文案（trace_context.rs 加 utils/error.rs）'
    ).toMatch(REQUEST_DECODING_HEAD);
  });

  test('256-04 计件明细按工人反查 信封四键 钳位现状 归属对账 工资钩稽恒等式', async ({
    page,
  }) => {
    // 信封与钳位现状（wage_handler.rs clamp(1,1000) 与 clamp(1,200)，不拒绝只静默收口）
    const clampLeg = await apiCallRaw<Page4<WageDetailRow>>(
      page,
      'GET',
      '/production/wage-details/by-worker/1?page=1&page_size=5000'
    );
    expect(
      Object.keys(clampLeg).sort().join(','),
      '计件明细必须且只可携带 PaginatedResponse 四键（utils/response.rs）'
    ).toBe('items,page,page_size,total');
    expect(Array.isArray(clampLeg.items), '分页 items 必须为数组').toBe(true);
    expect(
      clampLeg.page_size,
      'page_size 超上限必须静默钳到 200（handler :360），不是 400 参数门（现状钉桩）'
    ).toBe(200);
    expect(clampLeg.page, 'page 回显必须等于入参 1').toBe(1);
    const farPage = await apiCallRaw<Page4<WageDetailRow>>(
      page,
      'GET',
      '/production/wage-details/by-worker/1?page=99999&page_size=50'
    );
    expect(farPage.page, 'page 超上限必须静默钳到 1000（handler :359）').toBe(1000);
    expect(farPage.items.length, '钳位后的超远页必须空集').toBe(0);

    const badWorker = await apiCallExpectFail(
      page,
      'GET',
      '/production/wage-details/by-worker/not-a-number'
    );
    expect(badWorker.status, '非数字 worker_id 段必须 400（Path<i32> 抽取失败）').toBe(400);
    expect(failureCode(badWorker), '非数字 worker_id 段机器码').toBe(
      APP_ERROR_CODES.VALIDATION_ERROR
    );
    expect(
      badWorker.message,
      '抽取失败必须收敛为固定公开文案，serde 原文只进服务端日志（trace_context.rs）'
    ).toMatch(REQUEST_DECODING_HEAD);

    const ghostWorker = await apiCallRaw<Page4<WageDetailRow>>(
      page,
      'GET',
      '/production/wage-details/by-worker/2000000001?page=1&page_size=50'
    );
    expect(ghostWorker.total, '不存在工人键必须 total=0（无主键存在性门，不 404）').toBe(0);
    expect(ghostWorker.items.length, '不存在工人键必须空 items').toBe(0);

    // 只读收割真实明细行（G1 缺口 本 spec 不重建流转卡到工资记录的写入链）
    const records = await apiCallRaw<Page4<Json>>(
      page,
      'GET',
      '/production/wage-records?page=1&page_size=20'
    );
    expect(typeof records.total, '工资记录列表 total 必须是数字').toBe('number');
    const scanned: Array<{ recordId: number; total: number; rows: WageDetailRow[] }> = [];
    for (const rec of records.items) {
      const recordId = Number(rec.id);
      if (!Number.isInteger(recordId) || recordId <= 0) {
        throw new Error(`工资记录列表行缺整数 id，实际 ${JSON.stringify(rec)}`);
      }
      const detail = await apiCallRaw<Page4<WageDetailRow>>(
        page,
        'GET',
        `/production/wage-records/${recordId}/details?page=1&page_size=50`
      );
      scanned.push({ recordId, total: detail.total, rows: detail.items });
    }
    for (const s of scanned) {
      expect(
        s.total,
        `工资记录 ${s.recordId} 的明细 total 必须与其 items 长度一致（同谓词两口径）`
      ).toBe(s.rows.length);
    }
    const found = scanned.flatMap(s => s.rows).filter(r => Number.isInteger(r.worker_id));
    if (found.length === 0) {
      // G1 的确定性负向事实 扫描窗口内每条记录的明细都是空页 不写成"长度不限"
      for (const s of scanned) {
        expect(s.rows.length, `工资记录 ${s.recordId} 扫描窗口内明细必须为空`).toBe(0);
      }
      expect(
        found.length,
        `扫描 ${scanned.length} 条工资记录未取到任何 wage_record_detail 行（缺口见文件头 G1）`
      ).toBe(0);
      return;
    }

    const workerIds = Array.from(new Set(found.map(r => r.worker_id)));
    for (const workerId of workerIds) {
      const knownRows = found.filter(r => r.worker_id === workerId);
      const byWorker = await apiCallRaw<Page4<WageDetailRow>>(
        page,
        'GET',
        `/production/wage-details/by-worker/${workerId}?page=1&page_size=200`
      );
      expect(
        byWorker.total,
        `工人 ${workerId} 的 total 必须不小于已知明细数 ${knownRows.length}`
      ).toBeGreaterThanOrEqual(knownRows.length);
      for (const row of byWorker.items) {
        expect(Number.isInteger(row.id), `明细行 id 必须是整数，实际 ${JSON.stringify(row.id)}`).toBe(
          true
        );
        expect(
          row.worker_id,
          `归属对账 明细行 ${row.id} 的 worker_id 必须逐字等于入参 ${workerId}，实际 ${JSON.stringify(row.worker_id)}`
        ).toBe(workerId);
        expect(
          row.is_deleted,
          `明细行 ${row.id} 的 is_deleted 必须为 false（handler :361 的过滤列回显）`
        ).toBe(false);
        // 脱敏档 身份证列若非空不得是 18 位全量号（models/wage_record_detail.rs）
        if (row.id_card_no !== null) {
          expect(typeof row.id_card_no, `明细行 ${row.id} id_card_no 应为字符串或 null`).toBe(
            'string'
          );
          expect(
            /^[0-9]{17}[0-9Xx]$/.test(row.id_card_no),
            `敏感面 明细行 ${row.id} 的 id_card_no 不得是 18 位全量身份证号（脱敏存储声明），实际形态 ${row.id_card_no.replace(/\d/g, '*')}`
          ).toBe(false);
        }
        // 钩稽恒等式 wage_amount = piece_wage + time_wage + overtime_pay（容差每行 2 分，来源见文件头）
        const piece = cents(decField(row.piece_wage, `行 ${row.id} piece_wage`));
        const time = cents(decField(row.time_wage, `行 ${row.id} time_wage`));
        const ot = cents(decField(row.overtime_pay, `行 ${row.id} overtime_pay`));
        const amount = cents(decField(row.wage_amount, `行 ${row.id} wage_amount`));
        expect(
          Math.abs(amount - (piece + time + ot)),
          `钩稽 明细行 ${row.id} wage_amount 与三分量之和的差必须落在每行 2 分的拆分残差内（piece=${piece} time=${time} ot=${ot} amount=${amount}）`
        ).toBeLessThanOrEqual(2);
        expect(
          cents(decField(row.qualified_quantity, `行 ${row.id} qualified_quantity`)),
          `行 ${row.id} 合格产量不得超过实际产量`
        ).toBeLessThanOrEqual(cents(decField(row.actual_quantity, `行 ${row.id} actual_quantity`)));
      }
      // 跨腿对账 记录明细腿与工人反查腿同源
      const backIds = new Set(idsOf(byWorker.items));
      for (const row of knownRows) {
        expect(
          backIds.has(row.id),
          `跨腿对账 工资记录 ${row.wage_record_id} 的明细 ${row.id} 必须出现在工人 ${workerId} 的反查结果里`
        ).toBe(true);
      }
      // 反向 其他真实工人不得带走我的行
      for (const other of workerIds.filter(v => v !== workerId)) {
        const byOther = await apiCallRaw<Page4<WageDetailRow>>(
          page,
          'GET',
          `/production/wage-details/by-worker/${other}?page=1&page_size=200`
        );
        const overlap = idsOf(byOther.items).filter(id => backIds.has(id));
        expect(
          overlap,
          `反向 工人 ${other} 与工人 ${workerId} 的结果不得共有明细 id ${JSON.stringify(overlap)}`
        ).toEqual([]);
      }
    }
  });

  test('256-05 产能汇总与趋势 同源自洽 分项求和 状态档位 归属过滤 区间参数门', async ({
    page,
  }) => {
    const trend = asList<LoadItem>(
      await apiCallRaw(page, 'GET', '/production/capacity/trend'),
      '产能趋势（无参数）'
    );
    const summary = await apiCallRaw<CapacitySummary>(page, 'GET', '/production/capacity/summary');
    expect(
      Object.keys(summary).sort().join(','),
      `汇总出参必须恰为 CapacityOverview 八键（models/dto/capacity_dto.rs）`
    ).toBe(SUMMARY_KEYS.join(','));

    // 两腿交叉（D6 summary 恒以全量口径调 load_analysis 故无参数态两者同源）
    expect(summary.total_work_centers, '汇总 total_work_centers 必须等于趋势行数').toBe(
      trend.length
    );
    expect(
      cents(
        trend.reduce((a, i) => a + decField(i.daily_capacity, `行 ${i.work_center_id} daily_capacity`), 0)
      ),
      '汇总 total_daily_capacity 必须等于趋势 daily_capacity 求和'
    ).toBe(cents(decField(summary.total_daily_capacity, 'summary total_daily_capacity')));
    expect(
      cents(
        trend.reduce((a, i) => a + decField(i.total_demand, `行 ${i.work_center_id} total_demand`), 0)
      ),
      '汇总 total_planned_demand 必须等于趋势 total_demand 求和'
    ).toBe(cents(decField(summary.total_planned_demand, 'summary total_planned_demand')));
    expect(
      summary.active_work_centers + summary.idle_count,
      'active_work_centers 加 idle_count 必须等于 total_work_centers（status!=IDLE 与 ==IDLE 严格二分）'
    ).toBe(summary.total_work_centers);
    expect(
      trend.filter(i => i.status === 'OVERLOADED').length,
      'overloaded_count 必须等于趋势里 status=OVERLOADED 的行数'
    ).toBe(summary.overloaded_count);
    expect(
      trend.filter(i => i.status === 'IDLE').length,
      'idle_count 必须等于趋势里 status=IDLE 的行数'
    ).toBe(summary.idle_count);
    const totalCap = decField(summary.total_daily_capacity, 'summary total_daily_capacity');
    const totalDemand = decField(summary.total_planned_demand, 'summary total_planned_demand');
    const expectOverall = totalCap > 0 ? Math.round((totalDemand / totalCap) * 10000) / 100 : 0;
    expect(
      Math.abs(decField(summary.overall_load_rate, 'summary overall_load_rate') - expectOverall),
      `overall_load_rate 必须等于总需求除总产能百分化两位（服务 :408-416），期望 ${expectOverall}`
    ).toBeLessThanOrEqual(0.01);

    // 瓶颈子集口径 仅 load_rate>80 进 bottleneck 且 gap=max(需求-产能,0)
    const bottleneckWcIds = summary.bottleneck_work_centers.map(i => i.work_center_id);
    const over80 = trend.filter(i => decField(i.load_rate, `行 ${i.work_center_id} load_rate`) > 80);
    expect(
      bottleneckWcIds.length,
      'bottleneck_work_centers 行数必须等于趋势里 load_rate>80 的行数'
    ).toBe(over80.length);
    for (const item of summary.bottleneck_work_centers) {
      const demand = decField(item.total_demand, '瓶颈行 total_demand');
      const capacity = decField(item.daily_capacity, '瓶颈行 daily_capacity');
      expect(
        Math.max(cents(demand - capacity), 0),
        `瓶颈行 ${item.work_center_id} gap_quantity 必须等于 max(需求-产能,0)（服务 :425）`
      ).toBe(Math.max(cents(decField(item.gap_quantity, '瓶颈行 gap_quantity')), 0));
      expect(
        Array.isArray(item.suggestions),
        `瓶颈行 ${item.work_center_id} suggestions 必须为数组（趋势腿恒空 汇总腿才有建议）`
      ).toBe(true);
    }
    for (const item of trend) {
      // 逐项恒等式 需求 = 排产 + 在制（capacity_service.rs 纯加法 无残差）
      expect(
        cents(decField(item.planned_quantity, `行 ${item.work_center_id} planned_quantity`)) +
          cents(decField(item.in_progress_quantity, `行 ${item.work_center_id} in_progress_quantity`)),
        `行 ${item.work_center_id} total_demand 必须严格等于 planned 加 in_progress 的分位和`
      ).toBe(cents(decField(item.total_demand, `行 ${item.work_center_id} total_demand`)));
      const cap = decField(item.daily_capacity, `行 ${item.work_center_id} daily_capacity`);
      const demand = decField(item.total_demand, `行 ${item.work_center_id} total_demand`);
      const rate = decField(item.load_rate, `行 ${item.work_center_id} load_rate`);
      const expectRate = cap > 0 ? Math.round((demand / cap) * 10000) / 100 : 0;
      expect(
        Math.abs(rate - expectRate),
        `行 ${item.work_center_id} load_rate 必须等于需求除产能百分化两位（服务 :299-304），期望 ${expectRate} 实际 ${rate}`
      ).toBeLessThanOrEqual(0.01);
      const expectStatus =
        expectRate > 100
          ? 'OVERLOADED'
          : expectRate > 80
            ? 'HIGH'
            : expectRate > 20
              ? 'NORMAL'
              : 'IDLE';
      expect(
        item.status,
        `行 ${item.work_center_id} status 必须由 load_rate 档位表得出（服务 :305-313 全大写），期望 ${expectStatus}`
      ).toBe(expectStatus);
      expect(
        cents(decField(item.gap_quantity, `行 ${item.work_center_id} gap_quantity`)),
        '趋势腿 gap_quantity 恒 0（服务 :325 写死），有值即口径漂移'
      ).toBe(0);
      expect(item.suggestions.length, '趋势腿 suggestions 恒空（服务 :326 写死）').toBe(0);
    }
    const rates = trend.map(i => decField(i.load_rate, `行 ${i.work_center_id} load_rate`));
    for (let i = 1; i < rates.length; i++) {
      expect(
        rates[i - 1] >= rates[i],
        `趋势腿按 load_rate 降序（服务 :131），第 ${i} 位 ${rates[i - 1]} 小于 ${rates[i]}`
      ).toBe(true);
    }

    // 归属过滤 work_center_id 收窄到恰一行 且第二个真实键互斥（G3 的可行替代）
    if (trend.length >= 2) {
      const wc0 = trend[0].work_center_id;
      const wc1 = trend[1].work_center_id;
      const one0 = asList<LoadItem>(
        await apiCallRaw(page, 'GET', `/production/capacity/trend?work_center_id=${wc0}`),
        `趋势按工作中心 ${wc0} 过滤`
      );
      expect(
        one0.length,
        `单工作中心过滤必须恰得 1 行，实际 id 集 ${JSON.stringify(one0.map(i => i.work_center_id))}`
      ).toBe(1);
      expect(one0[0].work_center_id, `过滤行 id 必须逐字等于入参 ${wc0}`).toBe(wc0);
      const one1 = asList<LoadItem>(
        await apiCallRaw(page, 'GET', `/production/capacity/trend?work_center_id=${wc1}`),
        `趋势按工作中心 ${wc1} 过滤`
      );
      expect(
        one1.map(i => i.work_center_id),
        `反向 另一真实工作中心 ${wc1} 必须只取回自己，不得带走 ${wc0}`
      ).toEqual([wc1]);
    }
    const absentKey = trend.reduce((a, i) => Math.max(a, i.work_center_id), 0) + 9_000_001;
    const empty = asList<LoadItem>(
      await apiCallRaw(page, 'GET', `/production/capacity/trend?work_center_id=${absentKey}`),
      `趋势按不存在工作中心 ${absentKey} 过滤`
    );
    expect(empty, '不存在工作中心键必须空集而不是全表').toEqual([]);

    // 汇总腿结构上无 Query 抽取器（D6）挂区间参数返回体必须与不挂一致
    const summaryWithRange = await apiCallRaw<CapacitySummary>(
      page,
      'GET',
      `/production/capacity/summary?date_from=2020-01-01&date_to=2020-01-02&work_center_id=${absentKey}`
    );
    expect(
      JSON.stringify(summaryWithRange),
      'D6 现状钉桩 汇总腿不接受区间与键收窄 挂参数返回体必须逐字节等于无参数态'
    ).toBe(JSON.stringify(summary));

    // D5 现状钉桩 非法日期被 .ok() 静默丢弃 等价于不设边界
    const badDate = asList<LoadItem>(
      await apiCallRaw(
        page,
        'GET',
        '/production/capacity/trend?date_from=2026-13-45&date_to=not-a-date'
      ),
      '趋势非法日期'
    );
    expect(
      JSON.stringify(badDate),
      'D5 现状钉桩 非法日期串静默降级为全量查询（capacity_handler.rs、:66 的 .ok()）既不 400 也不告警'
    ).toBe(JSON.stringify(trend));

    // 远端未来窗口 需求归零且行集不缩（区间只改订单归属 不改工作中心集合）
    const future = asList<LoadItem>(
      await apiCallRaw(
        page,
        'GET',
        `/production/capacity/trend?date_from=${ymd(3650)}&date_to=${ymd(3651)}`
      ),
      '趋势远端未来窗口'
    );
    expect(
      future.map(i => i.work_center_id),
      '远端窗口的行集合必须与无参数态一致（load_analysis :114-125 按工作中心展开 区间不改行集）'
    ).toEqual(trend.map(i => i.work_center_id));
    for (const item of future) {
      expect(
        cents(decField(item.total_demand, `远端窗口行 ${item.work_center_id} total_demand`)),
        '远端 10 年窗口内需求必须归零（订单口径只认 SCHEDULED 与 IN_PROGRESS，服务 :263-268）'
      ).toBe(0);
      expect(
        item.status,
        '需求归零后 load_rate 必为 0，status 必须落到档位表末档 IDLE'
      ).toBe('IDLE');
    }
  });

  test('256-06 参数门形状 查询串类型不符与非法 id 段 一律 400 单一 AppError 形状', async ({
    page,
  }) => {
    const legs: Array<{ path: string; label: string }> = [
      { path: '/production/wage-details/by-worker/1?page=abc', label: '计件明细页码非数' },
      { path: '/production/wage-details/by-worker/1?page_size=abc', label: '计件明细页长非数' },
      { path: '/production/greige-fabrics/by-supplier/9999999999999999999999', label: '供应商段超 i32' },
      { path: '/production/wage-details/by-worker/-1', label: '负数工人键' },
    ];
    for (const leg of legs) {
      const res = await apiCallExpectFail(page, 'GET', leg.path);
      if (leg.label === '负数工人键') {
        // 负数可被 Path<i32> 解析 无主键存在性门 故必须走成功信封空页（源码现状）
        expect(res.status, `负数工人键不得被判非法，实际 status=${res.status}`).toBe(200);
        continue;
      }
      expect(res.status, `${leg.label} 必须 400，实际 ${res.status}`).toBe(400);
      expect(failureCode(res), `${leg.label} 机器码必须是 VALIDATION_ERROR`).toBe(
        APP_ERROR_CODES.VALIDATION_ERROR
      );
      expect(res.message, `${leg.label} 必须是固定公开文案`).toMatch(REQUEST_DECODING_HEAD);
      expect(res.trace_id, `${leg.label} 失败体缺 trace_id（AppError 统一信封）`).toMatch(
        /^[0-9a-f]{32}$/
      );
      expect(res.timestamp, `${leg.label} 失败体缺 timestamp`).toBeDefined();
    }

    // 成功面 负数工人键的空页形状仍是四键信封 不接受任何额外键
    const neg = await apiCallRaw<Page4<WageDetailRow>>(
      page,
      'GET',
      '/production/wage-details/by-worker/-1?page=1&page_size=50'
    );
    expect(Object.keys(neg).sort().join(','), '负数键成功面必须四键信封').toBe(
      'items,page,page_size,total'
    );
    expect(neg.total, '负数工人键 total 必须为 0').toBe(0);
  });

  test('256-07 权限档 六腿未登录 401 与 cashier 角色 403 全拒', async ({ page }) => {
    const paths = [
      '/production/dye-batches/by-color/ANY',
      '/production/dye-recipes/by-color/ANY',
      '/production/greige-fabrics/by-supplier/1',
      '/production/wage-details/by-worker/1',
      '/production/capacity/summary',
      '/production/capacity/trend',
    ];
    for (const p of paths) {
      const anon = await fetchAnonymous(page, 'GET', p);
      expect(anon.status, `未登录取 ${p} 必须 401`).toBe(401);
      expect(failureCode(anon.json), `未登录 ${p} 机器码`).toBe('UNAUTHORIZED');
      expect(anon.json.trace_id, `未登录 ${p} 失败体缺 trace_id`).toMatch(/^[0-9a-f]{32}$/);
      expect(anon.json.timestamp, `未登录 ${p} 失败体缺 timestamp`).toBeDefined();
    }

    await loginAsRole(page, 'cashier');
    for (const p of paths) {
      const denied = await apiCallExpectFail(page, 'GET', p);
      expectDenied(denied, `cashier 访问 ${p} 应被权限门拒绝`);
      expect(denied.message, `权限拒绝文案必须逐字符等于 ${PERMISSION_PUBLIC}`).toBe(
        PERMISSION_PUBLIC
      );
    }

    // 会话恢复到本 worker 账号 后续用例不受角色切换影响
    await loginViaUI(page, testUsername(), testPassword(), true);
    const back = await apiCallRaw<CapacitySummary>(page, 'GET', '/production/capacity/summary');
    expect(
      typeof back.total_daily_capacity,
      '会话恢复后汇总腿必须重新可达且仍为 DECIMAL 串口径'
    ).toBe('string');
  });
});
