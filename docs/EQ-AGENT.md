# The EQ agent link

For software that works out EQ changes (a speaker-tuning agent, say) and needs to read and
set graphic EQs and group EQs on the console.

**Status: built and tested against a simulated console only.** Nothing here has yet been
run against a console or the offline software. Items marked "to confirm" depend on that.

## How it connects

The proxy connects **out** to your software; your software is the WebSocket server.

- Set the connection's **EQ agent** setting to the server's address, for example
  `ws://192.168.1.30:8765`. `wss://` works too.
- The proxy tries it **once** when the connection starts. If the server is not there it
  does not keep trying. To try again: the Companion action "Connect to the EQ agent", the
  button on the web page's Clients tab, or save the settings again.
- If the server closes the link, the proxy does not reconnect by itself either.

`node tools/agent-example.mjs` is a small server that lists the graphic EQs and groups and
prints the first of each, for checking the link before the real agent is involved.

## Messages

Every message is a JSON text frame.

On connecting the proxy sends:

```json
{
	"type": "hello",
	"protocol": "digico-proxy-eq",
	"version": 1,
	"console": "Quantum338",
	"consoleOnline": true,
	"commands": [
		"ping",
		"geq.list",
		"geq.info",
		"geq.get",
		"geq.set",
		"group.list",
		"group.eq.info",
		"group.eq.get",
		"group.eq.set"
	]
}
```

After that the server sends commands and the proxy answers each one:

```json
{ "id": 7, "cmd": "geq.get", "index": 3 }
{ "id": 7, "ok": true, "result": { ... } }
{ "id": 7, "ok": false, "error": "Graphic EQ 3 did not answer" }
```

`id` is yours: any JSON value, returned unchanged. Commands are carried out one at a time
in the order they arrive, so a `set` followed by a `get` reads the result of the `set`.

## Commands

| Command         | Parameters                    | Result                                                     |
| --------------- | ----------------------------- | ---------------------------------------------------------- |
| `ping`          |                               | `{ console, consoleOnline }`                               |
| `geq.list`      |                               | `{ graphicEqs: [{ index, name }] }`                        |
| `geq.info`      |                               | limits and characteristics of a graphic EQ                 |
| `geq.get`       | `index`                       | a graphic EQ state                                         |
| `geq.set`       | `index`, `state`              | `{ state, sent, notApplied? }`                             |
| `group.list`    |                               | `{ groups: [{ index, name }] }`                            |
| `group.eq.info` | `index` (optional, default 1) | limits and characteristics of a group's EQ on this console |
| `group.eq.get`  | `index`                       | a group EQ state                                           |
| `group.eq.set`  | `index`, `state`              | `{ state, sent, notApplied? }`                             |

`index` counts from 1, as on the console.

### Limits and characteristics

Ask these once after connecting, before working out a change.

`geq.info`:

```json
{
	"bands": 32,
	"gain": { "min": -12, "max": 12, "unit": "dB" },
	"trim": { "min": -18, "max": 18, "unit": "dB" },
	"spacing": "third octave",
	"frequencies": [20, 25, 31.5, 40, "... 32 in all ...", 25000],
	"frequenciesKnown": true,
	"source": "..."
}
```

`group.eq.info`:

```json
{
	"bands": [
		{
			"band": 1,
			"freq": { "min": 20, "max": 20000, "unit": "Hz" },
			"gain": { "min": -18, "max": 18, "unit": "dB" },
			"q": { "min": 0.1, "max": 20, "unit": "Q" },
			"curve": { "min": 1, "max": 4 }
		}
	],
	"curveNames": { "1": "bell", "2": "low shelf", "3": "high shelf", "4": "notch" },
	"curveNamesKnown": true,
	"preInsertSwitch": true,
	"filters": null,
	"notExposed": ["dynamic EQ settings of bands 1 to 4", "symmetric Q switch"],
	"source": "..."
}
```

- `bands` has one entry per band the console has (eight or four).
- The number of bands, the pre-insert switch and the filters are read from the console,
  so they are right for whichever console is connected. `filters` is `null` on consoles
  whose groups have none, and otherwise gives the range of each filter's frequency.
- The ranges are the ones in DiGiCo's command sets, and are the ones a `set` enforces.
- **Two things the console does not report**, so the proxy cannot know them unaided:
  - _Where the graphic EQ's bands are._ Set "frequency of graphic EQ band 1" in the
    proxy's settings to 16 Hz or 20 Hz (look at the console). `frequencies` is then the
    32 ISO third-octave centres from there. Until then it is `null` and
    `frequenciesKnown` is `false`.
  - _What the curve numbers mean._ Enter them in the settings, for example
    `1=bell, 2=low shelf, 3=high shelf, 4=notch`. That example is a guess, not a fact:
    check on the console. Until then `curveNames` is `null`.
- An agent should not assume either. If `frequenciesKnown` or `curveNamesKnown` is
  false, it should say so to its user rather than guess.
- Not described because not known: what Q means for a shelf, the slope of the filters,
  and whether every curve is available on every band.

### Graphic EQ state

```json
{ "index": 3, "name": "PB L", "in": true, "trim": 0, "gains": [0, 0, -1.5, ... 32 numbers ] }
```

- `gains`: 32 bands in dB, lowest frequency first, each from -12 to 12.
- `trim`: dB, -18 to 18. `in`: whether the graphic is switched in.
- The frequency of each band is in `geq.info`, once band 1 has been set in the proxy's
  settings. The console's command set numbers the bands 1 to 32 without frequencies.

### Group EQ state

```json
{ "index": 1, "name": "Band", "in": true, "preInsert": false,
  "bands": [ { "band": 1, "on": true, "freq": 80, "gain": 0, "q": 1, "curve": 2 }, ... ],
  "filters": { "hi": { "in": false, "freq": 80 }, "lo": { "in": false, "freq": 16000 } } }
```

- `bands`: **eight** on Quantum 338, SD5, SD7 and SD10; **four** on SD8, SD9, SD11 and
  SD12. The list holds whatever the console has.
- `freq` in Hz, 20 to 20000. `gain` in dB, -18 to 18. `q` from 0.1 to 20.
- `curve`: the console's own number for the band's shape, 1 to 4 (bands 5 to 8 also
  accept 0). What each number means is in `group.eq.info` once entered in the proxy's
  settings. Leave it out of a `set` to keep the shape.
- `preInsert`: only on the consoles with eight bands. `filters`: only on those with four.
- Not included: the dynamic EQ settings of bands 1 to 4. They are left as they are.

### Setting

`state` may be a whole state as returned by `get`, or just the parts to change:

```json
{ "id": 8, "cmd": "geq.set", "index": 3, "state": { "gains": [ ...32 numbers... ] } }
{ "id": 9, "cmd": "group.eq.set", "index": 1, "state": { "bands": [ { "band": 3, "freq": 315, "gain": -4, "q": 4 } ] } }
```

What the proxy does with a `set`:

1. **Checks the whole request first.** A value out of range, an unknown field, a band or
   setting this console does not have, or the wrong type refuses the whole request with
   an error. Nothing is sent to the console, not even the valid parts.
2. Reads the current state from the console.
3. **Sends only the values that differ.** Sending a state straight back sends nothing.
4. Reads the state again and returns it as `state`, with `sent` (how many values were
   sent). If the console did not take a value as sent, `notApplied` lists those fields
   (for example `"gains[2]"`, `"bands[3].freq"`), and `state` shows what the console has.

`name` and `index` inside `state` are ignored, so a state from `get` can be edited and
sent back unchanged in shape. `gains`, if present, must list all 32 bands.

A `set` is not all-or-nothing on the console itself: the console is sent one value at a
time, and if the link to it fails part way, some values will have changed. The answer's
`state` and `notApplied` always say what the console ended up with.

## Things to know

- **Ganged graphic EQs.** The console treats a value written to one of a ganged pair as
  that control being moved, and moves the other by the same amount (seen on the Quantum
  338 offline software). Set one side of a pair, not both: if the sides started the same
  they end the same. Setting both in turn would pull the first away again whenever the
  two differed.
- **Group EQ on stereo or ganged groups** is assumed to behave the same way; not yet seen.
- **Who else sees it.** Changes the agent makes are announced by the console to every
  other client of the proxy, like a change made on the surface. The agent's own traffic
  appears on the web page's Traffic tab as "EQ agent".
- **No approval step in the proxy.** It carries out what the server sends. Asking the
  operator first is the agent's job.
- **Errors.** `The console is not answering`, `Graphic EQ 9 did not answer`, `The console
has 24 of those`, and the checks listed above. The text is for people; test `ok`.
