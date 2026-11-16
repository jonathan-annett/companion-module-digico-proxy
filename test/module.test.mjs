// The proxy as Companion runs it: the real module class with a stand-in for the Companion
// SDK base class, its actions, feedbacks, variables and web API.

import assert from 'node:assert/strict'
import dgram from 'node:dgram'
import test from 'node:test'
import { SimConsole } from './sim-console.mjs'
import { makeInstanceClass } from '../src/instance.js'
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

class FakeBase {
	constructor() {
		this.label = 'proxy'
		this.vars = {}
		this.saved = null
		this.status = []
	}
	setActionDefinitions(d) {
		this.actions = d
	}
	setFeedbackDefinitions(d) {
		this.feedbacks = d
	}
	setVariableDefinitions(d) {
		this.variableDefs = d
	}
	setPresetDefinitions(structure, presets) {
		this.presetStructure = structure
		this.presets = presets
	}
	setVariableValues(v) {
		Object.assign(this.vars, v)
	}
	checkAllFeedbacks() {}
	updateStatus(s, text) {
		this.status = [s, text]
	}
	saveConfig(c) {
		this.saved = { ...c }
	}
	log() {}
}
const Instance = makeInstanceClass({
	InstanceBase: FakeBase,
	InstanceStatus: {
		Ok: 'ok',
		Connecting: 'connecting',
		ConnectionFailure: 'connection_failure',
		UnknownError: 'unknown_error',
		BadConfig: 'bad_config',
	},
})

const CONSOLE = 23001
const LISTEN = 23000
const CLIENTS = 23002
const config = { host: '127.0.0.1', sendPort: CONSOLE, recvPort: LISTEN, clientPort: CLIENTS, rate: 2000 }
const sim = new SimConsole({ listenPort: CONSOLE, replyPort: LISTEN })
await sim.start()
let mod = new Instance({})
await mod.init(config)
const run = (id, options = {}) => mod.actions[id].callback({ options })
const fb = (id, options = {}) => mod.feedbacks[id].callback({ options })
const http = async (method, path, body, query = {}) => {
	const res = await mod.handleHttpRequest({
		method,
		path,
		query,
		body: body === undefined ? undefined : JSON.stringify(body),
	})
	return {
		status: res.status,
		data: res.headers['Content-Type'].startsWith('application/json') ? JSON.parse(res.body) : res.body,
	}
}
const socket = dgram.createSocket('udp4')
const got = []
socket.on('message', (buf) => got.push(...decode(buf)))
await new Promise((r) => socket.bind(0, r))

await test('status, variables and feedbacks follow the console and the clients', async () => {
	await until(() => mod.status[0] === 'ok', 'status ok')
	await until(() => mod.vars.console === 'SimQuantum' && mod.vars.online === 'YES', 'console variables')
	assert.equal(fb('console_online'), true)
	assert.equal(fb('clients', { count: 1 }), false)
	socket.send(encode('/Console/Name/?'), CLIENTS, '127.0.0.1')
	await until(() => mod.vars.clients === '1', 'client counted')
	assert.equal(fb('clients', { count: 1 }), true)
	assert.equal(fb('clients', { count: 2 }), false)
	assert.equal(mod.vars.client_names, `127.0.0.1:${socket.address().port}`)
})

await test('web page and API: status, live traffic, send a command, capture and download', async () => {
	const page = await http('GET', '/')
	assert.ok(page.data.includes('<title>DiGiCo Proxy</title>'))
	const status = (await http('GET', '/api/status')).data
	assert.equal(status.consoleName, 'SimQuantum')
	assert.equal(status.clientPort, CLIENTS)
	assert.deepEqual([status.setup.send, status.setup.rcv, status.setup.type], [LISTEN, CONSOLE, 'DiGiCo Pad'])
	assert.equal(status.clients.length, 1)

	sim.values.set('/Input_Channels/4/fader', { t: 'f', a: [-9] })
	const before = (await http('GET', '/api/trace')).data.seq
	assert.equal(
		(await http('POST', '/api/send', { path: '/Input_Channels/4/fader/?', types: '', args: [] })).status,
		200,
	)
	await until(() => mod.hub.trace.some((e) => e.path === '/Input_Channels/4/fader'), 'answer traced')
	const fresh = (await http('GET', '/api/trace', undefined, { since: String(before) })).data.entries
	assert.deepEqual(
		fresh.map((e) => [e.direction, e.who, e.path]),
		[
			['to console', 'web page', '/Input_Channels/4/fader/?'],
			['from console', 'web page', '/Input_Channels/4/fader'],
		],
	)
	assert.equal((await http('POST', '/api/send', { path: 'bad address' })).status, 400)

	assert.equal((await http('POST', '/api/trace/meters', { on: true })).data.traceMeters, true)
	assert.equal((await http('POST', '/api/capture', { seconds: 0.4 })).status, 200)
	assert.equal(fb('capturing'), true)
	assert.equal((await http('POST', '/api/capture', { seconds: 0.4 })).status, 400)
	sim.surface('/Input_Channels/1/mute', 'f', [1])
	await until(() => mod.hub.captures.length === 1, 'capture finishes', 3000)
	const list = (await http('GET', '/api/captures')).data
	assert.equal(list.running, false)
	assert.equal(list.captures[0].packets, undefined)
	const full = (await http('GET', '/api/captures', undefined, { id: list.captures[0].id })).data
	assert.ok(full.packets.some((p) => p.messages[0]?.path === '/Input_Channels/1/mute'))
	assert.equal((await http('GET', '/api/captures', undefined, { id: 'nope' })).status, 404)
	await http('POST', '/api/trace/clear', {})
	assert.equal((await http('GET', '/api/trace')).data.entries.length, 0)
})

await test('actions: capture, clear the traffic view, send a command', async () => {
	await run('capture', { seconds: 1 })
	assert.equal(fb('capturing'), true)
	await run('send', { path: '/Input_Channels/6/fader', type: 'f', value: '-3.5' })
	await until(() => sim.get('/Input_Channels/6/fader') === -3.5, 'action wrote the value')
	await run('send', { path: 'nonsense', type: '', value: '' }) // refused quietly, never thrown at Companion
	await run('clear_trace')
	assert.equal(mod.hub.trace.length, 0)
})

await test('setup from the web page saves the console address and reconnects', async () => {
	assert.equal((await http('POST', '/api/setup/resolve', { ip: '10.9.8.7' })).data.setup.consoleIp, '10.9.8.7')
	assert.equal((await http('POST', '/api/setup/apply', { ip: 'not-an-ip' })).status, 400)
	assert.equal((await http('POST', '/api/setup/apply', { ip: '127.0.0.1' })).status, 200)
	assert.equal(mod.saved.host, '127.0.0.1')
	await until(() => mod.hub?.consoleName === 'SimQuantum', 'reconnected')
})

await test('a client port equal to the console port is refused with a clear status', async () => {
	await mod.configUpdated({ ...config, clientPort: LISTEN })
	assert.deepEqual(mod.status, ['bad_config', 'The client port must differ from the console send port'])
	assert.equal((await http('GET', '/api/status')).status, 503)
	await mod.configUpdated(config)
	await until(() => mod.status[0] === 'ok', 'running again')
})

await test('stops cleanly', async () => {
	socket.close()
	await mod.destroy()
	assert.equal(mod.hub, null)
	await sim.stop()
})
