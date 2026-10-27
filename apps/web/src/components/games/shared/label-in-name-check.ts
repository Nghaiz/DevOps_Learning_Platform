/**
 * Bản sao PHÍA TEST của luật axe `label-content-name-mismatch` (axe-core 4.14),
 * chỉ phần so từ — dùng trong unit test của các nút SVG có `aria-label`.
 *
 * VÌ SAO KHÔNG GỌI THẲNG axe: chạy trong jsdom, luật này trả `incomplete` chứ
 * không trả `passes`/`violations` (đo 2026-10-27 trên chính hai cây `<text>` mà
 * Chromium chấm một đỏ một xanh) — jsdom không có layout nên axe không quyết được
 * chữ nào "nhìn thấy". Một ô dựa vào `axe.run` ở đây sẽ xanh vì không chấm gì.
 *
 * Bản sao này bám `curateTokens` / `isContiguousSubsequence` trong `axe.js`:
 * chữ thường → NFKD → bỏ ngoặc tròn → mọi ký tự không phải chữ/số thành khoảng
 * trắng → tách từ bằng `Intl.Segmenter`. Độ trung thực của nó được ghim bằng các
 * cặp đã chấm bằng axe THẬT trên Chromium (`label-in-name-check.test.ts`).
 *
 * ⚠ Nó KHÔNG thay được lượt axe trên trình duyệt (`e2e/*` qua `scanAxe`): phần
 * "phần tử nào đang hiện" chỉ trình duyệt thật trả lời được.
 */

/** Phần tử không bao giờ góp chữ "nhìn thấy": không được vẽ, hoặc axe coi là ẩn. */
const NEVER_VISIBLE = new Set(['title', 'desc', 'style', 'script', 'noscript', 'template']);

/**
 * Chữ nhìn thấy của một phần tử, nối Y NHƯ axe nối: text node nối bằng chuỗi
 * RỖNG (nên hai `<text>` liền nhau không có khoảng trắng ở giữa sẽ dính thành
 * một từ), `<br>` thành một khoảng trắng.
 */
export function visibleText(element: Element): string {
  let out = '';
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === child.TEXT_NODE) {
      out += child.nodeValue ?? '';
    } else if (child instanceof Element) {
      const tag = child.localName.toLowerCase();
      if (tag === 'br') out += ' ';
      else if (!NEVER_VISIBLE.has(tag)) out += visibleText(child);
    }
  }
  return out;
}

function removeParentheticals(text: string): string {
  let previous: string;
  let current = text;
  do {
    previous = current;
    current = current.replace(/\([^()]*\)/g, '');
  } while (current !== previous);
  return current;
}

const WORDS = new Intl.Segmenter(undefined, { granularity: 'word' });

/** Dãy từ axe so sánh. Dấu thanh tiếng Việt tách ra sau NFKD rồi thành khoảng trắng — hai phía như nhau. */
export function curateTokens(text: string): string[] {
  const cleaned = removeParentheticals(text.toLowerCase().normalize('NFKD')).replace(
    /[^\p{L}\p{N}]/gu,
    ' ',
  );
  const words: string[] = [];
  for (const { segment } of WORDS.segment(cleaned)) {
    const word = segment.trim();
    if (word.length > 0) words.push(word);
  }
  return words;
}

/** Đạt khi dãy từ nhìn thấy là dãy con LIỀN MẠCH, ĐÚNG THỨ TỰ của dãy từ trong tên. */
export function isLabelInName(visible: string, name: string): boolean {
  const label = curateTokens(visible);
  if (label.length === 0) return true;
  const haystack = curateTokens(name);
  for (let i = 0; i + label.length <= haystack.length; i += 1) {
    if (label.every((word, j) => word === haystack[i + j])) return true;
  }
  return false;
}

/** Tiện cho thông báo lỗi của test: chỉ ra hai dãy từ đã đem so. */
export function explainMismatch(visible: string, name: string): string {
  return `nhìn thấy [${curateTokens(visible).join(' ')}] ⊄ tên [${curateTokens(name).join(' ')}]`;
}
