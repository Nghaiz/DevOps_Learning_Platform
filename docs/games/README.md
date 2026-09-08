# Trụ cột ③ Games — chỉ mục

Game chạy **hoàn toàn trong trình duyệt**: không route backend, không pod, không phiên
sandbox. Đây là ràng buộc kiến trúc, không phải một tối ưu, và nó là lý do trụ cột này tồn
tại: nội dung tương tác mà chi phí vận hành bằng không.

Ô nghiệm thu tương ứng đo bằng Playwright network trace chứ không bằng đọc code:
**0 lời gọi backend trong lúc chơi**.

---

## Bốn game

| Game | `GameId` | Trạng thái | Tài liệu |
|---|---|---|---|
| Cứu hộ cluster Kubernetes | `k8s` | **Đã hiện thực** (P14 đợt 1): 30+ level, chaos, sandbox, challenges | hợp đồng ở `packages/games/src/k8s/contract.ts` |
| Đường ống | `pipeline` | Thiết kế, chưa code | [`pipeline.md`](pipeline.md) |
| Mê cung mạng | `netpol` | Thiết kế, chưa code | [`netpol.md`](netpol.md) |
| Lò rèn Image | `dockerfile` | Thiết kế, chưa code | [`dockerfile.md`](dockerfile.md) |

Ba ô "sắp có" trên `/games` là **lựa chọn có ý thức, không phải thiếu sót**
([`phase-14-exec.md`](../../plans/devops-learning-platform/phase-14-exec.md) §1 quyết
định 4): một game hoàn chỉnh có giá trị hơn bốn game dở dang.

Mỗi tài liệu thiết kế có một mục **"cái nó dạy được mà Kubernetes Game không dạy được"** và một
mục **"chỗ ý tưởng này yếu"**. Mục thứ hai không phải khiêm tốn theo phép lịch sự: nó là
thứ người hiện thực đọc trước khi bắt đầu, để biết chỗ nào sẽ đau.

Tài liệu liên quan không nằm trong chỉ mục này:

- [`../../content/games/ATTRIBUTION.md`](../../content/games/ATTRIBUTION.md): ghi công
  nguồn cảm hứng, và vì sao đó là lịch sự chứ không phải nghĩa vụ theo Apache-2.0.
- [`anti-cheat.md`](anti-cheat.md): cơ chế xác minh bằng phát lại tất định, và danh sách
  thứ **không** bảo vệ được. Do lane G sở hữu (`phase-14-exec.md` §8), không phải lane
  tài liệu này.

---

## Kiến trúc dùng chung: `packages/games`

```
packages/games/src/
  index.ts              # barrel, CHỈ re-export (lead sở hữu)
  core/                 # dùng chung cho MỌI game
    types.ts            # GameId · Difficulty · RunResult · GameSave · storageKey
    rng.ts              # PRNG có hạt giống
    progress.ts         # đọc/ghi localStorage + migration
    achievements.ts · stats.ts
  k8s/                  # một thư mục cho mỗi game
    contract.ts · model.ts · reducer.ts · tick.ts
    predicate-names.ts · predicates.ts · scoring.ts
    levels/
```

### Bốn ràng buộc áp cho mọi game, không có ngoại lệ

1. **Không `node:*`, không DOM, không React** ở bất kỳ đâu truy được từ barrel. `tsconfig`
   của package cố ý bỏ `types: ["node"]` để một lần lạc tay là đỏ ngay ở typecheck. Một
   `node:fs` lọt vào chỉ làm `next build` đỏ trong khi typecheck, lint và test đều xanh.
2. **Tất định tuyệt đối.** Cùng seed + cùng chuỗi hành động ⇒ cùng trạng thái. Không
   `Math.random()`, không `Date.now()` trong logic; mọi ngẫu nhiên đi qua `core/rng.ts`.
   Đây là điều kiện để xác minh chống gian lận hoạt động, không phải một sở thích về độ
   sạch.
3. **Không field suy ra được.** `passed`, `percent`, `durationSeconds` tính ở chỗ dùng.
   Quy ước này áp cho `localStorage` y như cho Postgres.
4. **Canvas là hình minh hoạ, không phải giao diện.** Mọi hành động chơi được phải làm
   xong bằng bàn phím qua lớp DOM. Canvas mang `aria-hidden="true"`
   (`phase-14-exec.md` §4.4).

### Lưu tiến độ

`localStorage`, một khoá cho mỗi game: `dlp.games.v1.<gameId>`, giá trị là JSON của
`GameSave`. Không có bảng DB nào, và đó là quyết định đã chốt kèm lý do
(`phase-14-exec.md` §1): một bảng tiến độ trong Postgres mâu thuẫn trực tiếp với ô nghiệm
thu "0 lời gọi backend".

`progress.ts` phải chịu được bốn trường hợp mà **không ném**: khoá vắng · JSON hỏng ·
version lạ · `localStorage` tự ném (chế độ riêng tư của trình duyệt). Cả bốn trả về trạng
thái rỗng kèm một cảnh báo.

---

## ⚠ Một việc phải làm trước khi hiện thực game thứ hai

`RunLog` và `GameAction` hiện nằm ở **`k8s/contract.ts`**, không ở `core/`. Và
`GameAction.kind` là union đóng `'apply' | 'delete' | 'scale' | 'edit' | 'kubectl' |
'hint' | 'wait'`, tức là từ vựng của Kubernetes.

Hệ quả: **cơ chế xác minh chống gian lận mô tả ở `phase-14-exec.md` §8.3 hiện chỉ dùng
được cho Kubernetes Game.** Ba game còn lại không có chỗ để ghi hành động của chúng.

Hai đường ra, cả hai đều là **quyết định của lead** vì cả hai file đều do lead sở hữu:

1. Chuyển `RunLog` lên `core/types.ts` và cho `GameAction.kind` mở theo game.
2. Chấp nhận rằng netpol và dockerfile xác minh bằng **trạng thái cuối** thay vì bằng phát
   lại. Với hai game đó thì làm được, vì kết quả chỉ phụ thuộc trạng thái cuối chứ không
   phụ thuộc đường đi tới đó. Với `pipeline` thì **không** làm được: kết quả của nó phụ
   thuộc chuỗi seed của N lượt chạy.

Ba tài liệu thiết kế đều nêu lại việc này ở mục mô hình trạng thái, để người hiện thực
không đọc §8.3 rồi tưởng cơ chế đã sẵn sàng.

### Cái bẫy đặt tên đi kèm

`k8s/contract.ts` có `EdgeView`, `ObjectView`, `EventView`, `NodeView`. Ba trong bốn cái
tên đó nghe như dùng chung được. Không cái nào dùng chung được: `EdgeView.kind` là
`'owns' | 'selects' | 'mounts' | 'routes'`, `ObjectView` mang `ResourceKind` và `PodPhase`.
**Mọi thứ trong `k8s/contract.ts` là của K8s, kể cả khi tên nó không nói vậy.** Game mới
tự khai kiểu của mình; chỉ `core/types.ts` mới là hợp đồng dùng chung.

---

## Thêm game thứ năm

Bảy bước. Bước 1 và bước 6 chạm vào file lead sở hữu nên chúng bắt đầu bằng một lời báo,
không phải bằng một lần sửa.

1. **Báo lead.** `GameId` là một union **đóng** trong `core/types.ts`. Không thêm được id
   mới nếu không sửa file đó, và file đó là điểm giao của mọi lane.
2. **Viết `docs/games/<gameId>.md` trước khi viết code.** Bốn mục tối thiểu, theo khuôn ba
   tài liệu hiện có: vòng lặp chơi và chỗ nó khác ba game kia · mô hình trạng thái đối
   chiếu với hợp đồng · khoảng 15 level đầu (tiêu đề + mục tiêu) · cách chấm điểm. Và mục
   thứ năm, mục quan trọng nhất: **cái nó dạy được mà bốn game kia không dạy được**. Nếu
   không viết nổi mục đó thì game này không cần tồn tại, và phát hiện ra điều đó ở giai
   đoạn tài liệu rẻ hơn nhiều so với phát hiện ra sau ba tuần code.
3. **`packages/games/src/<gameId>/contract.ts`**: hợp đồng riêng, chỉ `import type` từ
   `core/types.ts`, không import từ thư mục của game khác.
4. **`<gameId>/predicate-names.ts`** nếu game có `Objective`. `Objective.check` là **tên vị
   từ dạng chuỗi**, không phải closure: level phải serialize được để lưu replay và so bằng
   `toEqual` trong test. Kèm một test khẳng định **hai chiều**: mọi tên có hiện thực, mọi
   hiện thực có tên. Một chiều thôi thì vị từ chết sẽ sống mãi.
5. **Reducer thuần + scoring + `levels/`.** Ngưỡng chấm phái sinh từ mốc của từng level,
   **không phải hằng số toàn cục**: xem `pipeline.md` §5 để biết lỗi này trông như thế nào
   khi nó xảy ra thật.
6. **Báo lead** để thêm dòng re-export vào `index.ts`.
7. **Route `apps/web/src/app/games/<gameId>/`** + một thẻ trong catalog. Thẻ ghi rõ game
   **không cần đăng nhập** và **không tốn sandbox** (CTF thì ngược lại: tốn một sandbox).

### Ba thứ một game mới không được làm

- Thêm field vào `core/types.ts` một cách lặng lẽ. Bốn lane đọc file đó; một field thêm âm
  thầm làm ba lane kia biên dịch xanh trong khi hiểu sai nhau.
- Lưu một giá trị tính được từ các giá trị khác.
- Coi `<canvas>` là giao diện. Nếu chơi hết được level 1 mà không cần chuột là không làm
  được, game sẽ trượt cổng axe và phải viết lại phần vỏ.

---

## Nguồn cảm hứng

Bộ game mode và vòng lặp chẩn đoán sự cố lấy ý tưởng từ `rohitg00/k8sgames` (Apache-2.0).
Không code, không asset, không văn xuôi nào được copy. Chi tiết đầy đủ, gồm vì sao đây là
lịch sự chứ không phải nghĩa vụ pháp lý:
[`content/games/ATTRIBUTION.md`](../../content/games/ATTRIBUTION.md).

Bản đọc upstream đầy đủ, gồm bốn quyết định thiết kế ta cố ý làm ngược lại:
[`2026-09-08-p14-k8sgames-upstream-study.md`](../../plans/devops-learning-platform/reports/2026-09-08-p14-k8sgames-upstream-study.md).
