/**
 * Bài học (Killercoda) — contracts.md §C3, theo đúng luồng sản phẩm:
 *
 *   setup phase (lesson-client.tsx: phase ĐẦU luôn chạy; phase khác chỉ khi có
 *   `background`) = `setupScriptPlan` công cụ → asset → background, đồng bộ
 *   (lessons.runSetup), rồi `foreground` gõ vào terminal
 *   → bước có verify: verify PHẢI trượt → các khối `{{exec}}` gõ vào tmux zsh
 *   → `stepN/solution.sh` nếu có → verify PHẢI đạt.
 *
 * Bước không verify vẫn chạy khối exec để bước sau có đúng trạng thái.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { clip, recordTyped, runVerify } from './checks.mjs';
import { execScript } from './kube.mjs';
import {
  buildAssetPushScript,
  buildToolsEnableScript,
  execBlocks,
  resolveScenarioAssets,
  setupScriptPlan,
} from './product.mjs';
import { SMOKE_DIR } from './terminal.mjs';

/** Gateway cắt mọi lượt exec one-shot ở 120s — setup đồng bộ của bài học chịu cùng trần. */
const SETUP_EXEC_TIMEOUT_MS = 120_000;

function phasesOf(scenario) {
  const list = [];
  if (scenario.intro !== null) list.push({ key: 'intro', title: scenario.intro.title ?? 'Giới thiệu', phase: scenario.intro, step: null });
  scenario.steps.forEach((phase, i) =>
    list.push({ key: `step${i + 1}`, title: phase.title ?? `Bước ${i + 1}`, phase, step: i + 1 }),
  );
  if (scenario.finish !== null) list.push({ key: 'finish', title: scenario.finish.title ?? 'Kết thúc', phase: scenario.finish, step: null });
  return list;
}

/** Trả `false` khi setup hỏng — các phase sau vô nghĩa. */
async function runPhaseSetup(ctx, scenario, p, isFirst, unit) {
  const { pod, dir, rec, term, log } = ctx;
  if (!isFirst && p.phase.setup.background === null) {
    if (p.phase.setup.foreground !== null) {
      rec.warn(p.key, 'foreground-skipped', 'phase có foreground nhưng không có background — lesson-client.tsx không gọi runSetup nên foreground KHÔNG BAO GIỜ được gõ');
    }
    return true;
  }
  const assets = isFirst ? await resolveScenarioAssets(dir, scenario.assets) : [];
  const plan = setupScriptPlan({
    tools: isFirst ? buildToolsEnableScript(scenario.toolset) : null,
    assets: buildAssetPushScript(assets),
    background: p.phase.setup.background,
  });
  for (const step of plan) {
    const r = await execScript(pod, step.script, { timeoutMs: SETUP_EXEC_TIMEOUT_MS });
    unit.setup.push({ kind: step.kind, exitCode: r.exitCode, durationMs: r.durationMs, output: clip(r.output) });
    log(`  setup ${step.kind}: exit ${r.exitCode ?? r.infraError} (${(r.durationMs / 1000).toFixed(1)}s)`);
    if (r.exitCode !== 0) {
      if (r.infraError !== null) rec.deviate(p.key, 'exec-infra', `setup ${step.kind}: ${r.infraError}`);
      else rec.deviate(p.key, 'setup-failed', step.failureMessage({ exitCode: r.exitCode, output: r.output }));
      return false;
    }
  }
  if (p.phase.setup.foreground !== null) {
    const res = await term.type(p.phase.setup.foreground, { timeoutS: ctx.opts.timeout });
    unit.actions.push(recordTyped(rec, p.key, 'foreground', p.phase.setup.foreground, res));
  }
  return true;
}

export async function runLesson(ctx, scenario) {
  const { pod, dir, rec, term, log, opts } = ctx;
  const units = [];
  const phases = phasesOf(scenario);
  for (const [k, p] of phases.entries()) {
    if (opts.onlyStep !== null && (p.step === null ? p.key === 'finish' : p.step > opts.onlyStep)) break;
    const detailed = opts.onlyStep === null || p.step === opts.onlyStep;
    const unit = { key: p.key, title: p.title, setup: [], pre: null, actions: [], post: null, detailed };
    units.push(unit);
    log(`[${p.key}] ${p.title}${detailed ? '' : ' (chỉ dựng trạng thái)'}`);

    if (!(await runPhaseSetup(ctx, scenario, p, k === 0, unit))) break;

    const blocks = execBlocks(p.phase.markdown);
    const solutionPath = p.step === null ? null : path.join(dir, `step${p.step}`, 'solution.sh');
    const solution = solutionPath !== null && existsSync(solutionPath) ? readFileSync(solutionPath, 'utf8') : null;
    const verify = detailed ? p.phase.verifyScript : null;
    const hasAction = blocks.length > 0 || solution !== null;

    if (verify !== null && p.step !== null) {
      if (!hasAction) {
        rec.deviate(p.key, 'no-action', 'bước có verify nhưng không có khối {{exec}} lẫn stepN/solution.sh — harness không làm được bước này (§C2)');
      } else {
        unit.pre = await runVerify(pod, verify, { expect: 'fail', where: p.key, rec });
        log(`  verify trước: exit ${unit.pre.exitCode ?? unit.pre.infraError} (${unit.pre.durationMs}ms)${unit.pre.ok ? '' : '  ⚠'}`);
      }
    }

    for (const b of blocks) {
      const res = await term.type(b.code, { interrupt: b.interrupt, timeoutS: opts.timeout });
      unit.actions.push(recordTyped(rec, p.key, b.interrupt ? 'exec-interrupt' : 'exec', b.code, res));
      log(`  exec «${b.code.split('\n')[0].slice(0, 70)}» rc=${res.timedOut ? 'TREO' : res.rc} (${(res.durationMs / 1000).toFixed(1)}s)`);
    }
    if (solution !== null) {
      const target = `${SMOKE_DIR}/solutions/${p.key}.sh`;
      await term.writeFile(target, solution);
      const res = await term.type(`bash ${target}`, { timeoutS: opts.timeout });
      unit.actions.push(recordTyped(rec, p.key, 'solution', solution, res, { solution: true }));
      log(`  solution.sh rc=${res.timedOut ? 'TREO' : res.rc} (${(res.durationMs / 1000).toFixed(1)}s)`);
    }

    if (verify !== null && (hasAction || p.step === null)) {
      unit.post = await runVerify(pod, verify, { expect: 'pass', where: p.key, rec });
      log(`  verify sau:   exit ${unit.post.exitCode ?? unit.post.infraError} (${unit.post.durationMs}ms)${unit.post.ok ? '' : '  ⚠'}`);
    }
  }
  return { units, final: [] };
}
