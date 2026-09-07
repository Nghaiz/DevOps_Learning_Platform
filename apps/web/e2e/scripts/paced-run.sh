#!/usr/bin/env bash
#
# Chạy một spec Playwright theo MẺ, nghỉ giữa các mẻ, để suite không tự chạm
# trần rate-limit của Traefik.
#
# ── VÌ SAO CẦN NÓ (đo trên cụm lab, không phải suy đoán) ────────────────────
#
# Tier `ratelimit-web` = average 120/1m, burst 60, và Traefik đếm theo IP NGUỒN
# (`infra/helm/platform/values.yaml`). Harness chạy từ một máy ⇒ một IP ⇒ một
# bucket dùng chung cho cả suite.
#
#   2026-09-06, `csp.spec.ts` chạy liền: 14/17 và 15/18 ô đỏ, TẤT CẢ vì 429.
#   Cùng suite, chia 6 mẻ nghỉ 80s: 0 lần 429 trên cả 27 test.
#   2026-09-07, `keyboard.spec.ts` chạy liền: 9/10 ô đỏ vì 429.
#
# `a11y.spec.ts` KHÔNG dính, vì axe quét ~7s/màn nên nó tự giãn nhịp — đó là lý
# do hai suite đi qua cùng 22 màn mà chỉ một cái đỏ. Nói cách khác: đỏ hay không
# phụ thuộc NHỊP, không phụ thuộc số màn.
#
# ⚠ 429 KHÔNG đọc ra như 429. Đã đo hai dạng: `→ HTTP 429` (điều hướng bị
# Traefik chặn) và `procName: "too_many_requests"` (lời gọi tRPC bị chặn). Dạng
# thứ hai trông y hệt một lỗi ứng dụng nếu người đọc không biết trước — nên một
# lượt không giãn nhịp không chỉ chậm, nó SINH RA CHẨN ĐOÁN SAI. Chín ô đỏ của
# lượt keyboard 09-07 đọc ra như chín lỗi điều hướng; chúng là MỘT lỗi nhịp.
#
# ── VÌ SAO KHÔNG SỬA SPEC ───────────────────────────────────────────────────
#
# Nhịp là thuộc tính của ĐÍCH (cụm có Traefik), không phải của phép kiểm. Job CI
# `web-a11y` chạy spec này trên `next start` cục bộ — ở đó không có Traefik,
# không có rate limit, và một `beforeEach` ngủ 3s chỉ là hàng chục giây lãng phí
# mỗi lượt CI. Giãn nhịp thuộc về NGƯỜI GỌI, nên nó sống ở script này.
#
# ── VÌ SAO `--grep` CHỨ KHÔNG PHẢI ĐỊA CHỈ `file:line` ─────────────────────
#
# `file:line` TRÔNG như định danh chính xác, và nó KHÔNG PHẢI. Mọi test sinh ra
# trong một vòng lặp `for (const screen of SCREENS) test(...)` mang CÙNG một số
# dòng, nên `keyboard.spec.ts:193` địa chỉ hoá 22 test một lúc, không phải một.
#
# Đo 2026-09-07: bản đầu của script này khai 5 địa chỉ cho một mẻ và đã chạy 13
# test, rồi vẫn 429 — đúng thứ nó sinh ra để tránh. Bẫy im lặng theo cách tệ
# nhất: mẻ vẫn chạy, vẫn in kết quả, chỉ là nó không giãn nhịp gì cả.
#
# Nên đơn vị chia mẻ là TIÊU ĐỀ test, thứ duy nhất phân biệt được các test cùng
# dòng. Tiêu đề là tiếng Việt có dấu, nên node escape regex rồi ghi ra FILE, và
# `--grep` đọc từ file đó — không chuỗi nào đi qua một lớp trích dẫn của bash mà
# ta không đọc được.
#
# ── ĐỐI CHỨNG: SỐ TEST ĐÃ CHẠY PHẢI KHỚP SỐ TEST ĐÃ KHAI ───────────────────
#
# Một mẻ khớp 0 test thoát 0 và in "no tests found" — tức một lượt chia mẻ SAI
# trông y hệt một lượt xanh. Script đếm test THỰC SỰ chạy từ báo cáo json của
# TỪNG mẻ và đỏ ngay khi lệch. Không có bước này thì chính script giãn nhịp trở
# thành cái "green that proves nothing" mới — và nó đã suýt thành, đúng một lần.
#
# ── DÙNG ────────────────────────────────────────────────────────────────────
#
#   apps/web/e2e/scripts/paced-run.sh csp.spec.ts
#   apps/web/e2e/scripts/paced-run.sh keyboard.spec.ts --batch 5 --sleep 80
#
# Env: mọi biến của harness (`E2E_BASE_URL`, `E2E_EMAIL`, `E2E_REQUIRE_ROLES`…)
# được truyền nguyên vẹn sang từng mẻ.
#
# Mã thoát: 0 mọi mẻ xanh · 1 có mẻ đỏ · 2 số test không khớp (script chia mẻ
# hỏng, MỌI kết quả ở trên vô giá trị) · 3 sai cấu hình.
set -euo pipefail

SPEC="${1:-}"
[ -n "$SPEC" ] || { echo "dùng: $0 <spec> [--batch N] [--sleep S]" >&2; exit 3; }
shift

BATCH=5
SLEEP=80
while [ $# -gt 0 ]; do
  case "$1" in
    --batch) BATCH="${2:?--batch cần một số}"; shift 2 ;;
    --sleep) SLEEP="${2:?--sleep cần một số}"; shift 2 ;;
    *) echo "tham số lạ: $1" >&2; exit 3 ;;
  esac
done

# ⚠ Chốt đường TUYỆT ĐỐI trước khi `cd`. `$(dirname "$0")` là tương đối với cwd
# lúc gọi, nên dùng lại nó SAU khi đã đổi thư mục cho ra
# `apps/web/apps/web/e2e/scripts` — đã dính đúng lỗi đó 2026-09-07, và nó chỉ lộ
# ở mẻ đầu tiên chứ không lộ lúc kiểm cú pháp.
HERE="$(cd "$(dirname "$0")" && pwd)"
LIB="$HERE/paced-lib.mjs"

# Chạy từ `apps/web` để `playwright.config.ts` và đường spec tương đối khớp nhau.
cd "$HERE/../.."

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Artifact giữ lại giữa các mẻ. Nằm cạnh `outputDir` chứ không nằm TRONG nó —
# Playwright dọn `outputDir`, nên bất cứ thứ gì ta cất vào đó cũng bốc hơi ở mẻ
# kế tiếp. Đường này bị `apps/web/e2e/.gitignore` chặn cùng phần còn lại của
# `.artifacts/`, nên nó không lọt vào git.
KEEP="$PWD/e2e/.artifacts/paced-batches"
rm -rf "$KEEP"   # xoá ở ĐẦU lượt: artifact của lượt TRƯỚC đọc ra y hệt của lượt này

# ── 1. Liệt kê test ────────────────────────────────────────────────────────
# `--list` KHÔNG chạy globalSetup và KHÔNG mở trình duyệt, nên nó không tiêu
# một đồng nào của bucket rate-limit.
npx playwright test "$SPEC" --list --reporter=json > "$WORK/list.json" 2>"$WORK/list.err" || {
  echo "không liệt kê được test của $SPEC:" >&2; cat "$WORK/list.err" >&2; exit 3; }

node "$LIB" titles "$WORK/list.json" > "$WORK/titles.txt"

TOTAL="$(wc -l < "$WORK/titles.txt" | tr -d ' ')"
echo "[paced] $SPEC → $TOTAL test, mẻ $BATCH, nghỉ ${SLEEP}s"

# ── 2. Chạy từng mẻ ────────────────────────────────────────────────────────
FAILED=0
RAN=0
BATCH_NO=0

split -l "$BATCH" "$WORK/titles.txt" "$WORK/batch-"

for f in "$WORK"/batch-*; do
  case "$f" in *.re) continue ;; esac
  BATCH_NO=$((BATCH_NO + 1))
  if [ "$BATCH_NO" -gt 1 ]; then
    echo "[paced] nghỉ ${SLEEP}s để bucket rate-limit hồi lại…"
    sleep "$SLEEP"
  fi

  WANT="$(wc -l < "$f" | tr -d ' ')"
  echo "[paced] mẻ $BATCH_NO: $WANT test"

  node "$LIB" regex "$f" > "$f.re"
  npx playwright test "$SPEC" --grep "$(cat "$f.re")" || FAILED=1

  # Đếm test đã chạy TỪ BÁO CÁO, không từ số dòng đã đưa vào: hai con số đó chỉ
  # bằng nhau khi `--grep` thật sự khớp đúng tập đã khai.
  N="$(node "$LIB" count "$PWD/e2e/.artifacts/results.json")"
  RAN=$((RAN + N))
  cp "$PWD/e2e/.artifacts/results.json" "$WORK/results-$BATCH_NO.json" 2>/dev/null || true

  # ⚠ Playwright DỌN SẠCH `outputDir` ở đầu MỖI lượt chạy, nên mẻ sau xoá ảnh
  # chụp, trace và `error-context.md` của mẻ trước. Đo 2026-09-07: hai luồng đỏ
  # ở mẻ 1 mất hết artifact khi mẻ 2 khởi động, và `error-context.md` chính là
  # thứ mang cây ARIA — nghĩa là mất luôn đường chẩn đoán offline.
  #
  # Giữ lại NGOÀI `outputDir` (`$KEEP`), theo mẻ. Đây là thư mục cần đọc khi một
  # luồng đỏ, không phải `e2e/.artifacts/test-results` (nó chỉ còn mẻ cuối).
  mkdir -p "$KEEP"
  if [ -d "$PWD/e2e/.artifacts/test-results" ]; then
    cp -r "$PWD/e2e/.artifacts/test-results" "$KEEP/batch-$BATCH_NO" 2>/dev/null || true
  fi
  # `results.json` cũng bị GHI ĐÈ mỗi mẻ, và nó là nơi DUY NHẤT giữ
  # `annotations` — thứ các luồng dùng để nói "ô này XANH nhưng nhánh kia KHÔNG
  # được kiểm ở lượt này". Mất nó thì một lượt 6/6 xanh không phân biệt được với
  # một lượt 6/6 xanh mà bốn nhánh chưa ai chạm tới.
  cp "$PWD/e2e/.artifacts/results.json" "$KEEP/results-$BATCH_NO.json" 2>/dev/null || true

  if [ "$N" -eq 0 ]; then
    # ⚠ HAI nguyên nhân cho `0 test`, và chúng đòi hai việc khác hẳn nhau:
    #   - `globalSetup` chết (thường là `sign-in` trả 429 — Better Auth chặn
    #     ~2-3 lượt/phút theo IP, và MỖI mẻ trả một lượt đăng nhập);
    #   - `--grep` không khớp gì.
    # Bản đầu của script này in thẳng "--grep khớp sai" cho cả hai, và lần đầu
    # nó bắn thì nguyên nhân thật là 429 — tức phép kiểm chỉ ra sai hướng, tệ
    # hơn không có. Dừng luôn: một setup hỏng sẽ hỏng ở mọi mẻ sau và chỉ đốt
    # thêm ngân sách rate-limit.
    echo "[paced] mẻ $BATCH_NO chạy 0/$WANT test — ĐỌC LỖI Ở TRÊN TRƯỚC." >&2
    echo "[paced] 'sign-in trả 429' ⇒ chờ vài phút rồi chạy lại, KHÔNG phải lỗi --grep." >&2
    echo "[paced] Chỉ khi setup xanh mà vẫn 0 test thì mới nghi --grep." >&2
    exit 2
  fi

  if [ "$N" -ne "$WANT" ]; then
    echo "[paced] mẻ $BATCH_NO khai $WANT test nhưng CHẠY $N — --grep khớp sai." >&2
    FAILED=2
  fi
done

# ── 3. Đối chứng tổng ──────────────────────────────────────────────────────
echo "[paced] đã chạy $RAN / $TOTAL test"
if [ "$RAN" -ne "$TOTAL" ] || [ "$FAILED" -eq 2 ]; then
  echo "[paced] SỐ TEST KHÔNG KHỚP — script chia mẻ hỏng, mọi kết quả ở trên VÔ GIÁ TRỊ." >&2
  echo "[paced] (một mẻ khớp 0 test vẫn thoát 0; đó là thứ phép kiểm này gác.)" >&2
  exit 2
fi

exit "$FAILED"
