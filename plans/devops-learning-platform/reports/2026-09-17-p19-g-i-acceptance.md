# 19.G nghiệm thu + nối chương CD vào web + 19.I — 2026-09-17

**Phạm vi (chủ dự án chốt đầu lượt):** được chạy test; nghiệm thu và sửa 19.G, nối chương CD vào
web, làm 19.I. Mâu thuẫn `minGreenRate` giải bằng miễn trừ có điều kiện trong ô test.
**Nhánh:** `feat/p19-cd-chapter`. Chưa push, chưa PR.

## Commit

| Commit | Nội dung |
|---|---|
| `eeda563` | Nghiệm thu 19.G ở tầng gói |
| `5a7b1e2` | Brief 19.I (`phase-19-i-theory-brief.md`) |
| `c2c3043` | Chương CD chơi được trên web |
| `64bd191` | 19.I: 21 bài lý thuyết, bộ nạp chung, `docs/games/cicd.md` |

## 19.G — thứ lượt nghiệm thu tìm ra

Lượt viết level trước đó chạy 0 test. Lần chạy đầu cho 990/990 xanh, nhưng xanh đó không đủ:

1. **tsc đỏ, vitest xanh.** C15 khai `difficulty: 'beginner'`, ngoài union. Vitest không kiểm kiểu.
2. **Ô `minGreenRate > 0` mâu thuẫn C17/C27.** Commit bị từ chối làm stage cổng đỏ ở mọi lượt, nên
   `greenRate = 0` dù lời giải đúng. Ô nay miễn trừ đúng level có commit `approvalRejected`.
   Đối chứng âm: bản ô cũ đỏ đúng hai ô C17, C27.
3. **Đường người chơi đi chưa được đo cho chương CD.** `hydrate.test.ts` (vòng YAML giữ ba trục,
   khuôn cache) và `job-shapes.test.ts` chỉ lặp `CI_LEVELS`. Nay lặp `CICD_LEVELS`: +85 ô, xanh.
4. **Ô mới AC-G:** hai lời giải qua vòng YAML + tầng ghép vẫn đạt mọi mục bắt buộc (ô cũ chấm
   `solutionWorkflow` nguyên bản, thứ người chơi không gửi). Đối chứng dương: catalogue rỗng ⇒ 4 ô đỏ.
5. Ghim thành test luật văn bản của brief (mission ≤ 20 từ, brief ≤ 400, primer ≤ 250, 2–4
   takeaways) và luật ghép vị từ "đạt bằng cách không làm gì". Cả 14 level đã đạt trước khi ghim.

## Web

- `runWorkflow` nhận `cd` (khối level + chính sách bảng núm), chạy `runLevelCd` sau engine; chính
  sách ngoài miền ra nhánh `cd-error` thay vì "chưa đạt".
- `cicd-cd-panel.tsx`: chỉ hiện núm trong `cd.editable`, khởi đầu từ `cd.initial`, không điền mặc
  định. Ngưỡng canary đổi qua số nguyên (`Math.round(diem*100)/10000`) để ra đúng double của literal.
- `cicd-cd-metrics.tsx`: số đo gọi đúng phép chiếu mà vị từ gọi; kịch bản phát hành tách tốt/lỗi.
- Danh mục chia hai chương, route và vỏ game đọc `CICD_LEVELS`. `RELEASE_STRATEGIES` export thêm.

## 19.I

21 bài `content/games/cicd/theory/` phủ 28 level, mỗi level đúng một bài; `theoryId` gán ở cả 28.
Bộ nạp bài lý thuyết tách từ `git-theory.ts` thành `theory-docs.ts` dùng chung (probe: Git vẫn nạp
đủ 32 bài). `cicd-theory.test.ts` kiểm hai chiều: `usedByLevels` qua `validateTheoryDocs` (kể cả
`readMinutes` so với số từ thật) và `level.theoryId` → bài.

Rà nội dung với mã: bài 13 viết sai phạm vi `promotedArtifactUnchanged` (chỉ xét commit lên cả hai
môi trường); bài 14 thiếu hai vế của `environmentGuardedByApproval` (cổng + stage ở giữa phải chặn;
bản ghi không có lần phát hành khi cổng đỏ). Đã sửa cả hai.

## Số đo cuối (trên cây đã commit `64bd191`)

| Phép đo | Kết quả |
|---|---|
| `packages/games` vitest | 89 file, 2502/2502 |
| `apps/web` vitest (`components/games/cicd`, `server/games`, `app/author`) | 8 file, 197/197 |
| tsc games · tsc web · tsc e2e · eslint games/web | 0 lỗi |
| `check-no-commerce.mjs` · `check-cicd-vendor-neutral.mjs` | xanh |
| `next build` | exit 0 |
| Playwright `games-cicd.spec.ts` (Chromium, `E2E_START_SERVER=1`) | 12/12 |
| AC-I: image `--target runner` | 21 file; `16-canary-va-co-mau.md`, `21-hotfix-va-ca-truc.md` có nội dung; đối chứng âm file không tồn tại vắng |

## Còn mở

| # | Việc | Ghi chú |
|---|---|---|
| 1 | AC-1 `turbo run build lint typecheck test --force` toàn cây | Chưa chạy lượt này; chỉ chạy các gói bị đụng |
| 2 | AC-6 "cả hai theme" | Ô axe mới quét theme mặc định, như ô cũ |
| 3 | AC-2 cho màn CD | Ô network trace vẫn chơi C01; bảng núm CD chạy trong bộ nhớ, nhưng chưa có trace riêng |
| 4 | 19.D tầng 3D | Chưa bắt đầu, ngoài phạm vi lượt này |
| 5 | Chế độ làm bài OJ CI/CD | Vẫn "chưa mở" — `CicdGameAction.evaluate` chỉ chở YAML (việc để lại đợt 3 #1, #2) |
| 6 | Bài 11, 15, 16, 18 dài hơn 600 từ một chút | Validator không chặn; `readMinutes` khớp |
