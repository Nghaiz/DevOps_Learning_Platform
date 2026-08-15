#!/usr/bin/env python3
# ─────────────────────────────────────────────────────────────────────────────
# sandbox_load_probe.py — đo tải THẬT của pod sandbox ở cgroup TRÊN HOST (P3/3.I mắt 3).
#
# Chạy TRÊN VM (cần đọc /sys/fs/cgroup và gọi kubectl). Không cần sudo: file
# cgroup của kubepods.slice đọc được bằng user thường trên cụm này (đã đo).
#
# ⛔ VÌ SAO KHÔNG ĐO TRONG POD. Sysbox biên tập thứ `kubectl exec` nhìn thấy —
# `free`, `/proc/meminfo`, `nproc` trong sandbox phản ánh cái Sysbox dựng ra chứ
# không phản ánh cgroup mà kubelet thật sự áp. Mọi con số ở đây vì thế đọc thẳng
# từ cgroup slice của pod trên host, đúng chỗ quota và LimitRange có hiệu lực.
#
# ⛔ BẪY CHÍNH CỦA CHẶNG NÀY — "ĐỈNH CPU" ĐO DƯỚI MỘT TRẦN CỨNG LÀ MỘT SÀN.
# `cpu.max` của pod sandbox là `100000 100000` = **1.0 core, trần cứng**. Một
# tiến trình muốn 4 core sẽ bị CFS throttle xuống đúng 1.0 và cgroup báo "đỉnh
# 1.0 core" — CÙNG một con số với một tiến trình chỉ muốn 1.0 core. Hai giả
# thuyết, một kết quả ⇒ phép đo mù, đúng hạng lỗi mà AC-A1 và §I5.0.2 đã bác.
#
# Script vì thế BẮT BUỘC đọc `nr_throttled`/`throttled_usec` cùng lúc, và khi
# đỉnh chạm trần kèm throttle > 0 nó in cảnh báo rằng con số là SÀN, không phải
# nhu cầu. Muốn biết nhu cầu THẬT thì phải nới `cpu.max` rồi đo lại — đó là việc
# của người gọi, script chỉ có trách nhiệm không để con số bị đọc nhầm.
#
# ⛔ "ĐỈNH" KHÔNG CÓ NGHĨA NẾU KHÔNG KHAI CỬA SỔ TRUNG BÌNH HOÁ.
# cgroup v2 KHÔNG có `cpu.peak` — chỉ có `usage_usec` cộng dồn. Mọi "đỉnh CPU"
# vì thế là Δusage/Δt trên một cửa sổ, và giá trị PHỤ THUỘC cửa sổ: cùng một tải
# cho 1.00 core ở cửa sổ 200ms và 0.42 core ở cửa sổ 60s. Một report ghi "đỉnh
# 1.0 core" mà không khai cửa sổ là ghi một con số không tái lập được. Script
# lấy mẫu mịn rồi tính đỉnh ở NHIỀU cửa sổ, và bắt người đọc nhìn cả dải.
#
# ⛔ RAM: `memory.peak` (kernel giữ) KHÁC max của mẫu `memory.current`.
# Lấy mẫu 200ms bỏ lọt spike ngắn hơn 200ms; kernel thì không bỏ lọt gì. Script
# báo CẢ HAI — nếu `memory.peak` > max mẫu thì chính khoảng cách đó là bằng
# chứng cho việc lấy mẫu bỏ lọt, và số dùng để đặt `requests` phải là số kernel.
#
# ⛔ VÀ `memory.current` KHÔNG PHẢI "RAM ỨNG DỤNG CẦN" — nó gộp cả PAGE CACHE.
# Đây là bẫy quyết định của mắt 4. `docker pull` + `docker build` ghi hàng trăm MB
# layer xuống overlay của sandbox, và mọi byte ấy vào page cache, bị TÍNH vào
# `memory.current` của cgroup. Nhưng page cache là bộ nhớ **thu hồi được**: khi
# node chịu áp lực, kernel bỏ nó đi mà tiến trình không chết. Phần **không** thu
# hồi được là `anon` (heap/stack thật).
#
# Đặt `requests` theo `memory.current` đỉnh là đặt theo một con số phần lớn có
# thể bốc hơi — nó thổi phồng nhu cầu và ép trần đồng thời xuống thấp giả tạo.
# Script vì thế tách `anon` / `file` từ `memory.stat` và báo đỉnh của TỪNG phần.
# Con số vào mắt 4 là `anon` đỉnh (sàn cứng) và `current` đỉnh (trần mềm) — khoảng
# cách giữa hai số ấy CHÍNH LÀ dư địa, và nó phải hiện ra chứ không được gộp.
#
# Dùng:
#   python3 sandbox_load_probe.py --duration 600 --interval-ms 200 --out /tmp/p.json
#   python3 sandbox_load_probe.py --duration 900 --label app=sandbox --out /tmp/p.json
#
# Thoát 0 kể cả khi không thấy pod nào (nó là công cụ ĐO, không phải cổng gác) —
# nhưng in rõ "0 pod" để một report không thể đọc im lặng ra thành "tải bằng 0".
# ─────────────────────────────────────────────────────────────────────────────
import argparse
import json
import os
import subprocess
import sys
import time

CGROUP_ROOT = '/sys/fs/cgroup/kubepods.slice'


def kubectl(args):
    p = subprocess.run(['kubectl'] + args, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f'kubectl {" ".join(args)} → rc={p.returncode}: {p.stderr.strip()}')
    return p.stdout


def liet_ke_pod(ns, label):
    """Trả [(ten, uid)] cho pod đang Running. Bỏ pod pha terminal và pod đang xoá:
    một pod Succeeded/Terminating không còn tiêu tài nguyên nhưng cgroup của nó
    có thể còn nán lại vài chục giây và sẽ kéo mọi trung bình xuống."""
    out = kubectl(['get', 'pods', '-n', ns, '-l', label, '-o', 'json'])
    ra = []
    for it in json.loads(out).get('items', []):
        md, st = it['metadata'], it.get('status', {})
        if md.get('deletionTimestamp'):
            continue
        if st.get('phase') != 'Running':
            continue
        ra.append((md['name'], md['uid']))
    return ra


def duong_cgroup(uid):
    """Quét tìm slice theo uid. KHÔNG hardcode lớp QoS: pod sandbox hôm nay là
    Burstable (requests < limits), nhưng mắt 4 có thể đặt requests == limits và
    nó nhảy sang Guaranteed — lúc đó một đường dẫn ghim cứng sẽ "không thấy pod
    nào" trong im lặng, tức phép đo tự tắt mà không ai biết."""
    slug = 'pod' + uid.replace('-', '_')
    for dp, dns, _ in os.walk(CGROUP_ROOT):
        for d in dns:
            if slug in d:
                return os.path.join(dp, d)
    return None


def doc_so(path):
    try:
        with open(path) as f:
            return int(f.read().strip())
    except (OSError, ValueError):
        return None


def doc_cpu_stat(cg):
    ra = {}
    try:
        with open(os.path.join(cg, 'cpu.stat')) as f:
            for dong in f:
                k, _, v = dong.partition(' ')
                try:
                    ra[k] = int(v)
                except ValueError:
                    pass
    except OSError:
        pass
    return ra


def doc_memory_stat(cg):
    """→ dict memory.stat. Quan tâm `anon` (KHÔNG thu hồi được — đây mới là nhu
    cầu thật) và `file` (page cache — kernel bỏ đi được khi thiếu RAM)."""
    ra = {}
    try:
        with open(os.path.join(cg, 'memory.stat')) as f:
            for dong in f:
                k, _, v = dong.partition(' ')
                try:
                    ra[k] = int(v)
                except ValueError:
                    pass
    except OSError:
        pass
    return ra


def doc_cpu_max(cg):
    """→ (tran_core hoặc None nếu 'max', chu_ky_us)."""
    try:
        with open(os.path.join(cg, 'cpu.max')) as f:
            quota, chu_ky = f.read().split()
        chu_ky = int(chu_ky)
        return (None if quota == 'max' else int(quota) / chu_ky), chu_ky
    except (OSError, ValueError):
        return None, None


def dinh_theo_cua_so(mau, cua_so_s):
    """Đỉnh core trên cửa sổ trượt `cua_so_s`, tính từ chuỗi mẫu (t, usage_usec).

    Hai con trỏ trên chuỗi cộng dồn: (usage[j]-usage[i]) / (t[j]-t[i]), với
    (t[j]-t[i]) là cửa sổ NHỎ NHẤT còn ≥ cua_so_s. Lấy cửa sổ nhỏ-nhất-đủ-lớn
    thay vì cửa sổ đầu tiên vượt qua, để không pha loãng đỉnh bằng thời gian thừa."""
    if len(mau) < 2:
        return None
    dinh, i = 0.0, 0
    for j in range(1, len(mau)):
        while i + 1 < j and mau[j][0] - mau[i + 1][0] >= cua_so_s:
            i += 1
        dt = mau[j][0] - mau[i][0]
        if dt < cua_so_s * 0.9:  # chưa đủ cửa sổ → chưa so sánh được
            continue
        dinh = max(dinh, (mau[j][1] - mau[i][1]) / 1e6 / dt)
    return dinh if dinh > 0 else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ns', default='dlp-sandbox')
    ap.add_argument('--label', default='app=sandbox')
    ap.add_argument('--interval-ms', type=int, default=200)
    ap.add_argument('--duration', type=float, default=600)
    ap.add_argument('--out', default='')
    ap.add_argument('--rescan-s', type=float, default=3.0,
                    help='chu kỳ quét pod mới — mắt 5 cần bắt pod sinh ra giữa lượt đo')
    args = ap.parse_args()

    buoc = args.interval_ms / 1000.0
    theo_doi = {}
    t0 = time.monotonic()
    lan_quet = -1e9

    print(f'── lấy mẫu {args.interval_ms}ms trong {args.duration:.0f}s '
          f'(ns={args.ns} label={args.label})', flush=True)

    while time.monotonic() - t0 < args.duration:
        bay_gio = time.monotonic()

        if bay_gio - lan_quet >= args.rescan_s:
            lan_quet = bay_gio
            try:
                for ten, uid in liet_ke_pod(args.ns, args.label):
                    if ten in theo_doi:
                        continue
                    cg = duong_cgroup(uid)
                    if not cg:
                        print(f'   ⚠ {ten}: không tìm được cgroup slice — bỏ qua', flush=True)
                        continue
                    tran, chu_ky = doc_cpu_max(cg)
                    mm = doc_so(os.path.join(cg, 'memory.max'))
                    theo_doi[ten] = {
                        'uid': uid, 'cg': cg, 'mau': [], 'mem': [], 'anon': [], 'file': [], 'ws': [],
                        'tran_cpu_core': tran, 'chu_ky_us': chu_ky, 'mem_max_byte': mm,
                        'throttle_dau': None, 'throttle_cuoi': None,
                        'mem_peak_cuoi': None, 't_thay': round(bay_gio - t0, 1),
                    }
                    print(f'   + bám {ten} (trần cpu={tran} core, '
                          f'mem.max={(mm or 0)/2**20:.0f}Mi) tại t={bay_gio-t0:.0f}s', flush=True)
            except RuntimeError as e:
                print(f'   ⚠ quét pod lỗi: {e}', flush=True)

        for st in theo_doi.values():
            cs = doc_cpu_stat(st['cg'])
            if 'usage_usec' not in cs:
                continue           # cgroup đã rụng (pod chết) — giữ mẫu cũ, thôi ghi
            t = time.monotonic() - t0
            st['mau'].append((t, cs['usage_usec']))
            mc = doc_so(os.path.join(st['cg'], 'memory.current'))
            if mc is not None:
                st['mem'].append((t, mc))
            ms = doc_memory_stat(st['cg'])
            if 'anon' in ms and mc is not None:
                st['anon'].append((t, ms['anon']))
                st['file'].append((t, ms.get('file', 0)))
                # workingSet của kubelet = memory.current − inactive_file. ĐÂY mới là
                # đại lượng mà eviction manager xếp hạng, và là con số đúng để so với
                # `requests.memory`. `current` gộp cả inactive_file (cache nguội, bỏ
                # được miễn phí) nên nó luôn cao hơn và sẽ đẩy `requests` lên quá tay.
                st['ws'].append((t, mc - ms.get('inactive_file', 0)))
            tt = (cs.get('nr_throttled', 0), cs.get('throttled_usec', 0), cs.get('nr_periods', 0))
            if st['throttle_dau'] is None:
                st['throttle_dau'] = tt
            st['throttle_cuoi'] = tt
            mp = doc_so(os.path.join(st['cg'], 'memory.peak'))
            if mp is not None:
                st['mem_peak_cuoi'] = mp

        time.sleep(max(0.0, buoc - ((time.monotonic() - t0) % buoc)))

    # ── tổng hợp ────────────────────────────────────────────────────────────
    CUA_SO = [0.2, 0.5, 1, 2, 5, 15, 60]
    bao_cao = {'ns': args.ns, 'label': args.label, 'interval_ms': args.interval_ms,
               'duration_s': args.duration, 'pods': {}}

    if not theo_doi:
        print('\n⚠ KHÔNG pod nào khớp trong suốt lượt đo — đây KHÔNG phải "tải bằng 0",')
        print('  mà là "không đo được gì". Đừng đọc lượt này thành một con số.')

    for ten, st in theo_doi.items():
        dinh = {f'{w}s': dinh_theo_cua_so(st['mau'], w) for w in CUA_SO}
        tb = None
        if len(st['mau']) >= 2:
            dt = st['mau'][-1][0] - st['mau'][0][0]
            if dt > 0:
                tb = (st['mau'][-1][1] - st['mau'][0][1]) / 1e6 / dt
        mem_mau_max = max((m for _, m in st['mem']), default=None)
        mem_peak = st['mem_peak_cuoi']
        anon_max = max((m for _, m in st['anon']), default=None)
        file_max = max((m for _, m in st['file']), default=None)
        ws_max = max((m for _, m in st['ws']), default=None)
        thr = None
        if st['throttle_dau'] and st['throttle_cuoi']:
            thr = {k: st['throttle_cuoi'][i] - st['throttle_dau'][i]
                   for i, k in enumerate(('nr_throttled', 'throttled_usec', 'nr_periods'))}
        bao_cao['pods'][ten] = {
            'uid': st['uid'], 'cgroup': st['cg'], 'so_mau': len(st['mau']),
            't_thay_s': st['t_thay'], 'tran_cpu_core': st['tran_cpu_core'],
            'cpu_tb_core': tb, 'cpu_dinh_theo_cua_so_core': dinh,
            'mem_peak_kernel_byte': mem_peak, 'mem_mau_max_byte': mem_mau_max,
            'anon_dinh_byte': anon_max, 'file_cache_dinh_byte': file_max,
            'working_set_dinh_byte': ws_max,
            'mem_max_byte': st['mem_max_byte'], 'throttle': thr,
        }

        def mi(b):
            return '—' if b is None else f'{b/2**20:.0f}Mi'

        print(f'\n══ {ten}  ({len(st["mau"])} mẫu)')
        print(f'   trần cpu (cpu.max) : {st["tran_cpu_core"]} core')
        print(f'   CPU trung bình     : {"—" if tb is None else f"{tb:.3f}"} core')
        print('   CPU đỉnh theo cửa sổ:')
        for w in CUA_SO:
            v = dinh[f'{w}s']
            print(f'      {w:>4}s : {"—" if v is None else f"{v:.3f}"} core')
        print(f'   RAM đỉnh (kernel)  : {mi(mem_peak)}   ← TRẦN MỀM (gồm page cache)')
        print(f'   RAM đỉnh (mẫu)     : {mi(mem_mau_max)}')
        print(f'   workingSet đỉnh    : {mi(ws_max)}   ← ĐẶT requests THEO SỐ NÀY')
        print(f'      (= current − inactive_file, đúng đại lượng kubelet dùng để đuổi pod)')
        print(f'   ├─ anon đỉnh       : {mi(anon_max)}   ← SÀN CỨNG: không thu hồi được')
        print(f'   └─ page cache đỉnh : {mi(file_max)}   ← kernel bỏ được khi thiếu RAM')
        print(f'   RAM trần (mem.max) : {mi(st["mem_max_byte"])}')
        if thr:
            print(f'   throttle           : {thr["nr_throttled"]}/{thr["nr_periods"]} chu kỳ, '
                  f'{thr["throttled_usec"]/1e6:.2f}s bị giữ lại')

        d_min = dinh.get('0.2s')
        if st['tran_cpu_core'] and d_min and d_min >= st['tran_cpu_core'] * 0.95:
            print('   ⛔ ĐỈNH CHẠM TRẦN — con số trên là **SÀN**, không phải nhu cầu.')
            print('      Tiến trình muốn nhiều hơn cũng chỉ báo được đúng trần này.')
            print('      Muốn biết nhu cầu thật: nới cpu.max (LimitRange defaultCpu) rồi đo lại.')
        elif thr and thr['nr_throttled'] > 0:
            print('   ⚠ CÓ throttle dù đỉnh lấy-mẫu chưa chạm trần — đỉnh tức thời DƯỚI mức')
            print('     lấy mẫu đã đụng trần. Con số đỉnh là sàn ở những khoảnh khắc đó.')
        if mem_peak and mem_mau_max and mem_peak > mem_mau_max * 1.05:
            print(f'   ⚠ kernel thấy đỉnh RAM cao hơn mẫu {(mem_peak/mem_mau_max-1)*100:.0f}% '
                  f'⇒ lấy mẫu {args.interval_ms}ms BỎ LỌT spike. Dùng số kernel.')

    if args.out:
        with open(args.out, 'w') as f:
            json.dump(bao_cao, f, indent=2)
        print(f'\n→ {args.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
