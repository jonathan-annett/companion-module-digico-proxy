// Try the proxy and its web page with no Companion and no console: runs the module against
// a simulated console, with two pretend clients, and serves the page at
// http://localhost:8089/instance/proxy/
//
//   node tools/preview.mjs

import dgram from 'node:dgram'
import http from 'node:http'
import { SimConsole } from '../test/sim-console.mjs'
import { makeInstanceClass } from '../src/instance.js'
import { encode } from '../src/osc.js'

class FakeBase {
	label = 'proxy'
	setActionDefinitions() {}
	setFeedbackDefinitions() {}
	setVariableDefinitions() {}
	setPresetDefinitions() {}
	setVariableValues() {}
	checkAllFeedbacks() {}
	updateStatus() {}
	saveConfig() {}
	log(level, text) {
		console.log(`[${level}] ${text}`)
	}
}
const Instance = makeInstanceClass({ InstanceBase: FakeBase, InstanceStatus: {} })

const sim = new SimConsole({ listenPort: 18201, replyPort: 18200 })
await sim.start()
const mod = new Instance({})
await mod.init({
	host: '127.0.0.1',
	sendPort: 18201,
	recvPort: 18200,
	clientPort: 18202,
	fixedClients: 'iPad=127.0.0.2:18210',
})

// A pretend control module that polls and occasionally writes, and a pretend iPad
const a = dgram.createSocket('udp4')
a.bind(18211)
const ipad = dgram.createSocket('udp4')
ipad.bind(18210, '127.0.0.2') // a listed client is recognised by its address, so it needs its own
const to = (socket, path, types, args) => socket.send(encode(path, types, args), 18202, '127.0.0.1')
setInterval(() => to(a, '/Console/Name/?'), 3000)
setInterval(() => to(a, `/Input_Channels/${1 + Math.floor(Math.random() * 8)}/EQ/eq_gain_2/?`), 1300)
setInterval(
	() =>
		to(ipad, `/Input_Channels/${1 + Math.floor(Math.random() * 8)}/fader`, 'f', [
			Math.fround(-20 + Math.random() * 20),
		]),
	2100,
)
setInterval(
	() => sim.surface(`/Input_Channels/${1 + Math.floor(Math.random() * 8)}/mute`, 'f', [Math.round(Math.random())]),
	1700,
)
setInterval(() => sim.out('/Meters/values', 'ii', [1, Math.round(Math.random() * 100)]), 100)
for (let n = 1; n <= 8; n++) sim.values.set(`/Input_Channels/${n}/EQ/eq_gain_2`, { t: 'f', a: [Math.fround(n / 2)] })

const PREFIX = '/instance/proxy'
http
	.createServer((req, res) => {
		const url = new URL(req.url, 'http://localhost')
		if (!url.pathname.startsWith(PREFIX)) {
			res.writeHead(302, { Location: PREFIX + '/' })
			return res.end()
		}
		let body = ''
		req.on('data', (chunk) => (body += chunk))
		req.on('end', async () => {
			const out = await mod.handleHttpRequest({
				method: req.method,
				path: url.pathname.slice(PREFIX.length) || '/',
				query: Object.fromEntries(url.searchParams),
				body: body || undefined,
			})
			res.writeHead(out.status ?? 200, out.headers ?? {})
			res.end(out.body ?? '')
		})
	})
	.listen(8089, () => console.log('\nOpen http://localhost:8089/instance/proxy/\n'))
