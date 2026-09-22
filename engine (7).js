/* Madi Crasti Photography — booking engine.
 * The whole booking flow in one place. It runs in two homes:
 *   - Live: inside the Supabase back office (supabase/functions/_shared/engine.js), with the real
 *     database, Stripe, Google (Calendar + Gmail) and iCloud plugged in.
 *   - Demo: in the browser (assets/engine.js) with a local store and pretend payments, so the site
 *     can be clicked through before any accounts are connected.
 * createEngine(store, integrations) -> engine. Depends on MCcore (core.js).
 */
(function (root) {
  'use strict';
  var C = root.MCcore;
  var ACTIVE = ['held', 'confirmed', 'pending_redeposit'];

  function createEngine(store, io, opts) {
    opts = opts || {};
    var siteUrl = opts.siteUrl || '';
    function now() { return io.now ? io.now() : Date.now(); }
    function err(msg, code) { var e = new Error(msg); e.code = code || 'bad_request'; e.expose = true; throw e; }
    function hist(b, type, text, extra) { (b.history = b.history || []).push(Object.assign({ at: now(), type: type, text: text }, extra || {})); }

    async function ctx(extra) {
      var r = await Promise.all([store.getSettings(), store.getTemplates(), store.listLocations(), store.listOffers()]);
      return Object.assign({ settings: r[0], templates: r[1], locations: r[2], offers: r[3], siteUrl: siteUrl }, extra || {});
    }
    function offerById(c, id) { return c.offers.filter(function (o) { return o.id === id; })[0]; }

    /* ---------- Email ---------- */
    async function sendEmail(key, b, c, change, opts2) {
      opts2 = opts2 || {};
      var e = C.renderEmail(key, b, Object.assign({}, c, { offer: offerById(c, b.offerId), change: change }));
      var t = c.templates[key] || C.DEFAULT_TEMPLATES[key];
      var draft = e.toAdmin ? false : !(t.autoSend && !c.settings.emailsNeedApprovalAll);
      var res = { id: null, status: draft ? 'draft' : 'sent' };
      try { res = await io.email({ to: e.to, subject: e.subject, body: e.body, draft: draft, priority: !!opts2.priority, replyTo: c.settings.replyToEmail }) || res; }
      catch (x) { res = { status: 'failed', error: String(x.message || x) }; }
      await store.addOutbox({ id: C.token(12), createdAt: now(), bookingId: b.id, key: key, name: t.name, to: e.to, subject: e.subject, body: e.body,
        status: res.status || (draft ? 'draft' : 'sent'), priority: !!opts2.priority, toAdmin: e.toAdmin, providerId: res.id || null, error: res.error || null });
      return res;
    }

    /* ---------- Availability ---------- */
    async function busyBetween(fromMs, toMs, ignoreId) {
      var r = await Promise.all([store.bookingsBetween(fromMs - C.DAY, toMs + C.DAY, ACTIVE), store.listBlocks(fromMs, toMs), io.busy ? io.busy(fromMs, toMs).catch(function () { return []; }) : []]);
      var t = now();
      var bookings = r[0].filter(function (b) { return b.id !== ignoreId && !(b.status === 'held' && b.holdExpiresMs && b.holdExpiresMs < t); });
      // Our own shoots also appear in Google/iCloud; ignore calendar events we created.
      var ownIds = {}; r[0].forEach(function (b) { if (b.gcalId) ownIds[b.gcalId] = 1; if (b.icalUid) ownIds[b.icalUid] = 1; });
      var ext = (r[2] || []).filter(function (e) { return !(e.id && ownIds[e.id]); });
      return { bookings: bookings, busy: r[1].concat(ext) };
    }

    async function publicConfig() {
      var c = await ctx(), s = c.settings;
      return {
        settings: { depositPercent: s.depositPercent, cutoffHours: s.cutoffHours, freeReschedules: s.freeReschedules, minNoticeHours: s.minNoticeHours,
          maxDaysAhead: s.maxDaysAhead, surcharge: s.surcharge, businessName: s.businessName, instagram: s.instagram, phone: s.phone, hours: s.hours, holdMinutes: s.holdMinutes },
        offers: c.offers.filter(function (o) { return o.active && !o.isPrivate; }).sort(function (a, b) { return a.sort - b.sort; }),
        locations: c.locations.map(function (l) { return { id: l.id, name: l.name, address: l.address, lat: l.lat, lon: l.lon }; }),
        policy: C.POLICY_SUMMARY
      };
    }

    async function slots(p) { // {offerId, sel, fromYmd, days, ignoreBookingId}
      var c = await ctx(), offer = offerById(c, p.offerId);
      if (!offer || !offer.active || offer.isPrivate) err('That offer isn\'t available to book online.');
      var q = C.quote(offer, p.sel, c.settings), days = Math.min(p.days || 42, 62);
      var fromMs = C.sydToUtc(p.fromYmd, 0), toMs = C.sydToUtc(C.addDays(p.fromYmd, days), 0);
      var bz = await busyBetween(fromMs, toMs, p.ignoreBookingId);
      var map = C.rangeSlots({ fromYmd: p.fromYmd, days: days, durationMin: p.durationMin || q.durationMin, settings: c.settings, bookings: bz.bookings, busy: bz.busy, nowMs: now() });
      return { durationMin: p.durationMin || q.durationMin, slots: map };
    }

    async function assertFree(startMs, durationMin, s, ignoreId, isAdmin) {
      var endMs = startMs + durationMin * C.MIN;
      var bz = await busyBetween(startMs - C.DAY, endMs + C.DAY, ignoreId);
      if (isAdmin) return C.conflicts(startMs, endMs, s.bufferBeforeMin, s.bufferAfterMin, bz.bookings, bz.busy, ignoreId);
      var ymd = C.ymdOf(startMs);
      var ok = C.daySlots({ ymd: ymd, durationMin: durationMin, settings: s, bookings: bz.bookings, busy: bz.busy, nowMs: now() }).indexOf(startMs) >= 0;
      if (!ok) err('Sorry — that time was just taken or is no longer available. Please pick another.', 'slot_taken');
      return false;
    }

    /* ---------- Client booking ---------- */
    async function createBooking(p) {
      var c = await ctx(), s = c.settings, offer = offerById(c, p.offerId);
      if (!offer || !offer.active || offer.isPrivate) err('That offer isn\'t available to book online.');
      if (!p.agreed) err('Please tick that you agree to the booking policy.');
      var d = p.details || {}, v = C.validateDetails(d);
      if (Object.keys(v).length) err(v[Object.keys(v)[0]], 'invalid_details');
      if (!p.location || !p.location.type) err('Choose a location, or pick "I\'m not sure".');
      var q = C.quote(offer, p.sel, s);
      await assertFree(p.startMs, q.durationMin, s);
      var b = {
        id: C.token(16), token: C.token(28), offerId: offer.id, offerName: offer.name, status: 'held', createdBy: 'client', createdAt: now(),
        startMs: p.startMs, endMs: p.startMs + q.durationMin * C.MIN, durationMin: q.durationMin,
        bufferBeforeMin: s.bufferBeforeMin, bufferAfterMin: s.bufferAfterMin,
        sel: p.sel || {}, lines: q.lines, totalCents: q.totalCents, depositCents: q.depositCents, retouched: q.retouched,
        payOption: p.payOption === 'full' ? 'full' : 'deposit', paidCents: 0, surchargeCents: 0, forfeitedCents: 0, refundedCents: 0, refundPendingCents: 0,
        rescheduleCount: 0, location: p.location, details: cleanDetails(d), policyAgreedAt: now(),
        holdExpiresMs: now() + s.holdMinutes * C.MIN, history: [], flags: {}
      };
      hist(b, 'created', 'Booked online — waiting for payment');
      if (b.totalCents === 0) { b.status = 'confirmed'; await store.saveBooking(b); await afterConfirmed(b, c); return { booking: view(b, c), checkout: null }; }
      await store.saveBooking(b);
      var amount = b.payOption === 'full' ? b.totalCents : b.depositCents;
      var checkout = await startCheckout(b, b.payOption === 'full' ? 'full' : 'deposit', amount, c);
      return { booking: view(b, c), checkout: checkout };
    }
    function cleanDetails(d) {
      var o = { name: (d.name || '').trim(), email: (d.email || '').trim().toLowerCase(), phone: (d.phone || '').trim(), instagram: (d.instagram || '').trim(),
        notes: (d.notes || '').trim().slice(0, 3000), under18: !!d.under18, agency: (d.agency || '').trim(), goals: (d.goals || '').trim().slice(0, 2000) };
      if (o.under18 && d.guardian) o.guardian = { name: (d.guardian.name || '').trim(), phone: (d.guardian.phone || '').trim(), email: (d.guardian.email || '').trim(), consent: !!d.guardian.consent };
      return o;
    }

    async function startCheckout(b, kind, amountCents, c) {
      var sur = C.surchargeCents(amountCents, c.settings);
      var labels = { deposit: '25% deposit', full: 'Paid in full', balance: 'Remaining balance', redeposit: 'New deposit' };
      var res = await io.checkout({ booking: b, kind: kind, amountCents: amountCents, surchargeCents: sur, surchargeLabel: c.settings.surcharge.label,
        description: b.offerName + ' — ' + C.fmtDate(b.startMs, true) + ' ' + C.fmtTime(b.startMs) + ' (' + labels[kind] + ')',
        successUrl: siteUrl + '#/done/' + b.token, cancelUrl: siteUrl + '#/manage/' + b.token });
      await store.savePayment({ id: res.id, bookingId: b.id, kind: kind, amountCents: amountCents, surchargeCents: sur, status: 'open', createdAt: now() });
      return { id: res.id, url: res.url || null, demo: !!res.demo, amountCents: amountCents, surchargeCents: sur, kind: kind };
    }

    /** Called by the Stripe webhook (live) or the pretend checkout (demo). Safe to call twice. */
    async function paymentSucceeded(sessionId, ref) {
      var pay = await store.getPayment(sessionId);
      if (!pay) err('Unknown payment', 'not_found');
      if (pay.status === 'paid') return { already: true };
      pay.status = 'paid'; pay.paidAt = now(); pay.ref = ref || null;
      await store.savePayment(pay);
      var c = await ctx(), b = await store.getBooking(pay.bookingId);
      b.paidCents += pay.amountCents; b.surchargeCents += pay.surchargeCents;
      (b.payments = b.payments || []).push({ id: sessionId, kind: pay.kind, amountCents: pay.amountCents, surchargeCents: pay.surchargeCents, at: now(), ref: ref || null });
      var label = { deposit: 'Deposit', full: 'Full payment', balance: 'Balance', redeposit: 'New deposit' }[pay.kind];
      hist(b, 'payment', label + ' paid by card: ' + C.money(pay.amountCents) + (pay.surchargeCents ? ' + ' + C.money(pay.surchargeCents) + ' card fee' : ''));
      if (pay.kind === 'deposit' || pay.kind === 'full') {
        if (b.status === 'expired') { // paid after the hold ran out — keep it, but check for clashes
          var clash = await assertFree(b.startMs, b.durationMin, c.settings, b.id, true);
          b.status = 'held'; if (clash) { b.flags.needsAttention = true; hist(b, 'clash', 'Paid after the hold expired and now overlaps ' + clash + ' — please check'); }
        }
        if (b.status === 'held') { b.status = 'confirmed'; delete b.holdExpiresMs; await store.saveBooking(b); await afterConfirmed(b, c); }
        else await store.saveBooking(b);
      } else if (pay.kind === 'redeposit') {
        b.status = 'confirmed'; delete b.holdExpiresMs; await store.saveBooking(b);
        await syncCalendars(b, c); await sendEmail('reschedule', b, c);
        await updateClient(b, { ticks: { depositPaid: true } });
      } else { // balance
        if (C.ledger(b).balanceCents === 0) hist(b, 'paid_up', 'All paid up');
        await store.saveBooking(b);
      }
      return { ok: true };
    }

    async function afterConfirmed(b, c) {
      await syncCalendars(b, c);
      await updateClient(b, { stage: 'Booked', ticks: { booked: true, depositPaid: b.paidCents > 0 } }, true);
      await sendEmail('confirmation', b, c);
      if (b.location && b.location.type === 'unsure') await sendEmail('location_help', b, c);
      await sendEmail('alert_new', b, c);
      b.flags = b.flags || {}; b.flags.confirmedAt = now();
      await store.saveBooking(b);
    }

    async function syncCalendars(b, c) {
      if (!io.calendarUpsert) return;
      try {
        var off = offerById(c, b.offerId) || {};
        var r = await io.calendarUpsert(b, off, c.settings);
        if (r) { if (r.gcalId) b.gcalId = r.gcalId; if (r.icalUid) b.icalUid = r.icalUid; if (r.errors && r.errors.length) hist(b, 'calendar_error', r.errors.join('; ')); }
        await store.saveBooking(b);
      } catch (x) { hist(b, 'calendar_error', String(x.message || x)); await store.saveBooking(b); }
    }
    async function removeCalendars(b) { if (io.calendarDelete) try { await io.calendarDelete(b); } catch (x) { hist(b, 'calendar_error', String(x.message || x)); } }

    /* ---------- Shared client list (Contact Sheet) ---------- */
    async function updateClient(b, patch, isNewBooking) {
      var d = b.details || {};
      var cl = await store.upsertClient({ email: d.email, name: d.name, phone: d.phone, instagram: d.instagram, agency: d.agency, goals: d.goals,
        guardian: d.under18 ? d.guardian : null, source: b.createdBy === 'admin' ? 'Booked by Madi' : 'Booking site' }, function (cur) {
        cur.ticks = Object.assign({}, cur.ticks || {}, patch.ticks || {});
        if (patch.stage) cur.stage = patch.stage;
        cur.package = b.offerName;
        cur.bookingIds = (cur.bookingIds || []).filter(function (x) { return x !== b.id; }).concat([b.id]);
        cur.lastBookingMs = b.startMs;
        if (isNewBooking && d.notes) cur.theirMessage = (cur.theirMessage ? cur.theirMessage + '\n\n' : '') + '[' + C.fmtDate(now(), true) + ' booking] ' + d.notes;
        if (patch.note) cur.activity = (cur.activity || []).concat([{ at: now(), text: patch.note }]);
        return cur;
      });
      if (cl && cl.id && b.clientId !== cl.id) { b.clientId = cl.id; await store.saveBooking(b); }
    }

    /* ---------- Client manage page ---------- */
    function view(b, c) {
      var L = C.ledger(b), s = c.settings;
      return { id: b.id, token: b.token, status: b.status, offerId: b.offerId, offerName: b.offerName, startMs: b.startMs, endMs: b.endMs, durationMin: b.durationMin,
        lines: b.lines, totalCents: b.totalCents, depositCents: b.depositCents, paidCents: L.creditCents, balanceCents: L.balanceCents, payOption: b.payOption,
        retouched: b.retouched, rescheduleCount: b.rescheduleCount, reschedulesLeft: C.reschedulesLeft(b, s), leftLine: C.leftLine(C.reschedulesLeft(b, s), s),
        location: b.location, firstName: (b.details.name || '').split(' ')[0], email: b.details.email, holdExpiresMs: b.holdExpiresMs,
        refundPendingCents: b.refundPendingCents, forfeitedCents: b.forfeitedCents, refundedCents: b.refundedCents, sel: b.sel };
    }
    async function getByToken(tok) {
      var b = await store.getBookingByToken(tok);
      if (!b) err('We couldn\'t find that booking. Check the link in your confirmation email.', 'not_found');
      var c = await ctx(), t = now();
      var v = view(b, c);
      if (b.status === 'confirmed' && b.startMs > t) {
        v.preview = { cancel: C.evaluateChange(b, 'cancel', t, c.settings), reschedule: C.evaluateChange(b, 'reschedule', t, c.settings) };
      }
      v.bankDetails = v.balanceCents ? c.settings.bankDetails : null;
      return v;
    }
    async function clientChange(tok, p) { // {action:'cancel'|'reschedule', reason, newStartMs}
      var b = await store.getBookingByToken(tok); if (!b) err('Booking not found', 'not_found');
      if (b.status !== 'confirmed') err('This booking can\'t be changed online right now — please email me.');
      var reason = (p.reason || '').trim();
      if (reason.length < 3) err('Please tell me a little about why you\'re making this change.');
      var c = await ctx(), s = c.settings, t = now();
      if (b.startMs <= t) err('This shoot has already started — please contact me directly.');
      var ev = C.evaluateChange(b, p.action, t, s); ev.reason = reason;
      if (p.action === 'cancel') {
        b.status = 'cancelled'; b.cancelledAt = t;
        b.forfeitedCents += ev.keepCents; b.refundPendingCents = ev.refundCents;
        hist(b, 'cancelled', 'Cancelled by client ' + C.hoursPhrase(ev.hoursUntil) + ' before', { reason: reason, keepCents: ev.keepCents, refundCents: ev.refundCents });
        b.flags.needsAttention = ev.refundCents > 0 || ev.urgent;
        await store.saveBooking(b); await removeCalendars(b);
        await updateClient(b, { stage: 'Cancelled', ticks: { booked: false }, note: 'Cancelled: "' + reason + '"' });
        if (ev.urgent) await sendEmail('alert_urgent', b, c, ev, { priority: true });
        else if (ev.refundCents > 0) await sendEmail('alert_refund', b, c, ev, { priority: true });
        if (!ev.refundCents) await sendEmail('cancellation', b, c, ev);
        return { ok: true, result: ev, booking: view(b, c) };
      }
      // reschedule
      if (!p.newStartMs) err('Pick a new date and time.');
      await assertFree(p.newStartMs, b.durationMin, s, b.id);
      var old = b.startMs;
      b.startMs = p.newStartMs; b.endMs = p.newStartMs + b.durationMin * C.MIN;
      b.flags.balanceInvoiceAt = null; b.flags.reminderAt = null;
      if (ev.countsToward) b.rescheduleCount += 1;
      var moved = 'Rescheduled by client from ' + C.fmtDate(old, true) + ' ' + C.fmtTime(old) + ' to ' + C.fmtDate(b.startMs, true) + ' ' + C.fmtTime(b.startMs);
      if (!ev.penalty) {
        hist(b, 'rescheduled', moved + ' (free, ' + b.rescheduleCount + ' of ' + s.freeReschedules + ')', { reason: reason });
        await store.saveBooking(b); await syncCalendars(b, c);
        await sendEmail('reschedule', b, c, ev);
        await updateClient(b, { note: 'Rescheduled: "' + reason + '"' });
        return { ok: true, result: ev, booking: view(b, c) };
      }
      b.forfeitedCents += ev.keepCents; b.status = 'pending_redeposit';
      b.holdExpiresMs = null; b.flags.needsAttention = true;
      hist(b, 'rescheduled', moved + ' — deposit of ' + C.money(ev.keepCents) + ' kept; new deposit needed', { reason: reason, keepCents: ev.keepCents });
      await store.saveBooking(b); await syncCalendars(b, c);
      await sendEmail('alert_urgent', b, c, ev, { priority: true });
      await sendEmail('redeposit', b, c, ev);
      await updateClient(b, { ticks: { depositPaid: false }, note: 'Late/over-limit reschedule: "' + reason + '"' });
      var co = await startCheckout(b, 'redeposit', b.depositCents, c);
      return { ok: true, result: ev, booking: view(b, c), checkout: co };
    }
    async function payLink(tok) {
      var b = await store.getBookingByToken(tok); if (!b) err('Booking not found', 'not_found');
      var c = await ctx(), L = C.ledger(b);
      if (b.status === 'pending_redeposit') return { checkout: await startCheckout(b, 'redeposit', b.depositCents, c) };
      if (b.status === 'held') return { checkout: await startCheckout(b, b.payOption === 'full' ? 'full' : 'deposit', b.payOption === 'full' ? b.totalCents : b.depositCents, c) };
      if (b.status !== 'confirmed' || !L.balanceCents) err('There\'s nothing to pay on this booking right now.');
      return { checkout: await startCheckout(b, 'balance', L.balanceCents, c) };
    }

    /* ---------- Scheduled jobs (hourly) ---------- */
    async function hourly() {
      var c = await ctx(), s = c.settings, t = now(), out = { expired: 0, invoices: 0, reminders: 0, completed: 0 };
      var list = await store.bookingsBetween(t - 3 * C.DAY, t + s.maxDaysAhead * C.DAY + 30 * C.DAY, ['held', 'confirmed']);
      for (var i = 0; i < list.length; i++) {
        var b = list[i];
        if (b.status === 'held' && b.holdExpiresMs && b.holdExpiresMs < t) { b.status = 'expired'; hist(b, 'expired', 'Payment not completed — time released'); await store.saveBooking(b); out.expired++; continue; }
        if (b.status !== 'confirmed') continue;
        b.flags = b.flags || {};
        if (b.endMs < t) { b.status = 'completed'; await store.saveBooking(b); await updateClient(b, { stage: 'Past Clients' }); out.completed++; continue; }
        var L = C.ledger(b);
        if (L.balanceCents > 0 && !b.flags.balanceInvoiceAt && b.startMs - s.balanceDueDaysBefore * C.DAY <= t) {
          await sendEmail('balance_invoice', b, c); b.flags.balanceInvoiceAt = t; hist(b, 'invoice', '2nd invoice drafted'); await store.saveBooking(b); out.invoices++;
        }
        if (!b.flags.reminderAt && b.startMs - s.reminderHoursBefore * C.HOUR <= t) {
          await sendEmail('reminder', b, c); b.flags.reminderAt = t; await store.saveBooking(b); out.reminders++;
        }
      }
      return out;
    }

    /* ---------- Admin ---------- */
    var admin = {
      overview: async function () {
        var c = await ctx(), t = now();
        var all = await store.listBookings({});
        var upcoming = all.filter(function (b) { return ACTIVE.indexOf(b.status) >= 0 && b.endMs > t && !(b.status === 'held' && b.holdExpiresMs < t); }).sort(function (a, b) { return a.startMs - b.startMs; });
        var outbox = await store.listOutbox(40);
        return { settings: c.settings, offers: c.offers, locations: c.locations, templates: c.templates,
          bookings: all.sort(function (a, b) { return b.startMs - a.startMs; }), upcomingIds: upcoming.map(function (b) { return b.id; }),
          blocks: await store.listBlocks(t - 30 * C.DAY, t + 400 * C.DAY), outbox: outbox, clients: await store.listClients(), now: t };
      },
      calendarBusy: async function (fromMs, toMs) { return io.busy ? io.busy(fromMs, toMs).catch(function () { return []; }) : []; },
      createBooking: async function (p) { // {offerId, startMs, durationMin, totalCents, paidCents, details, location, notifyClient, note}
        var c = await ctx(), s = c.settings, offer = offerById(c, p.offerId); if (!offer) err('Pick an offer.');
        var d = cleanDetails(p.details || {}); if (!d.name) err('Add the client\'s name.');
        var dur = +p.durationMin || offer.durationMin;
        var clash = await assertFree(p.startMs, dur, s, null, true);
        var total = p.totalCents != null ? +p.totalCents : offer.priceCents;
        var b = { id: C.token(16), token: C.token(28), offerId: offer.id, offerName: offer.name, status: 'confirmed', createdBy: 'admin', createdAt: now(),
          startMs: p.startMs, endMs: p.startMs + dur * C.MIN, durationMin: dur, bufferBeforeMin: s.bufferBeforeMin, bufferAfterMin: s.bufferAfterMin,
          sel: {}, lines: [{ id: 'base', label: offer.name + (total !== offer.priceCents ? ' (custom price)' : ''), cents: total }], totalCents: total,
          depositCents: Math.round(total * s.depositPercent / 100), retouched: p.retouched != null ? +p.retouched : offer.retouched,
          payOption: 'deposit', paidCents: +p.paidCents || 0, surchargeCents: 0, forfeitedCents: 0, refundedCents: 0, refundPendingCents: 0, rescheduleCount: 0,
          location: p.location || { type: 'unsure' }, details: d, history: [], flags: {} };
        hist(b, 'created', 'Booked by you' + (clash ? ' (overlaps ' + clash + ')' : '') + (b.paidCents ? ' — ' + C.money(b.paidCents) + ' already paid' : ''));
        await store.saveBooking(b);
        await syncCalendars(b, c);
        await updateClient(b, { stage: 'Booked', ticks: { booked: true, depositPaid: b.paidCents > 0 } }, true);
        if (p.notifyClient !== false && d.email) await sendEmail('confirmation', b, c);
        return { booking: b, clash: clash };
      },
      reschedule: async function (id, startMs, notify) {
        var c = await ctx(), b = await store.getBooking(id); if (!b) err('Not found', 'not_found');
        var clash = await assertFree(startMs, b.durationMin, c.settings, b.id, true);
        var old = b.startMs; b.startMs = startMs; b.endMs = startMs + b.durationMin * C.MIN; b.flags.balanceInvoiceAt = null; b.flags.reminderAt = null;
        hist(b, 'rescheduled', 'Moved by you from ' + C.fmtDate(old, true) + ' ' + C.fmtTime(old) + ' (no penalty)' + (clash ? ' — overlaps ' + clash : ''));
        await store.saveBooking(b); await syncCalendars(b, c);
        if (notify !== false) await sendEmail('reschedule', b, c);
        return { booking: b, clash: clash };
      },
      cancel: async function (id, opts3) { // {refundCents, keepCents, notify, reason}
        var c = await ctx(), b = await store.getBooking(id); if (!b) err('Not found', 'not_found');
        b.status = 'cancelled'; b.cancelledAt = now();
        hist(b, 'cancelled', 'Cancelled by you' + (opts3.reason ? ': ' + opts3.reason : ''));
        await store.saveBooking(b); await removeCalendars(b);
        await updateClient(b, { stage: 'Cancelled', ticks: { booked: false } });
        var refund = +opts3.refundCents || 0;
        if (refund > 0) return admin.refund(id, refund, opts3.notify);
        if (opts3.notify !== false) await sendEmail('cancellation', b, c, { action: 'cancel', keepCents: 0, refundCents: 0 });
        return { booking: b };
      },
      refund: async function (id, cents, notify) { // approve a pending refund, or refund any amount
        var c = await ctx(), b = await store.getBooking(id); if (!b) err('Not found', 'not_found');
        cents = Math.round(+cents || 0);
        var maxRefund = b.paidCents - b.refundedCents;
        if (cents < 0 || cents > maxRefund) err('You can refund between $0 and ' + C.money(maxRefund) + '.');
        var pending = b.refundPendingCents || 0;
        if (cents > 0) {
          var r = await io.refund(b, cents) || {};
          b.refundedCents += cents;
          if (r.perPayment) (b.payments || []).forEach(function (p) { if (r.perPayment[p.id]) p.refundedCents = (p.refundedCents || 0) + r.perPayment[p.id]; });
          hist(b, 'refund', 'Refunded ' + C.money(cents) + (r.manualCents ? ' — ' + C.money(r.manualCents) + ' of it was paid by bank transfer, so send that back yourself' : ' to their card') + (pending && cents !== pending ? ' (policy said ' + C.money(pending) + ')' : ''), { providerId: r.id });
        } else hist(b, 'refund', 'Decided not to refund' + (pending ? ' (policy said ' + C.money(pending) + ')' : ''));
        if (pending) { // whatever of the pending amount isn't refunded is kept
          var keptExtra = Math.max(0, pending - cents); b.forfeitedCents += keptExtra; b.refundPendingCents = 0;
          b.forfeitedCents = Math.max(0, b.forfeitedCents - Math.max(0, cents - pending));
        } else b.forfeitedCents = Math.max(0, b.forfeitedCents - Math.min(cents, b.forfeitedCents));
        b.flags.needsAttention = false;
        await store.saveBooking(b);
        if (b.status === 'cancelled' && notify !== false) await sendEmail('cancellation', b, c, { action: 'cancel', refundCents: cents, keepCents: b.forfeitedCents });
        return { booking: b };
      },
      markPaid: async function (id, cents, method) {
        var b = await store.getBooking(id); if (!b) err('Not found', 'not_found');
        cents = Math.round(+cents || 0); if (cents <= 0) err('Enter the amount received.');
        b.paidCents += cents; (b.payments = b.payments || []).push({ id: 'manual-' + C.token(6), kind: 'manual', method: method || 'bank transfer', amountCents: cents, surchargeCents: 0, at: now() });
        if (b.status === 'pending_redeposit') { b.status = 'confirmed'; }
        hist(b, 'payment', C.money(cents) + ' received by ' + (method || 'bank transfer'));
        await store.saveBooking(b);
        await updateClient(b, { ticks: { depositPaid: true } });
        return { booking: b };
      },
      updateBooking: async function (id, patch) { // notes, location, flags, status completed, custom total
        var c = await ctx(), b = await store.getBooking(id); if (!b) err('Not found', 'not_found');
        if (patch.location) b.location = patch.location;
        if (patch.adminNotes != null) b.adminNotes = patch.adminNotes;
        if (patch.totalCents != null) { b.totalCents = +patch.totalCents; hist(b, 'edited', 'Total changed to ' + C.money(b.totalCents)); }
        if (patch.status === 'completed') { b.status = 'completed'; await updateClient(b, { stage: 'Past Clients', ticks: { shot: true } }); }
        if (patch.clearAttention) b.flags.needsAttention = false;
        await store.saveBooking(b);
        if (patch.location) await syncCalendars(b, c);
        return { booking: b };
      },
      redraftEmail: async function (id, key) { var c = await ctx(), b = await store.getBooking(id); await sendEmail(key, b, c); return { ok: true }; },
      saveSettings: async function (s) { var cur = await store.getSettings(); var n = Object.assign({}, cur, s); await store.saveSettings(n); return n; },
      saveOffer: async function (o) { await store.saveOffer(o); return o; },
      deleteOffer: async function (id) { await store.deleteOffer(id); return { ok: true }; },
      saveLocation: async function (l) { if (!l.id) l.id = C.token(8); await store.saveLocation(l); return l; },
      deleteLocation: async function (id) { await store.deleteLocation(id); return { ok: true }; },
      saveTemplate: async function (key, t) { await store.saveTemplate(key, t); return t; },
      saveBlock: async function (bl) { if (!bl.id) bl.id = C.token(10); await store.saveBlock(bl); return bl; },
      deleteBlock: async function (id) { await store.deleteBlock(id); return { ok: true }; },
      saveClient: async function (cl) { await store.saveClient(cl); return cl; },
      previewEmail: async function (key, id, tpl) {
        var c = await ctx(), b = id ? await store.getBooking(id) : null;
        if (!b) b = sampleBooking(c);
        if (tpl) c.templates = Object.assign({}, c.templates, (function () { var o = {}; o[key] = Object.assign({}, c.templates[key], tpl); return o; })());
        return C.renderEmail(key, b, Object.assign({}, c, { offer: offerById(c, b.offerId), change: { action: 'cancel', late: true, hoursUntil: 14, keepCents: b.depositCents, refundCents: 0, reason: 'Example reason' } }));
      },
      runHourly: hourly
    };
    function sampleBooking(c) {
      var o = c.offers.filter(function (x) { return x.id === 'headshots'; })[0] || c.offers[0];
      var st = C.sydToUtc(C.addDays(C.ymdOf(now()), 10), 600);
      return { id: 'sample', token: 'sample-link', offerId: o.id, offerName: o.name, startMs: st, endMs: st + o.durationMin * C.MIN, durationMin: o.durationMin,
        lines: [{ id: 'base', label: o.name, cents: o.priceCents }], totalCents: o.priceCents, depositCents: Math.round(o.priceCents * c.settings.depositPercent / 100),
        paidCents: Math.round(o.priceCents * c.settings.depositPercent / 100), forfeitedCents: 0, refundedCents: 0, refundPendingCents: 0, rescheduleCount: 1, retouched: o.retouched,
        location: { type: 'saved', id: 'chatswood', name: 'Chatswood Interchange' }, details: { name: 'Ella Example', email: 'ella@example.com', phone: '0412 345 678', instagram: '@ella' } };
    }

    return { publicConfig: publicConfig, slots: slots, createBooking: createBooking, paymentSucceeded: paymentSucceeded, getByToken: getByToken,
      clientChange: clientChange, payLink: payLink, hourly: hourly, admin: admin };
  }

  root.MCengine = { createEngine: createEngine };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MCengine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
