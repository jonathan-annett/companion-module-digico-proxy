// The DiGiCo Recall module working through the proxy, unchanged. Recall lives in its own
// repository, so this only runs when told where a checkout is:
//
//   DIGICO_RECALL_DIR=../companion-module-digico-recall yarn test
//
// It uses Recall's own simulated console (which knows the full channel address list) and
// Recall's real engine, twice, as two clients of one proxy.

import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { Hub } from '../src/hub.js'

const dir = process.env.DIGICO_RECALL_DIR
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(check, what, ms = 5000) {
	const end = Date.now() + ms
	while (Date.now() < end) {
		if (check()) return
		await sleep(10)
	}
	throw new Error(`Timed out waiting for: ${what}`)
}

test(
	'two Recall engines share one console through the proxy',
	{ skip: dir ? false : 'set DIGICO_RECALL_DIR to run' },
	async (t) => {
		const load = (file) => import(pathToFileURL(path.resolve(dir, file)).href)
		const { Engine } = await load('src/engine.js')
		const { SimConsole } = await load('test/sim-console.mjs')

		const sim = new SimConsole({ listenPort: 22001, replyPort: 22000 })
		await sim.start()
		const hub = new Hub({ host: '127.0.0.1', sendPort: 22001, recvPort: 22000, clientPort: 22002, rate: 3000 })
		hub.start()
		// Each engine is pointed at the proxy exactly as it would be pointed at a console
		const make = (recvPort) => new Engine({ ip: '127.0.0.1', sendPort: 22002, recvPort, rate: 2000, queryTimeout: 200 })
		const a = make(22010)
		const b = make(22011)
		a.start()
		b.start()
		t.after(async () => {
			await a.stop()
			await b.stop()
			await hub.stop()
			await sim.stop()
		})
		await until(() => a.consoleName === 'SimQuantum' && b.consoleName === 'SimQuantum', 'both engines see the console')
		await until(() => a.counts.Aux_Outputs === 4 && b.counts.Aux_Outputs === 4, 'both have channel counts')
		assert.equal(hub.status().activeClients, 2)

		// A captures a whole channel: well over a hundred queries
		await a.captureToHold('Input_Channels', 5)
		assert.equal(a.pressSlot(1), 'stored')
		const captured = Object.keys(a.lib.slots['1'].steps[0].values).length
		const expected = [...sim.values.keys()].filter((p) => p.startsWith('/Input_Channels/5/')).length
		assert.equal(captured, expected, 'the capture is complete through the proxy')
		await sleep(100)
		assert.equal(b.lastTouched, null, 'A reading a channel is not a touch for B')

		// The operator changes input 5's EQ, then touches input 9: both engines notice each
		sim.surface('/Input_Channels/5/EQ/eq_gain_2', 'f', [11])
		await until(() => a.lastTouched?.index === 5 && b.lastTouched?.index === 5, 'both see the operator touch input 5')
		sim.surface('/Input_Channels/9/fader', 'f', [-4])
		await until(() => a.lastTouched?.index === 9 && b.lastTouched?.index === 9, 'both see the operator touch input 9')

		// A recalls EQ to input 5: the console changes, and B hears that the values changed
		a.setScopes(['eq'])
		assert.equal(a.pressSlot(1), 'recalled')
		const want = a.lib.slots['1'].steps[0].values['EQ/eq_gain_2'].a[0]
		await until(() => sim.get('/Input_Channels/5/EQ/eq_gain_2') === want, 'recall reaches the console')
		await until(() => b.lastTouched?.index === 5, 'B is told input 5 changed')
		await sleep(100)
		assert.equal(a.lastTouched.index, 9, 'A does not mistake its own recall for a touch')

		// Both capture at the same time without stealing each other's answers
		await Promise.all([a.captureToHold('Input_Channels', 2), b.captureToHold('Group_Outputs', 1)])
		assert.equal(
			Object.keys(a.held[0].values).length,
			[...sim.values.keys()].filter((p) => p.startsWith('/Input_Channels/2/')).length,
		)
		assert.equal(
			Object.keys(b.held[0].values).length,
			[...sim.values.keys()].filter((p) => p.startsWith('/Group_Outputs/1/')).length,
		)
	},
)
