// Minimal DOM morphing: patch the live DOM to match a new HTML string without
// recreating unchanged nodes. Keeps focus, caret, scroll positions and images.
// Elements with data-key are matched by key; data-morph="skip" leaves children alone.

export function morph(target, htmlString) {
  const tpl = document.createElement("template");
  tpl.innerHTML = htmlString;
  morphChildren(target, tpl.content);
}

const keyOf = (n) => (n.nodeType === 1 ? n.getAttribute("data-key") : null);

function sameType(a, b) {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType !== 1) return true;
  if (a.nodeName !== b.nodeName) return false;
  // inputs of different types behave differently; don't reuse across types
  if (a.nodeName === "INPUT") return (a.getAttribute("type") || "text") === (b.getAttribute("type") || "text");
  return true;
}

function morphChildren(fromParent, toParent) {
  const keyed = new Map();
  for (let n = fromParent.firstChild; n; n = n.nextSibling) {
    const k = keyOf(n);
    if (k) keyed.set(k, n);
  }
  let cursor = fromParent.firstChild;
  const toNodes = Array.from(toParent.childNodes);
  for (const toNode of toNodes) {
    const k = keyOf(toNode);
    let match = null;
    if (k) {
      const cand = keyed.get(k);
      if (cand && sameType(cand, toNode)) {
        match = cand;
        keyed.delete(k);
      }
    } else if (cursor && !keyOf(cursor) && sameType(cursor, toNode)) {
      match = cursor;
    }
    if (match) {
      if (match === cursor) cursor = cursor.nextSibling;
      else fromParent.insertBefore(match, cursor);
      morphNode(match, toNode);
    } else {
      fromParent.insertBefore(toNode, cursor);
    }
  }
  while (cursor) {
    const next = cursor.nextSibling;
    fromParent.removeChild(cursor);
    cursor = next;
  }
}

function syncAttributes(from, to) {
  const fromAttrs = from.attributes;
  for (let i = fromAttrs.length - 1; i >= 0; i--) {
    const name = fromAttrs[i].name;
    if (!to.hasAttribute(name)) from.removeAttribute(name);
  }
  for (const attr of to.attributes) {
    if (from.getAttribute(attr.name) !== attr.value) from.setAttribute(attr.name, attr.value);
  }
}

function morphNode(from, to) {
  if (from.nodeType !== 1) {
    if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
    return;
  }
  syncAttributes(from, to);
  const tag = from.nodeName;
  const focused = from === document.activeElement;

  // Inputs are only "controlled" when the template gives them a value attribute
  // (textareas: data-controlled). Uncontrolled fields keep whatever the user typed.
  if (tag === "INPUT") {
    const type = from.type;
    if (type === "checkbox" || type === "radio") {
      const want = to.hasAttribute("checked");
      if (from.checked !== want) from.checked = want;
    } else if (type !== "file" && to.hasAttribute("value") && !focused) {
      const want = to.getAttribute("value");
      if (from.value !== want) from.value = want;
    }
    return;
  }
  if (tag === "TEXTAREA") {
    if (to.hasAttribute("data-controlled") && !focused) {
      const want = to.textContent;
      if (from.value !== want) from.value = want;
    }
    return;
  }
  if (from.getAttribute("data-morph") === "skip") return;
  morphChildren(from, to);
  if (tag === "SELECT") {
    const sel = to.querySelector("option[selected]");
    const want = sel ? sel.getAttribute("value") ?? sel.textContent : from.options[0]?.value;
    if (want !== undefined && from.value !== want) from.value = want;
  }
}
