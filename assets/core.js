/* Madi Crasti Photography — shared booking rules.
 * Used by the website (assets/core.js) AND the back office (supabase/functions/_shared/core.js).
 * Keep the two copies identical: run `python3 tools/sync_core.py` after editing.
 * Everything here is plain JS with no dependencies. All money is in cents. All times are
 * UTC milliseconds internally and shown in Sydney time (Australia/Sydney, DST handled).
 */
(function (root) {
  'use strict';
  var TZ = 'Australia/Sydney';
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var HOUR = 3600000, MIN = 60000, DAY = 86400000;

  var dtf = new Intl.DateTimeFormat('en-AU', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short'
  });

  /* ---------- Sydney time ---------- */
  function parts(ms) {
    var o = {};
    dtf.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
    var hh = +o.hour; if (hh === 24) hh = 0;
    return { y: +o.year, m: +o.month, d: +o.day, hh: hh, mm: +o.minute, dow: DOW.indexOf(o.weekday) };
  }
  function offsetMin(ms) {
    var p = parts(ms);
    return (Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm) - Math.floor(ms / MIN) * MIN) / MIN;
  }
  /** Sydney wall-clock (ymd + minutes after midnight) -> UTC ms */
  function sydToUtc(ymd, minutes) {
    var a = ymd.split('-').map(Number);
    var guess = Date.UTC(a[0], a[1] - 1, a[2], 0, minutes || 0);
    var t = guess - offsetMin(guess) * MIN;
    return guess - offsetMin(t) * MIN;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymdOf(ms) { var p = parts(ms); return p.y + '-' + pad(p.m) + '-' + pad(p.d); }
  function minutesOf(ms) { var p = parts(ms); return p.hh * 60 + p.mm; }
  function addDays(ymd, n) {
    var a = ymd.split('-').map(Number);
    var t = new Date(Date.UTC(a[0], a[1] - 1, a[2] + n));
    return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate());
  }
  function dowOf(ymd) { var a = ymd.split('-').map(Number); return new Date(Date.UTC(a[0], a[1] - 1, a[2])).getUTCDay(); }
  function fmtTime(ms) {
    var p = parts(ms), h = p.hh % 12 || 12;
    return h + (p.mm ? ':' + pad(p.mm) : '') + (p.hh < 12 ? 'am' : 'pm');
  }
  function fmtMinutes(min) { return fmtTime(sydToUtc('2026-01-05', min)); }
  function fmtDateYmd(ymd, short) {
    var a = ymd.split('-').map(Number), dw = dowOf(ymd);
    return short ? DAY_NAMES[dw].slice(0, 3) + ' ' + a[2] + ' ' + MONTHS[a[1] - 1].slice(0, 3)
      : DAY_NAMES[dw] + ' ' + a[2] + ' ' + MONTHS[a[1] - 1] + ' ' + a[0];
  }
  function fmtDate(ms, short) { return fmtDateYmd(ymdOf(ms), short); }
  function fmtDuration(min) {
    var h = Math.floor(min / 60), m = min % 60;
    return (h ? h + (h === 1 ? ' hr' : ' hrs') : '') + (h && m ? ' ' : '') + (m ? m + ' min' : '');
  }
  function money(cents, opts) {
    var neg = cents < 0; cents = Math.abs(Math.round(cents || 0));
    var d = Math.floor(cents / 100), c = cents % 100;
    var s = '$' + String(d).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (c || (opts && opts.always) ? '.' + pad(c) : '');
    return neg ? '-' + s : s;
  }

  /* ---------- Defaults (starting settings, editable in admin) ---------- */
  var DEFAULT_SETTINGS = {
    businessName: 'Madi Crasti Photography',
    adminEmail: 'madicrasti@gmail.com',
    replyToEmail: 'madicrasti@gmail.com',
    phone: '0447 264 204',
    instagram: '@mads.crasti',
    // Weekly hours: minutes after midnight. Bookable every day 9–5 (buffers must fit inside).
    hours: {
      0: { on: true, start: 540, end: 1020 }, 1: { on: true, start: 540, end: 1020 },
      2: { on: true, start: 540, end: 1020 }, 3: { on: true, start: 540, end: 1020 },
      4: { on: true, start: 540, end: 1020 }, 5: { on: true, start: 540, end: 1020 },
      6: { on: true, start: 540, end: 1020 }
    },
    bufferBeforeMin: 60,
    bufferAfterMin: 60,
    slotStepMin: 30,
    minNoticeHours: 48,
    maxDaysAhead: 92,          // ~3 months
    holdMinutes: 30,          // matches Stripe's minimum checkout expiry
    depositPercent: 25,
    cutoffHours: 24,
    freeReschedules: 3,
    balanceDueDaysBefore: 7,
    reminderHoursBefore: 48,
    surcharge: { enabled: true, percent: 1.7, fixedCents: 30, label: 'Card processing fee' },
    bankDetails: 'Account name: Madi Crasti\nBSB: 000-000\nAccount: 00000000\nReference: your name + shoot date',
    emailsNeedApproval: true,   // every client email lands in Gmail Drafts until switched off per template
    googleCalendarId: 'primary',
    icloudCalendarName: 'Shoots'
  };

  var AD = {
    retouch: function () { return { id: 'retouch', label: 'Extra retouched photos', type: 'qty', unitCents: 2000, unitLabel: 'per photo', max: 30, extraMin: 0 }; },
    hour: function () { return { id: 'hour', label: 'Additional hour', type: 'qty', unitCents: 15000, unitLabel: 'per hour', max: 2, extraMin: 60 }; },
    loc2: function (c) { return { id: 'loc2', label: '2nd location', type: 'toggle', unitCents: c, extraMin: 0 }; },
    studio: function (c) { return { id: 'studio', label: 'Studio hire', type: 'toggle', unitCents: c, extraMin: 0, note: 'I book the studio for you — search for it as your location.' }; }
  };
  var PIX = 'https://images-pw.pixieset.com/site/gxmbWa/';
  var DEFAULT_OFFERS = [
    { id: 'confidence-mini', name: 'Confidence Mini', tagline: 'A short, guided first shoot', priceCents: 20000, durationMin: 30, retouched: 2,
      includes: ['Professional photo session with full direction and posing guidance', 'Any location around Sydney', 'Full gallery of edited images to choose from, with your selected retouched finals'],
      addons: [AD.retouch()], image: PIX + 'omArvb/DSCF4401-3a20a0b1-1500.jpg', isPrivate: false, active: true, sort: 1 },
    { id: 'downtown-edit', name: 'The Downtown Edit', tagline: 'Editorial, cinematic, city-led', priceCents: 35000, durationMin: 60, retouched: 4,
      includes: ['Professional editorial session with full direction and posing guidance', 'Any location around Sydney', 'Full gallery of edited images to choose from, with your selected retouched finals'],
      addons: [AD.retouch(), AD.hour(), AD.loc2(5000), AD.studio(20000)], image: PIX + '8Dq561/TheDowntownEdit-3-8e861baa-1500.jpg', isPrivate: false, active: true, sort: 2 },
    { id: 'headshots', name: 'Headshots', tagline: 'Agency and casting ready', priceCents: 35000, durationMin: 60, retouched: 4,
      includes: ['Professional headshot session with full direction and posing guidance', 'Multiple looks and backdrops around Sydney', 'Full gallery of edited images to choose from, with your selected retouched headshots'],
      addons: [AD.retouch(), AD.hour(), AD.loc2(5000), AD.studio(20000)], image: PIX + 'Rz4r7O/Ella110126-17-f07ff066-1500.jpg', isPrivate: false, active: true, sort: 3 },
    { id: 'portfolio', name: 'Portfolio', tagline: 'Build the book that gets you signed', priceCents: 37500, durationMin: 60, retouched: 6,
      includes: ['Professional portfolio session with full direction and posing guidance', 'Multiple looks and backdrops around Sydney', 'Full gallery of edited images to choose from, with your selected retouched finals'],
      addons: [AD.retouch(), AD.hour(), AD.loc2(5000), AD.studio(20000)], image: PIX + 'X0W4X7/BrendonStone_210826-27-317f5015-1500.jpg', isPrivate: false, active: true, sort: 4 },
    { id: 'combo', name: 'Combo', tagline: 'Headshots and portfolio in one', priceCents: 45000, durationMin: 120, retouched: 10,
      includes: ['Professional portfolio and headshot session with full direction and posing guidance', 'Multiple looks and backdrops around Sydney', 'Full gallery of edited images to choose from, with your selected retouched finals'],
      addons: [AD.retouch(), AD.hour(), AD.loc2(4000), AD.studio(30000)], image: PIX + '3rod8A/Sofia080326-25-ac8ce35e-1500.jpg', isPrivate: false, active: true, sort: 5 },
    { id: 'creator-collab', name: 'Creator Collab', tagline: 'Free shoot in exchange for posting and tagging', priceCents: 0, durationMin: 60, retouched: 4,
      includes: ['Around one per month, unless another comes up'], addons: [], image: PIX + 'ZGZzWp/City_corners-6-0ab8c932-1500.jpg', isPrivate: true, active: true, sort: 6 }
  ];

  var DEFAULT_LOCATIONS = [
    { id: 'town-hall', name: 'Sydney Town Hall', address: '483 George St, Sydney NSW 2000', lat: -33.8732, lon: 151.2066,
      details: 'THE SHOOT DETAILS\n📍 Meeting Point: Sydney Town Hall steps, 483 George St, Sydney NSW 2000\nI\'ll meet you on the Town Hall steps, and we\'ll walk to our shooting spots from there.\nGetting there:\n\n* By train/metro (easiest): Town Hall Station sits right underneath — T1, T2, T3, T4, T8 and T9 lines; follow the signs for George Street / Town Hall exit. On the Metro, Gadigal Station (Pitt St) is a 3-minute walk.\n* By light rail/bus: L2 and L3 light rail stop at Town Hall on George St, and most George St buses stop out front.\n* Driving/parking: Goulburn Street Car Park (111 Goulburn St) or the Queen Victoria Building car park are both a short walk. Give yourself 10 minutes to park and walk over.' },
    { id: 'barangaroo', name: 'Barangaroo', address: 'Barangaroo Ave, Barangaroo NSW 2000', lat: -33.8616, lon: 151.2019,
      details: 'THE SHOOT DETAILS\n📍 Meeting Point: Barangaroo House, 35 Barangaroo Ave, Barangaroo NSW 2000\nI\'ll meet you out the front of Barangaroo House, and we\'ll walk to our shooting spots from there.\nGetting there:\n\n* By metro (easiest): Barangaroo Station on the Sydney Metro is a 2-minute walk. By train, get off at Wynyard and take Wynyard Walk (about 6 minutes).\n* By ferry/bus: Barangaroo Wharf is right beside us; buses to Wynyard connect via Wynyard Walk.\n* Driving/parking: Barangaroo car park (entry via Hickson Rd) sits underneath the precinct. Give yourself 10 minutes to park and walk over.' },
    { id: 'chatswood', name: 'Chatswood Interchange', address: '436 Victoria Ave, Chatswood NSW 2067', lat: -33.7969, lon: 151.1803,
      details: 'THE SHOOT DETAILS\n📍 Meeting Point: Chatswood Interchange, 436 Victoria Ave, Chatswood NSW 2067\nI\'ll meet you at the Chatswood Interchange, and we\'ll walk to our shooting spots from there.\nGetting there:\n\n* By train/metro (easiest): the Interchange sits on top of Chatswood Station — T1 North Shore, T9 Northern Line and Sydney Metro; come up to the Victoria Avenue concourse level.\n* By bus: all Chatswood services terminate at the Interchange stands on Victoria Ave.\n* Driving/parking: 475 Victoria Ave (Secure Parking, entry via Brown Street) or 465 Victoria Ave (Interpark, undercover); Westfield Chatswood and Chatswood Chase car parks are a short walk away. Give yourself 10 minutes to park and walk over.' }
  ];

  var POLICY_SUMMARY = 'Cancel more than 24 hours before your shoot and you\'ll be refunded. Reschedule more than 24 hours out up to 3 times for free — your deposit moves with you. A 4th reschedule, or any cancel or reschedule within 24 hours, means your 25% deposit is kept (I\'ll have booked parking and set the time aside), and a new deposit is needed to lock in a new date.';

  var DEFAULT_TEMPLATES = {
    confirmation: { name: 'Booking confirmation', to: 'client', subject: 'You\'re booked in — {offer_name}, {shoot_date_short}',
      body: 'Hi {first_name},\n\nYay — you\'re officially booked in for {offer_name} on {shoot_date} at {shoot_time}! I can\'t wait to create with you.\n\nWHAT YOU\'VE BOOKED\n{offer_name} · {duration}\n{addons_list}\nRetouched images included: {retouched_count}\n\nPAYMENT\nTotal: {total}\nPaid so far: {amount_paid}\nBalance due: {balance_due}{balance_due_note}\n\n{shoot_details_block}\n\nNeed to change something? You can reschedule or cancel here: {manage_link}\n{reschedules_left_line}\n\nA quick note on changes: {policy_summary}\n\nSee you soon,\nMadi\n{business_name} · {instagram}' },
    balance_invoice: { name: '2nd invoice (balance)', to: 'client', subject: 'Your shoot is next week — balance for {offer_name}',
      body: 'Hi {first_name},\n\nYour {offer_name} shoot is one week away — {shoot_date} at {shoot_time}!\n\nHere\'s your 2nd invoice for the remaining balance of {balance_due}, due before the shoot. You can pay whichever way is easiest:\n\n1. Card via Stripe (a small card processing fee applies): {pay_link}\n2. Direct deposit (no fees):\n{bank_details}\n\n{shoot_details_block}\n\nAny questions, just reply to this email.\n\nMadi' },
    reminder: { name: 'Reminder (48 hours)', to: 'client', subject: 'See you in 2 days — {offer_name}',
      body: 'Hi {first_name},\n\nJust a reminder that we\'re shooting on {shoot_date} at {shoot_time}.\n\n{shoot_details_block}\n\nBring your outfits steamed and ready, and anything from your mood board you want to recreate. If anything\'s changed, let me know here: {manage_link}\n\nMadi' },
    reschedule: { name: 'Reschedule confirmation', to: 'client', subject: 'Your shoot has moved to {shoot_date_short}',
      body: 'Hi {first_name},\n\nAll done — your {offer_name} shoot is now on {shoot_date} at {shoot_time}. Your payment has moved across with you.\n\n{reschedules_left_line}\n\n{shoot_details_block}\n\nManage your booking: {manage_link}\n\nMadi' },
    redeposit: { name: 'New deposit needed', to: 'client', subject: 'One more step to lock in {shoot_date_short}',
      body: 'Hi {first_name},\n\nI\'ve held {shoot_date} at {shoot_time} for your {offer_name} shoot. As this change {penalty_reason}, your original deposit of {kept_amount} has been kept, as per the booking policy.\n\nTo lock in your new date, please pay the new deposit of {deposit} here: {pay_link}\n\nMadi' },
    cancellation: { name: 'Cancellation', to: 'client', subject: 'Your {offer_name} booking has been cancelled',
      body: 'Hi {first_name},\n\nYour {offer_name} shoot on {shoot_date} has been cancelled.\n\n{refund_line}\n\nI\'d love to shoot with you another time — you can book again whenever you\'re ready.\n\nMadi' },
    location_help: { name: '"Help me choose a location"', to: 'client', subject: 'Let\'s pick your shoot location',
      body: 'Hi {first_name},\n\nThanks for booking {offer_name} on {shoot_date}! You mentioned you\'d like help choosing a location — here are a few spots I think would suit your vibe:\n\n1. \n2. \n3. \n\nLet me know which one you love and I\'ll send through the full meeting details.\n\nMadi' },
    alert_urgent: { name: 'URGENT alert to you', to: 'admin', subject: 'URGENT — {change_type}: {full_name}, {shoot_date_short}',
      body: '{full_name} has made a {change_type} {hours_until} before their shoot.\n\nShoot: {offer_name}, {shoot_date} at {shoot_time}\nReason they gave: "{reason}"\n\nKept under the policy: {kept_amount}\nRefund waiting for your approval: {refund_pending}\n\nOpen the booking to approve or change the refund: {admin_link}' },
    alert_refund: { name: 'Refund to approve', to: 'admin', subject: 'Priority — refund to approve: {full_name}, {shoot_date_short}',
      body: '{full_name} cancelled their {offer_name} shoot on {shoot_date} ({hours_until} before).\n\nReason they gave: "{reason}"\nRefund due under the policy: {refund_pending}\n\nNothing has been refunded yet. Approve it (or change the amount) here: {admin_link}' },
    alert_new: { name: 'New booking notice', to: 'admin', subject: 'New booking — {full_name}, {offer_name}, {shoot_date_short}',
      body: 'New booking!\n\n{full_name} · {email} · {phone} · {ig}\n{offer_name} · {shoot_date} at {shoot_time} · {duration}\nLocation: {location_name}\nPaid: {amount_paid} ({pay_option}) · Balance: {balance_due}\nNotes: {notes}\n{guardian_line}\n\nThe confirmation email is waiting in your Gmail Drafts.\n{admin_link}' }
  };

  /* ---------- Pricing ---------- */
  function quote(offer, sel, settings) {
    settings = settings || DEFAULT_SETTINGS; sel = sel || {};
    var lines = [{ id: 'base', label: offer.name, cents: offer.priceCents }];
    var extraMin = 0;
    (offer.addons || []).forEach(function (a) {
      var q = a.type === 'qty' ? Math.max(0, Math.min(a.max || 99, parseInt(sel[a.id], 10) || 0)) : (sel[a.id] ? 1 : 0);
      if (!q) return;
      lines.push({ id: a.id, label: a.type === 'qty' ? a.label + ' × ' + q : a.label, qty: q, cents: a.unitCents * q });
      extraMin += (a.extraMin || 0) * q;
    });
    var total = lines.reduce(function (s, l) { return s + l.cents; }, 0);
    return {
      lines: lines, totalCents: total,
      depositCents: Math.round(total * settings.depositPercent / 100),
      durationMin: offer.durationMin + extraMin,
      retouched: offer.retouched + (parseInt(sel.retouch, 10) || 0)
    };
  }
  /** Fee added on top so that after Stripe's cut you still receive `amountCents`. */
  function surchargeCents(amountCents, settings) {
    var s = (settings || DEFAULT_SETTINGS).surcharge;
    if (!s || !s.enabled || amountCents <= 0) return 0;
    var p = s.percent / 100;
    return Math.round((amountCents + s.fixedCents) / (1 - p) - amountCents);
  }

  /* ---------- Availability ---------- */
  function overlaps(a0, a1, b0, b1) { return a0 < b1 && b0 < a1; }
  function dayWindow(ymd, settings) {
    var h = settings.hours[dowOf(ymd)];
    if (!h || !h.on) return null;
    return [sydToUtc(ymd, h.start), sydToUtc(ymd, h.end)];
  }
  /**
   * Bookable start times for one Sydney day.
   * bookings: [{startMs, endMs, bufferBeforeMin, bufferAfterMin}] (confirmed + held)
   * busy: [{startMs, endMs}] — time off + Google/iCloud events (hard blocks, no buffer of their own)
   * Rules: shoot + buffers fit inside working hours; buffers never overlap another shoot or a
   * busy block; the shoot never overlaps another booking's buffers; ≥ minNotice and ≤ maxDaysAhead.
   */
  function daySlots(o) {
    var s = o.settings, win = dayWindow(o.ymd, s);
    if (!win) return [];
    var bb = s.bufferBeforeMin * MIN, ba = s.bufferAfterMin * MIN, dur = o.durationMin * MIN, step = s.slotStepMin * MIN;
    var earliest = o.nowMs + s.minNoticeHours * HOUR, latest = o.nowMs + s.maxDaysAhead * DAY;
    var out = [];
    for (var st = win[0] + bb; st + dur + ba <= win[1]; st += step) {
      if (st < earliest || st > latest) continue;
      if (conflicts(st, st + dur, s.bufferBeforeMin, s.bufferAfterMin, o.bookings, o.busy)) continue;
      out.push(st);
    }
    return out;
  }
  function conflicts(st, en, bbMin, baMin, bookings, busy, ignoreId) {
    var n0 = st - bbMin * MIN, n1 = en + baMin * MIN, i;
    for (i = 0; i < (busy || []).length; i++) if (overlaps(n0, n1, busy[i].startMs, busy[i].endMs)) return busy[i].label || 'busy';
    for (i = 0; i < (bookings || []).length; i++) {
      var b = bookings[i]; if (ignoreId && b.id === ignoreId) continue;
      var b0 = b.startMs - (b.bufferBeforeMin || 0) * MIN, b1 = b.endMs + (b.bufferAfterMin || 0) * MIN;
      if (overlaps(n0, n1, b.startMs, b.endMs) || overlaps(st, en, b0, b1)) return 'booking';
    }
    return false;
  }
  function rangeSlots(o) { // {fromYmd, days, ...daySlots args} -> {ymd: [ms]}
    var res = {};
    for (var i = 0; i < o.days; i++) {
      var ymd = addDays(o.fromYmd, i);
      res[ymd] = daySlots({ ymd: ymd, durationMin: o.durationMin, settings: o.settings, bookings: o.bookings, busy: o.busy, nowMs: o.nowMs });
    }
    return res;
  }

  /* ---------- Money on a booking ---------- */
  function ledger(b) {
    var credit = (b.paidCents || 0) - (b.forfeitedCents || 0) - (b.refundedCents || 0) - (b.refundPendingCents || 0);
    return { creditCents: Math.max(0, credit), balanceCents: Math.max(0, (b.totalCents || 0) - Math.max(0, credit)) };
  }

  /* ---------- Cancellation / reschedule policy ---------- */
  function hoursUntil(b, nowMs) { return (b.startMs - nowMs) / HOUR; }
  /**
   * What happens if the client makes this change now.
   * Returns { late, penalty, keepCents, refundCents, newDepositCents, countsToward, urgent, leftAfter, headline }
   */
  function evaluateChange(b, action, nowMs, settings) {
    var s = settings || DEFAULT_SETTINGS, hrs = hoursUntil(b, nowMs), late = hrs < s.cutoffHours;
    var credit = ledger(b).creditCents, deposit = b.depositCents || 0;
    var used = b.rescheduleCount || 0, free = s.freeReschedules;
    if (action === 'cancel') {
      if (!late) return { action: action, late: false, penalty: false, keepCents: 0, refundCents: credit, urgent: false, priority: credit > 0, hoursUntil: hrs,
        headline: credit ? 'You\'ll be refunded ' + money(credit) + '.' : 'Your booking will be cancelled.' };
      var keep = Math.min(deposit, credit);
      return { action: action, late: true, penalty: true, keepCents: keep, refundCents: credit - keep, urgent: true, hoursUntil: hrs,
        headline: 'This is within ' + s.cutoffHours + ' hours of your shoot, so your ' + money(keep) + ' deposit is kept' + (credit - keep ? ' and ' + money(credit - keep) + ' will be refunded.' : '.') };
    }
    // reschedule
    if (late) return { action: action, late: true, penalty: true, keepCents: Math.min(deposit, credit), refundCents: 0, newDepositCents: deposit, countsToward: false, urgent: true, hoursUntil: hrs, leftAfter: Math.max(0, free - used),
      headline: 'This is within ' + s.cutoffHours + ' hours of your shoot, so your ' + money(Math.min(deposit, credit)) + ' deposit is kept and a new ' + money(deposit) + ' deposit is needed to lock in your new date.' };
    if (used < free) return { action: action, late: false, penalty: false, keepCents: 0, refundCents: 0, countsToward: true, urgent: false, hoursUntil: hrs, leftAfter: free - used - 1,
      headline: 'Free reschedule — your payment moves with you. ' + leftLine(free - used - 1, s) };
    return { action: action, late: false, penalty: true, keepCents: Math.min(deposit, credit), refundCents: 0, newDepositCents: deposit, countsToward: true, urgent: true, hoursUntil: hrs, leftAfter: 0,
      headline: 'You\'ve used all ' + free + ' free reschedules, so your ' + money(Math.min(deposit, credit)) + ' deposit is kept and a new ' + money(deposit) + ' deposit is needed to lock in your new date.' };
  }
  function leftLine(left, s) {
    s = s || DEFAULT_SETTINGS;
    if (left > 1) return 'You have ' + left + ' reschedules left before a penalty applies.';
    if (left === 1) return 'You have 1 reschedule left before a penalty applies.';
    return 'You\'ve used all ' + s.freeReschedules + ' free reschedules — if you reschedule again, your deposit will be kept and a new deposit will be needed.';
  }
  function reschedulesLeft(b, s) { return Math.max(0, (s || DEFAULT_SETTINGS).freeReschedules - (b.rescheduleCount || 0)); }
  function hoursPhrase(h) {
    if (h < 0) return 'after the start time';
    if (h < 1) return Math.max(1, Math.round(h * 60)) + ' minutes';
    if (h < 48) return Math.round(h) + ' hours';
    return Math.round(h / 24) + ' days';
  }

  /* ---------- Email templates ---------- */
  function render(tpl, vars) {
    return String(tpl || '').replace(/\{([a-z0-9_]+)\}/g, function (m, k) { return vars[k] != null ? String(vars[k]) : m; });
  }
  function shootDetailsBlock(b, locations) {
    var L = b.location || {};
    if (L.type === 'saved') {
      var saved = (locations || []).filter(function (x) { return x.id === L.id; })[0];
      if (saved && saved.details) return saved.details + (L.second ? '\n\n2nd location: ' + L.second.name + (L.second.address ? ', ' + L.second.address : '') : '');
    }
    if (L.type === 'unsure') return 'THE SHOOT DETAILS\n📍 Location: we\'ll choose this together — I\'ll send you a few spots that suit your vibe.';
    return 'THE SHOOT DETAILS\n📍 Meeting Point: ' + (L.name || 'TBC') + (L.address && L.address !== L.name ? ', ' + L.address : '') +
      '\nI\'ll meet you there, and we\'ll walk to our shooting spots from there.\nGetting there:\n\n* By train/metro: [add before sending]\n* By bus: [add before sending]\n* Driving/parking: [add before sending] Give yourself 10 minutes to park and walk over.' +
      (L.second ? '\n\n2nd location: ' + L.second.name + (L.second.address ? ', ' + L.second.address : '') : '');
  }
  function vars(b, ctx) {
    ctx = ctx || {}; var s = ctx.settings || DEFAULT_SETTINGS, d = b.details || {}, L = ledger(b), offer = ctx.offer || {};
    var first = (d.name || '').trim().split(/\s+/)[0] || 'there';
    var addons = (b.lines || []).filter(function (l) { return l.id !== 'base'; }).map(function (l) { return '+ ' + l.label + ' (' + money(l.cents) + ')'; }).join('\n');
    var dueMs = b.startMs - s.balanceDueDaysBefore * DAY;
    var ev = ctx.change || {};
    return {
      first_name: first, full_name: d.name || '', email: d.email || '', phone: d.phone || '', ig: d.instagram || '',
      offer_name: b.offerName || offer.name || '', duration: fmtDuration(b.durationMin || 0),
      shoot_date: fmtDate(b.startMs), shoot_date_short: fmtDate(b.startMs, true), shoot_time: fmtTime(b.startMs), end_time: fmtTime(b.endMs),
      location_name: (b.location && (b.location.type === 'unsure' ? 'Not sure yet — help me choose' : b.location.name)) || 'TBC',
      shoot_details_block: shootDetailsBlock(b, ctx.locations),
      addons_list: addons || 'No add-ons', retouched_count: b.retouched != null ? b.retouched : (offer.retouched || ''),
      total: money(b.totalCents), deposit: money(b.depositCents), amount_paid: money(L.creditCents), balance_due: money(L.balanceCents),
      balance_due_date: fmtDate(dueMs), balance_due_note: L.balanceCents ? ' (I\'ll send your 2nd invoice a week before the shoot)' : ' — you\'re all paid up!',
      pay_option: b.payOption === 'full' ? 'paid in full' : 'deposit',
      manage_link: ctx.siteUrl ? ctx.siteUrl + '#/manage/' + b.token : '#/manage/' + b.token,
      pay_link: ctx.siteUrl ? ctx.siteUrl + '#/pay/' + b.token : '#/pay/' + b.token,
      admin_link: ctx.siteUrl ? ctx.siteUrl + 'admin/#/booking/' + b.id : 'admin/#/booking/' + b.id,
      bank_details: s.bankDetails, reschedules_left_line: leftLine(reschedulesLeft(b, s), s), policy_summary: POLICY_SUMMARY,
      business_name: s.businessName, instagram: s.instagram, notes: d.notes || '—',
      guardian_line: d.under18 && d.guardian ? 'Under 18 — guardian: ' + d.guardian.name + ' · ' + d.guardian.phone + ' · ' + d.guardian.email : '',
      reason: ev.reason || '', change_type: ev.action === 'cancel' ? 'late cancellation' : (ev.action === 'reschedule' ? (ev.late ? 'late reschedule' : 'reschedule (over the free limit)') : 'change'),
      hours_until: ev.hoursUntil != null ? hoursPhrase(ev.hoursUntil) : '',
      kept_amount: money(ev.keepCents || 0), refund_pending: money(ev.refundCents || 0),
      penalty_reason: ev.late ? 'was made within ' + s.cutoffHours + ' hours of your shoot' : 'is your ' + (s.freeReschedules + 1) + 'th reschedule',
      refund_line: ev.refundCents ? 'Your refund of ' + money(ev.refundCents) + ' is being processed and will land back on your card within 5–10 business days.' :
        (ev.keepCents ? 'As this was within ' + s.cutoffHours + ' hours of the shoot, your ' + money(ev.keepCents) + ' deposit has been kept, as per the booking policy.' : '')
    };
  }
  function renderEmail(key, b, ctx) {
    var t = (ctx.templates || DEFAULT_TEMPLATES)[key] || DEFAULT_TEMPLATES[key];
    var v = vars(b, ctx);
    return { key: key, to: t.to === 'admin' ? (ctx.settings || DEFAULT_SETTINGS).adminEmail : (b.details || {}).email, subject: render(t.subject, v), body: render(t.body, v), toAdmin: t.to === 'admin' };
  }

  /* ---------- Validation ---------- */
  function validateDetails(d) {
    var e = {};
    if (!d.name || d.name.trim().length < 2) e.name = 'Add your full name.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email || '')) e.email = 'Add an email I can send your confirmation to.';
    if (!/^[+\d][\d\s()-]{7,}$/.test((d.phone || '').trim())) e.phone = 'Add a phone number, e.g. 0412 345 678.';
    if (d.under18) {
      var g = d.guardian || {};
      if (!g.name) e.gname = 'Add your parent or guardian\'s name.';
      if (!/^[+\d][\d\s()-]{7,}$/.test((g.phone || '').trim())) e.gphone = 'Add their phone number.';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(g.email || '')) e.gemail = 'Add their email.';
      if (!g.consent) e.gconsent = 'A parent or guardian needs to agree to the shoot.';
    }
    return e;
  }
  function token(n) {
    var c = 'abcdefghijkmnpqrstuvwxyz23456789', s = '', a = new Uint8Array(n || 24);
    (root.crypto || globalThis.crypto).getRandomValues(a);
    for (var i = 0; i < a.length; i++) s += c[a[i] % c.length];
    return s;
  }

  var MCcore = {
    TZ: TZ, HOUR: HOUR, MIN: MIN, DAY: DAY, MONTHS: MONTHS, DAY_NAMES: DAY_NAMES,
    parts: parts, sydToUtc: sydToUtc, ymdOf: ymdOf, minutesOf: minutesOf, addDays: addDays, dowOf: dowOf,
    fmtTime: fmtTime, fmtMinutes: fmtMinutes, fmtDate: fmtDate, fmtDateYmd: fmtDateYmd, fmtDuration: fmtDuration, money: money,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS, DEFAULT_OFFERS: DEFAULT_OFFERS, DEFAULT_LOCATIONS: DEFAULT_LOCATIONS, DEFAULT_TEMPLATES: DEFAULT_TEMPLATES, POLICY_SUMMARY: POLICY_SUMMARY,
    quote: quote, surchargeCents: surchargeCents, daySlots: daySlots, rangeSlots: rangeSlots, conflicts: conflicts, dayWindow: dayWindow,
    ledger: ledger, evaluateChange: evaluateChange, leftLine: leftLine, reschedulesLeft: reschedulesLeft, hoursPhrase: hoursPhrase,
    render: render, vars: vars, renderEmail: renderEmail, shootDetailsBlock: shootDetailsBlock, validateDetails: validateDetails, token: token
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = MCcore;
  root.MCcore = MCcore;
})(typeof globalThis !== 'undefined' ? globalThis : this);
