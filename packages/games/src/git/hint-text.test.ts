import { describe, expect, it } from 'vitest';
import { createGitSession } from './engine.ts';
import { sandboxLevel, sandboxSpec } from './sandbox.ts';
import type { GitLevel } from './contract.ts';

/**
 * Ô gác của C3 — nửa ENGINE của game Git.
 *
 * ## Cái đang gác
 *
 * `revealHint` đẩy `` `Gợi ý ${i + 1}: ${text}` `` vào bản ghi, và `text` đọc từ
 * `level.hints[index]`. Ở chế độ làm bài OJ, `gitOjLevel` dựng `hints` từ
 * `problem.hints.map((h) => h.text ?? '')`, mà `problems.byCode` trả `text: null`
 * cho MỌI gợi ý chưa mở (§18.B.4) — nên cả mảng là chuỗi rỗng, và người học bấm
 * "Mở gợi ý 1" sẽ bị trừ điểm rồi nhận đúng dòng *"Gợi ý 1: "*.
 *
 * Chữ thật chỉ tới từ `problems.revealHint`, tức là SAU khi phiên đã dựng. Nên
 * nó phải đi vào qua tham số, không thể nằm trong `level`.
 *
 * ⛔ Hai vế phải cùng xanh, và vế thứ hai là vế dễ đánh rơi: chữ truyền vào phải
 * thắng, VÀ hình dạng action trong nhật ký phải KHÔNG đổi. Nếu chữ chui được vào
 * nhật ký thì phát lại phía máy chủ sẽ so hai nhật ký khác nhau cho cùng một
 * lượt chơi, và mọi lượt nộp có gợi ý sẽ trượt xác minh.
 */

function levelCoGoiY(hints: readonly string[]): GitLevel {
  return { ...sandboxLevel(sandboxSpec('kho-roi')), hints };
}

describe('revealHint — chữ do chỗ gọi truyền vào', () => {
  it('chế độ DẠY (không truyền chữ) ⇒ vẫn đọc từ `level.hints`', () => {
    const session = createGitSession({ level: levelCoGoiY(['Dùng `git switch`']) });
    session.revealHint(0);
    expect(session.getOutput().at(-1)?.text).toBe('Gợi ý 1: Dùng `git switch`');
  });

  it('chế độ BÀI (level.hints rỗng) ⇒ chữ truyền vào được dùng', () => {
    // Đúng hình dạng một `GitLevel` dựng từ đề bài OJ: có gợi ý, không có chữ.
    const session = createGitSession({ level: levelCoGoiY(['']) });
    session.revealHint(0, 'Dùng `git rebase -i`');
    expect(session.getOutput().at(-1)?.text).toBe('Gợi ý 1: Dùng `git rebase -i`');
  });

  it('⛔ ĐỐI CHỨNG DƯƠNG — không truyền chữ trên level OJ ⇒ KHÔNG in dòng rỗng', () => {
    /*
     * Đây là triệu chứng cũ, viết thành một ô. Trước bản vá, dòng
     * *"Gợi ý 1: "* ĐƯỢC in ra — một nhãn không có nội dung, sau khi đã trừ điểm.
     * Im lặng còn hơn một dòng rỗng: nó không giả vờ đã trả hàng.
     */
    const session = createGitSession({ level: levelCoGoiY(['']) });
    const truoc = session.getOutput().length;
    session.revealHint(0);
    expect(session.getOutput().length).toBe(truoc);
  });

  it('⛔ chữ truyền vào KHÔNG được lọt vào nhật ký — action giữ nguyên hình dạng', () => {
    /*
     * Vế sống còn. `hintIdsFromLog` (cả hai phía) đọc `index`, và `verifyRun` so
     * nhật ký của client với lượt phát lại của máy chủ. Một trường `text` mọc
     * thêm trong action sẽ làm hai bên lệch ở MỌI lượt nộp có gợi ý.
     */
    const session = createGitSession({ level: levelCoGoiY(['']) });
    session.revealHint(0, 'chữ từ máy chủ');
    const hintActions = session.getLog().actions.filter((a) => a.kind === 'hint');
    expect(hintActions).toHaveLength(1);
    /*
     * So TẬP KHOÁ, không so `tick` bằng một số đoán. Bản đầu của ô này khẳng
     * định `tick: 0` và đỏ với `tick: 6` — đồng hồ logic của thế giới sandbox đã
     * chạy 6 nhịp trong lúc dựng. Con số đó là chi tiết của fixture, không phải
     * thứ ô này gác; chốt cứng nó là mời một lượt đỏ giả cho lần đổi fixture sau.
     */
    expect(Object.keys(hintActions[0] ?? {}).sort()).toEqual([
      'gameId',
      'index',
      'kind',
      'tick',
    ]);
    expect(hintActions[0]).toMatchObject({ gameId: 'git', kind: 'hint', index: 0 });
  });

  it('chữ RỖNG truyền vào là lựa chọn của chỗ gọi ⇒ không rơi ngược về `level.hints`', () => {
    /*
     * `??` chứ không `||`. Với `||`, một chữ rỗng sẽ rơi về `level.hints[0]` —
     * tức là đoán mò thay cho chỗ gọi, và ở chế độ dạy nó sẽ in ra gợi ý mà máy
     * chủ vừa cố tình không trả.
     */
    const session = createGitSession({ level: levelCoGoiY(['chữ của level']) });
    const truoc = session.getOutput().length;
    session.revealHint(0, '');
    expect(session.getOutput().length).toBe(truoc);
  });
});
