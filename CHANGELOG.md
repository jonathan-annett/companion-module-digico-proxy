# Changelog

All notable changes to this module are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Each version also has an entry in the test log
in [docs/TESTING.md](docs/TESTING.md) saying what was tested and on what.

## [Unreleased]

Nothing yet.

## [0.1.0] - unreleased

First test build. Not yet run against a console, the offline software or the iPad app.

### Added

- Shares a console's single iPad-type link among any number of clients.
- Answers to queries go only to the client that asked; everything else goes to all.
- One send rate shared by all clients, taking turns.
- Clients are found automatically from what they send, and dropped after 30 seconds of
  silence. Clients that listen on a fixed port (the DiGiCo iPad app) can be listed.
- Web page: clients, live traffic with filter and pause, send a command, console setup.
- Capture of every packet in both directions for 0.2 to 120 seconds, downloadable as JSON.
- HTTP API for status, traffic, captures and sending.
- Companion actions, feedbacks, variables and presets.
