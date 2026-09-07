# Soát 14 ô nghiệm thu Phase 13 — bằng chứng đóng / chưa đóng

**Ngày:** 2026-09-06 · **Nhánh:** `feat/p13-frontend` · **HEAD lúc soát:** `1c1443e`
**Nguồn ô:** `plans/devops-learning-platform/phase-13.md:89–102` (hiện 0/14 tích)
**Phạm vi:** chỉ đọc. Không sửa mã, không tích ô, không chạm cụm, không chạy Playwright, không `next build`.

> ⚠ **Nhánh di chuyển dưới chân bản soát này.** Lúc phiên bắt đầu HEAD là `cf01c44`
> và `apps/web/e2e/keyboard.spec.ts` còn chưa track; giữa lúc soát lane khác đã
> commit tới `1c1443e` (7 commit, 22:10→22:31, trong đó `1c1443e` bump BỐN tag ảnh
> lên `:p13` + side-load). Mọi kết luận neo vào `1c1443e`.

---

## Đọc bảng này thế nào

Mỗi ô trả ba câu: **bằng chứng nào**, **bằng chứng đó có ĐỎ được không**, **còn thiếu gì**.

- **ĐÓNG** — có phép kiểm chạy được, đã đo, và nó ĐỎ được khi thứ nó gác hỏng.
- **CHỜ E2E** — phép kiểm tồn tại, thiết kế đủ chặt, nhưng cần lượt chạy trên cụm.
- **CHƯA** — không có bằng chứng, hoặc bằng chứng không thể đỏ đúng lớp lỗi mà ô nói.

---

## Ô 1 — Token là **một** nguồn; grep không thấy mã màu hardcode trong JSX

**Bằng chứng.** `packages/ui/src/theme/tokens.contract.test.ts` — đọc thẳng
`apps/web/src/app/globals.css`, khẳng định 23 token màu có ở **cả** `:root` lẫn
`.dark`, `@theme inline` map đủ `--color-*`, và **không có token THỪA** ngoài hợp
đồng C1. Cộng phép grep tôi tự chạy tại `1c1443e`:

```
grep -rnE '(slate|gray|zinc|neutral|stone)-[0-9]{2,3}' apps/web/src packages/ui/src \
  --include='*.tsx' --include='*.ts' | grep -vE '\.test\.tsx?:'   → 0
grep -rnE '#[0-9a-fA-F]{3,8}\b' apps/web/src packages/ui/src --include='*.tsx' \
  | grep -vE '\.test\.tsx?:'   → 1, và nó là CHÚ THÍCH (packages/ui/src/button.tsx:27)
```

**Đỏ được không?** Test token: **có, đã chứng minh**. Nó mang đối chứng hai chiều —
ghim `#313131` / 1.53:1 (trộn alpha đúng, sRGB gamma) SONG SONG với `#707070` /
4.01:1 (công thức linear-light sai đã từng chứng nhận cho đúng thứ nó sinh ra để
chặn), nên quay về công thức cũ là đỏ ngay chứ không phải "đẹp lên".

**Còn thiếu.** Nửa **grep không có cổng nào chạy nó**: không job CI, không
pre-commit, không test. Nó chỉ đỏ khi có người gõ tay — hôm nay là tôi. Ô này đóng
được bằng phép đo trên `1c1443e`, nhưng **không có gì giữ nó đóng**. Rẻ nhất: một
`it()` trong `packages/ui` đọc cây `.tsx` như `tokens.contract` đã đọc `globals.css`.

---

## Ô 2 — Dark mode chạy trên **mọi** trang, gồm cả terminal và editor

**Bằng chứng.** `packages/ui/src/theme/theme-provider.test.tsx` (16 ô: script init
trước paint, `localStorage` ném lỗi không sập, `system` đổi theo
`prefers-color-scheme`, bàn giao script⇄provider không nháy màu, khớp selector
`@custom-variant dark`). `apps/web/src/components/session/terminal-theme.test.ts` cho
terminal (tuỳ chọn hồ sơ thắng theme ứng dụng, giá trị lạ rơi về mặc định).

**Đỏ được không?** Với **cơ chế** — có. Với **"mọi trang"** — không có gì để đỏ:

```
grep -rn "dark" apps/web/e2e --include='*.ts'   → 0 (bỏ .artifacts)
```

Không một phép kiểm nào mở 22 màn hình D12 ở chế độ tối. Ô này hiện được đóng **gián
tiếp** qua ô 1 (không có màu cứng trong JSX ⇒ mọi màu đi qua token ⇒ token có đủ hai
theme). Suy luận đó đúng, nhưng nó là suy luận, không phải phép đo — và nó **không
phủ được editor**: `/ide` là iframe của Theia, theme của nó do Theia quyết, token của
ta không với tới.

**Còn thiếu.**
1. Một lượt quét 22 màn hình ở `.dark` (rẻ nhất: đặt class `dark` trong fixture
   `nav.ts` rồi chạy lại `a11y.spec.ts` trên `SCREENS` — `color-contrast` của axe khi
   đó đo trên màu tối thật).
2. Một câu nói rõ **editor Theia nằm ngoài phạm vi token**, hoặc một phép kiểm theme
   Theia. Hiện ô AC nói "gồm cả editor" mà không ai gác vế đó.

---

## Ô 3 — Mọi component mới có đủ 4 trạng thái loading/empty/error/disabled

**Bằng chứng.** Bảng 4 trạng thái CÓ THẬT trong `docs/design-system.md` §4a (dòng
277+, 82 dòng bảng trong file). `packages/ui/src/exports.contract.test.ts` gác bề mặt
export: mọi tên C2 phải export được, và **không export nào ngoài hợp đồng**
(`NON_C2_EXPORTS` phải khai tường minh). 27 file test trong `packages/ui`.

**Đỏ được không?** **Không, cho đúng thứ ô này nói.** Đo:

```
grep -rn "design-system.md" --include='*.ts' --include='*.tsx' --include='*.mjs' \
  packages apps scripts | grep -iE "readFileSync|readFile|resolve|join"   → rỗng
```

**Không một test nào ĐỌC `docs/design-system.md`.** `exports.contract.test.ts` chỉ
*nhắc* tới nó trong thông báo lỗi. Nên: thêm một component mới, khai nó vào
`C2_EXPORTS`, **quên hẳn bảng 4 trạng thái** — suite vẫn xanh. Đó chính là chế độ
hỏng mà ô AC ("checklist trong `docs/design-system.md`") tồn tại để chặn.

**Còn thiếu.** Một cổng đọc bảng markdown và đối chiếu tập hàng với `C2_EXPORTS` theo
**hai chiều**: hàng thiếu ⇒ đỏ, hàng thừa (component đã xoá) ⇒ đỏ. Đúng khuôn
`pinned-baseline-test-companion`. Cho tới lúc đó ô này là lời hứa, không phải phép đo.

---

## Ô 4 — Font phủ đủ dấu tiếng Việt; kiểm bằng một chuỗi có đủ dấu nặng/ngã/ơ/ư

**Bằng chứng.** `apps/web/src/app/layout.tsx:4,34` — `Be_Vietnam_Pro` từ
`next/font/google`, biến `--font-be-vietnam-pro`. `tokens.contract.test.ts` khẳng định
`--font-sans` chứa `var(--font-be-vietnam-pro)`, chứa `system-ui` (fallback thật), và
**không** chứa `poppins`.

**Đỏ được không?** Chỉ với **chuỗi CSS**, không với **glyph**. Cả ba khẳng định đó vẫn
xanh trong hai ca hỏng thật:

- `subsets` mất `'vietnamese'` ⇒ biến vẫn đúng tên, `--font-sans` vẫn đúng chuỗi, nhưng
  file font tải về không có dấu ⇒ trình duyệt rơi về fallback cho đúng những ký tự có
  dấu. Không lỗi build, không lỗi runtime.
- `next/font` cần internet lúc build; nếu lượt build image bị chặn mạng thì font không
  được tự host. Kiểm bằng `ls` thư mục sẽ xanh oan — đúng lớp lỗi
  `verify-files-not-directories-in-image`.

Đo: `grep -rniE "font|dấu" apps/web/e2e` → **0 phép kiểm font nào**.

**Còn thiếu.** Hai thứ, cả hai rẻ:
1. Khẳng định `subsets` chứa `'vietnamese'` (đọc `layout.tsx`, cùng khuôn `tokens.contract`).
2. Một phép đo glyph trong Playwright: render `"Quặng ngã ươn ạ ữ ỡ ợ ẵ"` và một chuỗi
   latin cùng độ dài, khẳng định **cùng một font family** phục vụ cả hai. Đây là phép
   kiểm duy nhất đỏ được khi subset mất.

---

## Ô 5 — 4 trình học chạy end-to-end **trên cụm thật**, không phải mock

Bốn trình học theo plan 13.D: **lesson · lab · quiz · playground**.

| Trình | Luồng | Có đi tới CHẤM không |
|---|---|---|
| lesson | `flows/lesson.flow.spec.ts` | **Có.** Đăng nhập qua FORM (jar cookie rỗng, không dùng `storageState`) → đi bằng link nav (không `goto`) → mở bài THẬT lấy từ API → bấm "Tiếp" tối đa 20 bước tới khi gặp "Kiểm tra" → bấm → khẳng định `CheckResultPanel` hiện, và **"Không chấm được" phải VẮNG** (tách lỗi hạ tầng khỏi "chưa đạt") → kết thúc phiên. |
| lab | `flows/lab.flow.spec.ts` | **Có.** Bảng task → chấm MỘT task → điểm tổng → nộp → bảng xếp hạng. |
| quiz | `flows/quiz.flow.spec.ts` | **Có.** Chọn → nộp → banner điểm → nhãn từng câu → khoá bài sau chấm. |
| **playground** | **KHÔNG CÓ** | — |

**Đây là ô CHƯA đóng, không phải chờ.** `playground` là một trong bốn trình học và
**không có luồng `@flow` nào**. Thứ gần nhất là `keyboard.spec.ts:515+`, mở một phiên
sandbox thật trên `/playgrounds/:id` để đo Esc — nhưng nó đo bàn phím, không đo trình
học: không kiểm **TTL hiện trước khi bắt đầu** (plan 13.D mục 15 — nội dung ô AC riêng
của playground), không kiểm kết thúc phiên. Và lượt 20:52 hôm nay nó **ĐỎ** (xem ô 10).

**Còn thiếu.** Một `playground.flow.spec.ts` (TTL hiện trước khi bấm → Bắt đầu →
terminal sống → Kết thúc), hoặc chủ dự án hạ ô xuống "3 trình học" một cách tường minh.

---

## Ô 6 — Layout `ide` hiện đúng khi `interfaceLayout === 'ide'`, và **không** hiện khi không có cờ

**Bằng chứng.** `apps/web/src/components/session/ide-layout.test.ts` — có cả vế âm
(vắng cờ, cờ khác, hoa/thường/khoảng trắng không khoan dung) lẫn vế dương, cộng
`ideSessionUrl` escape id.

**Đỏ được không?** Với **hàm thuần** — có. Với **hành vi** — vế dương chưa từng chạy:

```
grep -rn "interfaceLayout" content/            → 0
grep -rn '"layout"'        content/            → 0     (143 file trong content/)
grep -rn "iframe|frameLocator" apps/web/e2e    → chỉ csp.spec.ts, và đó là đối chứng
                                                  "iframe origin KHÁC bị chặn"
```

**Không một mục nội dung nào trên cụm khai cờ `ide`.** Nên khoang IDE chưa bao giờ
render trên bản deploy, `/ide/session/{id}/` chưa bao giờ được nạp vào một `<iframe>`
bởi bất kỳ phép kiểm nào, và cả hạ tầng D8 (ingress path `/ide`, cookie `dlp_sandbox`
thứ hai `Path=/ide`) chưa có gì chứng minh nó hoạt động end-to-end. Header bảo mật
trên `/ide` mà lượt deploy đã đo chỉ chứng minh **đường đi tới gateway sống**, không
chứng minh **iframe nạp được với cookie**.

Thêm: `shouldShowIdePane` chỉ có **một** call-site — `lesson-client.tsx:270`. Lab và
playground không đọc cờ này (có thể đúng ý đồ; plan 13.D mục 12 chỉ nói lesson, nên
tôi không coi đó là lỗi).

**Còn thiếu.** Một mục nội dung (dù chỉ một bài thử) khai `layout: ide`, cộng một phép
kiểm mở nó và khẳng định `iframe[src^="/ide/session/"]` nạp được (không `about:blank`,
không lỗi CSP `frame-src`). Không có nó, vế dương của ô này là niềm tin.

---

## Ô 7 — "Còn N chỗ" phản ánh trần thật của P12; chạm trần thì báo trước

**Mẫu số phải là 20 — và nó được ghim ở BA nơi, tất cả suy ra từ 23 − 3:**

| Nơi | Khẳng định |
|---|---|
| `services/orchestrator/internal/lifecycle/capacity_test.go:52` | `SoftCapacity == 20`, chú thích ghi rõ `= HardCapacity 23 − PoolTarget 3` |
| cùng file, `TestSoftCapacityLaHieuChuKhongPhaiHangSo` | **cổng chính**: bảng ca (hard, pool) → soft; đỏ ngay khi ai đó "đơn giản hoá" `softCapacity()` thành một field đọc thẳng |
| `services/orchestrator/internal/grpcserver/session_service_test.go:261` | `GetCapacityResponse{ActiveSessions:3, SoftCapacity:20, PoolFree:1}` |
| `apps/web/src/server/capacity/get-capacity.test.ts:42` | `view.softCapacity === 20`; chú thích nêu đúng chế độ hỏng: lấy nhầm `hard_capacity` ra **23** — một con số HỢP LÝ, nên không ai nhận ra |

Nguồn của 23/3: `infra/helm/platform/values-selfhost.yaml:164,176` (`poolTarget: '3'`,
`capacityHardLimit: '23'`, kèm chú thích "FE hiện TRẦN MỀM = 23 − 3 = 20"). Không lưu
derived: `capacity.go:68 softCapacity()` tính lúc đọc.
`orchestrator-deployment.yaml:174` có `{{ fail }}` chặn key cũ `capacitySoftLimit` —
tức bẫy `helm --reuse-values` đã được gác tường minh.

**Vế "báo trước".** `describeCapacity` ba mức (`ok` / `low` ở 20% trần / `full`), ngưỡng
**co giãn theo trần** chứ không cứng, và có ô riêng chống hằng-số-viết-tay
(`view(4,8)`→"Còn 4 chỗ", `view(4,30)`→"Còn 26 chỗ"). Đã **nối dây thật**:
`CapacityIndicator` render ở `app-shell.tsx:131,230`; `describeCapacity` được gọi ở
`session-controls.tsx:61` (cảnh báo đứng **cạnh nút Bắt đầu**, không chỉ trên thanh đầu
trang), `me/active-sessions.tsx:87`, `admin/overview-client.tsx:93`.

**Đỏ được không?** Có, ở cả hai đầu (Go và TS), và cổng "là hiệu chứ không phải hằng"
đỏ đúng lớp lỗi mà `no-derived-fields` nói tới.

**Còn thiếu (nhỏ).** Không phép kiểm nào chứng minh **pod đang chạy trên cụm** thật sự
nhận `CAPACITY_HARD_LIMIT=23` / `POOL_TARGET=3` — đó là sự thật lúc deploy, không phải
lúc test; một `kubectl exec … env` một dòng trong report đợt 3 là đủ. Và không có phép
kiểm nào cho **chính lượt 429**: ta chứng minh có cảnh báo TRƯỚC, chưa chứng minh nếu
vẫn ăn 429 thì câu báo ra vẫn tử tế.

---

## Ô 8 — `lessons.list` phân trang **ở tầng nguồn** (đóng nợ P2)

**Bằng chứng.** `apps/web/src/server/content/repository-page-sql.integration.test.ts` —
và nó chọn đúng phương pháp: **đọc SQL ĐÃ SINH** qua `drizzle` logger, không đọc
TypeScript rồi tin.

- có cursor ⇒ `"id" > $n`, `order by "id" asc`, `limit $n`, **KHÔNG offset**
- không cursor ⇒ vẫn có `order by`, không có `id >`
- `limit + 1` đẩy xuống Postgres (n+1 để biết `hasMore`, không `COUNT` riêng)
- lọc `difficulty` / `capability` (`jsonb @>`) áp **TRƯỚC** `limit`, kèm **đối chứng âm**
  cho năng lực không ai có
- `orderBy=difficulty|duration` đẩy `ORDER BY`/`coalesce` xuống DB, vị từ keyset theo HÀNG
- một khối chạy trên **Postgres thật**: cursor trỏ id chỉ có ở nguồn DB; cursor vượt mọi
  id ⇒ trang rỗng chứ không quay về trang 1

Router đã đi đường mới: `apps/web/src/server/trpc/routers/lessons.ts:249` gọi
`scenarioSource().listPage(...)`.

**Đỏ được không?** Có, và nó bắt đúng hai chế độ hỏng mà bản viết-lại-cho-gọn hay mắc
(đổi keyset thành `OFFSET`; bỏ `ORDER BY`, khi đó mọi test in-memory vẫn xanh). File
header tự nói vì sao `db-source.test.ts` **không** đủ: bộ kia dựng repository giả trên
chính `paginateSorted`, tức kiểm helper hai lần và kiểm SQL không lần nào. Test **không
skip** khi thiếu Postgres — nó ném lỗi kết nối, nên không có ca "xanh vì bỏ qua".
`vitest.config.ts` include `src/**` nên nó thật sự chạy trong lượt 1876 test.

**Còn thiếu.** Không có gì. Ô này đóng.

---

## Ô 9 — Đáp án quiz không có trong payload FE nhận (kiểm bằng network trace)

**Bằng chứng — có phép kiểm PAYLOAD THẬT, không chỉ type.**
`apps/web/src/security/paths-quiz-authz.test.ts:216`:

```ts
const { quiz } = await caller(LEARNER).quiz.get({ quizId: QUIZ_ID });
const wire = JSON.stringify(quiz);
expect(wire).not.toContain('isCorrect');
expect(wire).not.toContain('explanation');
expect(wire).toContain('kubectl get pods -A');   // ← đối chứng dương
```

Dòng cuối là thứ khiến hai dòng trên có nghĩa: một payload rỗng cũng "không chứa
isCorrect". Ba lớp cộng lại:

1. **Compile** — `packages/shared-types/src/quiz-dto-leak.test.ts`, các dòng
   `@ts-expect-error`. Đây là khẳng định NGƯỢC: gỡ `isCorrect?: never` khỏi
   `QuizChoiceForLearner` thì chỉ thị thành thừa và `typecheck` GÃY. Tức **cổng tự báo
   động khi chính nó bị tháo** — hiếm. Có cả ô cho ca mảng (nơi excess-property check
   của TS không tới).
2. **Runtime schema** — `.strict()` từ chối, kèm đối chứng dương (bản đã bóc đáp án PHẢI qua).
3. **Payload** — ở trên.

**Kênh dữ liệu đã kiểm đủ chưa?** Có. `app/quiz/[id]/page.tsx` là Server Component **chỉ
kiểm auth rồi render `<QuizClient>`** — không nhét dữ liệu quiz vào RSC payload.
`quiz-client.tsx` gọi đúng hai procedure: `quiz.get` và `quiz.submit`. Nên `quiz.get` là
kênh DUY NHẤT trước khi nộp, và nó đã bị gác.

**Đỏ được không?** Có, cả ba lớp.

**Còn thiếu — đúng chữ của ô.** Phép kiểm đi qua `createCaller`, tức **giá trị router
trả về**, không phải **body HTTP**. Hai ghi chú:

- Về hướng rò, đó là proxy **an toàn**: superjson có thể làm rơi field, không thể thêm
  field. Router sạch ⇒ dây sạch.
- Nhưng ô AC viết "kiểm bằng **network trace**", và repo **có sẵn** khuôn đi qua
  `fetchRequestHandler` (`apps/web/src/security/test-helpers.ts`, đã dùng ở
  `trpc-error-leak.test.ts`, `content-source-error.test.ts`). Chuyển ô này sang khuôn đó
  là ~10 dòng và đóng đúng chữ của ô.

Tôi coi ô này **ĐÓNG về thực chất**; nếu chủ dự án muốn đóng đúng **chữ**, thêm một
`it()` dùng `test-helpers` là xong.

---

## Ô 10 — axe **0** lỗi serious/critical trên mọi route; bàn phím; Esc thoát terminal

Ô này có ba vế; chúng không cùng trạng thái.

### 10a — axe

`apps/web/e2e/a11y.spec.ts` quét đủ 22 màn hình `SCREENS`, và mang **bốn** cổng
chống-xanh-giả, cái nào cũng đúng chỗ:

- `test('danh sách màn hình D12 không bị rút ngắn')` — `SCREENS.length ≥ MIN_SCREENS(22)`
  + không trùng path. Rút danh sách xuống 2 dòng thì mọi test khác vẫn PASS, chỉ ít hơn
  — ô này biến việc đó thành lỗi có tên.
- `expect(results.passes.length).toBeGreaterThan(0)` mỗi lượt quét — trên một document
  rỗng thì `violations` VÀ `passes` đều rỗng, và `violations: []` khi đó đọc y hệt một
  trang sạch.
- **đối chứng dương** — dựng trang hỏng cố ý bằng `setContent` **trên origin thật** (nên
  đồng thời chứng minh axe tiêm được vào trang đang chịu CSP thật), neo vào `image-alt`
  + `button-name` (đều `critical`, ổn định qua các bản axe-core); cố ý **không** neo
  `color-contrast` vì nó chập chờn.
- `E2E_REQUIRE_ROLES=1` — biến 5 màn hình vai-trò bị `skip` thành đỏ. "Một lượt skip
  sạch không phải một lượt xanh."

Thêm: `MUST_NOT_FIRE = ['landmark-unique','landmark-no-duplicate-main','landmark-one-main']`
được **nâng lên mức chặn**, kèm ghi chú nói thẳng rằng hợp đồng §C6bis đã SAI khi khẳng
định `<main>` kép "làm axe đỏ" — axe xếp chúng `moderate`, dưới ngưỡng serious/critical.
Đó là đúng cách xử một hợp đồng sai: liệt kê tường minh, không hạ ngưỡng chung.

### 10b — câu hỏi của chủ dự án: **axe KHÔNG có luật contrast cho viền**

Đúng, và cả hai file đều biết. `a11y.spec.ts` mở đầu bằng đúng câu đó;
`tokens.contract.test.ts` nhận phần axe bỏ lại:

- `NON_TEXT_PAIRS` đo **SC 1.4.11 (≥3:1)** cho `--input` (viền ô nhập / rãnh Switch) trên
  `--background`, `--card`, **và `--muted`** (ràng buộc riêng, không suy ra được từ hai
  cặp kia), cho `--ring` trên `--background`/`--card`, và cho `--primary`/`--destructive`
  trên `--background`.
- `measureLayered()` cho ca **ba lớp**: núm Switch (`--background`, đục) trên rãnh
  (`--input`, trắng 16%) trên nền trang/card — cặp mà `measure()` không diễn đạt nổi.
- Token **trong suốt** phải được đè lên nền trước khi đo; thiếu nền là **NÉM LỖI**, không
  im lặng bỏ alpha.
- `--border` **cố ý** không nằm trong danh sách, có lý do viết ra (ranh giới trang trí,
  ngoại lệ "pure decoration" của SC 1.4.11) + số đo ở `docs/design-system.md` §1a. Đó là
  một QUYẾT ĐỊNH có số, không phải chỗ bỏ sót.
- Miễn trừ `--ring` cạnh mặt nút tô đặc được **chứng minh bằng quét vét cạn** 1001 điểm
  độ chói ⇒ đúng 0 nghiệm, kèm hai đầu mút; và nó có **companion**
  (`--primary`↔`--card` = 6.20:1 < 9:1) đỏ khi miễn trừ hết cần thiết. Miễn trừ đứng vững
  chỉ chừng nào `ring-offset` thật sự render — được gác bằng class trong DOM ở
  `button/switch/checkbox/toast/step-nav` test.

⇒ **Trả lời trực tiếp: vế contrast-của-viền đóng bằng `tokens.contract.test.ts`, không
bằng axe.** Và đó là phép kiểm chạy **cục bộ, không cần cụm** — nó đã nằm trong 1876
test xanh.

**Lỗ còn lại của 10b:** contrast được gác ở tầng **token**, không ở tầng **pixel đã
render**. Một component dùng nhầm token (viền `border-border` thay vì `border-input` trên
một control) đi qua sạch cả axe lẫn `tokens.contract`. Không có gì gác việc đó ngoài mắt người.

### 10c — bàn phím + Esc

`apps/web/e2e/keyboard.spec.ts` (714 dòng) — thứ tự Tab, không `tabindex` dương, **dấu
focus đo bằng PIXEL** (không bằng CSS), không bẫy bàn phím, link "Bỏ qua điều hướng" là
điểm dừng đầu tiên, điều hướng tới từng mục **chỉ bằng bàn phím**, mở bài học đầu tiên
chỉ bằng bàn phím. Có **đối chứng dương**: tắt hết dấu focus thì phép kiểm PHẢI báo
"identical". D10 có cả ô **tiền đề** (phím Playwright gõ là phím thật, `timeStamp` đo
được, 700ms > cửa sổ 500ms) trước khi kết luận gì.

**Trạng thái đo được — và đây là phần cần nói thẳng.**
`apps/web/e2e/.artifacts/test-results/` còn **4 thư mục lỗi**, mtime 20:49–20:52 hôm nay:

| Test | Lỗi |
|---|---|
| `bàn phím … tabindex dương trên settings` | `/settings → HTTP 404` |
| `bàn phím … bẫy bàn phím trên settings` | `/settings → HTTP 404` |
| `bàn phím … có dấu focus nhìn thấy được` | `/settings → HTTP 404` |
| `D10 … Esc thì KHÔNG rời terminal` | `getByRole('button',{name:'Bắt đầu'})` không thấy sau 15s trên `/playgrounds/:id` |

Đọc đúng bốn dòng đó:

- `/settings` **có trong mã** (`apps/web/src/app/settings/page.tsx` tồn tại), nên 404 là
  **ảnh cũ hơn nhánh**, không phải route thiếu. Bản thân harness đã nói trước điều này
  trong thông báo lỗi.
- Nhãn nút cũng **khớp**: `session-controls.tsx:55` `startLabel = 'Bắt đầu'`,
  `flow-kit.ts:111` tìm đúng chuỗi đó. Nên lỗi playground cùng loại.
- Cả 4 lượt chạy **TRƯỚC** commit `1c1443e` (22:31) đã bump BỐN tag ảnh lên `:p13`.

⇒ Chúng **không** chứng minh ô này hỏng, nhưng cũng **không** chứng minh nó đạt.
`results.json` (21:28) là một lượt `--list --grep @khong-ton-tai` → `No tests found` —
một phép thử harness, **không phải lượt nghiệm thu**. Hiện chưa có bản ghi lượt chạy nào
đóng được ô này.

---

## Ô 11 — Playwright 6 luồng chính xanh trên cụm thật

Sáu luồng tồn tại, đều gắn `tag: '@flow'`, và đều đi tới đích chứ không chỉ mở trang:

| # | File | Đích |
|---|---|---|
| 1 | `lesson.flow.spec.ts` | đăng nhập qua FORM → chọn bài từ nav → học → **chấm** → kết thúc phiên |
| 2 | `lab.flow.spec.ts` | bảng task → chấm một task → điểm tổng → nộp → bảng xếp hạng |
| 3 | `quiz.flow.spec.ts` | làm → nộp → banner điểm → nhãn từng câu → khoá bài |
| 4 | `path.flow.spec.ts` | chi tiết → **ổ khoá cả hai chiều** → mở item |
| 5 | `author.flow.spec.ts` | tạo → sửa → kiểm tra trước → xuất bản → thấy kết quả chạy thử → dọn |
| 6 | `admin.flow.spec.ts` | sức khoẻ → users (+rào đổi vai trò) → phiên → nội dung → nhật ký |

**Chưa có bản ghi lượt chạy nào.** Ô này **CHỜ E2E**.

**Một cảnh báo cho lúc đọc kết quả.** Luồng 6 xanh **không** chứng minh admin kết thúc
được phiên người khác (D15): `admin.flow.spec.ts:78` chỉ khẳng định nút "Kết thúc" hiện
**nếu** có phiên sống; không có phiên thì nó ghi annotation `chua-do` và **vẫn xanh**.
Commit `14734b1` cùng ngày đã ghi nhận: "D15 không có luồng tự động nào phủ — ghi phép
đo tay cho đợt 3". Đừng để một luồng 6 xanh đọc thành "D15 đã kiểm".

---

## Ô 12 — 0 vi phạm CSP mới, **có đối chứng dương**

`apps/web/e2e/csp.spec.ts` là file tốt nhất trong bộ này về mặt "biết mình đo gì".

**Máy thu hai đường** (listener DOM `securitypolicyviolation` + CDP `Log.entryAdded`, để
bắt cả vi phạm trong iframe/worker).

**Ba đối chứng dương trên BA chỉ thị khác nhau**, và file nói rõ vì sao hai cách hiển
nhiên đều **không** dùng được:

- `createElement('script')` + `appendChild` **không** sinh vi phạm — đúng định nghĩa `'strict-dynamic'`.
- **Mọi mã qua `page.evaluate()` / `page.setContent()` được Chromium MIỄN TRỪ CSP** (đi
  qua CDP `Runtime.evaluate`, không qua parser của trang). Đo được: `eval()` trong
  `page.evaluate` không bị chặn dù `script-src` không có `'unsafe-eval'`. ⇒ ai thử tiêm
  mã sẽ thấy 0 vi phạm rồi kết luận "máy thu hỏng" hoặc, tệ hơn, "trang này sạch".

Nên đối chứng đúng là chèn thẻ `<script>` vào **HTML THẬT** qua `page.route` (giữ nguyên
header ⇒ giữ nguyên CSP + nonce) — parser của trang phân tích nó, và `strict-dynamic`
không truyền lòng tin cho script do parser chèn. Cộng thêm:

```ts
expect(await page.evaluate(() => window.__cspPwned)).toBeUndefined();
```

**Sự kiện đã bắn ≠ mã đã bị chặn** — phân biệt mà hầu hết bộ kiểm CSP bỏ qua, và nó là
khác biệt giữa "CSP đang chặn" với "CSP chỉ đang báo cáo".

Hai đối chứng còn lại: `img-src` (ảnh origin khác) và **`frame-src` (iframe origin khác
bị chặn — D8)**, cộng ô khẳng định CSP khai `frame-src` tường minh và ô khẳng định script
khởi tạo theme mang **đúng nonce của header**.

**Đỏ được không?** Có — thiết kế để đỏ, và đã nghĩ qua ba cách nó có thể xanh giả.
**Còn thiếu:** chỉ là lượt chạy. **CHỜ E2E.**

---

## Ô 13 — Responsive: ≤768px đọc được nội dung, terminal báo rõ thay vì vỡ

**Đây là ô hỏng nặng nhất, và nó đang trông giống một ô đã xong.**

Có đủ mọi thứ trừ thứ quan trọng nhất:

- `apps/web/src/components/shell/breakpoints.ts` — ba hằng có nghĩa tách bạch
  (1280 / 768 / 1024), chú thích giải thích vì sao 768 ≠ 1024, vì sao dùng `min-[769px]:`
  chứ không `md:` (lệch một pixel).
- `breakpoints.test.ts` — 3 ô, xanh.
- `narrow-screen-notice.tsx` — component có thật, nhãn "Cần màn hình rộng hơn (≥1024px) để mở terminal".
- `shell/index.ts` export cả hai.

Và rồi:

```
grep -rn "meetsTerminalWidth" apps/web/src packages
  → chỉ breakpoints.ts (định nghĩa), breakpoints.test.ts (test), shell/index.ts (export)
    KHÔNG CÓ CALL-SITE NÀO

grep -rn "NarrowScreenNotice" apps/web/src --include='*.tsx'
  → chỉ narrow-screen-notice.tsx (định nghĩa) và shell/index.ts (export)
    KHÔNG ĐƯỢC RENDER Ở ĐÂU

grep -rnoE '(min|max)-\[[0-9]+px\]:' apps/web/src --include='*.tsx'
  → 11 hit, TẤT CẢ là min-[769px]. KHÔNG hit nào ở 1024/1023.

grep -rniE "narrow|hẹp|1024" apps/web/src/components/session/ \
     apps/web/src/app/{lessons,labs,playgrounds} --include='*.tsx'   → rỗng
```

⇒ **Hành vi "terminal báo rõ thay vì vỡ" chưa được nối dây.** Hằng số, hàm và component
đều tồn tại và đều có test xanh; **không gì gọi chúng**. Đúng lớp lỗi
`check-call-site-before-declaring-done` + `wired-not-just-present`.

Nửa còn lại cũng trống: `playwright.config.ts:92` khai **đúng một** project
(`Desktop Chrome`), và `setViewportSize` không xuất hiện ở bất kỳ spec nào. Không phép
kiểm nào từng mở trang ở ≤768px.

**Còn thiếu.**
1. Nối `NarrowScreenNotice` vào khoang terminal của lesson/lab/playground, gác bằng
   `meetsTerminalWidth`.
2. Một project Playwright thứ hai (viewport 390×844 hoặc `devices['iPhone 13']`) chạy
   `SCREENS`, khẳng định nội dung đọc được **và** khoang terminal hiện thông báo thay vì
   render xterm.
3. Cho tới lúc đó, ô này **CHƯA**, và `breakpoints.test.ts` xanh là ví dụ mẫu của
   `green-that-proves-nothing`: nó gác một hằng số mà không ai đọc.

---

## Ô 14 — Không màn hình/route/chuỗi nào liên quan giá, gói cước, thanh toán (BA lớp)

Ô này tự đòi ba lớp. Hai lớp mạnh, một lớp yếu.

### Lớp 1 — lệnh grep ở § Verify commands: **MẠNH, và đã vượt xa bản trong plan**

Bản trong `phase-13.md:124` chạy sạch trên `1c1443e` (tôi chạy verbatim → `EXIT=1`).
Nhưng thứ thật sự gác là `scripts/check-no-commerce.mjs`:

- **8 gốc quét** — `apps/web/src`, `apps/web/e2e`, `apps/web/drizzle`,
  `packages/{ui,scenario,shared-types,terminal}/src`, **và `content/`** (scenario vendor
  về từ upstream quảng cáo bản trả phí là đúng thứ phải bắt).
- **tự-kiểm dương + âm chạy TRƯỚC khi quét cây**; tự-kiểm hỏng ⇒ thoát 2, không quét gì.
  Chủ dự án đã đo: 18 mẫu vi phạm bị bắt, 31 mẫu sạch không kêu, 455 file.
- scope `all` vs `code` — `content/` được phép nói "nâng cấp cluster", "nâng cấp gói phần
  mềm bằng apt". Không có tách này thì cổng kêu oan và bị tắt trong hai tuần.
- **chạy trong CI**: `.github/workflows/no-commerce.yml`, mọi push. Ghi chú trong script
  nói thẳng vì sao script thay grep: bản grep cũ (a) **0 job CI nào chạy**, (b) bơm 9
  dòng paywall giả thì **4 LỌT** — "Nâng cấp để mở khoá — 199.000đ/tháng", "Học phí trọn
  gói", "Mua khoá học", "Bản Pro — 99k/tháng".
- không có lối thoát inline (`// commerce-gate: allow`) — cố ý.

**Đối chứng riêng của tôi trên máy này** (memory cảnh báo grep tiếng Việt):

```
grep -niE 'price|gói cước|thanh toán|nâng cấp gói' <4 dòng mẫu>   → 4/4 khớp, EXIT=0
grep -niF 'gói cước'                               <cùng file>    → Aborted, EXIT=134
```

⇒ mẫu tiếng Việt dưới `-iE` **thật sự khớp** (lớp 1 đỏ được), còn `-iF` thì **abort
SIGABRT** chứ không chỉ "trả 0 trong im lặng" như memory ghi — đáng cập nhật memory.

**Lỗ của lớp 1:** `services/` (Go), `infra/` (helm), `proto/` **nằm ngoài `ROOTS`**. Với
một ô nói về "màn hình/route/chuỗi" thì có thể chấp nhận, nhưng nên nói ra.

### Lớp 2 — test tiếng Việt trên chuỗi UI: **CÓ, và rộng hơn ô AC liệt kê**

- `components/shell/nav.test.ts:31` — không mục nav nào dính chuỗi thương mại VN
- `components/shell/capacity.test.ts:81` — câu "Hết chỗ" **chỉ sang việc kết thúc một
  phiên, không sang việc mua thêm**. Đây đúng là chỗ một sản phẩm thương mại sẽ chèn
  "nâng cấp gói để có thêm sandbox".
- `components/me/history-page-notice.test.ts:74` — ô thứ ba, không nằm trong ô AC

### Lớp 3 — "mọi procedure TỪ CHỐI field thanh toán" + "schema không có cột": **YẾU**

`quiz-paths-input.test.ts:74`:

```ts
const names = [...procedureNames('quiz'), ...procedureNames('paths')];
it.each(names)('%s không nhận field thương mại', (name) => {
  for (const field of ['price','sku','entitlement','isPaid','subscription'])
    expect(accepts(name, field, 1)).toBe(false);
});
```

Hai vấn đề:

1. **Phủ 2 router trên ~11.** `procedureNames` chỉ được gọi cho `quiz` và `paths` (đo:
   `grep -rn "procedureNames(" apps/web/src` → đúng 2 dòng, cả hai trong file đó).
   `lessons`, `labs`, `playgrounds`, `me`, `admin`, `authoring`, `session`, `capacity`,
   `auth` **không được phủ**. Ô AC viết "**mọi** procedure".
   `rule-03-strict-input.test.ts` cũng không lấp: nó kiểm `.strict()` trên **một**
   procedure, không phải toàn router.
2. **Vế schema không có test nào.** "schema không có cột `price`/`sku`/`entitlement`" hiện
   chỉ là **chú thích**: `apps/web/src/server/db/schema.ts:694-695` và
   `apps/web/drizzle/0006_tricky_tyger_tiger.sql:4`. Chú thích không đỏ được.

**Còn thiếu.** Nâng `names` lên **mọi router** của `appRouter` (đúng vòng lặp đã có, chỉ
đổi nguồn tên) + một `it()` trong `schema.test.ts` khẳng định không bảng nào có cột thuộc
tập cấm. Cả hai đều nhỏ; cho tới lúc đó ô này **CHƯA**, dù hai lớp đầu rất mạnh.

---

## Bảng tổng kết

| # | Ô | Trạng thái | Bằng chứng | Còn thiếu |
|---|---|---|---|---|
| 1 | Token một nguồn; không màu cứng trong JSX | **ĐÓNG** (có nợ cổng) | `tokens.contract.test.ts` (đối chứng hai chiều, ghim `#313131`/1.53 vs `#707070`/4.01) + grep đo tại `1c1443e`: 0 hit palette, 1 hit `#hex` nằm trong chú thích | Không cổng CI nào chạy phép grep — nó chỉ đỏ khi có người gõ |
| 2 | Dark mode trên **mọi** trang (22 màn) + terminal + editor | **CHƯA** | `theme-provider.test.tsx` (16 ô) + `terminal-theme.test.ts` | `grep dark apps/web/e2e` = **0**. Không gì phủ 22 màn hình ở `.dark`; editor Theia (iframe) nằm ngoài token và ô AC không nói ra |
| 3 | 4 trạng thái loading/empty/error/disabled + checklist | **CHƯA** | Bảng §4a có thật trong `docs/design-system.md`; `exports.contract.test.ts` gác bề mặt export hai chiều; 27 file test `packages/ui` | **Không test nào ĐỌC `design-system.md`** ⇒ thêm component + khai C2 + quên bảng = vẫn xanh. Cần cổng đối chiếu hàng bảng ⇄ `C2_EXPORTS` hai chiều |
| 4 | Font phủ đủ dấu tiếng Việt | **CHƯA** | `layout.tsx:34` `Be_Vietnam_Pro`; `tokens.contract` khẳng định `--font-sans` có `var(--font-be-vietnam-pro)` + `system-ui`, không `poppins` | Chỉ kiểm **chuỗi CSS**. Mất `subsets:['vietnamese']` hoặc font không tải được lúc build ⇒ vẫn xanh. Cần: khẳng định `subsets` + đo glyph trên `"Quặng ngã ươn ạ ữ ỡ ợ ẵ"` trong Playwright |
| 5 | 4 trình học e2e **trên cụm thật** | **CHƯA** | lesson/lab/quiz đều đi **tới chấm** (lesson còn tách "Không chấm được" khỏi "Chưa đạt") | **Playground không có luồng nào.** `keyboard.spec.ts` mở sandbox playground nhưng để đo Esc, không kiểm TTL-trước-khi-bắt-đầu (13.D mục 15) |
| 6 | Layout `ide` hiện/không hiện đúng cờ | **CHƯA** | `ide-layout.test.ts` có cả vế âm lẫn vế dương trên hàm thuần | **0/143 file `content/` khai cờ `ide`** ⇒ vế dương chưa từng chạy thật; 0 e2e chạm `<iframe src="/ide/...">`; D8 (ingress + cookie `Path=/ide`) chưa có phép kiểm end-to-end |
| 7 | "Còn N chỗ" phản ánh trần thật + báo trước | **ĐÓNG** | **20 ghim ở 3 nơi, đều suy ra 23−3**: `capacity_test.go:52` + `TestSoftCapacityLaHieuChuKhongPhaiHangSo` (cổng "là hiệu, không phải hằng"), `session_service_test.go:261`, `get-capacity.test.ts:42`. Nguồn `values-selfhost.yaml:164,176`; helm `fail` chặn key cũ. Cảnh báo đã nối dây: `app-shell.tsx:131,230`, `session-controls.tsx:61` | Chưa xác nhận **pod đang chạy** nhận đúng `23`/`3` (một `kubectl exec … env` ở report đợt 3); chưa có phép kiểm cho chính lượt 429 |
| 8 | `lessons.list` phân trang **ở tầng nguồn** | **ĐÓNG** | `repository-page-sql.integration.test.ts` đọc **SQL đã sinh** (`"id" > $n`, `order by`, `limit n+1`, KHÔNG offset) + chạy trên Postgres thật + đối chứng âm cho filter. Router đã đi đường mới (`lessons.ts:249`). Không skip khi thiếu DB | — |
| 9 | Đáp án quiz không có trong payload FE | **ĐÓNG** (khác phương pháp) | `paths-quiz-authz.test.ts:216` — `JSON.stringify(quiz)` không chứa `isCorrect`/`explanation`, **kèm đối chứng dương** `toContain('kubectl get pods -A')`. Cộng rào compile `@ts-expect-error` (tự báo động khi bị tháo) + `.strict()`. Kênh duy nhất: page.tsx không nhét dữ liệu vào RSC, client chỉ gọi `quiz.get`+`quiz.submit` | Đi qua `createCaller`, **không phải network trace** như chữ của ô. Khuôn HTTP thật đã có sẵn (`security/test-helpers.ts`) — ~10 dòng là đóng đúng chữ |
| 10 | axe 0 serious/critical + bàn phím + Esc | **CHỜ E2E** (đang ĐỎ ở lượt 20:52) | axe: 4 cổng chống-xanh-giả (`MIN_SCREENS`, `passes>0`, đối chứng dương neo `image-alt`+`button-name`, `E2E_REQUIRE_ROLES=1`). **Viền/ranh giới do `tokens.contract.test.ts` gác, không phải axe** — SC 1.4.11 cho `--input`/`--ring`, ca ba lớp Switch, miễn trừ `--ring` chứng minh bằng quét vét cạn + companion. Bàn phím: dấu focus đo bằng **pixel**, có đối chứng dương | 4 test ĐỎ lúc 20:49–20:52 (3× `/settings → 404`, 1× Esc không thấy nút "Bắt đầu"). Cả 4 **trước** lượt bump ảnh `1c1443e` (22:31) ⇒ nhiều khả năng ảnh cũ, nhưng **chưa có lượt chạy nào đóng ô**. Lỗ còn lại: contrast gác ở tầng **token**, không ở tầng pixel đã render |
| 11 | Playwright 6 luồng chính xanh trên cụm | **CHỜ E2E** | 6 luồng `@flow` đều đi tới đích (không chỉ mở trang): lesson→chấm, lab→xếp hạng, quiz→khoá bài, path→ổ khoá hai chiều, author→xuất bản+kết quả chạy thử, admin→5 trang | Chưa có bản ghi lượt chạy. `results.json` (21:28) là `--list --grep @khong-ton-tai` → `No tests found`. ⚠ Luồng 6 xanh **không** chứng minh D15: `admin.flow.spec.ts:78` chỉ kiểm nút "Kết thúc" **nếu** có phiên sống, không thì annotate `chua-do` và **vẫn xanh** |
| 12 | 0 vi phạm CSP + **có đối chứng dương** | **CHỜ E2E** | 3 đối chứng dương trên 3 chỉ thị (`script-src` qua `page.route` vào HTML thật, `img-src`, `frame-src`/D8). Máy thu hai đường (DOM + CDP). Ghi nhận `page.evaluate`/`setContent` **được Chromium miễn trừ CSP** nên không dùng được. Và phân biệt **sự kiện bắn ≠ mã bị chặn** (`window.__cspPwned` phải `undefined`) | Chỉ thiếu lượt chạy |
| 13 | Responsive ≤768px; terminal báo rõ thay vì vỡ | **CHƯA** | `breakpoints.test.ts` xanh (3 ô); `narrow-screen-notice.tsx` tồn tại | **CHƯA NỐI DÂY.** `meetsTerminalWidth` **0 call-site**; `NarrowScreenNotice` **không được render ở đâu**; 11 biến thể px trong JSX đều là `min-[769px]`, **0 hit 1024/1023**. Playwright có **đúng 1 project Desktop Chrome**, `setViewportSize` không xuất hiện ⇒ **chưa từng mở trang ở ≤768px** |
| 14 | Không giá/gói cước/thanh toán — **BA lớp** | **CHƯA** (2 lớp mạnh, lớp 3 yếu) | **L1 MẠNH**: `check-no-commerce.mjs` 8 gốc (gồm `content/`), tự-kiểm dương+âm trước khi quét, CI `no-commerce.yml` mọi push; grep trong plan cũng sạch (`EXIT=1`); tôi tự đối chứng mẫu VN dưới `-iE` khớp 4/4. **L2 CÓ**: `nav.test.ts:31`, `shell/capacity.test.ts:81`, `me/history-page-notice.test.ts:74` | **L3 YẾU**: `quiz-paths-input.test.ts:74` chỉ phủ router `quiz`+`paths` (**2/~11**; `procedureNames(` chỉ xuất hiện 2 lần trong repo) trong khi ô nói "**mọi** procedure"; vế "schema không có cột `price`/`sku`/`entitlement`" **không có test nào** — chỉ chú thích ở `schema.ts:694` + migration `0006`. L1 cũng không quét `services/`, `infra/`, `proto/` |

**Tổng: ĐÓNG 4 · CHỜ E2E 3 · CHƯA 7.**

## Ba việc rẻ nhất, đổi được nhiều ô nhất

1. **Nối `NarrowScreenNotice` + thêm một project Playwright hẹp** → ô 13, và cho ô 2 một
   cảnh thứ hai để quét dark mode cùng lượt.
2. **Đổi `names` trong `quiz-paths-input.test.ts` sang mọi router + một `it()` trong
   `schema.test.ts`** → ô 14.
3. **Một mục nội dung khai `layout: ide` + một `it()` đọc `design-system.md`** → ô 6 và ô 3.
