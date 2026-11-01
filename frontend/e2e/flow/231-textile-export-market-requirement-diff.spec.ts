/**
 * 纺织品安全送检单：目标市场加验口径的市场间差异与逐值对账
 *
 * 功能：用四枚同品种不同目标市场的送检单钉死"出口市场加验口径"在本域的真实落点——
 * 一，内销 dom 与出口 eu 与 jp 与 other 四档各建一单（均 adult 与 direct 与 GB18401_B 与 final，
 *    色号工艺互不相同，钉"同品种同色号同工艺"批次口径下单与单互不串）；
 * 二，推导项目清单后按口径分档钉死 needs_attention 字面值——dom 为 false（内销无出口口径缺口），
 *    eu 与 jp 为 true（市场触发出口组但单源无登记项目，scope_note 必须点名未推入），
 *    other 为 true（按词表口径不自动推要求集，点名需点名加验或登记项目）；
 * 三，详情读回按单钉出口要求差异：dom 与 other 为空集，eu 恰两行（OEKO-TEX 与 REACH），
 *    jp 恰一行（甲醛自主管控），逐行 requirement_code 与 market 与 standard_ref 与 mandatory 逐值对账；
 * 四，GET /textile-export-requirements 登记面按 market 过滤回读与详情内嵌集逐码同源；
 *    列表端点按 target_market 过滤逐值命中且词表外取值点名拒绝，证明"合规要求差异查得到"。
 *
 * 调用方：Playwright E2E 套件，由 CI 的 e2e flow 分片按文件哈希收集执行。
 * 入参：API_BASE 与 BASE_URL 取环境变量；角色凭证取 env 优先、回退 e2e/.auth/role-credentials.json；
 *      被测端点为 POST /textile-submissions、POST /textile-submissions/{id}/items、
 *      GET /textile-submissions/{id}、GET /textile-submissions?target_market、
 *      GET /textile-export-requirements?market、DELETE /textile-submissions/{id}、
 *      GET /product-categories 与 POST /products（admin 腿自建品种并清理回收）。
 * 传给谁：请求走 flow/helpers 的 apiCallRaw 与 apiCallExpectFail，列表信封形态用 ui-helpers 的
 *      pickListArray 显式声明，会话与跨棒标识走 fixtures/relay，不另造请求或判据实现。
 * 存什么：送检草稿 4 枚（逐枚目标市场 色号 工艺 与推入清单行归因与范围回显）、产品档案 1 枚。
 * 存哪里：PostgreSQL textile_safety_submission 与 textile_safety_submission_item 与 products 表；
 *      出口要求集为 m0112 种子迁移写入的 textile_export_market_requirement 表六行（本用例只读）。
 *
 * 【判据出处（文件名为准，行号随主干演进不写死）】
 * 市场加验推导：backend/src/services/textile_safety_submission_service.rs 的 generate_items
 *   （eu 与 us 与 jp 触发 EXPORT 组；other 与 dom 不触发；EXPORT 组空集与 other 不自动推两档都在
 *   scope_note 点名并置 needs_attention，不静默）；
 * 出口要求六行种子与逐值（REQ_OEKO_100_EU 与 REQ_REACH_SVHC_EU 与 REQ_JP_FORMALDEHYDE 的
 *   market 与 requirement_type 与 standard_ref 与 mandatory 取值）：
 *   backend/migration/src/domain/textile_safety/m0112_seed_textile_safety_matrix.rs；
 * 详情内嵌 market_requirements 的 dom 空集口径与登记面 market 过滤：
 *   backend/src/handlers/textile_safety_handler.rs 的 get_submission（dom 不查库直接空集，
 *   非 dom 按单上 target_market 查 textile_export_market_requirement）与
 *   backend/src/handlers/textile_safety_master_handler.rs 的 list_export_requirements；
 * 市场词表与越词表拒绝点名：backend/src/models/status/textile_safety.rs 的 export_market；
 * 登记面 market 取值域（不含 dom，内销不挂出口要求）：m0111 对
 *   textile_export_market_requirement.market 的 CHECK 词表 eu,us,jp,other。
 *
 * 【本文件不覆盖什么】
 * 判定链与完整性门在 232 专项；安全类别词表正反两面的拒绝与残留检查在 230 专项；
 * 多角色权限与可见性在 233 专项；us 市场种子行（CPSIA 三行）与 jp 行同表同门，
 * 本用例取 eu 两行与 jp 一行即钉住过滤与内嵌两路同源。
 */
import { test, expect } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  expectStateGateRejection,
  failureCode,
  genCode,
} from './helpers';
import { pickListArray } from './ui-helpers';
import { createRelay } from '../fixtures/relay';

type Row = Record<string, unknown>;

/** 四档目标市场码（dom 内销与 eu 欧盟与 jp 日本与 other 其它） */
const MARKET_DOM = 'dom';
const MARKET_EU = 'eu';
const MARKET_JP = 'jp';
const MARKET_OTHER = 'other';
/** GB 18401 基本安全项目编码集（十枚，m0112 种子在册，清单比对唯一基准） */
const GB18401_ITEM_CODES = [
  'AZO',
  'FAST_ACID_SWEAT',
  'FAST_ALKALI_SWEAT',
  'FAST_DRY_RUB',
  'FAST_SALIVA',
  'FAST_WATER',
  'FAST_WET_RUB',
  'HCHO',
  'ODOR',
  'PH',
].sort();
/** 出口要求登记行逐值基准（与 m0112 种子逐字符一致，登记面与内嵌面同源对账） */
const REQ_OEKO = 'REQ_OEKO_100_EU';
const REQ_REACH = 'REQ_REACH_SVHC_EU';
const REQ_JP = 'REQ_JP_FORMALDEHYDE';
/** 各市场应见登记行数（内销零行、欧两行、日一行、其它零行——other 不自动推要求集） */
const REQUIREMENT_COUNT_DOM = 0;
const REQUIREMENT_COUNT_EU = 2;
const REQUIREMENT_COUNT_JP = 1;
const REQUIREMENT_COUNT_OTHER = 0;

test.describe.serial('纺织品安全：目标市场加验口径四档差异、内嵌与登记面逐值同源', () => {
  test('四档市场建单推项，详情出口要求集逐值对账且与登记面过滤同源', async ({ browser }) => {
    const relay = await createRelay(browser);
    try {
      await relay.runSteps([
        {
          role: 'admin',
          label: '管理员建四单共用品种并清理回收',
          run: async ({ session }) => {
            const cats = await apiCallRaw<{ items?: Row[] }>(
              session.page,
              'GET',
              '/product-categories'
            );
            const categoryId = Number(cats?.items?.[0]?.id);
            expect(
              Number.isFinite(categoryId) && categoryId > 0,
              `必须取到已种产品分类作建档来源，实际首行=${JSON.stringify(cats?.items?.[0])?.slice(0, 200)}`
            ).toBe(true);

            const productName = genCode('E2E-TS3-FABRIC');
            const created = await apiCallRaw<Row>(session.page, 'POST', '/products', {
              name: productName,
              category_id: categoryId,
              unit: '米',
              product_type: '辅料',
              status: 'active',
            });
            const productId = Number(created?.id);
            expect(
              Number.isFinite(productId) && productId > 0,
              `建档应返回主键，实际=${JSON.stringify(created)?.slice(0, 200)}`
            ).toBe(true);

            // 自建自读：只信创建回执会把"给了 id 但行没落"读成成功
            const back = await apiCallRaw<Row>(session.page, 'GET', `/products/${productId}`);
            expect(
              String(back?.name ?? ''),
              `按 id 回读品名应逐字符等于写入值 ${productName}，实际=${JSON.stringify(back?.name)}`
            ).toBe(productName);
            expect(
              String(back?.status ?? ''),
              `产品状态应落 active（products 无 created_by 列，建档人会话注入不在本用例钉，见 230 送检单 created_by），实际=${JSON.stringify(back?.status)}`
            ).toBe('active');

            return {
              artifacts: [
                { key: 'productId', value: productId },
                { key: 'productName', value: productName },
              ],
              // 清理位：产品被四枚送检单外键引用，必须等 qc 腿删净草稿后回收（URL 字面量写在调用点）
              cleanup: [
                {
                  method: 'DELETE',
                  path: `/products/${productId}`,
                  label: '回收市场口径用例自建品种',
                },
              ],
            };
          },
        },
        {
          role: 'qc_manager',
          label: '质量经理四档市场建单推项并按详情与登记面逐值对账',
          run: async ({ session, require, registerCleanup }) => {
            const productId = Number(require('productId'));

            const mkBody = (
              tag: string,
              market: string,
              colorSuffix: string,
              processSuffix: string
            ): Row => ({
              submission_no: genCode(`E2E-TS3-${tag.toUpperCase()}`),
              product_id: productId,
              color_no: genCode(`E2E-TS3-COLOR-${colorSuffix}`),
              process_no: genCode(`E2E-TS3-PROC-${processSuffix}`),
              end_user_group: 'adult',
              contact_type: 'direct',
              safety_category: 'GB18401_B',
              product_form: 'final',
              target_market: market,
              remarks: `市场加验口径专项单 ${tag}`,
            });

            const domBody = mkBody('dom', MARKET_DOM, 'DOM', 'DOM');
            const euBody = mkBody('eu', MARKET_EU, 'EU', 'EU');
            const jpBody = mkBody('jp', MARKET_JP, 'JP', 'JP');
            const otherBody = mkBody('other', MARKET_OTHER, 'OTH', 'OTH');

            const domCreated = await apiCallRaw<Row>(
              session.page,
              'POST',
              '/textile-submissions',
              domBody
            );
            const euCreated = await apiCallRaw<Row>(
              session.page,
              'POST',
              '/textile-submissions',
              euBody
            );
            const jpCreated = await apiCallRaw<Row>(
              session.page,
              'POST',
              '/textile-submissions',
              jpBody
            );
            const otherCreated = await apiCallRaw<Row>(
              session.page,
              'POST',
              '/textile-submissions',
              otherBody
            );
            const domId = Number(domCreated?.id);
            const euId = Number(euCreated?.id);
            const jpId = Number(jpCreated?.id);
            const otherId = Number(otherCreated?.id);
            for (const [tag, id] of [
              ['dom', domId],
              ['eu', euId],
              ['jp', jpId],
              ['other', otherId],
            ] as const) {
              expect(
                Number.isFinite(id) && id > 0,
                `${tag} 市场建单应返回主键，实际=${JSON.stringify({ domId, euId, jpId, otherId })}`
              ).toBe(true);
            }
            expect(
              String(euCreated?.target_market),
              `eu 腿回执目标市场应逐字符等于写入值 eu，实际=${JSON.stringify(euCreated?.target_market)}`
            ).toBe(MARKET_EU);

            // 清理位（调用点写全 URL 字面量，收进 helper 体内会让覆盖判定器错绑实参）
            for (const id of [domId, euId, jpId, otherId]) {
              registerCleanup({
                method: 'DELETE',
                path: `/textile-submissions/${id}`,
                label: `回收市场口径草稿 ${id}`,
              });
            }

            // 推项分档钉 needs_attention 字面值（布尔先行放行即假绿，字面量逐档钉）
            const gd = await apiCallRaw<{
              items: unknown[];
              scope_note: string;
              needs_attention: boolean;
            }>(session.page, 'POST', `/textile-submissions/${domId}/items`, {});
            expect(
              gd?.needs_attention,
              `内销单无出口口径缺口，needs_attention 应恰为 false，实际=${JSON.stringify(gd?.needs_attention)}`
            ).toBe(false);
            expect(
              String(gd?.scope_note ?? '').includes(`市场 ${MARKET_DOM} 口径下推入 10 行`),
              `dom 单范围回显应点名"市场 dom 口径下推入 10 行"，实际=${JSON.stringify(gd?.scope_note)}`
            ).toBe(true);

            const ge = await apiCallRaw<{
              items: unknown[];
              scope_note: string;
              needs_attention: boolean;
            }>(session.page, 'POST', `/textile-submissions/${euId}/items`, {});
            expect(
              ge?.needs_attention,
              `eu 单触发出口组但单源无登记项目，needs_attention 应恰为 true，实际=${JSON.stringify(ge?.needs_attention)}`
            ).toBe(true);
            expect(
              String(ge?.scope_note ?? '').includes('本次未推入任何出口加验项'),
              `eu 单范围回显必须点名"本次未推入任何出口加验项"（空集不静默），实际=${JSON.stringify(ge?.scope_note)}`
            ).toBe(true);

            const gj = await apiCallRaw<{
              items: unknown[];
              scope_note: string;
              needs_attention: boolean;
            }>(session.page, 'POST', `/textile-submissions/${jpId}/items`, {});
            expect(
              gj?.needs_attention,
              `jp 单与 eu 同档触发，needs_attention 应恰为 true，实际=${JSON.stringify(gj?.needs_attention)}`
            ).toBe(true);

            const go = await apiCallRaw<{
              items: unknown[];
              scope_note: string;
              needs_attention: boolean;
            }>(session.page, 'POST', `/textile-submissions/${otherId}/items`, {});
            expect(
              go?.needs_attention,
              `other 单按词表口径不自动推要求集，needs_attention 应恰为 true，实际=${JSON.stringify(go?.needs_attention)}`
            ).toBe(true);
            expect(
              String(go?.scope_note ?? '').includes('不自动推'),
              `other 单范围回显应点名"不自动推要求集"，实际=${JSON.stringify(go?.scope_note)}`
            ).toBe(true);

            // 清单本体两档对账：触发出口的 eu 与不触发的 other 都只剩 GB18401 十枚（EXPORT 组空集），
            // 归因逐行等值，证明差异走 scope_note 与 needs_attention 通道而非静默改集合
            const euCodes = ((ge?.items ?? []) as Row[])
              .map(r => String(r.item_code))
              .sort();
            expect(
              euCodes.join(','),
              `eu 单清单项编码集应恰为 GB18401 十枚（EXPORT 组在单源为空集），实际=${euCodes.join(',')}`
            ).toBe(GB18401_ITEM_CODES.join(','));
            const euSources = ((ge?.items ?? []) as Row[]).map(r => String(r.source));
            expect(
              Array.from(new Set(euSources)).join(','),
              `eu 单清单归因去重后应只有 GB18401（没有静默挂上 EXPORT 归因），实际=${euSources.join(',')}`
            ).toBe('GB18401');
            const otherRows = (go?.items ?? []) as Row[];
            expect(
              otherRows.length,
              `other 单清单行数应为 10（内销同档），实际=${otherRows.length}`
            ).toBe(10);

            // 详情读回：内嵌出口要求集按市场分档逐值钉
            const domDetail = await apiCallRaw<{
              submission: Row;
              market_requirements: unknown[];
            }>(session.page, 'GET', `/textile-submissions/${domId}`);
            expect(
              (domDetail?.market_requirements ?? []).length,
              `内销单不挂出口要求，market_requirements 应恰 ${REQUIREMENT_COUNT_DOM} 行，实际=${JSON.stringify(domDetail?.market_requirements)?.slice(0, 200)}`
            ).toBe(REQUIREMENT_COUNT_DOM);
            expect(
              String(domDetail?.submission?.target_market),
              `dom 单详情回读市场应等于 ${MARKET_DOM}，实际=${JSON.stringify(domDetail?.submission?.target_market)}`
            ).toBe(MARKET_DOM);

            const euDetail = await apiCallRaw<{
              submission: Row;
              market_requirements: Row[];
            }>(session.page, 'GET', `/textile-submissions/${euId}`);
            const euReqs = euDetail?.market_requirements ?? [];
            expect(
              euReqs.length,
              `eu 单内嵌出口要求应恰 ${REQUIREMENT_COUNT_EU} 行（OEKO 与 REACH 种子在册），实际=${euReqs.length} 行：${JSON.stringify(euReqs)?.slice(0, 300)}`
            ).toBe(REQUIREMENT_COUNT_EU);
            const oeko = euReqs.find(r => String(r.requirement_code) === REQ_OEKO);
            expect(
              oeko ? String(oeko.requirement_type) : '<缺行>',
              `${REQ_OEKO} 行 requirement_type 应逐字符等于 oeko_tex，实际=${JSON.stringify(oeko)}`
            ).toBe('oeko_tex');
            expect(
              oeko ? String(oeko.standard_ref) : '<缺行>',
              `${REQ_OEKO} 行 standard_ref 应逐字符等于 OEKO-TEX STANDARD 100，实际=${JSON.stringify(oeko?.standard_ref)}`
            ).toBe('OEKO-TEX STANDARD 100');
            expect(
              oeko ? oeko.mandatory : '<缺行>',
              `${REQ_OEKO} 为自愿认证，mandatory 应逐字符为 false，实际=${JSON.stringify(oeko?.mandatory)}`
            ).toBe(false);
            expect(
              oeko ? String(oeko.market) : '<缺行>',
              `${REQ_OEKO} 行 market 应等于 ${MARKET_EU}，实际=${JSON.stringify(oeko?.market)}`
            ).toBe(MARKET_EU);
            const reach = euReqs.find(r => String(r.requirement_code) === REQ_REACH);
            expect(
              reach ? String(reach.requirement_type) : '<缺行>',
              `${REQ_REACH} 行 requirement_type 应逐字符等于 reach_svhc，实际=${JSON.stringify(reach)}`
            ).toBe('reach_svhc');
            expect(
              reach ? reach.mandatory : '<缺行>',
              `${REQ_REACH} 为强制义务，mandatory 应逐字符为 true，实际=${JSON.stringify(reach?.mandatory)}`
            ).toBe(true);

            const jpDetail = await apiCallRaw<{ market_requirements: Row[] }>(
              session.page,
              'GET',
              `/textile-submissions/${jpId}`
            );
            const jpReqs = jpDetail?.market_requirements ?? [];
            expect(
              jpReqs.length,
              `jp 单内嵌出口要求应恰 ${REQUIREMENT_COUNT_JP} 行（甲醛自主管控），实际=${jpReqs.length}：${JSON.stringify(jpReqs)?.slice(0, 300)}`
            ).toBe(REQUIREMENT_COUNT_JP);
            expect(
              String(jpReqs[0]?.requirement_code),
              `jp 行编码应为 ${REQ_JP}，实际=${JSON.stringify(jpReqs[0]?.requirement_code)}`
            ).toBe(REQ_JP);
            expect(
              String(jpReqs[0]?.requirement_type),
              `${REQ_JP} 行 requirement_type 应为 jp_formaldehyde，实际=${JSON.stringify(jpReqs[0]?.requirement_type)}`
            ).toBe('jp_formaldehyde');
            expect(
              jpReqs[0]?.mandatory,
              `${REQ_JP} 为强制口径，mandatory 应为 true，实际=${JSON.stringify(jpReqs[0]?.mandatory)}`
            ).toBe(true);

            const otherDetail = await apiCallRaw<{ market_requirements: unknown[] }>(
              session.page,
              'GET',
              `/textile-submissions/${otherId}`
            );
            expect(
              (otherDetail?.market_requirements ?? []).length,
              `other 单内嵌出口要求应恰 ${REQUIREMENT_COUNT_OTHER} 行（other 无登记行），实际=${JSON.stringify(otherDetail?.market_requirements)?.slice(0, 200)}`
            ).toBe(REQUIREMENT_COUNT_OTHER);

            // 登记面过滤与内嵌逐码同源（同一市场两通道读到的编码集必须相等）
            const euPage = await apiCallRaw<unknown>(
              session.page,
              'GET',
              `/textile-export-requirements?market=${MARKET_EU}`
            );
            const euReqRows = pickListArray<Row>(euPage, 'requirements', 'eu 市场登记面过滤');
            expect(
              euReqRows.map(r => String(r.requirement_code)).sort().join(','),
              `登记面 market=eu 编码集应与内嵌面同源 [${REQ_OEKO},${REQ_REACH}]，实际=${euReqRows.map(r => String(r.requirement_code)).sort().join(',')}`
            ).toBe([REQ_OEKO, REQ_REACH].sort().join(','));
            const jpPage = await apiCallRaw<unknown>(
              session.page,
              'GET',
              `/textile-export-requirements?market=${MARKET_JP}`
            );
            const jpReqRows = pickListArray<Row>(jpPage, 'requirements', 'jp 市场登记面过滤');
            expect(
              jpReqRows.length,
              `登记面 market=jp 应恰一行，实际=${jpReqRows.length}`
            ).toBe(REQUIREMENT_COUNT_JP);
            expect(
              String(jpReqRows[0]?.requirement_code),
              `登记面 jp 首行编码应为 ${REQ_JP}，实际=${JSON.stringify(jpReqRows[0]?.requirement_code)}`
            ).toBe(REQ_JP);
            const domPage = await apiCallRaw<unknown>(
              session.page,
              'GET',
              `/textile-export-requirements?market=${MARKET_DOM}`
            );
            const domReqRows = pickListArray<Row>(domPage, 'requirements', 'dom 市场登记面过滤');
            expect(
              domReqRows.length,
              `内销不挂出口要求（登记面 market=dom 应零行，取值域本身不含 dom），实际=${domReqRows.length}`
            ).toBe(0);

            // 送检单列表按 target_market 过滤逐值命中（合规差异"查得到"的过滤通道）
            const euFiltered = await apiCallRaw<{ items: Row[]; total: number }>(
              session.page,
              'GET',
              `/textile-submissions?target_market=${MARKET_EU}&product_id=${productId}&page=1&page_size=20`
            );
            expect(
              (euFiltered?.items ?? []).map(r => Number(r.id)).sort((a, b) => a - b).join(','),
              `target_market=eu 过滤应命中且只命中本用例 eu 单 ${euId}，实际=${JSON.stringify((euFiltered?.items ?? []).map(r => r.id))}`
            ).toBe(String(euId));
            const domFiltered = await apiCallRaw<{ items: Row[] }>(
              session.page,
              'GET',
              `/textile-submissions?target_market=${MARKET_DOM}&product_id=${productId}&page=1&page_size=20`
            );
            expect(
              (domFiltered?.items ?? []).map(r => Number(r.id)).sort((a, b) => a - b).join(','),
              `target_market=dom 过滤应命中且只命中本用例 dom 单 ${domId}（jp 与 other 不得混入），实际=${JSON.stringify((domFiltered?.items ?? []).map(r => r.id))}`
            ).toBe(String(domId));

            // 市场词表外过滤点名合法集（拒绝只回 400 不兜底空集）
            const badMarket = await apiCallExpectFail(
              session.page,
              'GET',
              `/textile-submissions?target_market=${encodeURIComponent('欧盟')}&page=1&page_size=20`
            );
            expectStateGateRejection(badMarket, '市场过滤越词表应被拒');
            expect(
              String(badMarket.message ?? '').includes('dom,eu,us,jp,other'),
              `市场过滤拒绝应点名合法集 dom,eu,us,jp,other，实际 message=${JSON.stringify(badMarket.message)}`
            ).toBe(true);

            return {
              artifacts: [
                { key: 'domId', value: domId },
                { key: 'euId', value: euId },
                { key: 'jpId', value: jpId },
                { key: 'otherId', value: otherId },
              ],
            };
          },
        },
        {
          role: 'quality_inspector',
          label: '质检员独立复核四档市场内嵌集与清理归零',
          run: async ({ session, require }) => {
            const domId = Number(require('domId'));
            const euId = Number(require('euId'));
            const jpId = Number(require('jpId'));
            const otherId = Number(require('otherId'));
            const domDetail = await apiCallRaw<{ market_requirements: unknown[] }>(
              session.page,
              'GET',
              `/textile-submissions/${domId}`
            );
            expect(
              (domDetail?.market_requirements ?? []).length,
              `第二身份复核 dom 内嵌集应仍为 0 行（读面同口径），实际=${JSON.stringify(domDetail?.market_requirements)?.slice(0, 200)}`
            ).toBe(0);
            const euDetail = await apiCallRaw<{ market_requirements: Row[] }>(
              session.page,
              'GET',
              `/textile-submissions/${euId}`
            );
            expect(
              (euDetail?.market_requirements ?? []).length,
              `第二身份复核 eu 内嵌集应仍为 ${REQUIREMENT_COUNT_EU} 行，实际=${euDetail?.market_requirements?.length}`
            ).toBe(REQUIREMENT_COUNT_EU);
            const jpDetail = await apiCallRaw<{ market_requirements: Row[] }>(
              session.page,
              'GET',
              `/textile-submissions/${jpId}`
            );
            expect(
              (jpDetail?.market_requirements ?? []).length,
              `第二身份复核 jp 内嵌集应仍为 ${REQUIREMENT_COUNT_JP} 行，实际=${jpDetail?.market_requirements?.length}`
            ).toBe(REQUIREMENT_COUNT_JP);
            const otherDetail = await apiCallRaw<{ market_requirements: unknown[] }>(
              session.page,
              'GET',
              `/textile-submissions/${otherId}`
            );
            expect(
              (otherDetail?.market_requirements ?? []).length,
              `第二身份复核 other 内嵌集应仍为 0 行，实际=${JSON.stringify(otherDetail?.market_requirements)?.slice(0, 200)}`
            ).toBe(0);

            return {
              artifacts: [{ key: 'crossCheckedMarkets', value: 'dom eu jp other 四档两身份同口径' }],
            };
          },
        },
      ]);

      // 链尾对账：三个真身份各就各位
      const userIds = relay.sessions.map(s => s.userId);
      expect(new Set(userIds).size, `三棒应三个不同用户，实际=${userIds.join(', ')}`).toBe(3);
      for (const key of ['domId', 'euId', 'jpId', 'otherId']) {
        expect(
          Number(relay.artifacts[key]) > 0,
          `链上应登记 ${key} 供复核棒读取，实际=${JSON.stringify(relay.artifacts[key])}`
        ).toBe(true);
      }
    } finally {
      await relay.close();
    }
  });
});
