import type { ResolvedAsset } from '@devops-platform/scenario';
import type { Scenario } from '@devops-platform/shared-types/scenario';
import type { PhaseRef } from './phase';

/**
 * Sinh script shell đẩy asset của scenario vào pod sandbox (P2 / 2.D — task 0.6).
 *
 * ## Vì sao KHÔNG thêm endpoint mới
 *
 * Gateway đã có `POST /exec/session/{id}`: nó chạy một shell hằng-số-phía-server
 * và nạp script qua **STDIN**, sau chuỗi authz chín bước với `Target` đọc từ
 * Redis. Đẩy file bằng cách sinh ra một script `base64 -d` dùng lại NGUYÊN đường
 * đó — không endpoint mới, không mã authz thứ hai phải giữ đồng bộ, không quyền
 * `pods/exec` cấp thêm cho ai. Một endpoint upload riêng sẽ phải tự dựng lại cả
 * chín bước ấy, và bước bị bỏ quên sẽ là bước g (`hash.userId == token.sub`).
 *
 * ## Vì sao base64 chứ không đẩy byte thô
 *
 * Script đi qua stdin dưới dạng text. Asset gồm `.js`, `.sh` — hôm nay đều là
 * text, nhưng `ScenarioAsset` không hứa điều đó, và một file nhị phân lọt vào sẽ
 * mang byte NUL cùng chuỗi trùng với dấu kết heredoc. base64 làm mọi asset thành
 * cùng một lớp ký tự an toàn `[A-Za-z0-9+/=]`, nên dấu kết heredoc dưới đây
 * KHÔNG THỂ xuất hiện trong dữ liệu — đó là lý do nó an toàn, chứ không phải vì
 * chuỗi được chọn cho dài.
 */

/**
 * Asset được đẩy đúng MỘT lần, ở phase setup ĐẦU TIÊN của bài.
 *
 * Upstream Killercoda upload asset lúc dựng môi trường, trước mọi script. Ta
 * không có móc "lúc dựng môi trường" riêng (pod đến từ warm-pool, đã sống sẵn),
 * nên phase đầu tiên là chỗ gần nhất về mặt ngữ nghĩa.
 *
 * ⛔ KHÔNG chốt cứng `kind === 'intro'`: `intro` là **tuỳ chọn** trong
 * `index.json`, và một bài có asset nhưng không có intro sẽ im lặng không bao
 * giờ được đẩy file — đúng hạng lỗi mà cả tầng này sinh ra để đóng. Suy phase
 * đầu từ chính scenario thay vì đoán theo tên.
 */
export function isAssetPushPhase(scenario: Scenario, phase: PhaseRef): boolean {
  if (scenario.assets.length === 0) {
    return false;
  }
  return scenario.intro !== null
    ? phase.kind === 'intro'
    : phase.kind === 'step' && phase.index === 0;
}

/** Dấu kết heredoc. An toàn vì bảng chữ base64 không chứa `_` và chữ hoa liền mạch này. */
const EOF_MARKER = 'DLP_ASSET_EOF';

/** `chmod` hợp lệ: bát phân 3–4 chữ số, hoặc dạng ký hiệu `[ugoa][+-=][rwxXst]`. */
const CHMOD_PATTERN = /^(?:[0-7]{3,4}|[ugoa]*[+\-=][rwxXst]+)$/;

export class AssetPushError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssetPushError';
  }
}

/**
 * `null` khi scenario không có asset — caller bỏ qua hẳn lượt exec thay vì chạy
 * một script rỗng (một lượt exec thừa mất ~vài trăm ms và một dòng log gây hiểu nhầm).
 */
export function buildAssetPushScript(assets: readonly ResolvedAsset[]): string | null {
  if (assets.length === 0) {
    return null;
  }

  // `set -eu` là phần bắt buộc: thiếu nó, một `base64 -d` hỏng giữa chừng vẫn để
  // script thoát 0, `runSetup` báo thành công, và bài chết ở step sau với triệu
  // chứng không liên quan.
  const lines: string[] = ['set -eu'];

  for (const asset of assets) {
    const filePath = joinTarget(expandHome(asset.target), asset.name);
    const path = shellQuote(filePath);

    // `mkdir -p` phải tạo thư mục CHA CỦA FILE, không phải `asset.target`.
    //
    // `name` có thể nhiều tầng (`app-star/star.json` — `killercoda.ts` ghi rõ đó
    // là hình dạng upstream có thật, và `resolveScenarioAssets` hỗ trợ nó bằng
    // `readdir(recursive)`). Bản đầu `mkdir -p` đúng `target`, nên với
    // `target="~/"` + `name="app/config.json"` nó tạo `$HOME` (đã có sẵn) rồi
    // ghi vào `$HOME/app/config.json` — mà `$HOME/app` không tồn tại. Redirect
    // thất bại, `set -eu` giết script, `runSetup` ném, và người học không nhận
    // được môi trường nào.
    //
    // Hai tầng của cùng tính năng bất đồng về "tên asset hợp lệ là gì", và
    // không test nào bắt được vì `asset-push.test.ts` chỉ dùng tên phẳng.
    lines.push(`mkdir -p ${shellQuote(dirnamePosix(filePath))}`);
    // Heredoc trích dẫn (`<<'EOF'`) — KHÔNG phải bản không trích dẫn: bản không
    // trích dẫn cho shell nội suy `$` và `` ` `` trong thân, mà thân ở đây là dữ
    // liệu từ đĩa. base64 không chứa hai ký tự đó nên hôm nay vô hại, nhưng dựa
    // vào bảng chữ của payload để giữ an toàn cú pháp là dựa nhầm chỗ.
    lines.push(`base64 -d > ${path} <<'${EOF_MARKER}'`);
    lines.push(base64Wrapped(asset.bytes));
    lines.push(EOF_MARKER);

    if (asset.chmod !== null) {
      if (!CHMOD_PATTERN.test(asset.chmod)) {
        // Nội dung đã vendored + ghim byte, nên đây là phòng thủ chiều sâu chứ
        // không phải kiểm đầu vào người dùng. Vẫn NÉM: một `chmod` lạ nghĩa là
        // `index.json` mang thứ ta chưa hiểu, và đoán bừa quyền file trong
        // sandbox là cách sai để xử lý điều chưa hiểu.
        throw new AssetPushError(
          `chmod "${asset.chmod}" của asset "${asset.name}" không hợp lệ`,
        );
      }
      lines.push(`chmod ${asset.chmod} ${path}`);
    }
  }

  // Mốc để `runSetup` phân biệt "script chạy hết" với "script chết giữa chừng mà
  // exit code bị nuốt".
  lines.push(`echo "dlp-assets-pushed ${String(assets.length)}"`);
  return lines.join('\n');
}

/**
 * Killercoda viết `target: "~/"`. Dấu `~` chỉ nở ra khi KHÔNG được trích dẫn —
 * mà ta trích dẫn mọi đường dẫn để chặn injection, nên `~` sẽ đi thẳng vào tên
 * thư mục và tạo ra một thư mục tên đúng là `~` trong cwd. Đổi sang `$HOME`
 * ở đây, TRƯỚC khi trích dẫn, là chỗ duy nhất còn đúng cả hai vế.
 */
function expandHome(target: string): string {
  if (target === '~' || target === '~/') {
    return '$HOME/';
  }
  return target.startsWith('~/') ? `$HOME/${target.slice(2)}` : target;
}

function joinTarget(dir: string, name: string): string {
  return dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`;
}

/**
 * Thư mục cha, tính theo POSIX.
 *
 * ⛔ KHÔNG dùng `node:path.dirname`: mã này chạy trên BFF (có thể là Windows lúc
 * dev) nhưng sinh ra đường dẫn cho shell LINUX trong pod. `path.win32.dirname`
 * sẽ coi `/` và `\` như nhau và trả về dấu phân tách sai.
 */
function dirnamePosix(filePath: string): string {
  const at = filePath.lastIndexOf('/');
  return at <= 0 ? '/' : filePath.slice(0, at);
}

/**
 * Trích dẫn cho shell POSIX.
 *
 * `$HOME` phải nở ra, nên nó KHÔNG thể nằm trong nháy đơn — tách phần đó ra
 * ngoài và trích dẫn phần còn lại. Mọi thứ khác đi vào nháy đơn, với `'` được
 * thoát theo lối `'\''` kinh điển.
 */
function shellQuote(value: string): string {
  const quoteLiteral = (s: string): string => `'${s.replaceAll("'", `'\\''`)}'`;
  if (value === '$HOME' || value === '$HOME/') {
    return '"$HOME"';
  }
  if (value.startsWith('$HOME/')) {
    return `"$HOME"/${quoteLiteral(value.slice('$HOME/'.length))}`;
  }
  return quoteLiteral(value);
}

/** base64 gãy dòng 76 ký tự — dòng dài vài chục KB làm log và chẩn đoán vô dụng. */
function base64Wrapped(bytes: Uint8Array): string {
  const b64 = Buffer.from(bytes).toString('base64');
  const out: string[] = [];
  for (let i = 0; i < b64.length; i += 76) {
    out.push(b64.slice(i, i + 76));
  }
  return out.join('\n');
}
