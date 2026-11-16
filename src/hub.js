import dgram from 'node:dgram'
import { encode, decode } from './osc.js'

// The proxy itself, independent of Companion.
//
// A DiGiCo console accepts one iPad-type external control device. The hub is that device.
// Anything else that speaks the iPad protocol (a control module, the real iPad app, a
// custom tool) connects to the hub instead of the console, as if the hub were the console:
//
//   client --> hub clientPort          forwarded to the console, paced
//   console --> hub listenPort         copied to every client
//
// Two refinements keep clients from confusing each other:
//   - A reply to a query ("<address>/?") goes only to the client that asked. Otherwise one
//     client's polling would look, to the others, like the operator changing things.
//   - All clients share one send-rate budget, taken in turn, so no client can crowd out
//     the others or flood the console.

const TICK_MS = 4
const POLL_MS = 5000
const TRACE_SIZE = 3000
const CAPTURE_LIMIT = 50000

export function parseFixedClients(text) {
	// "iPad=192.168.1.20:9000, lights=10.0.0.5:7001"  (the name is optional)
	const out = []
	for (const item of String(text ?? '').split(/[,;\n]+/)) {
		const m = /^\s*(?:([^=]+)=)?\s*(\d{1,3}(?:\.\d{1,3}){3})\s*:\s*(\d{1,5})\s*$/.exec(item)
		if (!m) continue
		const port = Number(m[3])
		if (port < 1 || port > 65535) continue
		out.push({ name: (m[1] ?? '').trim() || `${m[2]}:${port}`, ip: m[2], port })
	}
	return out
}

export class Hub {
	/**
	 * @param {object} cfg
	 *   host, sendPort, recvPort   the console: its address, the port it receives on, the port it sends to
	 *   clientPort                 where clients send to
	 *   fixedClients               [{ name, ip, port }] clients that must be answered on a set port (the iPad app)
	 *   rate                       messages a second to the console, shared by all clients
	 *   clientTimeout              ms of silence after which an unlisted client is forgotten
	 *   queryTimeout               ms a query waits for its reply before the reply would be treated as news
	 * @param {object} hooks  onChange(), log(level, text), onStatus(ok, text)
	 */
	constructor(cfg, hooks = {}) {
		this.cfg = { rate: 800, clientTimeout: 30000, queryTimeout: 1500, fixedClients: [], ...cfg }
		this.hooks = hooks
		this.clients = new Map() // 'ip:port' -> client
		this.internal = new Map() // name -> client with no address (the hub's own queries, the web page)
		this.pending = new Map() // address -> [{ client, t }] queries waiting for their reply
		this.trace = []
		this.seq = 0
		this.traceMeters = false
		this.capture = null
		this.captures = []
		this.consoleName = ''
		this.online = false
		this.lastConsole = 0
		this.totals = { toConsole: 0, fromConsole: 0, dropped: 0 }
		this.turn = 0
		this.timers = []
		this.consoleSocket = null
		this.clientSocket = null
	}

	// ---- lifecycle -------------------------------------------------------------------

	start() {
		const open = (port, onPacket, what) => {
			const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
			socket.on('error', (err) => {
				this.hooks.onStatus?.(false, `${what}: ${err.message}`)
				this.log('error', `${what} (UDP ${port}): ${err.message}`)
			})
			socket.on('message', onPacket)
			socket.bind(port)
			return socket
		}
		this.consoleSocket = open(Number(this.cfg.recvPort), (buf) => this.fromConsole(buf), 'Console port')
		this.clientSocket = open(Number(this.cfg.clientPort), (buf, rinfo) => this.fromClient(buf, rinfo), 'Client port')
		for (const fixed of this.cfg.fixedClients) {
			this.clients.set(`${fixed.ip}:${fixed.port}`, this.newClient({ ...fixed, fixed: true }))
		}
		this.internal.set('hub', this.newClient({ name: 'proxy', internal: true }))
		this.internal.set('web', this.newClient({ name: 'web page', internal: true }))
		this.timers.push(setInterval(() => this.pump(), TICK_MS))
		this.timers.push(setInterval(() => this.poll(), POLL_MS))
		this.poll()
	}

	async stop() {
		for (const timer of this.timers) clearInterval(timer)
		this.timers = []
		if (this.capture) this.finishCapture()
		const close = (socket) =>
			new Promise((resolve) => {
				if (!socket) return resolve()
				try {
					socket.close(() => resolve())
				} catch {
					resolve()
				}
			})
		await Promise.all([close(this.consoleSocket), close(this.clientSocket)])
		this.consoleSocket = null
		this.clientSocket = null
	}

	log(level, text) {
		this.hooks.log?.(level, text)
	}

	changed() {
		this.hooks.onChange?.()
	}

	newClient(fields) {
		return {
			name: '',
			ip: '',
			port: 0,
			fixed: false,
			internal: false,
			firstSeen: Date.now(),
			lastSeen: 0,
			fromClient: 0,
			toClient: 0,
			queue: [],
			...fields,
		}
	}

	/** Keeps the status up to date and forgets clients that have gone away. */
	poll() {
		const now = Date.now()
		const wasOnline = this.online
		this.online = now - this.lastConsole < POLL_MS * 2 + 1000
		if (wasOnline !== this.online) {
			this.hooks.onStatus?.(this.online, this.online ? 'Connected' : 'No reply from console')
			this.changed()
		}
		for (const [key, client] of this.clients) {
			if (!client.fixed && now - client.lastSeen > this.cfg.clientTimeout) {
				this.clients.delete(key)
				this.log('info', `Client ${client.name} has gone quiet and was removed`)
				this.changed()
			}
		}
		for (const [address, list] of this.pending) {
			const live = list.filter((p) => now - p.t < this.cfg.queryTimeout)
			if (live.length) this.pending.set(address, live)
			else this.pending.delete(address)
		}
		this.send(this.internal.get('hub'), encode('/Console/Name/?'))
	}

	// ---- from clients ----------------------------------------------------------------

	fromClient(buf, rinfo) {
		// A listed client is recognised by its address alone and always answered on its set
		// port (the iPad app listens on a fixed port). Anything else is answered where it
		// sent from, which is how the Companion modules work.
		let client = [...this.clients.values()].find((c) => c.fixed && c.ip === rinfo.address)
		if (!client) {
			const key = `${rinfo.address}:${rinfo.port}`
			client = this.clients.get(key)
			if (!client) {
				client = this.newClient({ name: key, ip: rinfo.address, port: rinfo.port })
				this.clients.set(key, client)
				this.log('info', `New client ${key}`)
				this.changed()
			}
		}
		if (!client.lastSeen) this.changed()
		client.lastSeen = Date.now()
		this.send(client, buf)
	}

	/** Queue a datagram for the console on behalf of a client. */
	send(client, buf) {
		if (!this.consoleSocket) return
		client.fromClient++
		let messages = []
		try {
			messages = decode(buf)
		} catch {
			// forwarded as it is
		}
		const now = Date.now()
		for (const m of messages) {
			if (m.path.endsWith('/?')) {
				const address = m.path.slice(0, -2)
				if (!this.pending.has(address)) this.pending.set(address, [])
				this.pending.get(address).push({ client, t: now })
			}
		}
		this.note('to console', client.name, buf, messages)
		if (client.queue.length > 5000) {
			this.totals.dropped++
			return
		}
		client.queue.push(buf)
	}

	/** Sends queued datagrams to the console, taking one from each client in turn. */
	pump() {
		if (!this.consoleSocket) return
		let budget = Math.max(1, Math.round((this.cfg.rate * TICK_MS) / 1000))
		const all = [...this.clients.values(), ...this.internal.values()]
		while (budget > 0) {
			const waiting = all.filter((c) => c.queue.length)
			if (!waiting.length) break
			for (let i = 0; i < waiting.length && budget > 0; i++) {
				const client = waiting[(this.turn + i) % waiting.length]
				try {
					this.consoleSocket.send(client.queue.shift(), Number(this.cfg.sendPort), this.cfg.host)
					this.totals.toConsole++
				} catch (err) {
					this.log('error', `Send to console failed: ${err.message}`)
				}
				budget--
			}
			this.turn++
		}
	}

	// ---- from the console --------------------------------------------------------------

	fromConsole(buf) {
		const now = Date.now()
		this.lastConsole = now
		this.totals.fromConsole++
		if (!this.online) {
			this.online = true
			this.hooks.onStatus?.(true, 'Connected')
			this.changed()
		}
		let messages = []
		try {
			messages = decode(buf)
		} catch {
			// passed on as it is
		}
		// Is this the answer to somebody's query? Then it is theirs alone.
		let asker = null
		const first = messages[0]
		if (messages.length === 1 && first.args.length) {
			const list = this.pending.get(first.path)
			while (list && list.length) {
				const entry = list.shift()
				if (now - entry.t < this.cfg.queryTimeout) {
					asker = entry.client
					break
				}
			}
			if (list && !list.length) this.pending.delete(first.path)
		}
		if (first?.path === '/Console/Name' && typeof first.args[0] === 'string' && this.consoleName !== first.args[0]) {
			this.consoleName = first.args[0]
			this.changed()
		}
		this.note('from console', asker ? asker.name : 'everyone', buf, messages)
		if (asker) return this.deliver(asker, buf)
		for (const client of this.clients.values()) this.deliver(client, buf)
		for (const client of this.internal.values()) if (client.onPacket) this.deliver(client, buf)
	}

	/**
	 * A client inside this process, with no network address: it is handed what the console
	 * sends by a function call. Used by the EQ agent link.
	 */
	addInternal(key, name, onPacket) {
		const client = this.newClient({ name, internal: true, onPacket })
		this.internal.set(key, client)
		return client
	}

	deliver(client, buf) {
		if (client.internal) {
			if (client.onPacket) {
				client.toClient++
				client.onPacket(buf)
			}
			return
		}
		if (!this.clientSocket) return
		// An unlisted client that has never sent anything has nowhere to be answered
		if (!client.fixed && !client.lastSeen) return
		client.toClient++
		try {
			this.clientSocket.send(buf, client.port, client.ip)
		} catch {
			// the client has gone; it will time out
		}
	}

	// ---- watching and injecting ------------------------------------------------------

	/** Record one datagram in the live trace and in a running capture. */
	note(direction, who, buf, messages) {
		const now = Date.now()
		const isMeter = /meter/i.test(buf.toString('latin1', 0, Math.min(buf.length, 120)))
		if (this.capture && this.capture.packets.length < CAPTURE_LIMIT) {
			this.capture.packets.push({
				ms: now - this.capture.started,
				direction,
				who,
				bytes: buf.length,
				hex: buf.toString('hex', 0, Math.min(buf.length, 1024)),
				messages: messages.map((m) => ({ path: m.path, types: m.types, args: m.args })),
			})
		}
		if (isMeter && !this.traceMeters) return
		// The proxy's own keep-alive would otherwise fill the trace
		if (who === 'proxy') return
		const m = messages[0]
		this.trace.push({
			seq: ++this.seq,
			t: now,
			direction,
			who,
			path: m ? m.path : '(not decodable)',
			types: m ? m.types : '',
			args: m ? m.args : [],
			bytes: buf.length,
		})
		if (this.trace.length > TRACE_SIZE) this.trace.splice(0, this.trace.length - TRACE_SIZE)
	}

	traceSince(seq) {
		return this.trace.filter((entry) => entry.seq > seq)
	}

	clearTrace() {
		this.trace = []
	}

	/**
	 * Send a command to the console from the web page. types is the OSC type-tag string
	 * ("f", "i", "s" or empty); add "/?" to the address to ask for a value.
	 */
	inject(path, types = '', args = []) {
		if (!/^\/[\x21-\x7e]+$/.test(path)) throw new Error('An OSC address starts with / and has no spaces')
		if (!/^[fis]*$/.test(types) || types.length !== args.length)
			throw new Error('Types must be f, i or s, one per value')
		const values = args.map((a, i) => (types[i] === 's' ? String(a) : Number(a)))
		if (values.some((v) => typeof v === 'number' && !Number.isFinite(v))) throw new Error('A number is required')
		this.send(this.internal.get('web'), encode(path, types, values))
	}

	/** Record everything in both directions, including meters, for a few seconds. */
	startCapture(seconds = 10) {
		if (this.capture) return false
		seconds = Math.min(120, Math.max(0.2, Number(seconds) || 10))
		this.capture = { id: String(Date.now()), when: new Date().toISOString(), started: Date.now(), seconds, packets: [] }
		this.capture.timer = setTimeout(() => this.finishCapture(), seconds * 1000)
		this.changed()
		return true
	}

	finishCapture() {
		const cap = this.capture
		if (!cap) return null
		this.capture = null
		clearTimeout(cap.timer)
		// Per address and direction: how many, who, and the range of the numbers carried
		const byAddress = {}
		for (const packet of cap.packets) {
			const list = packet.messages.length ? packet.messages : [{ path: '(not decodable)', types: '', args: [] }]
			for (const m of list) {
				const key = `${packet.direction}  ${m.path.replace(/\/\d+(?=\/|$)/g, '/*')}`
				const row = (byAddress[key] ??= { count: 0, who: [], types: [], min: null, max: null })
				row.count++
				if (!row.who.includes(packet.who)) row.who.push(packet.who)
				if (!row.types.includes(m.types)) row.types.push(m.types)
				const numbers = m.args.filter((a) => typeof a === 'number')
				if (numbers.length) {
					row.min = Math.min(row.min ?? Infinity, ...numbers)
					row.max = Math.max(row.max ?? -Infinity, ...numbers)
				}
			}
		}
		const result = {
			about: 'DiGiCo proxy traffic capture: every datagram in both directions.',
			id: cap.id,
			when: cap.when,
			console: this.consoleName,
			seconds: cap.seconds,
			clients: this.status().clients.map((c) => ({ name: c.name, address: c.address })),
			count: cap.packets.length,
			truncated: cap.packets.length >= CAPTURE_LIMIT,
			byAddress,
			packets: cap.packets,
		}
		this.captures.push(result)
		if (this.captures.length > 5) this.captures.shift()
		this.log('info', `Capture finished: ${result.count} datagrams`)
		this.changed()
		return result
	}

	captureList() {
		return this.captures.map((c) => {
			const { packets, ...summary } = c
			void packets
			return summary
		})
	}

	// ---- summary ---------------------------------------------------------------------

	status() {
		const now = Date.now()
		const clients = [...this.clients.values()].map((c) => ({
			name: c.name,
			address: `${c.ip}:${c.port}`,
			fixed: c.fixed,
			active: !!c.lastSeen && now - c.lastSeen < this.cfg.clientTimeout,
			idleMs: c.lastSeen ? now - c.lastSeen : null,
			fromClient: c.fromClient,
			toClient: c.toClient,
			queued: c.queue.length,
		}))
		return {
			online: this.online,
			consoleName: this.consoleName,
			clients,
			activeClients: clients.filter((c) => c.active).length,
			capturing: !!this.capture,
			traceMeters: this.traceMeters,
			totals: { ...this.totals },
			queued: clients.reduce((n, c) => n + c.queued, 0),
		}
	}
}
