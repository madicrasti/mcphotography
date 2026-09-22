// Google: one sign-in covers Calendar (push shoots + read busy times) and Gmail (drafts + priority alerts).
const SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/gmail.compose', 'openid', 'email'];

export function googleAuthUrl(state) {
  const p = new URLSearchParams({
    client_id: Deno.env.get('GOOGLE_CLIENT_ID') || '', redirect_uri: redirectUri(), response_type: 'code', access_type: 'offline', prompt: 'consent',
    include_granted_scopes: 'true', scope: SCOPES.join(' '), state
  });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString();
}
export function redirectUri() { return Deno.env.get('SUPABASE_URL').replace(/\/$/, '') + '/functions/v1/google-oauth'; }
export async function exchangeCode(code) {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: Deno.env.get('GOOGLE_CLIENT_ID'), client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET'), redirect_uri: redirectUri(), grant_type: 'authorization_code' }) });
  const j = await r.json(); if (!r.ok) throw new Error('Google sign-in failed: ' + (j.error_description || j.error));
  return j;
}

export function googleIO(store) {
  let cached = null;
  async function token() {
    if (cached && cached.exp > Date.now() + 60000) return cached.token;
    const g = await store.getSecret('google');
    if (!g || !g.refresh_token) return null;
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ refresh_token: g.refresh_token, client_id: Deno.env.get('GOOGLE_CLIENT_ID'), client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET'), grant_type: 'refresh_token' }) });
    const j = await r.json(); if (!r.ok) throw new Error('Google: ' + (j.error_description || j.error) + ' — reconnect Google in admin Settings.');
    cached = { token: j.access_token, exp: Date.now() + (j.expires_in || 3000) * 1000 };
    return cached.token;
  }
  async function api(url, opts) {
    const t = await token(); if (!t) throw new Error('Google isn\'t connected yet.');
    const r = await fetch(url, Object.assign({}, opts, { headers: Object.assign({ Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, (opts || {}).headers || {}) }));
    if (r.status === 204) return {};
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error('Google: ' + ((j.error && j.error.message) || r.status)); e.status = r.status; throw e; }
    return j;
  }
  function b64url(str) {
    const bytes = new TextEncoder().encode(str); let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function encHeader(s) { return /[^\x20-\x7e]/.test(s) ? '=?UTF-8?B?' + btoa(String.fromCharCode(...new TextEncoder().encode(s))) + '?=' : s; }
  function mime(m, from) {
    const lines = ['From: ' + from, 'To: ' + m.to, 'Subject: ' + encHeader(m.subject), 'MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: 8bit'];
    if (m.replyTo) lines.push('Reply-To: ' + m.replyTo);
    if (m.priority) lines.push('X-Priority: 1 (Highest)', 'Importance: High', 'Priority: urgent');
    return lines.join('\r\n') + '\r\n\r\n' + m.body;
  }
  const CAL = 'https://www.googleapis.com/calendar/v3/calendars/';
  return {
    async connected() { const g = await store.getSecret('google'); return !!(g && g.refresh_token) ? { connected: true, detail: g.email ? 'Signed in as ' + g.email : '' } : { connected: false, detail: 'Connect to push shoots into Google Calendar and draft emails in Gmail.' }; },
    // Busy times from every calendar you have ticked in Google Calendar. Events marked "Free", cancelled
    // events and our own shoot events are ignored.
    async busy(fromMs, toMs) {
      if (!(await token())) return [];
      const cals = await api('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader').catch(() => ({ items: [{ id: 'primary', selected: true }] }));
      const ids = (cals.items || []).filter((c) => c.selected !== false && !/holiday|#contacts@|#weather/i.test(c.id)).slice(0, 15).map((c) => c.id);
      const out = [];
      await Promise.all(ids.map(async (id) => {
        const url = CAL + encodeURIComponent(id) + '/events?singleEvents=true&maxResults=250&timeMin=' + new Date(fromMs).toISOString() + '&timeMax=' + new Date(toMs).toISOString() +
          '&fields=' + encodeURIComponent('items(id,summary,start,end,transparency,status,extendedProperties)');
        const j = await api(url).catch(() => ({ items: [] }));
        (j.items || []).forEach((e) => {
          if (e.status === 'cancelled' || e.transparency === 'transparent') return;
          if (e.extendedProperties && e.extendedProperties.private && e.extendedProperties.private.mcBooking) return;
          const s = e.start.dateTime ? Date.parse(e.start.dateTime) : globalThis.MCcore.sydToUtc(e.start.date, 0);
          const en = e.end.dateTime ? Date.parse(e.end.dateTime) : globalThis.MCcore.sydToUtc(e.end.date, 0);
          out.push({ id: e.id, startMs: s, endMs: en, label: 'Google: ' + (e.summary || 'Busy') });
        });
      }));
      return out;
    },
    async upsertEvent(ev, existingId, calendarId) {
      const base = CAL + encodeURIComponent(calendarId || 'primary') + '/events';
      const body = JSON.stringify(Object.assign({}, ev, { extendedProperties: { private: { mcBooking: '1' } } }));
      if (existingId) {
        try { const r = await api(base + '/' + encodeURIComponent(existingId), { method: 'PATCH', body }); return r.id; } catch (e) { if (e.status !== 404 && e.status !== 410) throw e; }
      }
      const r = await api(base, { method: 'POST', body }); return r.id;
    },
    async deleteEvent(id, calendarId) { if (!id) return; try { await api(CAL + encodeURIComponent(calendarId || 'primary') + '/events/' + encodeURIComponent(id), { method: 'DELETE' }); } catch (e) { if (e.status !== 404 && e.status !== 410) throw e; } },
    async email(m) {
      const g = await store.getSecret('google');
      const from = (g && g.email) || m.replyTo;
      const raw = b64url(mime(m, from));
      if (m.draft) { const r = await api('https://gmail.googleapis.com/gmail/v1/users/me/drafts', { method: 'POST', body: JSON.stringify({ message: { raw } }) }); return { id: r.id, status: 'draft' }; }
      const r = await api('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', body: JSON.stringify({ raw }) });
      if (m.priority && r.id) await api('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + r.id + '/modify', { method: 'POST', body: JSON.stringify({ addLabelIds: ['IMPORTANT', 'STARRED', 'INBOX', 'UNREAD'] }) }).catch(() => {});
      return { id: r.id, status: 'sent' };
    }
  };
}
