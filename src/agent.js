// The EQ agent link: an outgoing WebSocket to a server of the user's choosing (a speaker
// tuning agent, say), over which that server can read and set graphic EQs and group EQs
// on the console. The server sends JSON commands; this answers each one.
//
// It is a client of the hub like any other, called "EQ agent" in the traffic view, so
// everything it asks and changes can be watched there. It never acts on its own: every
// console change is the direct result of one command from the server.
//
// Protocol (all messages are JSON text frames):
//   on connecting, this sends   { type: 'hello', protocol: 'digico-proxy-eq', version: 1, console, commands }
//   the server sends            { id, cmd, ...parameters }
//   this answers                { id, ok: true, result }   or   { id, ok: false, error }
// See docs/EQ-AGENT.md for every command.

import { encode, decode } from './osc.js'

export const PROTOCOL = 'digico-proxy-eq'
export const VERSION = 1
export const GEQ_BANDS = 32

// Limits from DiGiCo's iPad command sets. A value outside them is refused, not clipped.
export const LIMITS = {
	geqGain: [-12, 12],
	geqTrim: [-18, 18],
	freq: [20, 20000],
	gain: [-18, 18],
	q: [0.1, 20],
}

// ISO nominal third-octave centre frequencies. A 32-band graphic is 32 consecutive ones;
// which 32 depends on where band 1 sits, which the command sets do not say.
const THIRD_OCTAVES = [
	16, 20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500,
	3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000, 25000,
]

/** "1=bell, 2=low shelf" as { 1: 'bell', 2: 'low shelf' }; null when nothing usable is given. */
export function parseCurveNames(text) {
	const out = {}
	for (const part of String(text ?? '').split(/[,;\n]+/)) {
		const m = /^\s*(\d)\s*[=:]\s*(.+?)\s*$/.exec(part)
		if (m) out[Number(m[1])] = m[2].slice(0, 40)
	}
	return Object.keys(out).length ? out : null
}

const range = ([min, max], unit) => ({ min, max, unit })

const BAND_FIELDS = { on: 'eq_on', freq: 'eq_freq', gain: 'eq_gain', q: 'eq_Q', curve: 'eq_curve' }
const SWITCHES = new Set(['on', 'in', 'preInsert'])
const FILTER_FIELDS = {
	hi: { in: 'Filters/hi_filter_in', freq: 'Filters/hi_filter_freq' },
	lo: { in: 'Filters/lo_filter_in', freq: 'Filters/lo_filter_freq' },
}
const SECTION_OF = { geq: 'Graphic_EQ', group: 'Group_Outputs' }
const NAME_OF = { geq: 'name', group: 'Buss_Trim/name' }
const MAX_LIST = 64 // how many names to try when the console does not say how many there are

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const fail = (text) => {
	throw new Error(text)
}
const same = (a, b) => Math.abs(a - b) < 0.005

export class EqAgent {
	/**
	 * @param {import('./hub.js').Hub} hub
	 * @param {object} opts  url, WebSocketImpl (defaults to Node's), queryTimeout, settle, log(level, text), onChange()
	 */
	constructor(hub, opts = {}) {
		this.hub = hub
		this.opts = { queryTimeout: 500, settle: 150, WebSocketImpl: globalThis.WebSocket, ...opts }
		this.url = String(opts.url ?? '').trim()
		// What the console does not report and the user can supply in the settings
		this.geqFirstBand = THIRD_OCTAVES.slice(0, 2).includes(Number(opts.geqFirstBand)) ? Number(opts.geqFirstBand) : null
		this.curveNames = parseCurveNames(opts.curveNames)
		this.state = this.url ? 'idle' : 'off' // off | idle | connecting | connected | failed | closed
		this.detail = ''
		this.commands = 0
		this.socket = null
		this.waiting = new Map() // console address -> resolve
		this.counts = {}
		this.chain = Promise.resolve()
		this.client = hub.addInternal('agent', 'EQ agent', (buf) => this.fromConsole(buf))
	}

	status() {
		return { url: this.url, state: this.state, detail: this.detail, commands: this.commands }
	}

	set(state, detail = '') {
		this.state = state
		this.detail = detail
		this.opts.log?.(state === 'failed' ? 'warn' : 'info', `EQ agent link ${state}${detail ? `: ${detail}` : ''}`)
		this.opts.onChange?.()
	}

	// ---- the WebSocket ---------------------------------------------------------------

	/** One attempt. It is not retried by itself: the server may not be meant to be there. */
	connect() {
		if (!this.url || this.state === 'connecting' || this.state === 'connected') return
		if (!/^wss?:\/\/\S+$/i.test(this.url)) return this.set('failed', 'The address must start with ws:// or wss://')
		if (!this.opts.WebSocketImpl) return this.set('failed', 'This version of Node has no WebSocket')
		this.set('connecting')
		let socket
		try {
			socket = new this.opts.WebSocketImpl(this.url)
		} catch (err) {
			return this.set('failed', String(err.message || err))
		}
		this.socket = socket
		socket.addEventListener('open', () => {
			if (this.socket !== socket) return
			this.set('connected')
			this.reply({
				type: 'hello',
				protocol: PROTOCOL,
				version: VERSION,
				console: this.hub.consoleName,
				consoleOnline: this.hub.online,
				commands: Object.keys(this.handlers),
			})
		})
		socket.addEventListener('message', (event) => {
			if (this.socket === socket) void this.onText(event.data)
		})
		socket.addEventListener('error', () => {
			if (this.socket === socket && this.state === 'connecting') this.set('failed', 'Could not connect')
		})
		socket.addEventListener('close', () => {
			if (this.socket !== socket) return
			this.socket = null
			if (this.state === 'connected') this.set('closed', 'The server closed the link')
			else if (this.state === 'connecting') this.set('failed', 'Could not connect')
		})
	}

	close() {
		const socket = this.socket
		this.socket = null
		try {
			socket?.close()
		} catch {
			// already gone
		}
		for (const resolve of this.waiting.values()) resolve(null)
		this.waiting.clear()
		if (this.state === 'connected' || this.state === 'connecting') this.set('closed')
	}

	reply(message) {
		try {
			this.socket?.send(JSON.stringify(message))
		} catch {
			// the link has gone; the close handler reports it
		}
	}

	async onText(data) {
		let request
		try {
			request = JSON.parse(typeof data === 'string' ? data : Buffer.from(data).toString('utf8'))
		} catch {
			// answered in its turn, like any other command
			this.chain = this.chain.then(() => this.reply({ id: null, ok: false, error: 'Not JSON' }))
			return
		}
		const id = request && typeof request === 'object' && 'id' in request ? request.id : null
		const result = await this.run(request)
		this.reply({ id, ...result })
	}

	/** Carry out one command. Commands run one at a time, in the order they arrive. */
	run(request) {
		const job = async () => {
			try {
				if (!request || typeof request !== 'object' || Array.isArray(request)) fail('A command is a JSON object')
				const handler = this.handlers[request.cmd]
				if (!handler) fail(`Unknown command. Known: ${Object.keys(this.handlers).join(', ')}`)
				this.commands++
				const result = await handler(request)
				this.opts.onChange?.()
				return { ok: true, result }
			} catch (err) {
				return { ok: false, error: String(err.message || err) }
			}
		}
		const run = this.chain.then(job)
		this.chain = run
		return run
	}

	handlers = {
		ping: async () => ({ console: this.hub.consoleName, consoleOnline: this.hub.online }),
		'geq.list': async () => ({ graphicEqs: await this.list('geq') }),
		'geq.info': async () => this.geqInfo(),
		'geq.get': async (r) => (await this.readGeq(await this.index(r, 'geq'))).state,
		'geq.set': async (r) => this.writeGeq(await this.index(r, 'geq'), r.state),
		'group.list': async () => ({ groups: await this.list('group') }),
		'group.eq.info': async (r) => this.groupEqInfo(r.index === undefined ? 1 : await this.index(r, 'group')),
		'group.eq.get': async (r) => (await this.readGroupEq(await this.index(r, 'group'))).state,
		'group.eq.set': async (r) => this.writeGroupEq(await this.index(r, 'group'), r.state),
	}

	async index(request, kind) {
		const n = request.index
		if (!Number.isInteger(n) || n < 1 || n > 999) fail('"index" must be a whole number, counting from 1')
		const count = await this.count(kind)
		if (count !== undefined && n > count) fail(`The console has ${count} of those`)
		return n
	}

	// ---- talking to the console ------------------------------------------------------

	fromConsole(buf) {
		let messages = []
		try {
			messages = decode(buf)
		} catch {
			return
		}
		for (const m of messages) {
			const count = /^\/Console\/(Graphic_EQ|Group_Outputs)$/.exec(m.path)
			if (count && typeof m.args[0] === 'number') this.counts[count[1]] = m.args[0]
			if (!m.args.length) continue
			const resolve = this.waiting.get(m.path)
			if (resolve) {
				this.waiting.delete(m.path)
				resolve({ t: m.types, a: m.args })
			}
		}
	}

	/** Ask for many values. Unanswered ones are asked for twice more. Map(address -> {t, a}). */
	async query(paths) {
		const got = new Map()
		for (let attempt = 0; attempt < 3; attempt++) {
			const missing = paths.filter((p) => !got.has(p))
			if (!missing.length) break
			await new Promise((resolve) => {
				let left = missing.length
				let timer = null
				const done = () => {
					clearTimeout(timer)
					for (const p of missing) this.waiting.delete(p)
					resolve()
				}
				// The wait starts once the hub has had time to send them all at its shared rate
				timer = setTimeout(done, this.opts.queryTimeout + (missing.length / this.hub.cfg.rate) * 1000)
				for (const p of missing) {
					this.waiting.set(p, (v) => {
						if (v) got.set(p, v)
						if (--left === 0 || !v) done()
					})
					this.hub.send(this.client, encode(`${p}/?`))
				}
			})
		}
		return got
	}

	async count(kind) {
		const section = SECTION_OF[kind]
		if (this.counts[section] === undefined) {
			// The console answers this with one message per kind of channel, to everyone
			this.hub.send(this.client, encode('/Console/Channels/?'))
			for (let i = 0; i < 10 && this.counts[section] === undefined; i++) await sleep(this.opts.queryTimeout / 10)
		}
		return this.counts[section]
	}

	async list(kind) {
		const section = SECTION_OF[kind]
		const known = await this.count(kind)
		const total = known ?? MAX_LIST
		const paths = Array.from({ length: total }, (_, i) => `/${section}/${i + 1}/${NAME_OF[kind]}`)
		const got = await this.query(paths)
		if (!got.size && !this.hub.online) fail('The console is not answering')
		const out = []
		paths.forEach((path, i) => {
			const v = got.get(path)
			if (v) out.push({ index: i + 1, name: String(v.a[0] ?? '') })
			else if (known !== undefined) out.push({ index: i + 1, name: '' })
		})
		return out
	}

	/** Send the values that differ from what the console has, then read everything back. */
	async apply(read, changes) {
		let sent = 0
		for (const { path, value, was } of changes) {
			if (same(value, was.a[0])) continue
			const type = was.t === 'i' ? 'i' : 'f'
			this.hub.send(this.client, encode(path, type, [type === 'i' ? Math.round(value) : value]))
			sent++
		}
		if (sent) await sleep(this.opts.settle + (sent / this.hub.cfg.rate) * 1000)
		const after = await read()
		const notApplied = changes
			.filter(({ path, value }) => !same(value, after.raw.get(path)?.a[0] ?? NaN))
			.map(({ field }) => field)
		return { state: after.state, sent, ...(notApplied.length ? { notApplied } : {}) }
	}

	// ---- limits and characteristics ----------------------------------------------------

	/** What a graphic EQ is: how many bands, how far each goes, and where the bands are if known. */
	geqInfo() {
		const first = this.geqFirstBand
		const start = first === null ? -1 : THIRD_OCTAVES.indexOf(first)
		return {
			bands: GEQ_BANDS,
			gain: range(LIMITS.geqGain, 'dB'),
			trim: range(LIMITS.geqTrim, 'dB'),
			spacing: 'third octave',
			// null until the user has said in the settings where band 1 is: the console does not report it
			frequencies: first === null ? null : THIRD_OCTAVES.slice(start, start + GEQ_BANDS),
			frequenciesKnown: first !== null,
			source:
				'Ranges are those in DiGiCo’s iPad command sets. Band frequencies are ISO third-octave centres counted from the first band set in the proxy’s settings.',
		}
	}

	/**
	 * What a group's parametric EQ is on this console: the bands it has and the range of
	 * every setting. The band count and the presence of filters are read from the console;
	 * the ranges are those in DiGiCo's command sets.
	 */
	async groupEqInfo(index) {
		const { state } = await this.readGroupEq(index)
		return {
			bands: state.bands.map((b) => ({
				band: b.band,
				freq: range(LIMITS.freq, 'Hz'),
				gain: range(LIMITS.gain, 'dB'),
				q: range(LIMITS.q, 'Q'),
				curve: { min: curveMin(b.band), max: CURVE_MAX },
			})),
			// What each curve number means (bell, shelf and so on), if the user has said: the console does not report it
			curveNames: this.curveNames,
			curveNamesKnown: !!this.curveNames,
			preInsertSwitch: state.preInsert !== undefined,
			filters:
				state.filters === undefined
					? null
					: { hi: { freq: range(LIMITS.freq, 'Hz') }, lo: { freq: range(LIMITS.freq, 'Hz') } },
			notExposed: ['dynamic EQ settings of bands 1 to 4', 'symmetric Q switch'],
			source:
				'Band count and filters read from this console; ranges are those in DiGiCo’s iPad command sets. Curve names come from the proxy’s settings.',
		}
	}

	// ---- graphic EQ ------------------------------------------------------------------

	async readGeq(index) {
		const base = `/Graphic_EQ/${index}/`
		const gains = Array.from({ length: GEQ_BANDS }, (_, i) => `${base}geq_gain_${i + 1}`)
		const raw = await this.query([`${base}name`, `${base}geq_in`, `${base}geq__trim`, ...gains])
		if (gains.some((p) => !raw.has(p)) || !raw.has(`${base}geq_in`)) {
			fail(this.hub.online ? `Graphic EQ ${index} did not answer` : 'The console is not answering')
		}
		const state = {
			index,
			name: String(raw.get(`${base}name`)?.a[0] ?? ''),
			in: raw.get(`${base}geq_in`).a[0] >= 0.5,
			gains: gains.map((p) => raw.get(p).a[0]),
		}
		if (raw.has(`${base}geq__trim`)) state.trim = raw.get(`${base}geq__trim`).a[0]
		return { state, raw }
	}

	async writeGeq(index, wanted) {
		if (!wanted || typeof wanted !== 'object' || Array.isArray(wanted)) fail('"state" must be an object')
		const base = `/Graphic_EQ/${index}/`
		const changes = [] // checked in full before anything is sent
		const add = (field, suffix, value) => changes.push({ field, path: base + suffix, value })
		for (const key of Object.keys(wanted)) {
			if (key === 'index' || key === 'name') continue
			if (key === 'in') add('in', 'geq_in', bool(wanted.in, 'in'))
			else if (key === 'trim') add('trim', 'geq__trim', number(wanted.trim, 'trim', LIMITS.geqTrim))
			else if (key === 'gains') {
				if (!Array.isArray(wanted.gains) || wanted.gains.length !== GEQ_BANDS) {
					fail(`"gains" must list all ${GEQ_BANDS} bands, lowest first`)
				}
				wanted.gains.forEach((g, i) =>
					add(`gains[${i}]`, `geq_gain_${i + 1}`, number(g, `gains[${i}]`, LIMITS.geqGain)),
				)
			} else fail(`Unknown field "${key}"`)
		}
		const before = await this.readGeq(index)
		for (const change of changes) {
			change.was = before.raw.get(change.path) ?? fail(`This console has no "${change.field}" on a graphic EQ`)
		}
		return this.apply(() => this.readGeq(index), changes)
	}

	// ---- group parametric EQ ---------------------------------------------------------

	async readGroupEq(index) {
		const base = `/Group_Outputs/${index}/`
		const bandPath = (field, band) => `${base}EQ/${BAND_FIELDS[field]}_${band}`
		const paths = [`${base}Buss_Trim/name`, `${base}EQ/eq_in`, `${base}EQ/eq_pre-ins`]
		for (let band = 1; band <= 8; band++)
			for (const field of Object.keys(BAND_FIELDS)) paths.push(bandPath(field, band))
		for (const filter of Object.values(FILTER_FIELDS)) paths.push(base + filter.in, base + filter.freq)
		const raw = await this.query(paths)
		if (!raw.has(`${base}EQ/eq_in`) || !raw.has(bandPath('gain', 1))) {
			fail(this.hub.online ? `Group ${index} did not answer` : 'The console is not answering')
		}
		const value = (path, field) => {
			const v = raw.get(path).a[0]
			return SWITCHES.has(field) ? v >= 0.5 : v
		}
		const state = {
			index,
			name: String(raw.get(`${base}Buss_Trim/name`)?.a[0] ?? ''),
			in: value(`${base}EQ/eq_in`, 'in'),
			bands: [],
		}
		// Eight bands on Quantum and SD5/7/10, four on SD8/9/11/12: whichever answer
		for (let band = 1; band <= 8; band++) {
			if (!Object.keys(BAND_FIELDS).every((field) => raw.has(bandPath(field, band)))) continue
			const entry = { band }
			for (const field of Object.keys(BAND_FIELDS)) entry[field] = value(bandPath(field, band), field)
			state.bands.push(entry)
		}
		if (raw.has(`${base}EQ/eq_pre-ins`)) state.preInsert = value(`${base}EQ/eq_pre-ins`, 'preInsert')
		// Bus filters exist only on SD8/9/11/12
		for (const [name, filter] of Object.entries(FILTER_FIELDS)) {
			if (!raw.has(base + filter.in) || !raw.has(base + filter.freq)) continue
			;(state.filters ??= {})[name] = { in: value(base + filter.in, 'in'), freq: value(base + filter.freq, 'freq') }
		}
		return { state, raw }
	}

	async writeGroupEq(index, wanted) {
		if (!wanted || typeof wanted !== 'object' || Array.isArray(wanted)) fail('"state" must be an object')
		const base = `/Group_Outputs/${index}/`
		const changes = []
		const add = (field, suffix, value) => changes.push({ field, path: base + suffix, value })
		const check = (field, label, v) => {
			if (SWITCHES.has(field)) return bool(v, label)
			return number(v, label, LIMITS[field])
		}
		for (const key of Object.keys(wanted)) {
			if (key === 'index' || key === 'name') continue
			if (key === 'in') add('in', 'EQ/eq_in', bool(wanted.in, 'in'))
			else if (key === 'preInsert') add('preInsert', 'EQ/eq_pre-ins', bool(wanted.preInsert, 'preInsert'))
			else if (key === 'bands') {
				if (!Array.isArray(wanted.bands)) fail('"bands" must be a list')
				const seen = new Set()
				for (const entry of wanted.bands) {
					const band = entry?.band
					if (!Number.isInteger(band) || band < 1 || band > 8) fail('Each band needs "band": 1 to 8')
					if (seen.has(band)) fail(`Band ${band} is listed twice`)
					seen.add(band)
					for (const field of Object.keys(entry)) {
						if (field === 'band') continue
						if (!BAND_FIELDS[field]) fail(`Unknown field "${field}" in band ${band}`)
						const label = `bands[${band}].${field}`
						const value =
							field === 'curve'
								? number(entry.curve, label, [curveMin(band), CURVE_MAX], true)
								: check(field, label, entry[field])
						add(label, `EQ/${BAND_FIELDS[field]}_${band}`, value)
					}
				}
			} else if (key === 'filters') {
				if (!wanted.filters || typeof wanted.filters !== 'object') fail('"filters" must be an object')
				for (const [name, filter] of Object.entries(wanted.filters)) {
					if (!FILTER_FIELDS[name]) fail('Filters are "hi" and "lo"')
					for (const field of Object.keys(filter ?? {})) {
						if (!FILTER_FIELDS[name][field]) fail(`Unknown field "${field}" in the ${name} filter`)
						const label = `filters.${name}.${field}`
						add(label, FILTER_FIELDS[name][field], check(field, label, filter[field]))
					}
				}
			} else fail(`Unknown field "${key}"`)
		}
		const before = await this.readGroupEq(index)
		for (const change of changes) {
			change.was = before.raw.get(change.path) ?? fail(`This console's groups have no "${change.field}"`)
		}
		return this.apply(() => this.readGroupEq(index), changes)
	}
}

// The band's shape is a number from 1 to 4 in the command sets; bands 5 to 8 also list 0
const CURVE_MAX = 4
const curveMin = (band) => (band > 4 ? 0 : 1)

function number(v, label, [min, max], whole = false) {
	if (typeof v !== 'number' || !Number.isFinite(v)) fail(`"${label}" must be a number`)
	if (whole && !Number.isInteger(v)) fail(`"${label}" must be a whole number`)
	if (v < min || v > max) fail(`"${label}" must be between ${min} and ${max}`)
	return v
}

function bool(v, label) {
	if (typeof v !== 'boolean') fail(`"${label}" must be true or false`)
	return v ? 1 : 0
}
