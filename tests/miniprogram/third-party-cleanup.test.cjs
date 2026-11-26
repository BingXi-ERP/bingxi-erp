const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const {
  assert,
  MP_ROOT,
  environment,
  installGlobals,
  loadMiniProgram,
} = require('./helpers.cjs');

const mpRequire = Module.createRequire(path.join(MP_ROOT, 'package.json'));

const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  'miniprogram_npm',
  '@babel',
  'report',
  'reports',
]);
const THIRD_PARTY_PATTERNS = [
  ['品牌', /duibu|对布|budadang|jzcang/i],
  ['旧资源前缀', /(?:^|[^a-z0-9])bdd[-_]/i],
];

function candidateFiles(root, directory = root) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...candidateFiles(root, fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files.sort();
}

function scanThirdParty(root) {
  const violations = [];
  for (const fullPath of candidateFiles(root)) {
    const file = path.relative(root, fullPath).split(path.sep).join('/');
    if (THIRD_PARTY_PATTERNS.some(([, pattern]) => pattern.test(file))) {
      violations.push(file + '#filename');
    }
    const source = fs.readFileSync(fullPath).toString('utf8');
    for (const [label, pattern] of THIRD_PARTY_PATTERNS) {
      if (pattern.test(source)) violations.push(file + '#' + label);
    }
  }
  return violations;
}

function isHostExpression(node) {
  if (!node) return false;
  if (node.type === 'Identifier') return /host$/i.test(node.name);
  if (node.type === 'MemberExpression') {
    if (!node.computed && node.property.type === 'Identifier') {
      return /host$/i.test(node.property.name);
    }
    return (
      node.computed &&
      node.property.type === 'StringLiteral' &&
      /host$/i.test(node.property.value)
    );
  }
  return false;
}

function localAssetArgument(node) {
  return (
    node &&
    node.type === 'StringLiteral' &&
    (node.value.startsWith('/assets/') ||
      node.value.startsWith('/assets\\') ||
      /^\/package[A-Z]\/assets\//.test(node.value))
  );
}

function walkAst(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    if (Array.isArray(value)) value.forEach(child => walkAst(child, visit));
    else walkAst(value, visit);
  }
}

function hostJoinedLocalAssets(root, files) {
  const parser = mpRequire('@babel/parser');
  const violations = [];
  for (const fullPath of files.filter(file => file.endsWith('.js'))) {
    const file = path.relative(root, fullPath).split(path.sep).join('/');
    const ast = parser.parse(fs.readFileSync(fullPath, 'utf8'), {
      sourceType: 'unambiguous',
    });
    walkAst(ast, node => {
      let joined = false;
      if (
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'StringLiteral' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'concat'
      ) {
        joined =
          node.arguments.some(isHostExpression) &&
          node.arguments.some(localAssetArgument);
      } else if (
        node.type === 'BinaryExpression' &&
        node.operator === '+' &&
        (isHostExpression(node.left) || isHostExpression(node.right))
      ) {
        joined =
          localAssetArgument(node.left) || localAssetArgument(node.right);
      } else if (node.type === 'TemplateLiteral') {
        joined =
          node.expressions.some(isHostExpression) &&
          node.quasis.some(quasi => quasi.value.cooked.startsWith('/assets/'));
      }
      if (joined) violations.push(file + ':' + node.loc.start.line);
    });
  }
  return violations;
}

function localIconViolations(root, files) {
  const violations = [];
  for (const fullPath of files) {
    if (!/\.(?:js|json|wxml|wxss|wxs)$/i.test(fullPath)) continue;
    const file = path.relative(root, fullPath).split(path.sep).join('/');
    const source = fs.readFileSync(fullPath, 'utf8');
    if (/\/package[A-Z]\/package[A-Z]\//.test(source)) {
      violations.push(file + '#duplicate-subpackage-prefix');
    }
    const references = source.matchAll(/\/(?:package[A-Z]\/)?assets\/icons\/[^"'`\s)]+/gi);
    for (const match of references) {
      const resourcePath = match[0].split(/[?#]/)[0];
      const directoryPrefix = resourcePath.endsWith('/');
      if (directoryPrefix) continue;
      const fullResourcePath = path.resolve(root, resourcePath.slice(1));
      const relativeResource = path.relative(root, fullResourcePath);
      if (
        relativeResource.startsWith('..' + path.sep) ||
        path.isAbsolute(relativeResource)
      ) {
        violations.push(file + '#' + resourcePath + '#outside-package');
        continue;
      }
      let stat;
      try {
        stat = fs.statSync(fullResourcePath);
      } catch {
        violations.push(file + '#' + resourcePath + '#missing');
        continue;
      }
      if (!stat.isFile() || stat.size === 0) {
        violations.push(file + '#' + resourcePath + '#not-nonempty-file');
      }
    }
  }
  return violations;
}

function withFixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-third-party-cleanup-'));
  try {
    return run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('小程序候选发布面不存在第三方品牌词、旧前缀、域名、文件名或资源路径', () => {
  assert.deepEqual(scanThirdParty(MP_ROOT), []);
});

test('本地图标不拼接部署 Host', () => {
  assert.deepEqual(hostJoinedLocalAssets(MP_ROOT, candidateFiles(MP_ROOT)), []);
});

test('本地图标文件引用均存在且非空', () => {
  assert.deepEqual(localIconViolations(MP_ROOT, candidateFiles(MP_ROOT)), []);
});

test('运行期不保留旧站图片与远程协议文档路径', () => {
  const violations = [];
  for (const fullPath of candidateFiles(MP_ROOT)) {
    if (!/\.(?:js|wxml|wxss|wxs|json)$/i.test(fullPath)) continue;
    const file = path.relative(MP_ROOT, fullPath).split(path.sep).join('/');
    const source = fs.readFileSync(fullPath, 'utf8');
    for (const [label, pattern] of [
      ['旧站图片', /\/(?:img\/(?:customer|shareFile|v2|product)|product\/[^"'`\s)]+\.docx)/i],
      ['旧站主机拼接', /\.concat\([^\n]*imgHost[^\n]*["'`]\/(?:img|product)\//i],
    ]) {
      if (pattern.test(source)) violations.push(file + '#' + label);
    }
  }
  assert.deepEqual(violations, []);
});

test('协议入口使用已注册的内置页面，不下载远程文档', () => {
  const app = JSON.parse(fs.readFileSync(path.join(MP_ROOT, 'app.json'), 'utf8'));
  const pages = app.pages || [];
  for (const route of ['pages/register/terms/index', 'pages/register/agreement/agreement']) {
    assert.ok(pages.includes(route), route + ' 未注册');
    for (const extension of ['js', 'json', 'wxml', 'wxss']) {
      const file = path.join(MP_ROOT, route + '.' + extension);
      assert.ok(fs.statSync(file).isFile(), route + '.' + extension + ' 缺失');
      assert.ok(fs.statSync(file).size > 0, route + '.' + extension + ' 为空');
    }
  }
  const entryFiles = [
    'components/agreementBottom/agreementBottom.js',
    'packageC/pages/aboutUS/aboutUS.js',
    'packageB/pages/personal-center/invitation/inviteRegister/index.js',
    'packageA/pages/combo/combo.js',
  ];
  for (const file of entryFiles) {
    const source = fs.readFileSync(path.join(MP_ROOT, file), 'utf8');
    assert.doesNotMatch(source, /downloadFile|openDocument/, file);
    assert.match(source, /wx\.navigateTo\(\{\s*url:/, file);
  }
  const terms = fs.readFileSync(path.join(MP_ROOT, 'pages/register/terms/index.js'), 'utf8');
  assert.match(terms, /用户服务协议/, '内置协议正文缺失');
  assert.match(terms, /账号/, '内置协议账号条款缺失');
});

test('分包图标按分包绝对路径校验，缺失资源不能被主包同名文件掩盖', () => {
  withFixture(root => {
    fs.mkdirSync(path.join(root, 'packageA', 'assets', 'icons'), { recursive: true });
    fs.writeFileSync(path.join(root, 'packageA', 'assets', 'icons', 'ok.png'), 'icon');
    fs.writeFileSync(
      path.join(root, 'packageA', 'page.js'),
      [
        'const ok = "/packageA/assets/icons/ok.png";',
        'const missing = "/packageB/assets/icons/missing.png";',
        'const remote = "".concat(app.config.imgHost, "/packageA/assets/icons/ok.png");',
        'const duplicate = "/packageA/packageA/assets/icons/ok.png";',
      ].join('\n')
    );
    const files = candidateFiles(root);
    assert.deepEqual(hostJoinedLocalAssets(root, files), ['packageA/page.js:3']);
    assert.deepEqual(localIconViolations(root, files), [
      'packageA/page.js#duplicate-subpackage-prefix',
      'packageA/page.js#/packageB/assets/icons/missing.png#missing',
    ]);
  });
});

test('第三方扫描覆盖未跟踪文件并排除指定构建目录', () => {
  withFixture(root => {
    fs.writeFileSync(path.join(root, 'untracked.md'), '对布管家');
    for (const directory of EXCLUDED_DIRECTORIES) {
      const fullDirectory = path.join(root, directory);
      fs.mkdirSync(fullDirectory);
      fs.writeFileSync(path.join(fullDirectory, 'ignored.js'), 'budadang');
    }
    assert.deepEqual(scanThirdParty(root), ['untracked.md#品牌']);
  });
});

test('第三方扫描自证能抓到中文品牌、英文品牌、旧前缀与域名变异', () => {
  const mutations = [
    ['中文品牌.md', '对布管家', ['中文品牌.md#品牌']],
    ['英文品牌.js', 'BUDADANG', ['英文品牌.js#品牌']],
    ['旧域名.js', 'https://mini-dev.duibu.cn/goods', ['旧域名.js#品牌']],
    ['打印域名.png', 'https://mini-dev.budadang.com/goods', ['打印域名.png#品牌']],
    [
      '教学域名.png',
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        Buffer.from('tEXtComment\0https://BDD-ADMIN.JZCANG.CN/resource', 'utf8'),
      ]),
      ['教学域名.png#品牌', '教学域名.png#旧资源前缀'],
    ],
    ['旧前缀.wxss', '.bdd-radio {}', ['旧前缀.wxss#旧资源前缀']],
    ['budadang-help.js', 'module.exports = {};', ['budadang-help.js#filename']],
  ];
  for (const [file, source, expected] of mutations) {
    withFixture(root => {
      fs.writeFileSync(path.join(root, file), source);
      assert.deepEqual(scanThirdParty(root), expected, file);
    });
  }
});

test('本地资源门禁自证能抓到 Host 拼接和缺失或空图标', () => {
  withFixture(root => {
    fs.mkdirSync(path.join(root, 'assets', 'icons'), { recursive: true });
    fs.writeFileSync(path.join(root, 'assets', 'icons', 'empty.png'), '');
    fs.writeFileSync(path.join(root, 'assets', 'icons', 'ok.png'), 'icon');
    fs.writeFileSync(
      path.join(root, 'page.js'),
      [
        'const icon = "".concat(app.config.apiHost, "/assets/icons/ok.png");',
        'const next = app.config["imgHost"] + "/assets/icons/empty.png";',
        'const missing = `${getApp().config.imgHost}/assets/icons/missing.png`;',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(root, 'page.wxss'),
      '.empty { background: url(/assets/icons/empty.png); }',
    );
    const files = candidateFiles(root);
    assert.deepEqual(hostJoinedLocalAssets(root, files), [
      'page.js:1',
      'page.js:2',
      'page.js:3',
    ]);
    assert.deepEqual(localIconViolations(root, files), [
      'page.js#/assets/icons/empty.png#not-nonempty-file',
      'page.js#/assets/icons/missing.png#missing',
      'page.wxss#/assets/icons/empty.png#not-nonempty-file',
    ]);
  });
});

function loadColorPage(service) {
  const source = fs.readFileSync(
    path.join(MP_ROOT, 'packageB/pages/color-card-management/add-colour/add-colour.js'),
    'utf8'
  );
  let definition;
  const sandbox = {
    Page(value) {
      definition = value;
    },
    getApp() {
      return { config: {}, globalData: {} };
    },
    require(request) {
      assert.equal(request, '../../../../libs/services/ServicesCard.js');
      return { servicesCard: service };
    },
    wx: {
      showToast() {},
    },
    console,
    setTimeout,
    clearTimeout,
  };
  require('node:vm').runInNewContext(source, sandbox, { filename: 'add-colour.js' });
  definition.setData = function (patch) {
    Object.assign(this.data, patch);
  };
  return definition;
}

test('色卡服务使用产品色号真实端点与 snake_case 契约', async () => {
  const env = environment();
  const restore = installGlobals(env);
  try {
    const service = loadMiniProgram('packageB/libs/services/ServicesCard.js').servicesCard;
    const request = require(path.join(MP_ROOT, 'packageB/libs/services/request.js')).request;
    const calls = [];
    request.GET = async (url, data) => {
      calls.push({ method: 'GET', url, data });
      return { code: 0, data: [] };
    };
    request.POST = async (url, data) => {
      calls.push({ method: 'POST', url, data });
      return { code: 0, data: {} };
    };
    request.PUT = async (url, data) => {
      calls.push({ method: 'PUT', url, data });
      return { code: 0, data: {} };
    };
    request.DELETE = async (url, data) => {
      calls.push({ method: 'DELETE', url, data });
      return { code: 0, data: {} };
    };

    await service.getColorList({ id: 7, page: 1, size: 1000 });
    await service.saveColor({
      productId: 7,
      itemList: [{ colorVal: 'A01#', colorName: '藏青', flag: 1 }],
    });
    await service.saveColor({
      productId: 7,
      itemList: [{ colorVal: 'A01#', colorName: '深蓝', skuId: 9, flag: 2 }],
    });
    await service.saveColor({
      productId: 7,
      itemList: [{ colorVal: 'A01#', colorName: '深蓝', skuId: 9, flag: 3 }],
    });

    assert.deepEqual(calls, [
      {
        method: 'GET',
        url: 'https://erp.example.com/api/v1/erp/products/7/colors',
        data: { page: 1, page_size: 1000 },
      },
      {
        method: 'POST',
        url: 'https://erp.example.com/api/v1/erp/products/7/colors',
        data: {
          color_no: 'A01#',
          color_name: '藏青',
          pantone_code: null,
          color_type: 'STANDARD',
          dye_formula: null,
          extra_cost: 0,
          color_fastness_grade: null,
        },
      },
      {
        method: 'PUT',
        url: 'https://erp.example.com/api/v1/erp/products/7/colors/9',
        data: { color_name: '深蓝' },
      },
      {
        method: 'DELETE',
        url: 'https://erp.example.com/api/v1/erp/products/7/colors/9',
        data: {},
      },
    ]);
  } finally {
    restore();
  }
});

test('色卡页面读取真实 color_no/color_name 且不提交仪器线协议字段', async () => {
  const calls = [];
  const service = {
    getColorList() {
      calls.push({ method: 'getColorList' });
      return Promise.resolve({
        code: 0,
        data: [{ id: 9, product_id: 7, color_no: 'A01#', color_name: '藏青' }],
      });
    },
    saveColor(payload) {
      calls.push({ method: 'saveColor', payload });
      return Promise.resolve({ code: 0, data: {} });
    },
  };
  const page = loadColorPage(service);
  page.data.goodsId = '7';
  await page.getColorList();
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.colorcolorList)), [
    {
      id: 9,
      colorVal: 'A01#',
      colorName: '藏青',
      engColorName: '',
      priceType: '2',
    },
  ]);

  page.data.colorName = '藏青';
  page.data.colorValue = 'A01#';
  page.data.instrumentColorValue = '#123456';
  page.data.lab = '20,0,0';
  page.data.flag = 1;
  await page.saveColorList();
  const save = calls.find(call => call.method === 'saveColor');
  assert.deepEqual(JSON.parse(JSON.stringify(save.payload)), {
    productId: '7',
    itemList: [{ colorName: '藏青', colorVal: 'A01#', flag: 1 }],
  });
  assert.doesNotMatch(JSON.stringify(save.payload), /instrumentColor|duibuColor|lab/);
});

test('已保存色号不允许静默忽略编码修改', async () => {
  let saveCalls = 0;
  const page = loadColorPage({
    getColorList() {
      return Promise.resolve({ code: 0, data: [] });
    },
    saveColor() {
      saveCalls += 1;
      return Promise.resolve({ code: 0, data: {} });
    },
  });
  page.data.colorcolorList = [{ id: 9, colorVal: 'A01#', colorName: '藏青' }];
  page.colorValInputBlur({
    detail: { value: 'A02#' },
    currentTarget: {
      dataset: { id: '9', index: '0', name: '藏青', dbvalue: '', l: '', a: '', b: '' },
    },
  });
  assert.equal(saveCalls, 0);
});

test('清空色号分页读取全部数据后逐条删除，不遗漏末页', async () => {
  const env = environment();
  const restore = installGlobals(env);
  try {
    const service = loadMiniProgram('packageB/libs/services/ServicesCard.js').servicesCard;
    const request = require(path.join(MP_ROOT, 'packageB/libs/services/request.js')).request;
    const calls = [];
    request.GET = async (url, data) => {
      calls.push({ method: 'GET', url, data });
      const start = (data.page - 1) * 500 + 1;
      const end = Math.min(start + 499, 501);
      const items = [];
      for (let id = start; id <= end; id += 1) items.push({ id });
      return { code: 0, data: items };
    };
    request.DELETE = async (url, data) => {
      calls.push({ method: 'DELETE', url, data });
      return { code: 0, data: {} };
    };
    assert.equal(await service.clearAllColor(7), 501);
    assert.deepEqual(calls.slice(0, 2), [
      {
        method: 'GET',
        url: 'https://erp.example.com/api/v1/erp/products/7/colors',
        data: { page: 1, page_size: 500 },
      },
      {
        method: 'GET',
        url: 'https://erp.example.com/api/v1/erp/products/7/colors',
        data: { page: 2, page_size: 500 },
      },
    ]);
    const deletes = calls.filter(call => call.method === 'DELETE');
    assert.equal(deletes.length, 501);
    assert.equal(deletes[0].url, 'https://erp.example.com/api/v1/erp/products/7/colors/1');
    assert.equal(deletes[500].url, 'https://erp.example.com/api/v1/erp/products/7/colors/501');
  } finally {
    restore();
  }
});

test('清空色号读取失败时拒绝执行且不发起删除', async () => {
  const env = environment();
  const restore = installGlobals(env);
  try {
    const service = loadMiniProgram('packageB/libs/services/ServicesCard.js').servicesCard;
    const request = require(path.join(MP_ROOT, 'packageB/libs/services/request.js')).request;
    let deleteCalls = 0;
    request.GET = async () => ({ code: 500, msg: '读取失败', data: null });
    request.DELETE = async () => {
      deleteCalls += 1;
      return { code: 0, data: {} };
    };
    await assert.rejects(service.clearAllColor(7), /读取产品色号失败/);
    assert.equal(deleteCalls, 0);
  } finally {
    restore();
  }
});

test('清空色号删除失败时显式拒绝，不返回虚假成功条数', async () => {
  const env = environment();
  const restore = installGlobals(env);
  try {
    const service = loadMiniProgram('packageB/libs/services/ServicesCard.js').servicesCard;
    const request = require(path.join(MP_ROOT, 'packageB/libs/services/request.js')).request;
    request.GET = async () => ({ code: 0, data: [{ id: 9 }] });
    request.DELETE = async () => ({ code: 500, msg: '删除失败', data: null });
    await assert.rejects(service.clearAllColor(7), /删除产品色号失败/);
  } finally {
    restore();
  }
});
