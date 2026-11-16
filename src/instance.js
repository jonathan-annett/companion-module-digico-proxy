import { Hub, parseFixedClients } from './hub.js'
import { DEFAULTS, getConfigFields } from './config.js'
import { getActions } from './actions.js'
import { getFeedbacks } from './feedbacks.js'
import { getVariableDefinitions, getVariableValues } from './variables.js'
import { getPresets } from './presets.js'
import { handleHttp } from './http.js'

/**
 * Builds the Companion instance class. The Companion SDK base class is passed in rather
 * than imported so the same class can be driven by the test harness without Companion.
 */
export function makeInstanceClass({ InstanceBase, InstanceStatus }) {
	return class DigicoProxyInstance extends InstanceBase {
		constructor(internal) {
			super(internal)
			this.config = { ...DEFAULTS }
			this.hub = null
			this.refreshTimer = null
		}

		async init(config) {
			this.config = { ...DEFAULTS, ...config }
			this.startHub()
		}

		async destroy() {
			if (this.refreshTimer) clearTimeout(this.refreshTimer)
			this.refreshTimer = null
			await this.stopHub()
		}

		async configUpdated(config) {
			await this.stopHub()
			this.config = { ...DEFAULTS, ...config }
			this.startHub()
		}

		getConfigFields() {
			return getConfigFields(this.config, this.label)
		}

		/** Change the console address from the web page's Setup tab, save it, and reconnect. */
		async setConsoleHost(host) {
			await this.stopHub()
			this.config = { ...this.config, host }
			this.saveConfig(this.config)
			this.startHub()
		}

		async handleHttpRequest(request) {
			return handleHttp(this, request)
		}

		startHub() {
			const c = this.config
			this.updateStatus(InstanceStatus.Connecting)
			if (Number(c.clientPort) === Number(c.recvPort)) {
				this.updateStatus(InstanceStatus.BadConfig, 'The client port must differ from the console send port')
				return
			}
			this.hub = new Hub(
				{
					host: c.host,
					sendPort: Number(c.sendPort),
					recvPort: Number(c.recvPort),
					clientPort: Number(c.clientPort),
					fixedClients: parseFixedClients(c.fixedClients),
					rate: Number(c.rate) || DEFAULTS.rate,
				},
				{
					onChange: () => this.scheduleRefresh(),
					log: (level, text) => this.log(level, text),
					onStatus: (ok, text) =>
						this.updateStatus(ok ? InstanceStatus.Ok : InstanceStatus.ConnectionFailure, ok ? null : text),
				},
			)
			this.setActionDefinitions(getActions(this))
			this.setFeedbackDefinitions(getFeedbacks(this))
			this.setVariableDefinitions(getVariableDefinitions())
			const { structure, presets } = getPresets(this.label)
			this.setPresetDefinitions(structure, presets)
			try {
				this.hub.start()
			} catch (err) {
				this.updateStatus(InstanceStatus.UnknownError, String(err.message || err))
			}
			this.refresh()
		}

		async stopHub() {
			await this.hub?.stop()
			this.hub = null
		}

		scheduleRefresh() {
			if (this.refreshTimer) return
			this.refreshTimer = setTimeout(() => {
				this.refreshTimer = null
				this.refresh()
			}, 50)
		}

		refresh() {
			if (!this.hub) return
			this.setVariableValues(getVariableValues(this.hub))
			this.checkAllFeedbacks()
		}
	}
}
