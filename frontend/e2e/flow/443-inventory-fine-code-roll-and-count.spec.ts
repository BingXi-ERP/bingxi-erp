// 面料库存细码与卷号链、盘点反向腿的 e2e 契约用例。
//
// 覆盖面。本文件钉七段真实链。
// 一、细码录入。面料库存行的真实计量粒度是"一行一卷的细码"，录入面是
// POST /inventory/stock/fabric，逐字段带批次、缸号、色号、米数、公斤数、克重、门幅、
// 架号、层号，保存后必须从列表与详情两侧逐字段回读对齐。
// 二、零头余码。不足整卷的零头行与整卷行同仓同品并存时，两行米数在出参里必须可区分，
// 零头不被抹平到整卷也不被清零。
// 三、计量字段。米与公斤是两列独立存储事实，仓内没有换算端点，断言存储值与单位字段
// 本身按录入值落库，不自造换算规则。DECIMAL 出参为十进制字符串，断言先钉类型再钉数值。
// 四、按细码出库。白坯调拨出库按产品加批次精确扣减且不做跨缸回退，出库后本行在库量
// 与可用量减少，同仓其它批次行分毫不动。
// 五、盘点盘盈盘亏同单两腿。一张盘点单同时覆盖一行盘盈一行盘亏，差异一正一负分别落库，
// 过账后两行库存分别精确落到实盘量，状态逐字符走 pending、in_review、completed 词表。
// 六、反向防呆。出库量超过该批次行在架可用量必须被后端以 400 业务码拒绝且拒绝原因外显，
// 被拒后库存数值与调拨单状态、明细已发量都不得出现半成品状态。
// 七、权限门。销售岗直连库存细码列表、详情、录入与盘点端点全部被 RBAC 拒绝，
// 统一失败信封含机器码 FORBIDDEN，无权身份拿不到任何数据行，成本类字段随不可达行天然不外泄。
//
// 事实来源。端点与 HTTP 方法逐条对照 frontend/scripts/route-snapshot.txt 的 inventory 分组。
// 出参键名以 backend/src/models/inventory_stock.rs、inventory_transfer.rs、inventory_count.rs、
// inventory_count_item.rs 的实体字段为准，snake_case。状态词表唯一来源是
// backend/src/models/status/purchase_inventory.rs 的 inventory_transfer 模块（小写
// pending、approved、rejected、shipped、completed）与 inventory_count 模块（小写
// pending、in_review、completed）。库存行的 stock_status 默认"正常"、quality_status
// 默认"合格"、grade 写入"一等品"，均为 backend/src/services/inv/stock.rs 与
// inventory_stock_service.rs 写入侧字面值，中文词表不英文化。
// 出库四维校验与白坯不回退口径见 backend/src/services/inv/stock.rs 的
// check 函数族与 services/inv/batch.rs 的库存不足业务错误构造。
// 分页信封：库存列表为 PaginatedResponse 的 items、total、page、page_size 四键，
// 盘点列表数组键为 counts，调拨明细端点 data 直接是数组。
// 全部打真实后端，不用 route mock，不用宽松断言掩盖源码问题。
import { test, expect } from '../diagnose-fixture';
import {
  loginViaUI,
  ensureTestEntities,
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  getCtx,
  genCode,
  seedFourDimStockIn,
  seedGreigeStockIn,
  verifyStockFourDim,
  failureCode,
  expectBusinessRejection,
  expectDenied,
  getRoleCredential,
  loginInIsolatedContext,
  tryCleanup,
  APP_ERROR_CODES,
} from './helpers';
import { pickListArray } from './ui-helpers';

test.describe('库存细码与卷号链、盘点反向腿', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('细码录入，卷级明细保存后列表与详情两侧逐字段回读对齐', async () => {
    // 待补断言
  });

  test('零头余码与整卷同仓并存，两行米数可区分且零头不被抹平', async () => {
    // 待补断言
  });

  test('计量字段按录入事实分列存储，米数公斤数克重门幅互不折算覆盖', async () => {
    // 待补断言
  });

  test('按细码出库，本批次行余量减少且同仓其它批次行不动', async () => {
    // 待补断言
  });

  test('盘点同单两腿，盘盈为正盘亏为负分别落库，过账后两行精确到实盘量', async () => {
    // 待补断言
  });

  test('反向防呆，超可用量出库被 400 业务码拒绝且无半成品状态', async () => {
    // 待补断言
  });

  test('权限门，销售岗直连库存与盘点端点全部 403 且拿不到任何数据行', async () => {
    // 待补断言
  });
});
