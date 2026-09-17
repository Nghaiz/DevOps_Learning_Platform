'use client';

import { useMemo, useState, type ReactElement } from 'react';
import { Button } from '@devops-platform/ui';
import { CICD_LEVELS, type TheoryDoc } from '@devops-platform/games';

import { CicdCampaign } from './cicd-campaign';
import { CicdLevelScreen } from './cicd-level-screen';
import { CicdSandbox } from './cicd-sandbox';

/**
 * Màn chơi của **Xưởng đường ống CI/CD** — 19.H, vỏ client của `/games/cicd`.
 *
 * Cùng hình dạng với `GitGame`: một chuỗi `return` sớm CÓ THỨ TỰ, không phải một
 * biến `screen`. Thứ tự là hợp đồng, và nó đọc từ trên xuống:
 *
 *   1. `?problem=` — địa chỉ cụ thể người dùng vừa bấm, thắng mọi đường vào khác.
 *   2. bàn thử tự do
 *   3. chưa chọn màn ⇒ danh sách
 *   4. còn lại ⇒ màn chơi
 *
 * ⛔ **0 lời gọi backend trong lúc chơi.** `app/games/layout.tsx` CỐ Ý không cấp
 * `TrpcQueryProvider`, nên bất kỳ import nào kéo theo client tRPC ở đây sẽ nổ
 * lúc chạy chứ không lúc biên dịch. Engine CI/CD chạy hoàn toàn trong bộ nhớ.
 */

export interface CicdGameProps {
  /** Màn mở sẵn từ `?level=`. `null` ⇒ hiện danh sách. */
  readonly initialLevelId: string | null;
  /**
   * Mã bài từ `?problem=`. `null` ⇒ không ở chế độ làm bài.
   *
   * ⚠ Chỉ `page.tsx` đọc tham số này — cùng luật đã ghi cho đấu trường K8s và
   * game Git: hai chỗ cùng đọc một tham số là hai chỗ có thể bất đồng về việc
   * đang ở chế độ nào.
   */
  readonly initialProblemCode: string | null;
  /** Bài lý thuyết của cả game, đọc ở server. Xem `server/games/cicd-theory.ts`. */
  readonly theory: readonly TheoryDoc[];
}

export function CicdGame({ initialLevelId, initialProblemCode, theory }: CicdGameProps): ReactElement {
  const [levelId, setLevelId] = useState<string | null>(initialLevelId);
  const [sandbox, setSandbox] = useState(false);
  /*
   * Mã bài là STATE chứ không đọc thẳng prop, vì màn dưới có một nút thoát khỏi
   * chế độ đó. Đọc thẳng prop thì nút ấy không làm được gì: prop không đổi, nên
   * lần render sau vẫn rơi vào đúng nhánh vừa muốn rời — một nút chết mà không
   * lỗi nào báo.
   */
  const [problemCode, setProblemCode] = useState<string | null>(initialProblemCode);

  /*
   * `CICD_LEVELS`, không `CI_LEVELS`: đọc nửa CI ở tầng giao diện là giấu cả
   * chương CD mà không lỗi nào báo (chú thích ở `levels/index.ts`).
   */
  const index = useMemo(() => CICD_LEVELS.findIndex((l) => l.id === levelId), [levelId]);
  const level = index >= 0 ? CICD_LEVELS[index] : undefined;

  if (problemCode !== null) {
    /*
     * ⚠ KHÔNG đổ người dùng vào danh sách màn ở nhánh này.
     *
     * Bộ chấm phía máy chủ ĐÃ có (`cicd/problem-plugin.ts`), nhưng màn này chưa
     * dựng `RunLog` và chưa nộp. Còn một câu phải quyết trước khi mở: nhật ký chỉ
     * chở YAML, nên retries/cache của bảng núm không tới được bộ chấm — xem
     * phase-19.md §0b "Đợt 3". Cho tới lúc đó, đường đúng là nói thẳng rằng địa
     * chỉ này chưa mở, kèm mã bài để người dùng biết mình không gõ nhầm. Chuyển
     * hướng lặng sang danh sách màn sẽ đọc ra thành "mã bài của tôi sai", và họ
     * sẽ đi sửa một thứ không hỏng.
     */
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold text-foreground">Chế độ làm bài chưa mở</h1>
        <p className="text-sm text-muted-foreground">
          Bài <span className="font-mono">{problemCode}</span> tồn tại, nhưng đấu trường
          CI/CD chưa nhận nộp bài. {CICD_LEVELS.length} màn của chiến dịch thì chơi được ngay.
        </p>
        <div>
          <Button
            variant="outline"
            onClick={() => {
              setProblemCode(null);
            }}
          >
            Xem danh sách màn
          </Button>
        </div>
      </div>
    );
  }
  if (sandbox) {
    return (
      <CicdSandbox
        onExit={() => {
          setSandbox(false);
        }}
      />
    );
  }
  if (level === undefined) {
    return (
      <CicdCampaign
        onPick={setLevelId}
        onSandbox={() => {
          setSandbox(true);
        }}
      />
    );
  }

  const next = CICD_LEVELS[index + 1];
  return (
    <CicdLevelScreen
      key={level.id}
      level={level}
      theory={theory.find((doc) => doc.frontmatter.id === level.theoryId) ?? null}
      {...(next === undefined ? {} : { onNext: () => setLevelId(next.id) })}
      onExit={() => {
        setLevelId(null);
      }}
    />
  );
}
