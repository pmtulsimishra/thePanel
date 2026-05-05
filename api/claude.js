export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { system, document: doc, apiKey } = req.body;
  const key = apiKey || process.env.ANTHROPIC_API_KEY;

  if (!key) {
    return res.status(500).json({ error: 'No API key — set ANTHROPIC_API_KEY in Vercel env vars or enter one above.' });
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
