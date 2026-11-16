// The proxy's behaviour, tested over real UDP: a simulated console that talks to exactly
// one device (the proxy), and several clients talking to the proxy as if it were the console.

import assert from 'node:assert/strict'
import dgram from 'node:dgram'
import test from 'node:test'
import { SimConsole } from './sim-console.mjs'
import { Hub, parseFixedClients } from '../src/hub.js'
import { encode, decode } from '../src/osc.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(check, what, ms = 4000) {
	const end = Date.now() + ms
	while (Date.now() < end) {
		if (check()) return
		await sleep(10)
	}
	throw new Error(`Timed out waiting for: ${what}`)
}

let nextPort = 21000

/** A client: one socket that sends to the proxy and listens for what comes back. */
async function client(t, clientPort, bindPort = 0) {
	const socket = dgram.createSocket('udp4')
	const got = []
	socket.on('message', (buf) => got.push(...decode(buf)))
	await new Promise((r) => socket.bind(bindPort, r))
	t.after(() => socket.close())
	return {
		got,
		port: socket.address().port,
		send: (path, types = '', args = []) => socket.send(encode(path, types, args), clientPort, '127.0.0.1'),
		query: (path) => socket.send(encode(`${path}/?`), clientPort, '127.0.0.1'),
		has: (path) => got.some((m) => m.path === path),
		count: (path) => got.filter((m) => m.path === path).length,
	}
}

async function rig(t, cfg = {}) {
	const consolePort = nextPort++
	const hubListen = nextPort++
	const clientPort = nextPort++
	const sim = new SimConsole({ listenPort: consolePort, replyPort: hubListen })
	await sim.start()
	const logs = []
	const hub = new Hub(
		{ host: '127.0.0.1', sendPort: consolePort, recvPort: hubListen, clientPort, rate: 2000, ...cfg },
		{ log: (level, text) => logs.push([level, text]) },
	)
	hub.start()
	t.after(async () => {
		await hub.stop()
		await sim.stop().catch(() => {})
	})
	await until(() => hub.consoleName === 'SimQuantum', 'proxy to reach the console')
	return { sim, hub, clientPort, logs }
}

test('the proxy reaches the console and knows its name', async (t) => {
	const { hub } = await rig(t)
	assert.equal(hub.online, true)
	assert.equal(hub.status().consoleName, 'SimQuantum')
	assert.equal(hub.status().activeClients, 0)
})

test('two clients share one console: both can write, both see changes made on the surface', async (t) => {
	const { sim, hub, clientPort } = await rig(t)
	const a = await client(t, clientPort)
	const b = await client(t, clientPort)
	a.send('/Input_Channels/1/fader', 'f', [-10])
	b.send('/Input_Channels/2/mute', 'f', [1])
	await until(
		() => sim.get('/Input_Channels/1/fader') === -10 && sim.get('/Input_Channels/2/mute') === 1,
		'both writes',
	)
	assert.equal(hub.status().activeClients, 2)

	sim.surface('/Input_Channels/7/fader', 'f', [-3])
	await until(() => a.has('/Input_Channels/7/fader') && b.has('/Input_Channels/7/fader'), 'both hear the surface')
	// The console's echo of A's write reaches B too, so B knows the fader moved
	await until(() => b.has('/Input_Channels/1/fader'), 'B hears about the change A made')
})

test('the answer to a query goes only to the client that asked', async (t) => {
	const { sim, clientPort } = await rig(t)
	sim.values.set('/Input_Channels/5/EQ/eq_gain_1', { t: 'f', a: [4.5] })
	const a = await client(t, clientPort)
	const b = await client(t, clientPort)
	// Both must have spoken once so the proxy knows where they are
	a.query('/Console/Name')
	b.query('/Console/Name')
	await until(() => a.has('/Console/Name') && b.has('/Console/Name'), 'both registered')
	assert.equal(a.count('/Console/Name'), 1)
	assert.equal(b.count('/Console/Name'), 1, 'each got exactly its own answer')

	a.query('/Input_Channels/5/EQ/eq_gain_1')
	await until(() => a.has('/Input_Channels/5/EQ/eq_gain_1'), 'A gets its answer')
	await sleep(80)
	assert.equal(b.has('/Input_Channels/5/EQ/eq_gain_1'), false, "B is not told about A's query")
	assert.equal(a.got.find((m) => m.path === '/Input_Channels/5/EQ/eq_gain_1').args[0], 4.5)
})

test('when two clients ask for the same thing, each gets one answer', async (t) => {
	const { sim, clientPort } = await rig(t)
	sim.values.set('/Group_Outputs/1/fader', { t: 'f', a: [-6] })
	const a = await client(t, clientPort)
	const b = await client(t, clientPort)
	const c = await client(t, clientPort)
	c.query('/Console/Name')
	await until(() => c.has('/Console/Name'), 'C registered')
	a.query('/Group_Outputs/1/fader')
	b.query('/Group_Outputs/1/fader')
	await until(() => a.has('/Group_Outputs/1/fader') && b.has('/Group_Outputs/1/fader'), 'both answered')
	await sleep(80)
	assert.equal(a.count('/Group_Outputs/1/fader'), 1)
	assert.equal(b.count('/Group_Outputs/1/fader'), 1)
	assert.equal(c.count('/Group_Outputs/1/fader'), 0)
})

test('a query the console never answers does not swallow a later change to that address', async (t) => {
	const { sim, clientPort } = await rig(t, { queryTimeout: 150 })
	const a = await client(t, clientPort)
	const b = await client(t, clientPort)
	b.query('/Console/Name')
	a.query('/Input_Channels/9/Nonexistent/thing') // the simulated console holds no value, so says nothing
	await until(() => b.has('/Console/Name'), 'B registered')
	await sleep(250)
	sim.surface('/Input_Channels/9/Nonexistent/thing', 'f', [1])
	await until(() => b.has('/Input_Channels/9/Nonexistent/thing'), 'the change reaches everyone')
	assert.ok(a.has('/Input_Channels/9/Nonexistent/thing'))
})

test('a listed client is answered on its set port, whatever port it sends from', async (t) => {
	const consolePort = nextPort++
	const hubListen = nextPort++
	const clientPort = nextPort++
	const ipadListen = nextPort++
	const sim = new SimConsole({ listenPort: consolePort, replyPort: hubListen })
	await sim.start()
	const hub = new Hub({
		host: '127.0.0.1',
		sendPort: consolePort,
		recvPort: hubListen,
		clientPort,
		fixedClients: parseFixedClients(`iPad=127.0.0.1:${ipadListen}`),
	})
	hub.start()
	t.after(async () => {
		await hub.stop()
		await sim.stop()
	})
	// The "iPad" listens on one socket and sends from another, as an app with separate ports does
	const listener = await client(t, clientPort, ipadListen)
	const sender = await client(t, clientPort)
	// Even before it has said anything, a listed client hears the console
	sim.surface('/Input_Channels/1/fader', 'f', [-1])
	await until(() => listener.has('/Input_Channels/1/fader'), 'listed client hears the surface without speaking first')
	sender.query('/Console/Name')
	await until(() => listener.has('/Console/Name'), 'answer arrives on the set port')
	assert.equal(sender.got.length, 0, 'nothing is sent back to the port it happened to send from')
	const row = hub.status().clients.find((c) => c.name === 'iPad')
	assert.equal(row.fixed, true)
	assert.equal(row.address, `127.0.0.1:${ipadListen}`)
	assert.equal(hub.status().clients.length, 1, 'it is one client, not two')
})

test('fixed client list: names, defaults and junk', () => {
	assert.deepEqual(parseFixedClients('iPad=192.168.1.20:9000, 10.0.0.5:7001 ; lights = 10.0.0.6:1234'), [
		{ name: 'iPad', ip: '192.168.1.20', port: 9000 },
		{ name: '10.0.0.5:7001', ip: '10.0.0.5', port: 7001 },
		{ name: 'lights', ip: '10.0.0.6', port: 1234 },
	])
	assert.deepEqual(parseFixedClients('nonsense, 1.2.3.4, 1.2.3.4:99999, '), [])
	assert.deepEqual(parseFixedClients(undefined), [])
})

test('the send rate is shared: clients take turns, and the total stays within the limit', async (t) => {
	const { sim, clientPort } = await rig(t, { rate: 250 })
	const a = await client(t, clientPort)
	const b = await client(t, clientPort)
	await sleep(50)
	sim.arrivals.length = 0
	const start = Date.now()
	// A dumps 100 messages at once; B sends 10 just after
	for (let i = 0; i < 100; i++) a.send(`/Input_Channels/${i + 1}/fader`, 'f', [-i])
	await sleep(20)
	for (let i = 0; i < 10; i++) b.send(`/Group_Outputs/${i + 1}/fader`, 'f', [-i])
	await until(() => sim.arrivals.filter(([, p]) => p.endsWith('/fader')).length === 110, 'all 110 delivered')
	const took = Date.now() - start
	assert.ok(took >= 300, `110 messages at 250 a second arrived in ${took} ms, which is too fast`)
	// B's ten were interleaved with A's, not left until A's hundred had gone
	const order = sim.arrivals
		.filter(([, p]) => p.endsWith('/fader'))
		.map(([, p]) => (p.startsWith('/Group') ? 'B' : 'A'))
	const lastB = order.lastIndexOf('B')
	assert.ok(lastB < 60, `B's last message was number ${lastB + 1} of 110`)
})

test('a client that goes quiet is forgotten, and comes back when it speaks', async (t) => {
	const { hub, clientPort } = await rig(t, { clientTimeout: 150 })
	const a = await client(t, clientPort)
	a.query('/Console/Name')
	await until(() => hub.status().clients.length === 1, 'registered')
	await sleep(250)
	hub.poll()
	assert.equal(hub.status().clients.length, 0)
	a.query('/Console/Name')
	await until(() => hub.status().clients.length === 1, 'back again')
})

test('traffic view: who sent what, where answers went; meters hidden unless asked for', async (t) => {
	const { sim, hub, clientPort } = await rig(t)
	sim.values.set('/Input_Channels/3/fader', { t: 'f', a: [-12] })
	const a = await client(t, clientPort)
	a.query('/Input_Channels/3/fader')
	await until(() => a.has('/Input_Channels/3/fader'), 'answered')
	sim.surface('/Input_Channels/3/mute', 'f', [1])
	sim.out('/Input_Channels/3/Dynamics/GR_meter_1', 'f', [0.3])
	await until(() => hub.trace.some((e) => e.path === '/Input_Channels/3/mute'), 'surface change traced')
	await sleep(50)
	const name = `127.0.0.1:${a.port}`
	const asked = hub.trace.find((e) => e.path === '/Input_Channels/3/fader/?')
	assert.deepEqual([asked.direction, asked.who], ['to console', name])
	const answer = hub.trace.find((e) => e.path === '/Input_Channels/3/fader')
	assert.deepEqual([answer.direction, answer.who, answer.args], ['from console', name, [-12]])
	assert.equal(hub.trace.find((e) => e.path === '/Input_Channels/3/mute').who, 'everyone')
	assert.ok(!hub.trace.some((e) => /meter/.test(e.path)), 'meters are not shown by default')
	assert.ok(!hub.trace.some((e) => e.who === 'proxy'), "the proxy's own keep-alive is not shown")
	assert.ok(hub.traceSince(answer.seq).every((e) => e.seq > answer.seq))

	hub.traceMeters = true
	sim.out('/Input_Channels/3/Dynamics/GR_meter_1', 'f', [0.4])
	await until(() => hub.trace.some((e) => /meter/.test(e.path)), 'meters shown when switched on')
	hub.clearTrace()
	assert.equal(hub.trace.length, 0)
})

test('sending a command from the web page: reaches the console, and the answer is not broadcast', async (t) => {
	const { sim, hub, clientPort } = await rig(t)
	sim.values.set('/Input_Channels/1/fader', { t: 'f', a: [-20] })
	const a = await client(t, clientPort)
	a.query('/Console/Name')
	await until(() => a.has('/Console/Name'), 'registered')
	hub.inject('/Input_Channels/1/fader/?')
	await until(
		() => hub.trace.some((e) => e.path === '/Input_Channels/1/fader' && e.who === 'web page'),
		'answer in the trace',
	)
	await sleep(60)
	assert.equal(a.has('/Input_Channels/1/fader'), false)
	hub.inject('/Input_Channels/1/fader', 'f', ['-7.5'])
	await until(() => sim.get('/Input_Channels/1/fader') === -7.5, 'value set')
	await until(() => a.has('/Input_Channels/1/fader'), 'clients hear the change')
	assert.throws(() => hub.inject('no slash'), /starts with/)
	assert.throws(() => hub.inject('/x', 'f', []), /one per value/)
	assert.throws(() => hub.inject('/x', 'f', ['abc']), /number is required/)
	assert.throws(() => hub.inject('/x', 'q', [1]), /f, i or s/)
})

test('capture: every datagram in both directions, with client names, timings and raw bytes', async (t) => {
	const { sim, hub, clientPort } = await rig(t)
	const a = await client(t, clientPort)
	assert.equal(hub.startCapture(0.5), true)
	assert.equal(hub.startCapture(0.5), false, 'one at a time')
	a.send('/Meters/request/8', 's', ['post'])
	for (let i = 0; i < 5; i++) sim.out('/Meters/values', 'ii', [8, 40 + i])
	sim.surface('/Input_Channels/2/fader', 'f', [-1])
	await until(() => hub.captures.length === 1, 'capture finishes', 3000)
	const cap = hub.captures[0]
	const name = `127.0.0.1:${a.port}`
	const request = cap.packets.find((p) => p.messages[0]?.path === '/Meters/request/8')
	assert.deepEqual([request.direction, request.who, request.messages[0].args], ['to console', name, ['post']])
	assert.ok(request.hex.startsWith(Buffer.from('/Meters/request/8').toString('hex')))
	assert.equal(cap.byAddress['from console  /Meters/values'].count, 5, 'meters are always captured')
	assert.deepEqual(
		[cap.byAddress['from console  /Meters/values'].min, cap.byAddress['from console  /Meters/values'].max],
		[8, 44],
	)
	assert.ok(cap.byAddress['to console  /Meters/request/*'].who.includes(name))
	assert.ok(
		cap.packets.every((p, i) => i === 0 || p.ms >= cap.packets[i - 1].ms),
		'in time order',
	)
	assert.equal(hub.captureList()[0].packets, undefined)
	assert.equal(hub.status().capturing, false)
})

test('packets the proxy cannot decode are still passed on, both ways', async (t) => {
	const { sim, clientPort } = await rig(t)
	const socket = dgram.createSocket('udp4')
	const raw = []
	socket.on('message', (buf) => raw.push(buf))
	await new Promise((r) => socket.bind(0, r))
	t.after(() => socket.close())
	socket.send(encode('/Console/Name/?'), clientPort, '127.0.0.1')
	await until(() => raw.length === 1, 'registered')
	const odd = Buffer.concat([Buffer.from('/Meters/raw\0'), Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])])
	sim.socket.send(odd, sim.opts.replyPort, '127.0.0.1')
	await until(() => raw.some((buf) => buf.equals(odd)), 'undecodable console packet reaches the client unchanged')
})
