import { createRequire } from "node:module";
import { basename, dirname, extname, resolve } from "node:path";

const require = createRequire(import.meta.url);
let ts = null;

function loadTypeScript() {
  if (!ts) {
    try {
      ts = require("../../miniapp/node_modules/typescript");
    } catch (error) {
      throw new Error(
        `TOOL_BUG: TypeScript Compiler API unavailable; run npm ci in miniapp first: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return ts;
}

const HTTP_METHODS = new Set(["get", "post", "put", "delete"]);
const LEGACY_PAGINATION_KEYS = [
  "content",
  "pageNo",
  "totalPage",
  "hasNextPage",
  "isLastPage",
];
const MODULE_SUFFIXES = ["", ".ts", ".js", ".vue", ".mts", ".cts", "/index.ts"];

function sourceForFile(file, source) {
  if (extname(file).toLowerCase() !== ".vue") return source;
  const blocks = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.toLowerCase().indexOf("<script", cursor);
    if (start === -1) break;
    const openEnd = source.indexOf(">", start);
    if (openEnd === -1) break;
    const close = source.toLowerCase().indexOf("</script>", openEnd + 1);
    if (close === -1) break;
    blocks.push(source.slice(openEnd + 1, close));
    cursor = close + "</script>".length;
  }
  return blocks.join("\n");
}

function parseSource(file, source) {
  loadTypeScript();
  const script = sourceForFile(file, source);
  const kind =
    extname(file).toLowerCase() === ".js" ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  return ts.createSourceFile(file, script, ts.ScriptTarget.Latest, true, kind);
}

function propertyName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (
    ts.isElementAccessExpression(node) &&
    node.argumentExpression &&
    (ts.isStringLiteral(node.argumentExpression) ||
      ts.isNoSubstitutionTemplateLiteral(node.argumentExpression))
  ) {
    return node.argumentExpression.text;
  }
  return null;
}

function unwrapParenthesizedExpression(node) {
  while (ts.isParenthesizedExpression(node)) node = node.expression;
  return node;
}

function isDataObject(node) {
  if (ts.isParenthesizedExpression(node)) return isDataObject(node.expression);
  if (ts.isIdentifier(node)) return node.text === "data";
  return propertyName(node) === "data";
}

function bindingPropertyName(node) {
  if (
    ts.isIdentifier(node) ||
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node)
  ) {
    return node.text;
  }
  if (ts.isComputedPropertyName(node))
    return bindingPropertyName(node.expression);
  return null;
}

function bindingNames(name, out = []) {
  if (ts.isIdentifier(name)) {
    out.push(name.text);
  } else if (
    ts.isObjectBindingPattern(name) ||
    ts.isArrayBindingPattern(name)
  ) {
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) bindingNames(element.name, out);
    }
  }
  return out;
}

function hasModifier(node, kind) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === kind));
}

function isTypeOnly(node) {
  return Boolean(
    node.importClause?.isTypeOnly ||
    node.importClause?.namedBindings?.isTypeOnly,
  );
}

function moduleCandidates(specifier, fromFile) {
  if (!specifier.startsWith(".")) return [];
  const base = resolve(dirname(resolve(fromFile)), specifier);
  const candidates = MODULE_SUFFIXES.map((suffix) => `${base}${suffix}`);
  if (/\.mjs$/.test(base)) candidates.push(base.replace(/\.mjs$/, ".mts"));
  if (/\.cjs$/.test(base)) candidates.push(base.replace(/\.cjs$/, ".cts"));
  if (/\.js$/.test(base)) candidates.push(base.replace(/\.js$/, ".ts"));
  return candidates;
}

function buildProject(entries) {
  const records = new Map();
  const fileIndex = new Map();

  for (const entry of entries) {
    const key = resolve(entry.file);
    if (records.has(key))
      throw new Error(`TOOL_BUG: duplicate source entry: ${entry.file}`);
    const sourceFile = parseSource(entry.file, entry.source);
    const record = {
      entry,
      file: entry.file,
      key,
      sourceFile,
      moduleScope: null,
      exports: new Map(),
      duplicateExports: new Set(),
      stars: [],
      nodeScopes: new WeakMap(),
      bindings: [],
    };
    records.set(key, record);
    fileIndex.set(key, record);
  }

  function nearestVarScope(scope) {
    let current = scope;
    while (current.parent && !current.functionScope) current = current.parent;
    return current;
  }

  function declare(record, scope, name, kind, node, initializer = null) {
    const target = kind === "var" ? nearestVarScope(scope) : scope;
    const existing = target.bindings.get(name);
    if (existing) {
      existing.redeclared = true;
      if (existing.initializer !== initializer) existing.opaque = true;
      return existing;
    }
    const binding = {
      name,
      kind,
      node,
      initializer,
      scope: target,
      reassigned: false,
      redeclared: false,
      opaque: false,
      id: record.bindings.length,
      record,
    };
    target.bindings.set(name, binding);
    record.bindings.push(binding);
    return binding;
  }

  function addExport(record, name, spec) {
    if (record.exports.has(name)) {
      record.duplicateExports.add(name);
      return;
    }
    record.exports.set(name, spec);
  }

  function visit(record, node, scope) {
    record.nodeScopes.set(node, scope);
    if (hasModifier(node, ts.SyntaxKind.DeclareKeyword)) return;

    if (ts.isImportDeclaration(node)) {
      if (isTypeOnly(node) || !ts.isStringLiteral(node.moduleSpecifier)) return;
      const clause = node.importClause;
      if (!clause || clause.isTypeOnly) return;
      if (clause.name) {
        declare(record, scope, clause.name.text, "import", clause.name);
        const binding = scope.bindings.get(clause.name.text);
        binding.module = node.moduleSpecifier.text;
        binding.importedName = "default";
      }
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) {
        declare(record, scope, bindings.name.text, "import", bindings.name);
        scope.bindings.get(bindings.name.text).opaque = true;
      } else if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          if (element.isTypeOnly) continue;
          const local = element.name.text;
          const imported = (element.propertyName ?? element.name).text;
          declare(record, scope, local, "import", element.name);
          const binding = scope.bindings.get(local);
          binding.module = node.moduleSpecifier.text;
          binding.importedName = imported;
        }
      }
      return;
    }

    if (ts.isVariableStatement(node)) {
      const flags = node.declarationList.flags;
      const kind =
        (flags & ts.NodeFlags.Const) !== 0
          ? "const"
          : (flags & ts.NodeFlags.Let) !== 0
            ? "let"
            : "var";
      for (const declaration of node.declarationList.declarations) {
        const names = bindingNames(declaration.name);
        for (const name of names) {
          const binding = declare(
            record,
            scope,
            name,
            kind,
            declaration.name,
            ts.isIdentifier(declaration.name)
              ? (declaration.initializer ?? null)
              : null,
          );
          if (!ts.isIdentifier(declaration.name)) binding.opaque = true;
          if (
            scope === record.moduleScope &&
            hasModifier(node, ts.SyntaxKind.ExportKeyword)
          ) {
            addExport(record, name, { kind: "binding", binding });
          }
        }
        if (declaration.initializer)
          visit(record, declaration.initializer, scope);
      }
      return;
    }

    if (ts.isFunctionDeclaration(node)) {
      if (node.name) {
        const binding = declare(
          record,
          scope,
          node.name.text,
          "function",
          node.name,
        );
        if (
          scope === record.moduleScope &&
          hasModifier(node, ts.SyntaxKind.ExportKeyword)
        ) {
          addExport(
            record,
            hasModifier(node, ts.SyntaxKind.DefaultKeyword)
              ? "default"
              : node.name.text,
            hasModifier(node, ts.SyntaxKind.DefaultKeyword)
              ? { kind: "opaque", name: "default" }
              : { kind: "binding", binding },
          );
        }
      } else if (
        scope === record.moduleScope &&
        hasModifier(node, ts.SyntaxKind.ExportKeyword) &&
        hasModifier(node, ts.SyntaxKind.DefaultKeyword)
      ) {
        addExport(record, "default", { kind: "opaque", name: "default" });
      }
      const functionScope = {
        parent: scope,
        bindings: new Map(),
        functionScope: true,
      };
      for (const parameter of node.parameters) {
        for (const name of bindingNames(parameter.name))
          declare(record, functionScope, name, "param", parameter.name);
        if (parameter.initializer)
          visit(record, parameter.initializer, functionScope);
      }
      if (node.body) visit(record, node.body, functionScope);
      return;
    }

    if (
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node)
    ) {
      const functionScope = {
        parent: scope,
        bindings: new Map(),
        functionScope: true,
      };
      if (ts.isFunctionExpression(node) && node.name) {
        const selfBinding = declare(
          record,
          functionScope,
          node.name.text,
          "function",
          node.name,
        );
        selfBinding.opaque = true;
      }
      for (const parameter of node.parameters) {
        for (const name of bindingNames(parameter.name))
          declare(record, functionScope, name, "param", parameter.name);
        if (parameter.initializer)
          visit(record, parameter.initializer, functionScope);
      }
      if (node.body) visit(record, node.body, functionScope);
      return;
    }

    if (ts.isEnumDeclaration(node)) {
      const binding = declare(record, scope, node.name.text, "enum", node.name);
      if (
        scope === record.moduleScope &&
        hasModifier(node, ts.SyntaxKind.ExportKeyword)
      )
        addExport(record, node.name.text, { kind: "binding", binding });
      for (const member of node.members) visit(record, member, scope);
      return;
    }

    if (ts.isModuleDeclaration(node)) {
      const binding = ts.isIdentifier(node.name)
        ? declare(record, scope, node.name.text, "namespace", node.name)
        : null;
      if (
        binding &&
        scope === record.moduleScope &&
        hasModifier(node, ts.SyntaxKind.ExportKeyword)
      )
        addExport(record, node.name.text, { kind: "binding", binding });
      const moduleScope = {
        parent: scope,
        bindings: new Map(),
        functionScope: false,
      };
      if (node.body) visit(record, node.body, moduleScope);
      return;
    }

    if (ts.isClassDeclaration(node)) {
      if (node.name) {
        const binding = declare(
          record,
          scope,
          node.name.text,
          "class",
          node.name,
        );
        if (
          scope === record.moduleScope &&
          hasModifier(node, ts.SyntaxKind.ExportKeyword)
        ) {
          addExport(
            record,
            hasModifier(node, ts.SyntaxKind.DefaultKeyword)
              ? "default"
              : node.name.text,
            hasModifier(node, ts.SyntaxKind.DefaultKeyword)
              ? { kind: "opaque", name: "default" }
              : { kind: "binding", binding },
          );
        }
      } else if (
        scope === record.moduleScope &&
        hasModifier(node, ts.SyntaxKind.ExportKeyword) &&
        hasModifier(node, ts.SyntaxKind.DefaultKeyword)
      ) {
        addExport(record, "default", { kind: "opaque", name: "default" });
      }
      const classScope = {
        parent: scope,
        bindings: new Map(),
        functionScope: false,
      };
      for (const member of node.members) visit(record, member, classScope);
      return;
    }

    if (ts.isClassExpression(node)) {
      const classScope = {
        parent: scope,
        bindings: new Map(),
        functionScope: false,
      };
      if (node.name) {
        const selfBinding = declare(
          record,
          classScope,
          node.name.text,
          "class",
          node.name,
        );
        selfBinding.opaque = true;
      }
      for (const member of node.members) visit(record, member, classScope);
      return;
    }

    if (ts.isBlock(node) || ts.isModuleBlock(node)) {
      const blockScope = {
        parent: scope,
        bindings: new Map(),
        functionScope: false,
      };
      for (const statement of node.statements)
        visit(record, statement, blockScope);
      return;
    }

    if (ts.isCaseBlock(node)) {
      const caseScope = {
        parent: scope,
        bindings: new Map(),
        functionScope: false,
      };
      for (const clause of node.clauses) visit(record, clause, caseScope);
      return;
    }

    if (ts.isCatchClause(node)) {
      const catchScope = {
        parent: scope,
        bindings: new Map(),
        functionScope: false,
      };
      if (node.variableDeclaration) {
        for (const name of bindingNames(node.variableDeclaration.name)) {
          declare(
            record,
            catchScope,
            name,
            "catch",
            node.variableDeclaration.name,
          );
        }
      }
      visit(record, node.block, catchScope);
      return;
    }

    if (
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node)
    ) {
      const loopScope = {
        parent: scope,
        bindings: new Map(),
        functionScope: false,
      };
      ts.forEachChild(node, (child) => visit(record, child, loopScope));
      return;
    }

    if (ts.isExportDeclaration(node)) {
      if (scope !== record.moduleScope || node.isTypeOnly) return;
      if (!node.exportClause) {
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          record.stars.push(node.moduleSpecifier.text);
        }
        return;
      }
      if (ts.isNamespaceExport(node.exportClause)) {
        addExport(record, node.exportClause.name.text, {
          kind: "opaque",
          name: node.exportClause.name.text,
        });
        return;
      }
      if (!ts.isNamedExports(node.exportClause)) return;
      for (const element of node.exportClause.elements) {
        if (element.isTypeOnly) continue;
        const exported = element.name.text;
        const imported = (element.propertyName ?? element.name).text;
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          addExport(record, exported, {
            kind: "reexport",
            module: node.moduleSpecifier.text,
            importedName: imported,
          });
        } else {
          addExport(record, exported, { kind: "local", name: imported });
        }
      }
      return;
    }

    if (ts.isExportAssignment(node)) {
      if (scope !== record.moduleScope) return;
      addExport(record, "default", { kind: "opaque", name: "default" });
      visit(record, node.expression, scope);
      return;
    }

    if (
      ts.isTypeAliasDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isImportEqualsDeclaration(node)
    )
      return;

    ts.forEachChild(node, (child) => visit(record, child, scope));
  }

  function lookupLocal(record, scope, name) {
    let current = scope;
    while (current) {
      if (current.bindings.has(name)) return current.bindings.get(name);
      current = current.parent;
    }
    return null;
  }

  for (const record of records.values()) {
    record.moduleScope = {
      parent: null,
      bindings: new Map(),
      functionScope: true,
    };
    visit(record, record.sourceFile, record.moduleScope);
  }

  for (const record of records.values()) {
    for (const [name, spec] of record.exports) {
      if (spec.kind !== "local") continue;
      const binding = lookupLocal(record, record.moduleScope, spec.name);
      record.exports.set(
        name,
        binding
          ? { kind: "binding", binding }
          : { kind: "opaque", name: spec.name },
      );
    }
  }

  function lookupBinding(record, identifier) {
    const scope = record.nodeScopes.get(identifier) ?? record.moduleScope;
    return lookupLocal(record, scope, identifier.text);
  }

  function markAssigned(record, node) {
    if (ts.isIdentifier(node)) {
      const binding = lookupBinding(record, node);
      if (binding) binding.reassigned = true;
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      markAssigned(record, node.left);
    } else if (ts.isParenthesizedExpression(node)) {
      markAssigned(record, node.expression);
    } else if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) markAssigned(record, element);
    } else if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (ts.isShorthandPropertyAssignment(property))
          markAssigned(record, property.name);
        if (ts.isPropertyAssignment(property))
          markAssigned(record, property.initializer);
      }
    }
  }

  for (const record of records.values()) {
    const scanAssignments = (node) => {
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      )
        markAssigned(record, node.left);
      if (
        (ts.isPrefixUnaryExpression(node) ||
          ts.isPostfixUnaryExpression(node)) &&
        (node.operator === ts.SyntaxKind.PlusPlusToken ||
          node.operator === ts.SyntaxKind.MinusMinusToken)
      )
        markAssigned(record, node.operand);
      if (ts.isForOfStatement(node) || ts.isForInStatement(node))
        markAssigned(record, node.initializer);
      ts.forEachChild(node, scanAssignments);
    };
    scanAssignments(record.sourceFile);
  }

  function resolveModule(record, specifier) {
    for (const candidate of moduleCandidates(specifier, record.key)) {
      const target = fileIndex.get(candidate);
      if (target) return target;
    }
    return null;
  }

  const globalExports = new Map();
  let hasStarExport = false;
  for (const record of records.values()) {
    if (record.stars.length > 0) hasStarExport = true;
    for (const [name, spec] of record.exports) {
      if (!globalExports.has(name)) globalExports.set(name, []);
      globalExports.get(name).push({ record, spec });
    }
  }

  const resolvingBindings = new Set();

  function resolveBinding(binding) {
    if (!binding || binding.opaque || binding.reassigned || binding.redeclared)
      return null;
    if (binding.kind === "import") {
      return resolveModuleExport(
        binding.record,
        binding.module,
        binding.importedName,
      );
    }
    if (!["const", "let", "var"].includes(binding.kind) || !binding.initializer)
      return null;
    if (resolvingBindings.has(binding)) return null;
    resolvingBindings.add(binding);
    const value = resolveExpression(binding.record, binding.initializer);
    resolvingBindings.delete(binding);
    return value;
  }

  function resolveExpression(record, expression) {
    if (
      ts.isStringLiteral(expression) ||
      ts.isNoSubstitutionTemplateLiteral(expression)
    ) {
      return expression.text;
    }
    if (ts.isIdentifier(expression))
      return resolveIdentifier(record, expression);
    if (ts.isTemplateExpression(expression)) {
      let value = expression.head.text;
      for (const span of expression.templateSpans) {
        if (!ts.isIdentifier(span.expression)) return null;
        const part = resolveIdentifier(record, span.expression);
        if (part === null) return null;
        value += part + span.literal.text;
      }
      return value;
    }
    return null;
  }

  function resolveIdentifier(record, identifier) {
    const binding = lookupBinding(record, identifier);
    if (binding) return resolveBinding(binding);
    if (hasStarExport) return null;
    const candidates = globalExports.get(identifier.text);
    if (!candidates || candidates.length !== 1) return null;
    return resolveExport(candidates[0].record, identifier.text);
  }

  function resolveExport(record, name, seen = new Set()) {
    const key = `${record.key}\u0000${name}`;
    if (seen.has(key)) return null;
    seen.add(key);
    if (record.duplicateExports.has(name)) return null;
    const spec = record.exports.get(name);
    if (!spec) {
      const values = [];
      for (const specifier of record.stars) {
        const target = resolveModule(record, specifier);
        const value = target ? resolveExport(target, name, seen) : null;
        if (value === null) return null;
        values.push(value);
      }
      return values.length === 1 ? values[0] : null;
    }
    if (spec.kind === "binding") return resolveBinding(spec.binding);
    if (spec.kind === "reexport") {
      const target = resolveModule(record, spec.module);
      return target ? resolveExport(target, spec.importedName, seen) : null;
    }
    return null;
  }

  function resolveModuleExport(record, specifier, name) {
    const target = resolveModule(record, specifier);
    return target ? resolveExport(target, name) : null;
  }

  return {
    records,
    resolveBinding,
    resolveExpression,
    resolveIdentifier,
    resolveExport,
    resolveModule,
  };
}

function analyzeRecord(record, project) {
  const failures = [];
  const calls = [];
  const paginationHits = new Set();
  const endpointHits = new Set();

  const addCall = (method, argument) => {
    if (!argument) {
      calls.push({
        file: record.file,
        method,
        expr: "<no argument>",
        unresolved: true,
      });
      return;
    }
    let value = null;
    if (
      ts.isStringLiteral(argument) ||
      ts.isNoSubstitutionTemplateLiteral(argument)
    ) {
      value = argument.text;
    } else if (ts.isIdentifier(argument)) {
      value = project.resolveIdentifier(record, argument);
    }
    if (value === null) {
      const text = argument.getText(record.sourceFile);
      calls.push({
        file: record.file,
        method,
        expr: text.length > 60 ? `${text.slice(0, 60)}…` : text,
        unresolved: true,
      });
    } else {
      calls.push({
        file: record.file,
        method,
        path: value,
        note: ts.isIdentifier(argument) ? argument.text : null,
      });
    }
  };

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      const receiver = node.expression.expression;
      const method = node.expression.name.text;
      if (
        ts.isIdentifier(receiver) &&
        receiver.text === "apiClient" &&
        HTTP_METHODS.has(method)
      ) {
        addCall(method.toUpperCase(), node.arguments[0]);
      }
    }

    if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      const key = propertyName(node);
      if (
        key &&
        LEGACY_PAGINATION_KEYS.includes(key) &&
        isDataObject(node.expression)
      ) {
        paginationHits.add(key);
      }
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer
    ) {
      if (isDataObject(node.initializer)) {
        for (const element of node.name.elements) {
          if (!ts.isBindingElement(element)) continue;
          const key = bindingPropertyName(element.propertyName ?? element.name);
          if (key && LEGACY_PAGINATION_KEYS.includes(key))
            paginationHits.add(key);
        }
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isObjectLiteralExpression(unwrapParenthesizedExpression(node.left)) &&
      isDataObject(node.right)
    ) {
      for (const property of unwrapParenthesizedExpression(node.left)
        .properties) {
        if (
          ts.isShorthandPropertyAssignment(property) &&
          LEGACY_PAGINATION_KEYS.includes(property.name.text)
        ) {
          paginationHits.add(property.name.text);
        }
        if (ts.isPropertyAssignment(property)) {
          const key = bindingPropertyName(property.name);
          if (key && LEGACY_PAGINATION_KEYS.includes(key))
            paginationHits.add(key);
        }
      }
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      for (const token of ["/app-api/", "/oauth-api/"]) {
        if (node.text.includes(token)) endpointHits.add(token);
      }
    }
    if (ts.isTemplateExpression(node)) {
      for (const token of ["/app-api/", "/oauth-api/"]) {
        if (
          node.head.text.includes(token) ||
          node.templateSpans.some((span) => span.literal.text.includes(token))
        )
          endpointHits.add(token);
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(record.sourceFile);

  for (const token of ["/app-api/", "/oauth-api/"]) {
    if (endpointHits.has(token)) {
      failures.push({
        type: "FORBIDDEN",
        message: `legacy-endpoint:${token}`,
        file: record.file,
      });
    }
  }
  for (const key of LEGACY_PAGINATION_KEYS) {
    if (paginationHits.has(key)) {
      failures.push({
        type: "FORBIDDEN",
        message: `legacy-pagination:data.${key}`,
        file: record.file,
      });
    }
  }

  if (record.sourceFile.parseDiagnostics.length > 0) {
    failures.push({
      type: "UNRESOLVED",
      message: `PARSE ${record.sourceFile.parseDiagnostics.length} syntax diagnostic(s)`,
      file: record.file,
    });
  }

  for (const call of calls) {
    if (call.unresolved) {
      failures.push({
        type: "UNRESOLVED",
        message: `${call.method} ${call.expr} (call path not statically resolvable)`,
        file: record.file,
      });
    }
  }

  return { calls, failures };
}

function analyzeContractRegistry(record, project) {
  const failures = [];
  const fail = (message) =>
    failures.push({ type: "UNRESOLVED", message, file: record.file });
  for (const name of record.duplicateExports)
    fail(`CONSTANT ${name} (duplicate export binding)`);
  for (const [name, spec] of record.exports) {
    const value =
      spec.kind === "binding"
        ? project.resolveBinding(spec.binding)
        : spec.kind === "reexport"
          ? project.resolveExport(record, name)
          : null;
    if (value === null) {
      fail(
        `CONSTANT ${name} (export initializer outside the parseable constant subset)`,
      );
    }
  }
  for (const specifier of record.stars) {
    fail(
      `CONSTANT EXPORT STAR ${specifier} (star exports cannot be registered statically)`,
    );
  }
  return failures;
}

export function analyzeSourceEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("TOOL_BUG: no source entries");
  }
  const project = buildProject(entries);
  const calls = [];
  const failures = [];
  const contracts = [];
  for (const record of project.records.values()) {
    const result = analyzeRecord(record, project);
    calls.push(...result.calls);
    failures.push(...result.failures);
    if (basename(record.file) === "contracts.ts") {
      failures.push(...analyzeContractRegistry(record, project));
      for (const [name, spec] of record.exports) {
        const value =
          spec.kind === "binding"
            ? project.resolveBinding(spec.binding)
            : spec.kind === "reexport"
              ? project.resolveExport(record, name)
              : null;
        contracts.push({ file: record.file, name, value });
      }
    }
  }
  return { calls, failures, contracts };
}

export function findForbiddenLegacyTokensInSource(source) {
  if (typeof source !== "string")
    throw new Error("TOOL_BUG: source must be a string");
  const project = buildProject([{ file: "contract-input.ts", source }]);
  const record = project.records.get(resolve("contract-input.ts"));
  const result = analyzeRecord(record, project);
  return result.failures
    .filter((failure) => failure.type === "FORBIDDEN")
    .map((failure) => failure.message);
}
