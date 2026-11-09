// app.json 声明与磁盘页面的双向对账判定器
// 调用方 scripts/ci/miniprogram-checks.sh 第三道，以及本地手工复算
// 入参 process.argv[2] 小程序根目录（其内有 app.json）
// 传给谁 判定结果只走 stdout 与退出码，不落盘
// 存什么 每条缺失或未声明的页面路径
// 存哪里 不存储
// 判据 一 app.json 的 pages 与各 subPackages.pages（拼上 root 前缀）逐条必须在磁盘存在同名 .js 加 .json 加 .wxml 加 .wxss 之一
//      二 磁盘上带 wxml 与 json 且未被标为组件的页面目录必须出现在 app.json 里，否则是写了进不去的死页
//      三 自检探针：往声明表里塞一条不存在的路径，必须被 MISSING 抓到，抓不到判 DETECTOR_BLIND 并退 9
const fs = require('fs');
const path = require('path');

const root = process.argv[2];
if (!root || !fs.existsSync(path.join(root, 'app.json'))) {
  console.log('TOOL_BUG 取不到 app.json：' + (root || '(未传参)'));
  process.exit(9);
}

const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const declared = [];
for (const p of appJson.pages || []) declared.push(p);
for (const sp of appJson.subPackages || appJson.subpackages || []) {
  const rootDir = String(sp.root || '').replace(/\/$/, '');
  for (const p of sp.pages || []) declared.push(rootDir + '/' + p);
}

function existsEntry(rel) {
  const base = path.join(root, rel);
  return ['.js', '.json', '.wxml', '.wxss'].some((ext) => fs.existsSync(base + ext));
}

const missing = declared.filter((d) => !existsEntry(d));

const onDisk = [];
const skipDirs = new Set(['miniprogram_npm', 'node_modules', '.git']);
(function walk(dir, rel) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(e.name) || e.name.startsWith('@')) continue;
    const full = path.join(dir, e.name);
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walk(full, r);
    else if (e.name.endsWith('.js')) {
      const stem = r.replace(/\.js$/, '');
      const hasWxml = fs.existsSync(path.join(root, stem + '.wxml'));
      const jsonPath = path.join(root, stem + '.json');
      let isComponent = false;
      if (fs.existsSync(jsonPath)) {
        try {
          const j = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
          isComponent = !!(j && j.component === true);
        } catch (err) {
          isComponent = false;
        }
      }
      if (hasWxml && !isComponent) onDisk.push(stem);
    }
  }
})(root, '');

const declaredSet = new Set(declared);
// app.js 是应用入口，不是页面，不能算未声明页面
const undeclared = onDisk.filter((p) => !declaredSet.has(p) && p !== 'app');

console.log('MP_PAGES declared=' + declared.length + ' onDiskPage=' + onDisk.length);
for (const m of missing) console.log('  MISSING ' + m);
for (const u of undeclared) console.log('  UNDECLARED_PAGE ' + u);

// 检测力自证：声明表里加一条必定不存在的路径，必须被 missing 判定抓到
const probeList = declared.concat(['__probe_missing__/index']);
const probeHit = probeList.filter((d) => !existsEntry(d));
const detectorOk = probeHit.some((h) => h.indexOf('__probe_missing__') === 0);
console.log('MP_PAGES_SELFTEST ' + (detectorOk ? 'DETECTOR_OK' : 'DETECTOR_BLIND'));

let fail = 0;
if (missing.length > 0) {
  console.log('MP_CHECK_RED app.json 声明了磁盘不存在的页面 ' + missing.length + ' 条');
  fail = 1;
}
if (undeclared.length > 0) {
  console.log('MP_CHECK_RED 磁盘有页面但未在 app.json 声明 ' + undeclared.length + ' 条');
  fail = 1;
}
if (!detectorOk) {
  console.log('TOOL_BUG 页面对账判定器无检测力，其绿不可信');
  process.exit(9);
}
console.log(fail === 0 ? 'MP_PAGES_GREEN' : 'MP_PAGES_RED');
process.exit(fail);
