# Chống gian lận trong game — cái gì bảo vệ được, cái gì không

> Trụ cột ③ (game học DevOps). Hợp đồng gốc: `plans/devops-learning-platform/phase-14-exec.md` §8.
> Mã: `packages/games/src/core/verify.ts`, `packages/games/src/core/integrity.ts`.
> Cổng gác: `scripts/check-no-antipattern.mjs` (`pnpm antipattern:check`).

Tài liệu này nói phần khó nghe trước.

## 1. Không chặn được F12. Đây là sự thật kỹ thuật, không phải một lựa chọn

Yêu cầu ban đầu là "tắt F12". Không làm được, và không ai làm được:

- **DevTools là chức năng của trình duyệt.** Trang web không có API nào tắt nó.
  Không có thuộc tính HTML, không có header HTTP, không có cờ JavaScript. Thứ
  duy nhất trang web làm được là *đoán* và *phản ứng*, mà cả hai đều thua.
- **Mọi thủ thuật dân gian đều bị vượt trong vài giây.** Bắt phím `keydown` F12
  và Ctrl+Shift+I: mở devtools **trước** khi tải trang là xong. Dò kích thước
  cửa sổ: tách devtools ra cửa sổ riêng là xong. Vòng lặp `debugger`: bấm
  "deactivate breakpoints", hoặc chỉ cần tắt JavaScript. Làm rối mã: mã vẫn phải
  chạy, nên nó vẫn đọc được, chỉ chậm hơn mười phút. Còn `view-source:` và sửa
  thẳng bộ nhớ thì không kỹ thuật nào ở trên chạm tới.
- **Chúng lọc nhầm người.** Người duy nhất bị chặn là người không định gian lận
  và vô tình bấm chuột phải.
- **Chúng phá cổng a11y của chính dự án này.** Chặn `contextmenu` giết menu ngữ
  cảnh của trình đọc màn hình; bắt phím tắt giết điều hướng bàn phím. Nền tảng
  này có ô nghiệm thu axe và cam kết WCAG — thêm mấy thứ đó là **tự làm đỏ ô
  nghiệm thu của mình** để đổi lấy một rào không cản được ai.

Vì vậy năm kỹ thuật sau **bị cấm** trong mã nguồn chạy được, và có cổng gác tự
động (có đối chứng dương, xem §7):

1. dò devtools
2. chặn `contextmenu` (chuột phải)
3. bắt phím tắt devtools (F12, Ctrl+Shift+I/J)
4. câu lệnh / vòng lặp `debugger` nhét vào mã sản phẩm
5. làm rối mã nguồn (obfuscation)

## 2. Mô hình đe doạ thật — ai hại được ai

| Ai | Làm được gì | Có hại không |
|---|---|---|
| Người chơi sửa `localStorage` của chính mình | Đặt `score` bất kỳ, mở khoá achievement | **Chỉ hại chính họ.** Đợt này không có bảng xếp hạng, không phần thưởng, không ảnh hưởng ai. |
| Người chơi đọc bundle để xem đáp án | Biết trước lời giải level | Tự bỏ tiền học của mình. Như lật trang đáp án cuối sách. |
| Người chơi khoe ảnh chụp điểm giả | Nói dối xã hội | Nằm ngoài tầm phần mềm. Không dòng code nào sửa được. |
| **Khi có bảng xếp hạng** | Bơm điểm giả lên bảng chung | **Đây mới là mối nguy thật** — và nó chỉ xuất hiện khi có backend chấm điểm. |

Kết luận: mục tiêu **không phải ngăn chặn** (bất khả thi ở client) mà là **xác
minh được**. Cơ chế phải có sẵn từ bây giờ để ngày có bảng xếp hạng thì nó đã
đáng tin từ đầu, thay vì phải vá sau — và §6 giải thích vì sao "vá sau" ở đây là
viết lại chứ không phải thêm vào.

## 3. Cơ chế thật: xác minh bằng phát lại tất định

Đây là phần có giá trị, và nó mạnh hơn hẳn thứ được yêu cầu ban đầu.

Mỗi lượt chơi ghi lại một `RunLog = { levelId, seed, actions[] }`. Khi lượt chơi
kết thúc, `verifyRun()` chạy lại toàn bộ `actions` từ `seed` qua **reducer
thuần** và so kết quả với `RunResult` mà bản lưu khai. Khớp thì lượt chơi được
gắn nhãn *đã xác minh*; không khớp thì không.

**Vì sao nó mạnh:** sửa `score` trong `localStorage` thành 1000 không kèm theo
được một chuỗi `actions` thật sự dẫn tới 1000 điểm. Muốn làm giả thì phải bịa ra
một chuỗi thao tác hợp lệ giải được level — tức là **phải chơi thật**, lúc đó
không còn là gian lận nữa. Nó không bảo vệ bằng cách giấu gì cả, nên việc người
chơi đọc được toàn bộ mã nguồn không làm nó yếu đi một chút nào. Đó chính là
điểm khác biệt với mọi thứ ở §1.

Ngoài `score`, phát lại còn đối chiếu `commandsUsed`, `hintsUsed` và
`objectivesMet` — cả ba đều **đếm được từ chính nhật ký**, nên lời khai trong
bản lưu không có giá trị gì. Đây cũng là quy ước "No Derived Fields" của repo:
đã có `actions` thì `commandsUsed` là thứ **tính**, không phải thứ **lưu**.

### Kết quả không xác minh được thì KHÔNG bị xoá

Một bản lưu hỏng vì đổi version rơi vào **đúng nhánh** với một bản bị sửa tay —
từ một lần lệch, hai thứ đó không phân biệt được. Nên:

- lượt chơi không xác minh được vẫn nằm nguyên trong bản lưu, chỉ hiện nhãn
  *"không xác minh được"*;
- trang thống kê tách hai cột **đã xác minh** / **tất cả**;
- achievement chỉ tính trên cột đã xác minh;
- **không nhãn nào nói "gian lận"** — có một test khẳng định điều đó, vì buộc
  tội người dùng dựa trên một tín hiệu không phân biệt được hai nguyên nhân là
  sai.

Xoá dữ liệu người dùng vì nghi ngờ tệ hơn chính vấn đề đang chống.

### Lỗi của người chơi và lỗi của chúng ta là hai chuyện khác nhau

`verifyRun()` trả về **năm** trạng thái chứ không phải một boolean, và đây là
chỗ dễ làm sai nhất:

| Trạng thái | Nghĩa | Ai phải làm gì |
|---|---|---|
| `da-xac-minh` | phát lại khớp | tính điểm |
| `khong-khop` | phát lại chạy được nhưng ra khác | không tính điểm; **không kết tội** |
| `engine-khong-tat-dinh` | hai lần phát lại cùng đầu vào ra khác nhau | **sửa reducer** — lỗi của ta |
| `log-hong` | nhật ký sai hình dạng (tick lùi, kind lạ) | không tính điểm |
| `phat-lai-loi` | reducer ném | sửa engine hoặc dữ liệu level |

Hai dòng giữa nhìn **giống hệt nhau** từ một lần lệch đơn lẻ nhưng dẫn tới kết
luận ngược nhau. Nếu reducer mất tính tất định thì **mọi lượt chơi hợp lệ** đều
lệch, và một hệ thống chỉ có `verified: false` sẽ báo cáo điều đó dưới dạng
"toàn bộ người chơi đang gian lận" — kết luận sai, và dẫn tới hành động sai (đi
điều tra người dùng thay vì đi sửa reducer). Nên `verifyRun()` **phát lại hai
lần** và so hai lần đó với nhau trước khi so với lời khai. Giá phải trả là gấp
đôi chi phí phát lại, chạy đúng một lần lúc kết thúc lượt chơi.

## 4. Ba lớp phụ trợ — tất cả đều là "nâng chi phí", không phải "chặn"

### 4.1 Checksum bản lưu — và nói thẳng rằng nó KHÔNG phải bảo mật

`integrity.ts` băm bản lưu (FNV-1a) và ghi dấu kèm theo. Sửa tay bằng devtools
sẽ làm dấu lệch, và bản lưu hiện nhãn *"đã bị sửa ngoài game"*.

**Nó không phải bảo mật, và câu này không được phép trôi thành một lời hứa mạnh
hơn sự thật:** hàm băm nằm trong bundle JavaScript gửi tới trình duyệt. Ai đọc
được bundle thì tính lại được checksum. Không có khoá bí mật nào — **không thể
có**, vì mọi thứ chạy ở client đều đọc được. Bất kỳ ai bỏ ra mười phút đều sửa
được bản lưu **và** sửa luôn checksum cho khớp.

Nó chặn đúng một thứ: sửa tay tuỳ hứng rồi bấm Enter. Thế thôi.

Có một trạng thái thứ ba, `khong-co-dau`, cho bản lưu tạo ra trước khi tính năng
này tồn tại. Gộp nó vào "đã bị sửa" là cáo buộc oan mọi người dùng cũ.

### 4.2 Kiểm tính hợp lý

`checkPlausibility()` gắn cờ những lượt chơi **bất khả thi** — không phải những
lượt chơi đáng ngờ:

- `finishedAt` trước `startedAt`;
- hoàn thành nhanh hơn số tick mô phỏng mà chính chuỗi action đòi;
- `commandsUsed === 0` mà vẫn đạt mục tiêu cần lệnh;
- `score` vượt trần của level, hoặc vượt trần hợp đồng 1000, hoặc âm;
- đạt nhiều objective hơn số objective của level, hoặc id trùng;
- bộ đếm âm.

Một người chịu khó làm giả tử tế sẽ qua hết mục này. Đó là lý do nó là lớp
**phụ**, và phát lại mới là lớp chính. Mọi thứ ở đây **chỉ gắn cờ, không xoá**.

### 4.3 Không xuất source map ra production

Đây là món **duy nhất** trong toàn bộ tài liệu này thật sự là bảo mật, và nó bảo
vệ mã của cả ứng dụng chứ không riêng game. Kiểm được: khẳng định không có
`.js.map` trong `.next/static` của bản build production.

### 4.4 Cái ta KHÔNG giả vờ giấu

Vị từ cấu trúc (đếm replica, so selector) **bắt buộc** chạy ở client nên **luôn
đọc được**. Chấp nhận điều đó, đừng giả vờ ngược lại. Với đáp án dạng *chuỗi cố
định* (tên lệnh đúng, giá trị field đúng) thì bundle chỉ cần chứa **hash** và so
bằng hash — đọc bundle khi đó không cho ra đáp án. Đó là một cải tiến có thật,
không phải một lời hứa về "bảo vệ mã nguồn".

## 5. Đường tới bảng xếp hạng đáng tin (thiết kế, chưa hiện thực đợt này)

Ghi ra để đợt sau không phải nghĩ lại:

1. Client gửi lên **`RunLog`**, **không gửi `score`**.
2. Server chạy **cùng một reducer** — đây chính là lý do logic game nằm ở
   `packages/games` và không phụ thuộc DOM, React hay `node:*`: nó chạy được cả
   trong trình duyệt lẫn trên Node.
3. **Server tự tính điểm.** Điểm do server tính là điểm duy nhất được lên bảng.
   Điểm client khai không bao giờ được tin, ở bất kỳ bước nào.
4. Kèm giới hạn tần suất và **trần độ dài `actions`** — một nhật ký dài vô hạn
   là một cách làm ngộp CPU của server.

`verifyRun()` nhận engine làm **tham số tiêm vào** chứ không import cứng, chính
là để cùng một hàm đó chạy được ở server mà không phải viết lại. Chỗ dùng thật
gọi `sessionReplayEngine(createSession, level, scoreRun)` để bọc `CreateSession`
của lane B lại.

> ⚠ Adapter đó **luôn** truyền `autoTick: false`. Đây không phải một tinh chỉnh
> hiệu năng: bật lên thì mô phỏng tiến theo đồng hồ tường, một lần phát lại trên
> máy chậm ra kết quả khác lần phát lại trên máy nhanh, và xác minh mất sạch ý
> nghĩa — mọi người chơi hợp lệ bị gắn cờ. Phát lại không được phụ thuộc thời
> gian thật, ở client cũng như ở server.

> ⚠ **Ràng buộc phải giữ:** nộp điểm là **một lời gọi backend**, nên nếu làm
> trong lúc chơi thì nó phá ô nghiệm thu "0 lời gọi backend khi chơi". Thiết kế
> đúng: **chơi = 0 lời gọi**; **nộp điểm = một lời gọi tường minh do người dùng
> bấm, sau khi lượt chơi đã kết thúc**. Game vẫn chơi được offline; chỉ việc nộp
> lên bảng mới cần mạng.

## 6. Vì sao xác minh này là hệ quả của một quyết định kiến trúc, không phải một tính năng lắp thêm

Phát lại chỉ hoạt động vì reducer **tất định tuyệt đối**: cùng `seed` + cùng
chuỗi action ⇒ cùng trạng thái, không `Math.random()`, không `Date.now()`, mọi
ngẫu nhiên đi qua RNG có gieo hạt. Đó là một ràng buộc đặt ra **trước khi viết
dòng đầu tiên**, không phải thứ bọc thêm sau.

Có số đo cho điều này. Bản upstream `rohitg00/k8sgames` gọi `Math.random()`
**15 lần** trong engine và **không có RNG gieo hạt ở bất kỳ đâu** — kể cả việc
thoát khỏi `CrashLoopBackOff` cũng là xác suất
([báo cáo khảo sát](../../plans/devops-learning-platform/reports/2026-09-08-p14-k8sgames-upstream-study.md) §6).
Hệ quả: cùng một chuỗi thao tác của người chơi có thể ra kết quả khác nhau, nên
điểm của họ **không thể xác minh được kể cả trên nguyên tắc** — và không có bản
vá nào sửa được điều đó mà không viết lại vòng lặp mô phỏng.

Một hệ quả thứ hai cùng loại: achievement của upstream là **closure JavaScript**,
nên không serialize được, không đánh giá được ở server, không dịch được ở tầng
dữ liệu. Achievement của ta là **dữ liệu** (`Achievement` trong
`packages/games/src/core/types.ts`), nên con đường ở §5 vẫn mở.

Nói cách khác: thứ ta có được không phải vì ta cẩn thận hơn, mà vì ta đã trả giá
đúng chỗ — tất định và dữ-liệu-thay-vì-mã — ngay từ đầu.

### 6.1 ⚠ Cơ chế này hiện CHỈ phủ game Kubernetes

Đọc §8.3 của kế hoạch chặng rất dễ tưởng cơ chế này là của cả trụ cột ③. Không phải.

`RunLog` và `GameAction` được định nghĩa trong **`packages/games/src/k8s/contract.ts`**,
không phải trong `core/`. `GameAction` là union phân biệt với các nhánh mang
nghĩa Kubernetes (`apply` + `yaml`, `scale` + `replicas`, `target: ResourceRef`
gồm `kind`/`namespace`/`name`). Ba game còn lại **chưa có nhật ký hành động nào**,
nên hôm nay chúng **không có xác minh**.

Ba game đó không cùng một hoàn cảnh, và chỗ khác nhau này quan trọng:

| Game | Có đường xác minh không | Vì sao |
|---|---|---|
| **netpol** | **Có, và dễ hơn** | Không có trục thời gian. Kết quả xác minh được từ **trạng thái cuối** (bộ policy người chơi viết) bất kể đi đường nào tới đó — không cần nhật ký, không cần phát lại. |
| **dockerfile** | **Có, và dễ hơn** | Cùng lý do: chấm trên Dockerfile cuối cùng, không phải trên quá trình. |
| **pipeline** | **Không, nếu không thiết kế lại** | Điểm phụ thuộc **một chuỗi lần chạy có gieo hạt**, tức là có trạng thái tích luỹ theo thời gian. Chấm từ trạng thái cuối không đủ; nó cần đúng loại nhật ký + phát lại như K8s, và cái đó phải thiết kế **trước khi** viết engine — xem lại §6: thêm sau là viết lại. |

Nói thẳng để không ai phải phát hiện muộn: **nếu game pipeline được xây mà không
có nhật ký hành động và RNG gieo hạt ngay từ đầu, điểm của nó sẽ không xác minh
được, và không có bản vá nào sửa được điều đó về sau.**

Khi nào cần phủ nhiều game: nâng `RunLog` (và phần chung của `GameAction`) lên
`core/`, để mỗi game khai nhánh action của riêng nó. `verifyRun()` **đã** không
phụ thuộc gì vào Kubernetes — nó chỉ đọc `tick` và `kind` — nên phần khó là hợp
đồng dữ liệu, không phải hàm xác minh.

### 6.2 So hình chiếu đầy đủ, đừng bốc vài field

Phát lại so hai lần bằng `ClusterView` **nguyên vẹn** (`K8sSession.getView()`),
không phải bằng vài field chọn tay. Lý do cụ thể: mô hình lúc chạy của lane B
tách `ready` và `restartCount` thành **các trục riêng** của `phase`, và
`ObjectView` mang cả hai — cùng bài học đã trả giá một lần ở repo này, khi một
cổng chỉ đọc `phase` coi pod `Terminating` là còn sống.

Một phép so bốc tay field sẽ **im lặng mù dần** mỗi lần mô hình dày thêm: nó vẫn
xanh, chỉ là không còn đo cái nó tưởng đang đo. Có test cho đúng chuyện này — một
engine mà `ClusterView` lệch giữa hai lần phát lại **trong khi `score` và
`objectivesMet` khớp hoàn toàn** phải bị bắt là `engine-khong-tat-dinh`.

## 7. Cổng gác tự động

```
pnpm antipattern:check                                  # tự kiểm rồi quét cây
node scripts/check-no-antipattern.mjs --self-test       # chỉ tự kiểm
```

Script quét mã nguồn **chạy được** (`apps/web/src`, `apps/web/e2e`,
`packages/*/src`) tìm năm kỹ thuật bị cấm ở §1. `docs/`, `plans/` và `content/`
nằm ngoài vùng quét, cố ý: chính tài liệu này phải viết ra những từ bị cấm để
giải thích lệnh cấm.

**Nó có đối chứng dương.** Mỗi lần chạy, script tự chứng minh nó bắt được 20 mẫu
vi phạm đã biết *và* không kêu trên 18 mẫu sạch đã biết, **trước** khi quét cây;
tự kiểm hỏng thì thoát 2 và không quét gì cả. Một cổng chưa ai từng thấy đỏ thì
không phải một cổng, nó là trang trí.

Không có lối thoát nội tuyến kiểu `// antipattern: allow`. Cổng kêu thì hoặc là
vi phạm thật, hoặc là mẫu sai — và mẫu sai thì sửa ngay trong script kèm một
dòng vào mảng `CLEAN` để lần sau không tái phát.

## 8. Tóm tắt một bảng

| Câu hỏi | Trả lời |
|---|---|
| Chặn được F12 không? | **Không.** Không ai chặn được. Xem §1. |
| Ngăn được người chơi sửa `localStorage` không? | **Không.** Nhưng sửa xong thì điểm không được tính. |
| Ngăn được người chơi đọc đáp án trong bundle không? | **Không** với vị từ cấu trúc; **có** với đáp án dạng chuỗi (so bằng hash). |
| Checksum có phải bảo mật không? | **Không.** Khoá nằm trong bundle. Nó chỉ nâng chi phí sửa tay. |
| Vậy cái gì thật sự bảo vệ được? | **Phát lại tất định.** Điểm chỉ được công nhận khi chạy lại nhật ký ra đúng kết quả. |
| Bản lưu không xác minh được có bị xoá không? | **Không bao giờ.** Chỉ mất quyền tính điểm/achievement. |
| Bảng xếp hạng có an toàn không? | Sẽ an toàn — vì server tự chấm, không tin điểm client gửi. Chưa làm đợt này. |
| Cơ chế này phủ cả 4 game chứ? | **Không.** Chỉ game K8s. netpol/dockerfile chấm được từ trạng thái cuối; **pipeline thì không, và phải thiết kế lại nếu muốn**. Xem §6.1. |
