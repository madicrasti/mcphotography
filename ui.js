/* Tiny UI helpers shared by the client site and admin. */
(function (root) {
  'use strict';
  function h(tag, attrs) {
    var el = document.createElement(tag), kids = Array.prototype.slice.call(arguments, 2);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    append(el, kids);
    return el;
  }
  function append(el, kids) {
    kids.forEach(function (c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) return append(el, c);
      el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    });
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function mount(el) { var a = Array.prototype.slice.call(arguments, 1); clear(el); append(el, a); return el; }
  var toastEl;
  function toast(msg, kind) {
    if (!toastEl) { toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.className = 'toast show ' + (kind || '');
    clearTimeout(toast._t); toast._t = setTimeout(function () { toastEl.className = 'toast'; }, 3600);
  }
  function modal(content, opts) {
    opts = opts || {};
    var box = h('div', { class: 'modal-card ' + (opts.wide ? 'wide' : ''), role: 'dialog', 'aria-modal': 'true' });
    var wrap = h('div', { class: 'modal', onclick: function (e) { if (e.target === wrap && !opts.sticky) close(); } }, box);
    function close() { wrap.remove(); document.removeEventListener('keydown', onKey); if (opts.onClose) opts.onClose(); }
    function onKey(e) { if (e.key === 'Escape' && !opts.sticky) close(); }
    document.addEventListener('keydown', onKey);
    append(box, [typeof content === 'function' ? content(close) : content]);
    document.body.appendChild(wrap);
    var f = box.querySelector('input,textarea,select,button'); if (f && !opts.noFocus) setTimeout(function () { f.focus(); }, 30);
    return { close: close, box: box };
  }
  function field(label, input, hint, error) {
    return h('label', { class: 'field' + (error ? ' has-error' : '') }, h('span', { class: 'field-label' }, label), input,
      hint ? h('span', { class: 'field-hint' }, hint) : null, error ? h('span', { class: 'field-error' }, error) : null);
  }
  function debounce(fn, ms) { var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function busy(btn, on, label) {
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || 'Working…'; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }
  root.MCui = { h: h, mount: mount, clear: clear, toast: toast, modal: modal, field: field, debounce: debounce, esc: esc, busy: busy };
})(window);
