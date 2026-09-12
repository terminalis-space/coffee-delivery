# You Fly. I Panic.

A coffee-delivery game with a human pilot, an AI copilot, and a real Arty FPGA board. Steer a simulated drone toward its landing pad while a spectator uses physical buttons to send directional gusts.

**This repository contains the public frontend only.** Live hardware and AI interaction require a private local backend, a programmed Arty board, and an authorized Amazon Bedrock service. Those components are not included here.

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

A person steers the flight target in the human round. In the copilot round, a real Amazon Bedrock response requests a bounded landing policy. Both rounds use the same board-assisted control loop, and the player can take over at any time. Physical buttons on the Arty produce gust events; the aircraft and wind effects are simulated.

## What was built for the hackathon

The project reuses a pre-existing board controller. The new hackathon work is the coffee-delivery game, browser interface, human/copilot round flow, physical directional-gust interaction, and integration of bounded AI assistance with the local application.

The controller implementation, numerical model, hardware build artifacts, backend configuration, and detailed runtime evidence remain private. This repository does not reproduce those components or make a standalone hardware-performance claim.

## Demo materials

- [Two-minute live demonstration script](DEMO.md)
- **Demo video:** Pending upload.

The public interface uses vanilla JavaScript, CSS, and inline SVG, with no frontend build or package installation required. The public copy omits private runtime snapshots and performance diagnostics.
