/* API layer. Live mode talks to the Supabase back office; Demo mode runs the same engine
 * in the browser with pretend payments, calendars and email, so the site works before setup. */
(function (root) {
  'use strict';
  var C = root.MCcore, CFG = root.MC_CONFIG || {};
  var LIVE = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);

  /* ---------------- Demo store ---------------- */
  var KEY = 'mcphotography-demo-v1';
  var mem = null;
  function load() {
    if (mem) return mem;
    try { mem = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { mem = null; }
    if (!mem || mem.v !== 1) mem = seed();
    return mem;
  }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* storage blocked: stay in memory */ } }
  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function seed() {
    var t = Date.now(), today = C.ymdOf(t);
    var st = { v: 1, settings: clone(C.DEFAULT_SETTINGS), offers: clone(C.DEFAULT_OFFERS), locations: clone(C.DEFAULT_LOCATIONS), templates: clone(C.DEFAULT_TEMPLATES),
      bookings: [], blocks: [], clients: [], outbox: [], payments: [], ext: [] };
    // Pretend calendar events so you can see Google/iCloud busy times blocking slots.
    st.ext = [
      { id: 'g1', label: 'Real estate video (Google)', startMs: C.sydToUtc(C.addDays(today, 4), 600), endMs: C.sydToUtc(C.addDays(today, 4), 780) },
      { id: 'i1', label: 'Dentist (iCloud)', startMs: C.sydToUtc(C.addDays(today, 6), 840), endMs: C.sydToUtc(C.addDays(today, 6), 900) },
      { id: 'g2', label: 'Real estate video (Google)', startMs: C.sydToUtc(C.addDays(today, 18), 540), endMs: C.sydToUtc(C.addDays(today, 18), 720) }
    ];
    st.blocks = [{ id: 'blk1', label: 'Weekend away', startMs: C.sydToUtc(C.addDays(today, 24), 0), endMs: C.sydToUtc(C.addDays(today, 26), 0) }];
    function mk(id, offerId, dayOffset, min, name, email, extra) {
      var o = st.offers.filter(function (x) { return x.id === offerId; })[0];
      var q = C.quote(o, extra.sel || {}, st.settings), s0 = C.sydToUtc(C.addDays(today, dayOffset), min);
      var b = Object.assign({ id: id, token: 'demo-' + id, offerId: o.id, offerName: o.name, status: 'confirmed', createdBy: 'client', createdAt: t - 5 * C.DAY,
        startMs: s0, endMs: s0 + q.durationMin * C.MIN, durationMin: q.durationMin, bufferBeforeMin: 60, bufferAfterMin: 60, sel: extra.sel || {}, lines: q.lines,
        totalCents: q.totalCents, depositCents: q.depositCents, retouched: q.retouched, payOption: 'deposit', paidCents: q.depositCents, surchargeCents: C.surchargeCents(q.depositCents, st.settings),
        forfeitedCents: 0, refundedCents: 0, refundPendingCents: 0, rescheduleCount: 0,
        location: { type: 'saved', id: 'chatswood', name: 'Chatswood Interchange' },
        details: { name: name, email: email, phone: '0412 000 111', instagram: '@' + name.split(' ')[0].toLowerCase(), notes: '' },
        history: [{ at: t - 5 * C.DAY, type: 'created', text: 'Booked online' }, { at: t - 5 * C.DAY, type: 'payment', text: 'Deposit paid by card' }], flags: { confirmedAt: t - 5 * C.DAY } }, extra);
      delete b.sel_; st.bookings.push(b);
      st.clients.push({ id: 'c-' + id, email: email, name: name, phone: b.details.phone, instagram: b.details.instagram, stage: b.status === 'cancelled' ? 'Cancelled' : 'Booked', package: o.name,
        ticks: { emailed: true, replied: true, booked: true, depositPaid: true }, firstSeenMs: t - 20 * C.DAY, source: 'Booking site', bookingIds: [id], lastBookingMs: s0 });
      b.clientId = 'c-' + id; return b;
    }
    mk('b1', 'headshots', 5, 600, 'Ella Nguyen', 'ella@example.com', { location: { type: 'saved', id: 'town-hall', name: 'Sydney Town Hall' }, details: { name: 'Ella Nguyen', email: 'ella@example.com', phone: '0412 000 111', instagram: '@ellanguyen', notes: 'Audition headshots for NIDA — clean, natural looks.', agency: '', goals: 'Drama school audition' } });
    mk('b2', 'combo', 9, 600, 'Sofia Marin', 'sofia@example.com', { payOption: 'full', paidCents: 45000, sel: {}, rescheduleCount: 1, location: { type: 'saved', id: 'barangaroo', name: 'Barangaroo' } });
    var late = mk('b3', 'downtown-edit', 1, 780, 'Brendon Stone', 'brendon@example.com', { status: 'cancelled', cancelledAt: t - 2 * C.HOUR, forfeitedCents: 8750, flags: { needsAttention: true } });
    late.history.push({ at: t - 2 * C.HOUR, type: 'cancelled', text: 'Cancelled by client 23 hours before', reason: 'Came down with a cold and don\'t want to shoot looking sick', keepCents: 8750 });
    mk('b4', 'confidence-mini', 3, 630, 'Jess Park', 'jess@example.com', { details: { name: 'Jess Park', email: 'jess@example.com', phone: '0412 555 010', instagram: '@jesspark', under18: true, guardian: { name: 'Min Park', phone: '0412 555 011', email: 'min@example.com', consent: true }, notes: 'First ever shoot!' }, location: { type: 'unsure' } });
    st.outbox.push({ id: 'o1', createdAt: t - 2 * C.HOUR, bookingId: 'b3', key: 'alert_urgent', name: 'URGENT alert to you', to: st.settings.adminEmail, subject: 'URGENT — late cancellation: Brendon Stone, ' + C.fmtDate(late.startMs, true), body: 'Brendon Stone has made a late cancellation 23 hours before their shoot…', status: 'sent', priority: true, toAdmin: true });
    return st;
  }
  function byStart(a, b) { return a.startMs - b.startMs; }
  var DemoStore = {
    getSettings: async function () { return clone(load().settings); },
    saveSettings: async function (s) { load().settings = clone(s); persist(); },
    getTemplates: async function () { return clone(load().templates); },
    saveTemplate: async function (k, t) { load().templates[k] = clone(t); persist(); },
    listOffers: async function () { return clone(load().offers).sort(function (a, b) { return a.sort - b.sort; }); },
    saveOffer: async function (o) { var L = load().offers, i = L.findIndex(function (x) { return x.id === o.id; }); if (i >= 0) L[i] = clone(o); else L.push(clone(o)); persist(); },
    deleteOffer: async function (id) { var st = load(); st.offers = st.offers.filter(function (x) { return x.id !== id; }); persist(); },
    listLocations: async function () { return clone(load().locations); },
    saveLocation: async function (l) { var L = load().locations, i = L.findIndex(function (x) { return x.id === l.id; }); if (i >= 0) L[i] = clone(l); else L.push(clone(l)); persist(); },
    deleteLocation: async function (id) { var st = load(); st.locations = st.locations.filter(function (x) { return x.id !== id; }); persist(); },
    bookingsBetween: async function (f, t, statuses) { return clone(load().bookings.filter(function (b) { return b.endMs > f && b.startMs < t && (!statuses || statuses.indexOf(b.status) >= 0); })).sort(byStart); },
    listBookings: async function () { return clone(load().bookings); },
    getBooking: async function (id) { return clone(load().bookings.filter(function (b) { return b.id === id; })[0] || null); },
    getBookingByToken: async function (tk) { return clone(load().bookings.filter(function (b) { return b.token === tk; })[0] || null); },
    saveBooking: async function (b) { var L = load().bookings, i = L.findIndex(function (x) { return x.id === b.id; }); if (i >= 0) L[i] = clone(b); else L.push(clone(b)); persist(); },
    listBlocks: async function (f, t) { return clone(load().blocks.filter(function (b) { return b.endMs > f && b.startMs < t; })); },
    saveBlock: async function (bl) { var L = load().blocks, i = L.findIndex(function (x) { return x.id === bl.id; }); if (i >= 0) L[i] = clone(bl); else L.push(clone(bl)); persist(); },
    deleteBlock: async function (id) { var st = load(); st.blocks = st.blocks.filter(function (x) { return x.id !== id; }); persist(); },
    upsertClient: async function (d, fn) {
      var L = load().clients, cur = L.filter(function (c) { return d.email && c.email === d.email; })[0];
      if (!cur) { cur = { id: 'c-' + C.token(8), email: d.email, stage: 'Booked', ticks: {}, firstSeenMs: Date.now() }; L.push(cur); }
      ['name', 'phone', 'instagram', 'agency', 'goals', 'guardian', 'source'].forEach(function (k) { if (d[k]) cur[k] = d[k]; });
      var n = fn(clone(cur)); Object.keys(n).forEach(function (k) { cur[k] = n[k]; }); persist(); return clone(cur);
    },
    listClients: async function () { return clone(load().clients); },
    saveClient: async function (cl) { var L = load().clients, i = L.findIndex(function (x) { return x.id === cl.id; }); if (i >= 0) L[i] = clone(cl); else L.push(clone(cl)); persist(); },
    addOutbox: async function (o) { load().outbox.unshift(clone(o)); persist(); },
    listOutbox: async function (n) { return clone(load().outbox.slice(0, n || 50)); },
    getPayment: async function (id) { return clone(load().payments.filter(function (p) { return p.id === id; })[0] || null); },
    savePayment: async function (p) { var L = load().payments, i = L.findIndex(function (x) { return x.id === p.id; }); if (i >= 0) L[i] = clone(p); else L.push(clone(p)); persist(); }
  };
  var DemoIO = {
    now: function () { return Date.now(); },
    busy: async function (f, t) { return clone(load().ext.filter(function (e) { return e.endMs > f && e.startMs < t; })); },
    calendarUpsert: async function (b) { return { gcalId: 'gcal-' + b.id, icalUid: 'ical-' + b.id }; },
    calendarDelete: async function () { return true; },
    email: async function (m) { return { id: 'demo-' + C.token(6), status: m.draft ? 'draft' : 'sent' }; },
    checkout: async function (p) { return { id: 'cs_demo_' + C.token(10), demo: true }; },
    refund: async function (b, cents) { return { id: 're_demo_' + C.token(8) }; }
  };

  function demoApi() {
    var E = root.MCengine.createEngine(DemoStore, DemoIO, { siteUrl: '' });
    var A = E.admin;
    return {
      mode: 'demo',
      config: E.publicConfig, slots: E.slots, createBooking: E.createBooking, getBooking: E.getByToken,
      change: E.clientChange, payLink: E.payLink,
      completeDemoPayment: function (id) { return E.paymentSucceeded(id, 'demo'); },
      admin: {
        session: async function () { return { email: CFG.adminEmail || C.DEFAULT_SETTINGS.adminEmail, demo: true }; },
        signIn: async function () { return { sent: false, demo: true }; }, signOut: async function () {},
        overview: A.overview, calendarBusy: A.calendarBusy, createBooking: A.createBooking, reschedule: A.reschedule, cancel: A.cancel, refund: A.refund,
        markPaid: A.markPaid, updateBooking: A.updateBooking, redraftEmail: A.redraftEmail, saveSettings: A.saveSettings, saveOffer: A.saveOffer,
        deleteOffer: A.deleteOffer, saveLocation: A.saveLocation, deleteLocation: A.deleteLocation, saveTemplate: A.saveTemplate, saveBlock: A.saveBlock,
        deleteBlock: A.deleteBlock, saveClient: A.saveClient, previewEmail: A.previewEmail, runHourly: A.runHourly,
        connections: async function () { return { google: { connected: false, demo: true }, icloud: { connected: false, demo: true }, stripe: { connected: false, demo: true } }; },
        resetDemo: async function () { mem = seed(); persist(); return true; }
      }
    };
  }

  /* ---------------- Live (Supabase back office) ---------------- */
  function liveApi() {
    var base = CFG.supabaseUrl.replace(/\/$/, '') + '/functions/v1/';
    var sb = root.supabase && root.supabase.createClient ? root.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey) : null;
    async function call(fn, action, payload, auth) {
      var headers = { 'Content-Type': 'application/json', apikey: CFG.supabaseAnonKey };
      if (auth && sb) { var s = await sb.auth.getSession(); if (s.data.session) headers.Authorization = 'Bearer ' + s.data.session.access_token; }
      var r = await fetch(base + fn, { method: 'POST', headers: headers, body: JSON.stringify({ action: action, payload: payload || {} }) });
      var j = await r.json().catch(function () { return { error: 'The booking system didn\'t respond. Please try again.' }; });
      if (!r.ok || j.error) { var e = new Error(j.error || ('Error ' + r.status)); e.code = j.code; throw e; }
      return j.data;
    }
    function pub(a) { return function (p) { return call('public', a, p); }; }
    function adm(a) { return function () { return call('admin', a, { args: Array.prototype.slice.call(arguments) }, true); }; }
    var names = ['overview', 'calendarBusy', 'createBooking', 'reschedule', 'cancel', 'refund', 'markPaid', 'updateBooking', 'redraftEmail', 'saveSettings', 'saveOffer',
      'deleteOffer', 'saveLocation', 'deleteLocation', 'saveTemplate', 'saveBlock', 'deleteBlock', 'saveClient', 'previewEmail', 'runHourly', 'connections', 'googleAuthUrl', 'icloudConnect'];
    var admin = {};
    names.forEach(function (n) { admin[n] = adm(n); });
    admin.session = async function () { if (!sb) return null; var s = await sb.auth.getSession(); return s.data.session ? { email: s.data.session.user.email } : null; };
    admin.signIn = async function (email) {
      var r = await sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: location.href.split('#')[0], shouldCreateUser: true } });
      if (r.error) throw r.error; return { sent: true };
    };
    admin.signOut = async function () { if (sb) await sb.auth.signOut(); };
    return {
      mode: 'live',
      config: pub('config'), slots: pub('slots'),
      createBooking: pub('createBooking'),
      getBooking: function (tok) { return call('public', 'getBooking', { token: tok }); },
      change: function (tok, p) { return call('public', 'change', Object.assign({ token: tok }, p)); },
      payLink: function (tok) { return call('public', 'payLink', { token: tok }); },
      admin: admin
    };
  }

  root.MCapi = LIVE ? liveApi() : demoApi();
})(typeof globalThis !== 'undefined' ? globalThis : this);
