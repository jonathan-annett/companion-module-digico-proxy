# companion-module-digico-proxy

A [Bitfocus Companion](https://bitfocus.io/companion) connection that lets several tools
share a DiGiCo SD or Quantum console's single iPad-type remote link, shows everything
passing over it, and can send commands of its own.

A DiGiCo console talks to one "DiGiCo Pad" device at one address. This module is that
device. Other tools (the [recall module](https://github.com/jonathan-annett/companion-module-digico-recall),
the DiGiCo iPad app, your own scripts) then talk to this module as if it were the console.

```
                              ┌─ Recall module
console ◄── one link ──► proxy ├─ DiGiCo iPad app
                              ├─ your own tool
                              └─ web page: live traffic, send a command, capture
```

**Status: 0.1.4, a test build.** 45 automated tests against a simulated console,
including two copies of the real recall module sharing one link. It has not yet been run
against a console, the offline software or the iPad app. See [docs/TESTING.md](docs/TESTING.md).

## What it does

- **Shares the link.** Any number of clients. Whatever a client sends goes to the console.
- **Routes answers.** When a client asks the console for a value, the answer goes only to
  that client. Everything else the console says (a fader moved on the surface, an echo of
  a change, meters) goes to every client.
- **Paces sending.** The console's link is UDP and can be flooded. All clients share one
  send rate, taking turns, so one busy client cannot crowd out another.
- **Shows the traffic.** The web page lists every message with who sent it and who
  received it, with a filter and a pause. Meter traffic is hidden unless asked for.
- **Captures.** Records every packet in both directions for a few seconds, for download as
  a JSON file: client, direction, timing, decoded messages and raw bytes.
- **Sends commands.** From the web page, a Companion action, or the HTTP API.
- **EQ agent link.** Optionally connects out to a WebSocket server (a speaker-tuning
  agent, say) and lets it read and set graphic EQs and group EQs with a small JSON API.
  See [docs/EQ-AGENT.md](docs/EQ-AGENT.md).

## The API

The API for other tools **is the DiGiCo iPad protocol**: OSC over UDP, sent to the proxy's
client port. A tool written for a console works through the proxy by changing its console
address and port, and nothing else. See [docs/DESIGN.md](docs/DESIGN.md) for the routing
rules a client can rely on.

The sniffer and injector are also available over HTTP, under
`http://<companion>:<port>/instance/<connection label>/api/`:

| Call                                                                      | Does                                                        |
| ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `GET status`                                                              | Console name, whether it is answering, clients and counters |
| `GET trace?since=<seq>`                                                   | Messages newer than `seq`, and the latest `seq`             |
| `POST send` `{"path":"/Input_Channels/1/fader","types":"f","args":[-10]}` | Sends one message to the console                            |
| `POST capture` `{"seconds":10}`                                           | Starts a capture                                            |
| `GET captures`, `GET captures?id=<id>`                                    | Lists captures; downloads one                               |
| `POST trace/meters` `{"on":true}`, `POST trace/clear`                     | Show meter traffic in the trace; empty the trace            |

## Setting up

1. On the console, **Setup > External Control**: Enable External Control = Yes; add a
   **DiGiCo Pad** device with the address of the computer running Companion, send port
   8000, receive port 8001; tick it; press **load** and choose the iPad command set. The
   module's settings page and its web page show this row filled in.
2. In the connection's settings enter the console's address.
3. Point each tool at the computer running Companion, port **8101** (the client port),
   in place of the console. For the recall module on the same Companion: console address
   `127.0.0.1`, console receive port `8101`, and any free port to listen on, such as 8102.
4. The DiGiCo iPad app listens on a fixed port, so list it under **Clients with a fixed
   reply port** as `iPad=<its address>:<its port>`. A listed client is recognised by its
   address, so it must not share a computer with another client.

## Developing

```
yarn install
yarn test                 # automated tests
yarn preview              # the web page against a simulated console, no Companion needed
yarn package              # builds digico-proxy-<version>.tgz for import into Companion
DIGICO_RECALL_DIR=../companion-module-digico-recall yarn test   # also tests the recall module through the proxy
```

- [CHANGELOG.md](CHANGELOG.md): what changed in each version
- [docs/TESTING.md](docs/TESTING.md): every test, the manual plan, the test log and findings
- [docs/DESIGN.md](docs/DESIGN.md): how it works and why
- [docs/EQ-AGENT.md](docs/EQ-AGENT.md): the JSON API for an EQ agent
- [RELEASING.md](RELEASING.md): how a version is cut

MIT licensed. Not affiliated with or endorsed by DiGiCo.
