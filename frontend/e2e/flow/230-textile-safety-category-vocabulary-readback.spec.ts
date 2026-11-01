/**
 * 纺织品安全送检单：安全类别词表在册建档与词表外拒因点名
 *
 * 功能：用一条词表正反两面链钉死 GB 18401 安全类别在本域的在册形态与拒绝形态——
 * 一，婴幼儿 儿童 成人三档人群各按法定最低类别（GB18401_A GB18401_B GB18401_C 带前缀稳定码）建草稿单成功，
 *    回执与按 id 回读逐字符钉住申报类别 人群 接触方式 初始态 draft 与整单结论位 NULL，
 *    并把 created_by 钉成登录会话用户 id（会话注入不可伪造）；
 * 二，词表外取值（裸 A 与 D 类 空串）建单必须 400 且拒因文案点名合法值集 GB18401_A,GB18401_B,GB18401_C，
 *    人群低于申报类别（infant 报 B）与婴幼儿专用接触档未配 A 类各被拦并点名规则出处，
 *    豁免标签越词表被拦并点名四枚合法标签；
 * 三，上述全部拒绝之后按品种回读列表，总数与逐枚类别逐色号必须等于三枚在册单，
 *    证明被拒请求没有产生任何行、也没有被静默改成默认值落库；
 * 四，状态词表负例（列表过滤传词表外状态）与三枚草稿删除通道闭环，删除后按 id 回读 404 加删除前逐值对账，
 *    把 404 只当删除证据之一而非全部（先钉删前真值再钉删后 404）。
 *
 * 调用方：Playwright E2E 套件，由 CI 的 e2e flow 分片按文件哈希收集执行。
 * 入参：API_BASE 与 BASE_URL 取环境变量；角色凭证取 env 优先、回退 e2e/.auth/role-credentials.json；
 *      被测端点为 GET /textile-test-items（读甲醛项目编码）、POST /textile-submissions、
 *      GET /textile-submissions/{id}、GET /textile-submissions?product_id 与 status 过滤、
 *      DELETE /textile-submissions/{id}、GET /product-categories 与 POST /products（admin 腿自建品种）。
 * 传给谁：请求走 flow/helpers 的 apiCallRaw 与 apiCallExpectFail，会话与跨棒标识走 fixtures/relay，
 *      拒绝码判据走 helpers 的 expectStateGateRejection 与 failureCode，不另造请求或判据实现。
 * 存什么：送检草稿 3 枚（逐枚申报类别 人群 接触方式 市场 色号 工艺 创建人）、产品档案 1 枚（用例尾删除回收）。
 * 存哪里：PostgreSQL textile_safety_submission 与 products 表，草稿在本用例内物理删净，产品由 admin 清理位回收。
 *
 * 【判据出处（文件名为准，行号随主干演进不写死）】
 * 词表与校验：backend/src/models/status/textile_safety.rs 的 textile_safety_category 与
 *   textile_end_user_group::required_safety_category 与 textile_contact_type::INFANT_USE 规则、
 *   backend/src/services/textile_safety_submission_service.rs 的 validate_dims（词表外 400 fail-visible，
 *   空值点名"必须显式给出"，申报松于人群最低类别点名"法定最低安全类别"，
 *   婴幼儿专用接触档必须 A 类，豁免标签逐 token 白名单点名合法值集）；
 * 存储形态：backend/migration/src/domain/textile_safety 的 m0111 对
 *   textile_safety_submission.safety_category 施加 CHECK（取值 GB18401_A GB18401_B GB18401_C，不含裸 A 与通配 any）；
 * 裸 A 语义占用风险与本域前缀码选型理由见 backend/src/models/status/textile_safety.rs 文件头（三套同形语义不得互抄）。
 * 创建人会话注入：backend/src/handlers/textile_safety_handler.rs 的 create_submission（created_by 取 AuthContext）。
 * 列表与分页信封：PaginatedResponse{items,total,page,page_size}，backend/src/services/textile_safety_submission_service.rs 的 list
 *   （page 越界与 page_size 界内校验、状态词表外过滤 400 点名合法值）。
 *
 * 【本文件不覆盖什么】
 * 甲醛实测值对限值矩阵的三态判定链在 232 专项；目标市场加验口径差异在 231 专项；
 * 产品等级与安全类别两字段的互不覆盖在 234 专项；本文件只钉"类别词表在册与越词表拒绝"这一门。
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

/** 安全类别带前缀稳定码（GB18401 三分，存储与传参只用前缀码） */
const CATEGORY_A = 'GB18401_A';
const CATEGORY_B = 'GB18401_B';
const CATEGORY_C = 'GB18401_C';
/** 词表外取值样本（裸 A，D 类两形态，空串）——必须被拒且点名合法集，不得静默改默认 */
const VOCAB_OUT_BARE_A = 'A';
const VOCAB_OUT_D_CLASS = 'D类';
const VOCAB_OUT_EMPTY = '';
/** 合法值集点名片段（逐字符对齐词表 join 形态，backend 侧 ALL 顺序 A B C） */
const VOCAB_HINT_A_B_C = 'GB18401_A,GB18401_B,GB18401_C';
/** 甲醛项目编码（m0112 种子在册，本文件只取它验证检测项目主数据面可达且在册码可查） */
const ITEM_CODE_HCHO = 'HCHO';

test.describe.serial('纺织品安全：安全类别词表在册建档、越词表点名拒绝、拒后零残留', () => {
  test('三枚在册建档逐字符回读，四枚越词表拒绝点名合法值，拒绝后列表总数不变', async ({
    browser,
  }) => {
    const relay = await createRelay(browser);
    try {
      await relay.runSteps([
        {
          role: 'admin',
          label: '管理员建三枚草稿共用的真实品种',
          run: async ({ session }) => {
            const cats = await apiCallRaw<{ items?: Row[] }>(
              session.page,
              'GET',
              '/product-categories'
            );
            const categoryId = Number(cats?.items?.[0]?.id);
            expect(
              Number.isFinite(categoryId) && categoryId > 0,
              `admin 腿必须取到已种产品分类作建档必填来源，实际首行 id=${JSON.stringify(
                cats?.items?.[0]?.id
              )}`
            ).toBe(true);

            const productName = genCode('E2E-TS4-FABRIC');
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
              `建档应返回产品主键，实际出参片段=${JSON.stringify(created)?.slice(0, 200)}`
            ).toBe(true);

            return {
              artifacts: [{ key: 'productId', value: productId }],
              // 清理位：送检草稿在第二棒体内删净后，本棒尾回收产品档案（URL 字面量写在调用点）
              cleanup: [
                {
                  method: 'DELETE',
                  path: `/products/${productId}`,
                  label: '回收安全类别词表用例自建品种',
                },
              ],
            };
          },
        },
        {
          role: 'qc_manager',
          label: '质量经理按三档人群各建一枚在册类别草稿并逐字符回读',
          run: async ({ session, require }) => {
            const productId = Number(require('productId'));

            // 检测项目主数据面在册性顺检（甲醛编码可查即种子矩阵在位，判定链前置事实）
            const itemPages = await apiCallRaw<{ items: Row[] }>(
              session.page,
              'GET',
              '/textile-test-items?basis=GB18401&page=1&page_size=50'
            );
            expect(
              Array.isArray(itemPages?.items),
              `检测项目列表应返回 items 数组，实际=${JSON.stringify(itemPages)?.slice(0, 200)}`
            ).toBe(true);
            const hcho = (itemPages?.items ?? []).find(
              row => String(row.item_code) === ITEM_CODE_HCHO
            );
            expect(
              hcho ? Number(hcho.id) : NaN,
              `甲醛检测项目应已在主数据册内且可查（m0112 种子），实际命中=${JSON.stringify(hcho)}`
            ).toBeGreaterThan(0);

            const colorNo = genCode('E2E-TS4-COLOR');
            const processNo = genCode('E2E-TS4-PROC');

            // 三枚在册建档（人群与类别配对满足法定最低档：infant 配 A、child 配 B、adult 配 C）
            const trio = [
              {
                tag: 'infant',
                end_user_group: 'infant',
                contact_type: 'infant_use',
                safety_category: CATEGORY_A,
              },
              {
                tag: 'child',
                end_user_group: 'child',
                contact_type: 'direct',
                safety_category: CATEGORY_B,
              },
              {
                tag: 'adult',
                end_user_group: 'adult',
                contact_type: 'indirect',
                safety_category: CATEGORY_C,
              },
            ];
            const createdTrio: Row[] = [];
            for (const leg of trio) {
              const submissionNo = genCode(`E2E-TS4-${leg.tag.toUpperCase()}`);
              const created = await apiCallRaw<Row>(session.page, 'POST', '/textile-submissions', {
                submission_no: submissionNo,
                product_id: productId,
                color_no: colorNo,
                process_no: processNo,
                end_user_group: leg.end_user_group,
                contact_type: leg.contact_type,
                safety_category: leg.safety_category,
                product_form: 'final',
                target_market: 'dom',
                remarks: `安全类别词表在册单 ${leg.tag}`,
              });
              const id = Number(created?.id);
              expect(
                Number.isFinite(id) && id > 0,
                `${leg.tag} 腿建单应返回主键，实际=${JSON.stringify(created)?.slice(0, 200)}`
              ).toBe(true);
              expect(
                String(created?.status),
                `${leg.tag} 腿新单初始态应恰为 draft，实际=${JSON.stringify(created?.status)}`
              ).toBe('draft');
              expect(
                created?.overall_verdict ?? null,
                `${leg.tag} 腿建档后整单结论位必须为 NULL（pending 不是合法整单结论，缺值不写 0 也不写字面量），实际=${JSON.stringify(created?.overall_verdict)}`
              ).toBeNull();
              expect(
                String(created?.safety_category),
                `${leg.tag} 腿回执安全类别应逐字符等于申报前缀码 ${leg.safety_category}，实际=${JSON.stringify(created?.safety_category)}`
              ).toBe(leg.safety_category);
              expect(
                Number(created?.created_by),
                `创建人应取会话注入的登录用户 id（不可由请求体伪造），期望 ${session.userId}，实际=${JSON.stringify(created?.created_by)}`
              ).toBe(session.userId);
              createdTrio.push({ ...created, id, submission_no: submissionNo });
            }

            // 逐枚按 id 回读，回执与库里真值两路各钉一遍（只信回执会把"响应给了 id 但行没落"读成成功）
            for (let i = 0; i < trio.length; i++) {
              const detail = await apiCallRaw<{ submission?: Row }>(
                session.page,
                'GET',
                `/textile-submissions/${Number(createdTrio[i]?.id)}`
              );
              const sub = detail?.submission;
              expect(
                String(sub?.safety_category ?? ''),
                `第 ${i + 1} 枚回读安全类别应等于 ${trio[i].safety_category}，实际=${JSON.stringify(sub?.safety_category)}`
              ).toBe(trio[i].safety_category);
              expect(
                String(sub?.end_user_group ?? ''),
                `第 ${i + 1} 枚回读终端人群应等于 ${trio[i].end_user_group}，实际=${JSON.stringify(sub?.end_user_group)}`
              ).toBe(trio[i].end_user_group);
              expect(
                String(sub?.contact_type ?? ''),
                `第 ${i + 1} 枚回读接触方式应等于 ${trio[i].contact_type}，实际=${JSON.stringify(sub?.contact_type)}`
              ).toBe(trio[i].contact_type);
              expect(
                String(sub?.color_no ?? ''),
                `三档人群共用同一色号（取样批次口径的同批维），期望 ${colorNo}，实际=${JSON.stringify(sub?.color_no)}`
              ).toBe(colorNo);
              expect(
                String(sub?.status ?? ''),
                `第 ${i + 1} 枚回读状态应为 draft，实际=${JSON.stringify(sub?.status)}`
              ).toBe('draft');
            }

            // 在册三枚之后，按品种列表逐值对账（总数 3，逐枚类别与单号配对）
            const afterTrio = await apiCallRaw<{ items: Row[]; total: number }>(
              session.page,
              'GET',
              `/textile-submissions?product_id=${productId}&page=1&page_size=20`
            );
            expect(
              Number(afterTrio?.total),
              `在册建档后按品种列表 total 应为 3，实际=${JSON.stringify(afterTrio?.total)}`
            ).toBe(3);

            // 越词表四拒（每拒点名合法取值或规则出处，不许静默改默认）
            const baseBody: Row = {
              product_id: productId,
              color_no: colorNo,
              process_no: processNo,
              end_user_group: 'adult',
              contact_type: 'indirect',
              product_form: 'final',
              target_market: 'dom',
            };
            const rejects: {
              label: string;
              body: Row;
              expectInMessage: string[];
            }[] = [
              {
                label: '裸 A 越词表（本域落库只认带前缀稳定码）',
                body: {
                  ...baseBody,
                  submission_no: genCode('E2E-TS4-VOCAB-A'),
                  safety_category: VOCAB_OUT_BARE_A,
                },
                expectInMessage: [VOCAB_HINT_A_B_C, VOCAB_OUT_BARE_A],
              },
              {
                label: 'D 类越词表',
                body: {
                  ...baseBody,
                  submission_no: genCode('E2E-TS4-VOCAB-D'),
                  safety_category: VOCAB_OUT_D_CLASS,
                },
                expectInMessage: [VOCAB_HINT_A_B_C, VOCAB_OUT_D_CLASS],
              },
              {
                label: '空串缺申报（点名必须显式给出与合法集）',
                body: {
                  ...baseBody,
                  submission_no: genCode('E2E-TS4-VOCAB-EMPTY'),
                  safety_category: VOCAB_OUT_EMPTY,
                },
                expectInMessage: ['必须显式给出', VOCAB_HINT_A_B_C],
              },
              {
                label: 'infant 人群申报 B（松于法定最低类别）',
                body: {
                  ...baseBody,
                  submission_no: genCode('E2E-TS4-INFANT-SUB'),
                  end_user_group: 'infant',
                  contact_type: 'infant_use',
                  safety_category: CATEGORY_B,
                },
                expectInMessage: ['infant', 'GB18401_A', 'GB 31701'],
              },
              {
                label: '成人人群走婴幼儿专用接触档但申报 C（两口径冲突）',
                body: {
                  ...baseBody,
                  submission_no: genCode('E2E-TS4-INFANTUSE'),
                  contact_type: 'infant_use',
                  safety_category: CATEGORY_C,
                },
                expectInMessage: ['婴幼儿专用', 'A 类'],
              },
              {
                label: '豁免标签越词表（点名四枚合法标签）',
                body: {
                  ...baseBody,
                  submission_no: genCode('E2E-TS4-TAGBAD'),
                  safety_category: CATEGORY_C,
                  exemption_tags: ['dry_clean_only'],
                },
                expectInMessage: ['dry_clean_only', 'wet_processing', 'plain_or_bleached'],
              },
            ];
            for (const rj of rejects) {
              const fail = await apiCallExpectFail(
                session.page,
                'POST',
                '/textile-submissions',
                rj.body
              );
              expectStateGateRejection(fail, `安全类别词表负例拒绝（${rj.label}）`);
              const msg = String(fail.message ?? '');
              for (const needle of rj.expectInMessage) {
                expect(
                  msg.includes(needle),
                  `${rj.label}：拒因文案应点名「${needle}」，实际 message=${JSON.stringify(msg)}`
                ).toBe(true);
              }
            }

            // 状态词表负例（列表过滤同样白名单，词表外点名合法值集）
            const badStatus = await apiCallExpectFail(
              session.page,
              'GET',
              '/textile-submissions?status=archived&page=1&page_size=20'
            );
            expectStateGateRejection(badStatus, '状态过滤词表外应被拒');
            expect(
              String(badStatus.message ?? '').includes('draft'),
              `状态过滤拒绝应点名合法值集（含 draft 起始档），实际 message=${JSON.stringify(badStatus.message)}`
            ).toBe(true);

            // 六拒之后按品种回读零残留：总数仍 3，逐枚仍是三档在册码（证明没有静默改默认落库）
            const afterRejects = await apiCallRaw<{ items: Row[]; total: number }>(
              session.page,
              'GET',
              `/textile-submissions?product_id=${productId}&page=1&page_size=20`
            );
            expect(
              Number(afterRejects?.total),
              `六次越词表拒绝后 total 应仍为 3（一行动都没多），实际=${JSON.stringify(afterRejects?.total)}`
            ).toBe(3);
            const survivingCats = (afterRejects?.items ?? []).map(row =>
              String(row.safety_category)
            );
            expect(
              survivingCats.slice().sort().join(','),
              `在册三枚的类别集合应恰为三档前缀码，实际=${JSON.stringify(survivingCats)}`
            ).toBe([CATEGORY_A, CATEGORY_B, CATEGORY_C].sort().join(','));

            // 删除前逐值钉真落库，删除后按 id 回读 404（两路合证，404 单独不算硬删证据）
            for (let i = 0; i < trio.length; i++) {
              const id = Number(createdTrio[i]?.id);
              const before = await apiCallRaw<{ submission?: Row }>(
                session.page,
                'GET',
                `/textile-submissions/${id}`
              );
              expect(
                String(before?.submission?.submission_no ?? ''),
                `删除前应能按 id 读到第 ${i + 1} 枚单号，实际=${JSON.stringify(before?.submission?.submission_no)}`
              ).toBe(String(createdTrio[i]?.submission_no));
              const deleted = await apiCallRaw<Row>(
                session.page,
                'DELETE',
                `/textile-submissions/${id}`
              );
              expect(
                Number(deleted?.deleted),
                `删除回执应回显被删 id ${id}，实际=${JSON.stringify(deleted)}`
              ).toBe(id);
              const gone = await apiCallExpectFail(
                session.page,
                'GET',
                `/textile-submissions/${id}`
              );
              expect(
                gone.status,
                `删除后按 id 回读应 404，实际 status=${gone.status} code=${JSON.stringify(gone.code)}`
              ).toBe(404);
              expect(
                failureCode(gone),
                `删除后回读应带 NOT_FOUND 机器码，实际=${JSON.stringify(gone.code)}`
              ).toBe(APP_ERROR_CODES.NOT_FOUND);
            }

            return {
              artifacts: [
                { key: 'trioTotal', value: createdTrio.length },
                { key: 'firstSubmissionNo', value: String(createdTrio[0]?.submission_no) },
              ],
            };
          },
        },
        {
          role: 'quality_inspector',
          label: '质检员独立复核三档在册单已被删净且词表集未被他岗旁路写坏',
          run: async ({ session, require }) => {
            const productId = Number(require('productId'));
            const afterList = await apiCallRaw<{ items: Row[]; total: number }>(
              session.page,
              'GET',
              `/textile-submissions?product_id=${productId}&page=1&page_size=20`
            );
            expect(
              Number(afterList?.total),
              `清理后按品种列表 total 应归 0（三枚草稿均已物理删净），实际=${JSON.stringify(afterList?.total)}`
            ).toBe(0);
            // 主数据词表在册性由第二身份再读一遍（限值矩阵与项目册不是 qc 独写面，另一 QC 岗同样可读）
            const itemPages = await apiCallRaw<{ items: Row[] }>(
              session.page,
              'GET',
              '/textile-test-items?basis=GB18401&page=1&page_size=50'
            );
            expect(
              (itemPages?.items ?? []).some(row => String(row.item_code) === ITEM_CODE_HCHO),
              `质检员身份应同样读到甲醛在册项目（读面同口径），实际条目数=${itemPages?.items?.length}`
            ).toBe(true);
            return {
              artifacts: [{ key: 'clearedTotal', value: Number(afterList?.total) }],
            };
          },
        },
      ]);

      // 链尾对账：三个身份必须是三个真用户（建单 复核 清理不能出自同一人）
      const userIds = relay.sessions.map(session => session.userId);
      expect(new Set(userIds).size, `三棒应为三个不同用户 id，实际=${userIds.join(', ')}`).toBe(3);
      expect(
        Number(relay.artifacts.trioTotal),
        `在册建档数应为 3，实际=${JSON.stringify(relay.artifacts.trioTotal)}`
      ).toBe(3);
      expect(
        Number(relay.artifacts.clearedTotal),
        `清理复核位读到的 total 应为 0，实际=${JSON.stringify(relay.artifacts.clearedTotal)}`
      ).toBe(0);
    } finally {
      await relay.close();
    }
  });
});
