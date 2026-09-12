# Two-minute live demo

This script is for the complete private installation with its real Arty board and Amazon Bedrock copilot. A static preview of this repository is illustrative and cannot perform the live demonstration.

## Before the audience starts

Keep **SW0 OFF**. Confirm that the live application reports its board connection and that the copilot is available. The host operates the physical Arty buttons; the participant uses the keyboard.

| Physical control | Action |
|---|---|
| BTN0 | −X gust |
| BTN1 | +X gust |
| BTN2 | −Y gust |
| BTN3 | +Y gust |
| SW0 ON | Board reset; return it OFF before reconnecting and playing |

Screen axes: +X points right and down; +Y points left and down.

## 0:00–0:20 — Explain the coffee

“Can an AI agent share control with a human? Deliver this coffee while I control the wind. The drone is simulated; the FPGA and model calls are real. Our agent observes telemetry, requests bounded actions, receives actual results, and yields when you take over.”

## 0:20–0:55 — Human round

Choose **1. Human round** and wait for the new round to start. The participant steers with WASD or arrows and changes target altitude with Q / E.

The host makes **two spaced physical presses**, releasing each button fully: BTN2, then BTN3. Leave at least three seconds between presses so the participant can see each gust and react. If the coffee has not landed when it is time to move on, choose **End round** and describe that observed result accurately.

## 0:55–1:35 — Copilot round

Choose **2. Copilot round**. Wait until the interface reports that a model landing action has been applied. The host then makes **two spaced physical presses**, releasing each button fully: BTN0, then BTN1. Leave at least three seconds between presses, and skip the second if the flight has already ended.

Point out the applied model landing request and the actual drone movement, target, and recorded gust count. Say: “The model requested a supported landing policy. The FPGA computes the controls; the model gets the action result and telemetry back.” Read any coaching as an observation tied to its displayed snapshot, not a guarantee of recovery. Keyboard steering or Escape lets the person take over; any takeover should be described as mixed control.

## 1:35–2:00 — Show what happened

Read the recorded outcomes and gust counts. Both rounds used the same board-assisted control loop; the host's timing and the participant's choices may differ. Do not promise a landing or declare a controlled performance comparison.

If a model request is unavailable, say so and retry explicitly or end the round. If the board faults, pause the demonstration and reconnect through the normal local workflow. Show the real state instead of substituting an illustrative fixture. The two-minute pacing is a presentation plan, not a runtime or latency guarantee.
