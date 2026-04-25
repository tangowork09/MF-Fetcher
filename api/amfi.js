export default async function handler(req, res) {
  // Extract endpoint from query param
  const endpoint = req.query.endpoint
  if (!endpoint) {
    return res.status(400).json({ error: 'Missing endpoint param' })
  }

  const target = `https://www.amfiindia.com/gateway/pollingsebi/api/amfi/${endpoint}`

  // Handle CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
        'Referer': 'https://www.amfiindia.com/polling/amfi/fund-performance',
        'User-Agent': 'Mozilla/5.0 (compatible)',
      },
      body: req.body ? JSON.stringify(req.body) : undefined,
    })

    const data = await response.text()
    res.setHeader('Content-Type', 'application/json')
    res.status(response.status).send(data)
  } catch (err) {
    res.status(500).json({ error: 'Proxy error', message: err.message })
  }
}
