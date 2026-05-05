import crypto from 'crypto';

async function stripe(path) {
  const res = await fetch(`https://api.stripe.com${path}`, {
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || 'Stripe error');
  return json;
}

function signToken(payload, secret) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig   = crypto.createHmac('sha256', secret).update(data).digest('hex');
  return `${data}.${sig}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { session } = req.query;
  if (!session) return res.status(400).json({ error: 'Missing session' });

  try {
    const s = await stripe(`/v1/checkout/sessions/${session}`);

    if (s.status !== 'complete' && s.payment_status !== 'paid') {
      return res.status(402).json({ error: 'Payment not completed' });
    }

    const email = s.customer_details?.email || s.customer_email || 'unknown';
    const payload = {
      email,
      // Token valid for 35 days — user re-subscribes monthly via Stripe
      exp: Date.now() + 35 * 24 * 60 * 60 * 1000,
    };

    const token = signToken(payload, process.env.TOKEN_SECRET);
    res.json({ token, email });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
