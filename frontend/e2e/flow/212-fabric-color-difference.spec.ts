/**
 * 面料缸差专项：验布录入 → 质检定级 → 后整读回 → 越权拒绝 的四棒接力
 *
 * 功能：用一条跨角色接力链钉死"缸差"事实在后端的真实落点与跨角色可见性——
 * 一，验布员建一张带缸号(dye_lot_no)、色号(color_no)、门幅(fabric_width_inches)的四分制验布单，
 *    开验后录入两条 color_diff（缸差/色差）疵点并逐字段回读自证真落库；
 * 二，质检员（另一身份）对同一张单定级，写入受检码数(inspected_yards)，
 *    服务端按四分制聚合出总扣分 4、每百平方码分数 2.32、等级 first；
 * 三，后整主管（第三种身份）按 HTTP 直读、按单号读、按单读疵点三路回读，
 *    断言看到的缸号/色号/机号/备注/疵点描述与写入值逐字符相等、数值字段与定级产出逐值相等；
 * 四，仓管（第四种身份，不持有 fabric-inspections/fabric-defects 任何权限键）对同一批端点
 *    被权限门拒绝（HTTP 403 + 权限机器码 FORBIDDEN）。
 *
 * 调用方：Playwright E2E 套件，由 CI 的 e2e flow 分片按文件哈希收集执行。
 * 入参：BASE_URL 与 API_BASE 取环境变量；角色凭证取 env 优先、回退 e2e/.auth/role-credentials.json。
 * 传给谁：棒次会话与跨棒标识由 fixtures/relay 建与查（createRelay/runSteps/require），
 * 请求走 flow/helpers 的 apiCallRaw/apiCallExpectFail（经 relay 夹具的 expectEndpointDenied 收口），
 * 唯一标识走 flow/helpers 的 genCode，不另造登录或请求函数。
 * 存什么：验布单 1 行（状态 graded）与疵点 2 行（color_diff）真落库。
 * 存哪里：fabric_inspection_record 与 fabric_defect_record 业务表。
 *
 * 【清理腿不可达声明（按判红口径不造规避，交主编排裁定）】
 * 本用例落库的验布单定级后停在 graded，疵点挂在 graded 单下：
 * - DELETE /fabric-inspections/{id} 有 pending-only 状态门（backend/src/services/fabric_inspection_service.rs-404）；
 * - DELETE /fabric-defects/{id} 有 inspecting-only 状态门（同文件 :982-995）；
 * - 状态机端点只进不退，无任何回退到 inspecting/pending 的通路（routes/production.rs-289 仅
 *   start/grade/roll/close 正向流转）。
 * 因此"先撤状态再删"在 API 侧不成立，本文件不登记必败的假清理；残留 1+2 行属已知不可回收面。
 *
 * 【为什么读回棒是后整主管而不是派工提到的仓管/财务】
 * 后端授权矩阵中持有 ("fabric-inspections","read") 的岗位是：gm/deputy_gm（高管，
 * init_service_ops/permission.rs/536）、finishing_master（:982）、quality_inspector（:1103）、
 * qc_manager（:1073 通配）、fabric_inspector（:1125 通配）；仓管（warehouse_keeper，:861 分组）
 * 与财务域各岗均无该资源任何键。用仓管读必然恒 403——那是造出来的假腿，不是被测行为。
 * 后整主管正是验布等级（first/second）的真实下游消费岗（等级决定放行/返工路线），读回语义成立。
 * 仓管无键这一事实不浪费，正好充当第四棒的权限门负向判据。
 *
 * 【角色权限面来源（不是推测）】
 * fabric_inspector 由后端初始化建角（init_service_ops/role.rs）并授
 * ("fabric-inspections","*") + ("fabric-defects","*")（permission.rs-1126）⇒ 建单/开验/录疵点；
 * quality_inspector 建角 role.rs、持 ("fabric-inspections","read")+("fabric-inspections","create")
 * （permission.rs-1104）⇒ 定级动作键派生为 fabric-inspections:create
 * （POST /{id}/grade 末段 grade 非动作关键字，按 HTTP 方法派生，middleware/permission.rs-291、
 * utils/path_utils.rs 将 production 判为模块前缀 ⇒ 资源名取第四段 fabric-inspections）；
 * finishing_master 建角 role.rs、持 ("fabric-inspections","read")（permission.rs）⇒ 只读回；
 * warehouse_keeper 建角 role.rs，permission.rs 分组内无 fabric-inspections/fabric-defects 任何键
 * （且 e2e global-setup 的 SEED_ROLE_EXTRA_PERMISSIONS 补授面仅 pieces/greige-fabrics/suppliers，
 * global-setup.ts-755，不会把负向棒喂成 200）⇒ 三端点恒被权限门拒。
 *
 * 【断言判据与后端口径出处】
 * 疵点类型 color_diff 在册（fabric_inspection_service.rs-884 validate_defect_type）；
 * 四分制扣分档位 3<len≤6 寸 = 2 分（:65-82 calculate_four_point_points，两条疵点分别 4.00/5.00 寸各 2 分）；
 * 总扣分按同码封顶聚合（:10c 见 sum_four_point_points_capped_per_yard 调用，两疵点分居 12/55 码位不触封顶）；
 * 每百平方码分数 = 总扣分×3600/(受检码数×幅宽)（:149-163），本例 4×3600/(100×62)=2.32258…，
 * 落库列 numeric(10,2) 归到 2.32（models/fabric_inspection_record.rs-62）；
 * ≤40 判首级 first（:166-171 determine_grade_by_four_point；词表 models/status/quality_dyeing.rs-186）；
 * 状态词表 pending/inspecting/graded（同文件 :153-168）；
 * 定级仅 inspecting 可发起（:485-495）、录疵点仅 inspecting（:896-911）——第二棒的前置由第一棒开验保证。
 * 金额/长度类 Decimal 出参按字符串或数值编码不可预判，故数值判据统一 Number() 归一后逐值相等；
 * 文本类（缸号/色号/机号/备注/疵点描述/单号）一律 String() 后逐字符 toBe，不做包含匹配。
 *
 * 为什么整条链写成单个 test 且放在 serial 描述块里：CI 分片按文件哈希分配，
 * 接力棒次不能跨文件；跨 test 会把接力句柄与会话拆到不同 worker，棒间传标识随之失真（同 122 口径）。
 * 本用例不做 UI 面断言：验布功能页表头文案与列渲染属界面回归族，缸差的本体是后端事实链
 * （字段落库 + 跨角色可见 + 权限门），以 HTTP 出参逐字判红即达强度；不硬编码中文列头去 grep 界面。
 */
import { test, expect } from '../diagnose-fixture';
import { apiCallRaw, genCode, getRoleCredential } from './helpers';
import { createRelay, expectEndpointDenied } from '../fixtures/relay';

type Row = Record<string, unknown>;

/** 缸差疵点共用的验布数据基线：四分制、门幅 62.00 英寸、受检 100.00 码 */
const SCORING_FOUR_POINT = 'four_point';
const FABRIC_WIDTH_INCHES = '62.00';
const INSPECTED_YARDS = '100.00';
/** 两条 color_diff 疵点：各 4.00/5.00 英寸 ⇒ 四分制各扣 2 分；分处 12.50/55.00 码位不触同码封顶 */
const DEFECT_A_YARDS = '12.50';
const DEFECT_A_LENGTH = '4.00';
const DEFECT_B_YARDS = '55.00';
const DEFECT_B_LENGTH = '5.00';
/** 服务端定级产出：总扣分 2+2=4；每百平方码分数 4×3600/(100×62) numeric(10,2) 归整为 2.32；≤40 判首级 */
const EXPECTED_TOTAL_POINTS = 4;
const EXPECTED_POINTS_PER_100_SQ_YARDS = 2.32;
const EXPECTED_GRADE_FIRST = 'first';

test.describe.serial('面料缸差：验布录入、质检定级、后整读回、仓管越权拒绝', () => {
  test('四棒接力在同一用例内完成，缸差事实跨角色逐字可读且越权被权限门拒绝', async ({
    browser,
  }) => {
    const relay = await createRelay(browser);
    try {
      await relay.runSteps([
        {
          role: 'fabric_inspector',
          label: '验布员建缸差验布单并录入 color_diff 疵点',
          run: async ({ session }) => {
            const dyeLotNo = genCode('E2E-LOTNO');
            const colorNo = genCode('E2E-COLORNO');
            const machineNo = genCode('E2E-MACHINE');
            const today = new Date().toISOString().slice(0, 10);

            const created = await apiCallRaw<Row | null>(
              session.page,
              'POST',
              '/production/fabric-inspections',
              {
                dye_lot_no: dyeLotNo,
                color_no: colorNo,
                machine_no: machineNo,
                inspection_date: today,
                scoring_system: SCORING_FOUR_POINT,
                fabric_width_inches: FABRIC_WIDTH_INCHES,
                remarks: 'E2E 缸差专项验布单',
              }
            );
            const inspectionId = Number(created?.id);
            if (!Number.isFinite(inspectionId) || inspectionId <= 0) {
              throw new Error(
                `第一棒建验布单未返回有效 id，后续定级与读回将失去对象，实际出参片段=` +
                  `${JSON.stringify(created)?.slice(0, 200)}`
              );
            }
            const inspectionNo = String(created?.inspection_no ?? '');
            expect(
              /^FIR-/.test(inspectionNo),
              `验布单号应为服务端取号的 FIR- 前缀单号（fabric_inspection_service.rs/294-305），` +
                `实际=${JSON.stringify(inspectionNo)}`
            ).toBe(true);
            // 创建回执先钉一遍缸号/色号/门幅/状态原词，落库与回执不符在这里就断掉
            expect(String(created?.dye_lot_no), '建单回执缸号应等于写入值').toBe(dyeLotNo);
            expect(String(created?.color_no), '建单回执色号应等于写入值').toBe(colorNo);
            expect(
              Number(created?.fabric_width_inches),
              `建单回执门幅应等于写入值 ${FABRIC_WIDTH_INCHES}`
            ).toBe(62);
            expect(String(created?.status), '新建验布单初始态应为 pending').toBe('pending');

            // 自建自读回钉一行真落库：只信创建接口的返回值会把"接口给了 id 但行没落"读成成功
            const back = await apiCallRaw<Row>(
              session.page,
              'GET',
              `/production/fabric-inspections/${inspectionId}`
            );
            expect(String(back?.inspection_no), `按 id 回读单号应逐字符等于 ${inspectionNo}`).toBe(
              inspectionNo
            );
            expect(String(back?.dye_lot_no), '按 id 回读缸号应逐字符等于写入值').toBe(dyeLotNo);
            expect(String(back?.color_no), '按 id 回读色号应逐字符等于写入值').toBe(colorNo);
            expect(String(back?.machine_no), '按 id 回读机号应逐字符等于写入值').toBe(machineNo);
            expect(String(back?.inspection_date), '按 id 回读验布日期应等于写入值').toBe(today);

            // 开验（pending → inspecting）：疵点录入与后续定级的状态前置
            const started = await apiCallRaw<Row>(
              session.page,
              'POST',
              `/production/fabric-inspections/${inspectionId}/start`
            );
            expect(String(started?.status), '开验后状态应流转为 inspecting').toBe('inspecting');

            // 缸差事实本体：两条 color_diff 疵点（四分制扣分由服务端按长度档自动算，请求体不带 points）
            const noteA = `缸差首疵点 ${genCode('E2E-CD')}`;
            const defectA = await apiCallRaw<Row>(
              session.page,
              'POST',
              '/production/fabric-defects',
              {
                inspection_id: inspectionId,
                defect_type: 'color_diff',
                position_yards: DEFECT_A_YARDS,
                defect_length_inches: DEFECT_A_LENGTH,
                description: noteA,
              }
            );
            expect(String(defectA?.defect_type), '疵点类型应原样回显 color_diff').toBe(
              'color_diff'
            );
            expect(
              Number(defectA?.position_yards),
              `疵点 A 码位应等于写入值 ${DEFECT_A_YARDS}`
            ).toBe(12.5);
            expect(
              Number(defectA?.points),
              `4.00 英寸按四分制 3<len≤6 档应扣 2 分（calculate_four_point_points），` +
                `实际=${JSON.stringify(defectA?.points)}`
            ).toBe(2);

            const noteB = `缸差次疵点 ${genCode('E2E-CD')}`;
            const defectB = await apiCallRaw<Row>(
              session.page,
              'POST',
              '/production/fabric-defects',
              {
                inspection_id: inspectionId,
                defect_type: 'color_diff',
                position_yards: DEFECT_B_YARDS,
                defect_length_inches: DEFECT_B_LENGTH,
                description: noteB,
              }
            );
            expect(Number(defectB?.points), '5.00 英寸同档应同样扣 2 分').toBe(2);
            expect(Number(defectB?.inspection_id), '疵点 B 应挂在第一棒那张验布单下').toBe(
              inspectionId
            );

            return {
              artifacts: [
                { key: 'inspectionId', value: inspectionId },
                { key: 'inspectionNo', value: inspectionNo },
                { key: 'dyeLotNo', value: dyeLotNo },
                { key: 'colorNo', value: colorNo },
                { key: 'machineNo', value: machineNo },
                { key: 'defectNoteA', value: noteA },
                { key: 'defectNoteB', value: noteB },
              ],
              // 清理腿不可达（graded 单与疵点均被 pending-only / inspecting-only 状态门锁死，
              // 且无回退通路），不登记必败的假清理，见文件头声明与交接单。
            };
          },
        },
        {
          role: 'quality_inspector',
          label: '质检员定级并写入受检码数',
          run: async ({ session, require }) => {
            const inspectionId = Number(require('inspectionId'));
            const graded = await apiCallRaw<Row>(
              session.page,
              'POST',
              `/production/fabric-inspections/${inspectionId}/grade`,
              { inspected_yards: INSPECTED_YARDS }
            );
            // 服务端聚合口径逐值钉：码数、总扣分（两条 color_diff 各 2 分、分码不封顶）、
            // 每百平方码分数（4×3600/(100×62) 落 numeric(10,2)=2.32）、等级（≤40 判 first）、状态 graded
            expect(String(graded?.status), '定级后状态应为 graded').toBe('graded');
            expect(
              Number(graded?.inspected_yards),
              `受检码数应等于质检棒写入值 ${INSPECTED_YARDS}`
            ).toBe(100);
            expect(
              Number(graded?.total_defect_points),
              `总扣分应由服务端按疵点聚合为 ${EXPECTED_TOTAL_POINTS}，` +
                `实际=${JSON.stringify(graded?.total_defect_points)}`
            ).toBe(EXPECTED_TOTAL_POINTS);
            expect(
              Number(graded?.points_per_100_sq_yards),
              `每百平方码分数应等于四分制公式产出 ${EXPECTED_POINTS_PER_100_SQ_YARDS}，` +
                `实际=${JSON.stringify(graded?.points_per_100_sq_yards)}`
            ).toBe(EXPECTED_POINTS_PER_100_SQ_YARDS);
            expect(
              String(graded?.grade),
              `p100=${EXPECTED_POINTS_PER_100_SQ_YARDS} ≤40 应判首级 ${EXPECTED_GRADE_FIRST}，` +
                `实际=${JSON.stringify(graded?.grade)}`
            ).toBe(EXPECTED_GRADE_FIRST);

            return {
              artifacts: [
                { key: 'gradedInspectionId', value: inspectionId },
                { key: 'qualityGraderUserId', value: session.userId },
              ],
            };
          },
        },
        {
          role: 'finishing_master',
          label: '后整主管按 HTTP 读回缸差事实逐字符对账',
          run: async ({ session, require }) => {
            const inspectionId = Number(require('inspectionId'));
            const inspectionNo = String(require('inspectionNo'));
            const dyeLotNo = String(require('dyeLotNo'));
            const colorNo = String(require('colorNo'));
            const machineNo = String(require('machineNo'));

            // 读路口径一：按 id 直读，写入面与定级面全字段对账
            const detail = await apiCallRaw<Row>(
              session.page,
              'GET',
              `/production/fabric-inspections/${inspectionId}`
            );
            expect(String(detail?.dye_lot_no), `读回缸号应逐字符等于验布棒写入值 ${dyeLotNo}`).toBe(
              dyeLotNo
            );
            expect(String(detail?.color_no), `读回色号应逐字符等于验布棒写入值 ${colorNo}`).toBe(
              colorNo
            );
            expect(String(detail?.machine_no), '读回机号应逐字符等于写入值').toBe(machineNo);
            expect(String(detail?.inspection_no), '读回单号应逐字符等于第一棒产出').toBe(
              inspectionNo
            );
            expect(String(detail?.scoring_system), '读回评分制式应为 four_point').toBe(
              SCORING_FOUR_POINT
            );
            expect(
              Number(detail?.fabric_width_inches),
              `读回门幅应等于写入值 ${FABRIC_WIDTH_INCHES}`
            ).toBe(62);
            expect(Number(detail?.inspected_yards), '读回码数应等于质检棒写入值 100').toBe(100);
            expect(Number(detail?.total_defect_points), '读回总扣分应为服务端聚合值 4').toBe(
              EXPECTED_TOTAL_POINTS
            );
            expect(Number(detail?.points_per_100_sq_yards), '读回每百平方码分数应为 2.32').toBe(
              EXPECTED_POINTS_PER_100_SQ_YARDS
            );
            expect(String(detail?.grade), '读回等级应为 first（首级）').toBe(EXPECTED_GRADE_FIRST);
            expect(String(detail?.status), '读回状态应为 graded').toBe('graded');

            // 读路口径二：按单号读必须命中同一行（单号-行 id 映射不能被读错对象蒙混）
            const byNo = await apiCallRaw<Row>(
              session.page,
              'GET',
              `/production/fabric-inspections/by-no/${encodeURIComponent(inspectionNo)}`
            );
            expect(
              Number(byNo?.id),
              `按单号 ${inspectionNo} 读回的行 id 应等于 ${inspectionId}，实际=${JSON.stringify(byNo?.id)}`
            ).toBe(inspectionId);

            // 读路口径三：疵点明细两行全是 color_diff，码位/长度/扣分/描述逐字对账
            const defects = await apiCallRaw<Row[]>(
              session.page,
              'GET',
              `/production/fabric-inspections/${inspectionId}/defects`
            );
            expect(
              Array.isArray(defects),
              `疵点列表应为数组，实际=${JSON.stringify(defects)?.slice(0, 200)}`
            ).toBe(true);
            expect(
              defects.length,
              `本单疵点应恰好 2 行（缸差专项两笔），实际 ${defects.length} 行`
            ).toBe(2);
            const colorDiffRows = defects.filter(row => String(row.defect_type) === 'color_diff');
            expect(
              colorDiffRows.length,
              `两行疵点的类型都应判为缸差族 color_diff，实际命中 ${colorDiffRows.length} 行`
            ).toBe(2);
            const noteA = String(require('defectNoteA'));
            const noteB = String(require('defectNoteB'));
            for (const row of colorDiffRows) {
              expect(
                Number(row.inspection_id),
                `疵点行应挂在本验布单 ${inspectionId} 下：${JSON.stringify(row)}`
              ).toBe(inspectionId);
              expect(Number(row.points), `每行 color_diff 应扣 2 分：${JSON.stringify(row)}`).toBe(
                2
              );
            }
            const byNoteA = colorDiffRows.find(row => String(row.description) === noteA);
            const byNoteB = colorDiffRows.find(row => String(row.description) === noteB);
            // 定位不到即判红：把"哪笔没回来"写进取值本体与消息，不用布尔先行放行
            // （布尔放行后下一行的可选链会把缺行变成 NaN 对期望值这种难诊断的间接红）。
            const rowsSignature = colorDiffRows
              .map(
                row =>
                  `${String(row.description)}|码位 ${String(row.position_yards)}|长度 ${String(row.defect_length_inches)}`
              )
              .join(' ;; ');
            expect(
              byNoteA ? Number(byNoteA.position_yards) : NaN,
              `疵点 A（描述 ${noteA}）读回码位应等于写入值 12.5；当前缸差行=${rowsSignature}`
            ).toBe(12.5);
            expect(
              byNoteA ? Number(byNoteA.defect_length_inches) : NaN,
              `疵点 A（描述 ${noteA}）读回长度应等于写入值 4；当前缸差行=${rowsSignature}`
            ).toBe(4);
            expect(
              byNoteB ? Number(byNoteB.position_yards) : NaN,
              `疵点 B（描述 ${noteB}）读回码位应等于写入值 55；当前缸差行=${rowsSignature}`
            ).toBe(55);
            expect(
              byNoteB ? Number(byNoteB.defect_length_inches) : NaN,
              `疵点 B（描述 ${noteB}）读回长度应等于写入值 5；当前缸差行=${rowsSignature}`
            ).toBe(5);

            return { artifacts: [{ key: 'readbackInspectionNo', value: inspectionNo }] };
          },
        },
        {
          role: 'warehouse_keeper',
          label: '仓管对缸差事实端点被权限门拒绝',
          run: async ({ session, require }) => {
            const inspectionId = Number(require('inspectionId'));

            // 读面与写面都判：只钉列表会漏掉"详情门/录入门缺失"这类扩权
            await expectEndpointDenied(
              session.page,
              'GET',
              `/production/fabric-inspections/${inspectionId}`,
              '第四棒越权读验布单详情'
            );
            await expectEndpointDenied(
              session.page,
              'GET',
              `/production/fabric-inspections/${inspectionId}/defects`,
              '第四棒越权读缸差疵点明细'
            );
            await expectEndpointDenied(
              session.page,
              'POST',
              '/production/fabric-defects',
              '第四棒越权录入疵点'
            );

            return {
              artifacts: [{ key: 'deniedEndpoint', value: '/production/fabric-inspections' }],
            };
          },
        },
      ]);

      // 链尾总钉一：四棒各自登录成功，账号名逐棒等于该角色码凭证里的账号
      const expectedRoles = [
        'fabric_inspector',
        'quality_inspector',
        'finishing_master',
        'warehouse_keeper',
      ];
      const expectedUsernames = expectedRoles.map(role => {
        const cred = getRoleCredential(role);
        if (!cred) {
          throw new Error(
            `链尾对账取凭证失败：角色码 ${role} 在 env 与凭证文件两处都不存在，` +
              '无法判定接力是否真的用了四个身份'
          );
        }
        return cred.username;
      });
      const actualUsernames = relay.sessions.map(session => session.username);
      expect(
        actualUsernames,
        `四棒登录账号应与角色凭证账号逐一相符，期望 ${expectedUsernames.join(', ')}，` +
          `实际 ${actualUsernames.join(', ')}`
      ).toEqual(expectedUsernames);

      // 链尾总钉二：四个身份互不相同（录入、定级、读回、被拒必须出自四个真身份）
      expect(relay.sessions.length, '接力应真实开启四棒会话').toBe(4);
      const userIds = relay.sessions.map(session => session.userId);
      expect(new Set(userIds).size, `四棒必须是四个不同用户 id，实际=${userIds.join(', ')}`).toBe(
        4
      );

      // 链尾总钉三：跨棒传递的业务标识确实登记在链上且读回棒读到的是同一张单
      expect(
        Number(relay.artifacts.inspectionId),
        '链上应登记第一棒产出的验布单 id 供后续棒次读取'
      ).toBeGreaterThan(0);
      expect(
        Number(relay.artifacts.gradedInspectionId),
        '第二棒定级的对象应与第一棒建的是同一张验布单'
      ).toBe(Number(relay.artifacts.inspectionId));
      expect(
        String(relay.artifacts.readbackInspectionNo),
        '第三棒读回的单据应等于第一棒产出的单号'
      ).toBe(String(relay.artifacts.inspectionNo));
      expect(
        Number(relay.artifacts.qualityGraderUserId) !== Number(userIds[0]),
        '定级棒身份必须与录入棒不同，否则跨角色接力退化成单人剧'
      ).toBe(true);
    } finally {
      await relay.close();
    }
  });
});
