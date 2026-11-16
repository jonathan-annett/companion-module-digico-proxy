// Checks the module against the real Companion SDK.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { InstanceBase } from '@companion-module/base'
import { validateManifest } from '@companion-module/base/manifest'
import { getActions } from '../src/actions.js'
import { getFeedbacks } from '../src/feedbacks.js'
import { getVariableDefinitions } from '../src/variables.js'
import { getPresets } from '../src/presets.js'
import { DEFAULTS, getConfigFields } from '../src/config.js'

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const manifest = JSON.parse(read('companion/manifest.json'))
const pkg = JSON.parse(read('package.json'))

test('manifest passes the SDK validator', () => {
	validateManifest(manifest, false)
})

test('manifest, package.json and changelog agree on name and version', () => {
	assert.equal(manifest.id, pkg.name)
	assert.equal(manifest.version, pkg.version)
	assert.ok(pkg.repository.url.endsWith(`companion-module-${manifest.id}.git`))
	assert.ok(read('CHANGELOG.md').includes(`## [${pkg.version}]`), 'CHANGELOG has an entry for this version')
	assert.ok(fs.existsSync(new URL('../companion/HELP.md', import.meta.url)))
})

test('name shown in Companion is one short product', () => {
	assert.equal(manifest.manufacturer, 'DiGiCo')
	assert.equal(manifest.products.length, 1)
})

test('entry point exports an InstanceBase subclass and an UpgradeScripts array', async () => {
	const main = await import('../src/main.js')
	assert.ok(main.default.prototype instanceof InstanceBase)
	assert.ok(Array.isArray(main.UpgradeScripts))
	for (const method of ['init', 'destroy', 'configUpdated', 'getConfigFields', 'handleHttpRequest']) {
		assert.equal(typeof main.default.prototype[method], 'function', method)
	}
})

test('settings: every field has a default, ids are unique, and the console row shows the saved ports', () => {
	const fields = getConfigFields({ host: '10.1.2.3', sendPort: 9101, recvPort: 9100, clientPort: 9200 }, 'FOH proxy')
	const ids = fields.map((f) => f.id)
	assert.equal(new Set(ids).size, ids.length)
	for (const field of fields) if (field.type !== 'static-text') assert.ok(field.id in DEFAULTS, field.id)
	const byId = Object.fromEntries(fields.map((f) => [f.id, f]))
	assert.deepEqual([byId.consoleSend.value, byId.consoleRcv.value], ['9100', '9101'])
	assert.ok(byId.clientHeading.value.includes('<b>9200</b>'), 'tells the user which port to point tools at')
	assert.ok(byId.webPage.value.includes('href="/instance/FOH%20proxy/"'))
})

test('actions, feedbacks and presets are well formed and refer only to things that exist', async () => {
	const self = { hub: null }
	const actions = getActions(self)
	const feedbacks = getFeedbacks(self)
	const variables = getVariableDefinitions()
	for (const [id, def] of Object.entries(actions)) {
		assert.ok(def.name && Array.isArray(def.options) && typeof def.callback === 'function', id)
		await def.callback({ options: { seconds: 1, path: '/x', type: '', value: '' } }) // harmless while stopped
	}
	for (const [id, def] of Object.entries(feedbacks)) {
		assert.equal(def.type, 'boolean', id)
		assert.equal(def.callback({ options: {} }), false, `${id} is false while stopped`)
	}
	const { structure, presets } = getPresets('proxy')
	for (const [id, preset] of Object.entries(presets)) {
		for (const [, name] of preset.style.text.matchAll(/\$\(proxy:([a-z0-9_]+)\)/g))
			assert.ok(variables[name], `${id}: ${name}`)
		for (const a of preset.steps.flatMap((step) => [...step.down, ...step.up]))
			assert.ok(actions[a.actionId], `${id}: ${a.actionId}`)
		for (const f of preset.feedbacks) assert.ok(feedbacks[f.feedbackId] && f.style, `${id}: ${f.feedbackId}`)
	}
	assert.deepEqual(
		structure.flatMap((s) => s.definitions.flatMap((d) => d.presets)).sort(),
		Object.keys(presets).sort(),
	)
})
