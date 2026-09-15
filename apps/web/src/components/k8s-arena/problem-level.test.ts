import { describe, expect, it } from 'vitest';

import { k8sOjClaim, k8sOjGradable, k8sOjLevel, type K8sOjProblem } from './problem-level';
import { buildRunResult } from './run-result';
import { problemAsLevel, problemScoreRun } from '../../server/problems/replay';
import type { StoredProblem } from '../../server/problems/dto';
import type { RunLog, SessionStatus } from '@devops-platform/games';
import { tallyLog } from '@devops-platform/games';

/**
 * Nửa CLIENT của hợp đồng §18.C cho game K8s.
 *
 * ⛔ Ô này gác một lớp lỗi mà `tsc` không thấy được: hai bản dựng `Level` (ở
 * `problem-level.ts` và ở `server/problems/replay.ts`) đều biên dịch sạch khi
 * lệch nhau, và chỗ lệch chỉ lộ ra dưới dạng `CE` cho MỌI lượt nộp hợp lệ.
 *
 * ## Vì sao so HAI BẢN DỰNG với nhau, chứ không chép hằng số sang
 *
 * Bản Git của ô này (`components/games/git/problem-level.test.ts`) chép hai con
 * số điểm đo được ở lane máy chủ và so với chúng — cách đó đúng ở đó vì lane
 * máy chủ và lane client chạy tách nhau. Ở đây cả hai bản dựng đều nằm trong
 * `apps/web` và đều THUẦN, nên gọi thẳng cả hai trong một tiến trình là phép so
 * mạnh hơn: nó bắt được lệch ở MỌI trường, không chỉ ở trường nào đó đã nghĩ ra
 * trước để đo.
 *
 * ⚠ Điều đó KHÔNG biến ô này thành ô tự điều chỉnh. Hai bản dựng là hai đoạn mã
 * độc lập do hai lượt viết khác nhau đẻ ra; một lượt sửa chạm một bên sẽ làm ô
 * đỏ. Thứ ô này KHÔNG gác được là một lượt sửa cả hai bên theo cùng một hướng
 * sai — và không ô nào gác được điều đó ngoài phép chơi thật.
 *
 * ## BỐN khác biệt được PHÉP, và ô này khoá đúng bốn cái đó
 *
 * Cả bốn đều là hệ quả trực tiếp của §18.B.4 — wire của người học che cách chấm.
 * Không cái nào đi vào phép xác minh của `verifyRun`:
 *
 * | Trường | Máy chủ | Client | Vì sao vô hại |
 * |---|---|---|---|
 * | `objectives[].check` | tên vị từ thật | `''` | `evaluateObjectives` bỏ qua vị từ lạ, không ném |
 * | `objectives[].args` | tham số thật | vắng | chỉ đọc khi vị từ tồn tại, mà nó không tồn tại |
 * | `objectives[].label` | nhãn thật | chữ thay thế, **chỉ với testcase ẨN** | nhãn là chữ trên màn, không phải dữ liệu chấm |
 * | `hints[]` | nội dung thật | `''` cho gợi ý CHƯA mở | chỉ ĐỘ DÀI có nghĩa (xem ô riêng) |
 *
 * ⚠ **Bốn cái này ĐO ĐƯỢC chứ không phải khai trước, và đó là điểm đáng giữ
 * nhất của mục này.** Bản đầu của ô này khẳng định `check` là khác biệt DUY
 * NHẤT, rồi đỏ ba lượt liên tiếp — `args`, `hints`, `label` — mỗi lượt lộ ra
 * một sự thật của wire mà người viết không biết. Một ô viết xong xanh ngay có
 * thể chỉ đang mô tả lại niềm tin của người viết; ô này thì không.
 *
 * Mọi trường NGOÀI bốn cái trên phải trùng khớp — `id`, `required`,
 * `initialState`, `allowedResources`, `parMoves`, và nhãn của testcase HIỆN.
 * Một trường thứ năm bắt đầu lệch sẽ làm nhóm ô đầu đỏ, kể cả khi trường đó
 * chưa ai nghĩ tới lúc viết ô này.
 */

const CODE = 'K8S-9001';

/**
 * Bài như KHO LƯU giữ nó, dạng JSON.
 *
 * Chuỗi JSON chứ không phải object literal: một object literal chở được
 * `undefined`, một `Map`, hay một tham chiếu dùng chung — ba thứ không sống sót
 * qua dây, và nếu hai bên vô tình mượn chung một object thì ô vẫn xanh trong khi
 * đường thật đã lệch.
 *
 * Bài CÓ gợi ý tính điểm, và đó là điều kiện để nhóm ô thứ ba có nghĩa:
 * `computeScore` và `scoreProblemRun` chỉ khác nhau khi một gợi ý được mở.
 */
const PROBLEM_JSON = `{
  "code": "${CODE}",
  "gameId": "k8s",
  "title": "Nang so ban sao cua web len 3",
  "statement": "Cum dang chay 1 ban sao. Nang len 3.",
  "difficulty": "easy",
  "topics": [],
  "tags": [],
  "seedable": false,
  "initialState": { "nodes": [], "workloads": [] },
  "allowedResources": null,
  "parMoves": 4,
  "testcases": [
    { "id": "t1", "label": "web co 3 ban sao", "check": "replicasAtLeast", "args": { "name": "web", "min": 3 }, "visible": true },
    { "id": "t2", "label": "khong pod nao loi", "check": "noCrashLoop", "visible": false }
  ],
  "hints": [
    { "id": "h1", "text": "Dung lenh scale.", "penaltyPoints": 120 },
    { "id": "h2", "text": "kubectl scale deploy/web --replicas=3", "penaltyPoints": 250 }
  ]
}`;

/** Bài như MÁY CHỦ giữ nó — `check`/`args` đầy đủ. */
function baiMayChu(): StoredProblem {
  return JSON.parse(PROBLEM_JSON) as StoredProblem;
}

/**
 * Bài như NGƯỜI HỌC nhận nó: `check`/`args` đã bị `toTestcaseTeasers` cắt, nhãn
 * của testcase ẩn về `null`, nội dung gợi ý chưa mở về `null`.
 *
 * Dựng TỪ chính JSON trên chứ không viết tay một bản thứ hai — một bản thứ hai
 * là chỗ hai fixture trôi khỏi nhau và ô so hai bài khác nhau mà vẫn xanh.
 */
function baiNguoiHoc(revealedIds: readonly string[] = []): K8sOjProblem {
  const day = baiMayChu();
  return {
    code: day.code,
    title: day.title,
    statement: day.statement,
    difficulty: day.difficulty,
    initialState: day.initialState,
    allowedResources: day.allowedResources,
    testcases: day.testcases.map((testcase) => ({
      id: testcase.id,
      // `toTestcaseTeasers` giấu nhãn của testcase ẩn trước lượt nộp đầu tiên.
      label: testcase.visible ? testcase.label : null,
      visible: testcase.visible,
    })),
    hints: day.hints.map((hint) => ({
      id: hint.id,
      penaltyPoints: hint.penaltyPoints,
      revealed: revealedIds.includes(hint.id),
      text: revealedIds.includes(hint.id) ? hint.text : null,
    })),
    parMoves: day.parMoves,
  };
}

describe('k8sOjLevel khớp problemAsLevel của máy chủ', () => {
  it('trùng nhau ở mọi trường NGOÀI objectives và hints', () => {
    /*
     * `id`, `chapter`, `initialState`, `allowedResources`, `parMoves`,
     * `difficulty`, `teaching`… — tất cả phải khớp từng byte. Đây là ô bắt được
     * một trường THỨ TƯ bắt đầu lệch mà chưa ai lường trước.
     */
    const client = k8sOjLevel(baiNguoiHoc());
    const server = problemAsLevel(baiMayChu());

    const { objectives: _boClient, hints: _hClient, ...conLaiClient } = client;
    const { objectives: _boServer, hints: _hServer, ...conLaiServer } = server;
    expect(conLaiClient).toEqual(conLaiServer);
  });

  it('`hints` khớp ĐỘ DÀI — nội dung thì không, và chỉ độ dài mới có nghĩa', () => {
    /*
     * `revealHint(index)` chặn `index >= level.hints.length` rồi thoát sớm. Nên
     * một mảng NGẮN hơn phía máy chủ làm một lượt mở gợi ý im lặng không xảy ra,
     * `status.hintsRevealed` lệch, và lượt nộp rơi vào `khong-khop`.
     *
     * Nội dung thì được phép khác: wire trả `null` cho gợi ý chưa mở (giấu nội
     * dung là cả điểm của `penaltyPoints`), và client điền `''`. Engine chỉ in
     * chuỗi đó ra khi người chơi tự mở — mà khi đó wire đã trả nội dung thật.
     */
    const client = k8sOjLevel(baiNguoiHoc());
    const server = problemAsLevel(baiMayChu());

    expect(client.hints).toHaveLength(server.hints.length);
    // Gợi ý CHƯA mở: client không có nội dung, và đó là §18.B.4 đang làm việc.
    expect(client.hints).toEqual(['', '']);
    expect(server.hints.every((text) => text.length > 0)).toBe(true);
  });

  it('gợi ý ĐÃ mở thì client mang nội dung thật', () => {
    // Nửa còn lại của ô trên: che là che gợi ý chưa trả tiền, không phải che tất.
    expect(k8sOjLevel(baiNguoiHoc(['h1'])).hints[0]).toBe('Dung lenh scale.');
  });

  it('`id` là mã bài ở CẢ HAI bên — trường mà đường K8s từng sai', () => {
    /*
     * Đây là lỗi #1 của ba lỗi đã chặn chế độ bài tập K8s: cửa vào cũ cho chọn
     * một level trong `LEVELS`, nên `log.levelId` là `k8s-NN-…` và
     * `tryGradeProblem`/`submitProblem` trả `BAD_REQUEST` trước khi phát lại
     * chạy dòng nào.
     */
    expect(k8sOjLevel(baiNguoiHoc()).id).toBe(CODE);
    expect(problemAsLevel(baiMayChu()).id).toBe(CODE);
  });

  it('`allowedResources` rơi về ALL_KINDS chứ không phải mảng rỗng', () => {
    /*
     * `null` = "cho dùng mọi loại"; `[]` = "cấm mọi loại". Hai giá trị NGƯỢC
     * nghĩa, và `[]` làm mọi lượt phát lại trượt trong im lặng.
     */
    const client = k8sOjLevel(baiNguoiHoc());
    expect(client.allowedResources.length).toBeGreaterThan(0);
    expect(client.allowedResources).toEqual(problemAsLevel(baiMayChu()).allowedResources);
  });

  it('objectives chỉ khác ở `check` và `args`, và khác ở ĐÚNG mọi testcase', () => {
    /*
     * ⛔ Ô này là cái khoá. Nó không hỏi "check có rỗng không" — nó hỏi "còn
     * trường nào khác lệch nữa không", nên một trường thứ ba bắt đầu trôi (ví dụ
     * `required` hay `label`) sẽ làm nó đỏ dù ô này viết trước khi ai nghĩ tới.
     *
     * `id` và `required` là hai trường PHẢI khớp: `id` là khoá mà
     * `objectivesMet` chở, và `required: false` ở một bên sẽ làm màn báo thắng
     * trong khi máy chủ chấm `WA`.
     */
    const client = k8sOjLevel(baiNguoiHoc());
    const server = problemAsLevel(baiMayChu());

    const hienThi = baiNguoiHoc().testcases;
    expect(client.objectives).toHaveLength(server.objectives.length);
    client.objectives.forEach((cua, i) => {
      const doiChung = server.objectives[i];
      expect(doiChung).toBeDefined();
      const { check: checkClient, args: argsClient, label: nhanClient, ...conLaiClient } = cua;
      const {
        check: checkServer,
        args: _argsServer,
        label: nhanServer,
        ...conLaiServer
      } = doiChung as typeof cua;

      // `id` + `required`: hai trường PHẢI khớp, và ô này là chỗ khoá chúng.
      expect(conLaiClient).toEqual(conLaiServer);

      // Client KHÔNG BAO GIỜ có vị từ thật — đó là §18.B.4, không phải một khe.
      expect(checkClient).toBe('');
      expect(checkServer).not.toBe('');
      // ...và cũng không có tham số. Cùng một lát cắt của `toTestcaseTeasers`.
      expect(argsClient).toBeUndefined();

      /*
       * Nhãn: khác biệt thứ TƯ, và là cái duy nhất CÓ ĐIỀU KIỆN.
       *
       * Testcase HIỆN là đề bài — người làm phải đọc được đúng chữ tác giả viết,
       * nên nhãn phải khớp. Testcase ẨN thì `toTestcaseTeasers` giấu nhãn cho tới
       * sau lượt nộp đầu tiên (chống dò đáp án bằng cách đọc tên case), nên chỗ
       * đó client mang chữ thay thế.
       */
      if (hienThi[i]?.visible === true) {
        expect(nhanClient).toBe(nhanServer);
      } else {
        expect(nhanClient).toBe('Testcase ẩn chưa hiện tên');
        expect(nhanServer).toBe('khong pod nao loi');
      }
    });

    /*
     * Đối chứng dương: fixture PHẢI có cả một testcase hiện lẫn một testcase ẩn,
     * và phía máy chủ PHẢI có tham số. Không có ba dòng này thì mọi ô trên có
     * thể xanh vì fixture nghèo chứ không vì hợp đồng đúng.
     */
    expect(hienThi.some((testcase) => testcase.visible)).toBe(true);
    expect(hienThi.some((testcase) => !testcase.visible)).toBe(true);
    expect(server.objectives[0]?.args).toEqual({ name: 'web', min: 3 });
  });

  it('nhãn testcase ẩn không bao giờ là chuỗi rỗng', () => {
    // Một dòng trống trong danh sách mục tiêu đọc ra như một lỗi render.
    const an = k8sOjLevel(baiNguoiHoc()).objectives[1];
    expect(an?.label).toBe('Testcase ẩn chưa hiện tên');
  });
});

describe('k8sOjGradable', () => {
  it('bài có testcase thì chấm được', () => {
    expect(k8sOjGradable(baiNguoiHoc())).toBe(true);
  });

  it('bài KHÔNG testcase nào thì không — `problemVerdictOf(0,0)` trả CE', () => {
    expect(k8sOjGradable({ ...baiNguoiHoc(), testcases: [] })).toBe(false);
  });

  it('KHÔNG đòi client có `check` — đòi thế là tắt nút nộp của mọi người học', () => {
    /*
     * Đối chứng cho một hồi quy cụ thể: bản Git của cổng này từng hỏi "client có
     * đủ cách chấm chưa", và câu đó khoá người học ra ngoài vĩnh viễn vì wire
     * không bao giờ chở `check`. Bài dưới đây KHÔNG có `check` ở đâu cả.
     */
    expect(k8sOjGradable(baiNguoiHoc())).toBe(true);
  });
});

/** Nhật ký: 2 lệnh, và MỞ gợi ý đầu tiên. */
const LOG: RunLog = JSON.parse(`{
  "gameId": "k8s",
  "levelId": "${CODE}",
  "seed": 12345,
  "actions": [
    { "gameId": "k8s", "kind": "kubectl", "tick": 1 },
    { "gameId": "k8s", "kind": "hint", "index": 0, "tick": 2 },
    { "gameId": "k8s", "kind": "scale", "tick": 3 }
  ]
}`) as RunLog;

describe('k8sOjClaim khớp cách chấm của máy chủ', () => {
  const objectivesMet = ['t1', 't2'];

  it('`score` bằng ĐÚNG số máy chủ tính cho cùng lượt chơi', () => {
    const problem = baiNguoiHoc();
    const claim = k8sOjClaim({
      problem,
      log: LOG,
      objectivesMet,
      startedAt: 1_700_000_000_000,
      finishedAt: 1_700_000_060_000,
    });

    /*
     * Phía máy chủ, dựng đúng như `problemReplayEngine` dựng nó: `revealedHintIds`
     * đóng lại từ tập đã tính trước khi phát lại. Gợi ý `h1` mở trong nhật ký.
     */
    const status = { objectivesMet } as unknown as SessionStatus;
    const diemMayChu = problemScoreRun(baiMayChu(), ['h1'])(status, tallyLog(LOG));

    expect(claim.score).toBe(diemMayChu);
  });

  it('đếm lệnh và gợi ý từ NHẬT KÝ, không từ trạng thái phiên', () => {
    const claim = k8sOjClaim({
      problem: baiNguoiHoc(),
      log: LOG,
      objectivesMet,
      startedAt: 0,
      finishedAt: 1,
    });
    // `verifyRun` so lời khai với `tallyLog(log)`, nên đây là con số phải khớp.
    expect(claim.commandsUsed).toBe(2);
    expect(claim.hintsUsed).toBe(1);
  });

  it('`levelId` là mã bài, `gameId` khai tường minh', () => {
    const claim = k8sOjClaim({
      problem: baiNguoiHoc(),
      log: LOG,
      objectivesMet,
      startedAt: 0,
      finishedAt: 1,
    });
    expect(claim.levelId).toBe(CODE);
    expect(claim.gameId).toBe('k8s');
  });

  it('gợi ý mở ở MÁY CHỦ (ngoài nhật ký) vẫn vào phép trừ điểm', () => {
    /*
     * `revealedHintIds` là HỢP hai nguồn: cờ `revealed` của `problems.byCode`
     * (bảng `problem_hint_reveals`) và gợi ý mở trong chính nhật ký. Bỏ vế đầu
     * thì một người mở gợi ý ở lượt trước sẽ khai điểm CAO hơn máy chủ ⇒ `CE`.
     */
    const coH2 = k8sOjClaim({
      problem: baiNguoiHoc(['h2']),
      log: LOG,
      objectivesMet,
      startedAt: 0,
      finishedAt: 1,
    });
    const khongH2 = k8sOjClaim({
      problem: baiNguoiHoc(),
      log: LOG,
      objectivesMet,
      startedAt: 0,
      finishedAt: 1,
    });
    expect(coH2.score).toBeLessThan(khongH2.score);
  });
});

describe('ĐỐI CHỨNG: công thức cũ (computeScore) KHÁC công thức máy chủ', () => {
  /*
   * ⛔ Ô này đỏ nếu ai đó đưa `buildRunResult` trở lại đường nộp bài OJ.
   *
   * Nó không đo `k8sOjClaim` — nó đo rằng khe được vá CÓ THẬT. Không có ô này,
   * một lượt "dọn dẹp" gộp hai bản dựng lời khai làm một sẽ đi qua mọi ô khác:
   * `tsc` xanh (hai bên cùng kiểu `RunResult`), các ô trên xanh (chúng chỉ đọc
   * `k8sOjClaim`), và triệu chứng chỉ hiện ra dưới dạng `CE` cho người chơi
   * thật, ở đúng những bài có gợi ý.
   */
  it('hai công thức ra hai số khi một gợi ý đã mở', () => {
    const problem = baiNguoiHoc();
    const level = k8sOjLevel(problem);
    const tally = tallyLog(LOG);

    const cu = buildRunResult(
      level,
      { seed: LOG.seed, status: { objectivesMet: ['t1', 't2'], movesUsed: tally.commandsUsed, hintsRevealed: tally.hintsUsed } as unknown as SessionStatus },
      0,
      1,
    );
    const moi = k8sOjClaim({
      problem,
      log: LOG,
      objectivesMet: ['t1', 't2'],
      startedAt: 0,
      finishedAt: 1,
    });

    expect(cu.score).not.toBe(moi.score);
  });
});
