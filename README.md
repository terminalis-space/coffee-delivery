# You Fly. I Panic.

**An AI agent shares control with a human in a hardware-backed coffee-delivery game.** Ask the copilot to help land a simulated drone while a spectator uses physical Arty FPGA buttons to send directional gusts.

**This repository contains the public frontend only.** Live hardware and AI interaction require a private local backend, a programmed Arty board, and an authorized Amazon Bedrock service. Those components are not included here.

## Where the agent is

The agent runs in the private backend through Amazon Bedrock. The browser is its interface. Its implemented loop is:

1. **Observe:** receive the player's request and a bounded snapshot of flight telemetry, disturbances, and hardware status.
2. **Request an action:** the model can call one of four constrained tools shown below.
3. **Check authority:** the local bridge validates the arguments, session, observation age, and whether the human has taken over. It applies or rejects the request.
4. **Receive feedback:** the actual tool result and fresh telemetry go back to the model for a text-only acknowledgment. A requested landing is not a confirmed landing; the simulation determines the outcome.

| Agent tool | Allowed effect |
|---|---|
| `request_landing(pad_id="coffee-pad")` | Start the existing bounded landing policy for the known pad |
| `hold_position()` | Hold the current bounded position with assistance |
| `set_assistance(enabled)` | Enable or disable target assistance |
| `cancel_copilot_action()` | Cancel the landing action and yield to the player |

Model inference runs separately from the physics loop. Human steering invalidates pending model actions so a late response cannot take control back. The current page centers the conversation; keyboard steering remains available for takeover.

**The language model chooses a supported policy; the FPGA computes the low-level control commands.** This is one language-model agent working with a deterministic controller. It does not generate motor commands, train online, or discover a new landing controller. The public files document this integration but do not contain or independently reproduce the runtime agent.

## Preview the interface

Serve these files from the root of a local static web server. For example, with Python installed:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/?fixture=1` for a static illustrative flight, `/?fixture=landed` for an illustrative outcome, or `/?fixture=fault` for a connection-fault illustration. Fixtures are visibly labeled and disable all flight and model commands. They do not demonstrate live hardware, AI inference, physics execution, or acceptance results.

The default page, without a fixture query, expects the private backend. A static server will show **Bridge offline**. This is intentional; this repository alone cannot connect to the board or run the copilot.

## The live demo architecture

```text
Browser → private local bridge → Arty FPGA → simulated flight → browser
                          ↑
             Amazon Bedrock copilot
                bounded policy requests
```

Start a delivery, then ask the copilot to land through the prominent chat. A real Amazon Bedrock response requests a bounded landing policy, and the player can take over at any time. Physical buttons on the Arty produce gust events; the aircraft and wind effects are simulated.

The initial delivery holds its current target. A gust displaces the drone and the position controller corrects toward that target. Asking to hold captures the current position and cancels a landing; no free-drift mode is implemented.

## What was built for the hackathon

The project reuses a pre-existing board controller. The new hackathon work is the agent's telemetry and tool interface, application/rejection feedback, human takeover handling, and their integration into the coffee-delivery game with physical directional gusts and conversational control.

The controller implementation, numerical model, hardware build artifacts, backend configuration, and detailed runtime evidence remain private. This repository does not reproduce those components or make a standalone hardware-performance claim.

## Demo materials

- [Two-minute live demonstration script](DEMO.md)
- **Demo video:** Pending upload.

The public interface uses vanilla JavaScript, CSS, and inline SVG, with no frontend build or package installation required. The public copy omits private runtime snapshots and performance diagnostics.
