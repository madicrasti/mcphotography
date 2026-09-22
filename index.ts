// Admin API. Only the email in ADMIN_EMAIL can use it.
import { makeEngine, json, fail, CORS, serviceClient } from '../_shared/live.js';
import { googleAuthUrl } from '../_shared/google.js';
import { icloudConnect } from '../_shared/icloud.js';

const ALLOWED = ['overview', 'calendarBusy', 'createBooking', 'reschedule', 'cancel', 'refund', 'markPaid', 'updateBooking', 'redraftEmail', 'saveSettings', 'saveOffer',
  'deleteOffer', 'saveLocation', 'deleteLocation', 'saveTemplate', 'saveBlock', 'deleteBlock', 'saveClient', 'previewEmail', 'runHourly'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u } = await serviceClient().auth.getUser(jwt);
    const admin = (Deno.env.get('ADMIN_EMAIL') || '').toLowerCase().split(',').map((s) => s.trim());
    if (!u || !u.user || admin.indexOf((u.user.email || '').toLowerCase()) < 0) return json({ error: 'Please sign in with your admin email.', code: 'auth' }, 401);
    const { action, payload = {} } = await req.json();
    const args = payload.args || [];
    const { engine: E, store, stripe, google, icloud } = await makeEngine();
    if (action === 'connections') {
      const [s, g, i] = await Promise.all([stripe.status(), google.connected(), icloud.connected()]);
      return json({ data: { stripe: s, google: g, icloud: i } });
    }
    if (action === 'googleAuthUrl') {
      const state = crypto.randomUUID();
      await store.setSecret('google_state', { state, at: Date.now() });
      return json({ data: { url: googleAuthUrl(state) } });
    }
    if (action === 'icloudConnect') {
      const p = args[0] || {};
      if (!p.user || !p.password) return json({ error: 'Add your Apple ID email and app-specific password.' }, 400);
      const cfg = await icloudConnect(p.user.trim(), p.password.trim().replace(/\s/g, ''), p.calendarName || 'Shoots');
      await store.setSecret('icloud', cfg);
      const s = await store.getSettings(); s.icloudCalendarName = cfg.targetName; await store.saveSettings(s);
      return json({ data: { calendar: cfg.targetName, others: cfg.others.length } });
    }
    if (ALLOWED.indexOf(action) < 0) return json({ error: 'Unknown action' }, 400);
    return json({ data: await E.admin[action].apply(null, args) });
  } catch (e) { return fail(e); }
});
