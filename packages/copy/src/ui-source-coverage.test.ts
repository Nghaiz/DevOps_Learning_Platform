import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { MESSAGES } from './registry.ts';
import { VIET_LETTER } from './scan.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DIRECTORIES = [
  'apps/web/src/components/author',
  'apps/web/src/app/author',
  'apps/web/src/components/catalog',
  'apps/web/src/app/quiz',
  'apps/web/src/app/(session)/problems',
];
const UI_PROPERTY =
  /^(?:label|hint|placeholder|title|description|alt|aria-label|emptyLabel|loadingLabel|markdownLabel)$/;

function collect(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return collect(file);
    return /\.tsx?$/.test(file) && !/\.(?:test|spec)\.tsx?$/.test(file) ? [file] : [];
  });
}

/** AST distinguishes JSX from generic arrows and decodes escaped string literals. */
function uiLiterals(source: string, file: string): string[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const found: string[] = [];

  function uiContext(node: ts.Node): boolean {
    const parent = node.parent;
    if (ts.isJsxAttribute(parent)) return UI_PROPERTY.test(parent.name.getText(tree));
    if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
      // TrialStepPlan.label is the server's stable script identifier; description is UI copy.
      if (
        parent.name.getText(tree) === 'label' &&
        ts.isObjectLiteralExpression(parent.parent) &&
        parent.parent.properties.some(
          (field) => ts.isPropertyAssignment(field) && field.name.getText(tree) === 'mustPass',
        )
      )
        return false;
      return UI_PROPERTY.test(parent.name.getText(tree));
    }
    if (ts.isJsxExpression(parent)) {
      return ts.isJsxElement(parent.parent) || ts.isJsxFragment(parent.parent) || uiContext(parent);
    }
    if (ts.isConditionalExpression(parent) && parent.condition !== node) return uiContext(parent);
    if (ts.isParenthesizedExpression(parent)) return uiContext(parent);
    return false;
  }

  function visit(node: ts.Node): void {
    let text: string | undefined;
    if (ts.isJsxText(node) && /[a-zÀ-ỹ]/i.test(node.text)) text = node.text;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const parent = node.parent;
      const isDataKey =
        (ts.isPropertyAssignment(parent) && parent.name === node) || ts.isLiteralTypeNode(parent);
      if (
        !isDataKey &&
        node.text.trim() !== '' &&
        !(node.text in MESSAGES) &&
        (VIET_LETTER.test(node.text) || (/[a-zÀ-ỹ]/i.test(node.text) && uiContext(node)))
      )
        text = node.text;
    }
    if (ts.isTemplateExpression(node)) {
      const literalText =
        node.head.text + node.templateSpans.map((span) => span.literal.text).join('');
      if (VIET_LETTER.test(literalText) || (/[a-zÀ-ỹ]/i.test(literalText) && uiContext(node)))
        text = node.getText(tree);
    }
    if (text !== undefined) {
      const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
      found.push(`${line}: ${text.replace(/\s+/g, ' ').trim()}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return found;
}

const FILES = DIRECTORIES.flatMap((directory) => collect(join(ROOT, directory)));
const FIXTURE = 'problem-test-fixture.ts';

describe('P16 copy coverage across author, catalog, quiz and problem routes', () => {
  it('covers every directory and a nonempty source inventory', () => {
    expect(FILES.length).toBeGreaterThan(70);
    for (const directory of DIRECTORIES) {
      expect(FILES.some((file) => file.startsWith(join(ROOT, directory)))).toBe(true);
    }
  });

  it('has no deferred product files or unmapped UI text', () => {
    const violations = FILES.filter((file) => !file.endsWith(FIXTURE)).flatMap((file) =>
      uiLiterals(readFileSync(file, 'utf8'), file).map(
        (issue) => `${relative(ROOT, file)}:${issue}`,
      ),
    );
    expect(violations).toEqual([]);
  });

  it('keeps test lesson data out of product imports', () => {
    expect(FILES.filter((file) => file.endsWith(FIXTURE))).toHaveLength(1);
    for (const file of FILES.filter((candidate) => !candidate.endsWith(FIXTURE))) {
      const tree = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      for (const statement of tree.statements) {
        if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
          expect(statement.moduleSpecifier.text, file).not.toContain('problem-test-fixture');
        }
      }
    }
  });

  it('catches Vietnamese, English labels, templates and escaped literals', () => {
    expect(uiLiterals('const a = "Chưa có bài";', 'a.ts')).toHaveLength(1);
    expect(uiLiterals('const a = <button>Retry</button>;', 'a.tsx')).toHaveLength(1);
    expect(uiLiterals('const a = <input aria-label="Close" />;', 'a.tsx')).toHaveLength(1);
    expect(uiLiterals('const a = "Ch\\u01b0a";', 'a.ts')).toHaveLength(1);
    expect(uiLiterals('const a = <div>{ready ? "Ready" : "Waiting"}</div>;', 'a.tsx')).toHaveLength(
      2,
    );
    expect(uiLiterals('const a = `Chưa có ${n} bài`;', 'a.ts')).toHaveLength(1);
  });

  it('accepts technical data, empty values, comments, generics and mapped labels', () => {
    expect(uiLiterals('const f = () => [] as Array<string>; // Chưa có bài', 'a.ts')).toEqual([]);
    expect(uiLiterals('const item = { kind: "Node", title: "" };', 'a.ts')).toEqual([]);
    expect(
      uiLiterals('const a = <div className="flex gap-2">{t("common.action.save")}</div>;', 'a.tsx'),
    ).toEqual([]);
    expect(
      uiLiterals(
        'const a = <div>{kind === "lesson" ? t("common.action.save") : name}</div>;',
        'a.tsx',
      ),
    ).toEqual([]);
    expect(
      uiLiterals(
        'const step = { label: `${id}.verifyScript`, mustPass: true, description: t("common.action.save") };',
        'a.ts',
      ),
    ).toEqual([]);
    expect(
      uiLiterals(
        'const step = { label: `${id}.verifyScript`, mustPass: true, description: "Verify this step" };',
        'a.ts',
      ),
    ).toHaveLength(1);
  });

  it('keeps the games label API connected to mapped copy', () => {
    const file = join(ROOT, 'packages/games/src/k8s/problem.ts');
    const source = readFileSync(file, 'utf8');
    expect(uiLiterals(source, file)).toEqual([]);
    expect(source.match(/t\('problem\.topic\./g)).toHaveLength(9);
    expect(source.match(/t\('problem\.difficulty\./g)).toHaveLength(4);
  });
});
