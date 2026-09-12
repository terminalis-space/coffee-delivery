# Two-minute conversational demo

This script uses the complete private installation, a real Arty board, and the configured Amazon Bedrock model. The public static preview is illustrative and cannot run this demo.

Keep SW0 OFF. Connect the board, then start the delivery. Show the chat and flight scene together, with the physical board visible in the recording.

| Time | Interaction |
|---|---|
| 0:00–0:20 | “Ask an AI agent to deliver this coffee while I control the wind. The flight is simulated; the board and model calls are real.” |
| 0:20–0:40 | Type **Land gently on the coffee pad.** and send. Explain that the model requests a supported landing policy through a bounded tool. |
| 0:40–1:05 | After the actual action is applied, press/release BTN0 once, then BTN1 at least three seconds later if still flying. Show the actual motion and agent response. |
| 1:05–1:30 | Show the actual outcome. Ask **What happened in this attempt?** if useful. The model receives tool results and telemetry; the simulation determines the landing outcome. |
| 1:30–2:00 | Explain the agent's land, hold, assistance and yield tools. The FPGA computes controls; keyboard steering or Escape takes priority. The integration is new hackathon work around an existing controller. |

Physical gust directions: **BTN0 −X · BTN1 +X · BTN2 −Y · BTN3 +Y**. Screen axes: +X points right/down and +Y left/down. SW0 ON resets the board; return it OFF before reconnecting.

A new delivery already holds its initial target. A gust briefly displaces the drone before the position controller corrects it. **Hold position** is useful during a landing or after moving to a different position; it captures the current position. There is no free-drift mode.

Preserve the observed outcome and gust count. Skip any remaining press when the attempt ends. If the model is unavailable or the board faults, show that state honestly. Never substitute fixture output, promise a landing, or treat this presentation as a controlled performance comparison or latency qualification.
