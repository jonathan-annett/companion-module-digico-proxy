const rgb = (r, g, b) => (r << 16) | (g << 8) | b

export const COLORS = {
	white: rgb(255, 255, 255),
	black: rgb(0, 0, 0),
	red: rgb(200, 0, 0),
	green: rgb(0, 140, 60),
	amber: rgb(220, 140, 0),
	dim: rgb(40, 40, 40),
}

export const FEEDBACK_STYLES = {
	console_online: { bgcolor: COLORS.green, color: COLORS.white },
	clients: { bgcolor: COLORS.green, color: COLORS.white },
	capturing: { bgcolor: COLORS.red, color: COLORS.white },
}

/** @param {{hub: import('./hub.js').Hub | null}} self */
export function getFeedbacks(self) {
	const h = () => self.hub
	const boolean = (id, name, options, callback) => ({
		type: 'boolean',
		name,
		defaultStyle: FEEDBACK_STYLES[id],
		options,
		callback: (feedback) => !!h() && !!callback(feedback.options),
	})
	return {
		console_online: boolean('console_online', 'The console is answering', [], () => h().online),
		clients: boolean(
			'clients',
			'At least this many clients are connected',
			[{ type: 'number', id: 'count', label: 'Clients', default: 1, min: 1, max: 50 }],
			(o) => h().status().activeClients >= Number(o.count),
		),
		capturing: boolean('capturing', 'A traffic capture is running', [], () => h().capture),
	}
}
