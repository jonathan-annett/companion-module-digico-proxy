/** @param {{hub: import('./hub.js').Hub | null}} self */
export function getActions(self) {
	const h = () => self.hub
	return {
		capture: {
			name: 'Capture all traffic to a file',
			description:
				'Records every datagram in both directions for a few seconds, meters included. Download it from the web page.',
			options: [{ type: 'number', id: 'seconds', label: 'Seconds', default: 10, min: 1, max: 120 }],
			callback: async (action) => {
				h()?.startCapture(Number(action.options.seconds) || 10)
			},
		},
		agent_connect: {
			name: 'Connect to the EQ agent',
			description:
				'Tries the EQ agent address in the settings once more. It is only tried by itself when the connection starts.',
			options: [],
			callback: async () => {
				self.agent?.connect()
			},
		},
		clear_trace: {
			name: 'Clear the live traffic view',
			options: [],
			callback: async () => {
				h()?.clearTrace()
			},
		},
		send: {
			name: 'Send an OSC command to the console',
			description: 'For testing. Add /? to the address to ask for a value; the answer appears in the traffic view.',
			options: [
				{ type: 'textinput', id: 'path', label: 'Address', default: '/Console/Name/?' },
				{
					type: 'dropdown',
					id: 'type',
					label: 'Value',
					default: '',
					choices: [
						{ id: '', label: 'None' },
						{ id: 'f', label: 'Number' },
						{ id: 'i', label: 'Whole number' },
						{ id: 's', label: 'Text' },
					],
				},
				{ type: 'textinput', id: 'value', label: 'Value', default: '', isVisibleExpression: "$(options:type) != ''" },
			],
			callback: async (action) => {
				const type = String(action.options.type ?? '')
				try {
					h()?.inject(String(action.options.path).trim(), type, type ? [action.options.value] : [])
				} catch (err) {
					self.log?.('warn', `Send: ${err.message}`)
				}
			},
		},
	}
}
