#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# paced-run.sh — chạy TRỌN bộ e2e trên cụm mà không tự làm mình đỏ bằng 429.
#
# VÌ SAO CẦN CHIA MẺ
#
# `playwright.config.ts` đã `workers: 1` + `fullyParallel: false`, nên 429 KHÔNG
# đến từ chạy song song. Nó đến từ chạy LIÊN TỤC: rate-limit của BFF là
# **120 request / 60s** cho mỗi khoá (`RATE_LIMIT_MAX_REQUESTS`,
# `RATE_LIMIT_WINDOW_MS` trong `src/server/security/rate-limit.ts`), và một lượt
# đầy đủ đi qua ~90 màn hình liên tiếp bằng CÙNG một tài khoản.
#
# Đo 2026-09-08 trên ảnh `p14a`, chạy một mạch: **31 pass / 63 ĐỎ**, và mọi lỗi
# đều là `HTTP 429` hoặc `"too_many_requests"` — KHÔNG một lỗi sản phẩm nào. Chia
# mẻ + nghỉ thì cùng cây mã ấy xanh.
#
# ⛔ ĐÂY LÀ CÁI BẪY, KHÔNG PHẢI MỘT PHIỀN TOÁI. Một lượt đỏ vì 429 đọc y hệt một
# lượt đỏ vì hồi quy: cùng là `axe /me` đỏ, cùng là `csp /login` đỏ. Và nó tệ hơn
# khi cụm KHOẺ — cụm nhanh thì các lượt gọi dồn sát nhau hơn, mất phần giãn nhịp
# tình cờ mà một cụm chậm vô tình cấp cho. Nên "hôm nay đỏ nhiều hơn hôm qua" có
# thể có nghĩa là "hôm nay hạ tầng nhanh hơn".
#
# ⚠ ĐỪNG "sửa" bằng cách nới rate-limit hay bật `retries`. Nới là đổi cấu hình
# sản xuất cho tiện việc đo. `retries` làm suite trông xanh trong khi nó không
# xanh — và sẽ nuốt luôn một hồi quy thật ở lần chạy lại.
#
# Dùng:
#   E2E_EMAIL=… E2E_PASSWORD=… bash apps/web/e2e/scripts/paced-run.sh
#   NGHI=90 bash apps/web/e2e/scripts/paced-run.sh        # nghỉ lâu hơn
#   ME="a11y csp" bash apps/web/e2e/scripts/paced-run.sh  # chỉ vài mẻ
#
# Env bắt buộc (xem e2e/env.ts): E2E_BASE_URL · E2E_ORIGIN · E2E_EMAIL ·
# E2E_PASSWORD. Và HAI cờ dưới đây, KHÔNG được bỏ:
#   E2E_REQUIRE_ROLES=1    — thiếu nó, 5 màn quản trị lặng lẽ `skip`
#   E2E_REQUIRE_SESSION=1  — thiếu nó, 3 ô D10 (Esc-Esc) lặng lẽ `skip`
# Một lượt mà chúng đều skip trông y hệt một lượt chúng pass.
#
# Thoát: 0 = mọi mẻ xanh · 1 = có mẻ đỏ (tên in ở cuối)
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

GOC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
NGHI="${NGHI:-5}"   # chi de cum tho; bucket giai bang DOI TAI KHOAN, khong bang cho

# Mỗi mẻ là một lượt `playwright test` riêng. Bảy luồng tách rời nhau vì mỗi
# luồng tự dựng một phiên sandbox thật; gộp chúng là dồn cả bucket vào một phút.
MAC_DINH=(
  "flows/lesson.flow.spec.ts"
  "flows/lab.flow.spec.ts"
  "flows/quiz.flow.spec.ts"
  "flows/path.flow.spec.ts"
  "flows/author.flow.spec.ts"
  "flows/admin.flow.spec.ts"
  "flows/playground.flow.spec.ts"
  "a11y.spec.ts"
  "csp.spec.ts"
  "keyboard.spec.ts"
  "responsive.spec.ts"
  "perf.spec.ts"
)
read -r -a ME <<< "${ME:-${MAC_DINH[*]}}"

# ⛔ KHOA RATE-LIMIT LA `trpc:{type}:{userId}` — THEO NGUOI DUNG, khong theo IP
# (`apps/web/src/server/trpc/init.ts:161`). Query 120/phut, mutation 20/phut.
#
# Nen cach dung khong phai la NGHI cho bucket hoi, ma la DOI TAI KHOAN moi me:
# moi me bat dau voi mot bucket day. Do 2026-09-08: nghi 75s giua cac me van cho
# a11y 6/6 do vi 429 — mot me 12 o da vuot 120 query. Xoay tai khoan thi khong
# con me nao cham tran.
#
# Moi tai khoan deu duoc promote len admin, vi mot so o doi vai tro; tat ca bi ha
# ve `user` o cuoi (trap EXIT). Bo buoc do la de lai dung thu ma C16 vua don.

TAIKHOAN=()
don_tai_khoan() {
  [[ ${#TAIKHOAN[@]} -eq 0 ]] && return 0
  printf '
[paced] ha %d tai khoan tam ve user…
' "${#TAIKHOAN[@]}"
  for e in "${TAIKHOAN[@]}"; do
    ssh -o BatchMode=yes "$VM_SSH" "/tmp/paced-promote.sh '$e' user" >/dev/null 2>&1 || true
  done
  ssh -o BatchMode=yes "$VM_SSH" 'rm -f /tmp/paced-promote.sh' >/dev/null 2>&1 || true
}
trap don_tai_khoan EXIT

VM_SSH="${VM_SSH:-nghaiz@192.168.94.130}"
scp -q -o BatchMode=yes "$GOC/apps/web/e2e/scripts/promote-role.sh" "$VM_SSH:/tmp/paced-promote.sh"   && ssh -o BatchMode=yes "$VM_SSH" 'chmod +x /tmp/paced-promote.sh'   || { echo "KHONG DO DUOC: khong dua duoc promote-role.sh len VM" >&2; exit 2; }

# Tao mot tai khoan admin moi, in email ra stdout.
tai_khoan_moi() {
  local e="paced-$(date +%s)-$RANDOM@dlp.local"
  local ma
  ma="$(curl -sk -o /dev/null -w '%{http_code}' -X POST "$E2E_BASE_URL/api/auth/sign-up/email"         -H 'Content-Type: application/json' -H "Origin: $E2E_ORIGIN"         -d "{\"email\":\"$e\",\"password\":\"$E2E_PASSWORD\",\"name\":\"paced\"}" --max-time 30)"
  [[ "$ma" == "200" ]] || { echo "signup that bai ($ma)" >&2; return 1; }
  ssh -o BatchMode=yes "$VM_SSH" "/tmp/paced-promote.sh '$e' admin" >/dev/null 2>&1 || return 1
  TAIKHOAN+=("$e")
  printf '%s' "$e"
}

: "${E2E_PASSWORD:?bat buoc}"
: "${E2E_BASE_URL:?bat buoc}"
: "${E2E_ORIGIN:?bat buoc}"
: "${E2E_REQUIRE_ROLES:?bat buoc =1 — xem chu thich dau file}"
: "${E2E_REQUIRE_SESSION:?bat buoc =1 — xem chu thich dau file}"

# Khoi `test.describe` cua ba spec lon. Cat theo TEN KHOI chu khong theo --shard:
# `--shard` chia theo FILE khi `fullyParallel: false`, nen voi mot file thi
# `--shard=1/3` nhan TRON bo va hai phan con lai chay 0 o roi thoat 0 — mot cach
# "xanh" khong chung minh gi. Do 2026-09-08.
khoi_cua() {
  case "$1" in
    a11y.spec.ts)     printf '%s
' 'a11y — công khai' 'a11y — đã đăng nhập' 'a11y — theo vai trò' ;;
    csp.spec.ts)      printf '%s
' 'đối chứng dương' 'nonce' '0 vi phạm CSP' ;;
    keyboard.spec.ts) printf '%s
' 'thứ tự và dấu focus' 'đi hết luồng chính' 'D10' ;;
    *) : ;;
  esac
}

DO=()
MEBAT=()
for spec in "${ME[@]}"; do
  co_khoi=0
  while IFS= read -r k; do
    [[ -z "$k" ]] && continue
    MEBAT+=("$spec|$k"); co_khoi=1
  done < <(khoi_cua "$spec")
  [[ "$co_khoi" -eq 1 ]] || MEBAT+=("$spec|")
done

TONG=${#MEBAT[@]}
i=0
for muc in "${MEBAT[@]}"; do
  i=$((i + 1))
  spec="${muc%%|*}"; shard="${muc##*|}"
  nhan="$spec"; doi=()
  if [[ -n "$shard" ]]; then nhan="$spec :: $shard"; doi=(--grep "$shard"); fi
  printf '\n===== [paced] me %d/%d : %s  (%s) =====\n' "$i" "$TONG" "$nhan" "$(date -Is)"
  # Tai khoan MOI cho moi me: bucket rate-limit theo userId, nen me nay khong
  # thua huong gi tu me truoc.
  EM="$(tai_khoan_moi)" || { DO+=("$nhan (khong tao duoc tai khoan)"); continue; }
  ( cd "$GOC" && E2E_EMAIL="$EM" pnpm --filter web exec playwright test "e2e/$spec" "${doi[@]}" ) 2>&1 | tail -20
  MA=${PIPESTATUS[0]}
  [[ "$MA" -eq 0 ]] || DO+=("$nhan")
  printf '[paced] me %d exit=%d\n' "$i" "$MA"
  if [[ "$i" -lt "$TONG" ]]; then
    printf '[paced] nghi %ss de bucket rate-limit hoi lai...\n' "$NGHI"
    sleep "$NGHI"
  fi
done

printf '\n===== [paced] TỔNG =====\n'
if [[ ${#DO[@]} -eq 0 ]]; then
  printf 'mọi mẻ XANH (%d mẻ)\n' "$TONG"
  exit 0
fi
printf 'mẻ ĐỎ (%d/%d):\n' "${#DO[@]}" "$TONG"
printf '  %s\n' "${DO[@]}"
printf '\n⚠ Trước khi đọc thành hồi quy: kiểm lỗi có phải 429 không.\n'
printf '   grep -c "too_many_requests\\|HTTP 429" apps/web/e2e/.artifacts/results.json\n'
exit 1
