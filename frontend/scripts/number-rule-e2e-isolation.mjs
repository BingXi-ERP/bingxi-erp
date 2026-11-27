import ts from 'typescript';

const LOCK_FUNCTION = 'withNumberRuleConfigLock';
const LOCK_WRAPPERS = new Set([LOCK_FUNCTION, 'numberRuleConfigTest']);
const API_WRITERS = new Set(['apiCall', 'apiCallRaw', 'seedPost']);

function parse(source, filePath) {
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function calleeName(call) {
  if (ts.isIdentifier(call.expression)) return call.expression.text;
  if (ts.isPropertyAccessExpression(call.expression)) return call.expression.name.text;
  return undefined;
}

function literalText(node, constants = new Map()) {
  if (!node) return undefined;
  if (ts.isIdentifier(node)) return constants.get(node.text);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    let text = node.head.text;
    for (const span of node.templateSpans) {
      const value = literalText(span.expression, constants);
      text += `${value ?? '<expression>'}${span.literal.text}`;
    }
    return text;
  }
  return undefined;
}

function stringConstants(sourceFile) {
  const constants = new Map();
  const visit = node => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))
    ) {
      constants.set(node.name.text, node.initializer.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return constants;
}

function insideCallNamed(node, names) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (!ts.isCallExpression(parent)) continue;
    const name = calleeName(parent);
    if (name && names.has(name)) return true;
  }
  return false;
}

function insideLock(node) {
  return insideCallNamed(node, LOCK_WRAPPERS);
}

function expectedFailure(node) {
  return insideCallNamed(node, new Set(['apiCallExpectFail']));
}

function apiWrite(call, constants) {
  const name = calleeName(call);
  if (!API_WRITERS.has(name)) return undefined;
  const method = name === 'seedPost' ? 'POST' : literalText(call.arguments[1], constants);
  const pathNode = call.arguments[name === 'seedPost' ? 0 : 2];
  const path = literalText(pathNode, constants);
  if (method?.toUpperCase() !== 'POST' && method?.toUpperCase() !== 'PUT') return undefined;
  return { method: method.toUpperCase(), path: path ?? pathNode?.getText() ?? '' };
}

function numberRuleSaveClick(call, constants) {
  if (calleeName(call) !== 'click' || !ts.isPropertyAccessExpression(call.expression)) return false;
  const receiver = call.expression.expression;
  return (
    ts.isCallExpression(receiver) &&
    calleeName(receiver) === 'getByTestId' &&
    literalText(receiver.arguments[0], constants) === 'number-rule-save'
  );
}

function quotationConvertClick(call, filePath, source) {
  if (calleeName(call) !== 'click' || !ts.isPropertyAccessExpression(call.expression)) return false;
  if (!filePath.includes('/quotations/') && !source.includes('converted_sales_order_id'))
    return false;
  const receiver = call.expression.expression;
  return ts.isIdentifier(receiver) && /convert/i.test(receiver.text);
}

function operationFor(call, filePath, source, constants) {
  if (numberRuleSaveClick(call, constants)) return 'number-rule-save';
  if (quotationConvertClick(call, filePath, source)) return call.getText();
  const write = apiWrite(call, constants);
  if (!write) return undefined;
  if (write.path.includes('/system/number-rules')) return `${write.method} ${write.path}`;
  if (write.path.includes('/sales/orders')) return `${write.method} ${write.path}`;
  if (
    write.method === 'POST' &&
    write.path.includes('/convert') &&
    (filePath.includes('/quotations/') || source.includes('converted_sales_order_id'))
  ) {
    return `${write.method} ${write.path}`;
  }
  return undefined;
}

function location(sourceFile, node) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${sourceFile.fileName}:${position.line + 1}:${position.character + 1}`;
}

function audit(source, filePath) {
  const sourceFile = parse(source, filePath);
  const constants = stringConstants(sourceFile);
  const errors = [];
  const visit = node => {
    if (ts.isCallExpression(node)) {
      const operation = operationFor(node, filePath, source, constants);
      if (operation && !expectedFailure(node) && !insideLock(node)) {
        errors.push(
          `${location(sourceFile, node)} ${operation} 必须位于 ${LOCK_FUNCTION} 内，避免与编码规则全局配置变更并发`
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return errors;
}

export function auditNumberRuleSpecSource(source, filePath = '<memory>.spec.ts') {
  return audit(source, filePath);
}

export function numberRuleSpecMutatesConfig(source, filePath = '<memory>.spec.ts') {
  const sourceFile = parse(source, filePath);
  const constants = stringConstants(sourceFile);
  let found = false;
  const visit = node => {
    if (found) return;
    if (ts.isCallExpression(node) && !expectedFailure(node)) {
      const operation = operationFor(node, filePath, source, constants);
      if (
        operation &&
        (operation.includes('/system/number-rules') || operation === 'number-rule-save')
      ) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

export function auditNumberRuleIsolationGroup(group) {
  const files = group.files ?? [];
  const mutators = files.filter(file => numberRuleSpecMutatesConfig(file.source, file.path));
  if (mutators.length === 0) return [];
  if (group.total !== 1) {
    return [
      `编码规则全局配置写者 ${mutators.map(file => file.path).join(', ')} 位于 --shard=1/${group.total} hash 分片组，无法在静态门禁证明其与订单创建用例不并发；必须使用 total=1 的独立分片组`,
    ];
  }
  const errors = [];
  for (const file of [...files, ...(group.sharedFiles ?? [])]) {
    for (const error of auditNumberRuleSpecSource(file.source, file.path)) {
      errors.push(`${group.targets.join(' ')}: ${error}`);
    }
  }
  return errors;
}
