# Changelog

All notable changes to this module are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Each version also has an entry in the test log
in [docs/TESTING.md](docs/TESTING.md) saying what was tested and on what.

## [Unreleased]

- Setup advice: if the console is not answering, or after changing the connection's
  settings, set Enable External Control to No and back to Yes. Found on the Quantum 338
  offline software, which stopped answering after the module had been away for a while.

## [0.1.1] - unreleased

Test builds are numbered as they are handed over. 0.1.0 was a test build and was never
published; this entry covers everything so far. Not yet run against a console, the
offline software or the iPad app.

### Added

- **EQ agent link.** An optional WebSocket address in the settings. The proxy connects to
  it once on starting and then answers JSON commands from that server: list the graphic
  EQs, read one, set one; list the groups, read a group's EQ, set it. A set is checked
  whole before anything is sent, sends only the values that differ, and answers with the
  state read back from the console. See [docs/EQ-AGENT.md](docs/EQ-AGENT.md).
- Action "Connect to the EQ agent", feedback and variable for the link's state, and its
  state on the web page.

- Shares a console's single iPad-type link among any number of clients.
- Answers to queries go only to the client that asked; everything else goes to all.
- One send rate shared by all clients, taking turns.
- Clients are found automatically from what they send, and dropped after 30 seconds of
  silence. Clients that listen on a fixed port (the DiGiCo iPad app) can be listed.
- Web page: clients, live traffic with filter and pause, send a command, console setup.
- Capture of every packet in both directions for 0.2 to 120 seconds, downloadable as JSON.
- HTTP API for status, traffic, captures and sending.
- Companion actions, feedbacks, variables and presets.
