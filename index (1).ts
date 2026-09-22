// Public booking API used by the client site. No login needed.
import { makeEngine, json, fail, CORS } from '../_shared/live.js';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { action, payload = {} } = await req.json();
    const { engine: E } = await makeEngine();
    switch (action) {
      case 'config': return json({ data: await E.publicConfig() });
      case 'slots': return json({ data: await E.slots(payload) });
      case 'createBooking': return json({ data: await E.createBooking(payload) });
      case 'getBooking': return json({ data: await E.getByToken(String(payload.token || '')) });
      case 'change': return json({ data: await E.clientChange(String(payload.token || ''), payload) });
      case 'payLink': return json({ data: await E.payLink(String(payload.token || '')) });
      default: return json({ error: 'Unknown action' }, 400);
    }
  } catch (e) { return fail(e); }
});
