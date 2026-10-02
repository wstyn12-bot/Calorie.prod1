// Tiny safe templating: html`...` escapes every interpolated value unless it is
// itself an html`` result (or wrapped in raw()). Arrays are joined.

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export class Safe {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

export const raw = (s) => new Safe(String(s));

export function esc(v) {
  return String(v).replace(/[&<>"']/g, (c) => ESC[c]);
}

function part(v) {
  if (v === null || v === undefined || v === false || v === true) return "";
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(part).join("");
  return esc(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1];
  return new Safe(out);
}

// Join class names, skipping falsy ones: cls("a", cond && "b")
export const cls = (...names) => names.filter(Boolean).join(" ");
