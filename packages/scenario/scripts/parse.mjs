#!/usr/bin/env node
/**
 * In DTO của một scenario — verify command của phase-2 §2.A:
 *
 *   node packages/scenario/scripts/parse.mjs content/scenarios/ckad-configmap-as-files
 *   node packages/scenario/scripts/parse.mjs content/scenarios/... --json
 *
 * Mặc định in bản tóm tắt cho người đọc; `--json` in DTO đầy đủ cho máy.
 *
 * Chạy qua `tsx` vì package là source-only (.ts, noEmit) — xem package.json.
 */
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const target = args.find((arg) => !arg.startsWith('--'));

if (target === undefined) {
  console.error('dùng: node packages/scenario/scripts/parse.mjs <thư-mục-scenario> [--json]');
  process.exit(2);
}

const { loadScenario, parseContentBlocks } = await import(
  pathToFileURL(path.resolve(import.meta.dirname, '..', 'src', 'index.ts')).href
);

let scenario;
try {
  scenario = await loadScenario(path.resolve(target));
} catch (error) {
  // Thông báo lỗi CHÍNH LÀ sản phẩm ở đây (AC: "báo lỗi rõ nếu format sai"), nên
  // in nguyên văn thay vì stack trace của Node.
  console.error(`✗ ${error.message}`);
  process.exit(1);
}

if (asJson) {
  console.log(JSON.stringify(scenario, null, 2));
  process.exit(0);
}

const line = (label, value) => console.log(`${label.padEnd(18)} ${value}`);

line('id', scenario.id);
line('title', scenario.title);
line(
  'difficulty',
  `${scenario.difficulty}${scenario.estimatedMinutes ? ` (~${scenario.estimatedMinutes} phút)` : ''}`,
);
line('tier / imageid', `${scenario.tier} ← ${scenario.backendImageId}`);
line('capabilities', scenario.capabilities.length ? scenario.capabilities.join(', ') : '(không)');
line(
  'license',
  scenario.source === null
    ? 'first-party (soạn tại repo này, không có upstream)'
    : `${scenario.source.license} — ${scenario.source.repo}@${scenario.source.commit.slice(0, 7)}`,
);
if (scenario.ignoredUpstreamFields.length > 0) {
  line('field bỏ qua', scenario.ignoredUpstreamFields.join(', '));
}
if (scenario.assets.length > 0) {
  line(
    'assets',
    `${scenario.assets.length} file → ${[...new Set(scenario.assets.map((a) => a.host))].join(', ')}`,
  );
}

for (const [name, phase] of [
  ['intro', scenario.intro],
  ['finish', scenario.finish],
]) {
  if (phase !== null) {
    line(name, describePhase(phase));
  }
}

console.log(`\nsteps (${scenario.steps.length}):`);
for (const step of scenario.steps) {
  console.log(`  [${step.index}] ${step.title ?? '(không tiêu đề)'}`);
  console.log(`      ${describePhase(step)}`);
}

function describePhase(phase) {
  const blocks = parseContentBlocks(phase.markdown);
  const actions = blocks.filter((block) => block.kind === 'code');
  const parts = [
    `${phase.markdown.length} ký tự md`,
    `${actions.length} khối hành động`,
    phase.verifyScript === null ? 'không verify' : `verify ${phase.verifyScript.length} ký tự`,
  ];
  if (phase.setup.foreground !== null) parts.push('foreground');
  if (phase.setup.background !== null) parts.push('background');
  return parts.join(' · ');
}
