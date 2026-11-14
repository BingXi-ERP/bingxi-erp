import { test, expect, type Page } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  loginViaUI,
} from './helpers';
import { pickListArray } from './ui-helpers';

/**
 * 社保公积金缴纳记录全生命周期写面与读面 — 514。
 *
 * 覆盖面。社保公积金域（V15 P1 batch-08 缺陷 23 落地的域）端点在配对门棘轮基线里
 * 全部孤儿：POST/GET 列表与详情、按工人按期间查询、确认缴纳、撤销、打印共 11 条
 * 零 e2e 引用。既有 54 号只走 UI 弹窗建一单再标记已缴（无落库契约回读），51 号只
 * 做列表健康探针，均未钉住五险一金自动计算的数值契约与状态机门。本文件把该域
 * 写面与读面钉成写后必回读的判据。
 *
 * 调用面（整串路径含 /api/v1/erp 前缀；挂载链 routes/mod.rs nest /api/v1/erp
 * 加 routes/social_insurance.rs 的 /social-insurance）：
 *   POST /api/v1/erp/social-insurance
 *   GET /api/v1/erp/social-insurance
 *   GET /api/v1/erp/social-insurance/{id}
 *   GET /api/v1/erp/social-insurance/by-worker/{worker_id}?period_year=&period_month=
 *   POST /api/v1/erp/social-insurance/{id}/mark-paid
 *   POST /api/v1/erp/social-insurance/{id}/cancel
 * 链路前置端点（本文件自建数据用，同为真实调用面）：
 *   GET /api/v1/erp/auth/me（worker_id 取当前会话用户 id；表列仅 NOT NULL 无外键，
 *   与 69 号体检档案取当前用户做 worker 的既有先例同源）
 *
 * 契约真相（逐段读后端源，非推测）。
 * 请求体字段面在 backend/src/services/social_insurance_service.rs：
 * CreateSocialInsuranceRequest 必填 worker_id 与 period_year 与 period_month 与
 * base_amount（缴费基数，必须落在默认费率配置的合规区间 [4250, 31884]，低于下限或
 * 高于上限都在任何写库前拒绝），payment_date 与 remarks 可空；带 payment_date 建单
 * 直落词表 paid，不带则落 pending。MarkPaidRequest 必填 payment_date。
 * 五险一金由服务端纯函数 calculate_insurance 按默认费率自动计算（费率常数
 * InsuranceRateConfig::default）：养老单位 16% 个人 8%；医疗单位 8% 个人 2%；
 * 失业单位 0.5% 个人 0.5%；工伤单位 0.4% 个人不缴；生育单位 1% 个人不缴；
 * 公积金单位 12% 个人 12%；单位合计=五险单位+公积金单位，个人合计=养老个人+
 * 医疗个人+失业个人+公积金个人。DECIMAL 列按 rust_decimal 出参为十进制字符串，
 * 比较一律 Number(String(v)) 归一。
 * 状态机：pending 待缴，mark-paid 后 paid，cancel 后 cancelled；仅 pending 可确认
 * 缴纳与撤销（服务层逐字符比较词表小写）；同工人同期间已有 pending 或 paid 记录时
 * 再建单被拒（唯一在缴门）。期间合法性：年份 2000 到 2100，月份 1 到 12，越界
 * bad_request。
 * 出参是实体全列 social_insurance_record（backend/src/models/social_insurance_record.rs），
 * 建单人 created_by 唯一来源是服务端会话身份（handler 不收请求体身份字段）。
 * 详情与确认与撤销三处写读面都有行级归属门：登记人不在当前会话数据范围报 403
 * 无权访问；本文件全部自建自用同会话，不会撞门。
 * 列表出参是 PaginatedResponse{items,total,page,page_size}（handler 用
 * serde_json::to_value(PaginatedResponse) 序列化），按工人按期间查询无记录时
 * data 为 null（Option<Model> 序列化）不报错。
 *
 * 假绿防线。每步写后按主键或按工人按期间独立回读逐列比对，不判接口 200 即通过；
 * 负例钉 HTTP 400 加机器码族（基数越界 business 族、期间越界 bad_request 族、
 * 状态门 business 族）；数据用唯一期间与 remarks 后缀隔离，并发 worker 互不干扰；
 * 社保记录无删除端点，属域内事实，不伪造清理。
 */

type Row = Record<string, unknown>;

/** 社保域前缀：routes/mod.rs nest /api/v1/erp 加 routes/social_insurance.rs /social-insurance */
const SI = '/social-insurance';

const num = (v: unknown): number => Number(String(v));

/**
 * 功能 判定时间列出参是真实时间字符串且可解析。
 * 调用方 本文件创建时间与更新时间两处的非空判定。
 * 入参 value 出参原始值。
 * 传给谁 结果直接进 expect(...).toBe(true)，判红消息由调用方给出。
 * 存什么 不存储。为什么不能只判长度：String(null) 得到字符串 null 同样非空，
 * 会把审计时间没落库读成落了值，故先判 typeof string 再判 Date.parse。
 * 存哪里 无。
 */
function isRealTimestamp(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

/**
 * 功能 生成当天 YYYY-MM-DD 日期串，作 payment_date 的缺省提交值。
 * 调用方 本文件 mark-paid 载荷。
 * 入参 无。
 * 传给谁 直接进 POST /social-insurance/{id}/mark-paid 请求体 payment_date 键。
 * 存什么 不存储，纯函数。
 * 存哪里 无。
 */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 功能 从会话取当前用户 id 作 worker_id（表列仅 NOT NULL 无外键，先例见 69 号体检档案）。
 * 调用方 本文件全部用例的建单载荷。
 * 入参 page 会话页；tag 用例编号，进断言消息前缀。
 * 传给谁 返回的 workerId 交建单与按工人查询两处。
 * 存什么 不存储。
 * 存哪里 无。
 */
async function currentWorkerId(page: Page, tag: string): Promise<number> {
  const me = await apiCallRaw<Row>(page, 'GET', '/auth/me');
  const workerId = Number(me.id);
  expect(
    Number.isFinite(workerId) && workerId > 0,
    `[${tag}] 会话未回用户 id（worker_id 取当前用户），实际 ${JSON.stringify(me)}`
  ).toBe(true);
  return workerId;
}

test.describe.serial('社保公积金缴纳记录写面：建单计算、确认缴纳、撤销与唯一在缴门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  // 以下用例随后补齐：建单全列计算回读、确认缴纳、撤销、唯一在缴门、基数越界门、期间越界门、按工人查询与悬空读面
});
