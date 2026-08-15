#!/usr/bin/env python3
"""netpol_render_gate.py — cổng gác NGỮ NGHĨA cho NetworkPolicy đã render (P3/3.B).

Đọc manifest đã render từ stdin, khẳng định các bất biến, `exit 1` nếu lệch.

⛔ VÌ SAO CẦN CỔNG NÀY KHI ĐÃ CÓ kubeconform.
kubeconform kiểm SCHEMA — nó bắt được field sai kiểu hoặc field lạ (đã đo: nhãn
trần đặt thẳng dưới `podSelector:` bị nó bắt, vì NetworkPolicy là kiểu CÓ SẴN
nên có schema; khác hẳn CRD Traefik ở 3.A vốn bị `-ignore-missing-schemas` bỏ
qua trong im lặng). Nhưng kubeconform KHÔNG biết gì về ngữ nghĩa của
NetworkPolicy, và ba kiểu hỏng nguy hiểm nhất ở đây đều HỢP LỆ VỀ SCHEMA:

  1. `egress: null` / `ingress: null` trong một policy có policyTypes tương ứng
     ⇒ CHẶN SẠCH chiều đó. Hợp lệ, im lặng, và làm chết tính năng.
  2. `from: []` / `to: []` (rule rỗng) ⇒ KHỚP MỌI NGUỒN/ĐÍCH. Hợp lệ, im lặng,
     và mở toang thay vì chặn — hỏng theo hướng NỚI LỎNG nên không có triệu
     chứng nào để mà nhìn.
  3. thiếu `ports:` trong một rule ⇒ cho phép MỌI CỔNG chứ không riêng cổng
     định mở.

Cả ba đều là "manifest hợp lệ, hàng rào không tồn tại" — đúng lớp sự cố mà
`service.spec.type` và `maxRequestBodyByte` đã dạy ở P2/3.A.

⛔ MỘT BẢN SAO DUY NHẤT. Script này được CI gọi VÀ được người chạy tay gọi. 3.A
phải trích phép kiểm "verbatim từ chính workflow" để hai bên không trôi khỏi
nhau; ở đây không có gì để trôi vì chỉ có một file.

Dùng:
  helm template … | python3 netpol_render_gate.py --expect-deny
  helm template … | python3 netpol_render_gate.py            # pha allow
  helm template … | python3 netpol_render_gate.py --expect-none
"""

import sys

try:
    import yaml
except ImportError:  # pragma: no cover
    print("LỖI: cần PyYAML (pip install pyyaml).", file=sys.stderr)
    sys.exit(2)

PREFIX = "platform-"

# Tập CHÍNH XÁC các policy nền tảng. Pin cả tập chứ không chỉ kiểm "mỗi cái có
# hợp lệ không": ở 3.A, cổng chỉ kiểm một chiều (mọi tham chiếu đều khớp một
# định nghĩa có thật) và vì thế cho qua 4/6 kiểu hỏng — trong đó có kiểu GỠ HẲN
# một rule. Thiếu một policy là một chiều mất hàng rào, và không gì khác báo.
EXPECTED_ALLOW_BASE = {
    "allow-egress-dns",
    "allow-egress-apiserver",
    "allow-egress-web",
    "allow-egress-gateway",
    "allow-egress-orchestrator",
    "allow-egress-migrate",
    "allow-ingress-web",
    "allow-ingress-gateway",
    "allow-ingress-orchestrator",
    "allow-ingress-kubelet-probes",
}

# Ingress của datastore chỉ render khi store đó chạy TRONG cụm — với RDS/
# ElastiCache thì không có pod nào ở đây để bảo vệ. Nên tập mong đợi phụ thuộc
# cấu hình, và người gọi phải KHAI ra thay vì để cổng đoán: `--stores postgres,redis`
# (mặc định). Khai sai sẽ làm cổng đỏ, đó là chủ ý — một tập "co giãn theo thực
# tế" thì không gác được gì.
STORE_INGRESS = {"postgres": "allow-ingress-postgres", "redis": "allow-ingress-redis"}
DENY_NAME = "default-deny"

# Chiều scrape của Prometheus (3.D) — chỉ render khi
# networkPolicy.platform.metricsScrape.enabled=true, nên cùng khuôn `--stores`:
# người gọi phải KHAI (`--metrics-scrape`), cổng không đoán.
METRICS_SCRAPE = {
    "allow-ingress-metrics-gateway",
    "allow-ingress-metrics-orchestrator",
}

# Nhãn phân định policy NỀN TẢNG với policy sandbox của P1.
# `platform.componentLabels` đặt nhãn này cho mọi policy trong
# platform-networkpolicy.yaml; sandbox-networkpolicy.yaml dùng
# "sandbox-networkpolicy".
PLATFORM_COMPONENT = "platform-networkpolicy"

# Policy sandbox (P1) — 3.B KHÔNG được đụng vào. Kiểm sự có mặt của chúng ở đây
# để một thay đổi ở file 3.B vô tình xoá/đổi tên chúng sẽ đỏ ngay.
EXPECTED_SANDBOX = {
    "sandbox-default-deny",
    "sandbox-allow-egress-dns",
    "sandbox-allow-ingress-gateway",
}

errors = []


def err(msg):
    errors.append(msg)


def short(name):
    return name[len(PREFIX):] if name.startswith(PREFIX) else name


def check_selector(where, sel):
    """podSelector phải là LabelSelector thật."""
    if sel is None:
        err(f"{where}: podSelector là null — chọn MỌI pod trong namespace.")
        return
    if not isinstance(sel, dict):
        err(f"{where}: podSelector không phải object.")
        return
    unknown = set(sel) - {"matchLabels", "matchExpressions"}
    if unknown:
        err(
            f"{where}: podSelector có key LẠ {sorted(unknown)} — apiserver PRUNE chúng "
            f"trong im lặng, còn lại podSelector:{{}} = CHỌN MỌI POD. Nhãn phải nằm dưới "
            f"`matchLabels:` (dùng helper platform.netpolComponent)."
        )


def check_rules(where, rules, peer_key):
    """Kiểm danh sách rule ingress/egress: không null, không rule rỗng, có ports."""
    chieu = "egress" if peer_key == "to" else "ingress"
    if rules is None:
        err(
            f"{where}: `{chieu}:` là null trong khi policyTypes khai chiều đó ⇒ CHẶN SẠCH "
            f"chiều này. Manifest vẫn hợp lệ nên không gì khác báo. (Thường do một danh "
            f"sách values rỗng render ra rỗng.)"
        )
        return
    if not rules:
        err(f"{where}: danh sách rule rỗng ⇒ chặn sạch chiều này.")
        return
    for i, rule in enumerate(rules):
        rule = rule or {}
        if not rule.get(peer_key):
            err(
                f"{where}[{i}]: `{peer_key}:` rỗng/thiếu ⇒ trong NetworkPolicy điều đó nghĩa "
                f"là KHỚP MỌI NGUỒN/ĐÍCH, tức rule này MỞ TOANG thay vì thu hẹp. Hỏng theo "
                f"hướng nới lỏng: không có triệu chứng nào để nhìn."
            )
        if not rule.get("ports"):
            err(
                f"{where}[{i}]: thiếu `ports:` ⇒ cho phép MỌI CỔNG của đích, không chỉ cổng "
                f"định mở."
            )
        # ⛔ PEER RỖNG BÊN TRONG from/to — kiểm này được THÊM VÀO SAU, vì bộ bóp
        # méo đã chứng minh cổng bản đầu CHO QUA nó. `podSelector: {}` trong một
        # peer nghĩa là MỌI POD của namespace, nên `from: [{podSelector: {}}]`
        # là một rule trông rất bình thường mà thực chất cấp quyền cho tất cả —
        # kể cả pod lạ, tức phá đúng AC-B2 trong khi `from` vẫn "không rỗng" và
        # `ports` vẫn đúng. Bản đầu chỉ kiểm chính `spec.podSelector` của policy
        # nên mù hoàn toàn với ca này.
        for j, peer in enumerate(rule.get(peer_key) or []):
            peer = peer or {}
            if not peer:
                err(f"{where}[{i}].{peer_key}[{j}]: peer RỖNG ⇒ khớp mọi nguồn/đích.")
                continue
            if "podSelector" in peer and peer["podSelector"] == {}:
                err(
                    f"{where}[{i}].{peer_key}[{j}]: `podSelector: {{}}` ⇒ MỌI POD trong "
                    f"namespace, kể cả pod lạ. Rule trông bình thường (from/to không rỗng, "
                    f"ports đúng) nhưng cấp quyền cho tất cả — phá đúng thứ AC-B2 đo."
                )
            if "namespaceSelector" in peer and peer["namespaceSelector"] == {}:
                err(
                    f"{where}[{i}].{peer_key}[{j}]: `namespaceSelector: {{}}` ⇒ MỌI NAMESPACE "
                    f"trong cụm."
                )


def main():
    args = sys.argv[1:]
    argv = set(args)
    expect_deny = "--expect-deny" in argv
    expect_none = "--expect-none" in argv
    stores = ["postgres", "redis"]
    if "--stores" in args:
        raw = args[args.index("--stores") + 1]
        stores = [x for x in raw.split(",") if x]
        unknown = set(stores) - set(STORE_INGRESS)
        if unknown:
            print(f"LỖI: --stores không nhận {sorted(unknown)}", file=sys.stderr)
            return 2
    expected_allow = set(EXPECTED_ALLOW_BASE) | {STORE_INGRESS[x] for x in stores}
    if "--metrics-scrape" in argv:
        expected_allow |= METRICS_SCRAPE

    docs = [d for d in yaml.safe_load_all(sys.stdin.read()) if d]
    netpols = [d for d in docs if d.get("kind") == "NetworkPolicy"]

    names = {np.get("metadata", {}).get("name", "<không tên>") for np in netpols}
    # ⛔ NHẬN DIỆN THEO NHÃN, KHÔNG THEO GIAO VỚI TẬP TÊN ĐÃ BIẾT (sửa 3.D).
    #
    # Bản đầu viết:
    #     platform_names = {short(n) for n in names} & (STORE_INGRESS ∪ BASE ∪ DENY)
    # Phép GIAO ấy làm cổng MÙ với đúng ca mà chú thích của EXPECTED_ALLOW_BASE
    # tự nhận là bắt được: một policy mang tên MỚI bị phép giao loại khỏi tập so
    # sánh, nên nó không bao giờ hiện ra ở vế `thừa`. Tức "thêm một chiều ngoài ý
    # định" — nguy hiểm hơn "gỡ một chiều" vì nó NỚI quyền — lọt im lặng, và
    # 3.D suýt thêm hai policy mới mà cổng vẫn xanh.
    #
    # Nhãn `app.kubernetes.io/component` do chính chart đặt nên không trôi được:
    # policy nền tảng = "platform-networkpolicy", policy sandbox của P1 =
    # "sandbox-networkpolicy". Lấy theo nhãn thì mọi tên lạ đều lộ.
    platform_names = {
        short(np.get("metadata", {}).get("name", "<không tên>"))
        for np in netpols
        if ((np.get("metadata") or {}).get("labels") or {}).get(
            "app.kubernetes.io/component"
        )
        == PLATFORM_COMPONENT
    }
    sandbox_present = {short(n) for n in names} & EXPECTED_SANDBOX

    # ── Nhánh "phải KHÔNG render gì" (mặc định của chart: enabled=false) ──────
    if expect_none:
        if platform_names:
            err(
                f"muốn 0 policy nền tảng (networkPolicy.platform.enabled=false) nhưng thấy "
                f"{sorted(platform_names)}."
            )
        if sandbox_present != EXPECTED_SANDBOX:
            err(
                f"policy SANDBOX bị ảnh hưởng: muốn {sorted(EXPECTED_SANDBOX)}, "
                f"thấy {sorted(sandbox_present)}."
            )
        return finish()

    # ── Tập policy phải KHỚP CHÍNH XÁC ───────────────────────────────────────
    want = set(expected_allow) | ({DENY_NAME} if expect_deny else set())
    if platform_names != want:
        err(
            f"tập policy LỆCH. thiếu={sorted(want - platform_names)} "
            f"thừa={sorted(platform_names - want)}. (Thiếu một policy = một chiều mất hàng "
            f"rào; thừa = một chiều được mở ngoài ý định.)"
        )

    if sandbox_present != EXPECTED_SANDBOX:
        err(
            f"3.B KHÔNG được đụng policy sandbox của P1: muốn {sorted(EXPECTED_SANDBOX)}, "
            f"thấy {sorted(sandbox_present)}."
        )

    # ── Từng policy ──────────────────────────────────────────────────────────
    for np in netpols:
        sname = short(np.get("metadata", {}).get("name", "<không tên>"))
        if sname not in (expected_allow | {DENY_NAME}):
            continue  # policy sandbox: thuộc P1, ngoài phạm vi cổng này
        spec = np.get("spec") or {}
        ptypes = spec.get("policyTypes") or []
        sel = spec.get("podSelector")

        if sname == DENY_NAME:
            # default-deny: podSelector RỖNG là ĐÚNG (phải phủ cả pod lạ) và
            # KHÔNG được có rule nào.
            if sel != {}:
                err(
                    f"{sname}: podSelector phải RỖNG ({{}}) để phủ MỌI pod kể cả pod lạ — "
                    f"đó chính là thứ AC-B2 đo. Thấy: {sel!r}"
                )
            if set(ptypes) != {"Ingress", "Egress"}:
                err(f"{sname}: policyTypes phải gồm cả Ingress lẫn Egress, thấy {ptypes}.")
            if spec.get("ingress") or spec.get("egress"):
                err(f"{sname}: default-deny KHÔNG được chứa rule allow nào.")
            continue

        # Mọi policy allow-*: selector phải NGẶT, không được rỗng.
        check_selector(sname, sel)
        if sel == {}:
            err(
                f"{sname}: podSelector RỖNG trong một policy allow ⇒ cấp quyền cho MỌI pod "
                f"trong namespace, kể cả pod lạ. Vô hiệu hoá đúng thứ AC-B2 đo."
            )

        if "Egress" in ptypes:
            check_rules(f"{sname}.egress", spec.get("egress"), "to")
        if "Ingress" in ptypes:
            check_rules(f"{sname}.ingress", spec.get("ingress"), "from")

        # apiserver: BẮT BUỘC ipBlock. Đích là IP node sau DNAT, không phải pod —
        # một selector ở đây là rule không bao giờ khớp, và im lặng.
        if sname == "allow-egress-apiserver":
            for i, rule in enumerate(spec.get("egress") or []):
                for peer in (rule or {}).get("to") or []:
                    if "ipBlock" not in peer:
                        err(
                            f"{sname}.egress[{i}]: đích phải là `ipBlock` (endpoint thật của "
                            f"apiserver = IP node + 6443). Thấy {sorted(peer)} — selector ở "
                            f"đây KHÔNG BAO GIỜ khớp vì apiserver không phải pod; hậu quả là "
                            f"gateway mất exec và orchestrator mất quyền tạo pod, im lặng."
                        )

        # probe kubelet: BẮT BUỘC ipBlock (probe đến từ node, không từ pod).
        if sname == "allow-ingress-kubelet-probes":
            for i, rule in enumerate(spec.get("ingress") or []):
                for peer in (rule or {}).get("from") or []:
                    if "ipBlock" not in peer:
                        err(
                            f"{sname}.ingress[{i}]: nguồn phải là `ipBlock` (IP node) — probe "
                            f"kubelet KHÔNG đến từ pod nên selector không bắt được nó."
                        )

    return finish()


def finish():
    if errors:
        print(f"\n✗ CỔNG ĐỎ — {len(errors)} vi phạm:\n", file=sys.stderr)
        for e in errors:
            print(f"  · {e}", file=sys.stderr)
        return 1
    print("✓ cổng netpol xanh: tập policy khớp chính xác, selector ngặt, không rule nào "
          "rỗng, apiserver/probe dùng ipBlock, sandbox nguyên vẹn.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
