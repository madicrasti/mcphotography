/* Madi's admin. */
(function () {
  'use strict';
  var C = window.MCcore, API = window.MCapi, A = API.admin, U = window.MCui, h = U.h;
  var CFG = window.MC_CONFIG || {};
  var app = document.getElementById('app');
  var LOGO = CFG.adminLogo || CFG.logo || '../assets/logo.png';
  var D = null; // overview data
  var STAGES = ['New Leads', 'Communicated', 'Dead Leads', 'Booked', 'Past Clients', 'Cancelled'];
  var TICKS = [['emailed', 'Emailed'], ['replied', 'They replied'], ['quoteSent', 'Quote sent'], ['booked', 'Booked'], ['depositPaid', 'Deposit paid'], ['socialConsent', 'Social consent'],
    ['shot', 'Shot'], ['galleryDelivered', 'Gallery delivered'], ['retouchingDone', 'Retouching done'], ['testimonialAsked', 'Testimonial asked']];
  var ACTIVE = ['held', 'confirmed', 'pending_redeposit'];

  function $m(c) { return C.money(c, { always: (c || 0) % 100 !== 0 }); }
  function dollars(c) { return ((c || 0) / 100).toFixed(2).replace(/\.00$/, ''); }
  function cents(v) { var n = parseFloat(String(v).replace(/[$,\s]/g, '')); return isNaN(n) ? 0 : Math.round(n * 100); }
  function offerOf(id) { return (D.offers || []).filter(function (o) { return o.id === id; })[0] || {}; }
  function bookingOf(id) { return D.bookings.filter(function (b) { return b.id === id; })[0]; }
  function ledger(b) { return C.ledger(b); }
  function isUpcoming(b) { return ACTIVE.indexOf(b.status) >= 0 && b.endMs > Date.now() && !(b.status === 'held' && b.holdExpiresMs < Date.now()); }
  function needsYou(b) { return (b.refundPendingCents > 0) || b.status === 'pending_redeposit' || (b.flags && b.flags.needsAttention); }
  function statusChip(b) {
    var m = { held: ['Awaiting payment', 'butter'], confirmed: ['Confirmed', 'mint'], pending_redeposit: ['New deposit needed', 'butter'], cancelled: ['Cancelled', 'rose'], completed: ['Shot', 'grey'], expired: ['Expired', 'grey'] }[b.status] || [b.status, 'grey'];
    return h('span', { class: 'chip ' + m[1] }, m[0]);
  }
  function payChip(b) {
    if (b.status === 'cancelled' || b.status === 'expired') return null;
    var L = ledger(b);
    if (!b.totalCents) return h('span', { class: 'chip lilac' }, 'Collab — $0');
    if (!L.balanceCents) return h('span', { class: 'chip blue' }, 'Paid in full');
    return h('span', { class: 'chip pink' }, $m(L.balanceCents) + ' owing');
  }
  function dt(ms) { return C.fmtDate(ms, true) + ' · ' + C.fmtTime(ms); }
  function locName(L) { return !L ? '—' : L.type === 'unsure' ? 'Needs your suggestion' : (L.name || '—') + (L.second ? ' + ' + L.second.name : ''); }
  async function refresh() { D = await A.overview(); }
  function err(e) { U.toast(e.message || String(e), 'bad'); }

  /* ---------------- Shell ---------------- */
  var NAV = [['today', 'Today'], ['bookings', 'Bookings'], ['new', 'New booking'], ['availability', 'Availability'], ['offers', 'Offers'], ['locations', 'Locations'], ['emails', 'Emails'], ['clients', 'Clients'], ['settings', 'Settings']];
  function shell(active, content) {
    var attention = D.bookings.filter(needsYou).length;
    U.mount(app, h('div', { class: 'shell' },
      h('aside', { class: 'side' },
        h('div', { class: 'logo' }, h('img', { src: LOGO, alt: 'Madi Crasti Photography' }), h('span', null, 'admin')),
        h('nav', { class: 'nav', 'aria-label': 'Admin' }, NAV.map(function (n) {
          return h('a', { href: '#/' + n[0], class: n[0] === active ? 'on' : '' }, n[1], n[0] === 'today' && attention ? h('span', { class: 'count', 'aria-label': attention + ' need you' }, String(attention)) : null);
        })),
        h('div', { class: 'foot' }, h('a', { href: CFG.clientUrl || '../', target: '_blank', rel: 'noopener' }, 'View booking site ↗'),
          API.mode === 'live' ? h('a', { href: '#', onclick: async function (e) { e.preventDefault(); await A.signOut(); location.reload(); } }, 'Sign out') : h('span', null, 'Preview mode'))),
      h('main', { class: 'main', id: 'main' }, API.mode === 'demo' ? h('div', { class: 'demo-note' }, 'Preview mode: this is sample data and nothing is really charged, emailed or added to your calendars. Once the back office is connected, this shows your real bookings.') : null, content)));
  }
  function head(title, sub, right) { return h('div', { class: 'pagehead' }, h('div', null, h('h1', null, title), sub ? h('p', null, sub) : null), right || null); }

  /* ---------------- Today ---------------- */
  async function today() {
    var t = Date.now(), up = D.bookings.filter(isUpcoming).sort(function (a, b) { return a.startMs - b.startMs; });
    var week = up.filter(function (b) { return b.startMs < t + 7 * C.DAY; });
    var owing = up.reduce(function (s, b) { return s + ledger(b).balanceCents; }, 0);
    var monthKey = C.ymdOf(t).slice(0, 7);
    var collabs = D.bookings.filter(function (b) { return b.offerId === 'creator-collab' && b.status !== 'cancelled' && C.ymdOf(b.startMs).slice(0, 7) === monthKey; }).length;
    var drafts = D.outbox.filter(function (o) { return o.status === 'draft'; }).length;
    var att = D.bookings.filter(needsYou).sort(function (a, b) { return b.startMs - a.startMs; });
    var hour = C.parts(t).hh, hi = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    var agendaEl = h('div', { class: 'agenda' }, h('p', { class: 'muted' }, 'Loading your calendar…'));
    shell('today', [
      head(hi + ', Madi', C.fmtDate(t) + ' · Sydney', h('a', { class: 'btn pink', href: '#/new' }, '+ New booking')),
      att.length ? h('div', null, h('h2', { class: 'sec' }, 'Needs you'), h('div', { class: 'attention' }, att.map(attentionRow))) : null,
      h('h2', { class: 'sec' }, 'At a glance'),
      h('div', { class: 'cards' },
        h('div', { class: 'card stat pink' }, h('b', null, String(week.length)), h('span', null, 'shoots in the next 7 days')),
        h('div', { class: 'card stat blue' }, h('b', null, $m(owing)), h('span', null, 'balances still owing on upcoming shoots')),
        h('div', { class: 'card stat lilac' }, h('b', null, String(drafts)), h('span', null, 'emails waiting in Gmail Drafts for you to send')),
        h('div', { class: 'card stat mint' }, h('b', null, collabs + ' / 1'), h('span', null, 'Creator Collabs this month'))),
      h('h2', { class: 'sec' }, 'Up next'),
      up.length ? h('div', { class: 'list' }, up.slice(0, 8).map(bookingRow)) : h('div', { class: 'list' }, h('div', { class: 'empty' }, 'No upcoming shoots yet.')),
      h('h2', { class: 'sec' }, 'Next 14 days'), agendaEl]);
    // agenda
    var from = C.sydToUtc(C.ymdOf(t), 0), to = from + 14 * C.DAY;
    var ext = await A.calendarBusy(from, to).catch(function () { return []; });
    var days = [];
    for (var i = 0; i < 14; i++) {
      var ymd = C.addDays(C.ymdOf(t), i), d0 = C.sydToUtc(ymd, 0), d1 = C.sydToUtc(C.addDays(ymd, 1), 0);
      var evs = [];
      up.forEach(function (b) { if (b.startMs < d1 && b.endMs > d0) evs.push(h('button', { class: 'chip pink', style: { border: 0, cursor: 'pointer' }, onclick: function () { openBooking(b.id); } }, C.fmtTime(b.startMs) + ' ' + b.offerName + ' — ' + (b.details.name || ''))); });
      D.blocks.forEach(function (bl) { if (bl.startMs < d1 && bl.endMs > d0) evs.push(h('span', { class: 'chip grey' }, 'Time off: ' + (bl.label || 'blocked'))); });
      ext.forEach(function (e) { if (e.startMs < d1 && e.endMs > d0) evs.push(h('span', { class: 'chip blue' }, C.fmtTime(e.startMs) + '–' + C.fmtTime(e.endMs) + ' ' + (e.label || 'Busy'))); });
      days.push(h('div', { class: 'day' }, h('b', null, C.fmtDateYmd(ymd, true)), h('div', { class: 'evs' }, evs.length ? evs : h('span', { class: 'muted small' }, 'Free 9–5'))));
    }
    U.mount(agendaEl, days, h('p', { class: 'muted small' }, 'Blue = Google/iCloud events, which block those times on the booking site. Grey = your time off.'));
  }
  function attentionRow(b) {
    var last = (b.history || []).slice().reverse().filter(function (x) { return x.reason; })[0];
    var kind = b.refundPendingCents > 0 && !(last && last.keepCents) ? 'refund' : 'urgent';
    var title = b.status === 'pending_redeposit' ? 'Waiting on a new deposit — ' + b.details.name
      : b.refundPendingCents > 0 ? 'Refund to approve: ' + $m(b.refundPendingCents) + ' — ' + b.details.name
      : 'Late change — ' + b.details.name + ' kept ' + $m(b.forfeitedCents);
    return h('div', { class: 'alert ' + kind }, h('span', { class: 'dot', 'aria-hidden': 'true' }),
      h('div', null, h('b', null, title), h('span', { class: 'small muted' }, b.offerName + ' · ' + dt(b.startMs)), last ? h('q', null, last.reason) : null),
      h('button', { class: 'btn sm', onclick: function () { openBooking(b.id); } }, 'Open'));
  }
  function bookingRow(b) {
    return h('button', { class: 'item', onclick: function () { openBooking(b.id); } },
      h('div', { class: 'date' }, h('b', null, C.fmtDate(b.startMs, true)), h('span', null, C.fmtTime(b.startMs) + '–' + C.fmtTime(b.endMs))),
      h('div', { class: 'who' }, h('b', null, b.details.name || '—'), h('span', null, b.offerName + ' · ' + locName(b.location))),
      h('div', { class: 'chips' }, statusChip(b), payChip(b), b.details.under18 ? h('span', { class: 'chip lilac' }, 'Under 18') : null, b.location && b.location.type === 'unsure' ? h('span', { class: 'chip butter' }, 'Pick location') : null));
  }

  /* ---------------- Bookings ---------------- */
  var bTab = 'upcoming', bQuery = '';
  function bookings() {
    var tabs = [['upcoming', 'Upcoming'], ['needs', 'Needs you'], ['past', 'Past'], ['cancelled', 'Cancelled'], ['all', 'All']];
    var listEl = h('div', { class: 'list' });
    function draw() {
      var t = Date.now(), L = D.bookings.filter(function (b) {
        if (bTab === 'upcoming') return isUpcoming(b);
        if (bTab === 'needs') return needsYou(b);
        if (bTab === 'past') return (b.status === 'completed' || (b.status === 'confirmed' && b.endMs < t));
        if (bTab === 'cancelled') return b.status === 'cancelled';
        return b.status !== 'expired';
      }).filter(function (b) { var q = bQuery.toLowerCase(); return !q || [b.details.name, b.details.email, b.offerName, b.details.instagram].join(' ').toLowerCase().indexOf(q) >= 0; });
      L.sort(function (a, b) { return bTab === 'upcoming' ? a.startMs - b.startMs : b.startMs - a.startMs; });
      U.mount(listEl, L.length ? L.map(bookingRow) : h('div', { class: 'empty' }, 'Nothing here.'));
      tabsEl.querySelectorAll('button').forEach(function (x) { x.className = x.dataset.k === bTab ? 'on' : ''; });
    }
    var tabsEl = h('div', { class: 'tabs', role: 'tablist' }, tabs.map(function (t) { return h('button', { 'data-k': t[0], onclick: function () { bTab = t[0]; draw(); } }, t[1]); }));
    shell('bookings', [head('Bookings', null, h('a', { class: 'btn pink', href: '#/new' }, '+ New booking')),
      h('div', { class: 'row-btns', style: { justifyContent: 'space-between', marginBottom: '8px' } }, tabsEl,
        h('input', { type: 'search', id: 'bsearch', placeholder: 'Search name, email, IG…', value: bQuery, style: { maxWidth: '260px' }, oninput: function (e) { bQuery = e.target.value; draw(); } })), listEl]);
    draw();
  }

  /* ---------------- Booking detail ---------------- */
  function openBooking(id) {
    var b = bookingOf(id); if (!b) return U.toast('Booking not found', 'bad');
    var m = U.modal(function (close) { return detail(b, close); }, { wide: true, noFocus: true, onClose: function () { if (location.hash.indexOf('#/booking/') === 0) history.replaceState(null, '', '#/bookings'); openBooking.rerender = null; route(true); } });
    function rerender() { var nb = bookingOf(id); U.mount(m.box, detail(nb, m.close)); }
    openBooking.rerender = rerender;
  }
  async function act(p, msg) {
    try { await p; await refresh(); U.toast(msg); if (openBooking.rerender) openBooking.rerender(); route(true); } catch (e) { err(e); }
  }
  function detail(b, close) {
    var d = b.details || {}, L = ledger(b), off = offerOf(b.offerId);
    var active = ACTIVE.indexOf(b.status) >= 0;
    var parts = [];
    parts.push(h('div', { class: 'detail-head' }, h('div', null, h('div', { class: 'chips', style: { justifyContent: 'flex-start', marginBottom: '6px' } }, statusChip(b), payChip(b)),
      h('h2', null, d.name || 'Client'), h('div', { class: 'muted' }, b.offerName + ' · ' + C.fmtDate(b.startMs) + ', ' + C.fmtTime(b.startMs) + '–' + C.fmtTime(b.endMs))),
      h('button', { class: 'close', 'aria-label': 'Close', onclick: close }, '×')));

    // Action panels
    if (b.refundPendingCents > 0) parts.push(refundPanel(b, true));
    else if (b.status === 'cancelled' && b.paidCents - b.refundedCents > 0) parts.push(refundPanel(b, false));
    if (b.status === 'pending_redeposit') parts.push(h('div', { class: 'action-panel warn' }, h('b', null, 'Waiting on a new ' + $m(b.depositCents) + ' deposit'),
      h('span', { class: 'small' }, 'The client has been sent a payment link. If they pay you another way, record it below.'), paidForm(b, b.depositCents)));
    if (active && b.status !== 'pending_redeposit' && L.balanceCents > 0) parts.push(h('div', { class: 'action-panel' }, h('b', null, 'Balance owing: ' + $m(L.balanceCents)),
      h('span', { class: 'small' }, b.flags && b.flags.balanceInvoiceAt ? '2nd invoice drafted ' + C.fmtDate(b.flags.balanceInvoiceAt, true) + '.' : '2nd invoice will be drafted ' + C.fmtDate(b.startMs - D.settings.balanceDueDaysBefore * C.DAY, true) + '.'),
      paidForm(b, L.balanceCents)));

    parts.push(h('div', { class: 'dgrid' },
      h('div', { class: 'box' }, h('h4', null, 'Shoot'), h('dl', { class: 'kv' },
        h('dt', null, 'When'), h('dd', null, C.fmtDate(b.startMs) + ', ' + C.fmtTime(b.startMs) + ' – ' + C.fmtTime(b.endMs)),
        h('dt', null, 'Length'), h('dd', null, C.fmtDuration(b.durationMin) + ' + ' + b.bufferBeforeMin + ' min before / ' + b.bufferAfterMin + ' min after'),
        h('dt', null, 'Location'), h('dd', null, locName(b.location), b.location && b.location.address ? h('div', { class: 'small muted' }, b.location.address) : null),
        h('dt', null, 'Retouched'), h('dd', null, String(b.retouched != null ? b.retouched : off.retouched || '')),
        h('dt', null, 'Reschedules'), h('dd', null, (b.rescheduleCount || 0) + ' of ' + D.settings.freeReschedules + ' free used'),
        h('dt', null, 'Booked'), h('dd', null, (b.createdBy === 'admin' ? 'By you, ' : 'Online, ') + C.fmtDate(b.createdAt || b.startMs, true))),
        locationEditor(b)),
      h('div', { class: 'box' }, h('h4', null, 'Client'), h('dl', { class: 'kv' },
        h('dt', null, 'Email'), h('dd', null, d.email ? h('a', { href: 'mailto:' + d.email }, d.email) : '—'),
        h('dt', null, 'Phone'), h('dd', null, d.phone ? h('a', { href: 'tel:' + d.phone.replace(/\s/g, '') }, d.phone) : '—'),
        h('dt', null, 'Instagram'), h('dd', null, d.instagram || '—'),
        d.under18 ? [h('dt', null, 'Under 18'), h('dd', null, 'Guardian: ' + (d.guardian ? d.guardian.name + ' · ' + d.guardian.phone + ' · ' + d.guardian.email + (d.guardian.consent ? ' · consent given' : '') : '—'))] : null,
        d.agency ? [h('dt', null, 'Agency'), h('dd', null, d.agency)] : null,
        d.goals ? [h('dt', null, 'Goals'), h('dd', null, d.goals)] : null),
        d.notes ? h('div', { class: 'small', style: { whiteSpace: 'pre-wrap' } }, h('b', null, 'Their notes: '), d.notes) : null),
      h('div', { class: 'box' }, h('h4', null, 'Money'),
        (b.lines || []).map(function (l) { return h('div', { class: 'money-row' }, h('span', null, l.label), h('span', null, $m(l.cents))); }),
        h('div', { class: 'money-row total' }, h('span', null, 'Total'), h('span', null, $m(b.totalCents))),
        h('div', { class: 'money-row' }, h('span', null, 'Paid (towards shoot)'), h('span', null, $m(b.paidCents))),
        b.surchargeCents ? h('div', { class: 'money-row muted' }, h('span', null, 'Card fees collected'), h('span', null, $m(b.surchargeCents))) : null,
        b.forfeitedCents ? h('div', { class: 'money-row' }, h('span', null, 'Kept under policy'), h('span', null, $m(b.forfeitedCents))) : null,
        b.refundedCents ? h('div', { class: 'money-row' }, h('span', null, 'Refunded'), h('span', null, '−' + $m(b.refundedCents))) : null,
        b.refundPendingCents ? h('div', { class: 'money-row' }, h('span', null, 'Refund awaiting approval'), h('span', null, $m(b.refundPendingCents))) : null,
        active ? h('div', { class: 'money-row total' }, h('span', null, 'Balance owing'), h('span', null, $m(L.balanceCents))) : null),
      h('div', { class: 'box' }, h('h4', null, 'History'), h('div', { class: 'timeline' }, (b.history || []).slice().reverse().map(function (x) {
        return h('div', null, h('time', null, C.fmtDate(x.at, true) + ' ' + C.fmtTime(x.at)), h('span', null, x.text, x.reason ? h('q', null, x.reason) : null));
      })))));

    if (active) parts.push(h('div', { class: 'dgrid' }, rescheduleBox(b), cancelBox(b)));
    parts.push(h('div', { class: 'box' }, h('h4', null, 'Your notes (private)'),
      (function () { var ta = h('textarea', { id: 'adm-notes-' + b.id }, b.adminNotes || ''); return [ta, h('div', { class: 'row-btns' }, h('button', { class: 'btn soft sm', onclick: function () { act(A.updateBooking(b.id, { adminNotes: ta.value }), 'Notes saved'); } }, 'Save notes'))]; })()));
    var tplSel = h('select', { id: 'redraft-' + b.id }, Object.keys(D.templates).filter(function (k) { return D.templates[k].to !== 'admin'; }).map(function (k) { return h('option', { value: k }, D.templates[k].name); }));
    parts.push(h('div', { class: 'row-btns' },
      b.status === 'confirmed' && b.endMs < Date.now() + C.DAY ? h('button', { class: 'btn soft', onclick: function () { act(A.updateBooking(b.id, { status: 'completed' }), 'Marked as shot'); } }, 'Mark as shot') : null,
      needsYou(b) && !b.refundPendingCents && b.status !== 'pending_redeposit' ? h('button', { class: 'btn soft', onclick: function () { act(A.updateBooking(b.id, { clearAttention: true }), 'Cleared'); } }, 'Mark as handled') : null,
      h('span', { class: 'muted small', style: { marginLeft: 'auto' } }, 'Draft an email:'), h('span', { style: { width: '220px' } }, tplSel),
      h('button', { class: 'btn soft', onclick: function () { act(A.redraftEmail(b.id, tplSel.value), 'Drafted in Gmail'); } }, 'Draft'),
      h('button', { class: 'btn soft', onclick: function () { var u = (CFG.clientUrl || location.href.split('admin')[0]) + '#/manage/' + b.token; navigator.clipboard && navigator.clipboard.writeText(u).then(function () { U.toast('Client\'s manage link copied'); }, function () { U.toast(u); }); } }, 'Copy client link')));
    return h('div', { style: { display: 'grid', gap: '14px' } }, parts);
  }
  function refundPanel(b, pending) {
    var max = b.paidCents - b.refundedCents;
    var amt = h('input', { type: 'text', id: 'refund-amt-' + b.id, inputmode: 'decimal', value: dollars(pending ? b.refundPendingCents : 0), style: { maxWidth: '140px' } });
    var last = (b.history || []).slice().reverse().filter(function (x) { return x.reason; })[0];
    return h('div', { class: 'action-panel warn' },
      h('b', null, pending ? 'Refund waiting for your approval' : 'Give some money back?'),
      h('span', { class: 'small' }, pending ? 'The policy says ' + $m(b.refundPendingCents) + '. Nothing has been refunded yet — change the amount if you want to give more or less.' : 'You kept ' + $m(b.forfeitedCents) + ' under the policy. You can refund any amount up to ' + $m(max) + '.'),
      last ? h('span', { class: 'small' }, 'Their reason: ', h('q', null, last.reason)) : null,
      h('div', { class: 'row-btns' }, h('span', null, '$'), amt,
        h('button', { class: 'btn pink', onclick: function () { var c = cents(amt.value); if (!confirm('Refund ' + $m(c) + ' to ' + b.details.name + '\'s card?')) return; act(A.refund(b.id, c), c ? 'Refunded ' + $m(c) : 'Saved'); } }, 'Refund this amount'),
        pending ? h('button', { class: 'btn soft', onclick: function () { if (!confirm('Keep the full amount and refund nothing?')) return; act(A.refund(b.id, 0), 'Kept — no refund'); } }, 'Don\'t refund') : null));
  }
  function paidForm(b, suggested) {
    var amt = h('input', { type: 'text', id: 'paid-amt-' + b.id, inputmode: 'decimal', value: dollars(suggested), style: { maxWidth: '140px' } });
    return h('div', { class: 'row-btns' }, h('span', null, '$'), amt, h('button', { class: 'btn blue', onclick: function () { act(A.markPaid(b.id, cents(amt.value), 'direct deposit'), 'Payment recorded'); } }, 'Mark as paid by direct deposit'));
  }
  function timeOptions(sel) {
    var out = []; for (var m = 6 * 60; m <= 21 * 60; m += 15) out.push(h('option', { value: m, selected: m === sel }, C.fmtMinutes(m)));
    return out;
  }
  function rescheduleBox(b) {
    var date = h('input', { type: 'date', id: 'rs-date-' + b.id, value: C.ymdOf(b.startMs) });
    var time = h('select', { id: 'rs-time-' + b.id }, timeOptions(C.minutesOf(b.startMs)));
    var notify = h('input', { type: 'checkbox', id: 'rs-notify-' + b.id, checked: true });
    var warn = h('div', { class: 'small', style: { color: 'var(--rose-deep)' } });
    function check() { var st = C.sydToUtc(date.value, +time.value); var c = C.conflicts(st, st + b.durationMin * C.MIN, D.settings.bufferBeforeMin, D.settings.bufferAfterMin, D.bookings.filter(isUpcoming), D.blocks, b.id); warn.textContent = c ? 'Heads up: this overlaps ' + (c === 'booking' ? 'another booking (including buffers)' : c) + '.' : ''; }
    date.addEventListener('change', check); time.addEventListener('change', check);
    return h('div', { class: 'box' }, h('h4', null, 'Reschedule (no penalty)'), h('div', { class: 'grid2' }, date, time), warn,
      h('label', { class: 'check small' }, notify, 'Draft a reschedule email to the client'),
      h('div', { class: 'row-btns' }, h('button', { class: 'btn', onclick: function () { act(A.reschedule(b.id, C.sydToUtc(date.value, +time.value), notify.checked), 'Rescheduled'); } }, 'Move shoot')));
  }
  function cancelBox(b) {
    var L = ledger(b);
    var amt = h('input', { type: 'text', id: 'cx-amt-' + b.id, inputmode: 'decimal', value: dollars(L.creditCents), style: { maxWidth: '140px' } });
    var notify = h('input', { type: 'checkbox', id: 'cx-notify-' + b.id, checked: true });
    var reason = h('input', { type: 'text', id: 'cx-reason-' + b.id, placeholder: 'Reason (for your records)' });
    return h('div', { class: 'box' }, h('h4', null, 'Cancel for them'), reason,
      h('div', { class: 'row-btns' }, h('span', { class: 'small' }, 'Refund $'), amt, h('span', { class: 'small muted' }, 'of ' + $m(L.creditCents) + ' paid')),
      h('label', { class: 'check small' }, notify, 'Draft a cancellation email to the client'),
      h('div', { class: 'row-btns' }, h('button', { class: 'btn danger', onclick: function () { if (!confirm('Cancel this booking and refund ' + $m(cents(amt.value)) + '?')) return; act(A.cancel(b.id, { refundCents: cents(amt.value), notify: notify.checked, reason: reason.value }), 'Booking cancelled'); } }, 'Cancel booking')));
  }
  function locationEditor(b) {
    var sel = h('select', { id: 'loc-edit-' + b.id }, h('option', { value: '' }, 'Change location…'), D.locations.map(function (l) { return h('option', { value: 'saved:' + l.id }, l.name); }), h('option', { value: 'custom' }, 'Somewhere else…'));
    sel.addEventListener('change', function () {
      var v = sel.value; if (!v) return;
      if (v === 'custom') { var n = prompt('Location name and address'); if (!n) { sel.value = ''; return; } act(A.updateBooking(b.id, { location: { type: 'search', name: n, address: '' } }), 'Location updated'); return; }
      var l = D.locations.filter(function (x) { return 'saved:' + x.id === v; })[0];
      act(A.updateBooking(b.id, { location: Object.assign({}, b.location && b.location.second ? { second: b.location.second } : {}, { type: 'saved', id: l.id, name: l.name, address: l.address }) }), 'Location updated');
    });
    return sel;
  }

  /* ---------------- New booking ---------------- */
  function newBooking() {
    var f = { offerId: 'creator-collab' };
    var offerSel = h('select', { id: 'nb-offer' }, D.offers.map(function (o) { return h('option', { value: o.id, selected: o.id === f.offerId }, o.name + (o.isPrivate ? ' (private)' : '') + ' — ' + $m(o.priceCents)); }));
    var date = h('input', { type: 'date', id: 'nb-date', value: C.addDays(C.ymdOf(Date.now()), 7) });
    var time = h('select', { id: 'nb-time' }, timeOptions(600));
    var dur = h('input', { type: 'number', id: 'nb-dur', min: 15, step: 15 });
    var price = h('input', { type: 'text', id: 'nb-price', inputmode: 'decimal' });
    var paid = h('input', { type: 'text', id: 'nb-paid', inputmode: 'decimal', value: '0' });
    var ret = h('input', { type: 'number', id: 'nb-ret', min: 0 });
    var name = h('input', { type: 'text', id: 'nb-name' }), email = h('input', { type: 'email', id: 'nb-email' }), phone = h('input', { type: 'tel', id: 'nb-phone' }), ig = h('input', { type: 'text', id: 'nb-ig', placeholder: '@handle' });
    var notes = h('textarea', { id: 'nb-notes', placeholder: 'What they messaged you about, collab terms, etc.' });
    var loc = h('select', { id: 'nb-loc' }, h('option', { value: 'unsure' }, 'Decide later'), D.locations.map(function (l) { return h('option', { value: 'saved:' + l.id }, l.name); }), h('option', { value: 'custom' }, 'Somewhere else (type below)'));
    var locCustom = h('input', { type: 'text', id: 'nb-loc-custom', placeholder: 'e.g. Bondi Beach north end' });
    var notify = h('input', { type: 'checkbox', id: 'nb-notify', checked: true });
    var warn = h('div', { class: 'small' });
    function fill() { var o = offerOf(offerSel.value); dur.value = o.durationMin; price.value = dollars(o.priceCents); ret.value = o.retouched; check(); }
    function check() {
      var st = C.sydToUtc(date.value, +time.value), c = C.conflicts(st, st + (+dur.value || 60) * C.MIN, D.settings.bufferBeforeMin, D.settings.bufferAfterMin, D.bookings.filter(isUpcoming), D.blocks);
      var monthKey = date.value.slice(0, 7), collabs = D.bookings.filter(function (b) { return b.offerId === 'creator-collab' && b.status !== 'cancelled' && C.ymdOf(b.startMs).slice(0, 7) === monthKey; }).length;
      var msgs = [];
      if (c) msgs.push('Overlaps ' + (c === 'booking' ? 'another booking (including buffers)' : c) + ' — you can still book it.');
      if (offerSel.value === 'creator-collab' && collabs) msgs.push('You already have ' + collabs + ' Creator Collab' + (collabs > 1 ? 's' : '') + ' that month.');
      warn.textContent = msgs.join(' '); warn.style.color = msgs.length ? 'var(--rose-deep)' : '';
    }
    [offerSel].forEach(function (x) { x.addEventListener('change', fill); });
    [date, time, dur].forEach(function (x) { x.addEventListener('change', check); });
    var go = h('button', { class: 'btn pink', onclick: async function () {
      var L = loc.value === 'unsure' ? { type: 'unsure' } : loc.value === 'custom' ? { type: 'search', name: locCustom.value || 'TBC', address: '' } : (function () { var l = D.locations.filter(function (x) { return 'saved:' + x.id === loc.value; })[0]; return { type: 'saved', id: l.id, name: l.name, address: l.address }; })();
      U.busy(go, true, 'Booking…');
      try {
        var r = await A.createBooking({ offerId: offerSel.value, startMs: C.sydToUtc(date.value, +time.value), durationMin: +dur.value, totalCents: cents(price.value), paidCents: cents(paid.value), retouched: +ret.value,
          details: { name: name.value, email: email.value, phone: phone.value, instagram: ig.value, notes: notes.value }, location: L, notifyClient: notify.checked });
        await refresh(); U.toast('Booked' + (notify.checked && email.value ? ' — confirmation drafted in Gmail' : '')); location.hash = '#/booking/' + r.booking.id;
      } catch (e) { U.busy(go, false); err(e); }
    } }, 'Create booking');
    shell('new', [head('New booking', 'For clients who messaged or phoned you, and Creator Collabs. You can book any day and time — the 48-hour and 3-month limits only apply to the public site.'),
      h('div', { class: 'split' },
        h('div', { class: 'card form' },
          U.field('Offer', offerSel),
          h('div', { class: 'grid3' }, U.field('Date', date), U.field('Start time', time), U.field('Length (minutes)', dur)), warn,
          h('div', { class: 'grid3' }, U.field('Price ($)', price), U.field('Already paid ($)', paid, 'e.g. paid by bank transfer'), U.field('Retouched images', ret)),
          U.field('Location', loc), U.field('If somewhere else', locCustom)),
        h('div', { class: 'card form' },
          U.field('Client name', name), U.field('Email', email), h('div', { class: 'grid2' }, U.field('Phone', phone), U.field('Instagram', ig)), U.field('Notes', notes),
          h('label', { class: 'check' }, notify, 'Draft a confirmation email to them in Gmail'), go))]);
    fill();
  }

  /* ---------------- Availability ---------------- */
  function availability() {
    var s = JSON.parse(JSON.stringify(D.settings));
    function timeSel(v, on) { var sel = h('select', {}, (function () { var o = []; for (var m = 5 * 60; m <= 22 * 60; m += 30) o.push(h('option', { value: m, selected: m === v }, C.fmtMinutes(m))); return o; })()); sel.addEventListener('change', function () { on(+sel.value); }); return sel; }
    var hours = h('div', { class: 'hours' }, [1, 2, 3, 4, 5, 6, 0].map(function (dw) {
      var d = s.hours[dw];
      var on = h('input', { type: 'checkbox', id: 'h-on-' + dw, checked: d.on, 'aria-label': C.DAY_NAMES[dw] + ' bookable', onchange: function (e) { d.on = e.target.checked; } });
      return h('div', { class: 'd' }, h('b', null, C.DAY_NAMES[dw]), h('label', { class: 'check' }, on), timeSel(d.start, function (v) { d.start = v; }), timeSel(d.end, function (v) { d.end = v; }));
    }));
    function num(key, label, hint, min) { return U.field(label, h('input', { type: 'number', id: 'set-' + key, min: min || 0, value: s[key], oninput: function (e) { s[key] = +e.target.value; } }), hint); }
    var save = h('button', { class: 'btn pink', onclick: function () { act(A.saveSettings({ hours: s.hours, bufferBeforeMin: s.bufferBeforeMin, bufferAfterMin: s.bufferAfterMin, minNoticeHours: s.minNoticeHours, maxDaysAhead: s.maxDaysAhead, slotStepMin: s.slotStepMin }), 'Availability saved'); } }, 'Save availability');
    var bl = { label: '', from: C.addDays(C.ymdOf(Date.now()), 1), to: C.addDays(C.ymdOf(Date.now()), 1), fromT: 0, toT: 1440 };
    var blocks = D.blocks.slice().sort(function (a, b) { return a.startMs - b.startMs; });
    shell('availability', [head('Availability', 'When clients can book on the website. Your Google and iCloud events block times automatically.'),
      h('div', { class: 'split' },
        h('div', { class: 'card form' }, h('h2', { class: 'sec', style: { marginTop: 0 } }, 'Working hours'),
          h('p', { class: 'muted small', style: { margin: 0 } }, 'Shoots and their buffers must fit inside these hours. Being bookable every day doesn\'t mean you\'re working every day — block time off below.'), hours,
          h('h2', { class: 'sec' }, 'Buffers'),
          h('div', { class: 'grid2' }, num('bufferBeforeMin', 'Before each shoot (minutes)', 'Travel and setup'), num('bufferAfterMin', 'After each shoot (minutes)', 'Pack down and travel')),
          h('h2', { class: 'sec' }, 'Booking window'),
          h('div', { class: 'grid3' }, num('minNoticeHours', 'Minimum notice (hours)'), num('maxDaysAhead', 'Book up to (days ahead)'), num('slotStepMin', 'Start times every (minutes)', null, 15)),
          h('div', { class: 'row-btns' }, save)),
        h('div', { class: 'card form' }, h('h2', { class: 'sec', style: { marginTop: 0 } }, 'Time off'),
          blocks.length ? h('div', { class: 'list' }, blocks.map(function (x) {
            return h('div', { class: 'item', style: { cursor: 'default', gridTemplateColumns: '1fr auto' } }, h('div', { class: 'who' }, h('b', null, x.label || 'Time off'), h('span', null, dt(x.startMs) + ' → ' + dt(x.endMs))),
              h('button', { class: 'btn soft sm', onclick: function () { act(A.deleteBlock(x.id), 'Removed'); } }, 'Remove'));
          })) : h('p', { class: 'muted' }, 'No time off booked.'),
          h('h2', { class: 'sec' }, 'Add time off'),
          U.field('What for', h('input', { type: 'text', id: 'bl-label', placeholder: 'Holiday, other job, personal…', oninput: function (e) { bl.label = e.target.value; } })),
          h('div', { class: 'grid2' }, U.field('From', h('input', { type: 'date', id: 'bl-from', value: bl.from, onchange: function (e) { bl.from = e.target.value; } })), U.field('Time', timeSelAll(bl.fromT, function (v) { bl.fromT = v; }, 'bl-ft'))),
          h('div', { class: 'grid2' }, U.field('To', h('input', { type: 'date', id: 'bl-to', value: bl.to, onchange: function (e) { bl.to = e.target.value; } })), U.field('Time', timeSelAll(bl.toT, function (v) { bl.toT = v; }, 'bl-tt'))),
          h('div', { class: 'row-btns' }, h('button', { class: 'btn', onclick: function () {
            var st = C.sydToUtc(bl.from, bl.fromT), en = bl.toT === 1440 ? C.sydToUtc(C.addDays(bl.to, 1), 0) : C.sydToUtc(bl.to, bl.toT);
            if (en <= st) return U.toast('The end needs to be after the start.', 'bad');
            act(A.saveBlock({ label: bl.label, startMs: st, endMs: en }), 'Time off added');
          } }, 'Add time off'))))]);
  }
  function timeSelAll(v, on, id) {
    var sel = h('select', { id: id }, (function () { var o = [h('option', { value: 0, selected: v === 0 }, 'Start of day')]; for (var m = 360; m <= 1320; m += 30) o.push(h('option', { value: m, selected: m === v }, C.fmtMinutes(m))); o.push(h('option', { value: 1440, selected: v === 1440 }, 'End of day')); return o; })());
    sel.addEventListener('change', function () { on(+sel.value); }); return sel;
  }

  /* ---------------- Offers ---------------- */
  function offers() {
    shell('offers', [head('Offers', 'What clients see on the booking site. Private offers (like Creator Collab) only appear in New booking.', h('button', { class: 'btn pink', onclick: function () { editOffer({ id: 'offer-' + C.token(5), name: 'New offer', tagline: '', priceCents: 30000, durationMin: 60, retouched: 4, includes: [], addons: [], image: '', isPrivate: false, active: false, sort: D.offers.length + 1 }, true); } }, '+ New offer')),
      h('div', { class: 'twrap' }, h('table', { class: 't' }, h('thead', null, h('tr', null, ['Offer', 'Price', 'Deposit', 'Length', 'Retouched', 'Add-ons', 'Shown'].map(function (x) { return h('th', null, x); }))),
        h('tbody', null, D.offers.map(function (o) {
          return h('tr', { class: 'click', onclick: function () { editOffer(JSON.parse(JSON.stringify(o))); } }, h('td', null, h('b', null, o.name), h('div', { class: 'muted small' }, o.tagline || '')),
            h('td', { class: 'num' }, $m(o.priceCents)), h('td', { class: 'num' }, $m(Math.round(o.priceCents * D.settings.depositPercent / 100))), h('td', null, C.fmtDuration(o.durationMin)),
            h('td', { class: 'num' }, String(o.retouched)), h('td', { class: 'small' }, (o.addons || []).map(function (a) { return a.label + ' ' + $m(a.unitCents); }).join(', ') || '—'),
            h('td', null, !o.active ? h('span', { class: 'chip grey' }, 'Hidden') : o.isPrivate ? h('span', { class: 'chip lilac' }, 'Private') : h('span', { class: 'chip mint' }, 'Public')));
        }))))]);
  }
  function editOffer(o, isNew) {
    U.modal(function (close) {
      function inp(k, label, type, conv, back) { return U.field(label, h('input', { type: type || 'text', id: 'of-' + k, value: back ? back(o[k]) : o[k], oninput: function (e) { o[k] = conv ? conv(e.target.value) : e.target.value; } })); }
      var addonsEl = h('div', { style: { display: 'grid', gap: '8px' } });
      function drawAddons() {
        U.mount(addonsEl, (o.addons || []).map(function (a, i) {
          return h('div', { class: 'grid3', style: { gridTemplateColumns: '2fr 1fr 1fr 1fr auto', alignItems: 'end' } },
            U.field('Add-on', h('input', { type: 'text', value: a.label, oninput: function (e) { a.label = e.target.value; } })),
            U.field('Price ($)', h('input', { type: 'text', value: dollars(a.unitCents), oninput: function (e) { a.unitCents = cents(e.target.value); } })),
            U.field('Type', (function () { var s = h('select', {}, h('option', { value: 'toggle', selected: a.type === 'toggle' }, 'On/off'), h('option', { value: 'qty', selected: a.type === 'qty' }, 'Quantity')); s.addEventListener('change', function () { a.type = s.value; }); return s; })()),
            U.field('Adds (min)', h('input', { type: 'number', value: a.extraMin || 0, oninput: function (e) { a.extraMin = +e.target.value; } })),
            h('button', { class: 'btn soft sm', onclick: function () { o.addons.splice(i, 1); drawAddons(); } }, 'Remove'));
        }), h('div', null, h('button', { class: 'btn soft sm', onclick: function () { o.addons = o.addons || []; o.addons.push({ id: 'ad-' + C.token(5), label: 'New add-on', type: 'toggle', unitCents: 5000, extraMin: 0, max: 10 }); drawAddons(); } }, '+ Add-on')));
      }
      drawAddons();
      return h('div', { class: 'form' }, h('div', { class: 'detail-head' }, h('h2', null, isNew ? 'New offer' : o.name), h('button', { class: 'close', 'aria-label': 'Close', onclick: close }, '×')),
        h('div', { class: 'grid2' }, inp('name', 'Name'), inp('tagline', 'Tagline')),
        h('div', { class: 'grid3' }, inp('priceCents', 'Price ($)', 'text', cents, dollars), inp('durationMin', 'Length (minutes)', 'number', Number), inp('retouched', 'Retouched images', 'number', Number)),
        U.field('What\'s included (one per line)', h('textarea', { id: 'of-includes', oninput: function (e) { o.includes = e.target.value.split('\n').filter(Boolean); } }, (o.includes || []).join('\n'))),
        inp('image', 'Photo URL', 'url'), h('span', { class: 'field-hint' }, 'Right-click a photo on your Pixieset site → Copy image address, and paste it here.'),
        h('div', { class: 'row-btns' }, h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: o.active, onchange: function (e) { o.active = e.target.checked; } }), 'Show this offer'),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: o.isPrivate, onchange: function (e) { o.isPrivate = e.target.checked; } }), 'Private (only you can book it)'),
          h('span', { style: { width: '100px' } }, inp('sort', 'Order', 'number', Number))),
        h('h2', { class: 'sec' }, 'Add-ons'), addonsEl,
        h('div', { class: 'row-btns' }, h('button', { class: 'btn pink', onclick: function () { close(); act(A.saveOffer(o), 'Offer saved'); } }, 'Save offer'),
          !isNew ? h('button', { class: 'btn soft', style: { marginLeft: 'auto' }, onclick: function () { if (confirm('Delete ' + o.name + '? Existing bookings keep their details.')) { close(); act(A.deleteOffer(o.id), 'Offer deleted'); } } }, 'Delete') : null));
    }, { wide: true, noFocus: true });
  }

  /* ---------------- Locations ---------------- */
  function locations() {
    shell('locations', [head('Locations', 'Your saved spots show as quick picks on the booking site, and their THE SHOOT DETAILS block fills straight into emails.', h('button', { class: 'btn pink', onclick: function () { editLocation({ name: '', address: '', details: 'THE SHOOT DETAILS\n📍 Meeting Point: \nI\'ll meet you at the , and we\'ll walk to our shooting spots from there.\nGetting there:\n\n* By train/metro (easiest): \n* By bus: \n* Driving/parking:  Give yourself 10 minutes to park and walk over.' }, true); } }, '+ New location')),
      h('div', { class: 'cards' }, D.locations.map(function (l) {
        return h('button', { class: 'card', style: { textAlign: 'left', cursor: 'pointer', display: 'grid', gap: '6px' }, onclick: function () { editLocation(JSON.parse(JSON.stringify(l))); } },
          h('b', { style: { font: '500 22px/1.1 var(--display)' } }, l.name), h('span', { class: 'muted small' }, l.address), h('span', { class: 'small', style: { color: 'var(--blue-deep)' } }, 'Edit directions →'));
      }))]);
  }
  function editLocation(l, isNew) {
    U.modal(function (close) {
      return h('div', { class: 'form' }, h('div', { class: 'detail-head' }, h('h2', null, isNew ? 'New location' : l.name), h('button', { class: 'close', 'aria-label': 'Close', onclick: close }, '×')),
        h('div', { class: 'grid2' }, U.field('Name', h('input', { type: 'text', id: 'lc-name', value: l.name, oninput: function (e) { l.name = e.target.value; } })), U.field('Address', h('input', { type: 'text', id: 'lc-addr', value: l.address, oninput: function (e) { l.address = e.target.value; } }))),
        U.field('THE SHOOT DETAILS block', h('textarea', { class: 'mono', id: 'lc-details', oninput: function (e) { l.details = e.target.value; } }, l.details || ''), 'Double-check car park names and entries before your first booking here.'),
        h('div', { class: 'row-btns' }, h('button', { class: 'btn pink', onclick: function () { close(); act(A.saveLocation(l), 'Location saved'); } }, 'Save location'),
          !isNew ? h('button', { class: 'btn soft', style: { marginLeft: 'auto' }, onclick: function () { if (confirm('Delete ' + l.name + '?')) { close(); act(A.deleteLocation(l.id), 'Deleted'); } } }, 'Delete') : null));
    }, { wide: true, noFocus: true });
  }

  /* ---------------- Emails ---------------- */
  var tplKey = 'confirmation', emailTab = 'templates';
  var FIELDS = ['first_name', 'full_name', 'offer_name', 'shoot_date', 'shoot_date_short', 'shoot_time', 'end_time', 'duration', 'location_name', 'shoot_details_block', 'addons_list', 'retouched_count',
    'total', 'deposit', 'amount_paid', 'balance_due', 'balance_due_date', 'manage_link', 'pay_link', 'bank_details', 'reschedules_left_line', 'policy_summary', 'refund_line', 'kept_amount', 'reason', 'instagram'];
  function emails() {
    var body = h('div');
    var tabs = h('div', { class: 'tabs' }, [['templates', 'Templates'], ['outbox', 'Sent & drafted']].map(function (t) { return h('button', { class: emailTab === t[0] ? 'on' : '', onclick: function () { emailTab = t[0]; emails(); } }, t[1]); }));
    shell('emails', [head('Emails', D.settings.emailsNeedApproval !== false ? 'Every client email is drafted into your Gmail Drafts for you to check and send. Urgent alerts to you are sent straight away as priority emails.' : ''), tabs, body]);
    if (emailTab === 'outbox') {
      U.mount(body, D.outbox.length ? h('div', { class: 'twrap' }, h('table', { class: 't' }, h('thead', null, h('tr', null, ['When', 'To', 'Subject', 'Status'].map(function (x) { return h('th', null, x); }))),
        h('tbody', null, D.outbox.map(function (o) {
          return h('tr', { class: 'click', onclick: function () { U.modal(function (close) { return h('div', { class: 'form' }, h('div', { class: 'detail-head' }, h('h2', { style: { fontSize: '22px' } }, o.subject), h('button', { class: 'close', onclick: close }, '×')), h('div', { class: 'preview' }, o.body)); }, { wide: true }); } },
            h('td', { class: 'num small' }, dt(o.createdAt)), h('td', { class: 'small' }, o.toAdmin ? 'You' : o.to), h('td', null, o.subject),
            h('td', null, o.status === 'draft' ? h('span', { class: 'chip lilac' }, 'In Gmail Drafts') : o.status === 'failed' ? h('span', { class: 'chip rose' }, 'Failed') : o.priority ? h('span', { class: 'chip rose' }, 'Sent · priority') : h('span', { class: 'chip mint' }, 'Sent')));
        })))) : h('p', { class: 'muted' }, 'Nothing yet.'));
      return;
    }
    var t = JSON.parse(JSON.stringify(D.templates[tplKey] || C.DEFAULT_TEMPLATES[tplKey]));
    var subj = h('input', { type: 'text', id: 'tpl-subject', value: t.subject });
    var ta = h('textarea', { class: 'mono', id: 'tpl-body' }, t.body);
    var auto = h('input', { type: 'checkbox', id: 'tpl-auto', checked: !!t.autoSend, disabled: t.to === 'admin' });
    var prev = h('div', { class: 'preview' });
    var upd = U.debounce(async function () { var r = await A.previewEmail(tplKey, null, { subject: subj.value, body: ta.value }); U.mount(prev, h('div', { class: 'subj' }, r.subject), r.body); }, 250);
    subj.addEventListener('input', upd); ta.addEventListener('input', upd);
    var last = ta;
    [subj, ta].forEach(function (x) { x.addEventListener('focus', function () { last = x; }); });
    function insert(fk) { var el = last, s = el.selectionStart || el.value.length, e = el.selectionEnd || s; el.value = el.value.slice(0, s) + '{' + fk + '}' + el.value.slice(e); el.focus(); el.selectionStart = el.selectionEnd = s + fk.length + 2; upd(); }
    U.mount(body, h('div', { class: 'split', style: { gridTemplateColumns: '220px 1fr 1fr' } },
      h('div', { class: 'tpl-list' }, Object.keys(D.templates).map(function (k) { var x = D.templates[k]; return h('button', { class: k === tplKey ? 'on' : '', onclick: function () { tplKey = k; emails(); } }, h('span', null, x.name), x.to === 'admin' ? h('span', { class: 'chip rose' }, 'to you') : (x.autoSend ? h('span', { class: 'chip mint' }, 'auto') : null)); })),
      h('div', { class: 'card form' }, U.field('Subject', subj), U.field('Email', ta),
        h('div', null, h('div', { class: 'field-label', style: { marginBottom: '6px' } }, 'Booking details you can drop in (click to insert)'), h('div', { class: 'fields' }, FIELDS.map(function (fk) { return h('button', { type: 'button', onclick: function () { insert(fk); } }, '{' + fk + '}'); }))),
        t.to !== 'admin' ? h('label', { class: 'check small' }, auto, 'Send automatically instead of drafting (turn on once you\'re happy with this one)') : h('p', { class: 'small muted', style: { margin: 0 } }, 'Sent to you straight away' + (tplKey.indexOf('alert_') === 0 && tplKey !== 'alert_new' ? ', marked high priority.' : '.')),
        h('div', { class: 'row-btns' }, h('button', { class: 'btn pink', onclick: function () { t.subject = subj.value; t.body = ta.value; t.autoSend = auto.checked; act(A.saveTemplate(tplKey, t), 'Template saved'); } }, 'Save template'),
          h('button', { class: 'btn soft', onclick: function () { if (!confirm('Reset this template to the original wording?')) return; act(A.saveTemplate(tplKey, C.DEFAULT_TEMPLATES[tplKey]), 'Template reset'); } }, 'Reset'))),
      h('div', null, h('div', { class: 'field-label', style: { marginBottom: '6px' } }, 'Preview with an example booking'), prev)));
    upd();
  }

  /* ---------------- Clients ---------------- */
  var cQuery = '';
  function clients() {
    var tbody = h('tbody');
    function draw() {
      var L = D.clients.filter(function (c) { var q = cQuery.toLowerCase(); return !q || [c.name, c.email, c.instagram, c.package, c.stage].join(' ').toLowerCase().indexOf(q) >= 0; })
        .sort(function (a, b) { return (b.lastBookingMs || 0) - (a.lastBookingMs || 0); });
      U.mount(tbody, L.map(function (c) {
        var tk = TICKS.filter(function (t) { return c.ticks && c.ticks[t[0]]; }).length;
        return h('tr', { class: 'click', onclick: function () { editClient(JSON.parse(JSON.stringify(c))); } }, h('td', null, h('b', null, c.name || '—'), h('div', { class: 'muted small' }, c.email)),
          h('td', null, h('span', { class: 'chip ' + ({ Booked: 'mint', 'Past Clients': 'blue', Cancelled: 'rose', 'New Leads': 'pink', Communicated: 'lilac', 'Dead Leads': 'grey' }[c.stage] || 'grey') }, c.stage || '—')),
          h('td', null, c.package || '—'), h('td', { class: 'small' }, c.phone || '—'), h('td', { class: 'small' }, c.instagram || '—'),
          h('td', { class: 'num small' }, c.lastBookingMs ? C.fmtDate(c.lastBookingMs, true) : '—'), h('td', { class: 'num small' }, tk + '/10'));
      }));
    }
    shell('clients', [head('Clients', 'Every booking adds or updates the client here automatically. This is the shared client list that Contact Sheet moves onto, so both sites always match.'),
      h('input', { type: 'search', id: 'csearch', placeholder: 'Search clients…', value: cQuery, style: { maxWidth: '300px', marginBottom: '12px' }, oninput: function (e) { cQuery = e.target.value; draw(); } }),
      h('div', { class: 'twrap' }, h('table', { class: 't' }, h('thead', null, h('tr', null, ['Client', 'Stage', 'Package', 'Phone', 'Instagram', 'Last shoot', 'Ticks'].map(function (x) { return h('th', null, x); }))), tbody))]);
    draw();
  }
  function editClient(c) {
    c.ticks = c.ticks || {};
    U.modal(function (close) {
      var stage = h('select', { id: 'cl-stage' }, STAGES.map(function (s) { return h('option', { value: s, selected: s === c.stage }, s); }));
      stage.addEventListener('change', function () { c.stage = stage.value; });
      var bks = D.bookings.filter(function (b) { return (c.bookingIds || []).indexOf(b.id) >= 0 || (b.details.email && b.details.email === c.email); });
      return h('div', { class: 'form' }, h('div', { class: 'detail-head' }, h('div', null, h('h2', null, c.name || 'Client'), h('div', { class: 'muted' }, [c.email, c.phone, c.instagram].filter(Boolean).join(' · '))), h('button', { class: 'close', 'aria-label': 'Close', onclick: close }, '×')),
        h('div', { class: 'grid2' }, U.field('Stage', stage), U.field('Package', h('input', { type: 'text', value: c.package || '', oninput: function (e) { c.package = e.target.value; } }))),
        h('div', { class: 'grid2' }, TICKS.map(function (t) { return h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!c.ticks[t[0]], onchange: function (e) { c.ticks[t[0]] = e.target.checked; } }), t[1]); })),
        U.field('What I recommend', h('textarea', { oninput: function (e) { c.recommend = e.target.value; } }, c.recommend || '')),
        U.field('Their message', h('textarea', { oninput: function (e) { c.theirMessage = e.target.value; } }, c.theirMessage || '')),
        c.guardian ? h('div', { class: 'small' }, 'Guardian: ' + c.guardian.name + ' · ' + c.guardian.phone + ' · ' + c.guardian.email) : null,
        bks.length ? h('div', { class: 'list' }, bks.map(function (b) { return h('button', { class: 'item', onclick: function () { close(); openBooking(b.id); } }, h('div', { class: 'date' }, h('b', null, C.fmtDate(b.startMs, true))), h('div', { class: 'who' }, h('b', null, b.offerName)), h('div', { class: 'chips' }, statusChip(b))); })) : null,
        h('div', { class: 'row-btns' }, h('button', { class: 'btn pink', onclick: function () { close(); act(A.saveClient(c), 'Client saved'); } }, 'Save')));
    }, { wide: true, noFocus: true });
  }

  /* ---------------- Settings ---------------- */
  function settings() {
    var s = JSON.parse(JSON.stringify(D.settings));
    function num(k, label, hint) { return U.field(label, h('input', { type: 'number', id: 'st-' + k, value: s[k], oninput: function (e) { s[k] = +e.target.value; } }), hint); }
    function txt(k, label, hint) { return U.field(label, h('input', { type: 'text', id: 'st-' + k, value: s[k] || '', oninput: function (e) { s[k] = e.target.value; } }), hint); }
    var conn = h('div', { class: 'form' }, h('p', { class: 'muted' }, 'Checking connections…'));
    shell('settings', [head('Settings'),
      h('div', { class: 'split' },
        h('div', { class: 'card form' }, h('h2', { class: 'sec', style: { marginTop: 0 } }, 'Booking policy'),
          h('div', { class: 'grid3' }, num('depositPercent', 'Deposit (%)'), num('cutoffHours', 'Late-change cutoff (hours)'), num('freeReschedules', 'Free reschedules')),
          h('div', { class: 'grid3' }, num('balanceDueDaysBefore', '2nd invoice (days before)'), num('reminderHoursBefore', 'Reminder (hours before)'), num('holdMinutes', 'Hold time at checkout (min)')),
          h('h2', { class: 'sec' }, 'Card fee'),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s.surcharge.enabled, onchange: function (e) { s.surcharge.enabled = e.target.checked; } }), 'Add a card processing fee on Stripe payments (direct deposit has none)'),
          h('div', { class: 'grid2' }, U.field('Percent', h('input', { type: 'number', step: '0.1', value: s.surcharge.percent, oninput: function (e) { s.surcharge.percent = +e.target.value; } })),
            U.field('Fixed (cents)', h('input', { type: 'number', value: s.surcharge.fixedCents, oninput: function (e) { s.surcharge.fixedCents = +e.target.value; } }))),
          h('h2', { class: 'sec' }, 'Direct deposit details'),
          U.field('Shown on the 2nd invoice and the manage page', h('textarea', { id: 'st-bank', oninput: function (e) { s.bankDetails = e.target.value; } }, s.bankDetails)),
          h('h2', { class: 'sec' }, 'Business'),
          h('div', { class: 'grid2' }, txt('businessName', 'Business name'), txt('instagram', 'Instagram')), h('div', { class: 'grid2' }, txt('adminEmail', 'Where your alerts go'), txt('phone', 'Phone')),
          h('div', { class: 'row-btns' }, h('button', { class: 'btn pink', onclick: function () { act(A.saveSettings(s), 'Settings saved'); } }, 'Save settings'))),
        h('div', { class: 'card' }, h('h2', { class: 'sec', style: { marginTop: 0 } }, 'Connections'), conn))]);
    A.connections().then(function (c) {
      var rows = [];
      function row(name, st, action) { rows.push(h('div', { class: 'box' }, h('div', { class: 'row-btns', style: { justifyContent: 'space-between' } }, h('b', null, name), st.connected ? h('span', { class: 'chip mint' }, 'Connected') : h('span', { class: 'chip ' + (st.demo ? 'grey' : 'butter') }, st.demo ? 'Preview mode' : 'Not connected')), st.detail ? h('span', { class: 'small muted' }, st.detail) : null, action || null)); }
      row('Stripe (payments)', c.stripe, null);
      row('Google (Calendar + Gmail drafts)', c.google, API.mode === 'live' ? h('button', { class: 'btn soft sm', onclick: async function () { try { var r = await A.googleAuthUrl(); location.href = r.url; } catch (e) { err(e); } } }, c.google.connected ? 'Reconnect Google' : 'Connect Google') : null);
      var au = h('input', { type: 'email', placeholder: 'Apple ID email' }), ap = h('input', { type: 'text', placeholder: 'App-specific password (xxxx-xxxx-xxxx-xxxx)' }), cn = h('input', { type: 'text', value: s.icloudCalendarName || 'Shoots', placeholder: 'Calendar name' });
      row('iCloud Calendar', c.icloud, API.mode === 'live' ? h('div', { class: 'form' }, au, ap, cn, h('button', { class: 'btn soft sm', onclick: async function () { try { var r = await A.icloudConnect({ user: au.value, password: ap.value, calendarName: cn.value }); U.toast('iCloud connected — ' + r.calendar); settings(); } catch (e) { err(e); } } }, 'Connect iCloud')) : null);
      if (API.mode === 'demo') rows.push(h('div', { class: 'row-btns' }, h('button', { class: 'btn soft', onclick: function () { act(A.runHourly(), 'Hourly jobs run'); } }, 'Run hourly jobs now'), h('button', { class: 'btn soft', onclick: async function () { if (!confirm('Reset all preview data?')) return; await A.resetDemo(); await refresh(); route(true); U.toast('Preview data reset'); } }, 'Reset preview data')));
      U.mount(conn, rows);
    }).catch(err);
  }

  /* ---------------- Login + router ---------------- */
  function login() {
    var email = h('input', { type: 'email', id: 'login-email', value: CFG.adminEmail || '', autocomplete: 'email' });
    var go = h('button', { class: 'btn pink', onclick: async function () { U.busy(go, true, 'Sending…'); try { await A.signIn(email.value); U.mount(card, h('img', { src: LOGO, alt: '' }), h('h2', { style: { font: '500 28px var(--display)', margin: 0 } }, 'Check your email'), h('p', null, 'We sent a sign-in link to ' + email.value + '. Open it on this device.')); } catch (e) { U.busy(go, false); err(e); } } }, 'Email me a sign-in link');
    var card = h('div', { class: 'login' }, h('img', { src: LOGO, alt: 'Madi Crasti Photography' }), h('h2', { style: { font: '500 28px var(--display)', margin: 0 } }, 'Admin sign in'), U.field('Your email', email), go);
    U.mount(app, card);
  }
  var booted = false;
  async function route(soft) {
    if (!booted) {
      var s = await A.session().catch(function () { return null; });
      if (!s) return login();
      try { await refresh(); } catch (e) { U.mount(app, h('div', { class: 'login' }, h('h2', null, 'Can\'t open admin'), h('p', null, e.message), h('button', { class: 'btn', onclick: function () { A.signOut().then(function () { location.reload(); }); } }, 'Sign out'))); return; }
      booted = true;
    }
    var hq = (location.hash || '#/today').slice(2).split('?'), p = hq[0].split('/');
    if (hq[1] && /google=/.test(hq[1])) { var gs = decodeURIComponent(hq[1].split('google=')[1]); U.toast(gs === 'connected' ? 'Google connected — calendar and Gmail drafts are on' : 'Google didn\'t connect (' + gs + '). Try again.', gs === 'connected' ? '' : 'bad'); history.replaceState(null, '', '#/' + hq[0]); }
    var keepModal = soft === true;
    if (!keepModal) document.querySelectorAll('.modal').forEach(function (m) { m.remove(); });
    var map = { today: today, bookings: bookings, new: newBooking, availability: availability, offers: offers, locations: locations, emails: emails, clients: clients, settings: settings };
    if (p[0] === 'booking' && p[1]) { if (!keepModal) { bookings(); openBooking(p[1]); } else bookings(); return; }
    if (keepModal && document.querySelector('.modal')) return; // don't redraw behind an open editor
    (map[p[0]] || today)();
  }
  window.addEventListener('hashchange', function () { route(false); });
  window.MCadmin = { route: route };
  if (!window.MC_NO_AUTOSTART) route();
})();
