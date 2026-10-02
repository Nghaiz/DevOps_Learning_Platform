/**
 * Một lượt smoke cho MỘT nội dung: nạp → xin khe → dựng pod → chờ dockerd (+ cụm
 * con) → terminal → chạy → báo cáo → xoá pod. Pod luôn bị xoá — cả khi Ctrl-C hay
 * harness chết — trừ khi `--keep`.
 */
import path from 'node:path';
import { Recorder } from './checks.mjs';
import { buildPod, createPod, deletePodSync, newPodName, resolveProfile, waitPodReady } from './cluster.mjs';
import { execScript, NS, CONTAINER } from './kube.mjs';
import { runLab } from './lab.mjs';
import { runLesson } from './lesson.mjs';
import { loadLab, loadScenario, profileForLab, profileForScenario } from './product.mjs';
import { acquireSlot } from './semaphore.mjs';
import { Terminal } from './terminal.mjs';

const POD_READY_TIMEOUT_MS = 240_000;

// ---------------------------------------------------------------- dọn dẹp

const live = new Map();
let handlersInstalled = false;

function cleanupAll() {
  for (const [pod, entry] of live) {
    if (!entry.keep) deletePodSync(pod);
    entry.release();
  }
  live.clear();
}

function installHandlers() {
  if (handlersInstalled) return;
  handlersInstalled = true;
  process.on('exit', cleanupAll);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    process.on(sig, () => {
      console.error(`\n${sig}: đang xoá pod smoke…`);
      cleanupAll();
      process.exit(130);
    });
  }
  process.on('uncaughtException', (e) => {
    console.error(e);
    cleanupAll();
    process.exit(2);
  });
}

// ---------------------------------------------------------------- một lượt

export async function smokeOne({ kind, id, opts, liveConfig, log }) {
  const started = Date.now();
  const rec = new Recorder();
  const dir = path.join(opts.contentRoot, kind === 'lesson' ? 'scenarios' : 'labs', id);
  const result = {
    kind,
    id,
    title: null,
    contentDir: dir,
    image: opts.image ?? liveConfig.image,
    profile: null,
    pod: null,
    startedAt: new Date(started).toISOString(),
    durationMs: 0,
    verdict: 'pass',
    deviations: rec.deviations,
    warnings: rec.warnings,
    infra: {},
    units: [],
    final: [],
  };

  let content;
  try {
    content = kind === 'lesson' ? await loadScenario(dir) : await loadLab(dir);
  } catch (e) {
    rec.deviate('load', 'load-error', e.message);
    return finish(result, rec, started);
  }
  result.title = content.title;
  result.profile = kind === 'lesson' ? profileForScenario(content) : profileForLab(content);
  const profile = resolveProfile(liveConfig, result.profile);

  installHandlers();
  const release = await acquireSlot(opts.maxPods, `${kind}:${id}`, (max) =>
    log(`… chờ khe pod (trần ${max} pod smoke cùng lúc trên máy này)`),
  );
  const pod = newPodName(kind, id);
  result.pod = pod;
  live.set(pod, { keep: opts.keep, release });
  const t = (from) => Date.now() - from;

  try {
    let mark = Date.now();
    await createPod(buildPod(pod, { live: liveConfig, image: result.image, profile: result.profile, contentId: id }));
    await waitPodReady(pod, POD_READY_TIMEOUT_MS);
    result.infra.podReadyMs = t(mark);
    log(`pod ${pod} Ready sau ${(result.infra.podReadyMs / 1000).toFixed(1)}s (profile "${result.profile}")`);

    mark = Date.now();
    const docker = await execScript(
      pod,
      'command -v docker >/dev/null || exit 0; for i in $(seq 1 120); do docker info >/dev/null 2>&1 && exit 0; sleep 1; done; echo "dockerd không lên sau 120s"; exit 1',
      { timeoutMs: 150_000 },
    );
    result.infra.dockerReadyMs = t(mark);
    if (docker.exitCode !== 0) throw new Error(`dockerd: ${docker.infraError ?? docker.output.trim()}`);

    if (profile.env.DLP_K8S === '1') {
      mark = Date.now();
      const k8s = await execScript(pod, 'dlp-k8s-wait 300', { timeoutMs: 330_000 });
      result.infra.k8sReadyMs = t(mark);
      if (k8s.exitCode !== 0) throw new Error(`dlp-k8s-wait exit ${k8s.exitCode}: ${k8s.infraError ?? k8s.output.trim()}`);
      log(`cụm k8s con sẵn sàng sau ${(result.infra.k8sReadyMs / 1000).toFixed(1)}s`);
    }

    mark = Date.now();
    const term = new Terminal(pod);
    await term.start();
    result.infra.terminalMs = t(mark);

    const ctx = { pod, dir, rec, term, log, opts };
    const out = kind === 'lesson' ? await runLesson(ctx, content) : await runLab(ctx, content);
    result.units = out.units;
    result.final = out.final;
    if (opts.keep) {
      result.infra.attach = term.attachCommand();
    }
  } catch (e) {
    rec.deviate('pod', e.message.startsWith('terminal:') ? 'terminal-error' : 'pod-error', e.message);
  } finally {
    const load = await execScript(pod, 'cat /proc/loadavg', { timeoutMs: 15_000 }).catch(() => null);
    result.infra.loadavg = load?.exitCode === 0 ? load.output.trim() : null;
    if (opts.keep) {
      result.infra.exec = `kubectl exec -it -n ${NS} ${pod} -c ${CONTAINER} -- zsh`;
      log(`--keep: pod giữ lại.\n  ${result.infra.attach ?? ''}\n  ${result.infra.exec}\n  xoá: kubectl delete pod -n ${NS} ${pod}`);
    } else {
      deletePodSync(pod);
    }
    release();
    live.delete(pod);
  }
  return finish(result, rec, started);
}

function finish(result, rec, started) {
  result.durationMs = Date.now() - started;
  result.verdict = rec.verdict();
  return result;
}
