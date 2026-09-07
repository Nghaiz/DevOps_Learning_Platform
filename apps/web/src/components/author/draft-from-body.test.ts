import { describe, expect, it } from 'vitest';
import {
  dbContentSource,
  type ContentBodyRow,
  type ContentItemRow,
  type ContentRepository,
  type ContentSourceLogger,
} from '@devops-platform/scenario';
import { emptyDraft, toDraftInput } from './draft-form';
import { draftFromBody } from './draft-from-preview';

/**
 * `draftFromBody` — bản nháp GHI ĐƯỢC phải NẠP LẠI ĐƯỢC vào form.
 *
 * ## Bộ này chạy đường `preview` THẬT, không mô tả lại nó
 *
 * Khẳng định trung tâm là một phép SO: cùng một thân bài, đường `preview` trả
 * `null` còn `draftFromBody` trả một form. Nên bộ test dựng `dbContentSource`
 * thật trên một `ContentRepository` giả (cùng khuôn `packages/scenario/src/
 * db-source.test.ts`) thay vì chép lại `scenarioSchema.safeParse` vào đây —
 * một bản chép chỉ chứng minh điều gì đó về bản chép.
 *
 * ⚠ **Mỗi vế "preview trả null" đều đi kèm ĐỐI CHỨNG DƯƠNG trên CÙNG nguồn
 * đó.** Không có nó, một `dbContentSource` hỏng hoàn toàn — trả `null` cho MỌI
 * thứ — đọc y hệt một `dbContentSource` đúng đang từ chối bản nháp. Lane trước
 * đã dính đúng chỗ này khi viết bộ test phía server.
 *
 * ⚠ KHÔNG cần Postgres: repository ở đây là một mảng trong bộ nhớ. Cái được
 * kiểm là luật ánh xạ, không phải câu SQL.
 */

const AUTHOR = 'author-1';

function itemRow(over: Partial<ContentItemRow> = {}): ContentItemRow {
  return {
    id: 'bai-nhap',
    kind: 'lesson',
    state: 'draft',
    authorId: AUTHOR,
    title: 'Bản nháp còn dở',
    description: null,
    difficulty: null,
    estimatedMinutes: null,
    tier: 'sysbox',
    capabilities: [],
    backendImageId: 'ubuntu',
    interfaceLayout: null,
    toolset: [],
    passThresholdPercent: null,
    leaderboard: null,
    ttlSeconds: null,
    stepCount: 0,
    ...over,
  };
}

function bodyRow(over: Partial<ContentBodyRow> = {}): ContentBodyRow {
  return { item: itemRow(), steps: [], intro: null, finish: null, setup: null, assets: [], ...over };
}

function fakeRepo(bodies: readonly ContentBodyRow[]): ContentRepository {
  return {
    async listItems(kind) {
      return bodies.filter((b) => b.item.kind === kind).map((b) => b.item);
    },
    async getItem(id, kind) {
      return bodies.find((b) => b.item.id === id && b.item.kind === kind) ?? null;
    },
    async listItemsPage(kind) {
      return {
        items: bodies.filter((b) => b.item.kind === kind).map((b) => b.item),
        hasMore: false,
      };
    },
  };
}

/** Nuốt WARN "bỏ qua … không hợp lệ" — nó là hành vi ĐÚNG ở đây, không phải sự cố. */
function quietLogger(): ContentSourceLogger {
  const seen: string[] = [];
  return {
    warn(message: string) {
      seen.push(message);
    },
  };
}

/** Nguồn nội dung THẬT — chính đường mà `authoring.preview` đi qua. */
function previewSource(...bodies: readonly ContentBodyRow[]) {
  return dbContentSource(fakeRepo(bodies), {
    visibility: { kind: 'author', authorId: AUTHOR },
    logger: quietLogger(),
  });
}

// ── Lesson ────────────────────────────────────────────────────────────────────

/** 0 bước: ca ĐƠN GIẢN NHẤT mà `scenarioSchema.steps.min(1)` từ chối. */
const zeroStepLesson = bodyRow();

const validLesson = bodyRow({
  item: itemRow({ id: 'bai-du', title: 'Bài hoàn chỉnh', difficulty: 'beginner', stepCount: 1 }),
  steps: [
    {
      ordinal: 0,
      taskId: null,
      title: 'Bước 1',
      markdown: '# bước một',
      setupForeground: null,
      setupBackground: null,
      verifyScript: null,
      weight: null,
      hint: null,
    },
  ],
});

describe('lesson 0 bước — `preview` không nạp được, `get` thì được', () => {
  it('ĐỐI CHỨNG DƯƠNG: cùng nguồn đó nạp được một bài HỢP LỆ', async () => {
    const seen = await previewSource(validLesson).get('bai-du');
    // Thiếu dòng này thì mọi `toBeNull()` dưới đây chỉ chứng minh "nguồn trả
    // null cho mọi thứ", tức là không chứng minh gì cả.
    expect(seen?.title).toBe('Bài hoàn chỉnh');
  });

  it('`preview` trả null — đây là bản nháp mà form soạn cũ mở ra là trắng', async () => {
    expect(await previewSource(zeroStepLesson).get('bai-nhap')).toBeNull();
  });

  it('`draftFromBody` nạp ĐÚNG bản nháp đó, không nhánh null nào', () => {
    const form = draftFromBody(zeroStepLesson);
    expect(form.title).toBe('Bản nháp còn dở');
    expect(form.steps).toEqual([]);
    // `difficulty` chưa chọn ⇒ ô rỗng, KHÔNG phải một độ khó bịa ra.
    expect(form.difficulty).toBe('');
  });

  it('lưu lại ngay không sửa gì thì không bịa thêm field nào', () => {
    const saved = toDraftInput('lesson', draftFromBody(zeroStepLesson));
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.value.difficulty).toBeNull();
    expect(saved.value.estimatedMinutes).toBeNull();
    expect(saved.value.steps).toEqual([]);
  });
});

// ── Lab ───────────────────────────────────────────────────────────────────────

const completeTask = {
  ordinal: 0,
  taskId: 'task-mot',
  title: 'Task 1',
  markdown: '# task một',
  setupForeground: null,
  setupBackground: null,
  verifyScript: 'true',
  weight: 1,
  hint: null,
} as const;

/**
 * Lab có task ĐẦY ĐỦ, chỉ thiếu `passThresholdPercent`/`leaderboard`.
 *
 * Cố ý tách khỏi ca "task còn dở" bên dưới: nếu một fixture thiếu cả hai thứ
 * thì phép `toBeNull()` không nói được cái nào làm nó trượt, và khẳng định
 * "riêng hai cột đó đã đủ" mất bằng chứng.
 */
const labMissingThreshold = bodyRow({
  item: itemRow({
    id: 'lab-thieu-nguong',
    kind: 'lab',
    title: 'Lab chưa đặt ngưỡng',
    difficulty: 'beginner',
    passThresholdPercent: null,
    leaderboard: null,
    stepCount: 1,
  }),
  steps: [completeTask],
  setup: { foreground: null, background: null },
});

const validLab = bodyRow({
  item: itemRow({
    id: 'lab-du',
    kind: 'lab',
    title: 'Lab hoàn chỉnh',
    difficulty: 'beginner',
    passThresholdPercent: 70,
    leaderboard: false,
    stepCount: 1,
  }),
  steps: [completeTask],
  setup: { foreground: null, background: null },
});

/** Task chưa có id lẫn script chấm — bản nháp mà `authoring.create` cho phép lưu. */
const labUnfinishedTask = bodyRow({
  item: itemRow({
    id: 'lab-nhap',
    kind: 'lab',
    title: 'Lab chưa có script chấm',
    difficulty: 'beginner',
    passThresholdPercent: 70,
    leaderboard: false,
    stepCount: 1,
  }),
  steps: [{ ...completeTask, taskId: null, verifyScript: null, weight: null }],
  setup: { foreground: null, background: null },
});

describe('lab thiếu ngưỡng đạt / leaderboard', () => {
  it('ĐỐI CHỨNG DƯƠNG: nguồn nạp được lab HỢP LỆ', async () => {
    const seen = await previewSource(validLab).getLab('lab-du');
    expect(seen?.title).toBe('Lab hoàn chỉnh');
  });

  it('riêng hai cột null đó đã đủ làm `preview` trả null', async () => {
    expect(await previewSource(labMissingThreshold).getLab('lab-thieu-nguong')).toBeNull();
  });

  it('`draftFromBody` giữ null là ô TRỐNG, không thay bằng mặc định của bài mới', () => {
    // `emptyDraft()` mặc định `'60'`. Nếu `draftFromBody` để mặc định đó lọt
    // vào, lượt Lưu kế tiếp ghi một ngưỡng KHÔNG AI GÕ xuống DB — `update` là
    // phép thay toàn bộ nên không có đường quay lại.
    expect(emptyDraft().passThresholdPercent).toBe('60');
    expect(draftFromBody(labMissingThreshold).passThresholdPercent).toBe('');
  });

  it('…và lưu lại vẫn gửi null, không gửi 60', () => {
    const saved = toDraftInput('lab', draftFromBody(labMissingThreshold));
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(saved.value.passThresholdPercent).toBeNull();
  });

  it('`leaderboard: null` nạp thành false — ô duy nhất CÓ mất mát, và nó được nói ra', () => {
    const saved = toDraftInput('lab', draftFromBody(labMissingThreshold));
    expect(draftFromBody(labMissingThreshold).leaderboard).toBe(false);
    // Không phải phép đồng nhất: DB có `null`, lượt lưu ghi `false`. Checkbox
    // không có trạng thái thứ ba, và `labSchema` đòi `boolean` để xuất bản.
    if (saved.ok) expect(saved.value.leaderboard).toBe(false);
  });
});

describe('lab có task còn dở', () => {
  it('ĐỐI CHỨNG DƯƠNG rồi mới tới vế null', async () => {
    expect(await previewSource(validLab).getLab('lab-du')).not.toBeNull();
    expect(await previewSource(labUnfinishedTask).getLab('lab-nhap')).toBeNull();
  });

  it('form nạp được, và NÊU TÊN ô còn thiếu thay vì lưu im lặng', () => {
    const form = draftFromBody(labUnfinishedTask);
    expect(form.steps).toHaveLength(1);
    const [first] = form.steps;
    expect(first?.markdown).toBe('# task một');
    expect(first?.taskId).toBe('');
    expect(first?.weight).toBe('');

    const saved = toDraftInput('lab', form);
    expect(saved.ok).toBe(false);
    if (!saved.ok) expect(saved.issues.map((i) => i.path)).toContain('task[0].taskId');
  });
});

// ── jsonb: bốn cột `unknown`, và chúng là chỗ duy nhất có thể vỡ lúc chạy ─────

describe('jsonb được PARSE, không bị ép kiểu', () => {
  it('phase đủ khoá nạp đúng cả bốn ô', () => {
    const form = draftFromBody(
      bodyRow({
        intro: {
          title: 'Mở đầu',
          markdown: '# chào',
          setup: { foreground: 'echo fg', background: 'echo bg' },
          verifyScript: 'true',
        },
      }),
    );
    expect(form.hasIntro).toBe(true);
    expect(form.intro.title).toBe('Mở đầu');
    expect(form.intro.setupForeground).toBe('echo fg');
    expect(form.intro.setupBackground).toBe('echo bg');
    expect(form.intro.verifyScript).toBe('true');
    expect(form.hasFinish).toBe(false);
  });

  it('phase thiếu `setup` vẫn giữ markdown — không vứt cả phase vì một khoá con', () => {
    const form = draftFromBody(bodyRow({ finish: { markdown: '# hết' } }));
    expect(form.hasFinish).toBe(true);
    expect(form.finish.markdown).toBe('# hết');
    expect(form.finish.setupForeground).toBe('');
  });

  it('jsonb không phải object (chuỗi, số, mảng) ⇒ phase coi như KHÔNG có, không ném', () => {
    for (const junk of ['một chuỗi', 42, [], true]) {
      const form = draftFromBody(bodyRow({ intro: junk }));
      expect(form.hasIntro).toBe(false);
      expect(form.intro).toEqual(emptyDraft().intro);
    }
  });

  it('`setup` của lab đọc hai khoá, và chịu được jsonb hỏng', () => {
    expect(draftFromBody(bodyRow({ setup: { foreground: 'echo a', background: null } })).setupForeground).toBe(
      'echo a',
    );
    expect(draftFromBody(bodyRow({ setup: 'hỏng' })).setupForeground).toBe('');
  });

  it('assets: mảng object nạp thành dòng; phần tử không phải object bị bỏ', () => {
    const form = draftFromBody(
      bodyRow({
        assets: [
          { host: 'host01', file: 'a.json', target: '/root', chmod: '0644' },
          'không phải object',
          { host: 'host01', file: 'b.json', target: '/root', chmod: null },
        ],
      }),
    );
    expect(form.assets.map((a) => a.file)).toEqual(['a.json', 'b.json']);
    expect(form.assets.map((a) => a.chmod)).toEqual(['0644', '']);
    // Khoá React phải KHÁC nhau kể cả khi một phần tử ở giữa bị bỏ.
    expect(new Set(form.assets.map((a) => a.key)).size).toBe(2);
  });

  it('khoá jsonb VẮNG MẶT (không phải null) vẫn nạp được', () => {
    // Đây KHÔNG phải một ca giả định: `unknown` gồm cả `undefined`, nên kiểu
    // output của `authoring.get` đánh dấu bốn khoá jsonb là optional. Chính
    // TS2345 tại chỗ gọi đã nói ra điều đó (2026-09-06); một phép `as` sẽ nuốt
    // nó, rồi mọi hàm ở đây chạy trên một khoá không tồn tại.
    const form = draftFromBody({ item: itemRow(), steps: [] });
    expect(form.hasIntro).toBe(false);
    expect(form.hasFinish).toBe(false);
    expect(form.setupForeground).toBe('');
    expect(form.assets).toEqual([]);
  });

  it('assets không phải mảng ⇒ rỗng, không ném', () => {
    expect(draftFromBody(bodyRow({ assets: { host: 'host01' } })).assets).toEqual([]);
    expect(draftFromBody(bodyRow({ assets: null })).assets).toEqual([]);
  });
});

describe('cột enum: giá trị lạ bị thu hẹp, không lọt vào ô chọn', () => {
  it('`difficulty` lạ thành ô rỗng', () => {
    expect(draftFromBody(bodyRow({ item: itemRow({ difficulty: 'siêu-khó' }) })).difficulty).toBe('');
    expect(draftFromBody(bodyRow({ item: itemRow({ difficulty: 'advanced' }) })).difficulty).toBe('advanced');
  });

  it('`capabilities` GIỮ THỨ TỰ đã lưu và bỏ giá trị lạ', () => {
    const form = draftFromBody(
      bodyRow({ item: itemRow({ capabilities: ['kubernetes', 'quantum', 'docker'] }) }),
    );
    expect(form.capabilities).toEqual(['kubernetes', 'docker']);
  });

  it('`tier` lạ lùi về mặc định của form thay vì một giá trị không có trong ô chọn', () => {
    expect(draftFromBody(bodyRow({ item: itemRow({ tier: 'firecracker' }) })).tier).toBe(
      emptyDraft().tier,
    );
  });
});

// ── Vòng tròn khép ────────────────────────────────────────────────────────────

describe('nạp rồi Lưu ngay: payload phải bằng thứ đã tạo ra bản đang xem', () => {
  const full = bodyRow({
    item: itemRow({
      id: 'bai-day-du',
      title: 'Bài đầy đủ',
      description: 'mô tả',
      difficulty: 'intermediate',
      estimatedMinutes: 25,
      capabilities: ['docker'],
      interfaceLayout: 'ide',
      stepCount: 2,
    }),
    steps: [
      {
        ordinal: 0,
        taskId: null,
        title: 'Bước 1',
        markdown: '# một',
        setupForeground: 'echo fg1',
        setupBackground: null,
        verifyScript: 'true',
        weight: null,
        hint: null,
      },
      {
        ordinal: 1,
        taskId: null,
        title: null,
        markdown: '# hai',
        setupForeground: null,
        setupBackground: 'echo bg2',
        verifyScript: null,
        weight: null,
        hint: null,
      },
    ],
    intro: {
      title: null,
      markdown: '# mở',
      setup: { foreground: null, background: null },
      verifyScript: null,
    },
    assets: [{ host: 'host01', file: 'a.json', target: '/root/a.json', chmod: '0600' }],
  });

  it('mọi field đi được cả vòng', () => {
    const saved = toDraftInput('lesson', draftFromBody(full));
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    expect(saved.value.title).toBe('Bài đầy đủ');
    expect(saved.value.description).toBe('mô tả');
    expect(saved.value.difficulty).toBe('intermediate');
    expect(saved.value.estimatedMinutes).toBe(25);
    expect(saved.value.capabilities).toEqual(['docker']);
    expect(saved.value.interfaceLayout).toBe('ide');
    expect(saved.value.assets).toEqual([
      { host: 'host01', file: 'a.json', target: '/root/a.json', chmod: '0600' },
    ]);
    expect(saved.value.intro).toEqual({
      title: null,
      markdown: '# mở',
      setup: { foreground: null, background: null },
      verifyScript: null,
    });
    expect(saved.value.finish).toBeNull();
    expect(saved.value.steps).toEqual([
      {
        taskId: null,
        title: 'Bước 1',
        markdown: '# một',
        setupForeground: 'echo fg1',
        setupBackground: null,
        verifyScript: 'true',
        weight: null,
        hint: null,
      },
      {
        taskId: null,
        title: null,
        markdown: '# hai',
        setupForeground: null,
        setupBackground: 'echo bg2',
        verifyScript: null,
        weight: null,
        hint: null,
      },
    ]);
  });

  it('ĐỐI CHỨNG DƯƠNG cho chính vòng đó: bài đầy đủ này `preview` nạp được', async () => {
    // Nếu `preview` cũng từ chối nó thì fixture đã sai và mọi phép so ở trên
    // đang so hai thứ cùng hỏng.
    const seen = await previewSource(full).get('bai-day-du');
    expect(seen?.steps).toHaveLength(2);
  });
});
