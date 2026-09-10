# P16 — lượt xác minh của lead, sau khi gộp 16.I

**Ngày:** 2026-09-11 · **Nhánh:** `feat/p16-frontend-rebuild` · **Nền:** `b6a3b91`

Lượt này không dựng gì mới. Nó xác minh hai thứ tôi đã sửa sau báo cáo 16.I, và nó tìm ra một
lỗi trong chính phép đo của mình trước khi tìm ra bất cứ điều gì về sản phẩm.

---

## 1. Phép xác minh đầu tiên của tôi đo nhầm artifact

Lượt `playwright test responsive.spec.ts` đầu tiên cho **13 ô đỏ**. Dòng đầu của output nói ra
nguyên nhân, và tôi suýt đọc lướt qua nó:

```
[e2e] base=https://dlp.192.168.94.130.sslip.io:30443
```

`E2E_BASE_URL` mặc định trỏ vào **cụm lab**, và cụm đang chạy một bản build có từ trước 16.D. Nên
13 ô đỏ đó không nói gì về mã tôi vừa sửa. Chạy lại đúng suite ấy vào build cục bộ:

| Base | Đỏ | Xanh | Skip |
|---|---|---|---|
| cụm lab (mặc định) | **13** | 17 | 11 |
| build cục bộ | **1** | 29 | 11 |

Mười hai ô chênh nhau là hiện vật của việc đo nhầm build, không phải hồi quy.

**Điều kiện để đo build cục bộ** — cả ba, thiếu một là rơi về cụm hoặc bám vào server cũ:

```
E2E_START_SERVER=1  E2E_BASE_URL=http://localhost:3000  E2E_ORIGIN=http://localhost:3000
```

`playwright.config.ts` đã ghi sẵn chính lớp lỗi này trong chú thích `reuseExistingServer: false`:
*"bám vào một server có sẵn nghĩa là đo một build CŨ mà vẫn báo cáo như build vừa tạo."* Cấu hình
biết trước; người chạy thì không, vì không có gì bắt buộc phải khai base.

**Hệ quả cho báo cáo 16.I:** nó **không ghi base nào cả**. Con số TTFB 43ms của nó gợi ý lượt
`perf` chạy cục bộ, nhưng lượt quét axe/CSP thì không xác định được. Đọc bảng 11 ô của nó với
điều kiện đó.

**Việc cần làm:** `e2e/env.ts` nên in base ở đầu MỌI lượt (nó đã in) **và** report mẫu nên có ô
bắt buộc ghi base. Một phép đo không khai môi trường là một phép đo không lặp lại được.

---

## 2. Lỗi tương phản — đối chứng A/B trong cùng môi trường

16.I báo axe `color-contrast` mức serious ở `paths/[id]/path-client.tsx`. Tôi gỡ `opacity-80`
(`b6a3b91`) rồi chạy axe và thấy xanh — nhưng một ô xanh sau khi sửa không chứng minh gì nếu bản
trước chưa được đo trong **cùng** môi trường. `opacity-80` chỉ áp khi bước chưa mở, nên nếu dữ
liệu seed không có bước khoá nào thì bản cũ cũng xanh.

Nên tôi khôi phục file cũ, build lại, chạy lại cùng lệnh:

| Bản | `axe /paths/:id` | Bộ chọn axe báo |
|---|---|---|
| trước (`opacity-80`) | **ĐỎ** `[serious] color-contrast` | `.opacity-80 > .justify-between… > .text-muted-foreground.text-xs` |
| sau (đã gỡ) | **XANH** | — |

Chuỗi bộ chọn khớp đúng chẩn đoán: lớp mờ ở tầng cha nhân xuống chữ đã sát sàn 4.5:1. Cổng
contrast của `packages/ui` mù với nó vì nó tính tương phản của **token**, còn opacity áp lúc
render, sau khi token đã qua cổng.

---

## 3. "Hồi quy nav" của 16.I không phải hồi quy

16.I báo `/lessons/:id` ở 1280px không có nav chính, và xếp nó là hồi quy của tám lane. Kiểm
`components/shell/immersive-routes.ts`: `/lessons` nằm trong `IMMERSIVE_CHILD_PREFIXES`, tức nav
bị gỡ **có chủ ý** theo §16.D.1, và brief của 16.B ghi rõ cấm gỡ hai tiền tố đó.

Khẳng định `toBeVisible()` ở `responsive.spec.ts:210` viết **trước** thay đổi ấy. Nếu để nguyên
chữ "hồi quy" trong báo cáo, người sửa tiếp theo sẽ gỡ hai tiền tố khỏi `immersive-routes.ts` và
phá đúng thứ 16.D được giao dựng.

Đã **chuyển** khẳng định sang `toBeHidden()` kèm lý do ghi tại chỗ, và **thêm** ô đối chứng trên
một route không-immersive ở cùng 1280px — một mình "immersive thì ẩn nav" xanh y hệt khi vỏ ngừng
dựng nav ở MỌI route. Cả hai ô xanh trên build cục bộ.

---

## 4. Lượt nghiệm thu đầy đủ: 32 màn, 0 skip

Skip không phải xanh. 23 màn vai-trò của lượt trước chưa từng được audit — đúng những màn mà
16.F, 16.G1 và 16.G2 vừa dựng lại, tức phần mã mới nhất.

`e2e/scripts/promote-role.sh` chạy qua `kubectl` nên chỉ dùng được với cụm. Đường tương đương tại
chỗ, ghi ra để lặp lại được:

```
1. pnpm start (nền)
2. POST /api/auth/sign-up/email  {email, password, name}   -> 200
3. docker exec dlp-postgres psql -U dlp -d dlp      -c "UPDATE users SET role='admin' WHERE email='e2e-admin@dlp.local';"
4. dừng server (playwright đặt reuseExistingServer:false, cổng bận là hỏng)
5. E2E_EMAIL + E2E_PASSWORD + E2E_REQUIRE_ROLES=1 + ba biến base ở §1
```

⚠ Bảng tên là `users`, không phải `user`. ⚠ Đặt CẢ HAI biến `E2E_EMAIL`/`E2E_PASSWORD` làm
`global-setup` **đăng nhập** thay vì đăng ký; tài khoản chưa tồn tại thì lượt chạy **0 ô** và
`stats` toàn số 0, không phân biệt được với một lượt sạch. `admin` thoả cả màn `author` lẫn
`admin` (`roleSatisfies`), nên một tài khoản đủ cho cả 23 màn.

**Kết quả (`a11y.spec.ts` + `csp.spec.ts`, build cục bộ, tài khoản admin, `E2E_REQUIRE_ROLES=1`):**

```
68 passed · 4 failed · 0 skipped
```

Bốn ô đỏ là **hai màn**, mỗi màn hai spec: `/problems/:code` và `/author/problems/:code`.

**30 trên 32 màn sạch cả axe lẫn CSP, không nới một chỉ thị CSP nào.**

---

## 5. Hai màn còn lại không đỏ vì sản phẩm — và cũng không tự đóng được

`problems` trong DB có **0 dòng**, và không có nguồn seed nào: `content/` không có thư mục
`problems`, `scripts/seed-content.mjs` không nạp bảng đó. Bài tập chỉ tồn tại sau khi có người
soạn qua `/author/problems/new`.

Nên ô AC §7 mục 1 nói "32 màn" trong khi **hai màn cấu trúc-không-thể chạm tới** trên một cài đặt
sạch. Đó không phải lỗi của lane nào; nó là một khoảng trống giữa danh sách màn và nguồn dữ liệu,
và nó chỉ lộ ra khi có người bật `E2E_REQUIRE_ROLES=1` và đọc cột skip.

Hai đường đóng, cả hai đều là quyết định chứ không phải việc vặt: thêm nguồn seed cho `problems`
(cùng đường với `content/quizzes`), hoặc cho harness tự soạn một bài tập rồi dọn.

---

## 6. Trạng thái cây

```
pnpm -w turbo run build lint typecheck test
Tasks: 32 successful, 32 total
web 1750 (148 file) · ui 872 (34 file) · games 402 · scenario 285
terminal 133 · motion 110 · copy 52 · shared-types 48        tổng 3652
node scripts/check-design-tokens.mjs -> exit 0, 562 file, đối chứng hai chiều
```
