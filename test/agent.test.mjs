// The EQ agent link: a WebSocket server (standing in for a speaker-tuning agent) reads and
// sets graphic EQs and group EQs through the proxy, against a simulated console.

import assert from 'node:assert/strict'
import test from 'node:test'
import { WebSocketServer } from 'ws'
import { SimConsole } from './sim-console.mjs'
import { Hub } from '../src/hub.js'
import { EqAgent, GEQ_BANDS, PROTOCOL } from '../src/agent.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(check, what, ms = 4000) {
	const end = Date.now() + ms
	while (Date.now() < end) {
		if (check()) return
		await sleep(10)
	}
	throw new Error(`Timed out waiting for: ${what}`)
}

let nextPort = 24000

/** Fill a simulated console with graphic EQs and groups. family: 'large' (8-band groups) or 'compact'. */
function fill(sim, { geqs = 3, groups = 2, family = 'large', counts = true } = {}) {
	const set = (path, t, v) => sim.values.set(path, { t, a: [v] })
	for (let n = 1; n <= geqs; n++) {
		set(`/Graphic_EQ/${n}/name`, 's', `GEQ ${n}`)
		set(`/Graphic_EQ/${n}/geq_in`, 'f', 1)
		set(`/Graphic_EQ/${n}/geq__trim`, 'f', 0)
		for (let b = 1; b <= GEQ_BANDS; b++) set(`/Graphic_EQ/${n}/geq_gain_${b}`, 'f', 0)
	}
	for (let n = 1; n <= groups; n++) {
		const base = `/Group_Outputs/${n}/`
		set(`${base}Buss_Trim/name`, 's', `Group ${n}`)
		set(`${base}EQ/eq_in`, 'f', 1)
		for (let b = 1; b <= (family === 'large' ? 8 : 4); b++) {
			set(`${base}EQ/eq_on_${b}`, 'f', 1)
			set(`${base}EQ/eq_freq_${b}`, 'f', 100 * b)
			set(`${base}EQ/eq_gain_${b}`, 'f', 0)
			set(`${base}EQ/eq_Q_${b}`, 'f', 1)
			set(`${base}EQ/eq_curve_${b}`, 'i', 2)
		}
		if (family === 'large') set(`${base}EQ/eq_pre-ins`, 'f', 0)
		else {
			set(`${base}Filters/hi_filter_in`, 'f', 0)
			set(`${base}Filters/hi_filter_freq`, 'f', 80)
			set(`${base}Filters/lo_filter_in`, 'f', 0)
			set(`${base}Filters/lo_filter_freq`, 'f', 16000)
		}
	}
	if (counts) sim.counts = { Graphic_EQ: geqs, Group_Outputs: groups }
}

/** A console, a proxy, a WebSocket server playing the agent, and the link between them. */
async function rig(t, fillOpts = {}) {
	const consolePort = nextPort++
	const hubPort = nextPort++
	const clientPort = nextPort++
	const wsPort = nextPort++
	const sim = new SimConsole({ listenPort: consolePort, replyPort: hubPort })
	fill(sim, fillOpts)
	await sim.start()
	const hub = new Hub({ host: '127.0.0.1', sendPort: consolePort, recvPort: hubPort, clientPort, rate: 3000 })
	hub.start()
	const server = new WebSocketServer({ port: wsPort })
	const inbox = []
	let peer = null
	server.on('connection', (socket) => {
		peer = socket
		socket.on('message', (data) => inbox.push(JSON.parse(data.toString())))
	})
	const logs = []
	const agent = new EqAgent(hub, {
		url: `ws://127.0.0.1:${wsPort}`,
		queryTimeout: 150,
		settle: 40,
		log: (l, text) => logs.push(text),
	})
	t.after(async () => {
		agent.close()
		await new Promise((r) => server.close(r))
		for (const socket of server.clients) socket.terminate()
		await hub.stop()
		await sim.stop()
	})
	await until(() => hub.consoleName === 'SimQuantum', 'console found')
	let nextId = 1
	/** Send a command as the agent's server would, and wait for the answer. */
	const ask = async (cmd, params = {}) => {
		const id = nextId++
		peer.send(JSON.stringify({ id, cmd, ...params }))
		await until(() => inbox.some((m) => m.id === id), `answer to ${cmd}`)
		return inbox.find((m) => m.id === id)
	}
	const connect = async () => {
		agent.connect()
		await until(() => agent.state === 'connected' && inbox.some((m) => m.type === 'hello'), 'link up')
	}
	return { sim, hub, agent, server, inbox, logs, ask, connect, wsPort, peer: () => peer }
}

test('on connecting, the proxy introduces itself and lists its commands', async (t) => {
	const { inbox, connect, ask, agent } = await rig(t)
	await connect()
	const hello = inbox[0]
	assert.deepEqual([hello.type, hello.protocol, hello.version, hello.console], ['hello', PROTOCOL, 1, 'SimQuantum'])
	assert.deepEqual(hello.commands, [
		'ping',
		'geq.list',
		'geq.get',
		'geq.set',
		'group.list',
		'group.eq.get',
		'group.eq.set',
	])
	assert.deepEqual(await ask('ping'), { id: 1, ok: true, result: { console: 'SimQuantum', consoleOnline: true } })
	assert.equal(agent.status().commands, 1)
})

test('lists the graphic EQs and the groups, with names', async (t) => {
	const { ask, connect } = await rig(t, { geqs: 3, groups: 2 })
	await connect()
	assert.deepEqual((await ask('geq.list')).result.graphicEqs, [
		{ index: 1, name: 'GEQ 1' },
		{ index: 2, name: 'GEQ 2' },
		{ index: 3, name: 'GEQ 3' },
	])
	assert.deepEqual((await ask('group.list')).result.groups, [
		{ index: 1, name: 'Group 1' },
		{ index: 2, name: 'Group 2' },
	])
})

test('a console that does not say how many it has: the ones that answer are listed', async (t) => {
	const { ask, connect } = await rig(t, { geqs: 2, groups: 1, counts: false })
	await connect()
	assert.deepEqual(
		(await ask('geq.list')).result.graphicEqs.map((g) => g.index),
		[1, 2],
	)
	assert.deepEqual((await ask('group.list')).result.groups, [{ index: 1, name: 'Group 1' }])
})

test('graphic EQ: read the whole state, set it, and only what differs is sent', async (t) => {
	const { sim, ask, connect } = await rig(t)
	await connect()
	sim.values.set('/Graphic_EQ/2/geq_gain_5', { t: 'f', a: [-3] })
	const before = (await ask('geq.get', { index: 2 })).result
	assert.deepEqual(Object.keys(before), ['index', 'name', 'in', 'gains', 'trim'])
	assert.deepEqual([before.index, before.name, before.in, before.trim, before.gains.length], [2, 'GEQ 2', true, 0, 32])
	assert.equal(before.gains[4], -3)

	// The agent sends back the whole curve with two bands changed
	const gains = [...before.gains]
	gains[4] = -4.5
	gains[20] = 2
	sim.received.length = 0
	const answer = await ask('geq.set', { index: 2, state: { ...before, gains } })
	assert.equal(answer.ok, true)
	assert.equal(answer.result.sent, 2)
	assert.deepEqual(sim.received.map((m) => [m.path, m.args[0]]).sort(), [
		['/Graphic_EQ/2/geq_gain_21', 2],
		['/Graphic_EQ/2/geq_gain_5', -4.5],
	])
	assert.deepEqual(answer.result.state.gains, gains, 'the answer is the state read back from the console')
	assert.equal(answer.result.notApplied, undefined)

	// The same again changes nothing and sends nothing
	sim.received.length = 0
	assert.equal((await ask('geq.set', { index: 2, state: { gains } })).result.sent, 0)
	assert.equal(sim.received.length, 0)

	// Part of a state is enough
	const partial = await ask('geq.set', { index: 2, state: { in: false, trim: -2 } })
	assert.deepEqual([partial.result.state.in, partial.result.state.trim, partial.result.sent], [false, -2, 2])
	assert.equal(sim.get('/Graphic_EQ/2/geq_in'), 0)
})

test('graphic EQ: a bad request is refused whole, and nothing reaches the console', async (t) => {
	const { sim, ask, connect } = await rig(t)
	await connect()
	const good = Array(32).fill(1)
	const refused = async (params, pattern) => {
		const answer = await ask('geq.set', params)
		assert.equal(answer.ok, false)
		assert.match(answer.error, pattern)
	}
	await refused({ index: 1, state: { gains: [...good.slice(0, 31), 12.5] } }, /gains\[31\].*between -12 and 12/)
	await refused({ index: 1, state: { gains: good.slice(0, 31) } }, /all 32 bands/)
	await refused({ index: 1, state: { gains: [...good.slice(0, 31), '3'] } }, /must be a number/)
	await refused({ index: 1, state: { trim: 19 } }, /between -18 and 18/)
	await refused({ index: 1, state: { in: 1 } }, /true or false/)
	await refused({ index: 1, state: { gain: good } }, /Unknown field "gain"/)
	await refused({ index: 1 }, /"state" must be an object/)
	await refused({ index: 0, state: {} }, /whole number, counting from 1/)
	await refused({ index: 9, state: {} }, /The console has 3 of those/)
	assert.equal(sim.received.length, 0)
	assert.match((await ask('geq.wipe')).error, /Unknown command/)
})

test('group EQ on a large console: eight bands and the pre-insert switch', async (t) => {
	const { sim, ask, connect } = await rig(t, { family: 'large' })
	await connect()
	const eq = (await ask('group.eq.get', { index: 1 })).result
	assert.deepEqual(
		[eq.index, eq.name, eq.in, eq.preInsert, eq.bands.length, eq.filters],
		[1, 'Group 1', true, false, 8, undefined],
	)
	assert.deepEqual(eq.bands[2], { band: 3, on: true, freq: 300, gain: 0, q: 1, curve: 2 })

	sim.received.length = 0
	const answer = await ask('group.eq.set', {
		index: 1,
		state: {
			bands: [
				{ band: 3, freq: 315, gain: -4, q: 4 },
				{ band: 7, on: false },
			],
		},
	})
	assert.equal(answer.result.sent, 4)
	assert.deepEqual(answer.result.state.bands[2], { band: 3, on: true, freq: 315, gain: -4, q: 4, curve: 2 })
	assert.equal(answer.result.state.bands[6].on, false)
	assert.deepEqual(sim.received.map((m) => m.path).sort(), [
		'/Group_Outputs/1/EQ/eq_Q_3',
		'/Group_Outputs/1/EQ/eq_freq_3',
		'/Group_Outputs/1/EQ/eq_gain_3',
		'/Group_Outputs/1/EQ/eq_on_7',
	])
	// A whole state sent straight back changes nothing
	sim.received.length = 0
	assert.equal((await ask('group.eq.set', { index: 1, state: answer.result.state })).result.sent, 0)
	assert.equal(sim.received.length, 0)
	// The curve keeps the console's own number type
	await ask('group.eq.set', { index: 1, state: { bands: [{ band: 1, curve: 3 }] } })
	assert.deepEqual(sim.values.get('/Group_Outputs/1/EQ/eq_curve_1'), { t: 'i', a: [3] })
})

test('group EQ on a compact console: four bands and bus filters; what it lacks is refused', async (t) => {
	const { sim, ask, connect } = await rig(t, { family: 'compact' })
	await connect()
	const eq = (await ask('group.eq.get', { index: 2 })).result
	assert.deepEqual(
		eq.bands.map((b) => b.band),
		[1, 2, 3, 4],
	)
	assert.equal(eq.preInsert, undefined)
	assert.deepEqual(eq.filters, { hi: { in: false, freq: 80 }, lo: { in: false, freq: 16000 } })

	const answer = await ask('group.eq.set', { index: 2, state: { filters: { hi: { in: true, freq: 120 } } } })
	assert.deepEqual(answer.result.state.filters.hi, { in: true, freq: 120 })
	sim.received.length = 0
	for (const [state, pattern] of [
		[{ bands: [{ band: 6, gain: 1 }] }, /groups have no "bands\[6\]\.gain"/],
		[{ preInsert: true }, /groups have no "preInsert"/],
		[{ bands: [{ band: 2, freq: 10 }] }, /between 20 and 20000/],
		[{ bands: [{ band: 2, gain: 20 }] }, /between -18 and 18/],
		[{ bands: [{ band: 2, q: 0 }] }, /between 0.1 and 20/],
		[{ bands: [{ band: 2 }, { band: 2 }] }, /listed twice/],
		[{ bands: [{ band: 2, slope: 1 }] }, /Unknown field "slope"/],
		[{ filters: { mid: {} } }, /"hi" and "lo"/],
	]) {
		const refused = await ask('group.eq.set', { index: 2, state })
		assert.equal(refused.ok, false, JSON.stringify(state))
		assert.match(refused.error, pattern)
	}
	assert.equal(sim.received.length, 0, 'a refused request sends nothing, even its valid parts')
})

test('a value the console does not take is reported, not hidden', async (t) => {
	const { sim, ask, connect } = await rig(t)
	await connect()
	// This console quietly limits one band, as a real one might
	const handle = sim.handle.bind(sim)
	sim.handle = (m) => {
		if (m.path === '/Graphic_EQ/1/geq_gain_3' && m.args.length) m.args[0] = Math.min(m.args[0], 6)
		handle(m)
	}
	const gains = Array(32).fill(0)
	gains[2] = 9
	gains[3] = 9
	const answer = await ask('geq.set', { index: 1, state: { gains } })
	assert.equal(answer.ok, true)
	assert.deepEqual(answer.result.notApplied, ['gains[2]'])
	assert.deepEqual([answer.result.state.gains[2], answer.result.state.gains[3]], [6, 9])
})

test('commands are carried out one at a time, in order; the traffic view names the agent', async (t) => {
	const { hub, inbox, connect, peer } = await rig(t)
	await connect()
	const a = Array(32).fill(1)
	const b = Array(32).fill(2)
	peer().send(JSON.stringify({ id: 'a', cmd: 'geq.set', index: 1, state: { gains: a } }))
	peer().send(JSON.stringify({ id: 'b', cmd: 'geq.set', index: 1, state: { gains: b } }))
	peer().send(JSON.stringify({ id: 'c', cmd: 'geq.get', index: 1 }))
	peer().send('not json')
	await until(() => inbox.filter((m) => 'ok' in m).length === 4, 'all answered')
	const answers = inbox.filter((m) => 'ok' in m)
	assert.deepEqual(
		answers.map((m) => m.id),
		['a', 'b', 'c', null],
	)
	assert.deepEqual(answers[0].result.state.gains, a)
	assert.deepEqual(answers[2].result.gains, b)
	assert.equal(answers[3].error, 'Not JSON')
	const mine = hub.trace.filter((e) => e.who === 'EQ agent')
	assert.ok(mine.some((e) => e.direction === 'to console' && e.path === '/Graphic_EQ/1/geq_gain_1'))
	assert.ok(mine.some((e) => e.direction === 'from console' && e.path === '/Graphic_EQ/1/geq_gain_1'))
})

test('another client sees the changes the agent makes, but not the answers to its questions', async (t) => {
	const { hub, ask, connect } = await rig(t)
	const dgram = await import('node:dgram')
	const { encode, decode } = await import('../src/osc.js')
	const other = dgram.createSocket('udp4')
	const heard = []
	other.on('message', (buf) => heard.push(...decode(buf).map((m) => m.path)))
	await new Promise((r) => other.bind(0, r))
	t.after(() => other.close())
	other.send(encode('/Console/Name/?'), hub.cfg.clientPort, '127.0.0.1')
	await until(() => heard.includes('/Console/Name'), 'other client known')
	await connect()
	heard.length = 0
	await ask('geq.get', { index: 1 })
	await sleep(60)
	// (the console's channel counts, which it sends to everyone, do reach the other client)
	assert.deepEqual(
		heard.filter((path) => !path.startsWith('/Console/')),
		[],
		'answers to the agent go to the agent only',
	)
	await ask('geq.set', { index: 1, state: { trim: 3 } })
	await until(() => heard.includes('/Graphic_EQ/1/geq__trim'), 'the change is announced to everyone')
})

test('the address is tried once: no server means failed, and it does not keep trying', async (t) => {
	const { agent, server, logs, wsPort } = await rig(t)
	await new Promise((r) => server.close(r))
	agent.connect()
	await until(() => agent.state === 'failed', 'gives up')
	assert.equal(agent.status().detail, 'Could not connect')
	await sleep(300)
	assert.equal(logs.filter((text) => text.includes('connecting')).length, 1, 'one attempt only')
	// It can be asked to try again, and then connects
	const again = new WebSocketServer({ port: wsPort })
	t.after(() => new Promise((r) => again.close(r)))
	agent.connect()
	await until(() => agent.state === 'connected', 'second attempt, on request')
})

test('the server going away closes the link; a bad address or none is reported, not thrown', async (t) => {
	const { hub, agent, connect, peer } = await rig(t)
	await connect()
	peer().close()
	await until(() => agent.state === 'closed', 'closed')
	assert.equal(agent.status().detail, 'The server closed the link')

	const bad = new EqAgent(hub, { url: 'http://example.test' })
	bad.connect()
	assert.deepEqual([bad.state, bad.detail], ['failed', 'The address must start with ws:// or wss://'])
	const none = new EqAgent(hub, { url: '  ' })
	none.connect()
	assert.equal(none.state, 'off')
})

test('console not answering: commands fail with a reason instead of hanging', async (t) => {
	const { sim, hub, ask, connect } = await rig(t)
	await connect()
	await sim.stop()
	sim.stop = async () => {}
	hub.online = false
	const answer = await ask('geq.get', { index: 1 })
	assert.deepEqual([answer.ok, answer.error], [false, 'The console is not answering'])
})
