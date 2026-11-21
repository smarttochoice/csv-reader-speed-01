// Fast drop-in for csv-reader 1.0.0 (make.fun): same answers, single-pass scanner
// with regex/indexOf jumps instead of a character-at-a-time loop.
//
// Semantics replicate vendor/csv-reader/index.js exactly:
//  - U+FEFF at the very start is dropped.
//  - A record ends at LF or CRLF; a line left with no characters is no record.
//  - Outside quotes a CR not followed by LF is dropped (stray_cr).
//  - A field opening with a quote runs to the next non-doubled quote; "" inside is one
//    quote; each CRLF or lone CR inside reads as LF; what follows the closing quote up
//    to the next comma or line break is appended as-is (quote_junk when the field ends);
//    a quote that never closes is a literal char and the text after it is re-read as
//    unquoted (unterminated_quote).
//  - A quote inside an unquoted field is literal. Fields stay strings.
//  - columns = first record if header, else null ([]) if header and no records at all;
//    rows are padded (short_row, fields: count) or cut (long_row, extra: cut fields)
//    to the first record's width.
//  - Each error is {code, line, row} in the order met; line is the 1-based line the
//    record starts on, row is the record's index in rows (null for the header).
//
// Speed: unquoted fields are scanned with one global /[,\n\r]/ exec per segment
// (a single forward scan that stops at the first terminator); quoted fields jump
// from quote to quote with indexOf, and a quoted segment with no newline is taken
// as one slice with no line counting. Field results are kept in shared slots to
// avoid a per-field object.
const COMMA = 0, LINE_BREAK = 1, END = 2;
const SEP = /[,\n\r]/g;
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  let pos = 0, line = 1;
  if (len > 0 && text.charCodeAt(0) === 0xFEFF) pos = 1;
  let recordLine = 1, recordRow = null;
  let curValue = '', curEnded = END, curAdded = 0;
  function error(code) { errors.push({ code, line: recordLine, row: recordRow }); }
  function normalize(seg) {
    const hasLF = seg.indexOf('\n') !== -1;
    const hasCR = seg.indexOf('\r') !== -1;
    if (!hasLF && !hasCR) return seg;
    let n = 0, i = -1;
    while ((i = seg.indexOf('\n', i + 1)) !== -1) n++;
    i = -1;
    while ((i = seg.indexOf('\r', i + 1)) !== -1) { if (seg.charCodeAt(i + 1) !== 10) n++; }
    line += n;
    return hasCR ? seg.replace(/\r\n?/g, '\n') : seg;
  }
  function readUnquoted(initial) {
    let value = initial, added = 0, p = pos;
    for (;;) {
      SEP.lastIndex = p;
      const m = SEP.exec(text);
      if (m === null) {
        if (p < len) { value += text.slice(p, len); added += len - p; }
        pos = len; curValue = value; curEnded = END; curAdded = added; return;
      }
      const e = m.index, ch = m[0];
      if (ch === ',') {
        if (e > p) { value += text.slice(p, e); added += e - p; }
        pos = e + 1; curValue = value; curEnded = COMMA; curAdded = added; return;
      }
      if (ch === '\n') {
        if (e > p) { value += text.slice(p, e); added += e - p; }
        pos = e + 1; line++; curValue = value; curEnded = LINE_BREAK; curAdded = added; return;
      }
      // '\r'
      if (e + 1 < len && text.charCodeAt(e + 1) === 10) {
        if (e > p) { value += text.slice(p, e); added += e - p; }
        pos = e + 2; line++; curValue = value; curEnded = LINE_BREAK; curAdded = added; return;
      }
      if (e > p) { value += text.slice(p, e); added += e - p; }
      error('stray_cr');
      p = e + 1;
    }
  }
  function readQuoted() {
    const open = pos, openLine = line;
    let p = pos + 1, segStart = p, parts = null;
    for (;;) {
      const qi = text.indexOf('"', p);
      if (qi === -1) {
        pos = open + 1; line = openLine;
        error('unterminated_quote');
        readUnquoted('"');
        return;
      }
      if (text.charCodeAt(qi + 1) === 34) {
        const norm = normalize(text.slice(segStart, qi));
        if (parts === null) parts = [norm, '"']; else { parts.push(norm, '"'); }
        p = qi + 2; segStart = p; continue;
      }
      const norm = normalize(text.slice(segStart, qi));
      let value;
      if (parts === null) value = norm; else { parts.push(norm); value = parts.join(''); }
      pos = qi + 1;
      if (pos >= len) { curValue = value; curEnded = END; curAdded = 0; return; }
      const c = text.charCodeAt(pos);
      if (c === 44) { pos++; curValue = value; curEnded = COMMA; curAdded = 0; return; }
      if (c === 10) { pos++; line++; curValue = value; curEnded = LINE_BREAK; curAdded = 0; return; }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line++; curValue = value; curEnded = LINE_BREAK; curAdded = 0; return; }
      readUnquoted(value);
      if (curAdded > 0) error('quote_junk');
      return;
    }
  }
  for (;;) {
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) { pos++; line++; }
      else if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line++; }
      else break;
    }
    if (pos >= len) break;
    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let ended, lastQuoted = false;
    do {
      if (text.charCodeAt(pos) === 34) { lastQuoted = true; readQuoted(); }
      else { lastQuoted = false; readUnquoted(''); }
      ended = curEnded;
      fields.push(curValue);
    } while (ended === COMMA);
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;
    if (width < 0) width = fields.length;
    if (header && columns === null) { columns = fields; continue; }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
