/* Madi Crasti Photography — client booking site. */
(function () {
  'use strict';
  var C = window.MCcore, API = window.MCapi, U = window.MCui, h = U.h;
  var CFG = window.MC_CONFIG || {};
  var app = document.getElementById('app');
  var LOGO = CFG.logo || 'assets/logo.png';
  var state = { cfg: null };

  function header() {
    return h('header', { class: 'top' }, h('div', { class: 'wrap' },
      h('a', { class: 'brand', href: '#/', 'aria-label': 'Madi Crasti Photography — all sessions' }, h('img', { src: LOGO, alt: 'Madi Crasti Photography' })),
      h('nav', null, h('a', { href: '#/' }, 'Sessions'), h('a', { href: CFG.portfolioUrl || 'https://madicrasti.mypixieset.com/', target: '_blank', rel: 'noopener' }, 'Portfolio'),
        h('a', { href: 'https://instagram.com/' + (CFG.instagram || 'mads.crasti'), target: '_blank', rel: 'noopener' }, 'Instagram'))));
  }
  function footer() {
    var s = state.cfg ? state.cfg.settings : {};
    return h('footer', { class: 'foot' }, h('div', { class: 'wrap' },
      h('span', null, '© ' + new Date().getFullYear() + ' Madi Crasti Photography · Sydney, Australia'),
      h('span', null, 'All times are Sydney time · ', s.instagram || '@mads.crasti')));
  }
  function page() {
    var main = h('main', { id: 'main' });
    var bar = API.mode === 'demo' ? h('div', { class: 'demo-bar' }, 'Preview mode — payments, calendars and emails are pretend until the back office is connected.') : null;
    U.mount(app, bar, header(), main, footer());
    window.scrollTo(0, 0);
    return main;
  }
  function loading(main) { U.mount(main, h('div', { class: 'wrap', style: { padding: '80px 20px', textAlign: 'center' } }, h('p', { class: 'muted' }, 'Loading…'))); }
  function failed(main, e) {
    U.mount(main, h('div', { class: 'center-card' }, h('h1', null, 'Something went wrong'), h('p', null, e.message || String(e)),
      h('div', { class: 'row-btns' }, h('a', { class: 'btn', href: '#/' }, 'Back to sessions'))));
  }
  async function cfg() { if (!state.cfg) state.cfg = await API.config(); return state.cfg; }
  function photo(o, cls) {
    var wrap = h('div', { class: cls || 'ph' }, h('div', { class: 'ph-fallback' }, o.name));
    if (o.image) {
      var img = h('img', { src: o.image, alt: o.name + ' — example photo by Madi Crasti', loading: 'lazy' });
      img.addEventListener('load', function () { var f = wrap.querySelector('.ph-fallback'); if (f) f.remove(); });
      img.addEventListener('error', function () { img.remove(); });
      wrap.insertBefore(img, wrap.firstChild);
    }
    return wrap;
  }

  /* ---------------- Sessions ---------------- */
  async function home() {
    var main = page(); loading(main);
    try { var c = await cfg(); } catch (e) { return failed(main, e); }
    var s = c.settings;
    U.mount(main,
      h('section', { class: 'wrap hero' },
        h('div', null,
          h('div', { class: 'eyebrow' }, 'Book a session'),
          h('h1', { class: 'display' }, 'Headshots and portfolios, ', h('em', null, 'shot across Sydney.')),
          h('p', null, 'Choose your session, pick a time and a location, and lock it in with a ' + s.depositPercent + '% deposit. Every session comes with full direction and posing guidance, so you never have to wonder what to do with your hands.')),
        h('div', { class: 'side' }, h('img', { src: LOGO, alt: '' }), h('div', { class: 'facts' },
          h('div', null, h('b', null, s.depositPercent + '% deposit'), ' secures your date — or pay in full'),
          h('div', null, h('b', null, 'Free reschedules'), ' up to ' + s.freeReschedules + ' times, more than ' + s.cutoffHours + ' hours out'),
          h('div', null, h('b', null, 'Sydney only'), ' — on location, or in studio')))),
      h('section', { class: 'wrap offers', 'aria-label': 'Sessions' }, c.offers.map(function (o) {
        return h('button', { class: 'offer', onclick: function () { location.hash = '#/book/' + o.id; } },
          (function () { var p = photo(o); p.appendChild(h('span', { class: 'frame' }, o.retouched + ' retouched · ' + C.fmtDuration(o.durationMin))); return p; })(),
          h('div', { class: 'body' },
            h('h3', null, o.name),
            h('div', { class: 'tag' }, o.tagline || ''),
            h('div', { class: 'meta' }, h('span', null, C.fmtDuration(o.durationMin)), h('span', null, o.retouched + ' retouched images'), (o.addons || []).length ? h('span', null, (o.addons || []).length + ' add-ons') : null),
            h('div', { class: 'price' }, h('b', null, C.money(o.priceCents)), h('span', null, C.money(Math.round(o.priceCents * s.depositPercent / 100), { always: o.priceCents % 400 !== 0 }) + ' deposit'))));
      })));
  }

  /* ---------------- Date & time picker ---------------- */
  function picker(opts) { // {offerId, sel, durationMin, ignoreBookingId, selected, onPick}
    var el = h('div', { class: 'cal' });
    var cache = {}, fetched = {}, today = C.ymdOf(Date.now());
    var s = state.cfg.settings, lastYmd = C.addDays(today, s.maxDaysAhead);
    var view = opts.selected ? C.ymdOf(opts.selected).slice(0, 7) : today.slice(0, 7);
    var selDay = opts.selected ? C.ymdOf(opts.selected) : null, selStart = opts.selected || null;
    var monthEl = h('div', { class: 'month' }), timesEl = h('div', { class: 'times' });
    el.appendChild(monthEl); el.appendChild(timesEl);
    async function ensure(ymdFrom) {
      var key = ymdFrom.slice(0, 7);
      if (fetched[key]) return fetched[key];
      fetched[key] = API.slots({ offerId: opts.offerId, sel: opts.sel, durationMin: opts.durationMin, ignoreBookingId: opts.ignoreBookingId,
        fromYmd: ymdFrom < today ? today : ymdFrom, days: 42 }).then(function (r) { Object.assign(cache, r.slots); return r; });
      return fetched[key];
    }
    async function draw() {
      var y = +view.slice(0, 4), m = +view.slice(5, 7), first = view + '-01';
      U.mount(monthEl, h('div', { class: 'mh' }, h('button', { type: 'button', 'aria-label': 'Previous month', disabled: view <= today.slice(0, 7), onclick: function () { view = shift(-1); draw(); } }, '‹'),
        h('b', null, C.MONTHS[m - 1] + ' ' + y), h('button', { type: 'button', 'aria-label': 'Next month', disabled: view >= lastYmd.slice(0, 7), onclick: function () { view = shift(1); draw(); } }, '›')),
        h('p', { class: 'muted small' }, 'Checking availability…'));
      try { await ensure(first); await ensure(C.addDays(first, 21)); } catch (e) { U.mount(monthEl, h('p', { class: 'notice bad' }, e.message)); return; }
      var grid = h('div', { class: 'days', role: 'grid' });
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(function (d) { grid.appendChild(h('div', { class: 'dn' }, d)); });
      var lead = (C.dowOf(first) + 6) % 7; for (var i = 0; i < lead; i++) grid.appendChild(h('span'));
      var dim = new Date(Date.UTC(y, m, 0)).getUTCDate(), any = false;
      for (var d = 1; d <= dim; d++) (function (ymd) {
        var n = (cache[ymd] || []).length; if (n) any = true;
        grid.appendChild(h('button', { type: 'button', class: (n ? 'avail ' : '') + (ymd === selDay ? 'sel ' : '') + (ymd === today ? 'today' : ''), disabled: !n,
          'aria-label': C.fmtDateYmd(ymd) + (n ? ', ' + n + ' times available' : ', unavailable'), onclick: function () { selDay = ymd; draw(); } }, String(+ymd.slice(8))));
      })(view + '-' + (d < 10 ? '0' : '') + d);
      U.mount(monthEl, monthEl.firstChild, grid, any ? null : h('p', { class: 'muted small' }, 'No times left this month — try the next one.'));
      drawTimes();
    }
    function shift(n) { var y = +view.slice(0, 4), m = +view.slice(5, 7) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + (m < 9 ? '0' : '') + (m + 1); }
    function drawTimes() {
      if (!selDay) { U.mount(timesEl, h('div', { class: 'tl' }, 'Pick a date'), h('p', { class: 'muted small' }, 'Highlighted days have times available. Bookings open ' + s.minNoticeHours + ' hours ahead and up to 3 months out.')); return; }
      var list = cache[selDay] || [];
      U.mount(timesEl, h('div', { class: 'tl' }, C.fmtDateYmd(selDay)),
        list.length ? h('div', { class: 'grid' }, list.map(function (ms) {
          return h('button', { type: 'button', class: ms === selStart ? 'sel' : '', onclick: function () { selStart = ms; drawTimes(); opts.onPick(ms); } }, C.fmtTime(ms));
        })) : h('p', { class: 'muted' }, 'No times left on this day.'),
        h('div', { class: 'tz' }, 'Sydney time · ' + C.fmtDuration(opts.durationMin || 60) + ' session'));
    }
    draw();
    return el;
  }

  /* ---------------- Location ---------------- */
  var photonSearch = U.debounce(function (q, cb) {
    if (q.length < 3) return cb([]);
    var url = 'https://photon.komoot.io/api/?limit=6&lang=en&lat=-33.87&lon=151.21&bbox=150.5,-34.25,151.45,-33.4&q=' + encodeURIComponent(q);
    fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      cb((j.features || []).map(function (f) {
        var p = f.properties || {};
        var addr = [p.housenumber && p.street ? p.housenumber + ' ' + p.street : p.street, p.suburb || p.district || p.city, p.state, p.postcode].filter(Boolean).join(', ');
        return { name: p.name || addr, address: addr, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
      }).filter(function (r) { return r.name; }));
    }).catch(function () { cb(null); });
  }, 280);
  function locationSearch(placeholder, onChoose) {
    var input = h('input', { type: 'search', id: 'loc-' + Math.random().toString(36).slice(2, 7), placeholder: placeholder, autocomplete: 'off', 'aria-label': placeholder });
    var res = h('div', { class: 'results', hidden: true });
    function show(list, q) {
      res.hidden = false;
      var items = (list || []).map(function (r) { return h('button', { type: 'button', onclick: function () { res.hidden = true; input.value = ''; onChoose({ type: 'search', name: r.name, address: r.address, lat: r.lat, lon: r.lon }); } }, r.name, h('small', null, r.address)); });
      items.push(h('button', { type: 'button', onclick: function () { res.hidden = true; input.value = ''; onChoose({ type: 'search', name: q, address: '' }); } }, 'Use “' + q + '”', h('small', null, list === null ? 'Search is offline — I\'ll confirm the exact spot with you' : 'Not in the list? Use what you typed')));
      U.mount(res, items);
    }
    input.addEventListener('input', function () { var q = input.value.trim(); if (q.length < 3) { res.hidden = true; return; } photonSearch(q, function (list) { if (input.value.trim() === q) show(list, q); }); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') res.hidden = true; if (e.key === 'Enter') { e.preventDefault(); var q = input.value.trim(); if (q) { res.hidden = true; input.value = ''; onChoose({ type: 'search', name: q, address: '' }); } } });
    return h('div', { class: 'search-box' }, input, res);
  }

  /* ---------------- Booking flow ---------------- */
  async function book(offerId) {
    var main = page(); loading(main);
    try { var c = await cfg(); } catch (e) { return failed(main, e); }
    var offer = c.offers.filter(function (o) { return o.id === offerId; })[0];
    if (!offer) return failed(main, new Error('That session isn\'t available. Please choose another.'));
    var s = c.settings;
    var f = { sel: {}, startMs: null, location: null, second: null, details: { guardian: {} }, payOption: 'deposit', agreed: false, open: 'addons', done: {}, errors: {} };
    if (!(offer.addons || []).length) { f.done.addons = true; f.open = 'time'; }
    var summaryEl = h('aside', { class: 'summary', 'aria-label': 'Your booking' }), stepsEl = h('div', { class: 'steps' });
    U.mount(main, h('div', { class: 'wrap' }, h('div', { style: { paddingTop: '20px' } }, h('button', { class: 'back', onclick: function () { location.hash = '#/'; } }, '← All sessions')),
      h('div', { class: 'book' }, summaryEl, stepsEl)));
    function q() { return C.quote(offer, f.sel, s); }

    function drawSummary() {
      var qq = q(), dep = qq.depositCents, due = f.payOption === 'full' ? qq.totalCents : dep, sur = C.surchargeCents(due, s);
      U.mount(summaryEl, photo(offer), h('div', { class: 'inner' },
        h('div', { class: 'eyebrow' }, 'Your session'), h('h2', null, offer.name),
        h('div', { class: 'muted small' }, C.fmtDuration(qq.durationMin) + ' · ' + qq.retouched + ' retouched images'),
        f.startMs ? h('div', { class: 'when' }, h('div', null, C.fmtDate(f.startMs)), h('div', null, C.fmtTime(f.startMs) + ' – ' + C.fmtTime(f.startMs + qq.durationMin * C.MIN)), h('div', { class: 'muted' }, 'Sydney time')) : null,
        f.location ? h('div', { class: 'small' }, '📍 ', f.location.type === 'unsure' ? 'Location: help me choose' : f.location.name) : null,
        h('div', { class: 'lines' },
          qq.lines.map(function (l) { return h('div', { class: 'row' }, h('span', null, l.label), h('span', null, C.money(l.cents))); }),
          h('div', { class: 'row total' }, h('span', null, 'Total'), h('span', null, C.money(qq.totalCents, { always: qq.totalCents % 100 !== 0 }))),
          h('div', { class: 'row dep' }, h('span', null, f.payOption === 'full' ? 'Paying today' : s.depositPercent + '% deposit today'), h('span', null, C.money(due, { always: due % 100 !== 0 }))),
          sur ? h('div', { class: 'row muted small' }, h('span', null, '+ ' + s.surcharge.label), h('span', null, C.money(sur, { always: true }))) : null,
          f.payOption !== 'full' ? h('div', { class: 'row muted small' }, h('span', null, 'Balance, invoiced a week before'), h('span', null, C.money(qq.totalCents - dep, { always: (qq.totalCents - dep) % 100 !== 0 }))) : null)));
    }
    function step(key, n, title, sum, body, opt) {
      opt = opt || {};
      var order = ['addons', 'time', 'location', 'details', 'pay'];
      var idx = order.indexOf(key), locked = order.slice(0, idx).some(function (k) { return !f.done[k]; }) && !f.done[key];
      var cls = 'step' + (f.done[key] ? ' done' : '') + (locked ? ' locked' : '') + (f.open !== key && !locked ? ' collapsed' : '');
      return h('section', { class: cls, id: 'step-' + key, 'aria-label': title },
        h('header', null, h('span', { class: 'n' }, f.done[key] ? '✓' : n), h('h3', null, title),
          f.done[key] && f.open !== key ? h('span', { class: 'sum' }, sum) : null,
          f.done[key] && f.open !== key ? h('button', { class: 'edit', onclick: function () { f.open = key; draw(); } }, 'Change') : null),
        f.open === key && !locked ? h('div', { class: 'content' }, body()) : null);
    }
    function next(key, to) { f.done[key] = true; f.open = to; draw(); var el = document.getElementById('step-' + to); if (el) setTimeout(function () { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30); }

    function addonsBody() {
      return [h('div', null, (offer.addons || []).map(function (a) {
        var right;
        if (a.type === 'qty') {
          var val = f.sel[a.id] || 0;
          right = h('div', { class: 'stepper' }, h('button', { type: 'button', 'aria-label': 'Fewer', onclick: function () { f.sel[a.id] = Math.max(0, val - 1); f.startMs = null; f.done.time = false; draw(); } }, '−'),
            h('span', { 'aria-live': 'polite' }, String(val)), h('button', { type: 'button', 'aria-label': 'More', onclick: function () { f.sel[a.id] = Math.min(a.max || 20, val + 1); if (a.extraMin) { f.startMs = null; f.done.time = false; } draw(); } }, '+'));
        } else {
          right = h('label', { class: 'toggle' }, h('input', { type: 'checkbox', id: 'ad-' + a.id, checked: !!f.sel[a.id], 'aria-label': a.label, onchange: function (e) { f.sel[a.id] = e.target.checked; if (a.id === 'loc2' && !e.target.checked) f.second = null; draw(); } }), h('i'));
        }
        return h('div', { class: 'addon' }, h('div', { class: 't' }, h('span', null, a.label + ' · ', h('b', null, C.money(a.unitCents)), a.unitLabel ? ' ' + a.unitLabel : ''),
          a.extraMin ? h('small', null, 'Adds ' + C.fmtDuration(a.extraMin) + ' to your session') : (a.note ? h('small', null, a.note) : null)), right);
      })), h('div', { class: 'row-btns' }, h('button', { class: 'btn', onclick: function () { next('addons', 'time'); } }, 'Continue'))];
    }
    function addonsSum() { var l = q().lines.length - 1; return l ? l + ' add-on' + (l > 1 ? 's' : '') : 'No add-ons'; }

    function timeBody() {
      return [picker({ offerId: offer.id, sel: f.sel, selected: f.startMs, durationMin: q().durationMin, onPick: function (ms) { f.startMs = ms; drawSummary(); btn.disabled = false; } }),
        (function () { btn = h('button', { class: 'btn', disabled: !f.startMs, onclick: function () { next('time', 'location'); } }, 'Continue'); return h('div', { class: 'row-btns' }, btn); })()];
    }
    var btn;
    function timeSum() { return f.startMs ? C.fmtDate(f.startMs, true) + ', ' + C.fmtTime(f.startMs) : ''; }

    function locationBody() {
      var L = f.location;
      var saved = h('div', { class: 'loc-options' }, c.locations.map(function (l) {
        return h('button', { type: 'button', class: 'loc-opt' + (L && L.type === 'saved' && L.id === l.id ? ' sel' : ''), onclick: function () { f.location = { type: 'saved', id: l.id, name: l.name, address: l.address }; draw(); } },
          h('b', null, l.name), h('small', null, l.address));
      }));
      var chosen = L && L.type === 'search' ? h('div', { class: 'chosen' }, h('span', null, '📍 ', h('b', null, L.name), L.address ? ' — ' + L.address : ''), h('button', { class: 'edit back', onclick: function () { f.location = null; draw(); } }, 'Change')) : null;
      var unsure = h('label', { class: 'check unsure' }, h('input', { type: 'checkbox', id: 'loc-unsure', checked: L && L.type === 'unsure', onchange: function (e) { f.location = e.target.checked ? { type: 'unsure' } : null; draw(); } }),
        h('span', null, h('b', null, 'I\'m not sure — help me choose.'), ' I shoot all across Sydney depending on the vibe; I\'ll send you a few spots to pick from.'));
      var second = f.sel.loc2 ? h('div', { class: 'panel' }, h('div', { class: 'field-label' }, '2nd location'),
        f.second ? h('div', { class: 'chosen' }, h('span', null, '📍 ' + f.second.name), h('button', { class: 'edit back', onclick: function () { f.second = null; draw(); } }, 'Change'))
          : locationSearch('Search for your 2nd location', function (r) { f.second = r; draw(); })) : null;
      var studioNote = f.sel.studio ? h('p', { class: 'notice small' }, 'Studio hire added — search for the studio you\'d like (or type "studio" and I\'ll suggest one). I book it for you.') : null;
      return [h('p', { class: 'muted small', style: { margin: 0 } }, 'My favourite spots'), saved,
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Or search anywhere in Sydney'), chosen || locationSearch('Try "Bondi Beach", "The Rocks" or a studio name', function (r) { f.location = r; draw(); })),
        studioNote, unsure, second,
        h('div', { class: 'row-btns' }, h('button', { class: 'btn', disabled: !L, onclick: function () { next('location', 'details'); } }, 'Continue'))];
    }
    function locSum() { var L = f.location; return !L ? '' : (L.type === 'unsure' ? 'Help me choose' : L.name); }

    function detailsBody() {
      var d = f.details, e = f.errors;
      function inp(key, type, label, ph, hint, auto) {
        return U.field(label, h('input', { type: type, id: 'd-' + key, value: d[key] || '', placeholder: ph || '', autocomplete: auto || 'off', oninput: function (ev) { d[key] = ev.target.value; } }), hint, e[key]);
      }
      function ginp(key, type, label, errKey, auto) {
        return U.field(label, h('input', { type: type, id: 'g-' + key, value: d.guardian[key] || '', autocomplete: auto || 'off', oninput: function (ev) { d.guardian[key] = ev.target.value; } }), null, e[errKey]);
      }
      var guardian = d.under18 ? h('div', { class: 'panel' },
        h('div', { class: 'field-label' }, 'Parent or guardian details (required for under 18s)'),
        h('div', { class: 'grid2' }, ginp('name', 'text', 'Their full name', 'gname', 'off'), ginp('phone', 'tel', 'Their phone', 'gphone', 'off')),
        ginp('email', 'email', 'Their email', 'gemail', 'off'),
        h('label', { class: 'check' + (e.gconsent ? ' has-error' : '') }, h('input', { type: 'checkbox', id: 'g-consent', checked: !!d.guardian.consent, onchange: function (ev) { d.guardian.consent = ev.target.checked; } }),
          h('span', null, 'I\'m the parent or guardian and I agree to this photoshoot, and to being contacted about it.')), e.gconsent ? h('span', { class: 'field-error' }, e.gconsent) : null) : null;
      return [
        h('div', { class: 'grid2' }, inp('name', 'text', 'Full name', '', null, 'name'), inp('email', 'email', 'Email', '', 'Your confirmation goes here', 'email')),
        h('div', { class: 'grid2' }, inp('phone', 'tel', 'Phone', '0412 345 678', null, 'tel'), inp('instagram', 'text', 'Instagram handle', '@yourhandle')),
        U.field('Notes for Madi', h('textarea', { id: 'd-notes', placeholder: 'Your concept, mood board or Pinterest links, what you need the photos for…', oninput: function (ev) { d.notes = ev.target.value; } }, d.notes || ''), 'Optional'),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'd-under18', checked: !!d.under18, onchange: function (ev) { d.under18 = ev.target.checked; draw(); } }), h('span', null, 'I\'m under 18')),
        guardian,
        h('details', { class: 'small', open: !!(d.agency || d.goals) },
          h('summary', { class: 'muted', style: { cursor: 'pointer' } }, 'Optional: agency and shoot goals'),
          h('div', { style: { display: 'grid', gap: '10px', marginTop: '10px' } },
            U.field('Agency (if you have one)', h('input', { type: 'text', id: 'd-agency', value: d.agency || '', oninput: function (ev) { d.agency = ev.target.value; } })),
            U.field('What are these photos for?', h('input', { type: 'text', id: 'd-goals', value: d.goals || '', placeholder: 'e.g. drama school auditions, signing with an agency', oninput: function (ev) { d.goals = ev.target.value; } })))),
        h('div', { class: 'row-btns' }, h('button', { class: 'btn', onclick: function () {
          f.errors = C.validateDetails(d);
          if (Object.keys(f.errors).length) { draw(); var first = stepsEl.querySelector('.has-error input, .field-error'); if (first && first.focus) first.focus(); return; }
          next('details', 'pay');
        } }, 'Continue'))];
    }
    function detSum() { return f.details.name || ''; }

    function payBody() {
      var qq = q(), dep = qq.depositCents;
      function opt(key, title, amount, sub) {
        return h('button', { type: 'button', class: 'payopt' + (f.payOption === key ? ' sel' : ''), onclick: function () { f.payOption = key; draw(); } },
          h('span', null, title), h('b', null, C.money(amount, { always: amount % 100 !== 0 })), h('small', null, sub));
      }
      var due = f.payOption === 'full' ? qq.totalCents : dep, sur = C.surchargeCents(due, s);
      var go = h('button', { class: 'btn block', disabled: !f.agreed, onclick: submit }, 'Pay ' + C.money(due + sur, { always: true }) + ' and book');
      return [
        h('div', { class: 'payopts' }, opt('deposit', s.depositPercent + '% deposit', dep, 'Balance of ' + C.money(qq.totalCents - dep, { always: (qq.totalCents - dep) % 100 !== 0 }) + ' invoiced a week before — pay by card or direct deposit'), opt('full', 'Pay in full', qq.totalCents, 'Nothing more to pay later')),
        h('div', { class: 'policy' }, h('b', null, 'Booking policy. '), c.policy),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'agree', checked: f.agreed, onchange: function (e) { f.agreed = e.target.checked; go.disabled = !f.agreed; } }),
          h('span', null, 'I\'ve read and agree to the booking policy.')),
        sur ? h('p', { class: 'muted small', style: { margin: 0 } }, 'Card payments include a ' + C.money(sur, { always: true }) + ' ' + s.surcharge.label.toLowerCase() + ' (' + s.surcharge.percent + '% + ' + C.money(s.surcharge.fixedCents, { always: true }) + '). Paying your balance by direct deposit has no fee.') : null,
        go, h('p', { class: 'muted small', style: { margin: 0, textAlign: 'center' } }, 'Secure checkout by Stripe. Your time is held for ' + s.holdMinutes + ' minutes while you pay.')];
      async function submit() {
        U.busy(go, true, 'Holding your time…');
        try {
          var loc = Object.assign({}, f.location); if (f.second) loc.second = f.second;
          var r = await API.createBooking({ offerId: offer.id, sel: f.sel, startMs: f.startMs, location: loc, details: f.details, payOption: f.payOption, agreed: f.agreed });
          if (!r.checkout) { location.hash = '#/done/' + r.booking.token; return; }
          await checkout(r.checkout, r.booking.token);
        } catch (e) {
          U.busy(go, false); U.toast(e.message, 'bad');
          if (e.code === 'slot_taken') { f.startMs = null; f.done.time = false; f.open = 'time'; draw(); }
        }
      }
    }
    function draw() {
      drawSummary();
      U.mount(stepsEl,
        step('addons', 1, 'Add-ons', addonsSum(), addonsBody),
        step('time', 2, 'Date and time', timeSum(), timeBody),
        step('location', 3, 'Location', locSum(), locationBody),
        step('details', 4, 'Your details', detSum(), detailsBody),
        step('pay', 5, 'Payment', '', payBody));
    }
    draw();
  }

  /* ---------------- Checkout ---------------- */
  function checkout(co, tok) {
    if (co.url) { location.href = co.url; return new Promise(function () {}); }
    return new Promise(function (resolve) { // Demo: pretend Stripe screen
      U.modal(function (close) {
        var pay = h('button', { class: 'btn block', onclick: async function () {
          U.busy(pay, true, 'Processing…');
          try { await API.completeDemoPayment(co.id); close(); location.hash = '#/done/' + tok; resolve(); } catch (e) { U.busy(pay, false); U.toast(e.message, 'bad'); }
        } }, 'Pay ' + C.money(co.amountCents + co.surchargeCents, { always: true }));
        return h('div', { class: 'stripe' },
          h('div', { class: 'sh' }, h('b', null, 'Stripe checkout'), h('span', { class: 'badge' }, 'Preview — no real payment')),
          h('div', { class: 'lines' }, h('div', { class: 'row' }, h('span', null, { deposit: 'Deposit', full: 'Paid in full', balance: 'Balance', redeposit: 'New deposit' }[co.kind]), h('span', null, C.money(co.amountCents, { always: true }))),
            co.surchargeCents ? h('div', { class: 'row muted' }, h('span', null, 'Card processing fee'), h('span', null, C.money(co.surchargeCents, { always: true }))) : null,
            h('div', { class: 'row total' }, h('span', null, 'Total'), h('span', null, C.money(co.amountCents + co.surchargeCents, { always: true })))),
          U.field('Card', h('input', { type: 'text', id: 'demo-card', value: '4242 4242 4242 4242', readonly: true })),
          pay, h('button', { class: 'btn ghost block', onclick: function () { close(); resolve(); } }, 'Cancel'));
      }, { sticky: true });
    });
  }

  /* ---------------- Done ---------------- */
  async function done(tok) {
    var main = page(); loading(main);
    try { await cfg(); var b = await API.getBooking(tok); } catch (e) { return failed(main, e); }
    for (var i = 0; i < 10 && b.status === 'held'; i++) { await new Promise(function (r) { setTimeout(r, 2000); }); b = await API.getBooking(tok); }
    if (b.status === 'held') return U.mount(main, h('div', { class: 'center-card' }, h('h1', null, 'Almost there'), h('p', null, 'We\'re still waiting for your payment to come through. If you closed the payment page, you can finish it below — your time is held for a few more minutes.'),
      h('div', { class: 'row-btns' }, h('a', { class: 'btn', href: '#/pay/' + tok }, 'Finish payment'))));
    U.mount(main, h('div', { class: 'center-card' },
      h('div', { class: 'eyebrow' }, 'You\'re booked in'),
      h('h1', null, 'See you soon, ' + (b.firstName || 'friend') + '.'),
      h('p', null, 'Your confirmation email will be with you shortly at ', h('b', null, b.email), '. It has your shoot details and a link to manage your booking.'),
      bookingKv(b),
      h('div', { class: 'row-btns' }, h('a', { class: 'btn', href: '#/manage/' + tok }, 'Manage booking'), h('a', { class: 'btn ghost', href: '#/' }, 'Back to sessions'))));
  }
  function bookingKv(b) {
    var L = b.location || {};
    return h('dl', { class: 'kv' },
      h('dt', null, 'Session'), h('dd', null, b.offerName + ' · ' + C.fmtDuration(b.durationMin)),
      h('dt', null, 'When'), h('dd', null, C.fmtDate(b.startMs) + ', ' + C.fmtTime(b.startMs) + ' – ' + C.fmtTime(b.endMs)),
      h('dt', null, 'Where'), h('dd', null, L.type === 'unsure' ? 'We\'ll choose together' : (L.name || 'TBC') + (L.second ? ' + ' + L.second.name : '')),
      h('dt', null, 'Total'), h('dd', null, C.money(b.totalCents, { always: b.totalCents % 100 !== 0 })),
      h('dt', null, 'Paid'), h('dd', null, C.money(b.paidCents, { always: b.paidCents % 100 !== 0 })),
      b.status === 'cancelled' || b.status === 'expired' ? null : h('dt', null, 'Balance'), b.status === 'cancelled' || b.status === 'expired' ? null : h('dd', null, b.balanceCents ? C.money(b.balanceCents, { always: b.balanceCents % 100 !== 0 }) + ' — invoiced a week before' : 'All paid'));
  }

  /* ---------------- Manage ---------------- */
  async function manage(tok) {
    var main = page(); loading(main);
    try { await cfg(); var b = await API.getBooking(tok); } catch (e) { return failed(main, e); }
    var card = h('div', { class: 'center-card' });
    U.mount(main, card);
    var statusText = { confirmed: 'Confirmed', held: 'Waiting for payment', pending_redeposit: 'New deposit needed', cancelled: 'Cancelled', completed: 'Completed', expired: 'Expired' }[b.status] || b.status;
    var parts = [h('div', { class: 'eyebrow' }, 'Your booking · ' + statusText), h('h1', null, b.offerName), bookingKv(b)];
    if (b.status === 'pending_redeposit') parts.push(h('div', { class: 'notice warn' }, 'Your new date is held. Pay the new ' + C.money(b.depositCents, { always: true }) + ' deposit to lock it in.'), h('div', { class: 'row-btns' }, h('a', { class: 'btn', href: '#/pay/' + tok }, 'Pay new deposit')));
    if (b.status === 'held') parts.push(h('div', { class: 'row-btns' }, h('a', { class: 'btn', href: '#/pay/' + tok }, 'Finish payment')));
    if (b.status === 'cancelled') parts.push(h('div', { class: 'notice' }, b.refundPendingCents ? 'Your refund of ' + C.money(b.refundPendingCents, { always: true }) + ' is being processed.' : (b.refundedCents ? 'Refunded ' + C.money(b.refundedCents, { always: true }) + '.' : 'This booking has been cancelled.')), h('div', { class: 'row-btns' }, h('a', { class: 'btn', href: '#/' }, 'Book again')));
    if (b.status === 'confirmed' && b.preview) {
      parts.push(h('p', { class: 'notice ' + (b.reschedulesLeft ? '' : 'warn') }, b.leftLine + ' Changes within ' + state.cfg.settings.cutoffHours + ' hours of your shoot keep your deposit.'));
      if (b.balanceCents) parts.push(h('div', { class: 'panel' }, h('b', null, 'Balance: ' + C.money(b.balanceCents, { always: true })),
        h('div', { class: 'row-btns' }, h('a', { class: 'btn', href: '#/pay/' + tok }, 'Pay balance by card')),
        b.bankDetails ? h('div', { class: 'small' }, h('div', { class: 'muted' }, 'Or by direct deposit, no fee:'), h('pre', { style: { whiteSpace: 'pre-wrap', font: 'inherit', margin: '4px 0 0' } }, b.bankDetails)) : null));
      parts.push(h('div', { class: 'row-btns' }, h('button', { class: 'btn', onclick: function () { reschedule(b, tok); } }, 'Reschedule'), h('button', { class: 'btn ghost', onclick: function () { cancel(b, tok); } }, 'Cancel booking')));
    }
    U.mount(card, parts);
  }
  function reasonBox() { return h('textarea', { id: 'reason', placeholder: 'A few words is perfect — e.g. "I\'ve been called in for an audition that day".', required: true }); }
  function reschedule(b, tok) {
    var ev = b.preview.reschedule, newStart = null;
    U.modal(function (close) {
      var reason = reasonBox();
      var go = h('button', { class: 'btn', disabled: true, onclick: async function () {
        if (reason.value.trim().length < 3) { U.toast('Please add a reason for the change.', 'bad'); reason.focus(); return; }
        U.busy(go, true, 'Saving…');
        try {
          var r = await API.change(tok, { action: 'reschedule', reason: reason.value, newStartMs: newStart });
          close();
          if (r.checkout) { await checkout(r.checkout, tok); } else { U.toast('Rescheduled to ' + C.fmtDate(newStart, true) + ', ' + C.fmtTime(newStart)); }
          manage(tok);
        } catch (e) { U.busy(go, false); U.toast(e.message, 'bad'); }
      } }, ev.penalty ? 'Keep deposit and choose this time' : 'Confirm new time');
      return h('div', { style: { display: 'grid', gap: '14px' } },
        h('h2', { class: 'display', style: { fontSize: '30px' } }, 'Reschedule'),
        h('div', { class: 'notice ' + (ev.penalty ? 'bad' : 'good') }, ev.headline),
        picker({ offerId: b.offerId, sel: b.sel, durationMin: b.durationMin, ignoreBookingId: b.id, onPick: function (ms) { newStart = ms; go.disabled = false; } }),
        U.field('Why are you rescheduling?', reason),
        h('div', { class: 'row-btns' }, go, h('button', { class: 'btn ghost', onclick: close }, 'Keep my current time')));
    }, { wide: true, noFocus: true });
  }
  function cancel(b, tok) {
    var ev = b.preview.cancel;
    U.modal(function (close) {
      var reason = reasonBox();
      var go = h('button', { class: 'btn danger', onclick: async function () {
        if (reason.value.trim().length < 3) { U.toast('Please add a reason for cancelling.', 'bad'); reason.focus(); return; }
        U.busy(go, true, 'Cancelling…');
        try { await API.change(tok, { action: 'cancel', reason: reason.value }); close(); U.toast('Your booking has been cancelled.'); manage(tok); }
        catch (e) { U.busy(go, false); U.toast(e.message, 'bad'); }
      } }, 'Cancel my booking');
      return h('div', { style: { display: 'grid', gap: '14px' } },
        h('h2', { class: 'display', style: { fontSize: '30px' } }, 'Cancel your booking?'),
        h('div', { class: 'notice ' + (ev.late ? 'bad' : '') }, ev.headline + (ev.refundCents ? ' Refunds are approved by Madi and usually land within 5–10 business days.' : '')),
        U.field('Why are you cancelling?', reason),
        h('div', { class: 'row-btns' }, go, h('button', { class: 'btn ghost', onclick: close }, 'Keep my booking')));
    });
  }

  /* ---------------- Pay ---------------- */
  async function pay(tok) {
    var main = page(); loading(main);
    try { await cfg(); var r = await API.payLink(tok); await checkout(r.checkout, tok); manage(tok); }
    catch (e) { failed(main, e); }
  }

  /* ---------------- Router ---------------- */
  function route() {
    var p = (location.hash || '#/').slice(2).split('/');
    if (p[0] === 'book' && p[1]) return book(p[1]);
    if (p[0] === 'done' && p[1]) return done(p[1]);
    if (p[0] === 'manage' && p[1]) return manage(p[1]);
    if (p[0] === 'pay' && p[1]) return pay(p[1]);
    // Quiz links: ?offer=headshots or #/offer/headshots
    var qs = new URLSearchParams(location.search), o = qs.get('offer') || (p[0] === 'offer' && p[1]);
    if (o) { location.hash = '#/book/' + o; return; }
    return home();
  }
  window.addEventListener('hashchange', route);
  window.MCclient = { route: route };
  if (!window.MC_NO_AUTOSTART) route();
})();
