#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# provision-users.sh — dựng sẵn pool user cho k6 (P3/3.F §F3).
#
# ⛔ VÌ SAO KHÔNG ĐỂ k6 TỰ SIGNUP MỖI VU. Better Auth rate-limit ĐĂNG KÝ theo IP:
# ~2–3 lượt rồi 429 (đo ở 3.E — xem `infra/pentest/lib/common.sh` § login_new).
# Một kịch bản tải tạo user mỗi VU sẽ chết ở bước DỰNG, trước khi đo được gì —
# và triệu chứng (429) đọc y hệt "hệ đã chặn tải", tức phép đo tự nói dối.
#
# ⛔ CACHE LÀ BẮT BUỘC, KHÔNG PHẢI TỐI ƯU. Chạy lại 3.F không được tốn thêm lượt
# signup, nếu không thì lần chạy thứ hai trong cùng phút sẽ không dựng nổi pool.
# File cache `.users.json` NẰM TRONG .gitignore — nó chứa cookie phiên thật.
#
# Dùng:
#   bash infra/k6/provision-users.sh            # dựng/dùng lại 6 user
#   USERS=8 bash infra/k6/provision-users.sh
#   FORCE=1 bash infra/k6/provision-users.sh    # bỏ cache, tạo mới toàn bộ
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${TARGET:-https://dlp.192.168.94.130.sslip.io:30443}"
ORIGIN="${ORIGIN:-$TARGET}"
USERS="${USERS:-6}"
OUT="${OUT:-$HERE/.users.json}"
PASSWORD='K6-Load-Password-123'

CURL=(curl -sk --http1.1 -m 25)

# ── Dùng lại cache nếu đủ user VÀ cookie còn sống ────────────────────────────
# "Còn sống" phải ĐO, không suy đoán: cookie Better Auth hết hạn sẽ làm mọi lượt
# create trả UNAUTHORIZED, và k6 sẽ đọc ra "hệ từ chối" — tức trần đo được sẽ là
# 0 và ô AC-F1 xanh vì lý do hoàn toàn khác. Vì thế cache luôn được thử lại.
probe_cookie() {
  local cookie="$1"
  "${CURL[@]}" -o /dev/null -w '%{http_code}' \
    -H "origin: $ORIGIN" -H "cookie: $cookie" \
    "$TARGET/api/trpc/me.get?input=%7B%7D"
}

if [[ -z "${FORCE:-}" && -f "$OUT" ]]; then
  have="$(jq 'length' "$OUT" 2>/dev/null || echo 0)"
  if [[ "$have" -ge "$USERS" ]]; then
    first_cookie="$(jq -r '.[0].cookie' "$OUT")"
    code="$(probe_cookie "$first_cookie")"
    if [[ "$code" == "200" ]]; then
      echo "[provision] dùng lại cache: $have user, cookie còn sống (me.get=200)"
      exit 0
    fi
    echo "[provision] cache có $have user nhưng cookie CHẾT (me.get=$code) — tạo mới"
  else
    echo "[provision] cache chỉ có $have/$USERS user — tạo mới"
  fi
fi

# ── Tạo user ─────────────────────────────────────────────────────────────────
echo "[provision] tạo $USERS user tại $TARGET (backoff khi gặp 429 đăng ký)"
tmp="$(mktemp)"; echo '[]' >"$tmp"
created=0

for i in $(seq 1 "$USERS"); do
  ok=0
  for attempt in 1 2 3 4 5 6; do
    email="k6-load-$i-$(date +%s%N)@dlp.local"
    hdr="$(mktemp)"
    body="$("${CURL[@]}" -D "$hdr" \
      -H "origin: $ORIGIN" -H 'content-type: application/json' \
      -X POST --data "{\"email\":\"$email\",\"password\":\"$PASSWORD\",\"name\":\"k6-$i\"}" \
      "$TARGET/api/auth/sign-up/email")"

    uid="$(jq -r '.user.id // empty' <<<"$body" 2>/dev/null)"
    if [[ -n "$uid" ]]; then
      # Gom mọi Set-Cookie thành một header `Cookie` duy nhất.
      cookie="$(grep -i '^set-cookie:' "$hdr" \
        | sed -E 's/^[Ss]et-[Cc]ookie:[[:space:]]*//; s/;.*$//' \
        | paste -sd '; ' -)"
      rm -f "$hdr"
      if [[ -z "$cookie" ]]; then
        echo "  user $i: có userId nhưng KHÔNG có Set-Cookie — bỏ, thử lại"
        sleep 5; continue
      fi
      jq --arg id "$uid" --arg em "$email" --arg ck "$cookie" \
        '. += [{userId:$id, email:$em, cookie:$ck}]' "$tmp" >"$tmp.n" && mv "$tmp.n" "$tmp"
      created=$((created + 1))
      echo "  user $i: OK ($uid)"
      ok=1; break
    fi
    rm -f "$hdr"
    echo "  user $i: lượt $attempt chưa được (rate-limit đăng ký) — đợi 15s"
    sleep 15
  done
  [[ "$ok" == 1 ]] || { echo "[provision] THẤT BẠI ở user $i — dừng"; rm -f "$tmp"; exit 1; }
done

mv "$tmp" "$OUT"
echo "[provision] xong: $created user → $OUT"
