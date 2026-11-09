// 小程序调用点与仓内权威端点面的对账判定器
// 调用方：小程序适配批次（主编排与各派工实例）；入参：--root 小程序目录，--snapshot 快照文件，--self-test 自证
// 输出：逐条未命中、方法不符、无方法、非调用点上下文，旧路径残留分域计数，末行 MAP_OK 或 MAP_RED
// 判据：一 请求上下文里的每条 /api/v1/erp 字面量必须命中快照。字面量以斜杠结尾视为"后面还有动态段"，
//         按前缀匹配快照（快照的 `*` 与任意单段都可承接动态尾巴），否则按逐段等值或通配匹配
//       二 方法取自本行的 method 或 request.GET 一类调用名，取不到再向上下各 6 行找；仍取不到判无方法，不默认 GET
//       三 不在请求上下文里的字面量（权限码表与注释里的路径串）单列，不计入红，也不冒充已核对
// 检测力自证：--self-test 造六条夹具，要求已知存在的整路径与带动态尾巴的拼接路径各进、
//             已知不存在的路径与错方法各出、非请求上下文判为上下文外、旧路径被抓到；任一不合判 DETECTOR_BLIND
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const root = opt('root', 'E:/work/bingxi/wt-miniprogram/miniprogram');
const snapshotPath = opt(
  'snapshot',
  'E:/work/bingxi/wt-miniprogram/frontend/scripts/route-snapshot.txt'
);
const selfTest = argv.includes('--self-test');

function loadSnapshot() {
  const lines = fs.readFileSync(snapshotPath, 'utf8').split(/\r?\n/).filter((l) => l.trim());
  const list = [];
  for (const l of lines) {
    const cols = l.split('\t');
    if (cols.length < 2) continue;
    const method = cols[0].trim().toUpperCase();
    const p = cols[1].trim();
    if (!p.startsWith('/')) continue;
    list.push({ method, path: p, segments: p.split('/').filter(Boolean) });
  }
  return list;
}

const snapshot = loadSnapshot();

function callSegments(p) {
  return p
    .replace(/\$\{[^}]*\}/g, ':x')
    .replace(/\{[^}]*\}/g, ':x')
    .split('/')
    .filter(Boolean);
}

function segmentMatch(snapSeg, callSeg) {
  if (snapSeg === '*') return true;
  if (callSeg === ':x') return true;
  return snapSeg === callSeg;
}

// 整段匹配：字面量已含全部段（动态段写成 :x 或字面 id）
// 前缀匹配：字面量以斜杠结尾，说明后面还有运行期拼上的段，快照必须至少多出若干段且前缀逐段吻合
function matchEntry(entry, cs, dynamicTail) {
  if (dynamicTail) {
    if (entry.segments.length <= cs.length) return false;
    for (let i = 0; i < cs.length; i++) if (!segmentMatch(entry.segments[i], cs[i])) return false;
    return true;
  }
  if (entry.segments.length !== cs.length) return false;
  for (let i = 0; i < cs.length; i++) if (!segmentMatch(entry.segments[i], cs[i])) return false;
  return true;
}

function findMatches(method, callPath) {
  const dynamicTail = callPath.endsWith('/');
  const cs = callSegments(callPath);
  const hits = [];
  const otherMethods = [];
  for (const entry of snapshot) {
    if (!matchEntry(entry, cs, dynamicTail)) continue;
    (entry.method === method ? hits : otherMethods).push(entry);
  }
  return { hits, otherMethods };
}

const REQ_CONTEXT = /(url|request|bingxiBase|host|adapt\(|uploadFile|wx\.|\.then)/i;

function methodFromLine(line) {
  const m =
    line.match(/method:\s*["'](GET|POST|PUT|DELETE|PATCH)["']/i) ||
    line.match(/\.(GET|POST|PUT|DELETE|PATCH)\s*\(/) ||
    line.match(/\b(GET|POST|PUT|DELETE|PATCH)\b/);
  return m ? (m[1] || m[2]).toUpperCase() : null;
}

// 上传站点的方法不写在调用点：wx.uploadFile 与 uploadGateway.upload 都是 multipart POST，
// 后端对应端点在快照里也只有 POST 形态，所以按传输语义定为 POST，而不是留 UNKNOWN 当漏判
function methodFromUpload(window) {
  return /(?:wx\.uploadFile|uploadGateway\s*\.|\.\s*upload\s*\()/.test(window) ? "POST" : null;
}

function collectCallSites(dir, out, relBase) {
  const base = relBase || dir;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'miniprogram_npm' || e.name === 'node_modules') continue;
      collectCallSites(full, out, base);
    } else if (e.name.endsWith('.js')) {
      const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
      const rel = path.relative(base, full).replace(/\\/g, '/');
      lines.forEach((line, idx) => {
        for (const m of line.matchAll(/\/api\/v1\/erp\/[A-Za-z0-9_\-/:.{}$%*]+/g)) {
          const window = lines
            .slice(Math.max(0, idx - 6), Math.min(lines.length, idx + 7))
            .join('\n');
          const ctx = REQ_CONTEXT.test(line) || REQ_CONTEXT.test(window);
          const method =
            methodFromLine(line) || methodFromLine(window) || methodFromUpload(window) || 'UNKNOWN';
          const rec = { file: full.replace(/\\/g, '/'), rel, line: idx + 1, path: m[0], method, ctx };
          if (!ctx) out.outOfContext.push(rec);
          else out.calls.push(rec);
        }
        for (const m of line.matchAll(/\/(?:app-api|oauth-api)\/[A-Za-z0-9_\-/]*/g)) {
          out.legacy.push({ file: full.replace(/\\/g, '/'), rel, line: idx + 1, path: m[0] });
        }
      });
    }
  }
}

function emptyOut() {
  return { calls: [], legacy: [], outOfContext: [] };
}

if (selfTest) {
  const plain = snapshot.find((s) => s.segments.every((g) => g !== '*'));
  const wild = snapshot.find((s) => s.segments.some((g) => g === '*'));
  const wrongMethodCandidate = snapshot.find((s) => s.method === 'GET' && s.segments.every((g) => g !== '*'));
  const postPlain = snapshot.find((s) => s.method === 'POST' && s.segments.every((g) => g !== '*'));
  if (!plain || !wild || !wrongMethodCandidate || !postPlain) {
    console.log('DETECTOR_BLIND 快照里取不到普通、通配、可错配方法与 POST 四类探针');
    process.exit(9);
  }
  const plainPath = '/' + plain.segments.join('/');
  const wildPrefix = '/' + wild.segments.slice(0, wild.segments.indexOf('*')).join('/') + '/';
  const fakePath = '/api/v1/erp/__definitely_not_a_real_endpoint__/x';
  const postPath = '/' + postPlain.segments.join('/');
  const fixture = [
    'a({ url: bingxiBase() + "' + plainPath + '", method: "' + plain.method + '" });',
    'b({ url: bingxiBase() + "' + wildPrefix + '" + row.id, method: "GET" });',
    'c({ url: bingxiBase() + "' + plainPath + '", method: "DELETE" });',
    'd({ url: bingxiBase() + "' + fakePath + '", method: "GET" });',
    'e({ url: "/app-api/probe/legacy" });',
  ].join('\n');
  // 上下文外的探针单独一份文件：同文件邻居会把 ±6 行的上下文判据撑开，混在一起就测不出分类器本身
  const ctxFixture = '// 权限码表注释里出现 ' + plainPath + ' 但不是调用点\n';
  // 上传站点单独一份夹具：调用点不写 method，方法只能按 multipart 语义定为 POST
  const uploadFixture = [
    'uploadGateway.upload({',
    '  url: "".concat(app.config.bingxiHost).concat("' + postPath + '"),',
    '  filePath: picked.tempFilePath,',
    '  name: "avatar",',
    '});',
  ].join('\n');
  const tmpDir = 'E:/tmp/mp/_selftest';
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'fixture.js'), fixture, 'utf8');
  fs.writeFileSync(path.join(tmpDir, 'upload_fixture.js'), uploadFixture, 'utf8');
  fs.writeFileSync(path.join(tmpDir, 'ctx_fixture.js'), ctxFixture, 'utf8');
  const t = emptyOut();
  collectCallSites(tmpDir, t);
  fs.rmSync(tmpDir, { recursive: true, force: true });

  const probe = (p, method) => {
    const r = findMatches(method, p);
    return r.hits.length > 0;
  };
  const plainOk = t.calls.some((c) => c.path === plainPath && c.method === plain.method && probe(c.path, c.method));
  const tailOk = t.calls.some((c) => c.path === wildPrefix && c.path.endsWith('/') && probe(c.path, 'GET'));
  const wrongMethodOk = t.calls.some(
    (c) => c.path === plainPath && c.method === 'DELETE' && !probe(c.path, 'DELETE') &&
      findMatches('DELETE', c.path).otherMethods.length > 0
  );
  const fakeOk = t.calls
    .filter((c) => c.path.includes('__definitely'))
    .every((c) => findMatches(c.method, c.path).hits.length === 0);
  const ctxOk =
    t.outOfContext.some((x) => x.rel === 'ctx_fixture.js' && x.line === 1) &&
    !t.calls.some((x) => x.rel === 'ctx_fixture.js');
  const legacyOk = t.legacy.some((c) => c.path === '/app-api/probe/legacy');
  const uploadOk = t.calls.some(
    (c) => c.path === postPath && c.method === 'POST' && probe(c.path, 'POST')
  );
  const good = plainOk && tailOk && wrongMethodOk && fakeOk && ctxOk && legacyOk && uploadOk;
  console.log(
    'PROBE plain=' + (plainOk ? 'OK' : 'FAIL') + ' dynamicTail=' + (tailOk ? 'OK' : 'FAIL') +
      ' wrongMethod=' + (wrongMethodOk ? 'OK' : 'FAIL') + ' fake=' + (fakeOk ? 'OK' : 'FAIL') +
      ' contextSplit=' + (ctxOk ? 'OK' : 'FAIL') + ' legacy=' + (legacyOk ? 'OK' : 'FAIL') +
      ' upload=' + (uploadOk ? 'OK' : 'FAIL') +
      ' snapshot_entries=' + snapshot.length +
      ' probes=[' + plain.method + ' ' + plainPath + ' | GET ' + wildPrefix + '<id> | DELETE ' + plainPath +
      ' | POST ' + postPath + ']'
  );
  console.log(good ? 'DETECTOR_OK' : 'DETECTOR_BLIND');
  process.exit(good ? 0 : 9);
}

const all = emptyOut();
collectCallSites(root, all);

const miss = [];
const mismatch = [];
const unknown = [];
for (const c of all.calls) {
  if (c.method === 'UNKNOWN') {
    unknown.push(c);
    continue;
  }
  const r = findMatches(c.method, c.path);
  if (r.hits.length > 0) continue;
  if (r.otherMethods.length > 0) mismatch.push({ c, got: [...new Set(r.otherMethods.map((e) => e.method))] });
  else miss.push(c);
}

const byDomain = {};
for (const l of all.legacy) {
  const seg = l.path.split('/').filter(Boolean);
  const dom = (seg[0] === 'app-api' || seg[0] === 'oauth-api' ? seg[0] + ':' + (seg[1] || '(root)') : seg[0] || '(root)');
  byDomain[dom] = (byDomain[dom] || 0) + 1;
}

const loc = (x) => x.rel + ':' + x.line;
console.log('SNAPSHOT_ENTRIES=' + snapshot.length);
console.log('CALL_SITES=' + all.calls.length + ' OUT_OF_CONTEXT=' + all.outOfContext.length);
console.log('MISS=' + miss.length + ' METHOD_MISMATCH=' + mismatch.length + ' METHOD_UNKNOWN=' + unknown.length);
for (const x of miss) console.log('  MISS ' + x.method + ' ' + x.path + '  @ ' + loc(x));
for (const x of mismatch) console.log('  MM   ' + x.c.method + ' ' + x.c.path + ' 快照同路径只有 ' + x.got.join(',') + '  @ ' + loc(x.c));
for (const x of unknown) console.log('  UNK  ' + x.path + '  @ ' + loc(x));
for (const x of all.outOfContext) console.log('  CTX  ' + x.path + '  @ ' + loc(x));
console.log('LEGACY_TOTAL=' + all.legacy.length);
console.log(
  'LEGACY_BY_DOMAIN=' +
    Object.entries(byDomain)
      .sort((a, b) => b[1] - a[1])
      .map(([d, n]) => d + '=' + n)
      .join(' ')
);
const bad = miss.length + mismatch.length + unknown.length;
console.log(bad === 0 ? 'MAP_OK' : 'MAP_RED bad=' + bad);
process.exit(bad === 0 ? 0 : 1);
