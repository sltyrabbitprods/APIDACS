import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import {
  hashNormalizedContent,
  safeSpawn,
  stableId,
  toCanonicalRelativePath,
} from './platform.js';
import {
  DependencyEdge,
  FeatureRecord,
  FeatureStatus,
  FunctionRecord,
  RawDiagnostic,
  RelationshipConfidence,
  Severity,
  SourceFileRecord,
  TypeRecord,
  VariableLifecycleStage,
  VariableRecord,
} from './types.js';

const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.apidacs',
  'dist',
  'dist-cli',
  'dist-executables',
  'build',
  'coverage',
  '.next',
  '.vite',
  '__pycache__',
  '.venv',
  'venv',
]);

const CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.json',
  '.html',
  '.css',
]);

export interface TestRecord {
  id: string;
  name: string;
  filePath: string;
  line: number;
  category: string;
  isSkipped: boolean;
  isEmpty: boolean;
  usesMocks: boolean;
  assertionCount: number;
  coveredSymbols: string[];
  lastVerifiedAt: string;
}

export interface AnalysisOutput {
  files: SourceFileRecord[];
  variables: VariableRecord[];
  functions: FunctionRecord[];
  types: TypeRecord[];
  features: FeatureRecord[];
  edges: DependencyEdge[];
  tests: TestRecord[];
  diagnostics: RawDiagnostic[];
  cycles: string[][];
}

interface AstNode {
  type: string;
  loc?: { start: { line: number; column: number }; end: { line: number; column: number } };
  [key: string]: unknown;
}

function walkAst(node: unknown, visitor: (n: AstNode, parent: AstNode | null) => void, parent: AstNode | null = null): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) {
      walkAst(item, visitor, parent);
    }
    return;
  }
  const astNode = node as AstNode;
  if (typeof astNode.type === 'string') {
    visitor(astNode, parent);
    for (const key of Object.keys(astNode)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra' || key === 'leadingComments' || key === 'trailingComments') {
        continue;
      }
      walkAst(astNode[key], visitor, astNode);
    }
  }
}

function getCalleeName(callee: AstNode | null | undefined): string | null {
  if (!callee) return null;
  if (callee.type === 'Identifier' && typeof callee.name === 'string') {
    return callee.name;
  }
  if (callee.type === 'MemberExpression') {
    const obj = getCalleeName(callee.object as AstNode);
    const prop =
      callee.property && (callee.property as AstNode).type === 'Identifier'
        ? ((callee.property as AstNode).name as string)
        : null;
    if (obj && prop) return `${obj}.${prop}`;
    return prop || obj;
  }
  return null;
}

function isLoggingCall(name: string | null): boolean {
  if (!name) return false;
  return /^(console\.(log|info|warn|debug|error|trace)|logger\.(log|info|warn|debug|error)|log\.(info|debug|warn|error))$/i.test(
    name,
  );
}

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.ts':
    case '.tsx':
      return 'typescript';
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    case '.py':
      return 'python';
    case '.json':
      return 'json';
    case '.html':
      return 'html';
    case '.css':
      return 'css';
    default:
      return 'text';
  }
}

function loadGitIgnorePatterns(projectRoot: string): string[] {
  const giPath = path.join(projectRoot, '.gitignore');
  if (!fs.existsSync(giPath)) return [];
  try {
    return fs
      .readFileSync(giPath, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  } catch {
    return [];
  }
}

function isIgnoredByPattern(relPath: string, patterns: string[]): boolean {
  const parts = relPath.split('/');
  for (const part of parts) {
    if (DEFAULT_IGNORE_DIRS.has(part)) return true;
  }
  for (const pat of patterns) {
    const clean = pat.replace(/\/$/, '').replace(/^\.\//, '');
    if (!clean) continue;
    if (relPath === clean || relPath.startsWith(`${clean}/`) || parts.includes(clean)) {
      return true;
    }
    if (clean.startsWith('*.') && relPath.endsWith(clean.slice(1))) {
      return true;
    }
  }
  return false;
}

export function discoverSourceFiles(projectRoot: string): string[] {
  const absRoot = path.resolve(projectRoot);
  const gitIgnore = loadGitIgnorePatterns(absRoot);
  const collected: string[] = [];

  function recurse(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const rel = toCanonicalRelativePath(absRoot, fullPath);
      if (isIgnoredByPattern(rel, gitIgnore)) continue;
      if (entry.isDirectory()) {
        recurse(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (CODE_EXTENSIONS.has(ext)) {
          collected.push(fullPath);
        }
      }
    }
  }

  recurse(absRoot);
  return collected;
}

function resolveImportTarget(
  projectRoot: string,
  fromRelPath: string,
  specifier: string,
  allRelPaths: Set<string>,
): string | null {
  if (!specifier.startsWith('.')) return null;
  const fromDir = path.posix.dirname(fromRelPath);
  const joined = path.posix.normalize(path.posix.join(fromDir, specifier));
  const candidates = [
    joined,
    `${joined}.ts`,
    `${joined}.tsx`,
    `${joined}.js`,
    `${joined}.jsx`,
    `${joined}.mjs`,
    `${joined}.cjs`,
    joined.replace(/\.js$/, '.ts'),
    joined.replace(/\.js$/, '.tsx'),
    `${joined}/index.ts`,
    `${joined}/index.tsx`,
    `${joined}/index.js`,
  ];
  for (const cand of candidates) {
    if (allRelPaths.has(cand)) return cand;
  }
  return null;
}

function findCycles(adjacency: Map<string, Set<string>>): string[][] {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const pathList: string[] = [];
  const cycles: string[][] = [];
  const seenSignatures = new Set<string>();

  function dfs(node: string): void {
    visited.add(node);
    stack.add(node);
    pathList.push(node);

    const neighbors = adjacency.get(node);
    if (neighbors) {
      for (const next of neighbors) {
        if (!visited.has(next)) {
          dfs(next);
        } else if (stack.has(next)) {
          const idx = pathList.indexOf(next);
          if (idx !== -1) {
            const cycle = [...pathList.slice(idx), next];
            const sig = [...cycle.slice(0, -1)].sort().join('->');
            if (!seenSignatures.has(sig)) {
              seenSignatures.add(sig);
              cycles.push(cycle);
            }
          }
        }
      }
    }

    pathList.pop();
    stack.delete(node);
  }

  for (const node of adjacency.keys()) {
    if (!visited.has(node)) dfs(node);
  }
  return cycles;
}

export function analyzeProject(
  projectRoot: string,
  projectId: string,
  options: { runCompilerCheck?: boolean } = {},
): AnalysisOutput {
  const absRoot = path.resolve(projectRoot);
  const now = new Date().toISOString();
  const absFiles = discoverSourceFiles(absRoot);

  const files: SourceFileRecord[] = [];
  const variables: VariableRecord[] = [];
  const functions: FunctionRecord[] = [];
  const types: TypeRecord[] = [];
  const features: FeatureRecord[] = [];
  const edges: DependencyEdge[] = [];
  const tests: TestRecord[] = [];
  const diagnostics: RawDiagnostic[] = [];

  const fileContentMap = new Map<string, string>();
  const allRelPaths = new Set<string>();

  for (const absFile of absFiles) {
    const relPath = toCanonicalRelativePath(absRoot, absFile);
    allRelPaths.add(relPath);
    const content = fs.readFileSync(absFile, 'utf8');
    fileContentMap.set(relPath, content);
    const sha256 = hashNormalizedContent(content);
    const lines = content.split(/\r?\n/);
    const ext = path.extname(relPath).toLowerCase();
    const isTest = /\.(test|spec)\.(ts|tsx|js|jsx|py)$/i.test(relPath) || relPath.includes('__tests__/');
    const isConfig =
      ext === '.json' ||
      relPath.endsWith('vite.config.ts') ||
      relPath.endsWith('tsconfig.json') ||
      relPath.startsWith('.env');
    const isGenerated = content.includes('@generated') || relPath.includes('.gen.');

    files.push({
      id: stableId('file', projectId, relPath),
      projectId,
      path: relPath,
      language: detectLanguage(relPath),
      sha256,
      lineCount: lines.length,
      sizeBytes: Buffer.byteLength(content, 'utf8'),
      isTest,
      isConfig,
      isGenerated,
      lastScannedAt: now,
    });
  }

  // Track global symbol exports, backend routes, and cross-file references
  const exportedSymbolsByFile = new Map<string, Set<string>>();
  const importedSymbolsByTargetFile = new Map<string, Set<string>>();
  const backendEndpoints = new Map<string, { filePath: string; line: number; method: string; handler: string }>();
  const allCallNamesGlobal = new Map<string, string[]>();
  const testCoveredSymbolsGlobal = new Map<string, string[]>();
  const fileAdjacency = new Map<string, Set<string>>();

  // Pass 1: Parse every file cleanly
  for (const fileRec of files) {
    const content = fileContentMap.get(fileRec.path) || '';
    const lang = fileRec.language;

    // Detect suppression comments across languages
    const lines = content.split(/\r?\n/);
    lines.forEach((lineText, idx) => {
      const lineNum = idx + 1;
      if (/@ts-ignore|@ts-nocheck|eslint-disable|#\s*type:\s*ignore|#\s*noqa/i.test(lineText)) {
        const match = lineText.match(/(@ts-ignore|@ts-nocheck|eslint-disable[^\s]*|#\s*type:\s*ignore|#\s*noqa)/i);
        const token = match ? match[1] : 'suppression';
        diagnostics.push({
          analyzerId: 'apidacs-ast',
          analyzerVersion: '1.0.0',
          ruleId: 'DIAGNOSTIC_SUPPRESSION',
          category: 'suppression',
          message: `Diagnostic suppression directive "${token}" detected; requires documented justification or removal.`,
          filePath: fileRec.path,
          symbol: token,
          line: lineNum,
          column: 1,
          severity: Severity.MEDIUM,
          blocking: false,
          fingerprint: stableId('fp', projectId, 'DIAGNOSTIC_SUPPRESSION', fileRec.path, token),
          structuralKey: `${fileRec.path}::suppression::${token}`,
          payload: { directive: token, lineText: lineText.trim() },
        });
      }
    });

    if (lang === 'python') {
      analyzePythonFile(projectId, fileRec, content, now, variables, functions, types, diagnostics, tests);
      continue;
    }

    if (lang !== 'typescript' && lang !== 'javascript') {
      continue;
    }

    let ast: AstNode;
    try {
      ast = parse(content, {
        sourceType: 'unambiguous',
        errorRecovery: true,
        plugins: ['typescript', 'jsx', 'decorators'],
      }) as unknown as AstNode;
    } catch (err) {
      diagnostics.push({
        analyzerId: 'apidacs-ast',
        analyzerVersion: '1.0.0',
        ruleId: 'PARSE_ERROR',
        category: 'syntax',
        message: `AST parser failed: ${(err as Error).message}`,
        filePath: fileRec.path,
        symbol: null,
        line: 1,
        column: 1,
        severity: Severity.HIGH,
        blocking: true,
        fingerprint: stableId('fp', projectId, 'PARSE_ERROR', fileRec.path),
        structuralKey: `${fileRec.path}::parse_error`,
        payload: { error: (err as Error).message },
      });
      continue;
    }

    const fileExports = new Set<string>();
    exportedSymbolsByFile.set(fileRec.path, fileExports);
    if (!fileAdjacency.has(fileRec.path)) fileAdjacency.set(fileRec.path, new Set());

    // Local tracking maps for this file
    const localVars = new Map<string, VariableRecord>();
    const localFunctions = new Map<string, FunctionRecord>();
    const uiBindingsInFile: Array<{
      component: string;
      controlId: string;
      eventHandler: string;
      line: number;
      handlerBodyCalls: string[];
      endpointsReferenced: string[];
      isNoOp: boolean;
    }> = [];
    const fetchEndpointsInFile: string[] = [];
    let hasReflectionOrDynamic = false;

    walkAst(ast, (node, parent) => {
      const line = node.loc?.start.line ?? 1;
      const column = node.loc?.start.column ?? 0;

      // 1. Imports -> File dependency graph
      if (node.type === 'ImportDeclaration') {
        const source = node.source as AstNode | undefined;
        const spec = source && typeof source.value === 'string' ? source.value : null;
        if (spec) {
          const targetFile = resolveImportTarget(absRoot, fileRec.path, spec, allRelPaths);
          const targetId = targetFile ? stableId('file', projectId, targetFile) : stableId('pkg', projectId, spec);
          const targetLabel = targetFile || spec;

          if (targetFile) {
            fileAdjacency.get(fileRec.path)?.add(targetFile);
            if (!importedSymbolsByTargetFile.has(targetFile)) {
              importedSymbolsByTargetFile.set(targetFile, new Set());
            }
            const specifiers = (node.specifiers as AstNode[] | undefined) || [];
            for (const sp of specifiers) {
              const imported = sp.imported as AstNode | undefined;
              if (imported && typeof imported.name === 'string') {
                importedSymbolsByTargetFile.get(targetFile)?.add(imported.name);
              } else if (sp.type === 'ImportDefaultSpecifier') {
                importedSymbolsByTargetFile.get(targetFile)?.add('default');
              } else if (sp.type === 'ImportNamespaceSpecifier') {
                importedSymbolsByTargetFile.get(targetFile)?.add('*');
              }
            }
          }

          edges.push({
            id: stableId('edge', projectId, fileRec.path, targetLabel, String(line)),
            projectId,
            sourceId: fileRec.id,
            sourceLabel: fileRec.path,
            targetId,
            targetLabel,
            edgeType: 'FILE_IMPORT',
            filePath: fileRec.path,
            line,
            confidence: RelationshipConfidence.CONFIRMED,
            discoveryMethod: 'babel-ast-import',
            lastVerifiedAt: now,
          });
        }
      }

      // Dynamic import / Reflection detection
      if (
        node.type === 'Import' ||
        (node.type === 'Identifier' && (node.name === 'eval' || node.name === 'Reflect' || node.name === 'Proxy'))
      ) {
        hasReflectionOrDynamic = true;
      }

      // 2. Exports
      if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') {
        const decl = node.declaration as AstNode | undefined;
        if (decl) {
          if (decl.type === 'FunctionDeclaration' && (decl.id as AstNode | undefined)?.name) {
            fileExports.add((decl.id as AstNode).name as string);
          } else if (decl.type === 'ClassDeclaration' && (decl.id as AstNode | undefined)?.name) {
            fileExports.add((decl.id as AstNode).name as string);
          } else if (decl.type === 'VariableDeclaration') {
            for (const d of (decl.declarations as AstNode[]) || []) {
              const idNode = d.id as AstNode | undefined;
              if (idNode?.type === 'Identifier' && typeof idNode.name === 'string') {
                fileExports.add(idNode.name);
              }
            }
          } else if (decl.type === 'Identifier' && typeof decl.name === 'string') {
            fileExports.add(decl.name);
          }
        }
        const specifiers = (node.specifiers as AstNode[] | undefined) || [];
        for (const sp of specifiers) {
          const exported = sp.exported as AstNode | undefined;
          if (exported && typeof exported.name === 'string') {
            fileExports.add(exported.name);
          }
        }
        if (node.type === 'ExportDefaultDeclaration') {
          fileExports.add('default');
        }
      }

      // 3. Variable declarations
      if (node.type === 'VariableDeclarator') {
        const idNode = node.id as AstNode | undefined;
        if (idNode?.type === 'Identifier' && typeof idNode.name === 'string') {
          const varName = idNode.name;
          const kind =
            parent && parent.type === 'VariableDeclaration' && typeof parent.kind === 'string'
              ? (parent.kind as 'const' | 'let' | 'var')
              : 'const';
          const initNode = node.init as AstNode | undefined;
          // Skip arrow functions / function expressions here (captured in Functions)
          if (initNode && (initNode.type === 'ArrowFunctionExpression' || initNode.type === 'FunctionExpression')) {
            return;
          }
          const initVal = initNode ? summarizeAstExpr(initNode) : null;
          const typeAnn = extractTypeAnnotation(idNode);
          const isExported = fileExports.has(varName);
          const rec: VariableRecord = {
            id: stableId('var', projectId, fileRec.path, varName, String(line)),
            projectId,
            name: varName,
            filePath: fileRec.path,
            scope: 'module',
            line,
            column,
            typeAnnotation: typeAnn,
            visibility: isExported ? 'exported' : 'local',
            mutability: kind,
            initialValue: initVal,
            initLocations: initNode ? [`${fileRec.path}:${line}`] : [],
            assignLocations: [],
            readLocations: [],
            logOnlyReads: [],
            passedToCalls: [],
            transformations: [],
            destinations: [],
            intendedConsumer: inferIntendedConsumer(varName, fileRec.path),
            actualConsumer: null,
            relatedFunctions: [],
            relatedFeatures: [],
            lifecycleStage: initNode ? VariableLifecycleStage.INITIALIZED : VariableLifecycleStage.DECLARED,
            confidence: RelationshipConfidence.CONFIRMED,
          };
          localVars.set(varName, rec);
        }
      }

      // 4. Functions & Methods
      if (
        node.type === 'FunctionDeclaration' ||
        node.type === 'ClassMethod' ||
        (node.type === 'VariableDeclarator' &&
          node.init &&
          ((node.init as AstNode).type === 'ArrowFunctionExpression' ||
            (node.init as AstNode).type === 'FunctionExpression'))
      ) {
        const fnNode =
          node.type === 'VariableDeclarator' ? (node.init as AstNode) : node;
        const fnName =
          node.type === 'VariableDeclarator'
            ? ((node.id as AstNode)?.name as string | undefined)
            : node.type === 'ClassMethod'
              ? ((node.key as AstNode)?.name as string | undefined)
              : ((node.id as AstNode)?.name as string | undefined);
        if (!fnName) return;

        const paramNodes = (fnNode.params as AstNode[] | undefined) || [];
        const bodyIdentifiers = new Set<string>();
        const callees: string[] = [];
        let hasSideEffects = false;

        walkAst(fnNode.body, (inner) => {
          if (inner.type === 'Identifier' && typeof inner.name === 'string') {
            bodyIdentifiers.add(inner.name);
          }
          if (inner.type === 'AssignmentExpression' || inner.type === 'UpdateExpression') {
            hasSideEffects = true;
          }
          if (inner.type === 'CallExpression') {
            const cName = getCalleeName(inner.callee as AstNode);
            if (cName) {
              callees.push(cName);
              if (!allCallNamesGlobal.has(cName)) allCallNamesGlobal.set(cName, []);
              allCallNamesGlobal.get(cName)?.push(`${fileRec.path}:${inner.loc?.start.line ?? line}`);
            }
          }
        });

        const params = paramNodes
          .map((p) => {
            const pName =
              p.type === 'Identifier'
                ? (p.name as string)
                : p.type === 'AssignmentPattern' && (p.left as AstNode)?.type === 'Identifier'
                  ? ((p.left as AstNode).name as string)
                  : null;
            if (!pName) return null;
            return {
              name: pName,
              type: extractTypeAnnotation(p),
              used: bodyIdentifiers.has(pName),
            };
          })
          .filter((p): p is { name: string; type: string; used: boolean } => p !== null);

        const ignoresConfigParam = params.some(
          (p) => !p.used && /config|setting|option|rate|mode|theme|policy/i.test(p.name),
        );

        const isFrameworkHook =
          /^(use[A-Z]|App|main|render)/.test(fnName) ||
          fileRec.path.endsWith('App.tsx') ||
          fileRec.path.endsWith('server.ts');

        const fnRec: FunctionRecord = {
          id: stableId('fn', projectId, fileRec.path, fnName, String(line)),
          projectId,
          name: fnName,
          filePath: fileRec.path,
          declaringScope: 'module',
          line,
          visibility: fileExports.has(fnName) ? 'exported' : 'internal',
          parameters: params,
          returnType: extractReturnType(fnNode),
          callers: [],
          callees: Array.from(new Set(callees)),
          hasSideEffects,
          isExported: fileExports.has(fnName),
          isFrameworkHook,
          ignoresConfigParam,
          returnValueDiscardedCount: 0,
          testReferences: [],
          verificationStatus: 'UNVERIFIED',
        };
        localFunctions.set(fnName, fnRec);
        functions.push(fnRec);

        // Emit FUNCTION_CALL edges
        for (const callee of fnRec.callees) {
          edges.push({
            id: stableId('edge_fn', projectId, fnRec.id, callee),
            projectId,
            sourceId: fnRec.id,
            sourceLabel: `${fnName}()`,
            targetId: stableId('sym', projectId, callee),
            targetLabel: `${callee}()`,
            edgeType: 'FUNCTION_CALL',
            filePath: fileRec.path,
            line,
            confidence: RelationshipConfidence.CONFIRMED,
            discoveryMethod: 'babel-ast-call',
            lastVerifiedAt: now,
          });
        }

        // Flag ignored configuration parameters immediately
        if (ignoresConfigParam) {
          for (const p of params.filter((pr) => !pr.used && /config|setting|option|rate|mode|theme|policy/i.test(pr.name))) {
            diagnostics.push({
              analyzerId: 'apidacs-ast',
              analyzerVersion: '1.0.0',
              ruleId: 'IGNORED_CONFIG_PARAMETER',
              category: 'data-flow',
              message: `Function "${fnName}" accepts parameter "${p.name}" but never reads or propagates it.`,
              filePath: fileRec.path,
              symbol: `${fnName}.${p.name}`,
              line,
              column,
              severity: Severity.HIGH,
              blocking: false,
              fingerprint: stableId('fp', projectId, 'IGNORED_CONFIG_PARAMETER', fileRec.path, fnName, p.name),
              structuralKey: `${fileRec.path}::${fnName}::ignored_param::${p.name}`,
              payload: { functionName: fnName, parameter: p.name },
              relatedElementId: fnRec.id,
            });
          }
        }
      }

      // 5. Types, Interfaces, Classes, Enums
      if (
        node.type === 'TSInterfaceDeclaration' ||
        node.type === 'TSTypeAliasDeclaration' ||
        node.type === 'TSEnumDeclaration' ||
        node.type === 'ClassDeclaration'
      ) {
        const typeName = (node.id as AstNode | undefined)?.name as string | undefined;
        if (!typeName) return;
        const kindMap: Record<string, TypeRecord['kind']> = {
          TSInterfaceDeclaration: 'interface',
          TSTypeAliasDeclaration: 'type',
          TSEnumDeclaration: 'enum',
          ClassDeclaration: 'class',
        };
        const members: Array<{ name: string; type: string; optional: boolean }> = [];
        const bodyItems =
          ((node.body as AstNode | undefined)?.body as AstNode[] | undefined) ||
          ((node.typeAnnotation as AstNode | undefined)?.members as AstNode[] | undefined) ||
          [];
        for (const m of bodyItems) {
          const mName = (m.key as AstNode)?.name as string | undefined;
          if (mName) {
            members.push({
              name: mName,
              type: extractTypeAnnotation(m),
              optional: Boolean(m.optional),
            });
          }
        }

        types.push({
          id: stableId('type', projectId, fileRec.path, typeName, String(line)),
          projectId,
          name: typeName,
          kind: kindMap[node.type] || 'type',
          filePath: fileRec.path,
          line,
          isExported: fileExports.has(typeName),
          extendsList: [],
          implementsList: [],
          members,
          consumers: [],
        });
      }

      // 6. Backend HTTP endpoints (Express / Fastify / Hono style)
      if (node.type === 'CallExpression') {
        const cName = getCalleeName(node.callee as AstNode);
        const args = (node.arguments as AstNode[] | undefined) || [];
        if (cName && /^(app|router)\.(get|post|put|patch|delete)$/i.test(cName) && args.length >= 2) {
          const routeArg = args[0];
          if (routeArg?.type === 'StringLiteral' && typeof routeArg.value === 'string') {
            const method = cName.split('.')[1].toUpperCase();
            backendEndpoints.set(`${method} ${routeArg.value}`, {
              filePath: fileRec.path,
              line,
              method,
              handler: cName,
            });
            backendEndpoints.set(routeArg.value, {
              filePath: fileRec.path,
              line,
              method,
              handler: cName,
            });
          }
        }
        // Track fetch('/api/...') calls
        if (cName === 'fetch' && args[0]?.type === 'StringLiteral' && typeof args[0].value === 'string') {
          fetchEndpointsInFile.push(args[0].value);
        }
        // Track discarded return values on ExpressionStatement calls
        if (parent?.type === 'ExpressionStatement' && cName) {
          if (/^(parse|format|compute|calculate|build|create|transform|validate|resolve)/i.test(cName.split('.').pop() || '')) {
            const fnTarget = localFunctions.get(cName);
            if (fnTarget) fnTarget.returnValueDiscardedCount += 1;
          }
        }
      }

      // 7. UI controls (JSX interactive elements)
      if (node.type === 'JSXOpeningElement') {
        const tag = (node.name as AstNode | undefined)?.name as string | undefined;
        if (tag && /^(button|form|input|select|textarea|a|Button)$/i.test(tag)) {
          const attrs = (node.attributes as AstNode[] | undefined) || [];
          for (const attr of attrs) {
            if (attr.type !== 'JSXAttribute') continue;
            const attrName = (attr.name as AstNode | undefined)?.name as string | undefined;
            if (attrName && /^(onClick|onSubmit|onChange)$/i.test(attrName)) {
              const valNode = (attr.value as AstNode | undefined)?.expression as AstNode | undefined;
              let handlerName = attrName;
              let isNoOp = false;
              const calls: string[] = [];
              const endpoints: string[] = [];
              if (valNode?.type === 'Identifier' && typeof valNode.name === 'string') {
                handlerName = valNode.name;
              } else if (valNode?.type === 'ArrowFunctionExpression' || valNode?.type === 'FunctionExpression') {
                const body = valNode.body as AstNode | undefined;
                if (body?.type === 'BlockStatement' && ((body.body as AstNode[]) || []).length === 0) {
                  isNoOp = true;
                }
                walkAst(body, (inner) => {
                  if (inner.type === 'CallExpression') {
                    const cn = getCalleeName(inner.callee as AstNode);
                    if (cn) calls.push(cn);
                    const cArgs = (inner.arguments as AstNode[]) || [];
                    if (cn === 'fetch' && cArgs[0]?.type === 'StringLiteral' && typeof cArgs[0].value === 'string') {
                      endpoints.push(cArgs[0].value);
                    }
                  }
                });
              }
              uiBindingsInFile.push({
                component: path.basename(fileRec.path, path.extname(fileRec.path)),
                controlId: `<${tag} ${attrName}>@${line}`,
                eventHandler: handlerName,
                line,
                handlerBodyCalls: calls,
                endpointsReferenced: endpoints,
                isNoOp,
              });
            }
          }
        }
      }

      // 8. Test records & test integrity checks
      if (fileRec.isTest && node.type === 'CallExpression') {
        const cName = getCalleeName(node.callee as AstNode);
        const args = (node.arguments as AstNode[] | undefined) || [];
        if (cName && /^(it|test|describe|it\.skip|test\.skip|describe\.skip|xit|xtest)$/i.test(cName)) {
          const testTitle = args[0]?.type === 'StringLiteral' ? (args[0].value as string) : `test@${line}`;
          const isSkipped = /skip|^x/i.test(cName);
          let assertionCount = 0;
          let usesMocks = false;
          let statementCount = 0;
          const covered: string[] = [];
          if (args[1]) {
            const body = (args[1] as AstNode).body as AstNode | undefined;
            if (body?.type === 'BlockStatement') {
              statementCount = ((body.body as AstNode[]) || []).length;
            } else if (body) {
              statementCount = 1;
            }
            walkAst(args[1], (inner) => {
              if (inner.type === 'CallExpression') {
                const cn = getCalleeName(inner.callee as AstNode);
                if (cn && /^(expect|assert|assert\.)/i.test(cn)) assertionCount += 1;
                if (cn && /(mock|stub|spy|vi\.fn|jest\.fn)/i.test(cn)) usesMocks = true;
                if (cn && !/^(expect|assert|describe|it|test)/i.test(cn)) covered.push(cn);
              }
            });
          }
          const isEmpty = !isSkipped && statementCount === 0;
          tests.push({
            id: stableId('tst', projectId, fileRec.path, testTitle, String(line)),
            name: testTitle,
            filePath: fileRec.path,
            line,
            category: usesMocks ? 'UNIT_MOCKED' : fileRec.path.includes('integration') ? 'INTEGRATION' : 'UNIT',
            isSkipped,
            isEmpty,
            usesMocks,
            assertionCount,
            coveredSymbols: Array.from(new Set(covered)),
            lastVerifiedAt: now,
          });
          for (const sym of covered) {
            if (!testCoveredSymbolsGlobal.has(sym)) testCoveredSymbolsGlobal.set(sym, []);
            testCoveredSymbolsGlobal.get(sym)?.push(testTitle);
          }

          if (isSkipped || isEmpty || (assertionCount === 0 && !cName.startsWith('describe'))) {
            diagnostics.push({
              analyzerId: 'apidacs-test-integrity',
              analyzerVersion: '1.0.0',
              ruleId: isSkipped ? 'SKIPPED_TEST' : isEmpty ? 'EMPTY_TEST' : 'TEST_WITHOUT_ASSERTIONS',
              category: 'test-integrity',
              message: isSkipped
                ? `Test "${testTitle}" is skipped/disabled (${cName}).`
                : isEmpty
                  ? `Test "${testTitle}" has an empty body.`
                  : `Test "${testTitle}" contains zero assertions.`,
              filePath: fileRec.path,
              symbol: testTitle,
              line,
              column,
              severity: Severity.MEDIUM,
              blocking: false,
              fingerprint: stableId('fp', projectId, 'TEST_INTEGRITY', fileRec.path, testTitle),
              structuralKey: `${fileRec.path}::test::${testTitle}`,
              payload: { isSkipped, isEmpty, assertionCount, usesMocks },
            });
          }
        }
      }
    });

    // Pass 1b: Trace variable reads, assignments, logging-only reads, propagation, and hardcoded overrides inside this file
    walkAst(ast, (node, parent) => {
      const line = node.loc?.start.line ?? 1;
      if (node.type === 'AssignmentExpression') {
        const left = node.left as AstNode | undefined;
        if (left?.type === 'Identifier' && typeof left.name === 'string') {
          const v = localVars.get(left.name);
          if (v) {
            v.assignLocations.push(`${fileRec.path}:${line}`);
            if (v.lifecycleStage === VariableLifecycleStage.DECLARED || v.lifecycleStage === VariableLifecycleStage.INITIALIZED) {
              v.lifecycleStage = VariableLifecycleStage.ASSIGNED;
            }
          }
        }
      }

      // Check Identifier reads (excluding declarations & left-hand assignment targets & property keys)
      if (node.type === 'Identifier' && typeof node.name === 'string') {
        const v = localVars.get(node.name);
        if (!v) return;
        if (parent?.type === 'VariableDeclarator' && parent.id === node) return;
        if (parent?.type === 'AssignmentExpression' && parent.left === node) return;
        if (parent?.type === 'MemberExpression' && parent.property === node && !parent.computed) return;
        if (parent?.type === 'ExportSpecifier') return;

        const locStr = `${fileRec.path}:${line}`;
        if (parent?.type === 'CallExpression') {
          const calleeName = getCalleeName(parent.callee as AstNode);
          if (isLoggingCall(calleeName)) {
            v.logOnlyReads.push(locStr);
            return;
          }
          v.passedToCalls.push(calleeName || 'anonymous');
          v.destinations.push(`${calleeName || 'call'}@${locStr}`);
          v.readLocations.push(locStr);
          return;
        }

        if (parent?.type === 'ReturnStatement') {
          v.destinations.push(`return@${locStr}`);
          v.readLocations.push(locStr);
          return;
        }

        if (parent?.type === 'BinaryExpression' || parent?.type === 'ConditionalExpression' || parent?.type === 'LogicalExpression') {
          v.transformations.push(`${parent.type}@${locStr}`);
          v.readLocations.push(locStr);
          return;
        }

        if (parent?.type === 'JSXExpressionContainer') {
          v.destinations.push(`jsx@${locStr}`);
          v.readLocations.push(locStr);
          return;
        }

        v.readLocations.push(locStr);
      }
    });

    // Evaluate variable lifecycle stages & generate findings
    for (const v of localVars.values()) {
      const hasRealReads = v.readLocations.length > 0;
      const hasLogsOnly = !hasRealReads && v.logOnlyReads.length > 0;
      const isPropagated = v.passedToCalls.length > 0 || v.destinations.length > 0 || v.visibility === 'exported';

      if (hasLogsOnly) {
        v.lifecycleStage = VariableLifecycleStage.DISCONNECTED;
        v.actualConsumer = 'logging-only';
        diagnostics.push({
          analyzerId: 'apidacs-dataflow',
          analyzerVersion: '1.0.0',
          ruleId: 'LOG_ONLY_CONSUMPTION',
          category: 'data-flow',
          message: `Variable "${v.name}" is read only for logging (${v.logOnlyReads.join(', ')}) and does not drive functional behavior.`,
          filePath: v.filePath,
          symbol: v.name,
          line: v.line,
          column: v.column,
          severity: Severity.MEDIUM,
          blocking: false,
          fingerprint: stableId('fp', projectId, 'LOG_ONLY_CONSUMPTION', v.filePath, v.name),
          structuralKey: `${v.filePath}::var::${v.name}::log_only`,
          payload: { logOnlyReads: v.logOnlyReads },
          relatedElementId: v.id,
        });
      } else if (!hasRealReads && v.visibility !== 'exported') {
        if (hasReflectionOrDynamic) {
          v.lifecycleStage = VariableLifecycleStage.UNRESOLVED;
          v.confidence = RelationshipConfidence.UNKNOWN;
          diagnostics.push({
            analyzerId: 'apidacs-dataflow',
            analyzerVersion: '1.0.0',
            ruleId: 'UNRESOLVED_DYNAMIC_REFERENCE',
            category: 'unused-or-dynamic',
            message: `Variable "${v.name}" has no direct static reads, but file uses dynamic/reflection constructs; preserving as UNRESOLVED.`,
            filePath: v.filePath,
            symbol: v.name,
            line: v.line,
            column: v.column,
            severity: Severity.LOW,
            blocking: false,
            fingerprint: stableId('fp', projectId, 'UNRESOLVED_DYNAMIC_REFERENCE', v.filePath, v.name),
            structuralKey: `${v.filePath}::var::${v.name}::dynamic`,
            payload: { dynamicFile: true },
            relatedElementId: v.id,
          });
        } else {
          v.lifecycleStage = v.assignLocations.length > 0 ? VariableLifecycleStage.DISCONNECTED : VariableLifecycleStage.UNRESOLVED;
          diagnostics.push({
            analyzerId: 'apidacs-dataflow',
            analyzerVersion: '1.0.0',
            ruleId: v.assignLocations.length > 0 ? 'ASSIGNED_NOT_PROPAGATED' : 'UNUSED_VARIABLE_DECLARATION',
            category: 'data-flow',
            message:
              v.assignLocations.length > 0
                ? `Variable "${v.name}" is assigned (${v.assignLocations.join(', ')}) but never propagated or consumed downstream.`
                : `Variable "${v.name}" is declared in "${v.filePath}" with no observed reads. Investigate intended consumer before any removal.`,
            filePath: v.filePath,
            symbol: v.name,
            line: v.line,
            column: v.column,
            severity: v.assignLocations.length > 0 ? Severity.HIGH : Severity.MEDIUM,
            blocking: false,
            fingerprint: stableId('fp', projectId, 'VAR_UNUSED_OR_DISCONNECTED', v.filePath, v.name),
            structuralKey: `${v.filePath}::var::${v.name}`,
            payload: { mutability: v.mutability, assignCount: v.assignLocations.length },
            relatedElementId: v.id,
          });
        }
      } else if (isPropagated) {
        v.lifecycleStage =
          v.transformations.length > 0
            ? VariableLifecycleStage.TRANSFORMED
            : v.passedToCalls.length > 0
              ? VariableLifecycleStage.CONSUMED
              : VariableLifecycleStage.PROPAGATED;
        v.actualConsumer = v.passedToCalls[0] || v.destinations[0] || 'module-export';
        for (const callTarget of v.passedToCalls) {
          edges.push({
            id: stableId('edge_df', projectId, v.id, callTarget),
            projectId,
            sourceId: v.id,
            sourceLabel: `${v.name} (${v.filePath})`,
            targetId: stableId('sym', projectId, callTarget),
            targetLabel: callTarget,
            edgeType: 'DATA_FLOW',
            filePath: v.filePath,
            line: v.line,
            confidence: RelationshipConfidence.CONFIRMED,
            discoveryMethod: 'babel-ast-dataflow',
            lastVerifiedAt: now,
          });
        }
      } else {
        v.lifecycleStage = VariableLifecycleStage.READ;
      }

      variables.push(v);
    }

    // Register UI bindings / features in this file
    for (const ui of uiBindingsInFile) {
      const endpoints = ui.endpointsReferenced.length > 0 ? ui.endpointsReferenced : fetchEndpointsInFile;
      const matchedEndpoint = endpoints.find((ep) => backendEndpoints.has(ep)) || endpoints[0] || null;
      const status = ui.isNoOp
        ? FeatureStatus.BROKEN
        : matchedEndpoint
          ? FeatureStatus.INTEGRATED
          : ui.handlerBodyCalls.length > 0 || ui.eventHandler !== 'onClick'
            ? FeatureStatus.PARTIALLY_IMPLEMENTED
            : FeatureStatus.BROKEN;

      const featId = stableId('feat', projectId, fileRec.path, ui.controlId, String(ui.line));
      features.push({
        id: featId,
        projectId,
        name: `${ui.component}: ${ui.eventHandler}`,
        screenOrComponent: ui.component,
        filePath: fileRec.path,
        line: ui.line,
        controlId: ui.controlId,
        eventHandler: ui.eventHandler,
        controllerOrHook: ui.handlerBodyCalls[0] || ui.eventHandler,
        serviceOrEndpoint: matchedEndpoint,
        backendOperation: matchedEndpoint ? `HTTP ${matchedEndpoint}` : null,
        dataSource: null,
        status,
        errorHandling: content.includes('try') || content.includes('.catch('),
        testCoverage: testCoveredSymbolsGlobal.get(ui.eventHandler) || [],
        notes: ui.isNoOp ? 'Control has an empty no-op event handler' : 'Discovered via JSX AST analysis',
      });

      if (ui.isNoOp) {
        diagnostics.push({
          analyzerId: 'apidacs-ui',
          analyzerVersion: '1.0.0',
          ruleId: 'DEAD_UI_CONTROL',
          category: 'ui-backend',
          message: `UI control ${ui.controlId} in "${fileRec.path}" has an empty event handler with no backend or state operation.`,
          filePath: fileRec.path,
          symbol: ui.controlId,
          line: ui.line,
          column: 1,
          severity: Severity.HIGH,
          blocking: false,
          fingerprint: stableId('fp', projectId, 'DEAD_UI_CONTROL', fileRec.path, ui.controlId),
          structuralKey: `${fileRec.path}::ui::${ui.controlId}`,
          payload: { component: ui.component, controlId: ui.controlId },
          relatedElementId: featId,
        });
      }
    }
  }

  // Pass 2: Cross-file reconciliation for functions, UI endpoints, and cycles
  for (const fn of functions) {
    const callers = allCallNamesGlobal.get(fn.name) || [];
    fn.callers = Array.from(new Set(callers));
    fn.testReferences = testCoveredSymbolsGlobal.get(fn.name) || [];
    if (fn.testReferences.length > 0) {
      fn.verificationStatus = 'TEST_REFERENCED';
    }

    const fileImports = importedSymbolsByTargetFile.get(fn.filePath);
    const isImportedElsewhere =
      fn.isExported &&
      fileImports &&
      (fileImports.has(fn.name) || fileImports.has('*') || fileImports.has('default'));

    if (!fn.isFrameworkHook && fn.callers.length === 0 && !isImportedElsewhere && !fn.filePath.includes('.test.')) {
      diagnostics.push({
        analyzerId: 'apidacs-ast',
        analyzerVersion: '1.0.0',
        ruleId: 'UNREACHABLE_OR_INDIRECT_FUNCTION',
        category: 'function-reachability',
        message: `Function "${fn.name}" in "${fn.filePath}" has no detected direct static callers. Verify indirect/framework/external entry points before any change.`,
        filePath: fn.filePath,
        symbol: fn.name,
        line: fn.line,
        column: 1,
        severity: Severity.LOW,
        blocking: false,
        fingerprint: stableId('fp', projectId, 'UNREACHABLE_FUNCTION', fn.filePath, fn.name),
        structuralKey: `${fn.filePath}::fn::${fn.name}`,
        payload: { isExported: fn.isExported, callees: fn.callees },
        relatedElementId: fn.id,
      });
    }
  }

  // Link UI features to backend endpoints discovered later in the scan
  for (const feat of features) {
    if (feat.serviceOrEndpoint && backendEndpoints.has(feat.serviceOrEndpoint)) {
      const ep = backendEndpoints.get(feat.serviceOrEndpoint)!;
      feat.backendOperation = `${ep.method} ${feat.serviceOrEndpoint} (${ep.filePath}:${ep.line})`;
      feat.status = feat.testCoverage.length > 0 ? FeatureStatus.VERIFIED : FeatureStatus.INTEGRATED;
      edges.push({
        id: stableId('edge_ui', projectId, feat.id, ep.filePath, String(ep.line)),
        projectId,
        sourceId: feat.id,
        sourceLabel: `${feat.screenOrComponent} ${feat.controlId}`,
        targetId: stableId('ep', projectId, ep.filePath, feat.serviceOrEndpoint),
        targetLabel: `${ep.method} ${feat.serviceOrEndpoint}`,
        edgeType: 'UI_TO_BACKEND',
        filePath: feat.filePath,
        line: feat.line,
        confidence: RelationshipConfidence.CONFIRMED,
        discoveryMethod: 'ui-endpoint-match',
        lastVerifiedAt: now,
      });
    }
  }

  // Circular dependency detection
  const cycles = findCycles(fileAdjacency);
  for (const cycle of cycles) {
    const cycleLabel = cycle.join(' -> ');
    diagnostics.push({
      analyzerId: 'apidacs-graph',
      analyzerVersion: '1.0.0',
      ruleId: 'CIRCULAR_DEPENDENCY',
      category: 'architecture',
      message: `Circular module dependency cycle detected: ${cycleLabel}`,
      filePath: cycle[0] || '<project>',
      symbol: cycle[0] || null,
      line: 1,
      column: 1,
      severity: Severity.HIGH,
      blocking: false,
      fingerprint: stableId('fp', projectId, 'CIRCULAR_DEPENDENCY', [...cycle].sort().join('|')),
      structuralKey: `cycle::${[...cycle].sort().join('|')}`,
      payload: { cycle },
    });
  }

  // Optional TypeScript compiler diagnostics if requested and tsconfig exists
  if (options.runCompilerCheck && fs.existsSync(path.join(absRoot, 'tsconfig.json'))) {
    const tscBin = path.join(absRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
    const cmd = fs.existsSync(tscBin) ? tscBin : process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const args = fs.existsSync(tscBin) ? ['--noEmit'] : ['tsc', '--noEmit'];
    const res = safeSpawn(cmd, args, absRoot, 20000);
    if (!res.ok && (res.stdout || res.stderr)) {
      const output = `${res.stdout}\n${res.stderr}`.trim();
      const tsLines = output.split(/\r?\n/).filter((l) => /error TS\d+/.test(l)).slice(0, 20);
      for (const lineText of tsLines) {
        const m = lineText.match(/^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$/);
        if (m) {
          const rel = toCanonicalRelativePath(absRoot, path.resolve(absRoot, m[1]));
          diagnostics.push({
            analyzerId: 'tsc',
            analyzerVersion: 'compiler',
            ruleId: m[4],
            category: 'compiler',
            message: m[5],
            filePath: rel,
            symbol: m[4],
            line: Number(m[2]),
            column: Number(m[3]),
            severity: Severity.HIGH,
            blocking: true,
            fingerprint: stableId('fp', projectId, 'tsc', m[4], rel, m[5]),
            structuralKey: `${rel}::${m[4]}::${m[5].slice(0, 48)}`,
            payload: { compilerLine: lineText },
          });
        }
      }
    }
  }

  const dedupe = <T extends { id: string }>(items: T[]): T[] =>
    Array.from(new Map(items.map((item) => [item.id, item])).values());

  return {
    files: dedupe(files),
    variables: dedupe(variables),
    functions: dedupe(functions),
    types: dedupe(types),
    features: dedupe(features),
    edges: dedupe(edges),
    tests: dedupe(tests),
    diagnostics,
    cycles,
  };
}

function summarizeAstExpr(node: AstNode): string {
  switch (node.type) {
    case 'StringLiteral':
      return JSON.stringify(node.value);
    case 'NumericLiteral':
    case 'BooleanLiteral':
      return String(node.value);
    case 'NullLiteral':
      return 'null';
    case 'ArrayExpression':
      return `[${((node.elements as AstNode[]) || []).length} items]`;
    case 'ObjectExpression':
      return `{${((node.properties as AstNode[]) || []).length} keys}`;
    case 'Identifier':
      return String(node.name || 'expr');
    case 'CallExpression':
      return `${getCalleeName(node.callee as AstNode) || 'call'}()`;
    default:
      return node.type;
  }
}

function extractTypeAnnotation(node: AstNode): string {
  const ta = node.typeAnnotation as AstNode | undefined;
  if (!ta) return 'inferred';
  const inner = (ta.typeAnnotation as AstNode | undefined) || ta;
  if (inner.type === 'TSStringKeyword') return 'string';
  if (inner.type === 'TSNumberKeyword') return 'number';
  if (inner.type === 'TSBooleanKeyword') return 'boolean';
  if (inner.type === 'TSVoidKeyword') return 'void';
  if (inner.type === 'TSTypeReference') {
    return ((inner.typeName as AstNode | undefined)?.name as string) || 'TypeRef';
  }
  return inner.type.replace(/^TS/, '');
}

function extractReturnType(fnNode: AstNode): string {
  const rt = fnNode.returnType as AstNode | undefined;
  if (!rt) return 'inferred';
  return extractTypeAnnotation({ type: 'Param', typeAnnotation: rt });
}

function inferIntendedConsumer(varName: string, filePath: string): string | null {
  if (/config|setting|option|rate|port|host|mode|theme/i.test(varName)) {
    return `runtime-pipeline (${filePath})`;
  }
  if (/state|data|items|list|result|payload/i.test(varName)) {
    return `ui-or-service-consumer (${filePath})`;
  }
  return null;
}

function analyzePythonFile(
  projectId: string,
  fileRec: SourceFileRecord,
  content: string,
  now: string,
  variables: VariableRecord[],
  functions: FunctionRecord[],
  types: TypeRecord[],
  diagnostics: RawDiagnostic[],
  tests: TestRecord[],
): void {
  const lines = content.split(/\r?\n/);
  lines.forEach((lineText, idx) => {
    const line = idx + 1;
    const defMatch = lineText.match(/^\s*def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/);
    if (defMatch) {
      const fnName = defMatch[1];
      const rawParams = defMatch[2]
        .split(',')
        .map((p) => p.trim().split(':')[0].split('=')[0].trim())
        .filter((p) => p && p !== 'self' && p !== 'cls');
      functions.push({
        id: stableId('fn', projectId, fileRec.path, fnName),
        projectId,
        name: fnName,
        filePath: fileRec.path,
        declaringScope: 'module',
        line,
        visibility: fnName.startsWith('_') ? 'internal' : 'exported',
        parameters: rawParams.map((p) => ({ name: p, type: 'dynamic', used: true })),
        returnType: 'dynamic',
        callers: [],
        callees: [],
        hasSideEffects: false,
        isExported: !fnName.startsWith('_'),
        isFrameworkHook: fnName === 'main' || fnName.startsWith('test_'),
        ignoresConfigParam: false,
        returnValueDiscardedCount: 0,
        testReferences: [],
        verificationStatus: 'UNVERIFIED',
      });
      if (fileRec.isTest && fnName.startsWith('test_')) {
        tests.push({
          id: stableId('tst', projectId, fileRec.path, fnName, String(line)),
          name: fnName,
          filePath: fileRec.path,
          line,
          category: 'UNIT',
          isSkipped: content.includes('@pytest.mark.skip'),
          isEmpty: false,
          usesMocks: content.includes('unittest.mock'),
          assertionCount: (content.match(/\bassert\b/g) || []).length,
          coveredSymbols: [],
          lastVerifiedAt: now,
        });
      }
      return;
    }

    const clsMatch = lineText.match(/^\s*class\s+([A-Za-z_]\w*)/);
    if (clsMatch) {
      types.push({
        id: stableId('type', projectId, fileRec.path, clsMatch[1]),
        projectId,
        name: clsMatch[1],
        kind: 'class',
        filePath: fileRec.path,
        line,
        isExported: !clsMatch[1].startsWith('_'),
        extendsList: [],
        implementsList: [],
        members: [],
        consumers: [],
      });
      return;
    }

    const assignMatch = lineText.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/);
    if (assignMatch && !lineText.trim().startsWith('#')) {
      const varName = assignMatch[1];
      const occ = content.split(varName).length - 1;
      const stage = occ > 1 ? VariableLifecycleStage.READ : VariableLifecycleStage.UNRESOLVED;
      const v: VariableRecord = {
        id: stableId('var', projectId, fileRec.path, varName),
        projectId,
        name: varName,
        filePath: fileRec.path,
        scope: 'module',
        line,
        column: 0,
        typeAnnotation: 'dynamic',
        visibility: varName.startsWith('_') ? 'local' : 'exported',
        mutability: 'let',
        initialValue: assignMatch[2].trim().slice(0, 48),
        initLocations: [`${fileRec.path}:${line}`],
        assignLocations: [],
        readLocations: occ > 1 ? [`${fileRec.path}:${line}`] : [],
        logOnlyReads: [],
        passedToCalls: [],
        transformations: [],
        destinations: [],
        intendedConsumer: null,
        actualConsumer: null,
        relatedFunctions: [],
        relatedFeatures: [],
        lifecycleStage: stage,
        confidence: RelationshipConfidence.INFERRED,
      };
      variables.push(v);
      if (stage === VariableLifecycleStage.UNRESOLVED) {
        diagnostics.push({
          analyzerId: 'apidacs-python',
          analyzerVersion: '1.0.0',
          ruleId: 'UNUSED_VARIABLE_DECLARATION',
          category: 'data-flow',
          message: `Python variable "${varName}" has no observed subsequent references in "${fileRec.path}".`,
          filePath: fileRec.path,
          symbol: varName,
          line,
          column: 0,
          severity: Severity.LOW,
          blocking: false,
          fingerprint: stableId('fp', projectId, 'PY_UNUSED', fileRec.path, varName),
          structuralKey: `${fileRec.path}::py::${varName}`,
          payload: {},
          relatedElementId: v.id,
        });
      }
    }
  });
}
