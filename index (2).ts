// Runs every hour (see SETUP.md): expires unpaid holds, drafts 2nd invoices a week out and
// reminders 48 hours out, and marks finished shoots as done.
import { makeEngine } from '../_shared/live.js';

Deno.serve(async (req) => {
  // Safe to run more than once — every job is marked done after it runs.
  const secret = Deno.env.get('CRON_SECRET');
  const auth = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (secret && auth !== secret && auth !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return new Response('unauthorised', { status: 401 });
  const { engine } = await makeEngine();
  const out = await engine.hourly();
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
});
