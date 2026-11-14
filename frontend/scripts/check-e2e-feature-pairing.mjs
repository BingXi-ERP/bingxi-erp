#!/usr/bin/env node
/**
 * check-e2e-feature-pairing.mjs — 新增后端端点必须配套 E2E 用例的合并前门禁
 *
 * 功能：把"本支新增的后端端点"与"前端 e2e 用例语料"做配对判定。新增端点在
 *       frontend/e2e 下找不到引用即判红，杜绝"功能合进主干但验证面一条没加"这类
 *       存量漏测的继续累积。
 * 调用方：.github/workflows/e2e-pairing.yml 在 pull_request 上跑；本地推送前门组与
 *       开发者手工跑 `node frontend/scripts/check-e2e-feature-pairing.mjs`；
 *       反向自证跑同文件加 --self-test。
 * 入参：--baseline <文本快照路径> 覆盖基线（缺省 frontend/scripts/route-snapshot.txt，
 *       即已认端点集）；--baseline-ref <git ref> 改从该 ref 的提交树里取同名快照当基线
 *       （CI 传分支起点，本地传 origin/main）；--require-baseline-ref 缺 ref 直接判 9；
 *       --corpus <目录> 覆盖用例语料根（缺省 frontend/e2e）；--src <目录> 覆盖前端源码根
 *       （缺省 frontend/src，用来判端点有没有真界面入口）；--exempt <json> 覆盖豁免台账；
 *       --floor <数> 覆盖端点数地板；--self-test 跑反向探针。
 * 传给谁：结论只写标准输出与退出码，不回调任何服务；CI 按退出码判负。
 * 存什么：不写仓内任何既有文件；自证模式在 frontend/scripts 下临时生成基线与台账夹具，
 *       结束时逐个删除，删不掉的会点名。
 * 存哪里：临时夹具只落 frontend/scripts，运行后清除。
 *
 * 判据语义（写死在此，回报同口径）：
 *   1 端点集来自 walkBackendRoutes()，与 check-api-paths 和 route-snapshot 同一套
 *     nest/merge 语义，不另起第二套解析口径（两套口径必然各自数出一套端点）。
 *   2 新增集 = 当前端点集 − 基线端点集，按 "METHOD PATH" 逐字对比，且基线必须取分支
 *     起点那一版。增端点的同一支里，端点基线漂移检查会逼提交者把新端点写进工作树的
 *     route-snapshot.txt，基线若读这份刚更新的文件，新增集恒空、这道门被合规提交自己
 *     拆掉（实测造一枚零引用新端点，不改快照判红，按规矩重生成快照后判绿）。
 *     CI 因此传 --baseline-ref <base 提交> 加 --require-baseline-ref。
 *   3 配对判据用静态前缀的两条检索串：/a/b/* 取 "/a/b/"，并同时给出摘掉 nest 挂载前缀
 *     后的同形串（用例走相对 baseURL 写法，正文里根本没有那层前缀），命中任一即算配对。
 *     这是不依赖编译时能取到的最强正文判据；再窄会误杀模板串与字符串拼接的合法写法。
 *   4 正文检索串之外再并一路"真实调用点"判据：把 spec 里发请求的路径字面量按
 *     normalizeCallPath 归一成与快照同形的 "METHOD PATH" 键（见该函数注释的分步规则），
 *     与正文检索串命中取并集。这一路专治正文检索串的先天盲区：helper 族写的是相对
 *     baseURL 的路径（单段资源如 /users 连去前缀检索串都不给），request 族写的是
 *     带基址插值的模板串，两种形态正文里都没有快照整串。并集只增不减：原有正文判据
 *     逐字不动，配得上的照样配上。
 *   5 前缀命中但该文件全文没有该 METHOD 记号时只点名为 WEAK 不判红：用例经封装的
 *     请求助手发请求时方法名不在 spec 里出现属正常形态，判红会把人推向"为过门硬塞
 *     方法名"的假用例。调用点归一出来的键自带方法，命中即算配对，不进 WEAK。
 *   6 豁免台账每条必须带非空 reason，且只准给前端零调用的内部端点。端点的任一检索串能在
 *     frontend/src 命中就说明它有真界面入口、是用户可达功能，此时豁免判红，只能补用例，
 *     否则"登记一条带理由的豁免"就成了绕开这道门的正门。台账里存在但已不在新增集的条目
 *     判红（过期锁），否则同一位次再发时没人能发现这条豁免早已失去意义。
 *   7 基线、当前集、用例语料或前端源码任一解析量低于地板时退 9：判定器瞎了时它的绿不可信。
 *
 * 退出码：0 通过；1 有判红项；9 判定器或输入不可用。
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { walkBackendRoutes, BASE_URL } from './check-api-paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const SELF_TEST = argv.includes('--self-test');
const BASELINE = flag('baseline', join(HERE, 'route-snapshot.txt'));
const BASELINE_REF = flag('baseline-ref', null);
const REQUIRE_BASELINE_REF = argv.includes('--require-baseline-ref');
const CORPUS = flag('corpus', join(REPO, 'frontend', 'e2e'));
const SRC = flag('src', join(REPO, 'frontend', 'src'));
const EXEMPT = flag('exempt', join(HERE, 'e2e-feature-pairing-exempt.json'));
const FLOOR = Number(flag('floor', 1000));
// 全量面模式：不比"本支相对起点的新增集"，而把当前全部端点拉进判定集，
// 配一份只减不增的漏配基线（棘轮），存量漏配只报告、新发生的才判红。
const FULL_SURFACE = argv.includes('--full-surface');
const RATCHET = flag('ratchet-baseline', join(HERE, 'e2e-feature-pairing-ratchet.json'));
// 生成/刷新棘轮基线用：跑完把本轮真判红的漏配端点写进该文件后退出，不参与判红结论。
const EMIT_RATCHET = flag('emit-ratchet', null);

const say = m => process.stdout.write(m + '\n');

/** 把快照文本拆成 "METHOD PATH" 键集：每行 METHOD<TAB>PATH<TAB>handler<TAB>file，# 开头是头部注释 */
function parseBaselineKeys(text) {
  const keys = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    keys.add(parts[0] + ' ' + parts[1]);
  }
  return keys;
}

/** 读工作树里的基线快照文件 */
function readBaseline(file) {
  if (!existsSync(file)) return { keys: null, error: '缺基线文件：' + file };
  return { keys: parseBaselineKeys(readFileSync(file, 'utf8')), error: null };
}

/**
 * 从某个提交的树里读基线快照，与 readBaseline 共用 parseBaselineKeys，两条取法同一口径。
 * 调用方是 judge()，入参 ref 由 CI 传分支起点的提交号、本地传 origin/main。
 * 取不到就交上层判 9：静默退回工作树那份会把"基线来自起点"这件事悄悄丢掉。
 */
function readBaselineFromRef(ref, file) {
  const rel = relative(REPO, file).replace(/\\/g, '/');
  try {
    const text = execFileSync('git', ['show', ref + ':' + rel], {
      cwd: REPO,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return { keys: parseBaselineKeys(text), error: null };
  } catch (e) {
    return {
      keys: null,
      error: '取不到提交 ' + ref + ' 里的 ' + rel + ' 基线快照：' + e.message.split('\n')[0],
    };
  }
}

/** 当前端点集：与基线同一谓词，键为规范形 "METHOD PATH" */
function currentKeys() {
  const { handlers } = walkBackendRoutes();
  const out = new Map();
  for (const [key, info] of handlers) {
    // walkBackendRoutes 的键是 "PATH METHOD"（与 route-snapshot 的取值次序一致：
    // 快照行 = METHOD<TAB>PATH）。读反会让"路径前缀"退化成方法名，
    // 于是任何含 DELETE/GET 字样的文件都算命中，门会恒绿。
    const i = key.lastIndexOf(' ');
    const path = key.slice(0, i);
    const method = key.slice(i + 1);
    out.set(method + ' ' + path, { method, path, handler: info.handler });
  }
  return out;
}

/**
 * 用例语料清单：只收真用例文件。
 * 排除 helper/fixture/清单类文件是这道门有效的前提——e2e 目录下存在把整张路由表
 * 抄进常量的枚举文件，一旦收进语料，任何按前缀判的配对门都会对全部端点判命中。
 */
function corpusFiles(dir) {
  const acc = [];
  const skip = new Set([
    'node_modules',
    'dist',
    '.git',
    'playwright-report',
    'test-results',
    'blob-report',
  ]);
  (function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!skip.has(e.name)) walk(join(d, e.name));
      } else if (/\.spec\.[cm]?[jt]s$/.test(e.name)) {
        acc.push(join(d, e.name));
      }
    }
  })(dir);
  return acc;
}

/**
 * 前端源码清单：src 下的实现文件，排除用例文件。
 * 这是"端点有没有真界面入口"这条豁免判据的分母；不收 .d.ts，那里面声明的注释路径也算引用。
 */
function sourceFiles(dir) {
  const acc = [];
  const skip = new Set(['node_modules', 'dist', '.git', 'coverage', 'assets']);
  (function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!skip.has(e.name)) walk(join(d, e.name));
      } else if (/\.(vue|ts|tsx|js|jsx|mjs)$/.test(e.name) && !/\.spec\./.test(e.name)) {
        acc.push(join(d, e.name));
      }
    }
  })(dir);
  return acc;
}

/** 静态前缀：路径里第一个 * 之前的部分；无 * 时取整串 */
function staticPrefix(path) {
  const star = path.indexOf('*');
  return star < 0 ? path : path.slice(0, star);
}

/**
 * 配对检索串：挂载前缀形态两侧不对称，必须两个都给。
 * 后端快照里的端点带完整 nest 前缀，而用例发请求时走的是相对 baseURL 的写法
 * （同一份 /api/v1/erp 前缀在 axios baseURL 里，不在 spec 文本里），只按快照整串
 * 检索会让绝大多数真有用例的端点被判零引用：实测 1821 枚端点里整串只命中 128 枚，
 * 去掉前缀后命中 1404 枚。命中任一串即算配对，去前缀串短于三段时不参与
 * （只剩 '/' 一类的前缀会让任何含斜杠的文件都算命中，判据退化）。
 */
function matchNeedles(path) {
  const full = staticPrefix(path);
  const out = [full];
  if (path.startsWith(BASE_URL)) {
    const stripped = staticPrefix(path.slice(BASE_URL.length));
    if (stripped.split('/').filter(Boolean).length >= 2) out.push(stripped);
  }
  return out;
}

/**
 * 调用点路径归一：把 spec 里写请求地址的字面量折算成与快照同形的 `/api/v1/erp/...` 路径。
 * 入参是已去引号的路径字面量原文；判不出合法端点路径时返回 null，该调用点不参与配对。
 * 分步规则（顺序有讲究，自证的三面调用点夹具 callSite*MustPair 各钉住其中几步的对照）：
 *   1 基址插值按前缀展开：`${API_BASE}${API_PREFIX}` 与 `${API_PREFIX}${API_BASE}` 这一对
 *     直接还原成挂载前缀；单独 `${API_BASE}`（host 形态）删掉；单独 `${API_PREFIX}` 还原成
 *     挂载前缀。必须先展开再折星：request 族大量写 `${API_BASE}${API_PREFIX}/crm/leads/${id}`，
 *     一律折成星号会把这整类真调用点抹成 `/api/v1/erp*`，端点照样配不上。
 *   2 去 host 形态的 `http(s)://<host>`（含 API_BASE 取默认值后的字面量写法）。
 *   3 丢查询串：第一个 `?` 之后的整段。
 *   4 剩下的 `${...}` 插值折成 `*`。
 *   5 以 `/` 收尾的（`'/aging-alert-rules/' + id` 这类拼接写法）补一个 `*` 段。
 *   6 纯数字段折成 `*`（快照里参数段一律写成独立一段 `*`，`/print-templates/99999999` 要对上
 *     `/print-templates/*`）。
 *   7 段完整性守卫：出现 `erp*`、`customers*` 这类星号粘在词干上的形态，说明插值或拼接跨在
 *     段中间（路径由变量整体拼出，静态不可知），判不可解析丢弃；同理残留 `$`、引号、花括号
 *     的也是没展开干净的插值，一并丢弃，宁缺毋滥。
 *   8 补前导 `/`；用例走相对 baseURL 写法时不带挂载前缀，缺则补上，补完仍不在前缀下的丢弃。
 */
function normalizeCallPath(literal) {
  let s = String(literal);
  s = s.replace(/\$\{\s*API_BASE\s*\}\s*\$\{\s*API_PREFIX\s*\}/g, BASE_URL);
  s = s.replace(/\$\{\s*API_PREFIX\s*\}\s*\$\{\s*API_BASE\s*\}/g, BASE_URL);
  s = s.replace(/\$\{\s*API_BASE\s*\}/g, '');
  s = s.replace(/\$\{\s*API_PREFIX\s*\}/g, BASE_URL);
  s = s.replace(/^https?:\/\/[^/]+/i, '');
  const q = s.indexOf('?');
  if (q >= 0) s = s.slice(0, q);
  s = s.replace(/\$\{[^}]*\}/g, '*');
  if (s.endsWith('/')) s += '*';
  const segs = s.split('/').map(seg => (/^\d+$/.test(seg) ? '*' : seg));
  if (segs.some(seg => seg.includes('*') && seg !== '*')) return null;
  if (segs.some(seg => /[$`{}'"]/.test(seg))) return null;
  let path = segs.join('/');
  if (!path.startsWith('/')) path = '/' + path;
  if (!path.startsWith(BASE_URL)) path = BASE_URL + path;
  return path.startsWith(BASE_URL + '/') ? path : null;
}

/**
 * 字面量片段的正则来源：三种引号形态各写一份，单行内不跨行。
 * 用正则字面量取 .source 而不是手写转义引号的字符串，是为了让这段模式在
 * prettier 与人工阅读下都保持原样，不必数反斜杠。
 */
const QUOTE = /['"]/.source;
const PATH_LITERAL = /(`[^`\r\n]*`|'[^'\r\n]*'|"[^"\r\n]*")/.source;
const METHOD_TOKEN = /(GET|POST|PUT|PATCH|DELETE|HEAD)/.source;

/**
 * 去注释：把源码里的注释行换成空行，代码行原样保留（行数不变，便于报错回指行号）。
 * 入参是语料文件正文，返回给 extractCallKeys 与"方法记号"判定用的纯代码文本。
 * 按行判形而不是逐字符扫描：本仓库用例的注释只有三种形态——整行双斜杠、JSDoc 与端点清单的
 * 整行星号开头、以及跨多行的块注释；行尾追加的尾随注释不动（那种行的主体是真代码，检索串本
 * 就该算）。手写词法扫描要同时认字符串、模板串、正则字面量里的引号，一处判错就把整段代码
 * 当成字符串吞掉，实测会让调用点抽取凭空多配或少配，得不偿失。
 */
function maskComments(src) {
  let inBlock = false;
  return String(src)
    .split('\n')
    .map(line => {
      const t = line.replace(/^\s+/, '');
      if (inBlock) {
        const end = t.indexOf('*/');
        if (end < 0) return '';
        inBlock = false;
        return t.slice(end + 2);
      }
      if (t.startsWith('//')) return '';
      if (t.startsWith('*')) return '';
      if (t.startsWith('/*')) {
        if (t.includes('*/')) return '';
        inBlock = true;
        return '';
      }
      return line;
    })
    .join('\n');
}

/**
 * 抽取一个文件里的全部调用点键（不看注释的版本）：把源码原样喂进来，
 * 注释里抄的调用形状同样会产出键。只给自证当对照面用，判定主体一律走
 * extractCallKeys（先屏蔽注释再抽）。为什么不能直接用它判定，见自证的
 * commentedCallSiteMustNotPair 探针。
 */
function collectCallKeys(text) {
  const out = new Set();
  const unquote = lit => lit.slice(1, -1);
  const push = (method, lit) => {
    const path = normalizeCallPath(unquote(lit));
    if (path) out.add(method + ' ' + path);
  };
  const helper = new RegExp(
    ',\\s*' + QUOTE + METHOD_TOKEN + QUOTE + '\\s*,\\s*' + PATH_LITERAL,
    'g'
  );
  const request = new RegExp(
    '\\.request\\s*\\.\\s*(get|post|put|patch|delete|head)\\s*\\(\\s*' + PATH_LITERAL,
    'gi'
  );
  const fetch = new RegExp('\\.request\\s*\\.\\s*fetch\\s*\\(\\s*' + PATH_LITERAL, 'gi');
  let m;
  while ((m = helper.exec(text))) push(m[1], m[2]);
  while ((m = request.exec(text))) push(m[1].toUpperCase(), m[2]);
  while ((m = fetch.exec(text))) {
    const opts = /method\s*:\s*['"]([A-Z]+)['"]/.exec(text.slice(m.index, m.index + 400));
    push(opts ? opts[1] : 'GET', m[1]);
  }
  return out;
}

/**
 * 一份正文的"可判定的代码面"：callText 是去注释后的文本，callKeys 是从它抽出的调用点键。
 * 两者必须同源——方法记号的判定也读 callText，否则会出现"键是屏蔽注释后抽的、方法名却是
 * 在注释里找到的"这种自相矛盾的口径。判定主体与自证都只经这里取用，不各写一遍组合。
 */
function fileCallSurface(body) {
  const callText = maskComments(body);
  return { callText, callKeys: collectCallKeys(callText) };
}

/**
 * 判定主体用的调用点抽取：先屏蔽注释再抽，注释里的路径字面量与调用形状一律不算配对证据。
 * 入参是语料文件正文，返回该文件的调用点键集合。
 * 不屏蔽会漏判到什么程度：实测有 22 枚端点现在只靠文件头那份"本用例覆盖哪些端点"的
 * 清单行过门，真实调用要么写成相对路径抽不出、要么把路径存在局部常量里静态不可知。
 * 清单类注释正是这道门要防的"抄一张表当引用"的形态，让它继续算证据就等于把门交给注释。
 */
function extractCallKeys(text) {
  return fileCallSurface(text).callKeys;
}

function loadExempt(file) {
  if (!existsSync(file)) return { map: new Map(), error: null };
  try {
    const arr = JSON.parse(readFileSync(file, 'utf8'));
    const map = new Map();
    for (const it of Array.isArray(arr) ? arr : []) {
      if (!it || !it.endpoint) continue;
      map.set(it.endpoint, String(it.reason || '').trim());
    }
    return { map, error: null };
  } catch (e) {
    return { map: new Map(), error: '豁免台账不是合法 JSON：' + e.message };
  }
}

/**
 * 一份语料文件对一枚端点有没有配对证据：正文检索串命中或调用点键命中，两路取并集。
 * 入参 file 是 judge() 与 selfTest() 共用的语料条目形状（body + callKeys），
 * needles 由 matchNeedles(端点路径) 给出，key 是规范形 "METHOD PATH"。
 * 判定主体与自证池必须走这一个谓词：两处各写一遍，改了判定主体忘了自证池，
 * 自证的分池数就不再是判定的分池数，探针会拿旧口径的池子去断言新口径的结论。
 */
function filePairsEndpoint(file, key, needles) {
  return needles.some(n => file.body.includes(n)) || file.callKeys.has(key);
}

/**
 * 判定主体。
 * @param {object} over 自证用的入参覆盖（baseline corpus exempt floor）
 * @returns {{code:number}} code 与退出码同义
 */
function judge(over = {}) {
  const baselineFile = over.baseline || BASELINE;
  const baselineRef = over.baselineRef === undefined ? BASELINE_REF : over.baselineRef;
  const needRef =
    over.requireBaselineRef === undefined ? REQUIRE_BASELINE_REF : over.requireBaselineRef;
  const corpusDir = over.corpus || CORPUS;
  const srcDir = over.src || SRC;
  const exemptFile = over.exempt || EXEMPT;
  const floor = over.floor || FLOOR;
  const fullSurface = over.fullSurface === undefined ? FULL_SURFACE : over.fullSurface;
  const ratchetFile = over.ratchet || RATCHET;
  const emitMode = over.emitRatchet === true;
  // 全量面（定期腿）不比分支起点差集，改把当前全部端点拉进判定集，配一份只减不增的
  // 漏配基线：基线内的存量漏配只报告，基线外新发生的才判红。该面不需要分支起点，
  // 因此也不受 --require-baseline-ref 约束（那条约束 protecting 的是增量面的差集语义）。
  let baseKeys = null;
  let baseCount = 0;
  let baseSource = 'fullSurface';
  if (!fullSurface) {
    if (needRef && !baselineRef) {
      return {
        code: 9,
        head:
          'TOOL_BUG 本道要求基线取分支起点（--require-baseline-ref）却没给 --baseline-ref：' +
          '改读工作树那份快照会让刚把新端点写进基线的同一支恒判零新增',
      };
    }
    const b = baselineRef
      ? readBaselineFromRef(baselineRef, baselineFile)
      : readBaseline(baselineFile);
    if (b.error) return { code: 9, head: 'TOOL_BUG ' + b.error };
    if (b.keys.size < floor) {
      return {
        code: 9,
        head:
          'TOOL_BUG 基线只解析出 ' +
          b.keys.size +
          ' 枚端点，低于地板 ' +
          floor +
          '，其"零新增"结论不可信',
      };
    }
    baseKeys = b.keys;
    baseCount = b.keys.size;
    baseSource = baselineRef ? 'ref' : 'worktree';
  }
  // 棘轮基线只在全面模式参与判定：读不到就判工具故障，既不把全部存量债一次判红
  // （那会让这道门永久挂不住），也不许把它当成零债通过。
  let debtKeys = new Set();
  if (fullSurface) {
    const ratchetMissing = !existsSync(ratchetFile);
    // 生成基线那一趟本来就没有基线可读，缺文件不算故障；其余任何缺文件都按工具故障处理：
    // 既不把全部存量债一次判红（那样这道门永久挂不住），也不当成零债通过。
    if (ratchetMissing && !emitMode) {
      return {
        code: 9,
        head:
          'TOOL_BUG 全量面缺漏配基线（' +
          relative(REPO, ratchetFile) +
          '）：没有它就分不清存量债与新漏配，按不通过处理',
      };
    }
    if (!ratchetMissing) {
      let parsed;
      try {
        parsed = JSON.parse(readFileSync(ratchetFile, 'utf8'));
      } catch (e) {
        return { code: 9, head: 'TOOL_BUG 漏配基线不是合法 JSON：' + e.message };
      }
      const list = Array.isArray(parsed) ? parsed : parsed && parsed.orphans;
      if (!Array.isArray(list)) {
        return {
          code: 9,
          head: 'TOOL_BUG 漏配基线既不是数组也没有 orphans 数组字段，无法当键集用',
        };
      }
      debtKeys = new Set(list.filter(k => typeof k === 'string'));
    }
  }
  const cur = currentKeys();
  if (cur.size < floor) {
    return {
      code: 9,
      head:
        'TOOL_BUG 当前路由面只解析出 ' +
        cur.size +
        ' 枚端点，低于地板 ' +
        floor +
        '，判定器无检测力',
    };
  }
  const files = corpusFiles(corpusDir);
  if (files.length < 10) {
    return {
      code: 9,
      head: 'TOOL_BUG 用例语料只看到 ' + files.length + ' 个文件，扫面过窄，配对结论不可信',
    };
  }
  const texts = files.map(f => {
    const body = readFileSync(f, 'utf8');
    // 调用点键与去注释文本每份文件只算一次：端点循环要拿一千八百多枚键来查表，
    // 在循环里对每枚端点把整份语料重扫一遍会让这道门慢到没人愿意跑。
    const surface = fileCallSurface(body);
    return {
      rel: relative(corpusDir, f).replace(/\\/g, '/'),
      body,
      callText: surface.callText,
      callKeys: surface.callKeys,
    };
  });
  const srcFiles = sourceFiles(srcDir);
  if (srcFiles.length < 100) {
    return {
      code: 9,
      head:
        'TOOL_BUG 前端源码只看到 ' +
        srcFiles.length +
        ' 个文件，扫面过窄，"有没有界面入口"这条豁免判据不可信',
    };
  }
  const srcTexts = srcFiles.map(f => readFileSync(f, 'utf8'));
  const ex = loadExempt(exemptFile);
  if (ex.error) return { code: 9, head: 'TOOL_BUG ' + ex.error };

  // 增量面判"本支相对起点新增的端点"，全量面判"当前在册的全部端点"；往下走的判据同一条。
  const scope = fullSurface
    ? [...cur.keys()].sort()
    : [...cur.keys()].filter(k => !baseKeys.has(k)).sort();
  let fail = 0;
  let paired = 0;
  let weak = 0;
  let exempted = 0;
  let debt = 0;
  const orphanKeys = [];
  for (const key of scope) {
    const { method, path } = cur.get(key);
    const needles = matchNeedles(path);
    const hits = texts.filter(t => filePairsEndpoint(t, key, needles));
    if (hits.length > 0) {
      // 调用点命中的那个文件本身就把方法名写在实参里（抽取形状要求 `, METHOD , 路径`），
      // 不必再回正文找方法记号。找记号只看去注释文本：文件头的端点清单会写满
      // "DELETE /api/v1/erp/..." 这类行，拿原文找会让一次真 GET 调用被判成 WEAK，
      // 反过来也能让只抄了清单的文件蒙成 paired。
      if (
        hits.some(t => t.callKeys.has(key) || new RegExp('\\b' + method + '\\b').test(t.callText))
      )
        paired += 1;
      else {
        weak += 1;
        say(
          '  PAIRING_WEAK ' + key + ' 前缀命中 ' + hits[0].rel + ' 但该文件无 ' + method + ' 记号'
        );
      }
      continue;
    }
    if (ex.map.has(key)) {
      const reason = ex.map.get(key);
      const srcHits = matchNeedles(path).filter(n => srcTexts.some(t => t.includes(n)));
      if (!reason) {
        fail += 1;
        say('  EXEMPT_NO_REASON ' + key + ' 豁免没写理由');
      } else if (srcHits.length > 0) {
        fail += 1;
        say(
          '  EXEMPT_UI_REACHABLE ' +
            key +
            ' 前端按 ' +
            srcHits[0] +
            ' 有调用点，属用户可达功能，不能靠豁免过门，须配套用例'
        );
      } else {
        exempted += 1;
        say('  PAIRING_EXEMPT ' + key + '（' + reason + '，前端零调用点）');
      }
      continue;
    }
    // 先把零引用端点记进漏配全集：清单要按可达性劈开全集，只劈基线外那部分会漏掉
    // 存量债，量出来的数就对不上自证池的 uncovered。
    orphanKeys.push(key);
    // 全量面：已在棘轮基线里的存量漏配只报告，不判红；基线外新出现的才判红。
    // 增量面没有这一层（新增集本就由起点差集算出，任何新增漏配都该当场判红）。
    if (fullSurface && debtKeys.has(key)) {
      debt += 1;
      say(
        '  PAIRING_DEBT ' +
          key +
          ' 存量漏配（在棘轮基线内），本轮只报告，补上用例后把该条从基线删掉'
      );
      continue;
    }
    fail += 1;
    say(
      '  PAIRING_RED ' +
        key +
        (fullSurface
          ? ' 全量面新漏配：端点在 frontend/e2e 下零引用且不在棘轮基线内，须配套用例或显式登记带理由的豁免'
          : ' 新增端点在 frontend/e2e 下零引用，须配套用例或显式登记带理由的豁免')
    );
  }
  const scopeSet = new Set(scope);
  for (const key of ex.map.keys()) {
    if (!scopeSet.has(key)) {
      fail += 1;
      say('  EXEMPT_STALE ' + key + ' 已不在新增集里，豁免条目该删（留着会掩盖同位再发）');
    }
  }
  // 棘轮基线只减不增：配上用例或端点下线的条目属正常退役，只提示不判红；
  // 反过来若基线读不出或条目被人为加宽，上面已按工具故障处理，不在这里放行。
  let retired = 0;
  if (fullSurface) {
    const orphanSet = new Set(orphanKeys);
    for (const key of [...debtKeys].sort()) {
      if (!orphanSet.has(key)) {
        retired += 1;
        say('  PAIRING_DEBT_RETIRED ' + key + ' 已配上用例或已下线，应从棘轮基线删除');
      }
    }
  }
  // 全量面的漏配分面报告：把本轮判红的零引用端点按"前端有没有调用点"劈成两半，
  // 再按 URL 资源段分组。可达那半是必须补用例的硬缺口，零调用点那半要先判归属
  // （对外或内部端点、死端点、还是前端漏接），两者处置完全不同，混在一个数里没法排批。
  // 可达性谓词与上面豁免分支用的是同一条（matchNeedles 命中前端源码），不另起口径。
  let reachableOrphans = 0;
  let deadOrphans = 0;
  if (fullSurface && orphanKeys.length > 0) {
    const groupOfKey = key => {
      const parts = key.split(' ')[1].split('/').filter(Boolean);
      return (parts[2] || parts[1] || '?') + '/' + (parts[3] || parts[2] || '');
    };
    const reach = new Map();
    const dead = new Map();
    for (const key of orphanKeys) {
      const isReachable = matchNeedles(cur.get(key).path).some(n =>
        srcTexts.some(t => t.includes(n))
      );
      const g = groupOfKey(key);
      const bucket = isReachable ? reach : dead;
      bucket.set(g, (bucket.get(g) || 0) + 1);
      if (isReachable) reachableOrphans += 1;
      else deadOrphans += 1;
    }
    const dump = (label, map) => {
      const rows = [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      say(
        `  PAIRING_GAP_${label} groups=${rows.length} total=${rows.reduce((s, [, v]) => s + v, 0)}`
      );
      for (const [g, n] of rows.slice(0, 20)) say(`    ${label.toLowerCase()} ${g}=${n}`);
    };
    dump('REACHABLE', reach);
    dump('DEAD', dead);
  }
  return {
    code: fail > 0 ? 1 : 0,
    unpaired: fail,
    orphans: orphanKeys,
    head:
      'PAIRING mode=' +
      (fullSurface ? 'full' : 'incremental') +
      (fullSurface ? ` reachableOrphans=${reachableOrphans} deadOrphans=${deadOrphans}` : '') +
      ' baseline=' +
      baseCount +
      ' current=' +
      cur.size +
      ' judged=' +
      scope.length +
      ' paired=' +
      paired +
      ' weak=' +
      weak +
      ' exempt=' +
      exempted +
      ' debt=' +
      debt +
      ' retired=' +
      retired +
      ' unpaired=' +
      fail +
      ' corpusFiles=' +
      files.length +
      ' srcFiles=' +
      srcFiles.length +
      ' baselineSource=' +
      baseSource,
  };
}

/** 临时夹具：写文件并登记待删 */
function makeTemp(name, content, cleanup) {
  const p = join(HERE, name);
  writeFileSync(p, content);
  cleanup.push(p);
  return p;
}

/**
 * 反向自证：用真谓词与真语料，靠"从基线里挖掉一条真端点"造出新增，验九条——
 * 无引用必判红、有引用必判绿、空基线必判 9（不许报"零新增"当过）、带理由的零界面豁免
 * 能救红、缺理由不放行、有界面入口的端点不许靠豁免过门、基线取提交树时必须与已提交快照
 * 同量、要求 base 侧基线却不给 ref 必判 9。任一没命中就判判定器无检测力。
 */
function selfTest() {
  const cleanup = [];
  const cur = currentKeys();
  const base = readBaseline(BASELINE);
  if (base.error) return { code: 9, head: 'TOOL_BUG 自证前置不成立：' + base.error };
  const texts = corpusFiles(CORPUS).map(f => {
    const body = readFileSync(f, 'utf8');
    return { body, callKeys: extractCallKeys(body) };
  });
  const covered = [];
  const uncovered = [];
  const asymmetric = [];
  for (const [key, info] of cur) {
    const path = info.path;
    const needles = matchNeedles(path);
    (texts.some(t => filePairsEndpoint(t, key, needles)) ? covered : uncovered).push(key);
    if (path.startsWith(BASE_URL)) {
      const full = staticPrefix(path);
      const stripped = staticPrefix(path.slice(BASE_URL.length));
      if (
        stripped.split('/').filter(Boolean).length >= 2 &&
        !texts.some(t => t.body.includes(full)) &&
        texts.some(t => t.body.includes(stripped))
      )
        asymmetric.push(key);
    }
  }
  const srcTexts = sourceFiles(SRC).map(f => readFileSync(f, 'utf8'));
  const noUi = [];
  const withUi = [];
  for (const key of uncovered) {
    const reach = matchNeedles(cur.get(key).path).some(n => srcTexts.some(t => t.includes(n)));
    (reach ? withUi : noUi).push(key);
  }
  say(
    'SELFTEST_POOL current=' +
      cur.size +
      ' covered=' +
      covered.length +
      ' uncovered=' +
      uncovered.length +
      ' asymmetric=' +
      asymmetric.length +
      ' uncoveredNoUi=' +
      noUi.length +
      ' uncoveredWithUi=' +
      withUi.length
  );
  if (covered.length === 0 || uncovered.length === 0) {
    return {
      code: 9,
      head:
        uncovered.length === 0
          ? 'TOOL_BUG 全部端点都判命中：判据过宽或语料里混进了枚举整张路由表的清单文件，这道门恒绿无意义'
          : 'TOOL_BUG 全部端点都判未命中：前缀匹配或语料根不对，这道门恒红也无意义',
    };
  }
  if (noUi.length < 2 || withUi.length === 0) {
    return {
      code: 9,
      head:
        'TOOL_BUG 豁免夹具池不成立（前端零调用 ' +
        noUi.length +
        ' 枚，有调用 ' +
        withUi.length +
        ' 枚）：要么语料退化成全命中，要么前端源码根扫不到引用，豁免判据无从验证',
    };
  }
  const dropBaseline = dropKey => {
    const kept = [...base.keys]
      .filter(k => k !== dropKey)
      .sort()
      .map(k => {
        const sp = k.indexOf(' ');
        return k.slice(0, sp) + '\t' + k.slice(sp + 1) + '\tprobe\thandler';
      });
    return makeTemp(
      '.selftest-baseline-' + cleanup.length + '.txt',
      '# layers=0 endpoints=' + kept.length + '\n' + kept.join('\n') + '\n',
      cleanup
    );
  };
  const emptyBaseline = makeTemp(
    '.selftest-baseline-empty.txt',
    '# layers=0 endpoints=0\n',
    cleanup
  );
  const emptyExempt = makeTemp('.selftest-exempt-empty.json', '[]\n', cleanup);
  const okExempt = makeTemp(
    '.selftest-exempt-ok.json',
    JSON.stringify([{ endpoint: noUi[0], reason: '自证夹具：内部端点无界面入口' }], null, 2) + '\n',
    cleanup
  );
  const noReasonExempt = makeTemp(
    '.selftest-exempt-noreason.json',
    JSON.stringify([{ endpoint: noUi[1], reason: '' }], null, 2) + '\n',
    cleanup
  );
  const uiReachableExempt = makeTemp(
    '.selftest-exempt-ui.json',
    JSON.stringify(
      [{ endpoint: withUi[0], reason: '自证夹具：声称内部端点但前端确有调用点' }],
      null,
      2
    ) + '\n',
    cleanup
  );

  const probes = [];
  probes.push([
    'unpairedMustBeRed',
    judge({ baseline: dropBaseline(noUi[0]), exempt: emptyExempt }).code,
    1,
  ]);
  probes.push([
    'pairedMustBeGreen',
    judge({ baseline: dropBaseline(covered[0]), exempt: emptyExempt }).code,
    0,
  ]);
  probes.push(['emptyBaselineMustBeToolBug', judge({ baseline: emptyBaseline }).code, 9]);
  probes.push([
    'exemptWithReasonMustBeGreen',
    judge({ baseline: dropBaseline(noUi[0]), exempt: okExempt }).code,
    0,
  ]);
  probes.push([
    'exemptWithoutReasonMustBeRed',
    judge({ baseline: dropBaseline(noUi[1]), exempt: noReasonExempt }).code,
    1,
  ]);
  probes.push([
    'exemptForUiReachableMustBeRed',
    judge({ baseline: dropBaseline(withUi[0]), exempt: uiReachableExempt }).code,
    1,
  ]);
  probes.push([
    'requireRefWithoutRefMustBeToolBug',
    judge({ requireBaselineRef: true, baselineRef: null, exempt: emptyExempt }).code,
    9,
  ]);
  // 前缀不对称探针：快照串带 nest 前缀、用例串不带，这类端点占了真端点的绝大多数。
  // 一旦有人把检索串退回"只认快照整串"，这里立刻从绿翻红，缺陷不会只体现在报错数量里。
  if (asymmetric.length === 0) {
    return {
      code: 9,
      head: 'TOOL_BUG 前缀不对称夹具为空：语料里已无"只写相对路径"的端点，检索串口径与语料形态脱节',
    };
  }
  probes.push([
    'prefixAsymmetryMustBeGreen',
    judge({ baseline: dropBaseline(asymmetric[0]), exempt: emptyExempt }).code,
    0,
  ]);

  // 调用点判据的三面正向夹具：夹具片段一律取自真端点集（键形对不上快照就说明归一写错了），
  // 每面都同时断言"旧正文判据配不上"与"新调用点判据配上"，只断言后者会退化成自证循环。
  // 挑不到对应形状的端点就判工具故障：这三面是本道检测力的来源，缺一面都不许报绿。
  const pickEndpoint = (method, segCount, tailIsParam) => {
    for (const [key, info] of cur) {
      if (!key.startsWith(method + ' ') || !info.path.startsWith(BASE_URL + '/')) continue;
      const parts = info.path.slice(BASE_URL.length + 1).split('/').filter(Boolean);
      if (parts.length !== segCount) continue;
      if (tailIsParam ? parts[segCount - 1] !== '*' : info.path.includes('*')) continue;
      return { key, info, rel: info.path.slice(BASE_URL.length) };
    }
    return null;
  };
  const fixtures = [];
  {
    const pick = pickEndpoint('GET', 1, false);
    if (!pick)
      return {
        code: 9,
        head: 'TOOL_BUG 调用点自证夹具前置不成立：端点集里没有单段资源端点，相对 baseURL 写法这条腿无从验证',
      };
    fixtures.push([
      'callSiteRelativeHelperMustPair',
      "const rows = await apiCallRaw<Row[]>(page, 'GET', '" + pick.rel + "?page=1&page_size=20');",
      pick.key,
    ]);
  }
  {
    const pick = pickEndpoint('GET', 2, true);
    if (!pick)
      return {
        code: 9,
        head: 'TOOL_BUG 调用点自证夹具前置不成立：端点集里没有 /资源/{id} 形态的 GET 端点，基址插值与数字段这条腿无从验证',
      };
    fixtures.push([
      'callSiteAbsoluteBaseMustPair',
      "const r = await page.request.get(`${API_BASE}${API_PREFIX}" +
        pick.rel.slice(0, -1) +
        "99999999`);",
      pick.key,
    ]);
  }
  {
    const pick = pickEndpoint('PUT', 2, true);
    if (!pick)
      return {
        code: 9,
        head: 'TOOL_BUG 调用点自证夹具前置不成立：端点集里没有 /资源/{id} 形态的 PUT 端点，字符串拼接写法这条腿无从验证',
      };
    fixtures.push([
      'callSiteConcatMustPair',
      "await apiCall<Row>(page, 'PUT', '" + pick.rel.slice(0, -1) + "' + row.id, body);",
      pick.key,
    ]);
  }
  for (const [name, fixture, key] of fixtures) {
    const oldPairs = matchNeedles(cur.get(key).path).some(n => fixture.includes(n));
    const newPairs = extractCallKeys(fixture).has(key);
    probes.push([name, !oldPairs && newPairs ? 0 : 1, 0]);
    if (oldPairs || !newPairs)
      say(
        '  SELFTEST_CALLSITE ' +
          name +
          ' key=' +
          key +
          ' oldPairs=' +
          oldPairs +
          ' newPairs=' +
          newPairs +
          ' fixture=' +
          fixture
      );
  }

  // 反向夹具两面包订注释这一条：夹具只用函数级断言，不看语料当前是不是孤儿，
  // 也不做"从 uncovered 里挑一枚"的运行时搜索——那种写法会因为别人补了用例而随机失效。
  // 两面各自先证明"不屏蔽注释的缺陷版本会放过它"，再证明屏蔽后不放，缺对照就等于没自证。
  const commentPick = pickEndpoint('DELETE', 2, true);
  if (!commentPick)
    return {
      code: 9,
      head: 'TOOL_BUG 注释自证夹具前置不成立：端点集里没有 /资源/{id} 形态的 DELETE 端点，注释里的调用形状无从验证',
    };
  {
    const key = commentPick.key;
    const staticRel = commentPick.rel.slice(0, -1);
    const commented =
      "  // 早期版本这样删：await apiCall(page, 'DELETE', '" +
      staticRel +
      "7', body);\n" +
      '/*\n' +
      "  await tryCleanup(page, 'DELETE', '" +
      staticRel +
      "7', '清理');\n" +
      '*/\n';
    const defectPairs = collectCallKeys(commented).has(key);
    const maskedPairs = extractCallKeys(commented).has(key);
    probes.push(['commentedCallSiteMustNotPair', defectPairs && !maskedPairs ? 0 : 1, 0]);
    if (!defectPairs || maskedPairs)
      say(
        '  SELFTEST_COMMENT commentedCallSiteMustNotPair key=' +
          key +
          ' 不屏蔽注释配上=' +
          defectPairs +
          ' 屏蔽后配上=' +
          maskedPairs
      );
  }
  {
    const info = commentPick.info;
    const needle = matchNeedles(info.path)[0];
    const docHeader = ' * - DELETE ' + info.path + ' 删档位（本用例覆盖的端点清单）\n';
    const masked = maskComments(docHeader);
    // 清单行同时供两样东西：整串检索串与方法记号。两者都必须只从注释里消失，
    // 否则"抄一行端点清单"就能把 WEAK 洗成 paired。
    const defectFeedsNeedle = docHeader.includes(needle);
    const defectFeedsMethod = new RegExp('\\bDELETE\\b').test(docHeader);
    const maskedFeedsNeedle = masked.includes(needle);
    const maskedFeedsMethod = new RegExp('\\bDELETE\\b').test(masked);
    probes.push([
      'docCommentMustNotFeedCallSurface',
      defectFeedsNeedle &&
        defectFeedsMethod &&
        !maskedFeedsNeedle &&
        !maskedFeedsMethod
        ? 0
        : 1,
      0,
    ]);
    if (
      !defectFeedsNeedle ||
      !defectFeedsMethod ||
      maskedFeedsNeedle ||
      maskedFeedsMethod
    )
      say(
        '  SELFTEST_COMMENT docCommentMustNotFeedCallSurface needle=' +
          needle +
          ' 原文含检索串=' +
          defectFeedsNeedle +
          ' 原文含方法记号=' +
          defectFeedsMethod +
          ' 屏蔽后含检索串=' +
          maskedFeedsNeedle +
          ' 屏蔽后含方法记号=' +
          maskedFeedsMethod
      );
  }

  // 工作树里这份快照若有未提交改动会让两条不同量，此时判 9 并要求先提交再跑门。
  const refBase = readBaselineFromRef('HEAD', BASELINE);
  probes.push([
    'baselineFromRefMustMatchCommittedBaseline',
    refBase.error || refBase.keys.size !== base.keys.size ? 1 : 0,
    0,
  ]);
  if (refBase.error) say('  SELFTEST_REF_BASELINE ' + refBase.error);

  // 全量面（定期腿）的两道对照：
  // 一 空棘轮基线必须把每一条非豁免的零引用端点都判红，证明换成全集后判定器真有检测力，
  //   而不是"作用面变宽反而恒绿"；
  // 二 把全部存量漏配登记进基线后，判红数必须恰好减去这么多，证明棘轮只遮住已登记的债，
  //   不顺手遮住豁免违规、陈旧豁免条目等其它判红项。
  // 造不出对照（非豁免零引用端点为 0）时直接判工具故障，不留"少跑两道探针也算自证通过"的洞。
  const exNow = loadExempt(EXEMPT);
  if (exNow.error) return { code: 9, head: 'TOOL_BUG 全量面自证前置不成立：' + exNow.error };
  const debtKeys = uncovered.filter(k => !exNow.map.has(k));
  if (debtKeys.length === 0) {
    return {
      code: 9,
      head: 'TOOL_BUG 全量面自证前置不成立：非豁免的零引用端点为 0，造不出棘轮对照',
    };
  }
  const emptyRatchet = makeTemp(
    'selftest-ratchet-empty.json',
    JSON.stringify({ orphans: [] }) + '\n',
    cleanup
  );
  const fullRatchet = makeTemp(
    'selftest-ratchet-full.json',
    JSON.stringify({ orphans: debtKeys.sort() }) + '\n',
    cleanup
  );
  const fullA = judge({ fullSurface: true, ratchet: emptyRatchet });
  const fullB = judge({ fullSurface: true, ratchet: fullRatchet });
  say(
    '  SELFTEST_FULL_SURFACE debt=' +
      debtKeys.length +
      ' emptyRatchetCode=' +
      fullA.code +
      ' fullRatchetCode=' +
      fullB.code +
      ' unpairedA=' +
      fullA.unpaired +
      ' unpairedB=' +
      fullB.unpaired
  );
  probes.push(['fullSurfaceEmptyRatchetMustRed', fullA.code, 1]);
  probes.push([
    'fullSurfaceRatchetSheltersOnlyListedDebt',
    fullA.unpaired - fullB.unpaired,
    debtKeys.length,
  ]);

  let caught = 0;
  const missed = [];
  for (const [name, got, want] of probes) {
    if (got === want) caught += 1;
    else missed.push(name + '(want=' + want + ' got=' + got + ')');
  }
  for (const p of cleanup) {
    try {
      unlinkSync(p);
    } catch (e) {
      say('  SELFTEST_CLEANUP_FAILED ' + p + ' ' + e.message);
    }
  }
  say(
    'SELFTEST caught=' +
      caught +
      '/' +
      probes.length +
      (missed.length ? ' missed:' + missed.join(',') : '')
  );
  return caught === probes.length
    ? { code: 0, head: 'PAIRING_DETECTOR_OK ' + probes.length + ' 道反向探针全部按预期命中' }
    : { code: 9, head: 'TOOL_BUG 反向探针有没命中的道，判定器无检测力，其绿不可信' };
}

// 生成基线只能取全量面的漏配集，因此 --emit-ratchet 隐含 --full-surface，不给"只把本支
// 新增集写进基线"这种会把存量债漏出基线、下一轮全判红的用法留口子。
const out = SELF_TEST
  ? selfTest()
  : judge(EMIT_RATCHET ? { fullSurface: true, emitRatchet: true } : {});
say(out.head || '');
if (EMIT_RATCHET) {
  // 生成/刷新棘轮基线：只把本轮真判红的零引用端点写进去（带理由豁免的条目由 exempt 台账
  // 单独管，不进基线）。写完按工具态退出，不给通过或不通过的结论——基线是给人审的数据，
  // 不是判定结果。
  if (out.code === 9) {
    say('PAIRING_TOOLBUG 判定器或输入不可用，不生成棘轮基线');
    process.exit(9);
  }
  const list = [...(out.orphans || [])].sort();
  writeFileSync(EMIT_RATCHET, JSON.stringify({ orphans: list }, null, 2) + '\n');
  say(
    'PAIRING_RATCHET_EMITTED ' +
      list.length +
      ' 枚存量漏配已写入 ' +
      relative(REPO, EMIT_RATCHET) +
      '（只减不增：配上用例或端点下线后删条目，禁止往里加新债）'
  );
  process.exit(0);
}
if (!SELF_TEST) {
  if (out.code === 0)
    say(
      FULL_SURFACE
        ? 'PAIRING_GREEN 全量面除已登记棘轮债外无新漏配'
        : 'PAIRING_GREEN 新增端点全部有用例配对或已带理由豁免'
    );
  if (out.code === 1)
    say(
      FULL_SURFACE
        ? 'PAIRING_RED 全量面有新漏配（零引用且不在棘轮基线内）'
        : 'PAIRING_RED 有新增端点未配套 E2E 用例'
    );
  if (out.code === 9) say('PAIRING_TOOLBUG 判定器或输入不可用，本道结论按不通过处理');
} else if (out.code === 0) {
  say('PAIRING_SELFTEST_OK');
}
process.exit(out.code);
