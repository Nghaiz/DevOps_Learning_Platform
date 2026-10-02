// Bộ đọc/ghi XML tối thiểu cho đúng phần SVG mà dvisvgm sinh ra.
//
// Cố ý KHÔNG dùng parser XML đầy đủ: ngữ pháp hẹp chính là một lớp an toàn. DOCTYPE, CDATA,
// processing instruction, entity lạ đều bị từ chối thẳng thay vì được hiểu "cho đúng chuẩn".
// File này nằm trong băm nguồn (sources.mjs): đổi cách ghi ⇒ mọi sơ đồ phải dựng lại.

const NAME = /^[A-Za-z_][\w:.-]*/;
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(text, where) {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);|&/g, (m, ent) => {
    if (!ent) throw new Error(`${where}: ký tự & không thuộc entity nào`);
    if (ent[0] === '#') {
      const code = ent[1] === 'x' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return String.fromCodePoint(code);
    }
    if (!(ent in ENTITIES)) throw new Error(`${where}: entity &${ent}; không được phép`);
    return ENTITIES[ent];
  });
}

/** Chuỗi SVG → cây { name, attrs: [[k, v]…], children: [], text }. Ném lỗi khi gặp thứ ngoài ngữ pháp. */
export function parseSvg(input) {
  let i = 0;
  const src = input.replace(/^﻿/, '');
  const root = { name: '#root', attrs: [], children: [], text: '' };
  const stack = [root];
  const fail = (msg) => {
    const line = src.slice(0, i).split('\n').length;
    throw new Error(`SVG dòng ${line}: ${msg}`);
  };
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    const text = lt === -1 ? src.slice(i) : src.slice(i, lt);
    if (text.trim() !== '') stack.at(-1).text += decode(text, 'nội dung chữ');
    if (lt === -1) break;
    i = lt;
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      if (end === -1) fail('chú thích không đóng');
      i = end + 3;
    } else if (src.startsWith('<?xml ', i) && stack.length === 1 && root.children.length === 0) {
      const end = src.indexOf('?>', i);
      if (end === -1) fail('khai báo XML không đóng');
      i = end + 2;
    } else if (src.startsWith('<!', i) || src.startsWith('<?', i)) {
      fail('DOCTYPE/CDATA/processing instruction không được phép');
    } else if (src.startsWith('</', i)) {
      const m = NAME.exec(src.slice(i + 2));
      if (!m) fail('thẻ đóng hỏng');
      const top = stack.pop();
      if (top.name !== m[0]) fail(`thẻ đóng </${m[0]}> không khớp <${top.name}>`);
      i += 2 + m[0].length;
      while (/\s/.test(src[i])) i++;
      if (src[i] !== '>') fail(`thẻ đóng </${m[0]}> hỏng`);
      i++;
    } else {
      const m = NAME.exec(src.slice(i + 1));
      if (!m) fail('thẻ mở hỏng');
      const node = { name: m[0], attrs: [], children: [], text: '' };
      i += 1 + m[0].length;
      for (;;) {
        while (/\s/.test(src[i])) i++;
        if (src.startsWith('/>', i)) { i += 2; stack.at(-1).children.push(node); break; }
        if (src[i] === '>') { i++; stack.at(-1).children.push(node); stack.push(node); break; }
        const a = NAME.exec(src.slice(i));
        if (!a) fail(`thuộc tính hỏng trong <${node.name}>`);
        i += a[0].length;
        while (/\s/.test(src[i])) i++;
        if (src[i] !== '=') fail(`thuộc tính ${a[0]} thiếu giá trị`);
        i++;
        while (/\s/.test(src[i])) i++;
        const q = src[i];
        if (q !== '"' && q !== "'") fail(`giá trị của ${a[0]} phải nằm trong nháy`);
        const end = src.indexOf(q, i + 1);
        if (end === -1) fail(`giá trị của ${a[0]} không đóng nháy`);
        const raw = src.slice(i + 1, end);
        if (raw.includes('<')) fail(`giá trị của ${a[0]} chứa <`);
        if (node.attrs.some(([k]) => k === a[0])) fail(`thuộc tính ${a[0]} lặp lại`);
        node.attrs.push([a[0], decode(raw, `thuộc tính ${a[0]}`)]);
        i = end + 1;
      }
    }
  }
  if (stack.length !== 1) fail(`thẻ <${stack.at(-1).name}> không đóng`);
  if (root.text.trim() !== '') fail('có chữ nằm ngoài <svg>');
  if (root.children.length !== 1 || root.children[0].name !== 'svg') fail('phải có đúng một phần tử gốc <svg>');
  return root.children[0];
}

export const getAttr = (node, key) => node.attrs.find(([k]) => k === key)?.[1];

export function setAttr(node, key, value) {
  const hit = node.attrs.find(([k]) => k === key);
  if (hit) hit[1] = value;
  else node.attrs.push([key, value]);
}

export function removeAttr(node, key) {
  node.attrs = node.attrs.filter(([k]) => k !== key);
}

/** Duyệt mọi phần tử (kể cả gốc) theo thứ tự tài liệu. */
export function* walkSvg(node) {
  yield node;
  for (const child of node.children) yield* walkSvg(child);
}

const escapeAttr = (v) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const escapeText = (v) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Cây → chuỗi chuẩn hoá: mỗi phần tử một dòng, nháy kép, không thụt lề, kết thúc bằng \n. */
export function serializeSvg(node) {
  const lines = [];
  const emit = (n) => {
    const attrs = n.attrs.map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('');
    const text = n.text.trim();
    if (n.children.length === 0 && text === '') {
      lines.push(`<${n.name}${attrs}/>`);
    } else if (n.children.length === 0) {
      lines.push(`<${n.name}${attrs}>${escapeText(text)}</${n.name}>`);
    } else {
      lines.push(`<${n.name}${attrs}>${escapeText(text)}`);
      n.children.forEach(emit);
      lines.push(`</${n.name}>`);
    }
  };
  emit(node);
  return `${lines.join('\n')}\n`;
}
