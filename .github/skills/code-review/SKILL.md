---
name: code-review
description: Quy trình review pull request cho DevOps Learning Platform — thứ tự các lượt soi, cách xác minh một nghi ngờ thành bằng chứng trước khi comment, và thư viện lỗi đã thật sự xảy ra trong repo này. Dùng khi review bất kỳ PR nào, đặc biệt khi PR chạm tới sandbox/authz/token, biến môi trường, cổng CI, hay file sinh ra từ `proto/`.
---

# Review PR trong repo này

`.github/copilot-instructions.md` nói **soi cái gì**. File này nói **soi thế nào**
— thứ tự, cách xác minh, và những lớp lỗi đã thật sự lọt qua ở đây trước đó.

Viết nhận xét bằng **tiếng Việt**.

## Luật nền: một comment = một bằng chứng

Trước khi để lại bất kỳ comment nào, phải trả lời được cả ba:

1. **File nào, dòng nào** trong diff này gây ra nó.
2. **Kịch bản hỏng cụ thể**: input/trạng thái gì → hành vi sai gì. Không phải
   "có thể không an toàn" mà "nếu `.github/ci.env` chứa `` FOO=`id` `` thì
   `make test-ci` chạy `id`".
3. **Nếu đúng thì hậu quả là gì** — hỏng build, lộ dữ liệu, hay cổng CI xanh giả.

Không đủ ba thứ đó thì **đừng comment**. Repo này chặn merge cho tới khi mọi
thread được resolve, nên một comment sai không phải nhiễu vô hại — nó là công
việc thủ công bắt người ta phải làm.

Xếp mỗi phát hiện vào một trong ba mức, ghi rõ mức trong comment:

| Mức | Nghĩa |
|---|---|
| **Chặn** | Sai chức năng, lỗ hổng, hoặc cổng CI xanh giả. Phải sửa trước khi merge. |
| **Nên sửa** | Đúng nhưng mong manh — sẽ hỏng ở lần thay đổi kế tiếp. |
| **Ghi nhận** | Đáng biết, không cần chặn. Nói rõ là không cần sửa để merge. |

## Thứ tự các lượt soi

Đi đúng thứ tự này. Lượt 1–2 bắt được phần lớn lỗi thật với chi phí thấp nhất.

### Lượt 1 — Cổng có thật sự là cổng không?

Một cổng CI luôn xanh tệ hơn không có cổng, vì nó tạo niềm tin sai. Soi mọi thay
đổi trong `.github/workflows/`, `Makefile`, `scripts/`:

- `if: always()` mà không kiểm `result` của step trước → step sau chạy bất kể
  step trước hỏng.
- `|| true`, `continue-on-error: true`, `exit-code: 0` trên bước quét/lint.
- Vòng lặp chờ (`until`, `for i in $(seq ...)`) rơi xuyên qua khi hết lượt mà
  không `exit 1`.
- Job aggregate (`ci-ok`) không liệt kê job mới thêm → job đó hỏng nhưng
  `ci-ok` vẫn xanh.
- Điều kiện chỉ đúng ở một loại event. Cổng phải được thử trên **cả** `push` và
  `pull_request` — ref và quyền token khác nhau giữa hai event, và lỗi loại này
  chỉ lộ ở PR đầu tiên sau khi merge.

### Lượt 2 — Ma trận biến môi trường có khớp không?

Một biến môi trường phải xuất hiện đủ **4 nơi**. PR đổi env mà thiếu một nơi là
lỗi chặn:

| Nơi | Đường dẫn |
|---|---|
| Code đọc biến | `apps/web/src/server/env.ts`, hoặc code Go tương ứng |
| Mẫu cho dev | `.env.example` |
| Helm | `infra/helm/platform/values.yaml` (+ `values-cloud.yaml` / `values-selfhost.yaml` nếu khác theo môi trường) |
| CI | `.github/ci.env` |

Cổng `pnpm env:check` bắt việc này — nếu PR đổi env, nhắc chạy nó. Nếu PR thêm
directive `# env-check: allow-unused`, đọc kỹ: miễn trừ phải hẹp đúng một biến.

Biến `NEXT_PUBLIC_*` là ngoại lệ và là bẫy: Next nướng chúng vào bundle **lúc
build**. Thấy `NEXT_PUBLIC_*` được đặt trong Deployment/Secret của k8s → đó là
vô tác dụng, nêu ra.

### Lượt 3 — Bề mặt bảo mật

Chỉ chạy lượt này khi diff chạm `apps/web/src/server/**`, `src/middleware.ts`,
`src/app/api/**`, `services/**`, hay `infra/helm/platform/templates/sandbox-*`.

Giả định người dùng là **tác nhân cố ý đối kháng có root trong pod của họ**, không
phải người dùng bất cẩn. Với mỗi thay đổi ở mấy đường dẫn trên, hỏi:

- **IDOR**: handler có kiểm quyền **trên từng object** không, hay chỉ kiểm "đã
  đăng nhập"? Một `sessionId` từ client phải được đối chiếu với chủ sở hữu.
- **Token**: có bao giờ nằm ở URL, query string, hay log không? Chỉ được ở
  httpOnly cookie.
- **JWT**: `aud` có bị kiểm đúng service đích không? Token cho service A mà
  service B chấp nhận là lỗ hổng.
- **Cô lập sandbox**: NetworkPolicy, securityContext, resource limit — bất kỳ
  nới lỏng nào phải có lý do viết thành chữ ngay tại chỗ.
- **`/metrics`**: không có authz và lộ số session đang chạy. Nó **không được**
  lên Service hay ingress; chỉ ở port admin riêng.

Đối chiếu với 10 luật trong [../../SECURITY.md](../../SECURITY.md) — đó là tiêu
chí nghiệm thu có thể test, không phải khuyến nghị.

### Lượt 4 — Fallback im lặng

Repo này chọn **ném lỗi** thay vì đoán giá trị mặc định. Trên đường dữ liệu hoặc
credential, mấy dạng sau là lỗi:

- `?? 'localhost'`, `|| 'default'`, `|| 3000` cho giá trị cấu hình
- `catch {}` hoặc `catch { return null }` nuốt lỗi
- Go: `if err != nil { return nil }` không bọc, không log

Fallback được chấp nhận phải **có log và có chú thích giải thích vì sao**. Thiếu
một trong hai → nêu ra.

### Lượt 5 — Contract và file sinh ra

- Diff chạm `proto/` mà không kèm thay đổi trong `packages/shared-types/gen` hay
  `proto/gen/` → thiếu `pnpm proto`. Cổng `pnpm proto:check` bắt việc này.
- Ngược lại: sửa tay file trong `gen/` → lần `pnpm proto` kế tiếp xoá sạch.
- Ghim version: mọi GitHub Action ghim theo SHA, mọi plugin buf và base image
  ghim theo tag cụ thể. `@v4`, `:latest`, `:alpine` **đều là ref hợp lệ** —
  vấn đề không phải "thiếu tag" mà là tag **trôi**: cùng một chuỗi trỏ sang
  commit/image khác theo thời gian. Nêu ra khi ref không khoá version cụ thể
  (Action không ghim SHA; image không ghim tag đầy đủ hoặc digest).

## Thư viện lỗi đã thật sự xảy ra ở đây

Mấy lớp lỗi này đã lọt vào PR của repo này rồi. Soi lại chúng khi diff chạm vùng
tương ứng.

**`eval` nạp file env.** `eval "$(cat file)"` hoặc `eval $(grep ... file)` thực
thi command substitution và backtick nằm trong *giá trị*. File env có thể bị sửa
ở một branch khác. Parse từng dòng dạng `KEY=VALUE` rồi `export` an toàn.

**Trạng thái directive "dính" qua dòng không liên quan.** Một cờ kiểu
`pendingAllow` đặt bởi comment directive phải được **reset ở mọi dòng không phải
mục tiêu** — kể cả dòng trống và comment thường. Không reset thì chèn một dòng
trống là directive nhảy sang biến khác, làm yếu cổng mà không ai thấy.

**Đối số CLI không validate.** `new RegExp(undefined)` tạo regex `/undefined/`
chạy im lặng; regex sai cú pháp ném stack trace thay vì báo lỗi rõ và exit code
ổn định. Mọi option nhận giá trị phải kiểm có giá trị và giá trị hợp lệ.

**Gỡ công cụ khỏi image runtime nhưng còn sót anh em của nó.** Gỡ `npm`/`npx` mà
để lại `corepack` thì vẫn còn đường tải-và-kích-hoạt package manager khác trong
runtime. Khi diff thu hẹp bề mặt tấn công, kiểm cả họ công cụ chứ không chỉ cái
được nêu tên.

**Chèn đoạn văn giữa các hàng bảng Markdown.** Bảng bị tách thành hai bảng, bảng
sau không có header. Giữ mọi hàng liền nhau, đoạn văn xuống dưới.

## Báo nhầm đã xảy ra — đừng lặp lại

**Directive `go` với patch version là HỢP LỆ.** Đã có comment review báo
`go 1.26.5` trong `go.mod`/`go.work` là sai cú pháp và bắt đổi sang `go 1.26` +
`toolchain go1.26.5`. **Đó là báo nhầm.** Từ Go 1.21, directive `go` nhận cả
dạng `1.N` lẫn `1.N.P`. Bằng chứng trong chính repo này: cả 5 file (`go.work`,
`services/orchestrator`, `services/shared`, `services/terminal-gateway`,
`proto/gen/go`) đều dùng `go 1.26.5` không kèm `toolchain`, và `go list -m` +
`go vet ./...` đều exit 0, job Go trên CI xanh.

Đừng nêu lại. `toolchain` là thứ khác — nó ghim **bản toolchain đi tải về**, chứ
không phải cách viết patch version cho directive `go`.

Phần duy nhất còn đúng của comment đó: khi diff **thật sự** đổi version Go, kiểm
**mọi** file `go.mod`, không chỉ file đầu tiên — repo này có 4 module cộng
`go.work`, và lệch version giữa chúng mới là lỗi thật.

> Bài học tổng quát: trước khi báo một cú pháp là không hợp lệ, kiểm xem repo
> có đang chạy được với chính cú pháp đó không. CI xanh trên `main` là bằng
> chứng mạnh hơn trí nhớ về cú pháp.

## Đừng nêu mấy thứ này

Đã ghi trong `copilot-instructions.md`, nhắc lại ở đây vì chúng là nguồn nhiễu
lớn nhất trong repo này:

- Chú thích và tên biến tiếng Việt — có chủ đích.
- Chú thích dài giải thích một quyết định — đó là phong cách repo, đừng đề xuất
  xoá cho "gọn".
- Abstraction/interface cho code dùng một chỗ (YAGNI).
- Bắt lỗi cho tình huống bất khả thi.
- Ý kiến phong cách mà `prettier`/`eslint`/`golangci-lint` đã lo.
- **Thứ "còn thiếu" mà thật ra là hoãn có chủ đích.** Trạng thái hiện tại là P0.
  Kiểm `plans/devops-learning-platform/` trước khi báo một thứ là thiếu sót —
  phần lớn "thiếu" là P1–P4 đã lên lịch.

## PR nâng dependency

PR của Dependabot cần lượt soi khác hẳn — không có logic mới để đọc:

- Bump **major** → tìm breaking change ảnh hưởng repo, đừng chỉ nhìn CI. CI dừng
  ở lỗi đầu tiên, nên xanh-sau-một-fix không có nghĩa là hết breaking change.
- Bump chạm base image hay Action → kiểm lại việc ghim SHA/tag.
- Bump chỉ ở devDependency và CI xanh → không cần comment gì. Nói "không có phát
  hiện" còn hơn nặn ra một nhận xét.
