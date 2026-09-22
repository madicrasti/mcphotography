// Wires the booking engine to the real database, Stripe, Google and iCloud.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import './core.js';
import './engine.js';
import { supabaseStore } from './store.js';
import { stripeIO } from './stripe.js';
import { googleIO } from './google.js';
import { icloudIO } from './icloud.js';

const C = globalThis.MCcore;
export const SITE_URL = (Deno.env.get('SITE_URL') || 'https://madicrasti.github.io/mcphotography/').replace(/\/?$/, '/');

export function serviceClient() {
  return createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

function eventFor(b) {
  const d = b.details || {}, L = C.ledger(b), loc = b.location || {};
  const where = loc.type === 'unsure' ? 'Location TBC (client wants suggestions)' : [loc.name, loc.address].filter(Boolean).join(', ');
  const pending = b.status === 'pending_redeposit' ? ' (awaiting new deposit)' : '';
  return {
    startMs: b.startMs, endMs: b.endMs,
    summary: '📸 ' + b.offerName + ' — ' + (d.name || 'Client') + pending,
    location: where + (loc.second ? ' + ' + loc.second.name : ''),
    description: [
      d.name + ' · ' + (d.phone || '') + ' · ' + (d.email || '') + (d.instagram ? ' · ' + d.instagram : ''),
      d.under18 && d.guardian ? 'UNDER 18 — guardian: ' + d.guardian.name + ' ' + d.guardian.phone : '',
      'Paid ' + C.money(L.creditCents) + ' of ' + C.money(b.totalCents) + (L.balanceCents ? ' · balance ' + C.money(L.balanceCents) : ' · paid in full'),
      (b.lines || []).filter((l) => l.id !== 'base').map((l) => '+ ' + l.label).join('\n'),
      d.notes ? 'Notes: ' + d.notes : '', d.goals ? 'Goals: ' + d.goals : '', d.agency ? 'Agency: ' + d.agency : '',
      'Admin: ' + SITE_URL + 'admin/#/booking/' + b.id
    ].filter(Boolean).join('\n')
  };
}

export async function makeEngine() {
  const sb = serviceClient();
  const store = supabaseStore(sb, C);
  const settings = await store.getSettings();
  const stripe = stripeIO(settings.holdMinutes);
  const google = googleIO(store);
  const icloud = icloudIO(store);
  const io = {
    now: () => Date.now(),
    async busy(fromMs, toMs) {
      const r = await Promise.all([google.busy(fromMs, toMs).catch(() => []), icloud.busy(fromMs, toMs).catch(() => [])]);
      return r[0].concat(r[1]);
    },
    async calendarUpsert(b, offer, s) {
      const ev = eventFor(b), out = { errors: [] };
      const gTimed = { summary: ev.summary, location: ev.location, description: ev.description,
        start: { dateTime: new Date(ev.startMs).toISOString(), timeZone: 'Australia/Sydney' }, end: { dateTime: new Date(ev.endMs).toISOString(), timeZone: 'Australia/Sydney' },
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 120 }] }, colorId: '9' };
      try { if ((await google.connected()).connected) out.gcalId = await google.upsertEvent(gTimed, b.gcalId, s.googleCalendarId); } catch (e) { out.errors.push(String(e.message || e)); }
      try { if ((await icloud.connected()).connected) out.icalUid = await icloud.upsertEvent(b.icalUid || ('mc-' + b.id), ev); } catch (e) { out.errors.push(String(e.message || e)); }
      return out;
    },
    async calendarDelete(b) {
      const s = await store.getSettings();
      await Promise.all([google.deleteEvent(b.gcalId, s.googleCalendarId).catch(() => {}), icloud.deleteEvent(b.icalUid).catch(() => {})]);
    },
    async email(m) { return google.email(m); },
    checkout: (p) => stripe.checkout(p),
    refund: (b, cents) => stripe.refund(b, cents)
  };
  const engine = globalThis.MCengine.createEngine(store, io, { siteUrl: SITE_URL });
  return { engine, store, sb, stripe, google, icloud };
}

export const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
export function json(body, status) { return new Response(JSON.stringify(body), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS) }); }
export function fail(e) {
  const expose = e && (e.expose || e.code);
  if (!expose) console.error(e);
  return json({ error: expose ? e.message : 'Something went wrong on our side. Please try again, or email me.', code: e && e.code }, expose ? 400 : 500);
}
