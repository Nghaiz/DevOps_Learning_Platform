import { describe, expect, it } from 'vitest';
import type { ResolvedAsset } from '@devops-platform/scenario';
import type { Scenario } from '@devops-platform/shared-types/scenario';
import { AssetPushError, buildAssetPushScript, isAssetPushPhase } from './asset-push';

function resolved(over: Partial<ResolvedAsset> = {}): ResolvedAsset {
  return {
    name: 'start.sh',
    target: '~/',
    chmod: null,
    bytes: new TextEncoder().encode('echo hi\n'),
    ...over,
  };
}

/**
 * Giải mã lại payload base64 trong script sinh ra.
 *
 * Đây là phép kiểm QUAN TRỌNG nhất của file: mọi khẳng định khác chỉ nói script
 * "trông đúng". Chỉ vòng mã hoá → giải mã mới nói nội dung SỐNG SÓT nguyên vẹn,
 * và đó là điều duy nhất người học quan tâm.
 */
function decodePayloads(script: string): string[] {
  const out: string[] = [];
  const lines = script.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i]?.startsWith('base64 -d >') !== true) continue;
    const body: string[] = [];
    for (let j = i + 1; j < lines.length && lines[j] !== 'DLP_ASSET_EOF'; j += 1) {
      body.push(lines[j] ?? '');
    }
    out.push(Buffer.from(body.join(''), 'base64').toString('utf8'));
  }
  return out;
}

describe('buildAssetPushScript', () => {
  it('không có asset thì trả null (caller bỏ hẳn lượt exec)', () => {
    expect(buildAssetPushScript([])).toBeNull();
  });

  it('nội dung sống sót nguyên vẹn qua base64 — kể cả byte không phải UTF-8 text', () => {
    const binary = new Uint8Array([0x00, 0xff, 0x10, 0x0a, 0x27, 0x60, 0x24]);
    const script = buildAssetPushScript([resolved({ bytes: binary })]);

    const lines = (script ?? '').split('\n');
    const start = lines.findIndex((l) => l.startsWith('base64 -d >'));
    const end = lines.indexOf('DLP_ASSET_EOF', start);
    const decoded = Buffer.from(lines.slice(start + 1, end).join(''), 'base64');

    expect(new Uint8Array(decoded)).toEqual(binary);
  });

  it('giữ nguyên nội dung text nhiều dòng', () => {
    const script = buildAssetPushScript([resolved({ bytes: new TextEncoder().encode('a\nb\nc\n') })]);
    expect(decodePayloads(script ?? '')).toEqual(['a\nb\nc\n']);
  });

  it('`~/` nở thành "$HOME" — KHÔNG thành thư mục tên `~`', () => {
    // Mọi đường dẫn đều được trích dẫn để chặn injection, mà nháy đơn lại giết
    // luôn phép nở `~`. Nếu vế này sai, asset rơi vào ./~/ trong cwd và bài chết
    // với "No such file or directory" ở một đường dẫn trông hoàn toàn hợp lý.
    const script = buildAssetPushScript([resolved({ target: '~/' })]) ?? '';

    expect(script).toContain('"$HOME"/\'start.sh\'');
    expect(script).not.toMatch(/'~\//);
  });

  it('target tuyệt đối được trích dẫn nguyên vẹn', () => {
    const script = buildAssetPushScript([resolved({ target: '/opt/lab/' })]) ?? '';
    expect(script).toContain(`mkdir -p '/opt/lab/'`);
    expect(script).toContain(`base64 -d > '/opt/lab/start.sh'`);
  });

  it('chmod hợp lệ được áp; chmod null thì KHÔNG sinh dòng chmod', () => {
    expect(buildAssetPushScript([resolved({ chmod: '+rwx' })]) ?? '').toContain('chmod +rwx');
    expect(buildAssetPushScript([resolved({ chmod: '0644' })]) ?? '').toContain('chmod 0644');
    expect(buildAssetPushScript([resolved({ chmod: null })]) ?? '').not.toContain('chmod');
  });

  it('chmod lạ thì NÉM, không im lặng bỏ qua', () => {
    expect(() => buildAssetPushScript([resolved({ chmod: 'rm -rf /' })])).toThrow(AssetPushError);
    expect(() => buildAssetPushScript([resolved({ chmod: '+rwx; whoami' })])).toThrow(
      AssetPushError,
    );
  });

  it('nháy đơn trong tên file bị thoát — không thoát ra khỏi chuỗi shell', () => {
    // Nội dung đã vendored + ghim byte nên đây là phòng thủ chiều sâu. Vẫn phải
    // đúng: một tên file `x'; rm -rf /; '.sh` mà lọt ra ngoài nháy sẽ chạy với
    // quyền root trong pod người học.
    const script = buildAssetPushScript([resolved({ name: `x'; whoami; '.sh` })]) ?? '';

    // Chuỗi tấn công KHÔNG được xuất hiện dưới dạng lệnh trần.
    expect(script).not.toMatch(/^\s*whoami\s*$/m);
    expect(script).toContain(`'\\''`);
  });

  it('mở đầu bằng `set -eu` — lỗi giữa chừng không được thoát 0', () => {
    expect((buildAssetPushScript([resolved()]) ?? '').split('\n')[0]).toBe('set -eu');
  });

  it('kết bằng mốc đếm số file đã đẩy', () => {
    const script = buildAssetPushScript([resolved({ name: 'a.sh' }), resolved({ name: 'b.sh' })]);
    expect(script).toContain('echo "dlp-assets-pushed 2"');
  });
});

describe('isAssetPushPhase', () => {
  function scenario(over: Partial<Scenario> = {}): Scenario {
    return {
      intro: { title: null, markdown: '', setup: { foreground: null, background: null }, verifyScript: null },
      assets: [{ host: 'host01', file: 'a.sh', target: '~/', chmod: null }],
      ...over,
    } as Scenario;
  }

  it('có intro → đẩy ở intro, KHÔNG đẩy ở step', () => {
    const s = scenario();
    expect(isAssetPushPhase(s, { kind: 'intro' })).toBe(true);
    expect(isAssetPushPhase(s, { kind: 'step', index: 0 })).toBe(false);
    expect(isAssetPushPhase(s, { kind: 'finish' })).toBe(false);
  });

  it('KHÔNG có intro → đẩy ở step 0', () => {
    // `intro` là tuỳ chọn trong index.json. Chốt cứng `kind === 'intro'` sẽ làm
    // bài không-intro không bao giờ nhận được asset — im lặng.
    const s = scenario({ intro: null });
    expect(isAssetPushPhase(s, { kind: 'step', index: 0 })).toBe(true);
    expect(isAssetPushPhase(s, { kind: 'step', index: 1 })).toBe(false);
  });

  it('không có asset thì không phase nào đẩy', () => {
    const s = scenario({ assets: [] });
    expect(isAssetPushPhase(s, { kind: 'intro' })).toBe(false);
    expect(isAssetPushPhase(s, { kind: 'step', index: 0 })).toBe(false);
  });
});
