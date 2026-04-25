export default async function handler(req, res) {
  const { path } = req.query
  const endpoint = Array.isArray(path) ? path.join('/') : path
  const target = `https://www.amfiindia.com/gateway/pollingsebi/api/amfi/${endpoint}`

  try {
    const response = await fetch(target, {
      method: req.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Referer': 'https://www.amfiindia.com/polling/amfi/fund-performance',
        'User-Agent': 'Mozilla/5.0 (compatible)',
      },
      body: req.method === 'POST' ? JSON.stringify(req.body) : undefined,
    })

    const data = await response.text()

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Content-Type', 'application/json')

    if (req.method === 'OPTIONS') {
      return res.status(200).end()
    }

    res.status(response.status).send(data)
  } catch (err) {
    res.status(500).json({ error: 'Proxy error', message: err.message })
  }
}
