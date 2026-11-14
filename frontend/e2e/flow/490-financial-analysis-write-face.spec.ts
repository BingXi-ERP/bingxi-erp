// 财务分析域报告与指标写面的 e2e 契约用例。
//
// 功能 钉报告建档、三态更新、删除、执行与指标建档五条码腿的落库事实、编码唯一性与分页口径。
// 调用方 CI 的 e2e 分片按文件粒度调度本文件，无其它调用方。
// 入参 无外部入参，前置由本用例自建报告与指标行，不依赖库里既有行。
// 传给谁 断言结果只进 Playwright 报告，不写任何仓库文件。
// 存什么 不落盘制品，被测数据落 financial_indicators 表（报告与指标共用该表）。
// 存哪里 数据在 CI 现场数据库，报告在 Actions 制品。
//
// 覆盖面。本文件钉四段。
// 一、建档与编码唯一。报告与指标的编码都由取号器产出（前缀加日期加流水），
// 同秒连续建两笔必须各自拿到不同编码且都落库；编码列带 UNIQUE，秒级时间戳
// 造码会在同秒第二笔直接撞约束，这条腿就是钉住该形态不再现。
// 二、更新三态与描述段保元数据。键缺席保持原值、有值覆盖；描述段更新只替换
// remark 里的描述分段，期间与关联指标分段必须原样保留。
// 三、删除与不存在腿。删除后详情回读必须 404，二次删除与更新不存在主键同样 404。
// 四、执行与分页。执行腿回显请求期间、状态只在 completed 与 no_data 两态里取，
// 不虚构计算结果；列表第二页不得与第一页重叠（页号一基，服务层自行算 offset）。
//
// 事实来源。端点与方法对照 backend/src/routes/finance.rs 的 financial-analysis 路由族。
// 出参键名以 backend/src/handlers/financial_analysis_handler.rs 各写腿的 serde_json::json
// 产出点为准：报告建档出 id/name/indicator_code/indicator_type/status/created_at，
// 详情另出 formula/unit/remark/updated_at，列表出 items/total/page/page_size。
// 指标建档出参是整实体序列化，键名取 backend/src/models/financial_analysis.rs。
// 拒因口径取 backend/src/utils/error.rs：校验失败走 validation_displayable 外显中文文案，
// 重复编码走 business_displayable 外显，not_found 出参恒脱敏常量故只断非空。
// 全部打真实后端，不用 route mock，不用宽松断言掩盖源码问题。
import { test, expect } from '../diagnose-fixture';
import {
  loginViaUI,
  ensureTestEntities,
  apiCall,
  apiCallExpectFail,
  genCode,
  tryCleanup,
  failureCode,
  APP_ERROR_CODES,
} from './helpers';

/** 报告建档出参，键名逐字对照 create_report 的 json 产出点 */
interface ReportCreated {
  id: number;
  name: string;
  indicator_code: string;
  indicator_type: string;
  status: string;
  created_at: string;
}

/** 报告详情出参，比建档多 formula/unit/remark/updated_at 四键 */
interface ReportDetail extends ReportCreated {
  formula: string | null;
  unit: string | null;
  remark: string | null;
  updated_at: string;
}

/** 报告列表信封与行形状，行只声明本用例断言用到的键 */
interface ReportPage {
  items: { id: number; name: string; indicator_code: string }[];
  total: number;
  page: number;
  page_size: number;
}

/** 指标建档出参为整实体序列化，键名取 financial_analysis 模型 */
interface IndicatorRow {
  id: number;
  indicator_name: string;
  indicator_code: string;
  indicator_type: string;
  status: string;
  remark: string | null;
}

/** 执行腿出参，status 只有 completed 与 no_data 两态 */
interface ExecuteResult {
  id: number;
  name: string;
  status: string;
  period: string;
  latest_result: unknown;
  executed_at: string;
  total_indicators_computed: number;
}

/** 不存在主键探针，取 i32 上界避免与真实自增主键相撞 */
const ABSENT_ID = 2147483647;

test.describe('财务分析写面 报告建档更新删除执行 指标编码唯一 分页口径', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  /** 一份合法的报告建档入参，期间与描述都会写进 remark 元数据 */
  function reportPayload(name: string): Record<string, unknown> {
    return {
      name,
      report_type: 'monthly',
      period_start: '2026-01-01',
      period_end: '2026-01-31',
      description: `建档描述-${name}`,
    };
  }

  /** 经建档腿自建一份报告，返回落库后的真实行 */
  async function seedReport(
    page: import('@playwright/test').Page,
    name: string
  ): Promise<ReportCreated> {
    const res = await apiCall<ReportCreated>(
      page,
      'POST',
      '/financial-analysis/reports',
      reportPayload(name)
    );
    expect(res.message).toBe('财务分析报告创建成功');
    expect(typeof res.data.id).toBe('number');
    expect(res.data.name).toBe(name);
    return res.data;
  }

  /** 详情回读，写腿之后一律走它而不是复用写腿自己的出参 */
  async function readReport(
    page: import('@playwright/test').Page,
    id: number
  ): Promise<ReportDetail> {
    const res = await apiCall<ReportDetail>(page, 'GET', `/financial-analysis/reports/${id}`);
    expect(res.data.id).toBe(id);
    return res.data;
  }

  test('490-01 建档 同秒两笔各拿不同编码且都落库', async ({ page }) => {
    const first = await seedReport(page, `E2E财务报告甲-${genCode('R490')}`);
    const second = await seedReport(page, `E2E财务报告乙-${genCode('R490')}`);
    try {
      // 编码走取号器：前缀加八位日期加流水，同秒两笔不得复用同一串
      expect(first.indicator_code).toMatch(/^RPT\d{11,}$/);
      expect(second.indicator_code).toMatch(/^RPT\d{11,}$/);
      expect(second.indicator_code, '同秒第二笔必须拿到不同编码，否则撞 UNIQUE 直接失败').not.toBe(
        first.indicator_code
      );
      expect(second.id).not.toBe(first.id);

      const readFirst = await readReport(page, first.id);
      const readSecond = await readReport(page, second.id);
      expect(readFirst.indicator_code).toBe(first.indicator_code);
      expect(readSecond.indicator_code).toBe(second.indicator_code);
      expect(readFirst.indicator_type).toBe('monthly');
      expect(readFirst.remark ?? '').toContain('期间: 2026-01-01 ~ 2026-01-31');
      expect(readFirst.remark ?? '').toContain(`描述: 建档描述-${first.name}`);
    } finally {
      await tryCleanup(page, 'DELETE', `/financial-analysis/reports/${first.id}`, '490-01 报告甲');
      await tryCleanup(page, 'DELETE', `/financial-analysis/reports/${second.id}`, '490-01 报告乙');
    }
  });

  test('490-02 建档 超长与空名称在校验门被拒不落库', async ({ page }) => {
    const legs: { label: string; patch: Record<string, unknown> }[] = [
      { label: '空名称', patch: { name: '' } },
      { label: '名称超一百字符', patch: { name: '长'.repeat(101) } },
      { label: '报告类型超五十字符', patch: { report_type: 't'.repeat(51) } },
      { label: '描述超五百字符', patch: { description: 'd'.repeat(501) } },
    ];
    for (const leg of legs) {
      const name = `E2E拒清-${genCode('R490')}`;
      const res = await apiCallExpectFail(page, 'POST', '/financial-analysis/reports', {
        ...reportPayload(name),
        ...leg.patch,
      });
      expect(res.status, `${leg.label} 应回 400`).toBe(400);
      expect(failureCode(res), `${leg.label} 机器码应为校验错`).toBe(
        APP_ERROR_CODES.VALIDATION_ERROR
      );
      expect(res.message ?? '', `${leg.label} 必须外显非空拒因`).not.toBe('');

      // 被拒后库里不得出现该名称：列表按主键倒序，若落库必在首页
      const listed = await apiCall<ReportPage>(
        page,
        'GET',
        '/financial-analysis/reports?page=1&page_size=20'
      );
      expect(
        listed.data.items.some(x => x.name === name),
        `${leg.label} 被拒后不得落库`
      ).toBe(false);
    }
  });

  test('490-03 更新 键缺席保持有值覆盖 描述段更新保留期间元数据', async ({ page }) => {
    const row = await seedReport(page, `E2E三态-${genCode('R490')}`);
    try {
      const before = await readReport(page, row.id);
      const newName = `E2E改名-${genCode('R490')}`;

      // 只提交名称：类型与 remark 必须分毫不动
      const partial = await apiCall<ReportDetail>(
        page,
        'PUT',
        `/financial-analysis/reports/${row.id}`,
        { name: newName }
      );
      expect(partial.message).toBe('财务分析报告更新成功');
      expect(partial.data.name).toBe(newName);
      expect(partial.data.indicator_type).toBe(before.indicator_type);
      expect(partial.data.remark).toBe(before.remark);
      const afterPartial = await readReport(page, row.id);
      expect(afterPartial.name).toBe(newName);
      expect(afterPartial.indicator_code, '更新不得改动编码').toBe(row.indicator_code);

      // 有值覆盖类型
      await apiCall<ReportDetail>(page, 'PUT', `/financial-analysis/reports/${row.id}`, {
        report_type: 'quarterly',
      });
      const afterType = await readReport(page, row.id);
      expect(afterType.indicator_type).toBe('quarterly');
      expect(afterType.name, '只改类型时名称应保持上一腿的新值').toBe(newName);

      // 描述段更新：只替换描述分段，期间分段必须原样保留
      const nextDesc = `改后描述-${genCode('R490')}`;
      const afterDesc = await apiCall<ReportDetail>(
        page,
        'PUT',
        `/financial-analysis/reports/${row.id}`,
        { description: nextDesc }
      );
      expect(afterDesc.data.remark ?? '').toContain('期间: 2026-01-01 ~ 2026-01-31');
      expect(afterDesc.data.remark ?? '').toContain(`描述: ${nextDesc}`);
      expect(afterDesc.data.remark ?? '', '旧描述分段不得残留').not.toContain(
        `描述: 建档描述-${row.name}`
      );
      const readBack = await readReport(page, row.id);
      expect(readBack.remark).toBe(afterDesc.data.remark);
    } finally {
      await tryCleanup(page, 'DELETE', `/financial-analysis/reports/${row.id}`, '490-03 报告');
    }
  });

  test('490-04 更新 不存在主键 404 且不造假成功', async ({ page }) => {
    const res = await apiCallExpectFail(page, 'PUT', `/financial-analysis/reports/${ABSENT_ID}`, {
      name: `E2E不存在-${genCode('R490')}`,
    });
    expect(res.status).toBe(404);
    expect(failureCode(res)).toBe(APP_ERROR_CODES.NOT_FOUND);
    // not_found 出参恒脱敏常量，只有 not_found_displayable 外显详情，故只断非空
    expect(res.message ?? '', '不存在主键必须给出非空拒因').not.toBe('');
    const readBack = await apiCallExpectFail(
      page,
      'GET',
      `/financial-analysis/reports/${ABSENT_ID}`
    );
    expect(readBack.status, '不存在主键回读仍应 404，证明前一腿没有落库').toBe(404);
  });

  test('490-05 删除 删后回读 404 且二次删除不幂等假成功', async ({ page }) => {
    const row = await seedReport(page, `E2E删除-${genCode('R490')}`);
    const del = await apiCall<null>(page, 'DELETE', `/financial-analysis/reports/${row.id}`);
    expect(del.message).toBe('财务分析报告删除成功');

    const gone = await apiCallExpectFail(page, 'GET', `/financial-analysis/reports/${row.id}`);
    expect(gone.status, '删后详情回读必须 404').toBe(404);
    expect(failureCode(gone)).toBe(APP_ERROR_CODES.NOT_FOUND);

    const twice = await apiCallExpectFail(page, 'DELETE', `/financial-analysis/reports/${row.id}`);
    expect(twice.status, '已删主键再删必须 404，不得幂等成功掩盖其实没删').toBe(404);

    const listed = await apiCall<ReportPage>(
      page,
      'GET',
      '/financial-analysis/reports?page=1&page_size=100'
    );
    expect(
      listed.data.items.some(x => x.id === row.id),
      '删后列表不得仍有该行'
    ).toBe(false);
  });

  test('490-06 执行 期间回显与状态透明 不存在主键 404', async ({ page }) => {
    const row = await seedReport(page, `E2E执行-${genCode('R490')}`);
    try {
      const ran = await apiCall<ExecuteResult>(
        page,
        'POST',
        `/financial-analysis/reports/${row.id}/execute?period=2026-01`
      );
      expect(ran.data.id).toBe(row.id);
      expect(ran.data.period, '执行腿必须回显请求期间而不是另造一个').toBe('2026-01');
      expect(['completed', 'no_data'], '状态只在这两态里取，不得虚构第三态').toContain(
        ran.data.status
      );
      expect(typeof ran.data.total_indicators_computed).toBe('number');
      expect(ran.data.executed_at).toBeTruthy();
      if (ran.data.status === 'no_data') {
        expect(ran.data.latest_result, '无数据时不得伪造计算值').toBeNull();
      }

      // 期间缺席时按当前年月，格式必须是 YYYY-MM
      const defaulted = await apiCall<ExecuteResult>(
        page,
        'POST',
        `/financial-analysis/reports/${row.id}/execute`
      );
      expect(defaulted.data.period).toMatch(/^\d{4}-\d{2}$/);

      const absent = await apiCallExpectFail(
        page,
        'POST',
        `/financial-analysis/reports/${ABSENT_ID}/execute`
      );
      expect(absent.status).toBe(404);
      expect(failureCode(absent)).toBe(APP_ERROR_CODES.NOT_FOUND);
    } finally {
      await tryCleanup(page, 'DELETE', `/financial-analysis/reports/${row.id}`, '490-06 报告');
    }
  });

  test('490-07 指标建档 显式编码回读 缺省编码走取号器且同秒不撞', async ({ page }) => {
    const explicitCode = genCode('IND490');
    const explicit = await apiCall<IndicatorRow>(page, 'POST', '/financial-analysis/indicators', {
      name: `E2E显式指标-${explicitCode}`,
      code: explicitCode,
      indicator_type: 'ratio',
      unit: 'percent',
    });
    expect(explicit.message).toBe('财务指标创建成功');
    expect(explicit.data.indicator_code).toBe(explicitCode);
    expect(explicit.data.indicator_type).toBe('ratio');

    const autoFirst = await apiCall<IndicatorRow>(page, 'POST', '/financial-analysis/indicators', {
      name: `E2E自动指标甲-${genCode('R490')}`,
    });
    const autoSecond = await apiCall<IndicatorRow>(page, 'POST', '/financial-analysis/indicators', {
      name: `E2E自动指标乙-${genCode('R490')}`,
    });
    try {
      expect(autoFirst.data.indicator_code).toMatch(/^IND\d{11,}$/);
      expect(autoSecond.data.indicator_code).toMatch(/^IND\d{11,}$/);
      expect(autoSecond.data.indicator_code, '缺省编码同秒两笔必须不同，否则撞 UNIQUE').not.toBe(
        autoFirst.data.indicator_code
      );
      expect(autoFirst.data.indicator_type, '类型缺席时默认 ratio').toBe('ratio');

      const readBack = await apiCall<ReportDetail>(
        page,
        'GET',
        `/financial-analysis/reports/${explicit.data.id}`
      );
      expect(readBack.data.indicator_code).toBe(explicitCode);
      expect(readBack.data.name).toBe(`E2E显式指标-${explicitCode}`);
    } finally {
      // 报告与指标共用 financial_indicators 表，删除腿按主键删，两类行都走它清理
      await tryCleanup(
        page,
        'DELETE',
        `/financial-analysis/reports/${explicit.data.id}`,
        '490-07 显式指标'
      );
      await tryCleanup(
        page,
        'DELETE',
        `/financial-analysis/reports/${autoFirst.data.id}`,
        '490-07 自动指标甲'
      );
      await tryCleanup(
        page,
        'DELETE',
        `/financial-analysis/reports/${autoSecond.data.id}`,
        '490-07 自动指标乙'
      );
    }
  });

  test('490-08 指标建档 重复编码被业务拒绝且只留一行', async ({ page }) => {
    const code = genCode('DUP490');
    const first = await apiCall<IndicatorRow>(page, 'POST', '/financial-analysis/indicators', {
      name: `E2E重复码甲-${code}`,
      code,
    });
    try {
      const dup = await apiCallExpectFail(page, 'POST', '/financial-analysis/indicators', {
        name: `E2E重复码乙-${code}`,
        code,
      });
      expect(dup.status, '重复编码应回 400 业务拒绝，不是裸数据库错').toBe(400);
      expect(failureCode(dup)).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
      expect(dup.message ?? '', '拒因应点名该编码已存在').toContain(code);
      expect(dup.message ?? '').toContain('已存在');

      const listed = await apiCall<ReportPage>(
        page,
        'GET',
        '/financial-analysis/reports?page=1&page_size=100'
      );
      expect(
        listed.data.items.filter(x => x.indicator_code === code),
        '重复编码被拒后库里只应有一行'
      ).toHaveLength(1);
    } finally {
      await tryCleanup(
        page,
        'DELETE',
        `/financial-analysis/reports/${first.data.id}`,
        '490-08 指标'
      );
    }
  });

  test('490-09 列表分页 第二页不与第一页重叠且覆盖新建三行', async ({ page }) => {
    const rows: ReportCreated[] = [];
    try {
      for (let i = 0; i < 3; i += 1) {
        rows.push(await seedReport(page, `E2E分页-${genCode('R490')}`));
      }
      const pageOne = await apiCall<ReportPage>(
        page,
        'GET',
        '/financial-analysis/reports?page=1&page_size=2'
      );
      const pageTwo = await apiCall<ReportPage>(
        page,
        'GET',
        '/financial-analysis/reports?page=2&page_size=2'
      );
      expect(pageOne.data.page).toBe(1);
      expect(pageTwo.data.page).toBe(2);
      expect(pageOne.data.items.length).toBeLessThanOrEqual(2);
      expect(pageTwo.data.items.length).toBeLessThanOrEqual(2);
      expect(pageOne.data.total).toBeGreaterThanOrEqual(3);

      const idsOne = pageOne.data.items.map(x => x.id);
      const idsTwo = pageTwo.data.items.map(x => x.id);
      // 页号一基：服务层自行减一算 offset，调用方再减一会让第二页退回第一页
      expect(
        idsTwo.filter(id => idsOne.includes(id)),
        '第二页不得与第一页重叠'
      ).toHaveLength(0);
      const union = new Set([...idsOne, ...idsTwo]);
      for (const row of rows) {
        expect(union.has(row.id), `新建行 ${row.id} 应落在前两页（按主键倒序）`).toBe(true);
      }
    } finally {
      for (const row of rows) {
        await tryCleanup(page, 'DELETE', `/financial-analysis/reports/${row.id}`, '490-09 报告');
      }
    }
  });
});
