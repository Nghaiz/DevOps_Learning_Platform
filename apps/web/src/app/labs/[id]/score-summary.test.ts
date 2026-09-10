import { describe, expect, it } from 'vitest';
import type { Lab, LabTask, LabTaskResult } from '@devops-platform/shared-types/lab';
import { summarizeLabScore } from './score-summary';

/**
 * Bẫy P2 ở dạng lab (`phase-13.md` task 13: *"nhãn phải nói đúng thứ ta biết —
 * bẫy `4/4 bước` của P2 lặp lại y hệt ở đây nếu ẩu"*).
 *
 * Ca quan trọng nhất của file là ca **làm dở**: mọi hiện thực ẩu đều xanh khi
 * lab đã làm xong hoặc chưa làm gì. Chỗ nhãn nói dối là lúc một phần task đã
 * chấm, một phần chưa — đúng trạng thái người học ở trong suốt buổi làm bài.
 */

function task(over: Partial<LabTask> = {}): LabTask {
  return {
    id: 't1',
    title: 'Task 1',
    markdown: '',
    verifyScript: 'verify.sh',
    weight: 1,
    hint: null,
    ...over,
  };
}

function lab(over: Partial<Lab> = {}): Lab {
  return {
    id: 'lab-demo',
    title: 'Lab demo',
    description: null,
    difficulty: 'beginner',
    estimatedMinutes: null,
    tier: 'gvisor',
    capabilities: [],
    requiresCapabilities: null,
    backendImageId: 'ubuntu',
    interfaceLayout: null,
    toolset: [],
    assets: [],
    source: null,
    tasks: [task()],
    setup: { foreground: null, background: null },
    passThresholdPercent: 80,
    leaderboard: false,
    ...over,
  };
}

function result(over: Partial<LabTaskResult> = {}): LabTaskResult {
  return {
    taskId: 't1',
    exitCode: 0,
    output: '',
    checkedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

const FOUR_TASKS = [
  task({ id: 'a', title: 'A' }),
  task({ id: 'b', title: 'B' }),
  task({ id: 'c', title: 'C' }),
  task({ id: 'd', title: 'D' }),
];

/*
  ⚠ P16 — bảy chuỗi neo trong file này đã đổi, và đổi vì một lý do ĐÚNG.

  `summarizeLabScore` nay lấy câu từ `packages/copy`, nơi luật V3 cấm ký tự
  U+2014 ở mọi giá trị. Mọi chỗ trước đây nối hai mệnh đề bằng gạch ngang dài
  giờ dùng dấu phẩy hoặc dấu hai chấm.

  Thứ được chuyển sang đây là KHẲNG ĐỊNH, không phải chuỗi: mỗi ô vẫn gác đúng
  mệnh đề cũ (nhãn nói ra rằng con số trước lúc nộp là một DỰ BÁO có điều kiện;
  cặp trọng số chỉ hiện khi nó thêm thông tin; câu phụ đổi vai sau khi nộp).
  Không ô nào bị nới thành `toContain` để né việc phải sửa.
*/
describe('summarizeLabScore — chưa nộp', () => {
  it('LÀM DỞ: nhãn nói đúng số task đã đạt, và điểm là DỰ BÁO có điều kiện chứ không phải kết quả', () => {
    const summary = summarizeLabScore({
      lab: lab({ tasks: FOUR_TASKS }),
      results: [
        result({ taskId: 'a', exitCode: 0 }),
        result({ taskId: 'b', exitCode: 0 }),
        result({ taskId: 'c', exitCode: 1 }),
        // 'd' chưa từng được chấm.
      ],
      submittedAt: null,
    });

    expect(summary.passedCount).toBe(2);
    expect(summary.taskCount).toBe(4);
    expect(summary.uncheckedCount).toBe(1);
    expect(summary.score.percent).toBe(50);
    expect(summary.status).toBe('in_progress');

    // ⛔ Đây là ô chống bẫy P2. Nhãn KHÔNG được nói "2/4" rồi để "50%" đứng trần
    // như một kết quả — và KHÔNG được nói "4/4" vì bốn task đã được đụng tới.
    expect(summary.headline).toBe('Đã đạt 2/4 nhiệm vụ, nộp bây giờ được 50%');
    expect(summary.caveat).toContain('Còn 1 nhiệm vụ chưa được chấm lần nào');
    expect(summary.caveat).toContain('tính là chưa đạt');
  });

  it('task CHƯA CHẤM vẫn nằm ở mẫu số — bỏ dở kéo điểm xuống chứ không biến mất', () => {
    const summary = summarizeLabScore({
      lab: lab({ tasks: FOUR_TASKS }),
      results: [result({ taskId: 'a', exitCode: 0 })],
      submittedAt: null,
    });
    // 1/4 chứ không phải 1/1 — nếu mẫu số chỉ đếm task đã chấm thì đây là 100%.
    expect(summary.score.percent).toBe(25);
    expect(summary.headline).toBe('Đã đạt 1/4 nhiệm vụ, nộp bây giờ được 25%');
  });

  it('chấm lại ĐẠT sau khi trượt ⇒ nhãn theo lượt MỚI NHẤT', () => {
    const summary = summarizeLabScore({
      lab: lab({ tasks: [task({ id: 'a' })] }),
      results: [
        result({ taskId: 'a', exitCode: 1, checkedAt: '2026-01-01T00:00:00.000Z' }),
        result({ taskId: 'a', exitCode: 0, checkedAt: '2026-01-01T00:05:00.000Z' }),
      ],
      submittedAt: null,
    });
    expect(summary.passedCount).toBe(1);
    expect(summary.headline).toBe('Đã đạt 1/1 nhiệm vụ, nộp bây giờ được 100%');
  });

  it('mọi task đã có ít nhất một lượt chấm ⇒ KHÔNG có câu cảnh báo thừa', () => {
    const summary = summarizeLabScore({
      lab: lab({ tasks: [task({ id: 'a' }), task({ id: 'b' })] }),
      results: [result({ taskId: 'a', exitCode: 0 }), result({ taskId: 'b', exitCode: 1 })],
      submittedAt: null,
    });
    expect(summary.uncheckedCount).toBe(0);
    expect(summary.caveat).toBeNull();
  });

  it('chưa chấm gì ⇒ 0/N, không phải một ô trống hay NaN', () => {
    const summary = summarizeLabScore({
      lab: lab({ tasks: FOUR_TASKS }),
      results: [],
      submittedAt: null,
    });
    expect(summary.headline).toBe('Đã đạt 0/4 nhiệm vụ, nộp bây giờ được 0%');
    expect(summary.caveat).toContain('Còn 4 nhiệm vụ');
  });
});

describe('summarizeLabScore — trọng số', () => {
  it('task KHÁC trọng số ⇒ nhãn tự nói ra, vì "1/2 nhiệm vụ" và "75%" đọc như mâu thuẫn', () => {
    const summary = summarizeLabScore({
      lab: lab({
        tasks: [task({ id: 'a', weight: 3 }), task({ id: 'b', weight: 1 })],
      }),
      results: [result({ taskId: 'a', exitCode: 0 })],
      submittedAt: null,
    });
    expect(summary.weighted).toBe(true);
    expect(summary.score.percent).toBe(75);
    expect(summary.headline).toBe(
      'Đã đạt 1/2 nhiệm vụ, nộp bây giờ được 75% (3/4 điểm trọng số)',
    );
  });

  it('mọi task CÙNG trọng số ⇒ không thêm cặp điểm (nó chỉ lặp lại "N/M nhiệm vụ")', () => {
    const summary = summarizeLabScore({
      lab: lab({ tasks: [task({ id: 'a' }), task({ id: 'b' })] }),
      results: [result({ taskId: 'a', exitCode: 0 })],
      submittedAt: null,
    });
    expect(summary.weighted).toBe(false);
    expect(summary.headline).not.toContain('điểm trọng số');
  });
});

describe('summarizeLabScore — đã nộp', () => {
  it('ĐẠT khi percent >= mốc của chính lab đó', () => {
    const summary = summarizeLabScore({
      lab: lab({ tasks: [task({ id: 'a' }), task({ id: 'b' })], passThresholdPercent: 50 }),
      results: [result({ taskId: 'a', exitCode: 0 }), result({ taskId: 'b', exitCode: 1 })],
      submittedAt: '2026-01-01T00:10:00.000Z',
    });
    expect(summary.status).toBe('passed');
    expect(summary.tone).toBe('success');
    expect(summary.headline).toBe('Đạt: 50% (mốc 50%)');
  });

  it('làm tròn XUỐNG: 4/5 task mốc 80 thì đạt, 79.x thì KHÔNG được làm tròn lên thành đạt', () => {
    // 3/4 = 75% < 80% — phải là "Chưa đạt", không phải "80% rồi vẫn trượt".
    const summary = summarizeLabScore({
      lab: lab({ tasks: FOUR_TASKS, passThresholdPercent: 80 }),
      results: [
        result({ taskId: 'a', exitCode: 0 }),
        result({ taskId: 'b', exitCode: 0 }),
        result({ taskId: 'c', exitCode: 0 }),
        result({ taskId: 'd', exitCode: 1 }),
      ],
      submittedAt: '2026-01-01T00:10:00.000Z',
    });
    expect(summary.status).toBe('failed');
    expect(summary.tone).toBe('warning');
    expect(summary.headline).toBe('Chưa đạt: 75% (mốc 80%)');
  });

  it('nộp khi còn task chưa chấm ⇒ câu phụ GIẢI THÍCH điểm, không còn là lời cảnh báo', () => {
    const summary = summarizeLabScore({
      lab: lab({ tasks: FOUR_TASKS }),
      results: [result({ taskId: 'a', exitCode: 0 })],
      submittedAt: '2026-01-01T00:10:00.000Z',
    });
    expect(summary.caveat).toBe(
      '3 nhiệm vụ chưa từng được chấm nên tính là chưa đạt trong điểm trên.',
    );
    expect(summary.caveat).not.toContain('nếu nộp bây giờ');
  });
});

describe('summarizeLabScore — hình dạng dữ liệu THẬT qua dây tRPC', () => {
  it('`checkedAt` là chuỗi ISO (không có transformer) vẫn tính đúng, không ném', () => {
    const wire = { ...result({ taskId: 'a', exitCode: 0 }), checkedAt: '2026-01-01T00:00:00.000Z' };
    expect(() =>
      summarizeLabScore({ lab: lab({ tasks: [task({ id: 'a' })] }), results: [wire], submittedAt: null }),
    ).not.toThrow();
  });

  it('`displays` trả kèm ra từ CÙNG mảng đã tính điểm — badge và tiêu đề không thể lệch', () => {
    const summary = summarizeLabScore({
      lab: lab({ tasks: [task({ id: 'a' }), task({ id: 'b' })] }),
      results: [result({ taskId: 'a', exitCode: 0 })],
      submittedAt: null,
    });
    const passedInDisplays = summary.displays.filter((d) => d.state === 'passed').length;
    expect(passedInDisplays).toBe(summary.passedCount);
    expect(summary.displays.map((d) => d.state)).toEqual(['passed', 'not-attempted']);
  });
});
