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
 *     这是不依赖编译时能取到的最强判据；再窄会误杀模板串与字符串拼接的合法写法。
 *   4 前缀命中但该文件全文没有该 METHOD 记号时只点名为 WEAK 不判红：用例经封装的
 *     请求助手发请求时方法名不在 spec 里出现属正常形态，判红会把人推向"为过门硬塞
 *     方法名"的假用例。
 *   5 豁免台账每条必须带非空 reason，且只准给前端零调用的内部端点。端点的任一检索串能在
 *     frontend/src 命中就说明它有真界面入口、是用户可达功能，此时豁免判红，只能补用例，
 *     否则"登记一条带理由的豁免"就成了绕开这道门的正门。台账里存在但已不在新增集的条目
 *     判红（过期锁），否则同一位次再发时没人能发现这条豁免早已失去意义。
 *   6 基线、当前集、用例语料或前端源码任一解析量低于地板时退 9：判定器瞎了时它的绿不可信。
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
  const texts = files.map(f => ({
    rel: relative(corpusDir, f).replace(/\\/g, '/'),
    body: readFileSync(f, 'utf8'),
  }));
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

  const added = [...cur.keys()].filter(k => !b.keys.has(k)).sort();
  let fail = 0;
  let paired = 0;
  let weak = 0;
  let exempted = 0;
  for (const key of added) {
    const { method, path } = cur.get(key);
    const needles = matchNeedles(path);
    const hits = texts.filter(t => needles.some(n => t.body.includes(n)));
    if (hits.length > 0) {
      if (hits.some(t => new RegExp('\\b' + method + '\\b').test(t.body))) paired += 1;
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
    fail += 1;
    say(
      '  PAIRING_RED ' + key + ' 新增端点在 frontend/e2e 下零引用，须配套用例或显式登记带理由的豁免'
    );
  }
  const addedSet = new Set(added);
  for (const key of ex.map.keys()) {
    if (!addedSet.has(key)) {
      fail += 1;
      say('  EXEMPT_STALE ' + key + ' 已不在新增集里，豁免条目该删（留着会掩盖同位再发）');
    }
  }
  return {
    code: fail > 0 ? 1 : 0,
    head:
      'PAIRING baseline=' +
      b.keys.size +
      ' current=' +
      cur.size +
      ' added=' +
      added.length +
      ' paired=' +
      paired +
      ' weak=' +
      weak +
      ' exempt=' +
      exempted +
      ' unpaired=' +
      fail +
      ' corpusFiles=' +
      files.length +
      ' srcFiles=' +
      srcFiles.length +
      ' baselineSource=' +
      (baselineRef ? 'ref' : 'worktree'),
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
  const texts = corpusFiles(CORPUS).map(f => readFileSync(f, 'utf8'));
  const covered = [];
  const uncovered = [];
  const asymmetric = [];
  for (const key of cur.keys()) {
    const path = cur.get(key).path;
    const needles = matchNeedles(path);
    (texts.some(t => needles.some(n => t.includes(n))) ? covered : uncovered).push(key);
    if (path.startsWith(BASE_URL)) {
      const full = staticPrefix(path);
      const stripped = staticPrefix(path.slice(BASE_URL.length));
      if (
        stripped.split('/').filter(Boolean).length >= 2 &&
        !texts.some(t => t.includes(full)) &&
        texts.some(t => t.includes(stripped))
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

  // 基线取提交树那条腿也得真解析出东西：读回来的端点数与已提交快照同量才算通。
  // 工作树里这份快照若有未提交改动会让两条不同量，此时判 9 并要求先提交再跑门。
  const refBase = readBaselineFromRef('HEAD', BASELINE);
  probes.push([
    'baselineFromRefMustMatchCommittedBaseline',
    refBase.error || refBase.keys.size !== base.keys.size ? 1 : 0,
    0,
  ]);
  if (refBase.error) say('  SELFTEST_REF_BASELINE ' + refBase.error);

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

const out = SELF_TEST ? selfTest() : judge();
say(out.head || '');
if (!SELF_TEST) {
  if (out.code === 0) say('PAIRING_GREEN 新增端点全部有用例配对或已带理由豁免');
  if (out.code === 1) say('PAIRING_RED 有新增端点未配套 E2E 用例');
  if (out.code === 9) say('PAIRING_TOOLBUG 判定器或输入不可用，本道结论按不通过处理');
} else if (out.code === 0) {
  say('PAIRING_SELFTEST_OK');
}
process.exit(out.code);
