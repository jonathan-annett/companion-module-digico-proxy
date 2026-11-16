export function getVariableDefinitions() {
	return {
		console: { name: 'Console name' },
		online: { name: 'Console answering: YES or NO' },
		clients: { name: 'Number of connected clients' },
		client_names: { name: 'Names of connected clients' },
		agent: { name: 'EQ agent link: off, connecting, connected, failed or closed' },
	}
}

/**
 * @param {import('./hub.js').Hub} hub
 * @param {import('./agent.js').EqAgent | null} [agent]
 */
export function getVariableValues(hub, agent = null) {
	const status = hub.status()
	const active = status.clients.filter((c) => c.active)
	return {
		console: status.consoleName,
		online: status.online ? 'YES' : 'NO',
		clients: String(active.length),
		client_names: active.map((c) => c.name).join(', '),
		agent: agent?.status().state ?? 'off',
	}
}
