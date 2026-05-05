import crypto from 'crypto';

function verifyToken(token, secret) {
  const [data, sig] = token.split('.');
  if (!data || !sig) throw new Error('Malformed token');
  const expected = crypto.createHmac('sha256', secret).update(data).digest('hex');
  if (sig !== expected) throw new Error('Invalid token');
  const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
  if (payload.exp < Date.now()) throw new Error('Token expired — please renew your subscription');
  return payload;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { system, document: doc, apiKey, token } = req.body;

  // User-provided key bypasses paywall (they're paying Anthropic directly)
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'No API key configured on server.' });
  }

  // Enforce paywall for server-hosted API key requests
  if (!apiKey && process.env.STRIPE_SECRET_KEY) {
    if (!token) {
      return res.status(402).json({ error: 'free_limit_reached' });
    }
    try {
      verifyToken(token, process.env.TOKEN_SECRET);
    } catch (e) {
      return res.status(402).json({ error: e.message });
    }
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         key,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-opus-4-7',
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: `Please review the following document:\n\n${doc}` }],
      }),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data.error?.message || 'Anthropic API error' });
    }
    res.json({ text: data.content[0].text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
