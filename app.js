"use strict";

// The bridge owns time and physics. This client renders accepted snapshots only.
const $ = (id) => document.getElementById(id);
const fixtureMode = new URLSearchParams(location.search).has("fixture");
const mobileViewport = matchMedia("(max-width:760px)"), reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const keys = new Set();
const touches = new Map();
let state = null, stream = null, sequence = 0, lastInputAt = 0, inputBusy = false, releasePending = false, releaseSequence = 0;
let feedOnline = false, lastSnapshotAt = 0, attemptNumber = 0, oldSession = "", lastEventIdentity = "";
let visiblePose = null, previousPose = null, poseUpdatedAt = 0, toastUntil = 0;
let requestPending = false, chatPending = false, lastDiagnosticRender = 0, snapshotRequestBusy = false, lastPadGeometry = "", feedError = false;
let pendingStart = null;
let sentMessages = [], sentMessageId = 0, lastConversation = "";
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const vector = (value) => Array.isArray(value) && value.length === 3 && value.every(finite);
const number = (value, digits = 1) => finite(value) ? value.toFixed(digits) : "—";
const setText = (id, value) => { if ($(id).textContent !== value) $(id).textContent = value; };
const gustDirections = ["-X","+X","-Y","+Y"];
const directionLabel = direction => direction.replace("-","−");
function gustCounts(counts) {
  return Array.isArray(counts) && counts.length === 4 && counts.every(count=>Number.isSafeInteger(count) && count >= 0)
    ? counts.map((count,index)=>`${directionLabel(gustDirections[index])}: ${count}`).join(" · ") : "—";
}

function showError(message) { $("request-error").textContent = message; $("request-error").hidden = !message; }
async function post(path, body = {}) {
  if (fixtureMode) throw new Error("Development fixture: no commands are sent to hardware or a model.");
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 8000);
  try {
    const response = await fetch(path, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body), signal:abort.signal});
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.reason || `Bridge returned HTTP ${response.status}.`);
    return result;
  } catch(error) {
    if (error.name === "AbortError") throw new Error("The bridge did not acknowledge the command. Check its connection before trying again.");
    throw error;
  } finally { clearTimeout(timeout); }
}
function isPlayable() { return !pendingStart && feedOnline && state?.mode === "running" && state.hardware?.connected && !state.hardware.fault && !fixtureMode; }
function canRequestCopilot() {
  const copilot = state?.copilot;
  return !pendingStart && feedOnline && !!state?.session && !fixtureMode && !chatPending && !copilot?.busy &&
    (copilot?.available === true || copilot?.configured === true);
}
function currentInput() {
  const command = {x:0,y:0,z:0};
  if (keys.has("a") || keys.has("arrowleft")) command.x -= 1;
  if (keys.has("d") || keys.has("arrowright")) command.x += 1;
  if (keys.has("w") || keys.has("arrowup")) command.y += 1;
  if (keys.has("s") || keys.has("arrowdown")) command.y -= 1;
  if (keys.has("q")) command.z -= 1;
  if (keys.has("e")) command.z += 1;
  for (const value of touches.values()) command[value.axis] += value.value;
  for (const axis of Object.keys(command)) command[axis] = Math.max(-1, Math.min(1, command[axis]));
  return command;
}
async function sendInput() {
  if (!isPlayable() || inputBusy || performance.now() - lastInputAt < 50) return;
  const command = currentInput(), active = Object.values(command).some(Boolean);
  // An idle/reloaded spectator tab must never publish a zero over another player's input.
  // Consume each release once; the bridge watchdog handles an uncertain release reply.
  if (!active && !releasePending) return;
  releasePending = active;
  lastInputAt = performance.now(); inputBusy = true;
  const sentSession = state.session;
  const serverNext = Number.isSafeInteger(state.next_input_sequence) && state.next_input_sequence >= 0 ? state.next_input_sequence : 0;
  const sentSequence = sequence = Math.max(sequence + 1,serverNext);
  if (active) releaseSequence = sentSequence;
  try {
    await post("/api/input", {session:sentSession,sequence:sentSequence,command,timestamp:performance.now()/1000});
  } catch(error) {
    if(sentSession !== state?.session || pendingStart || sentSequence !== sequence) return;
    if(error.message === "attempt is not running") {
      // An input or release may arrive just after End round or a touchdown.
      clearHeldInputs(); releasePending = false;
      void getSnapshot();
      return;
    }
    if(error.message === "invalid/repeated input sequence or command") {
      // Concurrent tabs can race once between snapshots. Never retry an obsolete release.
      if(active) {clearHeldInputs(); releasePending = false; showError("Another tab updated the controls. Press a direction again to take over.");}
      void getSnapshot();
      return;
    }
    clearHeldInputs(); showError(`Steering: ${error.message}`);
  }
  finally { inputBusy = false; }
}
function clearHeldInputs() { keys.clear(); touches.clear(); document.querySelectorAll(".is-held").forEach(el => el.classList.remove("is-held")); }
function releaseInputs() { clearHeldInputs(); void sendInput(); }
function typingTarget(event) { return event.target.closest?.("input, textarea, select, [contenteditable=true]"); }
window.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();
  if (key === "escape") { event.preventDefault(); void cancel(); return; }
  if (typingTarget(event)) return;
  if (!["w","a","s","d","q","e","arrowup","arrowdown","arrowleft","arrowright"].includes(key)) return;
  event.preventDefault(); if (isPlayable()) { keys.add(key); void sendInput(); }
});
window.addEventListener("keyup", event => { const key = event.key.toLowerCase(); if(keys.delete(key)) {event.preventDefault(); void sendInput();} });
window.addEventListener("blur", releaseInputs);
document.addEventListener("visibilitychange", () => {if(document.hidden) releaseInputs();});
$("chat-input").addEventListener("focus", releaseInputs);
document.querySelectorAll("[data-axis]").forEach(button => {
  button.addEventListener("pointerdown", event => {if(!isPlayable()) return; event.preventDefault(); button.setPointerCapture(event.pointerId); touches.set(event.pointerId,{axis:button.dataset.axis,value:Number(button.dataset.value)}); button.classList.add("is-held"); void sendInput();});
  for (const name of ["pointerup","pointercancel","lostpointercapture"]) button.addEventListener(name,event => {touches.delete(event.pointerId);button.classList.remove("is-held");void sendInput();});
});
setInterval(sendInput, 50);

function clearPendingStart(error = "") {
  if (!pendingStart) return;
  clearTimeout(pendingStart.timeout); pendingStart = null;
  if (error) showError(error);
}
function waitForNewSession() {
  const pending = {session:state?.session,timeout:null};
  pendingStart = pending;
  pending.timeout = setTimeout(() => {
    if (pendingStart !== pending) return;
    clearPendingStart("Start was queued, but the bridge did not publish a new flight session within 10 seconds. Check the bridge status before trying again.");
    clearHeldInputs(); renderStatus();
  },10000);
}
async function runCommand(path,body = {}) {
  if (requestPending || pendingStart) return;
  requestPending = true; releaseInputs(); showError("");
  const startsSession = path === "/api/start";
  if (startsSession) waitForNewSession();
  renderStatus();
  try { await post(path,body); await getSnapshot(); }
  catch(error) {if (startsSession) clearPendingStart(); showError(error.message);}
  finally {requestPending = false; renderStatus();}
}
async function cancel() {
  releaseInputs(); if(pendingStart || !state?.session || !feedOnline || fixtureMode) return;
  try {await post("/api/cancel",{session:state.session}); showError("");}
  catch(error) {showError(`Takeover: ${error.message}`);}
}
async function chat(text) {
  text = text.trim();
  if (!text || !canRequestCopilot()) return;
  const session = state.session, tick = state.tick;
  chatPending = true; showError(""); renderStatus();
  try {
    await post("/api/chat",{session,text});
    if (state?.session === session) {
      sentMessages.push({id:++sentMessageId,session,tick,text,role:"user"});
      sentMessages = sentMessages.slice(-8); $("chat-input").value = "";
    }
  }
  catch(error) {showError(`Copilot: ${error.message}`);}
  finally {chatPending = false; renderStatus();}
}
$("connect-button").addEventListener("click", () => runCommand("/api/connect"));
$("start-button").addEventListener("click", () => runCommand("/api/start"));
$("cancel-button").addEventListener("click", cancel);
$("chat-form").addEventListener("submit", event => {event.preventDefault(); void chat($("chat-input").value);});
document.querySelectorAll("[data-message]").forEach(button => button.addEventListener("click", () => chat(button.dataset.message)));

function acceptSnapshot(next) {
  if (!next || next.schema !== 1 || !vector(next.position) || !vector(next.velocity) || !vector(next.attitude) || !vector(next.target) || typeof next.session !== "string" || !Number.isInteger(next.tick) || next.tick < 0 || !finite(next.monotonic_s) || !["disconnected","ready","running","paused","landed","failed","finished"].includes(next.mode)) {
    feedError = true; showError("The bridge sent an invalid state snapshot. Flight display paused."); feedOnline = false; renderStatus(); return;
  }
  // A slower GET must not roll back a newer SSE session or its player authority.
  if (state && next.monotonic_s < state.monotonic_s) return;
  if (next.session === state?.session && next.tick < state.tick) return;
  if (feedError) {feedError = false; showError("");}
  lastSnapshotAt = performance.now(); feedOnline = true;
  if (pendingStart) {
    if (next.session !== pendingStart.session) clearPendingStart();
    else if (next.hardware?.fault || next.mode === "disconnected") clearPendingStart(`The new delivery could not start: ${next.hardware?.fault || "hardware disconnected"}. Reconnect, then start again.`);
  }
  if (next.session !== oldSession) {
    clearHeldInputs(); releasePending = false; releaseSequence = 0; sequence = 0; lastEventIdentity = ""; toastUntil = 0; visiblePose = null; previousPose = null;
    if (next.mode === "running") attemptNumber += 1;
    oldSession = next.session; sentMessages = []; lastConversation = "";
  }
  if (Number.isSafeInteger(next.next_input_sequence) && next.next_input_sequence >= 0) {
    // Another tab has already superseded this tab's last active input.
    if (releasePending && next.next_input_sequence > releaseSequence + 1) releasePending = false;
    sequence = Math.max(sequence,next.next_input_sequence - 1);
  }
  previousPose = visiblePose || {position:next.position,attitude:next.attitude};
  visiblePose = {position:next.position,attitude:next.attitude}; poseUpdatedAt = performance.now();
  state = next;
  if (!isPlayable()) clearHeldInputs();
  const event = next.last_event;
  if(event && event.event_type === "gust") {
    const identity = `${event.board_session}:${event.button}:${event.event_counter}:${event.applied_tick}`;
    if (identity !== lastEventIdentity) {
      lastEventIdentity = identity;
      if (Number.isInteger(event.applied_tick) && event.applied_tick >= 0) {
        const buttonKnown = Number.isInteger(event.button) && event.button >= 0 && event.button < 4;
        const direction = gustDirections.includes(event.direction) ? directionLabel(event.direction) : "direction unavailable";
        toastUntil=performance.now()+2200;
        $("event-toast").textContent=`Physical gust ${direction}${buttonKnown ? ` · BTN${event.button}` : ""} · applied at tick ${event.applied_tick}`;
      }
    }
  }
  renderStatus();
}

function message(kicker,title,detail,kind="") {
  const el = $("scene-message"); el.hidden = false; el.className = `scene-message ${kind}`;
  el.children[0].textContent = kicker; el.children[1].textContent = title; el.children[2].textContent = detail;
}
function renderStatus() {
  // Measure before changing either history or the live status text.
  const chatScroll = $("chat-scroll"), previousScrollTop = chatScroll.scrollTop;
  const followLatest = chatScroll.scrollHeight - previousScrollTop - chatScroll.clientHeight <= 24;
  const hardware = state?.hardware || {}, timing = state?.timing || {}, copilot = state?.copilot || {};
  const connected = feedOnline && hardware.connected;
  const fault = hardware.fault || (!feedOnline && state ? "The local bridge is not sending fresh snapshots." : null);
  const running = state?.mode === "running";
  const coachingOnly = state?.challenge?.role === "human";
  const statusLabel = fixtureMode ? "Development fixture" : fault ? "Flight paused · fault" : connected ? "Arty connected" : feedOnline ? "Arty disconnected" : "Bridge offline";
  $("connection-status").className = `hardware-status ${fault ? "fault" : connected ? "connected" : ""}`;
  $("connection-status").lastElementChild.textContent = statusLabel;
  $("connect-button").disabled = requestPending || !!pendingStart || fixtureMode || running;
  $("connect-button").firstChild.textContent = requestPending ? "Please wait " : connected ? "Reconnect Arty " : "Connect Arty ";
  $("start-button").disabled = requestPending || !!pendingStart || !connected || !!fault || fixtureMode;
  $("start-button").firstChild.textContent = pendingStart ? "Starting delivery… " : running || ["landed","failed","paused","finished"].includes(state?.mode) ? "Restart delivery " : "Start delivery ";
  $("cancel-button").disabled = !!pendingStart || !connected || !state?.session || fixtureMode;
  const canChat = canRequestCopilot();
  $("chat-input").disabled = !canChat; $("send-button").disabled = !canChat;
  $("chat-input").placeholder = copilot.configured && !copilot.available ? "Model unavailable — type a message to retry" : coachingOnly ? "Start a new delivery to let the copilot fly" : "Ask me to hold position or land…";
  document.querySelectorAll("[data-message]").forEach(button => button.disabled = !canChat || !copilot.available || !running || coachingOnly);
  document.querySelectorAll("[data-axis]").forEach(button => button.disabled = !isPlayable());
  setText("attempt-number",String(Math.max(1,attemptNumber)).padStart(3,"0"));
  setText("assistance-label",state?.assistance ? "Copilot assistance on" : "Manual targets");
  setText("mission-title",state?.mode === "landed" ? "Special delivery. Successfully delivered." : state?.mode === "failed" ? "Let's give that another go." : "One coffee. One soft landing.");
  setText("copilot-status",!feedOnline ? "Bridge offline" : pendingStart ? "Waiting for the new delivery" : !copilot.available ? (copilot.busy || chatPending ? "Model unavailable · retrying" : "Model unavailable") : copilot.busy || chatPending ? (running ? "Thinking · flight keeps running" : "Thinking") : "Model connected");
  if(copilot.text) setText("copilot-text",copilot.text);
  else if (feedOnline && !copilot.available) setText("copilot-text","The copilot is unavailable. Hardware flight can continue; check the provider setup in the runbook.");
  else setText("copilot-text","The drone starts holding its target. Ask me to land it.");
  setText("source-label",fixtureMode ? "Development fixture" : connected ? "Arty → simulated flight" : "No live hardware data");
  setText("qualification",fixtureMode ? "Illustrative preview" : connected ? "Private bridge connected" : "Private bridge required");
  $("qualification").className = "qualification";
  const pad = state?.pad?.position;
  const poseKnown = state && hardware.connected;
  const padGeometry = JSON.stringify([pad,state?.pad?.radius_m,mobileViewport.matches]);
  if (vector(pad) && finite(state.pad.radius_m) && padGeometry !== lastPadGeometry) {
    lastPadGeometry = padGeometry;
    const points = Array.from({length:65},(_,i)=>{const a=i*Math.PI/32;const p=project([pad[0]+state.pad.radius_m*Math.cos(a),pad[1]+state.pad.radius_m*Math.sin(a),pad[2]]);return `${i?"L":"M"}${p.x-578} ${p.y-376}`;});
    $("pad-tolerance").setAttribute("d",points.join(" ")+" Z");
    setText("pad-radius",`${number(state.pad.radius_m*100,1)} CM RADIUS`);
  }
  // SVG elements do not implement HTML's hidden property consistently.
  for (const id of ["drone","drone-shadow","altitude-line","reference-marker"]) $(id).toggleAttribute("hidden",!poseKnown);
  setText("altitude",poseKnown ? `${number(state.position[2],2)} m` : "—");
  setText("speed",poseKnown ? `${number(Math.hypot(...state.velocity),2)} m/s` : "—");
  setText("distance",poseKnown && vector(pad) ? `${number(Math.hypot(state.position[0]-pad[0],state.position[1]-pad[1]),2)} m` : "—");
  if(fault) message("Physics paused", "Let's hold that coffee.", fault, "is-fault");
  else if(pendingStart) message("Starting a fresh attempt", "One moment. Fresh coffee.", "Controls and copilot requests resume when the bridge confirms the new flight session.");
  else if(!connected) message("Ready when you are", "The coffee can wait. Connect your coprocessor.", "Real Arty controls. A simulated little world.");
  else if(state.mode === "ready") message("Hardware ready", "Your delivery is ready for takeoff.", "Start delivery, then use WASD to move the target. Q / E changes altitude.");
  else if(state.mode === "landed") message("Confirmed by the simulator", "Coffee. Delivered.", state.outcome || "A soft landing and a well-earned coffee.","is-outcome");
  else if(state.mode === "failed") message("Attempt complete", "That coffee had an adventure.",state.outcome || "Restart for a fresh delivery.","is-outcome");
  else if(state.mode === "finished") message("Delivery ended", "A quick coffee break.", state.outcome || "Start a fresh delivery when you are ready.","is-outcome");
  else if(state.mode === "paused") message("Physics paused", "A quick coffee break.",state.outcome || "Check the hardware status, then restart the delivery.","is-fault");
  else $("scene-message").hidden = true;
  if(state) setText("scene-description",`Authoritative simulated pose: x ${number(state.position[0],2)} metres, y ${number(state.position[1],2)} metres, altitude ${number(state.position[2],2)} metres. Flight ${state.mode}. ${state.outcome || ""}`);
  renderConversation(followLatest,previousScrollTop); renderMotors();
  setText("gust-count",Number.isInteger(state?.metrics?.gusts) ? String(state.metrics.gusts) : "—");
  setText("gust-directions",gustCounts(state?.metrics?.gusts_by_button));
  if ($("diagnostics").open && performance.now()-lastDiagnosticRender>500) renderDiagnostics();
}
function renderConversation(followLatest = false, previousScrollTop = 0) {
  const history = Array.isArray(state?.copilot?.history) ? state.copilot.history.filter(item =>
    item && item.session === state.session && typeof item.text === "string" && item.text.trim() &&
    Number.isInteger(item.observed_tick) && item.observed_tick >= 0) : [];
  // Backend requests also include automatic telemetry prompts. Show actual reply
  // text only; user messages come from this browser's acknowledged submissions.
  const messages = [...sentMessages.filter(item => item.session === state?.session),
    ...history.map((item,index) => ({id:item.action_id || `reply-${index}`,tick:item.observed_tick,role:"assistant",text:item.text}))]
    .sort((a,b) => a.tick-b.tick || (a.role === "user" ? 0 : 1)-(b.role === "user" ? 0 : 1)).slice(-6);
  const log = $("conversation"), signature = JSON.stringify(messages);
  log.hidden = !messages.length;
  $("copilot-text").hidden = !!history.length && history.at(-1).text === state?.copilot?.text;
  if (signature !== lastConversation) {
    lastConversation = signature;
    const fragment = document.createDocumentFragment();
    for (const item of messages) {
      const row = document.createElement("div"), label = document.createElement("span"), text = document.createElement("p");
      row.className = `chat-message ${item.role}`; label.className = "chat-speaker";
      label.textContent = item.role === "user" ? "You" : "Copilot"; text.textContent = item.text;
      row.append(label,text); fragment.append(row);
    }
    log.replaceChildren(fragment);
  }
  const scroll = $("chat-scroll");
  scroll.scrollTop = followLatest ? scroll.scrollHeight : previousScrollTop;
}
function renderMotors() {
  const controls = state?.hardware?.controls;
  const valid = feedOnline && state?.hardware?.connected && Array.isArray(controls) && controls.length === 4 && controls.every(value=>finite(value) && value >= 0 && value <= 1);
  for (let index = 0; index < 4; index++) {
    const meter = $(`motor-${index+1}`), value = valid ? controls[index] : null;
    meter.hidden = !valid;
    if(valid) meter.value = value;
    meter.setAttribute("aria-valuetext",valid ? `${number(value,4)} normalized motor command` : "No hardware sample");
    setText(`motor-value-${index+1}`,valid ? number(value,3) : "—");
  }
  setText("motor-sample-status",!valid ? "No hardware sample" : state.mode === "running" ? "Latest accepted sample" : "Last accepted sample · flight stopped");
}
function renderPairs(id,pairs) {
  const fragment = document.createDocumentFragment();
  for (const [label,value] of pairs) {const dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=label;dd.textContent=String(value ?? "—");fragment.append(dt,dd);}
  $(id).replaceChildren(fragment);
}
function renderDiagnostics() {
  lastDiagnosticRender=performance.now();
  // The public frontend omits private runtime snapshots and performance details.
}
// Isometric SI projection; a pad-centred camera keeps local movement legible.
function project(position) {
  const pad = vector(state?.pad?.position) ? state.pad.position : [0,0,0];
  const x=position[0]-pad[0],y=position[1]-pad[1],z=position[2]-pad[2];
  const cameraScale = mobileViewport.matches ? .7 : 1;
  return {x:578 + (x*1000 - y*500)*cameraScale, y:369 + (x*200 + y*300 - z*600)*cameraScale};
}
function draw(now) {
  if(visiblePose && state?.hardware?.connected) {
    // Interpolate only between two accepted states; never extrapolate or animate physics.
    const t = !feedOnline || reducedMotion.matches ? 1 : Math.min(1,Math.max(0,(now-poseUpdatedAt)/40));
    const pos=visiblePose.position.map((value,index)=>(previousPose?.position[index]??value)*(1-t)+value*t);
    const attitude=visiblePose.attitude.map((value,index)=>(previousPose?.attitude[index]??value)*(1-t)+value*t);
    const p=project(pos), pad=vector(state.pad?.position)?state.pad.position:[0,0,0], ground=project([pos[0],pos[1],pad[2]]),target=project(state.target);
    // Sprite bottom marks the reference pose: the cup meets the pad at pad altitude.
    $("drone").setAttribute("transform",`translate(${p.x} ${p.y-44})`);
    $("drone-attitude").setAttribute("transform",`rotate(${(attitude[0]*.6+attitude[1]) * 180/Math.PI})`);
    $("drone-shadow").setAttribute("cx",ground.x); $("drone-shadow").setAttribute("cy",ground.y);
    $("altitude-line").setAttribute("d",`M${p.x} ${p.y}V${ground.y}`);
    $("reference-marker").setAttribute("transform",`translate(${target.x} ${target.y})`);
  }
  $("event-toast").hidden = now>toastUntil; $("gust-visual").toggleAttribute("hidden",now>toastUntil);
  requestAnimationFrame(draw);
}
async function getSnapshot() {
  if(fixtureMode || snapshotRequestBusy) return;
  snapshotRequestBusy = true;
  try {const response=await fetch("/api/state",{cache:"no-store",signal:AbortSignal.timeout(4000)}); if(!response.ok) throw new Error(); acceptSnapshot(await response.json());}
  catch {if(performance.now()-lastSnapshotAt>1500) {feedOnline=false;releaseInputs();renderStatus();}}
  finally {snapshotRequestBusy = false;}
}
function connectFeed() {
  if(fixtureMode) return;
  stream=new EventSource("/api/events");
  const receive=event=>{try{acceptSnapshot(JSON.parse(event.data));}catch{feedError=true;showError("Unreadable bridge event. Waiting for a valid snapshot.");}};
  stream.onmessage=receive;stream.addEventListener("snapshot",receive);stream.addEventListener("state",receive);
  stream.onerror=()=>{if(performance.now()-lastSnapshotAt>1500){feedOnline=false;releaseInputs();renderStatus();}};
  void getSnapshot();
}
if(fixtureMode) {
  $("fixture-notice").hidden=false;
  const variant=new URLSearchParams(location.search).get("fixture");
  acceptSnapshot({schema:1,session:"development-fixture-only",tick:240,monotonic_s:4.8,simulation_time_s:4.8,mode:variant==="landed"?"landed":variant==="fault"?"paused":"running",position:variant==="landed"?[.12,-.08,.12]:[-.12,.08,.3],velocity:[.06,.01,-.02],attitude:[.015,-.02,0],target:[.12,-.08,.12],assistance:true,outcome:variant==="landed"?"Illustrative landing state. No physical acceptance.":null,pad:{id:"coffee-pad",position:[.12,-.08,.12],radius_m:.055},hardware:{connected:true,protocol:"FIXTURE — NOT HARDWARE",port:null,event_count:0,event_counts:[0,0,0,0],fault:variant==="fault"?"Illustrative transport timeout. Numerical steps are paused.":null},timing:{control_hz:0,simulation_speed:0,p50_ms:0,p95_ms:0,p99_ms:0,max_ms:0,deadline_misses:0,steps:0,realtime_qualified:false},copilot:{available:false,busy:false,text:"This is a static development fixture. Live coaching will use measured flight telemetry.",provider:"No model",history:[]},metrics:{gusts:0,gusts_by_button:[0,0,0,0]},last_event:null});
} else {
  connectFeed();
  setInterval(()=>{if(performance.now()-lastSnapshotAt>1200) void getSnapshot();if(lastSnapshotAt && performance.now()-lastSnapshotAt>2500 && feedOnline){feedOnline=false;releaseInputs();renderStatus();}},1000);
}
renderStatus();requestAnimationFrame(draw);
window.addEventListener("resize",renderStatus);
$("diagnostics").addEventListener("toggle",()=>{if($("diagnostics").open) renderDiagnostics();});
