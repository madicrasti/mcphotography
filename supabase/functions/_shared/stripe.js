// Stripe: checkout sessions, refunds, webhook signature check. Plain fetch, no SDK.
const API = 'https://api.stripe.com/v1/';

function form(obj, prefix, out) {
  out = out || [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out);
    else out.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(v)));
  }
  return out.join('&');
}
async function call(path, body, method) {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new Error('Stripe isn\'t connected yet — add STRIPE_SECRET_KEY to the back office secrets.');
  const r = await fetch(API + path, {
    method: method || 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' },
    body: body ? form(body) : undefined
  });
  const j = await r.json();
  if (!r.ok) throw new Error('Stripe: ' + ((j.error && j.error.message) || r.status));
  return j;
}

export function stripeIO(settingsHold) {
  return {
    async checkout(p) {
      const b = p.booking;
      const items = [{ price_data: { currency: 'aud', unit_amount: p.amountCents, product_data: { name: p.description } }, quantity: 1 }];
      if (p.surchargeCents) items.push({ price_data: { currency: 'aud', unit_amount: p.surchargeCents, product_data: { name: p.surchargeLabel || 'Card processing fee' } }, quantity: 1 });
      const line_items = {}; items.forEach((it, i) => { line_items[i] = it; });
      const expires = Math.floor(Date.now() / 1000) + Math.max(31, (settingsHold || 30) + 1) * 60;
      const s = await call('checkout/sessions', {
        mode: 'payment', line_items, customer_email: b.details.email, expires_at: expires,
        success_url: p.successUrl, cancel_url: p.cancelUrl, locale: 'en',
        metadata: { booking_id: b.id, kind: p.kind, amount_cents: p.amountCents, surcharge_cents: p.surchargeCents },
        payment_intent_data: { description: p.description, metadata: { booking_id: b.id, kind: p.kind } }
      });
      return { id: s.id, url: s.url };
    },
    // Refund across the booking's card payments, newest first. Anything paid by bank transfer is returned as manualCents.
    async refund(b, cents) {
      let left = cents; const perPayment = {}; let lastId = null;
      const cards = (b.payments || []).filter((p) => p.ref && String(p.ref).startsWith('pi_')).slice().reverse();
      for (const p of cards) {
        if (left <= 0) break;
        const room = p.amountCents - (p.refundedCents || 0);
        if (room <= 0) continue;
        const amt = Math.min(room, left);
        const r = await call('refunds', { payment_intent: p.ref, amount: amt, reason: 'requested_by_customer', metadata: { booking_id: b.id } });
        perPayment[p.id] = amt; left -= amt; lastId = r.id;
      }
      return { id: lastId, perPayment, manualCents: Math.max(0, left) };
    },
    async status() {
      const key = Deno.env.get('STRIPE_SECRET_KEY');
      if (!key) return { connected: false, detail: 'Add your Stripe secret key to the back office.' };
      try { const a = await call('account', null, 'GET'); return { connected: true, detail: (key.startsWith('sk_test') ? 'TEST mode · ' : 'Live · ') + (a.business_profile && a.business_profile.name || a.email || a.id) }; }
      catch (e) { return { connected: false, detail: String(e.message || e) }; }
    }
  };
}

export async function verifyStripeSignature(payload, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=')));
  const t = parts.t; const sigs = header.split(',').filter((x) => x.startsWith('v1=')).map((x) => x.slice(3));
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 600) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(t + '.' + payload));
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return sigs.some((s) => s.length === hex.length && timingSafe(s, hex));
}
function timingSafe(a, b) { let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
