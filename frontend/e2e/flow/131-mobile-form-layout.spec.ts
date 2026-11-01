import { test, expect, type Locator, type Page } from '../diagnose-fixture';
import { loginViaUI, BASE_URL, apiCallRaw, tryCleanup } from './helpers';

/*
 * 移动端表单排版与可读性两族实测判据：可点区域目标尺寸与 320 像素宽回流。
 *
 * 调用方：CI 的 e2e flow 分片与本地 playwright --list，视口由本文件自行设定。
 * 入参：page，由 diagnose-fixture 注入，带会话与诊断上下文。
 * 传给谁：判据依据 WCAG 2.2 SC 2.5.8 Target Size (Minimum) 的 24×24 CSS 像素下限
 *         与等价的 24 CSS 像素中心间距豁免、WCAG 1.4.10 Reflow 的 320 CSS 像素视口
 *         不得要求二维滚动；测量对象是染色批次新建弹窗（views/dye-batch/index.vue）、
 *         坯布列表行操作与坯布详情弹窗（components/GreigeDetailDialog.vue）的真实
 *         渲染命中盒，换行契约对应 frontend/src/styles/mobile-content.css 的
 *         描述项换行与弹窗收口声明，全部用 boundingBox 与计算样式实测，不读 CSS 源码字符串。
 * 存什么：五段可复现的渲染事实，弹窗控件与页脚按钮命中盒尺寸及中心间距、
 *         行内操作按钮命中盒、320 视口下文档水平溢出量、详情弹窗对视口的收纳关系、
 *         长值单元格换行后相对单行排版的高度增益与裁切溢出。
 * 存哪里：本文件，随 e2e/flow 目录由分片编排的 hash 分片收集。
 *
 * 长值种子是经真实接口建档的坯布记录：品名、缸号、备注三值都刻意拉长到超过
 * 320 视口下详情弹窗的可用行宽。缸号取连续大写字母加数字，专门用来判连续字符
 * 断行是否生效（CJK 逐字可断，掩盖不了 word-break 回退）。清理沿用仓库既有
 * 语义：在库坯布按设计不允许直接删除，helpers tryCleanup 只尽力回收并告警。
 */

/** WCAG 2.2 SC 2.5.8 最小目标尺寸与间距豁免半径，CSS 像素 */
const MIN_TARGET_SIZE = 24;
/** 表单族测量视口：360×780，与既有窄屏竖屏回归用例同档 */
const FORM_VIEWPORT = { width: 360, height: 780 };
/** 回流族测量视口：320×568，取 WCAG 1.4.10 的 320 CSS 像素参考宽 */
const REFLOW_VIEWPORT = { width: 320, height: 568 };
/** 文档水平溢出容差 2px：亚像素取整与滚动条宽，沿用本仓窄屏回归既有约定 */
const DOC_OVERFLOW_TOLERANCE = 2;

const suffix = Date.now().toString().slice(-6);

interface HitBox {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LongValueGreige {
  id: number;
  fabricName: string;
  dyeLotNo: string;
  remarks: string;
}

async function gotoRoute(page: Page, route: string): Promise<void> {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
}

/**
 * 逐元素量真实命中盒。调用方：两族尺寸用例。入参：同一语义组的选择器定位与命名前缀。
 * 传给谁：结果只进本文件的尺寸判定。存什么存哪里：只在内存，不落库不落盘。
 * 定位可见但量不出盒（未渲染、被样式摘除）时显式抛错点名元素，不静默跳过。
 */
async function collectBoxes(locator: Locator, name: string): Promise<HitBox[]> {
  const boxes: HitBox[] = [];
  const count = await locator.count();
  for (let i = 0; i < count; i++) {
    const box = await locator.nth(i).boundingBox();
    if (!box) throw new Error(`${name} 第 ${i + 1} 个目标未渲染出可测量命中盒`);
    boxes.push({ name: `${name}#${i + 1}`, ...box });
  }
  return boxes;
}

/**
 * SC 2.5.8 间距豁免的规范条件：过小目标只有当以它为圆心、其它每个可达目标为圆心
 * 的两个 24 CSS 像素直径圆都不相交时才豁免，等价于中心距不小于 24。
 * 逐对判中心距，不做任何整体放宽。
 */
function spacingExempted(target: HitBox, all: HitBox[]): boolean {
  const cx = target.x + target.width / 2;
  const cy = target.y + target.height / 2;
  return all.every(other => {
    if (other === target) return true;
    const ox = other.x + other.width / 2;
    const oy = other.y + other.height / 2;
    return Math.hypot(cx - ox, cy - oy) >= MIN_TARGET_SIZE;
  });
}

/** 汇总既不满足 24×24 又拿不到间距豁免的目标，附实测尺寸，空数组即无违规 */
function findUndersizedTargets(boxes: HitBox[]): string[] {
  return boxes
    .filter(b => b.width < MIN_TARGET_SIZE || b.height < MIN_TARGET_SIZE)
    .filter(b => !spacingExempted(b, boxes))
    .map(
      b =>
        `${b.name} 实测 ${Math.round(b.width)}x${Math.round(b.height)}，且中心 24px 内有其它可达目标`
    );
}

/** 文档级水平溢出量：滚动宽减可视宽，表格与描述列表的内部横向滚动不计入 */
async function documentOverflowX(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
}

/** 按标记向真实接口建档一条品名、缸号、备注均为超长值的坯布记录，返回主键与三值 */
async function seedLongValueGreige(page: Page, tag: string): Promise<LongValueGreige> {
  const fabricName = `e2e超长品名回检${suffix}${tag}一号棉平纹高纱支高密坯布`;
  const dyeLotNo = `DYELOT${suffix}${tag.toUpperCase()}ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789`;
  const remarks = `备注长值回检${suffix}${tag}：缸号与品名的换行回归验证，本段文本需要在窄屏下跨行完整显示不被裁切`;
  const created = await apiCallRaw<Record<string, unknown>>(
    page,
    'POST',
    '/production/greige-fabrics',
    {
      fabric_name: fabricName,
      fabric_type: '坯布',
      dye_lot_no: dyeLotNo,
      remarks,
    }
  );
  const id = Number(created?.id);
  expect(id, `长值坯布种子应建档成功：${JSON.stringify(created).slice(0, 160)}`).toBeGreaterThan(0);
  return { id, fabricName, dyeLotNo, remarks };
}

/** 进坯布列表按名称模糊筛选定位种子行，筛不出即点名失败，不放行空集合断言 */
async function findSeedRow(page: Page, fabricName: string): Promise<Locator> {
  await gotoRoute(page, '/greige-fabrics');
  const filter = page.getByPlaceholder('按坯布名称模糊匹配');
  await expect(filter, '坯布列表应有名称模糊筛选入口').toBeVisible();
  await filter.fill(fabricName);
  await page.getByRole('button', { name: '查询', exact: true }).click();
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  const row = page
    .locator('.el-table__body-wrapper .el-table__row')
    .filter({ hasText: fabricName })
    .first();
  await expect(row, `筛选后应回显长值种子行 ${fabricName.slice(0, 20)}…`).toBeVisible();
  return row;
}

/** 从种子行点详情打开坯布详情弹窗，弹窗由组件声明的测试标识锚定 */
async function openDetailDialog(page: Page, row: Locator): Promise<Locator> {
  await row.getByRole('button', { name: '详情', exact: true }).click();
  const dialog = page.locator('[data-testid="greige-detail-dialog"]');
  await expect(dialog, '点击行内详情后详情弹窗必须出现').toBeVisible();
  return dialog;
}

test.describe('窄屏表单可点区域目标尺寸', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(FORM_VIEWPORT);
    await loginViaUI(page);
  });

  test('染缸批次新建弹窗的输入框、下拉触发器、日期触发器与页脚按钮命中盒不低于 24×24 或满足间距豁免', async ({
    page,
  }) => {
    await gotoRoute(page, '/dye-batch');
    const trigger = page.getByRole('button', { name: '新建批次' });
    await expect(trigger, '染色批次页应有新建批次入口').toBeVisible();
    await trigger.click();
    const dialog = page.locator('.el-dialog').first();
    await expect(dialog, '点新建批次后弹窗必须出现').toBeVisible();

    const fields = dialog.locator(
      '.el-form-item .el-input__wrapper, .el-form-item .el-select__wrapper, .el-form-item .el-textarea__inner'
    );
    expect(
      await fields.count(),
      '新建弹窗表单应至少含批次号、色号、缸号、数量四个输入与产品下拉、染色日期、备注'
    ).toBeGreaterThanOrEqual(7);
    const footerButtons = dialog.locator('.el-dialog__footer .el-button');
    expect(await footerButtons.count(), '弹窗页脚应含取消与确认两枚按钮').toBeGreaterThanOrEqual(2);

    const boxes = [
      ...(await collectBoxes(fields, '弹窗表单控件')),
      ...(await collectBoxes(footerButtons, '弹窗页脚按钮')),
    ];
    expect(
      findUndersizedTargets(boxes),
      `窄屏新建弹窗存在低于 ${MIN_TARGET_SIZE}×${MIN_TARGET_SIZE} 且无间距豁免的命中盒`
    ).toEqual([]);
  });

  test('坯布列表行内操作按钮（含删行）命中盒不低于 24×24 或满足间距豁免', async ({ page }) => {
    const seed = await seedLongValueGreige(page, 'A');
    try {
      const row = await findSeedRow(page, seed.fabricName);
      const rowButtons = row.getByRole('button');
      expect(
        await rowButtons.count(),
        '种子行行内应至少有详情、编辑、删除三枚操作按钮'
      ).toBeGreaterThanOrEqual(3);
      const boxes = await collectBoxes(rowButtons, '行内操作按钮');
      expect(
        findUndersizedTargets(boxes),
        `窄屏坯布行操作存在低于 ${MIN_TARGET_SIZE}×${MIN_TARGET_SIZE} 且无间距豁免的命中盒`
      ).toEqual([]);
    } finally {
      await tryCleanup(page, 'DELETE', `/production/greige-fabrics/${seed.id}`, '清理长值坯布种子');
    }
  });
});

test.describe('320 宽回流不回退二维滚动', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(REFLOW_VIEWPORT);
    await loginViaUI(page);
  });

  test('320 视口下列表页文档级无水平溢出', async ({ page }) => {
    const seed = await seedLongValueGreige(page, 'B');
    try {
      await findSeedRow(page, seed.fabricName);
      const overflow = await documentOverflowX(page);
      expect(
        overflow,
        `320 视口下文档滚动宽超出可视宽 ${overflow}px，容差 ${DOC_OVERFLOW_TOLERANCE}px（表格内部横向滚动不计入）`
      ).toBeLessThanOrEqual(DOC_OVERFLOW_TOLERANCE);
    } finally {
      await tryCleanup(page, 'DELETE', `/production/greige-fabrics/${seed.id}`, '清理长值坯布种子');
    }
  });

  test('320 视口下详情弹窗收进视口且文档仍无水平溢出', async ({ page }) => {
    const seed = await seedLongValueGreige(page, 'C');
    try {
      const row = await findSeedRow(page, seed.fabricName);
      const dialog = await openDetailDialog(page, row);

      const viewport = page.viewportSize();
      if (!viewport) throw new Error('视口未设置，无法测量弹窗宽度');
      const box = await dialog.boundingBox();
      if (!box) throw new Error('详情弹窗未渲染出可测量区域');
      expect(box.x, `弹窗左边缘 ${box.x} 不应移出视口`).toBeGreaterThanOrEqual(0);
      expect(
        box.x + box.width,
        `弹窗右边缘 ${box.x + box.width} 不应超出视口宽 ${viewport.width}`
      ).toBeLessThanOrEqual(viewport.width + 1);
      expect(
        box.width,
        `弹窗应收进但保持可用宽度，实测 ${box.width} 说明窄屏收口层被改坏`
      ).toBeGreaterThanOrEqual(viewport.width * 0.7);

      const innerOverflow = await dialog.evaluate(el => el.scrollWidth - el.clientWidth);
      expect(innerOverflow, '弹窗自身不应横向溢出').toBeLessThanOrEqual(DOC_OVERFLOW_TOLERANCE);

      const overflow = await documentOverflowX(page);
      expect(
        overflow,
        `320 视口下弹窗打开后文档仍不应水平溢出，实测 ${overflow}px`
      ).toBeLessThanOrEqual(DOC_OVERFLOW_TOLERANCE);
    } finally {
      await tryCleanup(page, 'DELETE', `/production/greige-fabrics/${seed.id}`, '清理长值坯布种子');
    }
  });

  test('320 视口下详情弹窗缸号、品名、备注长值换行显示不被裁切', async ({ page }) => {
    const seed = await seedLongValueGreige(page, 'D');
    try {
      const row = await findSeedRow(page, seed.fabricName);
      const dialog = await openDetailDialog(page, row);

      const cells: Array<{ label: string; value: string }> = [
        { label: '缸号', value: seed.dyeLotNo },
        { label: '品名', value: seed.fabricName },
        { label: '备注', value: seed.remarks },
      ];
      for (const cell of cells) {
        const content = dialog
          .locator('.el-descriptions__content')
          .filter({ hasText: cell.value })
          .first();
        await expect(
          content,
          `详情弹窗应渲染${cell.label}长值 ${cell.value.slice(0, 18)}…`
        ).toBeVisible();

        const proof = await content.evaluate(el => {
          const computed = window.getComputedStyle(el);
          const wrappedHeight = el.getBoundingClientRect().height;
          // 临时把同一单元格压成单行排版量基准高，量完立即还原，只测不改页面终态
          const previous = el.style.whiteSpace;
          el.style.whiteSpace = 'nowrap';
          const singleLineHeight = el.getBoundingClientRect().height;
          el.style.whiteSpace = previous;
          return {
            whiteSpace: computed.whiteSpace,
            wordBreak: computed.wordBreak,
            overflowWrap: computed.overflowWrap,
            wrappedHeight,
            singleLineHeight,
            clipOverflow: el.scrollWidth - el.clientWidth,
          };
        });

        expect(
          proof.whiteSpace,
          `${cell.label}值单元格应保持可换行排版，实测 white-space=${proof.whiteSpace}`
        ).toBe('normal');
        const breakable = ['break-word', 'break-all', 'anywhere'];
        expect(
          breakable.includes(proof.wordBreak) || breakable.includes(proof.overflowWrap),
          `${cell.label}值单元格必须能断连续字符行，实测 word-break=${proof.wordBreak}、overflow-wrap=${proof.overflowWrap}`
        ).toBe(true);
        expect(
          proof.wrappedHeight,
          `${cell.label}长值实际高度应高于压成单行后的基准（换行真实生效），实测 ${proof.wrappedHeight} 对单行 ${proof.singleLineHeight}`
        ).toBeGreaterThan(proof.singleLineHeight * 1.5);
        expect(
          proof.clipOverflow,
          `${cell.label}值换行后不应仍在单元格内横向溢出被裁切，实测溢出 ${proof.clipOverflow}px`
        ).toBeLessThanOrEqual(DOC_OVERFLOW_TOLERANCE);
      }
    } finally {
      await tryCleanup(page, 'DELETE', `/production/greige-fabrics/${seed.id}`, '清理长值坯布种子');
    }
  });
});
