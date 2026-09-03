#!/usr/bin/env node
/**
 * 6.A — đo RAM/CPU/thời-gian-phục-vụ của hai ứng viên IDE, cộng một pod đối chứng.
 *
 * Chạy TỪ MÁY DEV; mọi lệnh cụm đi qua ssh (cùng khuôn với harness 3.I).
 *
 * ⛔ Đo ở cgroup TRÊN HOST, không đo trong pod. Sysbox biên tập /proc và
 * /sys/fs/cgroup mà `kubectl exec` nhìn thấy, nên số đọc bên trong không phải
 * số kernel đang áp.
 *
 * ⛔ workingSet = memory.current − inactive_file, KHÔNG phải memory.current.
 * `memory.current` gộp page cache; đặt `requests` theo nó là giữ chỗ cho thứ
 * sắp bốc hơi khi kernel cần. Đây cũng đúng công thức kubelet dùng, nên số này
 * so được với 163Mi đã ghi ở P3.
 *
 * Dùng:
 *   node measure.mjs up                  # dựng pod, chờ Running
 *   node measure.mjs sample <nhãn>       # chụp một lượt cgroup của cả ba pod
 *   node measure.mjs start-ide           # bật IDE trong hai pod ứng viên, đo TTFB
 *   node measure.mjs seed-workspace      # tạo repo ~50 file trong cả ba pod
 *   node measure.mjs listen              # `ss -ltn` trong từng pod (AC 6.C task 8)
 *   node measure.mjs down                # xoá namespace
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const VM = process.env.VM_SSH ?? 'nghaiz@192.168.94.130';
const NS = 'dlp-ide-measure';
const OUT = join(HERE, 'samples.jsonl');

/**
 * Cổng nghe của mỗi ứng viên. 127.0.0.1 CÓ CHỦ Ý — 6.C task 8 đòi IDE không
 * nghe 0.0.0.0, và đo đúng cấu hình sẽ chạy thật thì rẻ hơn đo rồi sửa.
 *
 * `--auth none` / không token: authz nằm ở gateway (6.C dùng lại chuỗi a→h/a→i),
 * không ở IDE. Một đường xác thực thứ hai bên trong IDE chính là thứ 6.C cấm.
 */
const IDE = {
  codeserver: {
    port: 4001,
    cmd: 'nohup /usr/local/bin/code-server --bind-addr 127.0.0.1:4001 --auth none --disable-telemetry --disable-update-check /root/workspace',
  },
  theia: {
    port: 4002,
    cmd: 'nohup /opt/theia/node/bin/node /opt/theia/applications/browser/lib/backend/main.js /root/workspace --hostname=127.0.0.1 --port=4002',
  },
};

const POD = {
  control: 'ide-measure-control',
  codeserver: 'ide-measure-codeserver',
  theia: 'ide-measure-theia',
};

function ssh(cmd, { timeout = 180_000, tolerant = false } = {}) {
  try {
    return execFileSync('ssh', ['-o', 'ConnectTimeout=8', VM, cmd], {
      encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024,
    });
  } catch (e) {
    if (tolerant) return String(e.stdout ?? '') + String(e.stderr ?? '');
    throw e;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mib = (n) => (Number.isFinite(n) ? +(n / 1024 / 1024).toFixed(1) : null);

/**
 * Đường cgroup của pod trên host — DÒ cả ba nhánh QoS thay vì gõ cứng.
 *
 * Gõ cứng `burstable` thì một thay đổi LimitRange làm mọi số ra `null` mà
 * không ai biết vì sao; dò thì sai lệch đó tự lộ ở nhánh cuối.
 */
function cgroupPaths(uid) {
  const u = uid.replaceAll('-', '_');
  return [
    `/sys/fs/cgroup/kubepods.slice/kubepods-burstable.slice/kubepods-burstable-pod${u}.slice`,
    `/sys/fs/cgroup/kubepods.slice/kubepods-besteffort.slice/kubepods-besteffort-pod${u}.slice`,
    `/sys/fs/cgroup/kubepods.slice/kubepods-pod${u}.slice`,
  ];
}

function podUids() {
  const out = ssh(
    `kubectl get pods -n ${NS} -o jsonpath='{range .items[*]}{.metadata.name}={.metadata.uid} {end}'`,
    { tolerant: true },
  );
  const m = new Map();
  for (const kv of out.trim().split(/\s+/).filter((s) => s.includes('='))) {
    const i = kv.indexOf('=');
    m.set(kv.slice(0, i), kv.slice(i + 1));
  }
  return m;
}

/**
 * Đọc theo NHÃN chứ không theo vị trí dòng: đọc theo vị trí là cách bản đầu của
 * harness 3.I ra `NaN` thay vì ra lỗi.
 */
function statsFor(uid) {
  for (const p of cgroupPaths(uid)) {
    const out = ssh(
      `if [ ! -d ${p} ]; then echo MISSING; exit 0; fi; ` +
        `for k in memory.current memory.peak memory.max; do printf '%s=%s\\n' "$k" "$(sudo cat ${p}/$k 2>/dev/null | head -1)"; done; ` +
        `printf 'inactive_file=%s\\n' "$(sudo awk '/^inactive_file /{print $2}' ${p}/memory.stat 2>/dev/null)"; ` +
        `printf 'usage_usec=%s\\n' "$(sudo awk '/^usage_usec/{print $2}' ${p}/cpu.stat 2>/dev/null)"; ` +
        `printf 'nr_throttled=%s\\n' "$(sudo awk '/^nr_throttled/{print $2}' ${p}/cpu.stat 2>/dev/null)"`,
      { tolerant: true },
    );
    if (out.includes('MISSING')) continue;
    const kv = new Map(
      out
        .trim()
        .split('\n')
        .filter((l) => l.includes('='))
        .map((l) => {
          const i = l.indexOf('=');
          return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
        }),
    );
    const current = Number(kv.get('memory.current'));
    if (!Number.isFinite(current) || current === 0) continue;
    const inactiveFile = Number(kv.get('inactive_file'));
    return {
      cgroup: p,
      currentMiB: mib(current),
      workingSetMiB: mib(current - (Number.isFinite(inactiveFile) ? inactiveFile : 0)),
      peakMiB: mib(Number(kv.get('memory.peak'))),
      usageUsec: Number(kv.get('usage_usec')),
      nrThrottled: Number(kv.get('nr_throttled')),
    };
  }
  return null;
}

function sample(label) {
  const uids = podUids();
  const row = { label, at: new Date().toISOString(), pods: {} };
  for (const [variant, name] of Object.entries(POD)) {
    const uid = uids.get(name);
    row.pods[variant] = uid ? statsFor(uid) : null;
  }
  appendFileSync(OUT, JSON.stringify(row) + '\n');
  console.log(`-- ${label}`);
  for (const [v, s] of Object.entries(row.pods)) {
    console.log(
      s
        ? `   ${v.padEnd(11)} workingSet=${String(s.workingSetMiB).padStart(7)}Mi  current=${String(s.currentMiB).padStart(7)}Mi  peak=${String(s.peakMiB).padStart(7)}Mi  cpu=${(s.usageUsec / 1e6).toFixed(1)}s`
        : `   ${v.padEnd(11)} — không đọc được cgroup`,
    );
  }
  return row;
}

async function waitRunning(timeoutMs = 420_000) {
  const t0 = Date.now();
  for (;;) {
    const out = ssh(
      `kubectl get pods -n ${NS} -o jsonpath='{range .items[*]}{.metadata.name}={.status.phase} {end}'`,
      { tolerant: true },
    );
    const rows = out.trim().split(/\s+/).filter((s) => s.includes('='));
    console.log(`   ${rows.join('  ') || '(chưa có pod)'}`);
    if (rows.length === 3 && rows.every((r) => r.endsWith('=Running'))) return;
    if (Date.now() - t0 > timeoutMs) {
      console.log(ssh(`kubectl get pods -n ${NS} -o wide; kubectl describe pods -n ${NS} | tail -40`, { tolerant: true }));
      throw new Error(`pod không Running sau ${timeoutMs}ms`);
    }
    await sleep(5000);
  }
}

/**
 * Bật IDE và đo thời gian tới lúc phục vụ được HTTP.
 *
 * Probe chạy TRONG pod (`curl` tới 127.0.0.1) vì IDE cố ý chỉ nghe loopback.
 * Đây là ngoại lệ CÓ LÝ DO của luật "đo từ ngoài hệ đang đo": thứ đang đo là
 * ĐỘ TRỄ ỨNG DỤNG, không phải giới hạn tài nguyên — và không có đường nào khác
 * chạm tới một cổng loopback. Mọi số RAM/CPU vẫn đọc ở cgroup host.
 */
async function startIde() {
  const res = {};
  for (const variant of ['codeserver', 'theia']) {
    const { port, cmd } = IDE[variant];
    const pod = POD[variant];
    ssh(`kubectl exec -n ${NS} ${pod} -- sh -c ${JSON.stringify(cmd + ' > /tmp/ide.log 2>&1 &')}`, {
      tolerant: true,
    });
    const t0 = Date.now();
    let code = '000';
    for (let i = 0; i < 300; i++) {
      const probe = `curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:${port}/ || true`;
      code = ssh(`kubectl exec -n ${NS} ${pod} -- sh -c ${JSON.stringify(probe)}`, { tolerant: true })
        .trim()
        .slice(-3);
      if (/^[23]/.test(code)) break;
      await sleep(1000);
    }
    const ms = Date.now() - t0;
    res[variant] = { httpCode: code, timeToServeMs: /^[23]/.test(code) ? ms : null };
    console.log(`   ${variant}: HTTP ${code} sau ${ms}ms`);
    if (!/^[23]/.test(code)) {
      console.log(ssh(`kubectl exec -n ${NS} ${pod} -- tail -40 /tmp/ide.log`, { tolerant: true }));
    }
  }
  writeFileSync(join(HERE, 'time-to-serve.json'), JSON.stringify(res, null, 2) + '\n');
  return res;
}

/**
 * Chạy một script shell CỦA THƯ MỤC NÀY bên trong pod, qua stdin.
 *
 * ⛔ KHÔNG nhồi script vào `sh -c "<một dòng dài>"`. Bản đầu làm thế và chết với
 * `sh: 2: Syntax error: word unexpected` — shell trong pod là **dash**, không
 * phải bash, và một chuỗi đã qua hai tầng thoát (JSON → argv → sh) thì không
 * còn đọc được để sửa. Tệ hơn: exit code 2 của nó in ra chỗ đáng lẽ in số file,
 * nên dòng log đọc như "đã tạo (lỗi) file" thay vì như một lỗi.
 *
 * Qua stdin thì script giữ nguyên xuống dòng, sửa được bằng mắt, và chạy được
 * y hệt khi gọi tay.
 */
function execScript(pod, file) {
  const local = join(HERE, file);
  ssh(`cat > /tmp/${file} <<'DLPSH'\n${readFileSync(local, 'utf8')}\nDLPSH`, { tolerant: true });
  return ssh(`kubectl exec -i -n ${NS} ${pod} -- sh -s < /tmp/${file}`, { tolerant: true });
}

/**
 * Repo ~50 file trong CẢ BA pod — kể cả đối chứng, để phần tăng do file nằm
 * trên đĩa không bị tính nhầm vào cột IDE.
 */
function seedWorkspace() {
  for (const [variant, pod] of Object.entries(POD)) {
    const out = execScript(pod, 'seed-workspace.sh').trim().split('\n');
    console.log(`   ${variant}: ${out.join(' / ')}`);
  }
}

/**
 * Socket đang LISTEN trong từng pod — bằng chứng cho AC "IDE không nghe 0.0.0.0".
 *
 * ⚠ Đọc `/proc/net/tcp` chứ không `ss`: sandbox-base KHÔNG có `iproute2` lẫn
 * `net-tools` (đo 2026-09-03 — cả `ss` lẫn `netstat` đều MISSING). Lệnh verify
 * `kubectl exec $POD -- ss -ltn` mà phase-6 ghi sẽ ĐỎ vì thiếu binary, chứ
 * không vì có cổng mở — đúng loại "lỗi công cụ đọc ra thành lỗi hệ thống".
 * 6.B phải chọn: thêm `iproute2` vào image, hoặc sửa lệnh verify sang đường này.
 */
function listen() {
  for (const [variant, pod] of Object.entries(POD)) {
    console.log(`-- ${variant}\n${execScript(pod, 'listen.sh').trim()}`);
  }
}

const cmd = process.argv[2];
if (cmd === 'up') {
  const yaml = readFileSync(join(HERE, 'pods.yaml'), 'utf8');
  console.log(ssh(`kubectl apply -f - <<'DLPYAML'\n${yaml}\nDLPYAML`, { tolerant: true }));
  await waitRunning();
  console.log('   ba pod Running');
} else if (cmd === 'sample') {
  sample(process.argv[3] ?? 'unnamed');
} else if (cmd === 'start-ide') {
  await startIde();
} else if (cmd === 'seed-workspace') {
  seedWorkspace();
} else if (cmd === 'listen') {
  listen();
} else if (cmd === 'down') {
  console.log(ssh(`kubectl delete ns ${NS} --wait=false`, { tolerant: true }));
} else {
  console.error('dùng: up | sample <nhãn> | start-ide | seed-workspace | listen | down');
  process.exit(2);
}
