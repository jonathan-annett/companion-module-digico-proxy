import { consoleSetup } from './network.js'

export const DEFAULTS = {
	host: '192.168.1.10',
	sendPort: 8001,
	recvPort: 8000,
	clientPort: 8101,
	fixedClients: '',
	rate: 800,
	agentUrl: '',
}

const port = (id, label, def) => ({ type: 'number', id, label, width: 6, min: 1, max: 65535, default: def })

/** Path of the module's web page on this Companion, for a given connection label. */
export function webPagePath(label) {
	return `/instance/${encodeURIComponent(label)}/`
}

export function getConfigFields(config = DEFAULTS, label = 'digico-proxy') {
	const c = { ...DEFAULTS, ...config }
	const setup = consoleSetup(c)
	const path = webPagePath(label)
	const cell = (id, text, value, width) => ({ type: 'static-text', id, label: text, value: String(value), width })
	const here = setup.ip || 'this computer’s IP address'
	return [
		{
			type: 'static-text',
			id: 'webPage',
			width: 12,
			label: 'Web page: clients, live traffic, send a command, setup help',
			value:
				`<a href="${path}" target="_blank" rel="noopener"><b>Open the proxy’s web page</b></a>. ` +
				`It lives at this Companion's own address followed by <b>${path}</b>.`,
		},
		{
			type: 'static-text',
			id: 'what',
			width: 12,
			label: 'What this does',
			value:
				'A DiGiCo console accepts one iPad-type device. This connection is that device, and shares it: point ' +
				'other tools (DiGiCo Recall, the DiGiCo iPad app, your own) at this computer instead of the console.',
		},
		cell('consoleHeading', 'On the console: Setup > External Control > External Devices', '', 12),
		cell('consoleType', 'Type', setup.type, 2),
		cell('consoleName', 'Name', 'Proxy', 2),
		cell('consoleIp', 'IP Address', here, 3),
		cell('consoleSend', 'Send', setup.send, 2),
		cell('consoleRcv', 'Rcv', setup.rcv, 1),
		cell('consoleEnabled', 'Enabled', '✓', 2),
		cell(
			'consoleNote',
			'',
			'Set Enable External Control to YES, add the row above, then press "load" next to "commands allowed" and ' +
				'choose the iPad command set. Shown for the saved settings. If the console stops answering, or after changing these settings, set Enable External Control to NO and back to YES.',
			12,
		),
		{
			type: 'textinput',
			id: 'host',
			label: 'Console IP address (the "Local ... IP" line at the bottom of the console\'s External Control page)',
			width: 12,
			default: DEFAULTS.host,
		},
		port('sendPort', 'Console receive port (the proxy sends here)', DEFAULTS.sendPort),
		port('recvPort', 'Console send port (the proxy listens here)', DEFAULTS.recvPort),
		cell(
			'clientHeading',
			'In each tool that used to talk to the console',
			`Set its console address to <b>${here}</b> and its "console receive port" to <b>${c.clientPort}</b>. ` +
				'Its own listening port can be anything that is free. A tool on this same computer can use 127.0.0.1.',
			12,
		),
		port('clientPort', 'Port for clients to send to', DEFAULTS.clientPort),
		{
			type: 'number',
			id: 'rate',
			label: 'Max messages per second to the console, shared by all clients',
			width: 6,
			min: 50,
			max: 5000,
			default: DEFAULTS.rate,
		},
		{
			type: 'textinput',
			id: 'fixedClients',
			label:
				'Clients that must be answered on a set port, such as the iPad app: name=address:port, separated by commas ' +
				'(for example iPad=192.168.1.20:9000). Other clients are answered wherever they send from.',
			width: 12,
			default: '',
		},
		{
			type: 'textinput',
			id: 'agentUrl',
			label:
				'EQ agent: WebSocket address of a server that may read and set graphic EQs and group EQs, for example ' +
				'ws://192.168.1.30:8765. Tried once when this connection starts. Leave empty for none.',
			width: 12,
			default: '',
		},
	]
}
