// Stripe tells us here when a payment succeeds. Set this URL as a webhook endpoint in Stripe
// (event: checkout.session.completed) and put its signing secret in STRIPE_WEBHOOK_SECRET.
import { makeEngine } from '../_shared/live.js';
import { verifyStripeSignature } from '../_shared/stripe.js';

Deno.serve(async (req) => {
  const body = await req.text();
  const ok = await verifyStripeSignature(body, req.headers.get('Stripe-Signature'), Deno.env.get('STRIPE_WEBHOOK_SECRET'));
  if (!ok) return new Response('bad signature', { status: 400 });
  const evt = JSON.parse(body);
  try {
    if (evt.type === 'checkout.session.completed' || evt.type === 'checkout.session.async_payment_succeeded') {
      const s = evt.data.object;
      if (s.payment_status === 'paid') {
        const { engine } = await makeEngine();
        await engine.paymentSucceeded(s.id, s.payment_intent);
      }
    }
    return new Response('ok');
  } catch (e) {
    console.error(e);
    return new Response('error', { status: 500 }); // Stripe retries
  }
});
