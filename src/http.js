import { PAGE } from './webui.js'
import { consoleSetup } from './network.js'

// The web page and its JSON API, served by Companion at
//   http://<companion>:<port>/instance/<connection label>/

const json = (data, status = 200) => ({
	status,
	headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
	body: JSON.stringify(data),
})

/**
 * @param {{hub: import('./hub.js').Hub | null, config: object, setConsoleHost: (ip: string) => Promise<void>}} self
 * @param {{method: string, path: string, query?: Record<string, string>, body?: string}} request
 */
export async function handleHttp(self, request) {
	const hub = self.hub
	const path = String(request.path || '/').replace(/\/+$/, '') || '/'
	const method = String(request.method || 'GET').toUpperCase()
	try {
		if (method === 'GET' && path === '/') {
			return { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: PAGE }
		}
		if (!hub) return json({ error: 'Module is not running' }, 503)
		if (method === 'GET' && path === '/api/status') {
			return json({ ...hub.status(), setup: consoleSetup(self.config), clientPort: Number(self.config.clientPort) })
		}
		if (method === 'GET' && path === '/api/trace') {
			const since = Number(request.query?.since) || 0
			return json({ seq: hub.seq, entries: hub.traceSince(since) })
		}
		if (method === 'GET' && path === '/api/captures') {
			const id = String(request.query?.id ?? '')
			if (id) {
				const capture = hub.captures.find((c) => c.id === id)
				return capture ? json(capture) : json({ error: 'That capture is no longer held' }, 404)
			}
			return json({ running: !!hub.capture, captures: hub.captureList() })
		}
		if (method !== 'POST') return json({ error: 'Not found' }, 404)

		let body = {}
		if (request.body) body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body
		const needIp = () => {
			const ip = String(body.ip ?? '').trim()
			const parts = ip.split('.')
			if (parts.length !== 4 || !parts.every((n) => /^\d{1,3}$/.test(n) && Number(n) <= 255)) {
				throw new Error('That is not an IP address')
			}
			return ip
		}
		switch (path) {
			case '/api/send':
				hub.inject(String(body.path ?? '').trim(), String(body.types ?? ''), Array.isArray(body.args) ? body.args : [])
				return json({ ok: true })
			case '/api/capture':
				if (!hub.startCapture(Number(body.seconds) || 10)) throw new Error('A capture is already running')
				return json({ ok: true })
			case '/api/trace/clear':
				hub.clearTrace()
				return json({ ok: true })
			case '/api/trace/meters':
				hub.traceMeters = !!body.on
				return json({ traceMeters: hub.traceMeters })
			case '/api/setup/resolve':
				return json({ setup: consoleSetup({ ...self.config, host: needIp() }) })
			case '/api/setup/apply':
				await self.setConsoleHost(needIp())
				return json({ ok: true })
			default:
				return json({ error: 'Not found' }, 404)
		}
	} catch (err) {
		return json({ error: String(err.message || err) }, 400)
	}
}
