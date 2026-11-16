// A minimal stand-in for an EQ agent, for trying the link without one. It listens for
// the proxy, then lists the graphic EQs and groups and prints the first of each.
// It only reads; it changes nothing on the console.
//
//   node tools/agent-example.mjs [port=8765]
// then set the connection's "EQ agent" address to ws://<this computer>:8765 and save.

import { WebSocketServer } from 'ws'

const port = Number(process.argv[2]) || 8765
const server = new WebSocketServer({ port })
console.log(`Waiting for the proxy on ws://0.0.0.0:${port}`)

server.on('connection', (socket) => {
	let nextId = 1
	const waiting = new Map()
	const ask = (cmd, params = {}) =>
		new Promise((resolve, reject) => {
			const id = nextId++
			waiting.set(id, (answer) => (answer.ok ? resolve(answer.result) : reject(new Error(answer.error))))
			socket.send(JSON.stringify({ id, cmd, ...params }))
		})
	socket.on('message', async (data) => {
		const message = JSON.parse(data.toString())
		if (message.type !== 'hello') return waiting.get(message.id)?.(message)
		console.log(`Proxy connected. Console: ${message.console || '(not answering)'}`)
		try {
			const { graphicEqs } = await ask('geq.list')
			console.log('Graphic EQs:', graphicEqs.map((g) => `${g.index} ${g.name}`).join(', ') || 'none')
			const { groups } = await ask('group.list')
			console.log('Groups:', groups.map((g) => `${g.index} ${g.name}`).join(', ') || 'none')
			if (graphicEqs.length)
				console.log('First graphic EQ:', JSON.stringify(await ask('geq.get', { index: graphicEqs[0].index })))
			if (groups.length)
				console.log('First group EQ:', JSON.stringify(await ask('group.eq.get', { index: groups[0].index }), null, 1))
		} catch (err) {
			console.log('Failed:', err.message)
		}
	})
	socket.on('close', () => console.log('Proxy disconnected'))
})
