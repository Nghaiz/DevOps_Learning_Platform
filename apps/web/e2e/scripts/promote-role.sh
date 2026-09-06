#!/usr/bin/env bash
#
# Nâng vai trò một tài khoản: user → author | admin (D11).
#
# VÌ SAO LÀ SQL CHỨ KHÔNG PHẢI API: không có endpoint nào đặt vai trò lần đầu.
# `admin.users.setRole` (C4) là `adminProcedure` — nó đòi caller ĐÃ là admin,
# nên nó không thể tạo ra người admin đầu tiên. Vòng đó chỉ cắt được từ ngoài
# hệ thống, tức từ DB. Script này là đường CHÍNH THỨC để làm việc đó, chạy tay
# hoặc trong lượt e2e trên cụm; nó KHÔNG bao giờ chạy trong CI (CI không có cụm).
#
#   ./promote-role.sh <email> <user|author|admin>
#
# Env:
#   NAMESPACE   namespace của release platform (mặc định: default)
#
# THỨ TỰ QUAN TRỌNG — promote TRƯỚC, chạy suite SAU:
#
#   ./apps/web/e2e/scripts/promote-role.sh e2e-admin@dlp.local admin
#   E2E_EMAIL=e2e-admin@dlp.local E2E_PASSWORD=... pnpm --filter web e2e
#
# `global-setup.ts` đọc vai trò từ `/api/auth/get-session` MỘT LẦN lúc bắt đầu
# và ghi vào `account.json`; spec đọc lại từ đó. Promote sau khi suite đã khởi
# động thì DB đúng nhưng `account.json` vẫn nói 'user', và các spec vai-trò sẽ
# skip — im lặng, không đỏ.
set -euo pipefail

EMAIL="${1:-}"
ROLE="${2:-}"
NAMESPACE="${NAMESPACE:-default}"

if [ -z "$EMAIL" ] || [ -z "$ROLE" ]; then
  echo "dùng: $0 <email> <user|author|admin>" >&2
  exit 2
fi

# Enum `user_role` trong DB chỉ có ba giá trị (drizzle/0000 + 0005). Postgres sẽ
# từ chối giá trị khác, nhưng chặn ở đây cho thông báo đọc được — và để không
# chuỗi tuỳ ý nào đi tiếp về phía psql.
case "$ROLE" in
  user | author | admin) ;;
  *)
    echo "vai trò không hợp lệ: '$ROLE' (chỉ user | author | admin)" >&2
    exit 2
    ;;
esac

POD="$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/component=postgres \
  -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
if [ -z "$POD" ]; then
  echo "không tìm thấy pod postgres trong namespace '$NAMESPACE'." >&2
  echo "  kubectl get pods -n $NAMESPACE -l app.kubernetes.io/component=postgres" >&2
  exit 1
fi

# ── Vì sao SQL đi qua stdin thay vì nhồi vào `sh -c "…"` ────────────────────
# Bản đầu của script này nội suy $EMAIL/$ROLE vào một chuỗi `sh -c` lồng ba lớp
# nháy. Nó "trông đúng" và không cách nào đọc ra được là đúng hay sai — mà đây
# là mã chạy UPDATE với quyền chủ sở hữu DB. Heredoc trích dẫn ('SH') không nội
# suy gì cả; giá trị đi vào như THAM SỐ VỊ TRÍ, không như văn bản mã.
#
# Trong psql, `:'email'` là dạng trích dẫn an toàn: psql tự bọc nháy và escape.
# Nối chuỗi thẳng thì một dấu nháy đơn trong địa chỉ email là đủ đổi nghĩa câu.
#
# ON_ERROR_STOP=1 BẮT BUỘC: thiếu nó psql in lỗi ra stderr rồi vẫn exit 0, nên
# `set -e` không bắt được và script báo thành công cho một UPDATE đã hỏng. Cùng
# họ với bẫy `apt-get update exit 0 khi offline`.
#
# `-U "$POSTGRES_USER" -d "$POSTGRES_DB"` đọc env CỦA CHÍNH CONTAINER, không
# hardcode 'dlp': hai giá trị đó đến từ values Helm và đổi được theo release.
#
# ⚠ CTE `WITH … SELECT`, KHÔNG phải `UPDATE … RETURNING` trần. ĐO 2026-09-06:
# `psql -tA` vẫn in THẺ LỆNH sau các dòng RETURNING —
#
#     axG8q0VkxD7ySS6o8E32LrHFKBFY4eLs
#     UPDATE 1
#
# — nên `grep -c .` đếm ra 2 cho một lượt cập nhật đúng MỘT dòng, và cổng
# "phải khớp đúng 1 dòng" ngay bên dưới bắn nhầm vào chính đường thành công.
# `-t` chỉ bỏ tiêu đề cột và chân "(1 row)"; nó KHÔNG bỏ thẻ lệnh của câu không
# phải SELECT. Bọc trong CTE thì câu ngoài cùng LÀ một SELECT, và output chỉ
# còn đúng các dòng dữ liệu.
UPDATED="$(kubectl exec -n "$NAMESPACE" "$POD" -i -- sh -s -- "$EMAIL" "$ROLE" <<'SH'
set -eu
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -v ON_ERROR_STOP=1 \
     -v email="$1" -v role="$2" <<'SQL'
WITH promoted AS (
  UPDATE users SET role = :'role'::user_role, updated_at = now()
   WHERE email = :'email'
   RETURNING id
)
SELECT id FROM promoted;
SQL
SH
)"

ROWS="$(printf '%s' "$UPDATED" | grep -c . || true)"

# 0 dòng = email không tồn tại. PHẢI đỏ.
#
# Một lượt promote không-làm-gì trong im lặng là kịch bản tệ nhất của script
# này: DB vẫn 'user', `account.json` vẫn 'user', các spec /admin và /author
# skip vì "tài khoản không có vai trò", và suite XANH. Ô AC 13.G coi như đã
# được kiểm trong khi không lượt nào chạm tới nó.
if [ "$ROWS" -ne 1 ]; then
  echo "UPDATE khớp $ROWS dòng (mong đợi đúng 1) cho email='$EMAIL'." >&2
  echo "Tài khoản chưa tồn tại? Đăng ký nó trước rồi chạy lại." >&2
  exit 1
fi

# Đọc lại từ DB. `UPDATE … RETURNING` nói rằng lệnh đã CHẠY; nó không nói giá
# trị hiện tại là gì. Hai câu hỏi khác nhau, và chỉ câu thứ hai là thứ suite
# phụ thuộc vào.
ACTUAL="$(kubectl exec -n "$NAMESPACE" "$POD" -i -- sh -s -- "$EMAIL" <<'SH'
set -eu
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -v ON_ERROR_STOP=1 \
     -v email="$1" <<'SQL'
SELECT role FROM users WHERE email = :'email';
SQL
SH
)"

if [ "$ACTUAL" != "$ROLE" ]; then
  echo "đọc lại sau UPDATE ra vai trò '$ACTUAL', không phải '$ROLE'." >&2
  exit 1
fi

echo "$EMAIL → $ACTUAL (pod $POD, ns $NAMESPACE)"
echo
echo "Chạy suite VỚI tài khoản này (promote trước, suite sau — xem đầu file):"
echo "  E2E_EMAIL=$EMAIL E2E_PASSWORD=<mật khẩu> pnpm --filter web e2e"
