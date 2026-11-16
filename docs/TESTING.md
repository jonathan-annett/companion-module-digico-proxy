# Testing

What has been tested, how, and what has not. Updated with every build that is handed over.

## 1. Automated tests

```
yarn install
yarn test
DIGICO_RECALL_DIR=<path to companion-module-digico-recall> yarn test   # adds the last file below
```

The tests run the real module code over real UDP sockets against `test/sim-console.mjs`,
a stand-in console that, like a DiGiCo console, talks to one fixed address: it answers
`/?` queries, applies and echoes values written to it, and announces "surface" changes.
Clients are plain UDP sockets, and in the last file two complete copies of the recall
module's engine.

**What the simulator cannot prove.** It behaves the way the console is understood to
behave. It does not show that a real console copes with the combined traffic of several
clients, that the DiGiCo iPad app accepts the proxy in place of a console, how meters
are requested, or that a console's graphic and group EQs answer and accept values in the
form the EQ agent link expects. Those are in the manual plan.

Each test's title says what it proves. The lists are generated from the test files.

### test/agent.test.mjs: the EQ agent link, with a real WebSocket server playing the agent

| #   | Test                                                                                  |
| --- | ------------------------------------------------------------------------------------- |
| 1   | on connecting, the proxy introduces itself and lists its commands                     |
| 2   | lists the graphic EQs and the groups, with names                                      |
| 3   | a console that does not say how many it has: the ones that answer are listed          |
| 4   | graphic EQ: read the whole state, set it, and only what differs is sent               |
| 5   | graphic EQ: a bad request is refused whole, and nothing reaches the console           |
| 6   | group EQ on a large console: eight bands and the pre-insert switch                    |
| 7   | group EQ on a compact console: four bands and bus filters; what it lacks is refused   |
| 8   | a value the console does not take is reported, not hidden                             |
| 9   | commands are carried out one at a time, in order; the traffic view names the agent    |
| 10  | another client sees the changes the agent makes, but not the answers to its questions |
| 11  | the address is tried once: no server means failed, and it does not keep trying        |
| 12  | the server going away closes the link; a bad address or none is reported, not thrown  |
| 13  | console not answering: commands fail with a reason instead of hanging                 |

### test/hub.test.mjs: the proxy itself, over real UDP sockets, each test on its own console

| #   | Test                                                                                      |
| --- | ----------------------------------------------------------------------------------------- |
| 1   | the proxy reaches the console and knows its name                                          |
| 2   | two clients share one console: both can write, both see changes made on the surface       |
| 3   | the answer to a query goes only to the client that asked                                  |
| 4   | when two clients ask for the same thing, each gets one answer                             |
| 5   | a query the console never answers does not swallow a later change to that address         |
| 6   | a listed client is answered on its set port, whatever port it sends from                  |
| 7   | fixed client list: names, defaults and junk                                               |
| 8   | the send rate is shared: clients take turns, and the total stays within the limit         |
| 9   | a client that goes quiet is forgotten, and comes back when it speaks                      |
| 10  | traffic view: who sent what, where answers went; meters hidden unless asked for           |
| 11  | sending a command from the web page: reaches the console, and the answer is not broadcast |
| 12  | capture: every datagram in both directions, with client names, timings and raw bytes      |
| 13  | packets the proxy cannot decode are still passed on, both ways                            |

### test/module.test.mjs: as Companion runs it: status, variables, feedbacks, actions and the web API

| #   | Test                                                                                     |
| --- | ---------------------------------------------------------------------------------------- |
| 1   | status, variables and feedbacks follow the console and the clients                       |
| 2   | web page and API: status, live traffic, send a command, capture and download             |
| 3   | actions: capture, clear the traffic view, send a command                                 |
| 4   | setup from the web page saves the console address and reconnects                         |
| 5   | a client port equal to the console port is refused with a clear status                   |
| 6   | EQ agent address in the settings: tried on start, shown in status, variable and feedback |
| 7   | stops cleanly                                                                            |

### test/sdk.test.mjs: against the Companion SDK

| #   | Test                                                                                           |
| --- | ---------------------------------------------------------------------------------------------- |
| 1   | manifest passes the SDK validator                                                              |
| 2   | manifest, package.json and changelog agree on name and version                                 |
| 3   | name shown in Companion is one short product                                                   |
| 4   | entry point exports an InstanceBase subclass and an UpgradeScripts array                       |
| 5   | settings: every field has a default, ids are unique, and the console row shows the saved ports |
| 6   | actions, feedbacks and presets are well formed and refer only to things that exist             |

### test/with-recall.test.mjs: the real recall module through the proxy (runs when `DIGICO_RECALL_DIR` is set)

| #   | Test                                                   |
| --- | ------------------------------------------------------ |
| 1   | two Recall engines share one console through the proxy |

## 2. Manual test plan

To be run with the Quantum 338 offline software first, then on consoles. Record results
in the test log.

| #   | Step                                                                                                                                                      | Expected                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| P1  | Console External Control set to this computer, ports 8000/8001, command set loaded. Add the proxy connection with the console's address                   | Connection goes green; the console's name shows on the web page                                                                      |
| P2  | Change the recall connection to console `127.0.0.1`, receive port 8101, listening port 8102                                                               | Recall goes green; it appears on the proxy's Clients tab                                                                             |
| P3  | With recall through the proxy: capture a channel, change it on the console, recall                                                                        | Works as it did directly. Traffic tab shows the queries going out and the answers going to recall only                               |
| P4  | Move a fader on the console with the Traffic tab open                                                                                                     | Shown as "console → everyone"                                                                                                        |
| P5  | Send tab: `/Input_Channels/1/fader/?` with no value                                                                                                       | Answer appears in Traffic, addressed to "web page"                                                                                   |
| P6  | Send tab: `/Input_Channels/1/fader`, number, -10                                                                                                          | Fader 1 moves on the console                                                                                                         |
| P7  | Capture 10 seconds while moving controls; download the file                                                                                               | File lists the packets with clients, directions and timings                                                                          |
| P8  | Second tool at the same time (a second recall connection on another listening port, or `tools/probe.mjs` from the recall repository pointed at the proxy) | Both work; neither loses answers                                                                                                     |
| P9  | DiGiCo iPad app: list it as `iPad=<address>:<port>`, point the app at this computer and port 8101                                                         | App connects and follows the console. Not known whether the app accepts this; record what happens                                    |
| P10 | With the iPad app connected and showing meters, tick "Show meter traffic", then capture 10 seconds                                                        | Shows how the app asks for meters and what comes back. Send the file                                                                 |
| P11 | Stop the recall connection for a minute                                                                                                                   | It disappears from Clients after 30 seconds; returns when re-enabled                                                                 |
| P12 | Disable the proxy connection                                                                                                                              | Clients lose the console; they recover when it is enabled again                                                                      |
| P13 | On another computer (or this one) run `node tools/agent-example.mjs`; set EQ agent to `ws://<that computer>:8765` and save                                | It prints the console's name, the graphic EQs and groups by name, and the first of each. Compare the printed values with the console |
| P14 | Note what band 1 and band 32 of a graphic EQ are on the console, and what `curve` numbers a group EQ returns for shapes you have set                      | Fills in the two "to confirm" items in docs/EQ-AGENT.md                                                                              |
| P15 | With the real agent: apply a change to a graphic EQ and to a group EQ                                                                                     | The console shows the change; the Traffic tab shows only the changed values going out as "EQ agent"                                  |
| P16 | Apply a change to one side of a ganged pair of graphic EQs                                                                                                | The other side follows by the same amount                                                                                            |

## 3. Test log

| Date       | Version            | What was run                                                                                                                                           | On                                                                             | Result                                                                   |
| ---------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| 2026-11-16 | 0.1.0 (test build) | Automated suite, 26 tests including the recall engine through the proxy; package build                                                                 | Node 22.23.4, Linux, simulated console                                         | 26 passed, 0 failed; package built                                       |
| 2026-11-16 | 0.1.0 (test build) | Web page opened in headless Chrome against `tools/preview.mjs`: all four tabs, two pretend clients                                                     | Chrome, simulated console                                                      | No script errors; clients, routes and values shown correctly             |
| 2026-11-17 | 0.1.1 (test build) | Automated suite, 40 tests, including the EQ agent link against a real WebSocket server; `tools/agent-example.mjs` run against the proxy; package build | Node 22.23.4, Linux, simulated consoles with eight-band and four-band group EQ | 40 passed, 0 failed; example printed the lists and states; package built |

### Coverage on real equipment

| Console or software            | Proxy connects | Recall through proxy | iPad app through proxy | Notes |
| ------------------------------ | -------------- | -------------------- | ---------------------- | ----- |
| Quantum 338 (offline software) | Not yet run    | Not yet run          | Not yet run            |       |
| Quantum 338                    | Not yet run    | Not yet run          | Not yet run            |       |
| SD9, SD10, SD11                | Not yet run    | Not yet run          | Not yet run            |       |

### Findings

Problems found during testing, and what was done about them.

| Date       | Found by                                 | Finding                                                                                                                                                                                                    | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-16 | Automated test, Companion-level          | The test file's teardown ran before its tests had finished, stopping the proxy under them, and the run then hung instead of failing                                                                        | Teardown made the last test. A fault in the test, not the module                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-11-16 | Web page check                           | In the preview, a pretend iPad and a pretend tool on the same address were shown as one client: a listed client is recognised by address alone, so it claims everything from that address                  | By design, since the iPad app may send from a different port than it listens on. Documented in the help and README; preview gives the pretend iPad its own address                                                                                                                                                                                                                                                                        |
| 2026-11-17 | Maintainer, Quantum 338 offline software | After the module (or Companion) had been off for a while the console stopped answering it, and did not resume when the module came back. Setting Enable External Control to NO and back to YES restored it | Advice added to the help, the settings page note and the web Setup tab: toggle Enable External Control when the console is not answering or after changing the connection's settings. The maintainer has also seen consoles in the field stop answering the iPad app in the same way, with no known cure until now; the toggle has so far been tried on the offline software only. How long "a while" is, is not known. In the next build |
