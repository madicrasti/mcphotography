// Google sends you back here after you press "Connect Google" in admin Settings.
import { serviceClient, SITE_URL } from '../_shared/live.js';
import { supabaseStore } from '../_shared/store.js';
import { exchangeCode } from '../_shared/google.js';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const back = (msg: string) => Response.redirect(SITE_URL + 'admin/#/settings?google=' + encodeURIComponent(msg), 302);
  try {
    const store = supabaseStore(serviceClient(), (globalThis as any).MCcore);
    const st = await store.getSecret('google_state');
    if (!st || st.state !== url.searchParams.get('state') || Date.now() - st.at > 15 * 60000) return back('expired');
    if (url.searchParams.get('error')) return back(url.searchParams.get('error') || 'cancelled');
    const tok = await exchangeCode(url.searchParams.get('code') || '');
    let email = '';
    if (tok.id_token) { try { email = JSON.parse(atob(tok.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email || ''; } catch (_) { /* ignore */ } }
    const prev = await store.getSecret('google');
    await store.setSecret('google', { refresh_token: tok.refresh_token || (prev && prev.refresh_token), email, connectedAt: Date.now() });
    await store.setSecret('google_state', { state: null, at: 0 });
    return back('connected');
  } catch (e) { console.error(e); return back('error'); }
});
