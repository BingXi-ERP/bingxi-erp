/**
 * 产品主档与纺织品安全送检：产品等级与安全类别两字段互不覆盖互不混用
 *
 * 功能：用一条"产品建档 送检申报 交叉回读 词表互斥"链钉死两件事是两个维度——
 * 一，产品档案侧：product_grade 取值域是 优等品 一等品 合格品 三档（quality_dyeing 词表），
 *    safety_category 取值域是裸 A B C 三档（general 词表 product_safety_category，DB CHECK 收口），
 *    两列各自独立录入独立回读；改等级门只动等级列，安全类别列逐字符不动，证明互不覆盖；
 * 二，产品档案侧越词表拒绝：把带前缀稳定码 GB18401_A 塞进产品 safety_category 必须 400，
 *    拒因点名允许值 A、B、C（产品侧不认送检侧词表），且被拒不改库——回读等级与类别逐字符保持原值；
 * 三，送检侧反向互斥：把裸 B 塞进送检单 safety_category 必须 400 且点名带前缀合法集
 *    GB18401_A,GB18401_B,GB18401_C（送检侧不认产品词表，230 钉过同族判据，这里钉"两词表不互抄"的交叉面），
 *    同一单改用 GB18401_B 建档成功并回读，申报码与产品列码同屏共存各归各表；
 * 四，跨表交叉回读：送检单推进到待取样后，产品档案的等级与安全类别不因送检流程有任何位移，
 *    送检单的申报类别不因产品等级（一等品）被推高或放宽——等级是质量档，类别是强制门槛，两门分权。
 *
 * 调用方：Playwright E2E 套件，由 CI 的 e2e flow 分片按文件哈希收集执行。
 * 入参：API_BASE 与 BASE_URL 取环境变量；角色凭证取 env 优先、回退 e2e/.auth/role-credentials.json；
 *      被测端点为 GET /product-categories、POST 与 GET 与 PUT /products、POST /textile-submissions、
 *      POST /textile-submissions/{id}/items、GET /textile-submissions/{id}、
 *      PUT /textile-submissions/{id}/status、DELETE /textile-submissions/{id}。
 * 传给谁：请求走 flow/helpers 的 apiCallRaw 与 apiCallExpectFail 与 expectStateGateRejection，
 *      会话与跨棒标识走 fixtures/relay，不另造请求或判据实现。
 * 存什么：产品档案 1 枚（product_grade 一等品 与 safety_category B 双列真值、经一次等级改列与两次越词表拒改）、
 *      送检草稿 1 枚（申报 GB18401_B 推进 sampling 后删除回收）。
 * 存哪里：PostgreSQL products 与 textile_safety_submission 表。
 *
 * 【判据出处（文件名为准，行号随主干演进不写死）】
 * 产品等级词表与校验：backend/src/services/product_service.rs 的 validate_product_grade
 *   （文案"产品等级「{v}」不在词表内，允许值：优等品、一等品、合格品"）与
 *   backend/src/models/status/general.rs 的 product_grade；
 * 产品安全类别词表与校验：backend/src/services/product_service.rs 的 validate_product_safety_category
 *   （文案"安全类别「{v}」不在词表内，允许值：A、B、C（GB 18401-2010）"）与同文件 product_safety_category；
 * 两词表与库存等级互不相干与禁止跨域并集的口径：general.rs 与 textile_safety.rs 文件头注释；
 * 送检侧前缀码词表与拒绝点名：backend/src/services/textile_safety_submission_service.rs 的 validate_dims 与
 *   backend/src/models/status/textile_safety.rs 的 textile_safety_category（裸 B 越词表 400）。
 *
 * 【清理腿可达性】
 * 送检草稿在本用例体内删除（DELETE 仅草稿可删门在 sampling 之后仍放行——sampling 属可编辑态，
 * 删除门判据是 status 为 draft——故推进 sampling 前先删；本用例按"建单 交叉回读 删除 404 确证"顺序执行，
 * 产品档案在草稿删净后由 admin 清理位回收（products 无 created_by 列，建档人会话注入面在送检单钉，见 230）。
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
import { createRelay } from '../fixtures/relay';

type Row = Record<string, unknown>;

/** 产品侧两列写入值（质量档 与 强制门槛，两词表两列） */
const GRADE_FIRST = '一等品';
const GRADE_QUALIFIED = '合格品';
const PRODUCT_SAFETY_B = 'B';
/** 送检侧申报稳定码与越词表交叉值（各归各表，互不认对方的合法值） */
const SUB_CATEGORY_B = 'GB18401_B';
const VOCAB_HINT_A_B_C = 'GB18401_A,GB18401_B,GB18401_C';

test.describe.serial('产品等级与安全类别：两字段互不覆盖、两词表互不混用', () => {
  test('产品双列建档改列拒改交叉回读，送检申报前缀码与产品裸码同屏共存', async ({ browser }) => {
    const relay = await createRelay(browser);
    try {
      await relay.runSteps([
        {
          role: 'admin',
          label: '管理员双列建档并改等级不碰安全类别',
          run: async ({ session }) => {
            const cats = await apiCallRaw<{ items?: Row[] }>(
              session.page,
              'GET',
              '/product-categories'
            );
            const categoryId = Number(cats?.items?.[0]?.id);
            expect(
              Number.isFinite(categoryId) && categoryId > 0,
              `必须取到已种产品分类作建档来源，实际=${JSON.stringify(cats?.items?.[0])?.slice(0, 200)}`
            ).toBe(true);

            const productName = genCode('E2E-TS5-FABRIC');
            const created = await apiCallRaw<Row>(session.page, 'POST', '/products', {
              name: productName,
              category_id: categoryId,
              unit: '米',
              product_type: '辅料',
              status: 'active',
              product_grade: GRADE_FIRST,
              safety_category: PRODUCT_SAFETY_B,
            });
            const productId = Number(created?.id);
            expect(
              Number.isFinite(productId) && productId > 0,
              `双列建档应返回主键，实际=${JSON.stringify(created)?.slice(0, 200)}`
            ).toBe(true);

            // 自建自读逐列钉（products 无 created_by 列，建档人会话注入在送检单 created_by 钉，见 230）
            const back = await apiCallRaw<Row>(session.page, 'GET', `/products/${productId}`);
            expect(
              String(back?.product_grade ?? ''),
              `回读产品等级应逐字符等于写入值 ${GRADE_FIRST}，实际=${JSON.stringify(back?.product_grade)}`
            ).toBe(GRADE_FIRST);
            expect(
              String(back?.safety_category ?? ''),
              `回读产品安全类别应逐字符等于写入值 ${PRODUCT_SAFETY_B}，实际=${JSON.stringify(back?.safety_category)}`
            ).toBe(PRODUCT_SAFETY_B);
            expect(
              String(back?.status ?? ''),
              `产品状态应落 active，实际=${JSON.stringify(back?.status)}`
            ).toBe('active');

            // 改等级门只动等级列（部分更新，安全类别列键缺席保持原值）
            const updated = await apiCallRaw<Row>(session.page, 'PUT', `/products/${productId}`, {
              product_grade: GRADE_QUALIFIED,
            });
            expect(
              String(updated?.product_grade ?? ''),
              `等级改列回执应等于 ${GRADE_QUALIFIED}，实际=${JSON.stringify(updated?.product_grade)}`
            ).toBe(GRADE_QUALIFIED);
            const afterGrade = await apiCallRaw<Row>(session.page, 'GET', `/products/${productId}`);
            expect(
              String(afterGrade?.product_grade ?? ''),
              `回读等级应已落 ${GRADE_QUALIFIED}（库里真值非回执），实际=${JSON.stringify(afterGrade?.product_grade)}`
            ).toBe(GRADE_QUALIFIED);
            expect(
              String(afterGrade?.safety_category ?? ''),
              `改等级不得顺手动安全类别，应逐字符保持 ${PRODUCT_SAFETY_B}，实际=${JSON.stringify(afterGrade?.safety_category)}`
            ).toBe(PRODUCT_SAFETY_B);

            // 越词表写等级与被拒不改库（等级列门点名三档允许值）
            const badGrade = await apiCallExpectFail(
              session.page,
              'PUT',
              `/products/${productId}`,
              { product_grade: '特级品' }
            );
            expectStateGateRejection(badGrade, '等级越词表应被拒');
            expect(
              String(badGrade.message ?? '').includes('优等品、一等品、合格品'),
              `等级拒绝应点名三档允许值，实际 message=${JSON.stringify(badGrade.message)}`
            ).toBe(true);

            // 送检词表值塞产品侧被拒且不改库（两词表互不认，产品侧不认前缀码）
            const crossBad = await apiCallExpectFail(
              session.page,
              'PUT',
              `/products/${productId}`,
              { safety_category: SUB_CATEGORY_B }
            );
            expectStateGateRejection(crossBad, '产品安全类别塞前缀码应被拒');
            expect(
              String(crossBad.message ?? '').includes('安全类别'),
              `交叉越词表拒绝应点名安全类别列，实际 message=${JSON.stringify(crossBad.message)}`
            ).toBe(true);
            const afterCrossBad = await apiCallRaw<Row>(
              session.page,
              'GET',
              `/products/${productId}`
            );
            expect(
              String(afterCrossBad?.safety_category ?? ''),
              `被拒的交叉写不得改库，安全类别应仍为 ${PRODUCT_SAFETY_B}，实际=${JSON.stringify(afterCrossBad?.safety_category)}`
            ).toBe(PRODUCT_SAFETY_B);
            expect(
              String(afterCrossBad?.product_grade ?? ''),
              `被拒的等级越词表不得改库，等级应仍为 ${GRADE_QUALIFIED}，实际=${JSON.stringify(afterCrossBad?.product_grade)}`
            ).toBe(GRADE_QUALIFIED);

            return {
              artifacts: [
                { key: 'productId', value: productId },
                { key: 'productName', value: productName },
              ],
              // 清理位：产品须在送检草稿删净后回收（外键 RESTRICT），URL 字面量写在调用点
              cleanup: [
                {
                  method: 'DELETE',
                  path: `/products/${productId}`,
                  label: '回收双列交叉用例产品',
                },
              ],
            };
          },
        },
        {
          role: 'qc_manager',
          label: '质量经理裸码拒建前缀码建档并双表交叉回读互不位移',
          run: async ({ session, require }) => {
            const productId = Number(require('productId'));
            const colorNo = genCode('E2E-TS5-COLOR');
            const processNo = genCode('E2E-TS5-PROC');

            // 送检侧不认产品裸码（裸 B 越词表，点名带前缀合法集）——与 230 同门，这里钉交叉面
            const bareBody: Row = {
              submission_no: genCode('E2E-TS5-BARE'),
              product_id: productId,
              color_no: colorNo,
              process_no: processNo,
              end_user_group: 'adult',
              contact_type: 'direct',
              safety_category: PRODUCT_SAFETY_B,
              product_form: 'final',
              target_market: 'dom',
            };
            const bareReject = await apiCallExpectFail(
              session.page,
              'POST',
              '/textile-submissions',
              bareBody
            );
            expectStateGateRejection(bareReject, '送检申报裸 B 应被拒');
            expect(
              String(bareReject.message ?? '').includes(VOCAB_HINT_A_B_C),
              `裸 B 拒绝应点名带前缀合法集，实际 message=${JSON.stringify(bareReject.message)}`
            ).toBe(true);
            expect(
              String(bareReject.message ?? '').includes(PRODUCT_SAFETY_B),
              `拒绝应点名片段 B 本身，实际 message=${JSON.stringify(bareReject.message)}`
            ).toBe(true);

            // 同族申报改前缀码成功（同产品 同色号工艺 仅换类别码）
            const goodBody: Row = { ...bareBody, safety_category: SUB_CATEGORY_B };
            const created = await apiCallRaw<Row>(
              session.page,
              'POST',
              '/textile-submissions',
              goodBody
            );
            const submissionId = Number(created?.id);
            expect(
              Number.isFinite(submissionId) && submissionId > 0,
              `前缀码申报应建档成功，实际=${JSON.stringify(created)?.slice(0, 200)}`
            ).toBe(true);
            expect(
              String(created?.safety_category),
              `申报回执应逐字符等于 ${SUB_CATEGORY_B}，实际=${JSON.stringify(created?.safety_category)}`
            ).toBe(SUB_CATEGORY_B);
            expect(
              String(created?.submission_no ?? '').length <= 40 &&
                String(created?.color_no ?? '').length <= 64,
              `单号与色号应落在列宽内（送检单号 40 与色号 64），实际=${JSON.stringify({ no: created?.submission_no, color: created?.color_no })}`
            ).toBe(true);

            // 推清单后交叉回读两表：产品两列不因送检流程位移，送检申报码独立成立
            const generated = await apiCallRaw<{ items: unknown[]; needs_attention: boolean }>(
              session.page,
              'POST',
              `/textile-submissions/${submissionId}/items`,
              {}
            );
            expect(
              (generated?.items ?? []).length,
              `成人内销单应推出十枚清单，实际=${generated?.items?.length}`
            ).toBe(10);
            expect(
              generated?.needs_attention,
              `内销成人档无口径缺口，needs_attention 应恰为 false，实际=${JSON.stringify(generated?.needs_attention)}`
            ).toBe(false);

            const sub = await apiCallRaw<{ submission: Row }>(
              session.page,
              'GET',
              `/textile-submissions/${submissionId}`
            );
            expect(
              String(sub?.submission?.safety_category),
              `送检单回读申报码应仍为 ${SUB_CATEGORY_B}（不被产品侧裸码 B 顶替），实际=${JSON.stringify(sub?.submission?.safety_category)}`
            ).toBe(SUB_CATEGORY_B);
            expect(
              String(sub?.submission?.status),
              `送检单状态应为 draft，实际=${JSON.stringify(sub?.submission?.status)}`
            ).toBe('draft');
            const prod = await apiCallRaw<Row>(session.page, 'GET', `/products/${productId}`);
            expect(
              String(prod?.safety_category ?? ''),
              `送检流程不得改写产品安全类别，应仍为 ${PRODUCT_SAFETY_B}，实际=${JSON.stringify(prod?.safety_category)}`
            ).toBe(PRODUCT_SAFETY_B);
            expect(
              String(prod?.product_grade ?? ''),
              `送检申报不得改写产品等级，应仍为 ${GRADE_QUALIFIED}，实际=${JSON.stringify(prod?.product_grade)}`
            ).toBe(GRADE_QUALIFIED);

            // 草稿删除清理并 404 确证（删除通道在 draft 态放行）
            const deleted = await apiCallRaw<Row>(
              session.page,
              'DELETE',
              `/textile-submissions/${submissionId}`
            );
            expect(
              Number(deleted?.deleted),
              `删除应回显被删 id ${submissionId}，实际=${JSON.stringify(deleted)}`
            ).toBe(submissionId);
            const gone = await apiCallExpectFail(
              session.page,
              'GET',
              `/textile-submissions/${submissionId}`
            );
            expect(
              gone.status,
              `删除后回读应 404，实际 status=${gone.status} code=${JSON.stringify(gone.code)}`
            ).toBe(404);
            expect(
              failureCode(gone),
              `删除后回读应带 NOT_FOUND 机器码，实际=${JSON.stringify(gone.code)}`
            ).toBe(APP_ERROR_CODES.NOT_FOUND);

            return {
              artifacts: [
                { key: 'submissionId', value: submissionId },
                { key: 'declaredCategory', value: SUB_CATEGORY_B },
              ],
            };
          },
        },
      ]);

      // 链尾对账：两真身份，产品双列与送检申报码三方各归各处
      const userIds = relay.sessions.map(s => s.userId);
      expect(new Set(userIds).size, `两棒应两个不同用户，实际=${userIds.join(', ')}`).toBe(2);
      expect(
        String(relay.artifacts.declaredCategory),
        `送检申报码应钉在链上供复核，实际=${JSON.stringify(relay.artifacts.declaredCategory)}`
      ).toBe(SUB_CATEGORY_B);
    } finally {
      await relay.close();
    }
  });
});
