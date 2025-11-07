// core/editor-adapter.ts
// Small adapter that normalizes interactions across inputs, textareas, and contenteditable nodes.

export type Editable = HTMLElement | null;

export function isInputElement(el: any): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = (el.tagName || '').toUpperCase();
  return tag === 'TEXTAREA' || (tag === 'INPUT' && ['TEXT', 'SEARCH', 'URL', 'TEL', 'EMAIL', 'PASSWORD'].includes(((el as HTMLInputElement).type || '').toUpperCase()));
}

export function isContentEditable(el: any): el is HTMLElement {
  return !!el && el.nodeType === 1 && (el as HTMLElement).isContentEditable;
}

export function isEditable(el: any): boolean {
  return isInputElement(el) || isContentEditable(el);
}

export function getText(el: Editable): string {
  if (!el) return '';
  if (isInputElement(el)) return (el as HTMLInputElement | HTMLTextAreaElement).value || '';
  if (isContentEditable(el)) return (el as HTMLElement).innerText || '';
  return '';
}

export function setText(el: Editable, text: string): void {
  if (!el) return;
  if (isInputElement(el)) {
    const input = el as HTMLInputElement | HTMLTextAreaElement;
    input.value = text;
    try {
      input.dispatchEvent(new InputEvent('input', { bubbles: true } as any));
    } catch (e) {
      // older browsers fallback
      const ev = document.createEvent('Event');
      ev.initEvent('input', true, false);
      input.dispatchEvent(ev);
    }
    return;
  }

  if (isContentEditable(el)) {
    const he = el as HTMLElement;
    he.innerText = text;
    try {
      he.dispatchEvent(new InputEvent('input', { bubbles: true } as any));
    } catch (e) {
      const ev = document.createEvent('Event');
      ev.initEvent('input', true, false);
      he.dispatchEvent(ev);
    }
    return;
  }
}

export function getCaretIndex(el: Editable): number {
  if (!el) return 0;
  if (isInputElement(el)) {
    try {
      const e = el as HTMLInputElement | HTMLTextAreaElement;
      return (typeof e.selectionStart === 'number') ? (e.selectionStart as number) : 0;
    } catch (e) { return 0; }
  }

  if (isContentEditable(el)) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return 0;
    const range = sel.getRangeAt(0);
    // Ensure the range is within element
    if (!el.contains(range.startContainer)) return 0;
    return range.startOffset || 0;
  }

  return 0;
}

export function setCaretIndex(el: Editable, index: number): void {
  if (!el) return;
  if (isInputElement(el)) {
    const e = el as HTMLInputElement | HTMLTextAreaElement;
    try {
      e.setSelectionRange(index, index);
    } catch (e) {
      // ignore
    }
    return;
  }

  if (isContentEditable(el)) {
    const node = el as HTMLElement;
    // place caret at start of first text node + offset
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null as any);
    let cur: Node | null = walker.nextNode();
    let remaining = index;
    let targetNode: Node | null = null;
    while (cur) {
      const len = (cur.textContent || '').length;
      if (remaining <= len) { targetNode = cur; break; }
      remaining -= len;
      cur = walker.nextNode();
    }
    if (!targetNode) {
      // fallback to node end
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      const sel = window.getSelection();
      if (sel) { sel.removeAllRanges(); sel.addRange(range); }
      return;
    }
    const range = document.createRange();
    range.setStart(targetNode, Math.min(remaining, (targetNode.textContent || '').length));
    range.collapse(true);
    const sel = window.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
    return;
  }
}

export function getCaretBounds(el: Editable): DOMRect | null {
  if (!el) return null;
  if (isContentEditable(el)) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return (el as HTMLElement).getBoundingClientRect();
    const range = sel.getRangeAt(0).cloneRange();
    if (range.getClientRects().length > 0) return range.getClientRects()[0];
    return (el as HTMLElement).getBoundingClientRect();
  }
  // For inputs/textarea, compute a caret rectangle using a mirror technique for better positioning.
  const input = el as HTMLInputElement | HTMLTextAreaElement;
  try {
    const rect = getInputCaretRect(input);
    if (rect) return rect;
  } catch (e) {
    // ignore and fallback
  }
  return (el as HTMLElement).getBoundingClientRect();
}

function getInputCaretRect(input: HTMLInputElement | HTMLTextAreaElement): DOMRect | null {
  const doc = input.ownerDocument || document;
  const win = doc.defaultView || window;

  const computed = win.getComputedStyle(input);

  // Create mirror div
  const mirror = doc.createElement('div');
  const style = mirror.style;
  style.position = 'absolute';
  style.whiteSpace = 'pre-wrap';
  style.visibility = 'hidden';
  style.pointerEvents = 'none';

  // Copy font and relevant properties
  const props = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'textTransform',
    'textIndent', 'boxSizing', 'borderLeftWidth', 'borderRightWidth', 'borderTopWidth', 'borderBottomWidth',
    'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'width', 'lineHeight'
  ];
  for (const p of props) {
    try { (style as any)[p] = (computed as any)[p]; } catch (e) {}
  }

  // Mirror scroll position
  style.overflow = 'auto';

  // Prepare text content up to caret
  const value = input.value || '';
  const selectionStart = (typeof (input as any).selectionStart === 'number') ? (input as any).selectionStart : value.length;

  // For textarea we need to preserve line breaks; for input use single line
  const textBefore = value.substring(0, selectionStart);

  // Replace spaces with nbsp to preserve spacing
  const html = textBefore.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>').replace(/ /g, '&nbsp;');

  mirror.innerHTML = html + '<span id="__caret_marker__">&nbsp;</span>';
  doc.body.appendChild(mirror);

  const marker = mirror.querySelector('#__caret_marker__') as HTMLElement | null;
  let rect: DOMRect | null = null;
  if (marker) {
    const r = marker.getBoundingClientRect();
    rect = r;
  }

  // Cleanup
  if (mirror.parentElement) mirror.parentElement.removeChild(mirror);

  // The mirror is positioned at document origin; convert to viewport coords relative to input
  if (rect) {
    // compute offset of input
    const inputRect = input.getBoundingClientRect();
    // For simplicity return rect positioned near input; more advanced mapping could be done if needed
    return new DOMRect(inputRect.left + rect.left, inputRect.top + rect.top, rect.width, rect.height);
  }

  return null;
}
