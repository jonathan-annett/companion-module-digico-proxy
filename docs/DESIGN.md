# Design notes

How the proxy works, the decisions behind it, and a log of its development.

## Why it exists

A DiGiCo console sends its iPad-protocol traffic to one address and port, and allows one
iPad-type device. So only one tool at a time can use the link: the recall module, or the
iPad app, or anything else. The recall module had grown a relay for the iPad app and a
meter capture of its own; both are really jobs for something that sits on the link and
shares it. This module is that, and nothing else: it knows nothing about channels, EQs or
slots.

It is the first of three parts:

1. **This proxy**: shares the link, shows the traffic, sends commands.
2. **The recall module**: a client of the proxy (or of a console directly, as before).
3. **An sACN gateway**, to come: a client that turns control group fader moves into
   lighting levels.

## The API is the iPad protocol

A client talks to the proxy exactly as it would to a console: OSC over UDP, the same
addresses, `/?` to query. That means:

- a tool needs no code to use the proxy, only a different console address and port;
- the recall module works through it unchanged, and still works without it;
- the DiGiCo iPad app can, in principle, be a client too.

An invented API (HTTP, WebSocket) would have needed every client rewritten and could not
have carried the iPad app. The sniffer and injector, which are not part of the console
protocol, are offered over HTTP.

## Routing

- **Client to console**: everything, unchanged, byte for byte.
- **Console to clients**: a message whose address has a query waiting goes to the client
  that asked, and only to it. Everything else goes to every client.
- Queries are matched by address, first asked first answered. Two clients asking for the
  same value each get one answer, provided the console answers each query.
- A query waits 1.5 seconds. After that it is forgotten, so that a console that never
  answers (an address it does not have) cannot cause a later surface change at that
  address to be delivered to one client instead of all.
- Packets the proxy cannot decode are passed on anyway: to the console from a client, and
  to every client from the console.

Why route answers at all, rather than broadcast everything: a client that captures a
channel sends a few hundred queries and matches the answers by address. Broadcast, every
other client would see hundreds of value messages it did not ask for, and tools that treat
an unexpected value as "someone touched this" (the recall module does, to find the
touched channel) would be misled.

Known limit: a client that asks for a value and, within 1.5 seconds, another client
changes that same value, could receive the change as its answer while the other clients
receive the real answer as news. Both carry a current value, so no client is left wrong.

## Clients

- **Automatic**: any address and port that sends to the client port becomes a client and
  is answered there. It is dropped after 30 seconds of silence. This suits tools that
  poll, and needs no setting up.
- **Listed**: `name=address:port`. Always a client, never expires, always answered on the
  given port. For the iPad app, which listens on a fixed port and may send from another.
  Recognised by address alone, so one per computer and not alongside an automatic client
  on the same computer.
- **Internal**: the proxy itself (a console name query every few seconds, to know the
  console is there; hidden from the traffic view) and the web page's sender.

## Pacing

The console's link is UDP with no flow control. All clients share one rate (800 messages
a second by default), served in turn, one message per client per turn, so a client
dumping a thousand queries does not delay another's single fader move by more than a
turn. A client's own pacing still applies before its messages arrive; the recall module's
default rate is below the proxy's, so alone it is not slowed.

## Structure

| File                                                                                        | Does                                                                                                  |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/hub.js`                                                                                | The proxy: sockets, clients, routing, pacing, trace, capture, injector. No Companion code             |
| `src/agent.js`                                                                              | The EQ agent link: WebSocket out, JSON commands in, graphic and group EQ. A client of the hub         |
| `src/instance.js`                                                                           | The Companion class: settings in, status out                                                          |
| `src/http.js`, `src/webui.js`                                                               | HTTP API and the single-file web page                                                                 |
| `src/config.js`, `src/actions.js`, `src/feedbacks.js`, `src/variables.js`, `src/presets.js` | Companion definitions                                                                                 |
| `src/osc.js`, `src/network.js`, `src/setup-image.js`                                        | OSC codec, finding this computer's address, the console setup picture (shared with the recall module) |
| `test/sim-console.mjs`                                                                      | Stand-in console with one fixed peer                                                                  |
| `tools/preview.mjs`                                                                         | The web page against the stand-in, without Companion                                                  |

## Development log

### 2026-11-16: split from the recall module, 0.1.0

- The maintainer asked for a tool that follows a control group fader and sends sACN, and
  did not want it in the recall module. Since the console allows one link, a second tool
  needs the link shared; hence the split into proxy, recall and gateway.
- Built `hub.js` first with its tests, using plain sockets as clients, then ran two real
  recall engines through it: both capture, recall and detect touches without taking each
  other's answers.
- The recall module's own iPad relay and meter capture stay for now. Once the proxy has
  been run on real equipment they can go, with the proxy's capture taking over the job of
  finding out how the iPad app asks for meters.
- Not yet known, and the reason for manual steps P9 and P10: whether the iPad app works
  through a proxy at all, and whether a console objects to the combined traffic.
- The SD-range command sets, checked the same day for the recall module, list more than
  channels: snapshots, session name, console presets and macro buttons. The Send tab is
  the way to try those.

### 2026-11-17: EQ agent link, 0.1.1

- The maintainer works with an agent that listens to a speaker, compares it with a
  reference, asks the operator, and then wants to apply an EQ. Asked for: a WebSocket
  address in the settings, tried once on start, over which that server can list, read
  and set graphic EQs and group EQs, each read and set as a whole.
- This is the one place the proxy knows what an address means. It is kept in `agent.js`,
  apart from `hub.js`, and is itself just another client of the hub: its queries are
  routed and paced like anyone's, and show in the traffic view as "EQ agent".
- The proxy connects out, as asked, so the agent needs no knowledge of where Companion
  is. One attempt, no retry timer: a tuning agent is run now and then, and a proxy that
  kept knocking on a port would be noise. A manual retry is provided.
- A set validates everything before sending anything, so a bad request cannot leave an
  EQ half changed. It then reads, sends only differences, and reads back. The answer is
  what the console has, not what was asked for, and names any value that did not take.
  It cannot be all-or-nothing on the console: values go one at a time over UDP.
- Limits (graphic gain 12 dB, trim 18 dB, EQ gain 18 dB, 20 Hz to 20 kHz, Q 0.1 to 20)
  are the ranges in DiGiCo's command sets. Out-of-range values are refused, not clipped,
  so the agent finds out.
- Number types: each value is written with the type the console used when it was read.
- Group EQ follows the console family without being told: bands and filters that do not
  answer are left out of the state, and setting one is refused.
- Left out: dynamic EQ settings, band frequencies for the graphic (not in the command
  sets), the meaning of the curve numbers. No authentication on the link: the proxy
  chooses whom it connects to, and `wss://` is accepted.

### 2026-11-17: newer version notice, 0.1.2

- Same as in the recall module, and for the same reason: until the module is in
  Companion's store, the web page checks this repository's GitHub releases from the
  browser and offers the newest package. `src/update.js` is the same file in both, apart
  from the repository name. To be removed when the module is accepted into the store.
