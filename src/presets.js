import { COLORS, FEEDBACK_STYLES } from './feedbacks.js'

/** @returns {{structure: object[], presets: Record<string, object>}} */
export function getPresets(label) {
	const v = (name) => `$(${label}:${name})`
	const style = (text, size = 'auto') => ({ text, size, color: COLORS.white, bgcolor: COLORS.dim })
	const fb = (feedbackId, options = {}) => ({ feedbackId, options, style: FEEDBACK_STYLES[feedbackId] })
	const presets = {
		status: {
			type: 'simple',
			name: 'Console and client status',
			style: style(`${v('console')}\\n${v('clients')} clients`),
			steps: [{ down: [], up: [] }],
			feedbacks: [fb('console_online')],
		},
		capture: {
			type: 'simple',
			name: 'Capture all traffic for 10 seconds',
			style: style('PROXY\\nCAPTURE'),
			steps: [{ down: [{ actionId: 'capture', options: { seconds: 10 } }], up: [] }],
			feedbacks: [fb('capturing')],
		},
	}
	const structure = [
		{
			id: 'proxy',
			name: 'Proxy',
			definitions: [{ id: 'proxy_all', name: 'Proxy', type: 'simple', presets: Object.keys(presets) }],
		},
	]
	return { structure, presets }
}
