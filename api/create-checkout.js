// Encodes nested objects into Stripe's form-encoded format
function stripeEncode(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      return v.flatMap((item, i) =>
        typeof item === 'object'
          ? stripeEncode(item, `${key}[${i}]`)
          : [`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(item)}`]
      );
    }
    if (v !== null && typeof v === 'object') return stripeEncode(v, key);
    return [`${encodeURIComponent(key)}=${encodeURIComponent(v)}`];
  }).join('&');
}

async function stripe(method, path, data) {
  const res = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization:  `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: data ? stripeEncode(data) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || 'Stripe error');
  return json;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const appUrl = process.env.APP_URL || `https://${req.headers.host}`;

  try {
    const session = await stripe('POST', '/v1/checkout/sessions', {
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${appUrl}/reviewer.html?session={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/reviewer.html`,
      allow_promotion_codes: true,
    });
    res.json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
