// The browser page served by the module. One self-contained document; it talks to the
// module through the small JSON API in http.js using paths relative to its own URL.
// String.raw keeps the backslashes in the embedded script intact. The embedded script
// must not contain backticks or dollar-brace sequences. The one substitution is the setup
// screenshot, placed in the stylesheet.

import { SETUP_IMAGE } from './setup-image.js'

export const PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DiGiCo Proxy</title>
<style>
:root {
	--bg: #16181b; --panel: #1f2226; --panel2: #272b30; --line: #353a41;
	--text: #e6e8ea; --dim: #8b939c; --accent: #f0a020; --accent-ink: #1a1203;
	--ok: #3fb96b; --bad: #e0523f; --blue: #4a9cf0;
	--mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body { background: var(--bg); color: var(--text); font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; display: flex; flex-direction: column; }
header { display: flex; align-items: center; gap: 16px; padding: 10px 16px; background: var(--panel); border-bottom: 1px solid var(--line); flex-wrap: wrap; }
header h1 { font-size: 15px; margin: 0; letter-spacing: .08em; text-transform: uppercase; }
.lamp { width: 9px; height: 9px; border-radius: 50%; background: var(--bad); display: inline-block; margin-right: 6px; }
.lamp.on { background: var(--ok); }
.stat { color: var(--dim); font-size: 13px; }
.stat b { color: var(--text); font-weight: 600; }
.chip { font: 600 11px var(--mono); padding: 2px 6px; border-radius: 3px; background: var(--panel2); color: var(--dim); margin-right: 4px; }
.chip.on { background: var(--accent); color: var(--accent-ink); }
nav { display: flex; gap: 2px; padding: 0 16px; background: var(--panel); border-bottom: 1px solid var(--line); }
nav button { background: none; border: 0; border-bottom: 2px solid transparent; color: var(--dim); padding: 10px 14px; font: inherit; cursor: pointer; }
nav button.on { color: var(--text); border-bottom-color: var(--accent); }
main { flex: 1; min-height: 0; display: flex; }
.list { width: 300px; flex: none; overflow: auto; border-right: 1px solid var(--line); background: var(--panel); }
.row { display: flex; gap: 10px; align-items: baseline; padding: 8px 14px; border-bottom: 1px solid var(--line); cursor: pointer; }
.row:hover { background: var(--panel2); }
.row.on { background: var(--panel2); box-shadow: inset 3px 0 0 var(--accent); }
.row .num { font: 600 13px var(--mono); color: var(--accent); width: 30px; flex: none; text-align: right; }
.row.empty .num { color: var(--line); }
.row .what { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .meta { color: var(--dim); font-size: 12px; white-space: nowrap; }
.kind { font: 600 10.5px var(--mono); text-transform: uppercase; letter-spacing: .04em; padding: 2px 6px; border-radius: 3px; color: #fff; white-space: nowrap; vertical-align: middle; }
.kind.capture { background: #008c3c; } .kind.script { background: #7832aa; } .kind.names { background: #007887; }
.row.k-capture .num { color: #3fd07c; } .row.k-script .num { color: #c08af0; } .row.k-names .num { color: #39c6d6; }
.row.empty .what { color: var(--dim); }
.detail { flex: 1; min-width: 0; overflow: auto; padding: 18px 22px 60px; }
.detail h2 { margin: 0 0 4px; font-size: 18px; }
.sub { color: var(--dim); margin: 0 0 16px; font-size: 13px; }
.bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 14px; }
label.f { display: inline-flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--dim); }
input, select { background: var(--bg); color: var(--text); border: 1px solid var(--line); border-radius: 4px; padding: 6px 8px; font: inherit; }
input:focus, select:focus { outline: 1px solid var(--accent); border-color: var(--accent); }
input.n { width: 76px; font-family: var(--mono); }
input.v { width: 130px; font-family: var(--mono); text-align: right; }
input.changed { border-color: var(--accent); }
button.b { background: var(--panel2); color: var(--text); border: 1px solid var(--line); border-radius: 4px; padding: 6px 12px; font: inherit; cursor: pointer; }
button.b:hover { border-color: var(--dim); }
button.b.go { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); font-weight: 600; }
button.b.danger { color: var(--bad); }
button.x { background: none; border: 0; color: var(--dim); cursor: pointer; font-size: 15px; padding: 2px 6px; }
button.x:hover { color: var(--bad); }
details { border: 1px solid var(--line); border-radius: 6px; margin: 0 0 10px; background: var(--panel); }
summary { padding: 9px 12px; cursor: pointer; font-weight: 600; display: flex; gap: 10px; align-items: center; }
summary .count { color: var(--dim); font-weight: 400; font-size: 12px; }
summary .grow { flex: 1; }
table { border-collapse: collapse; width: 100%; }
td { padding: 3px 12px; border-top: 1px solid var(--line); }
td.k { font-family: var(--mono); font-size: 12.5px; color: var(--dim); }
td.k b { color: var(--text); font-weight: 500; }
td.r { text-align: right; width: 1%; white-space: nowrap; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 6px 14px; }
.cell { display: flex; align-items: center; gap: 8px; }
.cell span { font: 12.5px var(--mono); color: var(--dim); width: 28px; text-align: right; flex: none; }
.cell input { flex: 1; min-width: 0; }
.note { color: var(--dim); font-size: 12.5px; max-width: 70ch; }
.empty-state { color: var(--dim); padding: 40px 0; max-width: 56ch; }
.shot { position: relative; width: calc(545px * var(--k)); height: calc(602px * var(--k)); --k: 1.5; background-image: url(${SETUP_IMAGE}); background-size: 100% 100%; border-radius: 4px; font-family: Arial, Helvetica, sans-serif; margin-bottom: 18px; }
.shot-wrap { overflow-x: auto; }
.shot .at { position: absolute; display: flex; align-items: center; white-space: nowrap; overflow: hidden; font-size: calc(12.5px * var(--k)); padding-left: calc(3px * var(--k)); color: #2c2c7a; }
.shot .cell { background: #bec6cb; }
.shot .foot { background: #aeb3b7; color: #111; }
.shot .name { color: #000; font-weight: 700; }
.shot .tick { background: #bec6cb; color: #0f9a2a; font-weight: 700; justify-content: center; padding: 0; font-size: calc(15px * var(--k)); }
.shot .want { outline: calc(2px * var(--k)) solid #d4380d; background: #fff3c4; font-weight: 700; }
.shot input.at { background: #fff; color: #111; border: calc(1.5px * var(--k)) solid #d4380d; border-radius: 2px; padding: 0 calc(3px * var(--k)); font-family: inherit; }
.shot input.at::placeholder { color: #9a6a5a; }
.shot .hint { position: absolute; color: #b3200a; font-weight: 700; font-size: calc(12px * var(--k)); white-space: nowrap; background: rgba(255, 243, 196, 0.94); border: 1px solid #d4380d; border-radius: 3px; padding: calc(2px * var(--k)) calc(6px * var(--k)); }
.shot .hint.flash { animation: flash 0.9s steps(2, jump-none) infinite; }
@keyframes flash { from { opacity: 1; } to { opacity: 0.15; } }
@media (prefers-reduced-motion: reduce) { .shot .hint.flash { animation: none; } }
@media (max-width: 900px) { .shot { --k: 1; } }
.steps { max-width: 70ch; padding-left: 20px; }
.steps li { margin: 6px 0; }
table.log { border: 1px solid var(--line); border-radius: 6px; }
table.log th { text-align: left; padding: 6px 12px; color: var(--dim); font-weight: 500; font-size: 12px; background: var(--panel); position: sticky; top: 0; }
table.log td { padding: 4px 12px; vertical-align: baseline; }
table.log tr.ev td { color: var(--accent); }
table.log .was { color: var(--dim); }
#logfilter { width: 220px; }
table.log tr.out td { color: var(--dim); }
table.log tr.out td b { color: var(--text); }
table.log tr.idle td { color: var(--dim); }
table.log .lamp { margin-right: 8px; }
#toast { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); background: var(--panel2); border: 1px solid var(--line); padding: 8px 14px; border-radius: 6px; opacity: 0; transition: opacity .2s; pointer-events: none; }
#toast.show { opacity: 1; }
#toast.bad { border-color: var(--bad); color: var(--bad); }
@media (max-width: 760px) { main { flex-direction: column; } .list { width: auto; max-height: 34vh; border-right: 0; border-bottom: 1px solid var(--line); } }
</style>
</head>
<body>
<header>
	<h1>DiGiCo Proxy</h1>
	<span class="stat"><span class="lamp" id="lamp"></span><b id="console">No console</b></span>
	<span class="stat" id="state"></span>
</header>
<nav id="nav"></nav>
<main id="main"></main>
<div id="toast"></div>
<script>
(function () {
	'use strict'
	var base = location.pathname.replace(/\/?$/, '/')
	var S = { status: null, tab: 'clients' }
	var TABS = [['clients', 'Clients'], ['traffic', 'Traffic'], ['send', 'Send'], ['setup', 'Setup']]
	var TR = { entries: [], seq: 0, filter: '', paused: false }
	var CAP = { running: false, captures: [] }

	function h(tag, attrs) {
		var el = document.createElement(tag)
		for (var k in attrs || {}) {
			var v = attrs[k]
			if (v === null || v === undefined || v === false) continue
			if (k === 'class') el.className = v
			else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v)
			else if (k === 'value') el.value = v
			else if (k === 'checked' || k === 'selected' || k === 'open' || k === 'disabled') el[k] = !!v
			else el.setAttribute(k, v)
		}
		for (var i = 2; i < arguments.length; i++) add(el, arguments[i])
		return el
	}
	function add(el, child) {
		if (child === null || child === undefined || child === false) return
		if (Array.isArray(child)) child.forEach(function (c) { add(el, c) })
		else el.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)))
	}
	function $(id) { return document.getElementById(id) }
	function clone(x) { return JSON.parse(JSON.stringify(x)) }

	var toastTimer
	function toast(text, bad) {
		var t = $('toast')
		t.textContent = text
		t.className = 'show' + (bad ? ' bad' : '')
		clearTimeout(toastTimer)
		toastTimer = setTimeout(function () { t.className = '' }, bad ? 5000 : 2200)
	}

	function api(path, body) {
		var opts = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
		return fetch(base + path, opts).then(function (res) {
			return res.json().then(function (data) {
				if (!res.ok || data.error) throw new Error(data.error || ('HTTP ' + res.status))
				return data
			})
		})
	}
	function fail(err) { toast(err.message || String(err), true) }


	function when(iso) {
		var d = new Date(iso)
		return isNaN(d) ? '' : d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
	}
	function clock(t) {
		var d = new Date(t)
		var p2 = function (n) { return (n < 10 ? '0' : '') + n }
		var ms = d.getMilliseconds()
		return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) + '.' + (ms < 100 ? '0' : '') + (ms < 10 ? '0' : '') + ms
	}
	function showArgs(args) {
		return (args || []).map(function (a) { return typeof a === 'number' ? Math.round(a * 1000) / 1000 : String(a) }).join(' ')
	}
	function ago(ms) {
		if (ms === null || ms === undefined) return 'never'
		if (ms < 1500) return 'now'
		if (ms < 90000) return Math.round(ms / 1000) + ' s ago'
		return Math.round(ms / 60000) + ' min ago'
	}

	// ---- clients --------------------------------------------------------------------

	// The outgoing WebSocket to an EQ agent, if an address is set in the settings
	function agentBox(a) {
		if (!a || a.state === 'off') return null
		var up = a.state === 'connected'
		var words = { idle: 'Not tried yet', connecting: 'Connecting', connected: 'Connected', failed: 'Not connected', closed: 'Closed' }
		return h('div', {},
			h('h2', { style: 'margin-top:26px' }, 'EQ agent'),
			h('p', { class: 'note', style: 'color:var(--text);font-size:14px' },
				h('span', { class: 'lamp' + (up ? ' on' : '') }),
				(words[a.state] || a.state) + (a.detail ? ': ' + a.detail : '') + '. ',
				h('span', { class: 'k' }, a.url),
				up ? ' has carried out ' + a.commands + (a.commands === 1 ? ' command.' : ' commands.') : ''),
			h('p', { class: 'note' }, 'It can read and set graphic EQs and group EQs. Its traffic is shown on the Traffic tab as "EQ agent". The address is tried once when the connection starts.'),
			up || a.state === 'connecting' ? null : h('button', { class: 'b', onclick: function () {
				api('api/agent/connect', {}).then(loadStatus).catch(fail)
			} }, 'Try to connect now'))
	}

	function viewClients() {
		var st = S.status, su = st.setup
		var here = su.ip || 'this computer'
		return h('div', { class: 'detail' },
			h('h2', {}, 'Clients'),
			h('p', { class: 'sub' }, st.activeClients + (st.activeClients === 1 ? ' client' : ' clients') + ' connected. ' + st.totals.toConsole + ' messages sent to the console, ' + st.totals.fromConsole + ' received' + (st.totals.dropped ? ', ' + st.totals.dropped + ' dropped' : '') + '.'),
			st.clients.length ? h('table', { class: 'log' },
				h('thead', {}, h('tr', {}, ['Client', 'Address', 'Last heard', 'Sent to console', 'Received', 'Waiting'].map(function (c) { return h('th', {}, c) }))),
				h('tbody', {}, st.clients.map(function (c) {
					return h('tr', { class: c.active ? '' : 'idle' },
						h('td', {}, h('span', { class: 'lamp' + (c.active ? ' on' : '') }), c.name, c.fixed ? h('span', { class: 'chip' }, 'LISTED') : null),
						h('td', { class: 'k' }, c.address),
						h('td', {}, ago(c.idleMs)),
						h('td', { class: 'k' }, c.fromClient),
						h('td', { class: 'k' }, c.toClient),
						h('td', { class: 'k' }, c.queued))
				}))) : h('div', { class: 'empty-state' }, 'Nothing is connected yet.'),
			agentBox(st.agent),
			h('h2', { style: 'margin-top:26px' }, 'Connecting a tool'),
			h('p', { class: 'note', style: 'color:var(--text);font-size:14px' }, 'In the tool, wherever it asks for the console, enter this computer and the proxy\u2019s client port instead:'),
			h('table', { class: 'log', style: 'max-width:560px' },
				h('tbody', {},
					h('tr', {}, h('td', {}, 'Console address'), h('td', { class: 'k' }, h('b', {}, here), '  (or 127.0.0.1 on this same computer)')),
					h('tr', {}, h('td', {}, 'Console receive port'), h('td', { class: 'k' }, h('b', {}, st.clientPort))),
					h('tr', {}, h('td', {}, 'The tool\u2019s own listening port'), h('td', {}, 'Any free port. The proxy answers wherever the tool sends from.')))),
			h('p', { class: 'note' }, 'The DiGiCo iPad app listens on a port of its own, so list it in this connection\u2019s settings as iPad=address:port. A client that sends nothing for 30 seconds is dropped from this list and reappears when it speaks again.'))
	}

	// ---- traffic --------------------------------------------------------------------

	function pollTrace() {
		if (TR.paused) return Promise.resolve()
		return api('api/trace?since=' + TR.seq).then(function (r) {
			if (r.seq < TR.seq) TR.entries = []
			TR.seq = r.seq
			if (!r.entries.length) return
			TR.entries = TR.entries.concat(r.entries)
			if (TR.entries.length > 3000) TR.entries.splice(0, TR.entries.length - 3000)
			if (S.tab === 'traffic') drawTrace()
		})
	}
	function traceMatches(e) {
		if (!TR.filter) return true
		var hay = (e.direction + ' ' + e.who + ' ' + e.path + ' ' + showArgs(e.args)).toLowerCase()
		return TR.filter.toLowerCase().split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0 })
	}
	function drawTrace() {
		var body = $('tracerows')
		if (!body) return
		body.textContent = ''
		var shown = TR.entries.filter(traceMatches)
		shown.slice(-400).reverse().forEach(function (e) {
			var out = e.direction === 'to console'
			body.appendChild(h('tr', { class: out ? 'out' : '' },
				h('td', { class: 'k' }, clock(e.t)),
				h('td', {}, out ? e.who + ' \u2192 console' : 'console \u2192 ' + e.who),
				h('td', { class: 'k' }, e.path),
				h('td', {}, h('b', {}, showArgs(e.args)), e.types ? h('span', { class: 'was' }, '  ' + e.types) : null)))
		})
		var note = $('tracenote')
		if (note) note.textContent = shown.length + ' messages' + (shown.length > 400 ? ', newest 400 shown' : '') + (TR.filter ? ' matching the filter' : '') + '.'
	}
	function viewTraffic() {
		var st = S.status
		var view = h('div', { class: 'detail' },
			h('h2', {}, 'Traffic'),
			h('p', { class: 'sub' }, 'Everything passing through the proxy, newest first. An answer to a query goes only to the client that asked; everything else goes to every client.'),
			h('div', { class: 'bar' },
				h('button', { class: 'b', onclick: function () { TR.paused = !TR.paused; render() } }, TR.paused ? 'Resume' : 'Pause'),
				h('input', { id: 'logfilter', placeholder: 'filter, e.g. "fader" or "ipad"', value: TR.filter, oninput: function (e) { TR.filter = e.target.value; drawTrace() } }),
				h('label', {}, h('input', { type: 'checkbox', checked: st.traceMeters, onchange: function (e) {
					api('api/trace/meters', { on: e.target.checked }).then(loadStatus).catch(fail)
				} }), ' Show meter traffic'),
				h('button', { class: 'b danger', onclick: function () {
					api('api/trace/clear', {}).then(function () { TR.entries = []; drawTrace() }).catch(fail)
				} }, 'Clear')),
			h('details', { open: CAP.running || CAP.captures.length > 0 },
				h('summary', {}, 'Capture to a file', h('span', { class: 'count' }, CAP.running ? 'recording\u2026' : CAP.captures.length + ' held')),
				h('div', { style: 'padding: 0 12px 10px' },
					h('p', { class: 'note' }, 'Records every datagram in both directions for 10 seconds, meters included, with timings, raw bytes and which client it came from or went to. Useful for working out how the iPad app asks the console for something: start it, then do the thing on the iPad.'),
					h('div', { class: 'bar' },
						h('button', { class: 'b' + (CAP.running ? '' : ' go'), disabled: CAP.running, onclick: function () {
							api('api/capture', { seconds: 10 }).then(function () { CAP.running = true; render() }).catch(fail)
						} }, CAP.running ? 'Recording for 10 seconds\u2026' : 'Capture for 10 seconds')),
					CAP.captures.slice().reverse().map(function (c) {
						return h('div', { class: 'bar' },
							h('span', {}, when(c.when) + ' \u00b7 ' + c.count + ' datagrams'),
							h('button', { class: 'b', onclick: function () {
								api('api/captures?id=' + c.id).then(function (full) {
									var blob = new Blob([JSON.stringify(full)], { type: 'application/json' })
									var a = h('a', { href: URL.createObjectURL(blob), download: 'digico-proxy-capture-' + c.when.replace(/[:.]/g, '-') + '.json' })
									document.body.appendChild(a); a.click(); a.remove()
								}).catch(fail)
							} }, 'Download'))
					}))),
			h('p', { class: 'note', id: 'tracenote' }, ''),
			h('table', { class: 'log' },
				h('thead', {}, h('tr', {}, ['Time', 'Route', 'Address', 'Value'].map(function (c) { return h('th', {}, c) }))),
				h('tbody', { id: 'tracerows' })))
		setTimeout(drawTrace, 0)
		return view
	}

	// ---- send -----------------------------------------------------------------------

	var SEND = { path: '/Console/Name/?', type: '', value: '' }
	function viewSend() {
		var go = function () {
			var args = SEND.type ? [SEND.type === 's' ? SEND.value : Number(SEND.value)] : []
			api('api/send', { path: SEND.path.trim(), types: SEND.type, args: args }).then(function () {
				toast('Sent. Watch the Traffic tab for the answer.')
			}).catch(fail)
		}
		return h('div', { class: 'detail' },
			h('h2', {}, 'Send a command'),
			h('p', { class: 'sub' }, 'Sends one OSC message to the console, as a client called "web page". For finding out what the console does with something.'),
			h('div', { class: 'bar' },
				h('label', { class: 'f' }, 'Address', h('input', { style: 'width:420px', value: SEND.path, oninput: function (e) { SEND.path = e.target.value } })),
				h('label', { class: 'f' }, 'Value type', h('select', { onchange: function (e) { SEND.type = e.target.value; render() } },
					[['', 'None'], ['f', 'Number'], ['i', 'Whole number'], ['s', 'Text']].map(function (o) { return h('option', { value: o[0], selected: o[0] === SEND.type }, o[1]) }))),
				SEND.type ? h('label', { class: 'f' }, 'Value', h('input', { value: SEND.value, oninput: function (e) { SEND.value = e.target.value } })) : null),
			h('div', { class: 'bar' }, h('button', { class: 'b go', onclick: go }, 'Send'),
				h('button', { class: 'b', onclick: function () { S.tab = 'traffic'; render() } }, 'Go to Traffic')),
			h('p', { class: 'note' }, 'To read a value, add /? to its address and send it with no value, for example /Input_Channels/1/fader/?. To set one, give the address and a number, for example /Input_Channels/1/fader with -10. A command with a value changes the console, so take care on a live show.'))
	}

	// ---- setup ----------------------------------------------------------------------

	// The console's External Control page, with this installation's values drawn on top.
	// The operator types the console's own address (shown on the console's "Local ... IP"
	// line); the module works out which of this computer's addresses the console can reach
	// and shows exactly what to enter in the console's device row.
	var SETUP = { typed: null, result: null, busy: false }

	function validIp(text) {
		var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(text).trim())
		return !!m && m.slice(1).every(function (n) { return Number(n) <= 255 })
	}

	function viewSetup() {
		var st = S.status
		if (SETUP.typed === null) SETUP.typed = st.online ? st.setup.consoleIp : ''
		var known = validIp(SETUP.typed)
		var su = known ? (SETUP.result && SETUP.result.consoleIp === SETUP.typed.trim() ? SETUP.result : (st.setup.consoleIp === SETUP.typed.trim() ? st.setup : null)) : null
		if (known && !su && !SETUP.busy) {
			SETUP.busy = true
			api('api/setup/resolve', { ip: SETUP.typed.trim() }).then(function (r) { SETUP.result = r.setup })
				.catch(fail).then(function () { SETUP.busy = false; if (S.tab === 'setup') render() })
		}
		var px = function (x, y, w, hgt) {
			return 'left:calc(' + x + 'px * var(--k));top:calc(' + y + 'px * var(--k));width:calc(' + w + 'px * var(--k));height:calc(' + hgt + 'px * var(--k))'
		}
		var at = function (cls, x, y, w, hgt, text) { return h('div', { class: 'at ' + cls, style: px(x, y, w, hgt) }, text) }
		var hint = function (x, y, text, flash) {
			return h('div', { class: 'hint' + (flash ? ' flash' : ''), style: 'left:calc(' + x + 'px * var(--k));top:calc(' + y + 'px * var(--k))' }, text)
		}
		var input = h('input', { class: 'at', id: 'consoleip', style: px(203, 543, 104, 19), placeholder: 'console ip here', value: SETUP.typed, inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false',
			oninput: function (e) {
				var was = validIp(SETUP.typed)
				SETUP.typed = e.target.value
				if (validIp(SETUP.typed) || was) render()
			} })
		var saved = known && st.setup.consoleIp === SETUP.typed.trim()
		var shot = h('div', { class: 'shot' },
			at('cell name', 92, 362, 89, 19, 'Proxy'),
			at('cell' + (su ? ' want' : ''), 183, 362, 95, 19, su && su.ip ? su.ip : '??'),
			at('cell' + (su ? ' want' : ''), 280, 362, 42, 19, st.setup.send),
			at('cell' + (su ? ' want' : ''), 324, 362, 42, 19, st.setup.rcv),
			at('tick', 368, 362, 39, 19, '✓'),
			at('foot', 66, 543, 119, 20, st.online && saved && st.consoleName ? st.consoleName : '(the Console Name)'),
			input,
			su ? hint(150, 386, '▲ set this on the console', true)
				: hint(203, 518, '▼ type the IP shown here on your console', true),
			su ? h('div', { class: 'hint', style: 'right:calc(8px * var(--k));top:calc(540px * var(--k))' }, '▼ then press load') : null)
		var message
		if (!known) message = 'On the console open Setup > External Control. At the bottom is a line reading "Local: ... IP: ...". Type that IP address into the box on the picture.'
		else if (!su) message = 'Working out this computer’s address…'
		else if (!su.ip) message = 'This computer has no network address. Connect it to the console’s network and try again.'
		else if (!su.ipMatched) message = 'None of this computer’s addresses (' + [su.ip].concat(su.otherIps).join(', ') + ') is on the same network as ' + su.consoleIp + '. ' + su.ip + ' is shown as a guess; check the console address, or put both machines on the same network.'
		else message = 'This computer is ' + su.ip + ' on the console’s network. On the console, press "add device", choose DiGiCo Pad, and enter the highlighted IP Address, Send and Rcv. Then touch Enabled so it shows a tick, and make sure Enable External Control says YES. Finally press "load" next to "commands allowed" and choose the iPad command set (for example ipad_q3 on a Quantum 338). Without a command set loaded the console ignores this module.'

		return h('div', { class: 'detail' },
			h('h2', {}, 'Console setup'),
			h('p', { class: 'sub' }, st.online ? 'Connected' + (st.consoleName ? ' to ' + st.consoleName : '') + ' at ' + st.setup.consoleIp + '.' : 'No reply from the console yet.'),
			h('div', { class: 'shot-wrap' }, shot),
			h('p', { class: 'note', style: 'color:var(--text);font-size:14px' }, message),
			h('div', { class: 'bar' },
				h('button', { class: 'b' + (known && !saved ? ' go' : ''), disabled: !known || saved, onclick: function () {
					api('api/setup/apply', { ip: SETUP.typed.trim() }).then(function () { toast('Saved. Connecting to ' + SETUP.typed.trim()); return loadStatus() })
						.then(render).catch(fail)
				} }, saved ? 'The proxy is using this console address' : 'Use this console address in the proxy')),
			su && su.otherIps.length && su.ipMatched ? h('p', { class: 'note' }, 'This computer’s other addresses: ' + su.otherIps.join(', ') + '.') : null,
			h('p', { class: 'note' }, 'Leave "OSC generic" off; this module does not use it. If the console is the DiGiCo offline software on a Windows PC, allow inbound UDP port ' + st.setup.rcv + ' through Windows Firewall, and check that this computer’s own firewall allows incoming connections for Companion.'))
	}


	// ---- shell ----------------------------------------------------------------------

	function renderHeader() {
		var st = S.status
		if (!st) return
		$('lamp').className = 'lamp' + (st.online ? ' on' : '')
		$('console').textContent = st.online ? (st.consoleName || 'Console connected') : 'No reply from console'
		$('state').textContent = st.activeClients + (st.activeClients === 1 ? ' client' : ' clients') + (st.capturing ? ' \u00b7 capturing' : '')
	}

	function render() {
		var nav = $('nav')
		nav.textContent = ''
		TABS.forEach(function (t) {
			nav.appendChild(h('button', { class: t[0] === S.tab ? 'on' : '', onclick: function () { S.tab = t[0]; render() } }, t[1]))
		})
		var main = $('main')
		var typingIp = document.activeElement && document.activeElement.id === 'consoleip'
		var typingFilter = document.activeElement && document.activeElement.id === 'logfilter'
		main.textContent = ''
		if (!S.status) { add(main, h('div', { class: 'detail' }, h('div', { class: 'empty-state' }, 'Loading\u2026'))); return }
		add(main, S.tab === 'clients' ? viewClients() : S.tab === 'traffic' ? viewTraffic() : S.tab === 'send' ? viewSend() : viewSetup())
		if (typingFilter && $('logfilter')) { $('logfilter').focus(); $('logfilter').setSelectionRange($('logfilter').value.length, $('logfilter').value.length) }
		if (typingIp && $('consoleip')) { $('consoleip').focus(); $('consoleip').setSelectionRange($('consoleip').value.length, $('consoleip').value.length) }
	}

	function loadStatus() {
		return api('api/status').then(function (st) { S.status = st; renderHeader() })
	}

	loadStatus().then(function () {
		if (!S.status.online) S.tab = 'setup'
		render()
	}).catch(fail)
	setInterval(function () {
		loadStatus().then(function () {
			var typing = document.activeElement && /INPUT|SELECT/.test(document.activeElement.tagName)
			if ((S.tab === 'clients' || S.tab === 'setup') && !typing) render()
		}).catch(function () { $('lamp').className = 'lamp'; $('console').textContent = 'Companion not reachable' })
	}, 2000)
	setInterval(function () {
		if (S.tab !== 'traffic') return
		pollTrace().catch(function () {})
		api('api/captures').then(function (r) {
			var changed = r.running !== CAP.running || r.captures.length !== CAP.captures.length
			CAP.running = r.running
			CAP.captures = r.captures
			if (changed && !(document.activeElement && document.activeElement.id === 'logfilter')) render()
		}).catch(function () {})
	}, 700)
})()
</script>
</body>
</html>
`
