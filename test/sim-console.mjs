// A stand-in console for testing without a desk. It behaves the way the DiGiCo iPad
// protocol is understood to behave: it talks to ONE device (a fixed address and port),
// answers "<address>/?" queries with the address and its value, applies and echoes values
// written to it, and announces changes made "on the surface". It is not DiGiCo software.

import dgram from 'node:dgram'
import { encode, decode } from '../src/osc.js'

export class SimConsole {
	constructor({ listenPort, replyPort, replyHost = '127.0.0.1' }) {
		this.opts = { listenPort, replyPort, replyHost }
		this.values = new Map()
		this.received = [] // value writes
		this.queries = [] // addresses asked for
		this.arrivals = [] // [time, address] of everything received, for rate tests
	}

	start() {
		this.socket = dgram.createSocket('udp4')
		this.socket.on('message', (buf) => {
			for (const m of decode(buf)) this.handle(m)
		})
		return new Promise((resolve) => this.socket.bind(this.opts.listenPort, resolve))
	}

	stop() {
		return new Promise((resolve) => this.socket.close(resolve))
	}

	out(path, types, args) {
		this.socket.send(encode(path, types, args), this.opts.replyPort, this.opts.replyHost)
	}

	handle(m) {
		this.arrivals.push([Date.now(), m.path])
		if (m.path.endsWith('/?')) {
			const path = m.path.slice(0, -2)
			this.queries.push(path)
			if (path === '/Console/Name') return this.out(path, 's', ['SimQuantum'])
			const v = this.values.get(path)
			if (v) this.out(path, v.t, v.a)
			return
		}
		if (!m.args.length) return
		this.received.push(m)
		this.values.set(m.path, { t: m.types, a: m.args })
		this.out(m.path, m.types, m.args) // the console echoes what it was told
	}

	/** Someone moves a control on the surface. */
	surface(path, types, args) {
		this.values.set(path, { t: types, a: args })
		this.out(path, types, args)
	}

	get(path) {
		return this.values.get(path)?.a[0]
	}
}
