// Supabase database adapter for the booking engine.
export function supabaseStore(sb, C) {
  const clone = (x) => JSON.parse(JSON.stringify(x));
  async function q(p) { const { data, error } = await p; if (error) throw new Error(error.message); return data; }
  let seeding = null;
  function seed() { if (!seeding) seeding = doSeed(); return seeding; }
  async function doSeed() {
    const offers = await q(sb.from('offers').select('id').limit(1));
    if (!offers.length) await q(sb.from('offers').upsert(C.DEFAULT_OFFERS.map((o) => ({ id: o.id, sort: o.sort, data: o }))));
    const locs = await q(sb.from('locations').select('id').limit(1));
    if (!locs.length) await q(sb.from('locations').upsert(C.DEFAULT_LOCATIONS.map((l) => ({ id: l.id, data: l }))));
  }
  const rows = (r) => r.map((x) => x.data);
  return {
    async getSettings() {
      const r = await q(sb.from('settings').select('data').eq('id', 1).maybeSingle());
      if (!r) { await q(sb.from('settings').upsert({ id: 1, data: C.DEFAULT_SETTINGS })); return clone(C.DEFAULT_SETTINGS); }
      return Object.assign(clone(C.DEFAULT_SETTINGS), r.data);
    },
    async saveSettings(s) { await q(sb.from('settings').upsert({ id: 1, data: s, updated_at: new Date().toISOString() })); },
    async getTemplates() {
      const r = await q(sb.from('email_templates').select('key,data'));
      const out = clone(C.DEFAULT_TEMPLATES); r.forEach((x) => { out[x.key] = Object.assign({}, out[x.key] || {}, x.data); }); return out;
    },
    async saveTemplate(key, t) { await q(sb.from('email_templates').upsert({ key, data: t, updated_at: new Date().toISOString() })); },
    async listOffers() { await seed(); return rows(await q(sb.from('offers').select('data').order('sort'))); },
    async saveOffer(o) { await q(sb.from('offers').upsert({ id: o.id, sort: o.sort || 0, data: o, updated_at: new Date().toISOString() })); },
    async deleteOffer(id) { await q(sb.from('offers').delete().eq('id', id)); },
    async listLocations() { await seed(); return rows(await q(sb.from('locations').select('data'))); },
    async saveLocation(l) { await q(sb.from('locations').upsert({ id: l.id, data: l, updated_at: new Date().toISOString() })); },
    async deleteLocation(id) { await q(sb.from('locations').delete().eq('id', id)); },
    async bookingsBetween(f, t, statuses) {
      let x = sb.from('bookings').select('data').gt('end_ms', Math.floor(f)).lt('start_ms', Math.ceil(t)).order('start_ms');
      if (statuses) x = x.in('status', statuses);
      return rows(await q(x));
    },
    async listBookings() { return rows(await q(sb.from('bookings').select('data').order('start_ms', { ascending: false }).limit(1000))); },
    async getBooking(id) { const r = await q(sb.from('bookings').select('data').eq('id', id).maybeSingle()); return r ? r.data : null; },
    async getBookingByToken(t) { const r = await q(sb.from('bookings').select('data').eq('token', t).maybeSingle()); return r ? r.data : null; },
    async saveBooking(b) {
      await q(sb.from('bookings').upsert({ id: b.id, token: b.token, status: b.status, start_ms: b.startMs, end_ms: b.endMs,
        client_email: (b.details && b.details.email) || null, data: b, updated_at: new Date().toISOString() }));
    },
    async listBlocks(f, t) { return rows(await q(sb.from('blocks').select('data').gt('end_ms', Math.floor(f)).lt('start_ms', Math.ceil(t)))); },
    async saveBlock(bl) { await q(sb.from('blocks').upsert({ id: bl.id, start_ms: bl.startMs, end_ms: bl.endMs, data: bl })); },
    async deleteBlock(id) { await q(sb.from('blocks').delete().eq('id', id)); },
    async upsertClient(d, fn) {
      const email = (d.email || '').toLowerCase() || null;
      let cur = null;
      if (email) { const r = await q(sb.from('clients').select('data').eq('email', email).maybeSingle()); cur = r ? r.data : null; }
      if (!cur) cur = { id: 'c-' + C.token(10), email, stage: 'Booked', ticks: {}, firstSeenMs: Date.now() };
      ['name', 'phone', 'instagram', 'agency', 'goals', 'guardian', 'source'].forEach((k) => { if (d[k]) cur[k] = d[k]; });
      const n = fn(clone(cur));
      await q(sb.from('clients').upsert({ id: n.id, email: n.email, stage: n.stage, data: n, updated_at: new Date().toISOString() }));
      return n;
    },
    async listClients() { return rows(await q(sb.from('clients').select('data').order('updated_at', { ascending: false }).limit(2000))); },
    async saveClient(c) { await q(sb.from('clients').upsert({ id: c.id, email: c.email || null, stage: c.stage, data: c, updated_at: new Date().toISOString() })); },
    async addOutbox(o) { await q(sb.from('outbox').insert({ id: o.id, booking_id: o.bookingId, data: o, created_at: new Date(o.createdAt).toISOString() })); },
    async listOutbox(n) { return rows(await q(sb.from('outbox').select('data').order('created_at', { ascending: false }).limit(n || 50))); },
    async getPayment(id) { const r = await q(sb.from('payments').select('data').eq('id', id).maybeSingle()); return r ? r.data : null; },
    async savePayment(p) { await q(sb.from('payments').upsert({ id: p.id, booking_id: p.bookingId, status: p.status, data: p })); },
    async getSecret(k) { const r = await q(sb.from('secrets').select('value').eq('key', k).maybeSingle()); return r ? r.value : null; },
    async setSecret(k, v) { await q(sb.from('secrets').upsert({ key: k, value: v, updated_at: new Date().toISOString() })); }
  };
}
