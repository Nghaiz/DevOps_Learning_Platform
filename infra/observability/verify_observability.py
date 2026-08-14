#!/usr/bin/env python3
"""Kiểm chứng stack quan sát (P3/3.D) — ô AC-D1, AC-D2, AC-D4.

VÌ SAO LÀ MỘT SCRIPT CHỨ KHÔNG PHẢI VÀI LỆNH GÕ TAY:
cùng lý lẽ với `netpol-verify.sh` của 3.B — một phép đo gõ tay không lặp lại
được thì lần sau người khác đo kiểu khác và hai kết quả không so được với nhau.
Script này chạy được TRƯỚC khi mở chiều scrape (để lấy baseline) và SAU khi mở;
chính CẶP trước/sau mới là bằng chứng, không phải riêng lượt sau.

VÌ SAO KHÔNG DÙNG port-forward: dưới NetworkPolicy của 3.B, port-forward tới
một số Service đã không dùng được (traffic đi từ netns của node).

VÌ SAO KHÔNG DÙNG `kubectl exec ... wget`: image Prometheus là distroless —
không có wget lẫn curl, và lỗi trả về là "OCI runtime exec failed", thứ đọc
rất giống lỗi quyền/CNI chứ không giống "thiếu binary". Đường đi dùng ở đây là
PROXY CỦA APISERVER (`kubectl get --raw .../services/<svc>:<port>/proxy/...`):
không cần binary trong image, không cần port-forward, không cần pod phụ.

Dùng:
  python3 verify_observability.py                 # đầy đủ, exit 1 nếu lệch
  python3 verify_observability.py --baseline      # chỉ AC-D1, luôn exit 0
"""

import json
import time
import subprocess
import sys
import urllib.parse

NS = "monitoring"
PROM_SVC = "kps-prometheus:9090"
LOKI_SVC = "loki-gateway:80"

# AC-D3 — Loki phai nhan log cua CA BA component. Kiem tung cai rieng chu khong
# kiem "co log nao khong": promtail hong mot phan (vd. mot container doi ten) van
# cho tong so dong khac 0, va mot ô AC gac tren TONG thi mu voi ca do.
AC_D3_CONTAINERS = ["web", "gateway", "orchestrator"]

# AC-D1 — ba đích scrape, nhận diện theo `scrapePool` chứ KHÔNG theo nhãn `job`.
#
# ⛔ BẪY ĐÃ DÍNH RỒI SỬA (2026-08-15). Bản đầu so theo `job` và giả định job ==
# tên monitor. Sai, và sai KHÁC NHAU theo từng loại monitor:
#     PodMonitor      dlp-gateway      → job = "monitoring/dlp-gateway"  (ns/tên)
#     PodMonitor      dlp-traefik      → job = "monitoring/dlp-traefik"
#     ServiceMonitor  dlp-orchestrator → job = "platform-orchestrator"   (từ NHÃN
#                                        của Service, không dính gì tên monitor)
# Hậu quả: script báo "KHONG CO TARGET" cho cả ba trong khi traefik đang up=1 —
# tức một đích LÀNH bị đọc thành đích CHẾT. Đó là hỏng theo hướng báo động giả,
# và nó sẽ đốt thời gian chẩn đoán đúng lúc người ta tin vào script nhất.
#
# `scrapePool` thì mang thẳng danh tính của object monitor
# ("podMonitor/monitoring/dlp-gateway/0") nên không suy diễn gì.
TARGETS = [
    ("gateway", "podMonitor/monitoring/dlp-gateway"),
    ("orchestrator", "serviceMonitor/monitoring/dlp-orchestrator"),
    ("traefik", "podMonitor/monitoring/dlp-traefik"),
]

# AC-D2 — các nhóm metric design §12 đòi. Ô AC đòi "điểm dữ liệu KHÁC RỖNG",
# nên phép kiểm là "truy vấn trả về ít nhất một series", KHÔNG phải "panel tồn tại".
AC_D2_METRICS = [
    ("claim latency", "dlp_claim_duration_seconds_bucket"),
    ("WS active", "dlp_gateway_ws_active"),
    ("pod pool free", "dlp_pool_free_size"),
    ("pod pool claimed", "dlp_pool_claimed_size"),
    ("reap rate", "dlp_reap_total"),
    ("error rate (claim)", "dlp_claim_total"),
]


def promq(query):
    """Gọi Prometheus API qua proxy của apiserver. Trả về list result (có thể rỗng)."""
    path = (
        f"/api/v1/namespaces/{NS}/services/{PROM_SVC}/proxy"
        f"/api/v1/query?query={urllib.parse.quote(query)}"
    )
    out = subprocess.run(
        ["kubectl", "get", "--raw", path],
        capture_output=True, text=True, timeout=60,
    )
    if out.returncode != 0:
        raise RuntimeError(f"kubectl get --raw loi: {out.stderr.strip()[:300]}")
    doc = json.loads(out.stdout)
    if doc.get("status") != "success":
        raise RuntimeError(f"Prometheus tra loi: {doc}")
    return doc["data"]["result"]


def lokiq(path):
    """Goi Loki qua proxy apiserver. Tra ve doc JSON."""
    p = f"/api/v1/namespaces/{NS}/services/{LOKI_SVC}/proxy{path}"
    out = subprocess.run(
        ["kubectl", "get", "--raw", p],
        capture_output=True, text=True, timeout=90,
    )
    if out.returncode != 0:
        raise RuntimeError(f"loki loi: {out.stderr.strip()[:200]}")
    return json.loads(out.stdout)


def targets_api():
    """activeTargets — mang scrapePool, tuc DANH TINH cua object monitor."""
    path = (
        f"/api/v1/namespaces/{NS}/services/{PROM_SVC}/proxy/api/v1/targets"
        "?state=active"
    )
    out = subprocess.run(
        ["kubectl", "get", "--raw", path],
        capture_output=True, text=True, timeout=60,
    )
    if out.returncode != 0:
        raise RuntimeError(f"kubectl get --raw loi: {out.stderr.strip()[:300]}")
    return json.loads(out.stdout)["data"]["activeTargets"]


def main():
    baseline = "--baseline" in sys.argv
    lech = 0

    print("=" * 68)
    print("AC-D1 — suc khoe tung dich scrape (theo scrapePool)")
    print("=" * 68)
    pools = {}
    for t in targets_api():
        pools.setdefault(t.get("scrapePool", "?"), []).append(t)

    for label, pool_prefix in TARGETS:
        found = [v for k, v in pools.items() if k.startswith(pool_prefix)]
        if not found:
            print(f"  {label:14s} KHONG CO TARGET  <- monitor chua duoc Prometheus chon")
            lech += 1
            continue
        for t in found[0]:
            health = t.get("health", "?")
            mark = "OK" if health == "up" else "<- " + (t.get("lastError") or "scrape hong")[:70]
            print(f"  {label:14s} health={health:8s} {mark}")
            if health != "up":
                lech += 1

    if baseline:
        print("\n(che do baseline — khong ket luan dung/sai, chi ghi trang thai)")
        return 0

    print()
    print("=" * 68)
    print("AC-D2 — moi metric phai tra ve IT NHAT MOT series")
    print("=" * 68)
    for label, q in AC_D2_METRICS:
        try:
            n = len(promq(q))
        except RuntimeError as e:
            print(f"  {label:22s} LOI TRUY VAN: {e}")
            lech += 1
            continue
        if n:
            print(f"  {label:22s} {n:3d} series  OK")
        else:
            print(f"  {label:22s}   0 series  <- panel se RONG")
            lech += 1

    print()
    print("=" * 68)
    print("AC-D3 — Loki nhan log cua tung component")
    print("=" * 68)
    # ⛔ start/end KHAI TƯỜNG MINH. Dựa vào cửa sổ mặc định của Loki là một cách
    # chắc chắn đọc ra "0 dòng" trong khi log vẫn đang chảy — đã dính đúng ca đó
    # khi dựng chặng này, và "0 dòng" đọc y hệt "promtail chết".
    now_ns = int(time.time()) * 1_000_000_000
    ago_ns = (int(time.time()) - 3600) * 1_000_000_000
    try:
        for comp in AC_D3_CONTAINERS:
            q = urllib.parse.quote(
                f'count_over_time({{namespace="default",container="{comp}"}}[1h])'
            )
            res = (
                lokiq(f"/loki/api/v1/query?query={q}&time={now_ns}")
                .get("data", {})
                .get("result", [])
            )
            tot = int(sum(float(r["value"][1]) for r in res)) if res else 0
            if tot:
                print(f"  container={comp:14s} {tot:6d} dong (1h)  OK")
            else:
                print(f"  container={comp:14s}      0 dong  <- promtail khong day duoc")
                lech += 1
        # Độ TRỄ của promtail: lúc mới cài nó đọc lại TOÀN BỘ file log cũ trên
        # node, và Loki từ chối mọi entry quá `reject_old_samples_max_age`. Bộ
        # đếm dropped vì thế vọt lên hàng chục nghìn ở lần cài đầu mà KHÔNG phải
        # sự cố. Thứ phân biệt "đang đuổi kịp backlog" với "hỏng thật" là entry
        # MỚI NHẤT có gần hiện tại không — nên đo cái đó, đừng đo bộ đếm drop.
        newest = lokiq(
            "/loki/api/v1/query_range?query="
            + urllib.parse.quote('{namespace="default"}')
            + f"&limit=1&direction=backward&start={ago_ns}&end={now_ns}"
        )
        streams = newest.get("data", {}).get("result", [])
        if streams and streams[0].get("values"):
            ts = int(streams[0]["values"][0][0])
            print(f"  tre nhat: {int(time.time()) - ts // 1_000_000_000:d}s truoc")
    except RuntimeError as e:
        print(f"  LOI: {e}")
        print("  (neu cai voi SKIP_LOGS=1 thi AC-D3 khong dong duoc luot nay)")
        lech += 1

    print()
    print("=" * 68)
    print("Alert da nap (AC-D4 can chung ton tai truoc khi ep ban)")
    print("=" * 68)
    seen = False
    for r in promq("ALERTS") or []:
        m = r["metric"]
        print(f"  {m.get('alertname','?'):26s} state={m.get('alertstate','?')}")
        seen = True
    if not seen:
        print("  (chua alert nao pending/firing — binh thuong khi he khoe)")

    print()
    if lech:
        print(f"X LECH: {lech}")
        return 1
    print("OK — tat ca o do duoc deu xanh")
    return 0


if __name__ == "__main__":
    sys.exit(main())
