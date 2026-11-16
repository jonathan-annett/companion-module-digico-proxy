## DiGiCo iPad Link Proxy

A DiGiCo SD or Quantum console talks to one iPad-type remote device. This connection is
that device, and shares the link among several tools: other Companion connections, the
DiGiCo iPad app, or your own software. It also shows all the traffic and can send
commands.

### On the console

1. **Setup > External Control**, set **Enable External Control** to Yes.
2. Add a device, type **DiGiCo Pad**, with the IP address of the computer running
   Companion, **send port** 8000 and **receive port** 8001.
3. Switch the device on in the list (green tick).
4. Press **load** next to "commands allowed" and choose the iPad command set (`ipad_q3`
   on a Quantum 338; a name containing the model on the SD range).
5. Leave "OSC generic" off.

The settings page shows this row with the values to enter. On the DiGiCo offline software,
allow the receive port (UDP, inbound) through Windows Firewall.

### In each tool

Wherever the tool asks for the console, give it the computer running Companion and the
**client port** (8101 unless changed). The proxy replies to wherever the tool sends from.

For another Companion connection on the same computer, such as DiGiCo SD/Quantum Recall:
console address `127.0.0.1`, console receive port `8101`, and any unused port for its own
listening port.

The DiGiCo iPad app listens on a port of its own. List it in **Clients with a fixed reply
port** as `iPad=192.168.1.50:8002` (its address and the port it listens on), and in the
app enter the computer running Companion and the client port. A listed client is
recognised by its address alone.

### What clients can rely on

- Everything a client sends reaches the console, in order, within the shared send rate.
- The answer to a query (`<address>/?`) goes only to the client that asked.
- Everything else from the console goes to every client.
- A client that sends nothing for 30 seconds is dropped until it speaks again. Tools that
  poll the console, as the recall module does, stay connected. Listed clients never expire.

### EQ agent

Optional. Enter the WebSocket address of a server (for example `ws://192.168.1.30:8765`)
in **EQ agent**. The connection tries it once when it starts; after that, only when you
use the action "Connect to the EQ agent" or the button on the web page. Once connected,
that server can list, read and set graphic EQs and group EQs. It can change the console,
so only enter the address of software you trust to ask first. The commands are described
in `docs/EQ-AGENT.md` in the module's repository.

### Web page

Linked from the settings page: `/instance/<connection label>/` on Companion's address.

- **Clients**: who is connected and how much each has sent and received
- **Traffic**: every message, newest first, with a filter and pause; capture to a file
- **Send**: send one command to the console
- **Setup**: the console's device row, filled in

### Actions

- Capture all traffic to a file (for a number of seconds; download it from the web page)
- Clear the live traffic view
- Send an OSC command to the console
- Connect to the EQ agent

### Feedbacks

- Console is answering
- At least a number of clients are connected
- A capture is running
- The EQ agent link is connected

### Variables

- `console`: console name
- `online`: YES or NO
- `clients`: number of connected clients
- `client_names`: their names
- `agent`: EQ agent link: off, connecting, connected, failed or closed

### Care

Sending a command with a value changes the console. The proxy passes on whatever its
clients send; it does not check or limit what they change.
