// 4.36 扫码内容校验：非本系统/残缺布卷码被定长解析门拒绝，且不落库。
// 后端判据：services/inbound_qr_code.rs:16-26 定长切分（款号 6 + 染厂色号 7 +
//   匹号 3，缸号可变，最短 16 字符）；:41-58 七类拒绝变体；:60-66 不裁剪空白、
//   逐段字符集校验。services/scan_inbound.rs:642-658 register_scanned_roll 先查
//   库位非空再 parse_inbound_qr，parse 失败即 qr_rejection_error（:294-319
//   validation_displayable 文案可外显）。端点 handlers/barcode_scanner_handler.rs
//   :305-333 POST /scanner/scan-receipt，权限 scan-receipt:create 授权仓管岗
//   （init_service_ops/permission.rs:896-902）。
// 与既有覆盖分工：全 e2e 无 scan-receipt 调用（仅 213 注释、26 健康检查 history），
//   台账 .monkeycode scheme-audit 把 4.36 标「已闭合」只覆盖色卡码(23)/卷码(211)，
//   本例专钉扫码入库的定长格式拒绝腿。
// 零前置：parse 在 resolve 查库（产品/色号映射/库位）之前，畸形码必先撞格式门，
//   无需建主数据；position_no 仅非空校验、length 给合法正数，让断言只落在 QR 段。
// 检测力：任一格式门漏掉则该畸形码进入查库返回别的码或 200，断言即红。
import { test, expect } from '../diagnose-fixture';
import {
  loginAsRole,
  apiCallExpectFail,
  expectStateGateRejection,
  APP_ERROR_CODES,
} from '../flow/helpers';

interface QrCase {
  label: string;
  barcode: string;
  keyword: string;
}

// 合法框架：006523(款号6) 0029265(色号7) JL26092602(缸号) 022(匹号3)
const CASES: QrCase[] = [
  {
    label: '内嵌空格不裁剪',
    barcode: '006523 0029265JL26092602022',
    keyword: '空格或不可见字符',
  },
  {
    label: '串长不足三段定长',
    barcode: '006523002926502',
    keyword: '长度不够',
  },
  {
    label: '缸号段为空',
    barcode: '0065230029265022',
    keyword: '缸号段一个字符都没有',
  },
  {
    label: '款号段非数字',
    barcode: 'ABC1230029265JL26092602022',
    keyword: '款号里出现了数字以外的字符',
  },
  {
    label: '染厂色号段非数字',
    barcode: '006523ABC1234JL26092602022',
    keyword: '色号里出现了数字以外的字符',
  },
  {
    label: '缸号段含连字符',
    barcode: '0065230029265JL-2602602022',
    keyword: '字母与数字以外的字符',
  },
  {
    label: '匹号段非数字',
    barcode: '0065230029265JL26092602A22',
    keyword: '最后三位不是三位数字匹号',
  },
];

test('450-01 七类畸形布卷码被定长解析门拒绝且拒因可行动', async ({ page }) => {
  await loginAsRole(page, 'warehouse_keeper');

  for (const c of CASES) {
    const rejected = await apiCallExpectFail(page, 'POST', '/scanner/scan-receipt', {
      barcode: c.barcode,
      position_no: 'E2E450-POS',
      length: '100',
    });
    expectStateGateRejection(rejected, `扫码入库-${c.label}`);
    expect(rejected.code, `[450] ${c.label} 须为校验拒绝码，实际 ${rejected.code}`).toBe(
      APP_ERROR_CODES.VALIDATION_ERROR
    );
    expect(
      String(rejected.message ?? ''),
      `[450] ${c.label} 拒因须点名具体段位，实际 ${JSON.stringify(rejected.message)}`
    ).toContain(c.keyword);
  }
});
