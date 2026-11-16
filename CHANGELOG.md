# Changelog

All notable changes to this module are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Each version also has an entry in the test log
in [docs/TESTING.md](docs/TESTING.md) saying what was tested and on what.

## [Unreleased]

Nothing yet.

## [0.1.3] - unreleased

Test builds are numbered as they are handed over. 0.1.0 to 0.1.2 were test builds and were never
published; this entry covers everything so far. Not yet run against a console, the
offline software or the iPad app.

### Added

- **EQ agent: limits and characteristics.** Two new commands, `geq.info` and
  `group.eq.info`, tell the agent what it has to work with before it recommends anything:
  how many bands, and the range of every gain, frequency, Q and curve number; whether the
  group EQ has a pre-insert switch or separate filters. Two things the console does not
  report can be supplied in the settings and are then included: where graphic EQ band 1
  sits (16 or 20 Hz, giving the 32 band frequencies) and what the curve numbers 1 to 4
  mean. Until supplied they are reported as not known rather than guessed. Curve numbers
  are now checked against their range when set.
- **Newer version notice.** The web page looks at this module's releases on GitHub and,
  when a newer one with a package attached exists, shows a bar with a link to download
  it and to its notes. The check is made by the browser, at most every six hours, and
  again on request from the Setup tab; with no internet it does nothing. Nothing is
  installed: the package is imported into Companion as before. This is for the time
  before the module is in Companion's store, which will then offer updates itself.
- Setup advice: if the console is not answering, or after changing the connection's
  settings, set Enable External Control to No and back to Yes. Found on the Quantum 338
  offline software, which stopped answering after the module had been away for a while.
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
