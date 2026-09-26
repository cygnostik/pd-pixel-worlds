// src/plugin.js
import React3, { useSyncExternalStore as useSyncExternalStore3 } from "react";
import { host, Button as Button3, ROUTES_AREA, SIDEBAR_NAV_AREA, PALETTE_AREA, STATUSBAR_AREAS } from "@hermes/plugin-sdk";

// src/runtime.js
var str = (value) => typeof value === "string" ? value : "";
var label = (value) => str(value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
var record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
var key = (...parts) => JSON.stringify(parts);
var terminal = /* @__PURE__ */ new Set(["done", "error"]);
var waits = /* @__PURE__ */ new Set(["clarify.request", "approval.request", "sudo.request", "secret.request", "connection.request", "vault.code.request", "vault.unlock.request", "vault.save_login.request"]);
var waitingTools = /* @__PURE__ */ new Set(["clarify", "browser_vault_enter_code", "browser_vault_save_login", "browser_vault_unlock"]);
var activityEvents = /* @__PURE__ */ new Set(["message.start", "message.delta", "message.interim", "message.complete", "reasoning.delta", "reasoning.available", "thinking.delta", "tool.generating", "tool.start", "tool.complete", "error", "status.update", "subagent.spawn_requested", "subagent.start", "subagent.thinking", "subagent.tool", "subagent.progress", "subagent.complete", ...waits]);
function classifyTool(name) {
  const n = str(name).split(".").at(-1);
  if (waitingTools.has(n)) return "waiting";
  if (n === "delegate_task") return "delegating";
  if (/^(web_|browser_|maps)/.test(n)) return "browsing";
  if (/^(read|search|list|get|recall|skill_view|session_search)/.test(n)) return "reading";
  if (/^(write|patch|edit|create|update|delete|skill_manage|memory)/.test(n)) return "writing";
  if (/^(terminal|process|execute|run)/.test(n)) return "terminal";
  if (/^(image|video|vision|audio|text_to_speech)/.test(n)) return "studio";
  if (/^(todo|cron)/.test(n)) return "planning";
  return "working";
}
function createRuntime({ now = Date.now, eventLimit = 120 } = {}) {
  const agents = /* @__PURE__ */ new Map(), connections = /* @__PURE__ */ new Map(), profiles = /* @__PURE__ */ new Map();
  const aliases = /* @__PURE__ */ new Map(), sequences = /* @__PURE__ */ new Map(), fingerprints = /* @__PURE__ */ new Map(), toolEvents = /* @__PURE__ */ new Set();
  const subscribers = /* @__PURE__ */ new Set();
  let events = [], revision = 0, nextSlot = 0, disposed = false;
  const limit = Number.isFinite(eventLimit) ? Math.max(0, Math.floor(eventLimit)) : 120;
  let snapshot = Object.freeze({ agents: Object.freeze([]), connections: Object.freeze([]), events: Object.freeze([]), revision });
  const scopeKey = (c, p) => key(c, p);
  const sessionKey = (c, p, sid) => key("session", c, p, sid);
  const childKey = (c, p, sid, child) => key("subagent", c, p, sid, child);
  const sameScope = (a, c, p) => a.connectionId === c && a.profile === p;
  const connected = (c, p) => connections.get(scopeKey(c, p))?.status === "open";
  const nameFor = (a) => a.kind === "subagent" ? `Worker \xB7 ${(a.subagentId || a.storedSessionId).slice(-8)}` : profiles.get(scopeKey(a.connectionId, a.profile)) || a.profile || `Session \xB7 ${a.sessionId.slice(-8)}`;
  function publish() {
    revision += 1;
    snapshot = Object.freeze({
      agents: Object.freeze([...agents.values()].sort((a, b) => a.slot - b.slot).map((a) => Object.freeze({ ...a }))),
      connections: Object.freeze([...connections.values()].map((c) => Object.freeze({ ...c }))),
      events: Object.freeze(events.map((e) => Object.freeze({ ...e }))),
      revision
    });
    for (const listener of [...subscribers]) {
      try {
        listener(snapshot);
      } catch {
      }
    }
  }
  function make(id, c, p, sid, extra = {}) {
    const a = {
      id,
      name: "",
      profile: p,
      connectionId: c,
      sessionId: sid,
      storedSessionId: "",
      parentId: null,
      kind: "session",
      status: "unknown",
      activity: "unknown",
      tool: "",
      detail: "No activity observed",
      lastSeen: now(),
      slot: nextSlot++,
      attention: null,
      verified: false,
      ...extra
    };
    a.name = nameFor(a);
    agents.set(id, a);
    return a;
  }
  function session(c, p, sid, stored = "") {
    const id = sessionKey(c, p, sid);
    let a = agents.get(aliases.get(id) || id);
    const child = stored && [...agents.values()].find((row) => sameScope(row, c, p) && row.kind === "subagent" && row.storedSessionId === stored);
    if (child && a !== child) {
      if (a) {
        child.slot = Math.min(a.slot, child.slot);
        if (a.attention === "error") child.attention = "error";
        agents.delete(a.id);
      }
      aliases.set(id, child.id);
      a = child;
    }
    if (!a) a = make(id, c, p, sid);
    if (stored) a.storedSessionId = stored;
    if (a.kind === "subagent") a.runtimeSessionId = sid;
    return a;
  }
  function setState(a, status, activity, detail, tool = "") {
    a.status = status;
    a.activity = activity;
    a.detail = detail;
    a.tool = tool;
    if (status === "error") a.attention = "error";
    else if (status === "waiting" && !a.attention) a.attention = "waiting";
  }
  function invalidate(c, p) {
    for (const a of agents.values()) if (sameScope(a, c, p)) {
      a.verified = false;
      fingerprints.delete(a.id);
      if (a.status === "active" || a.status === "waiting" || a.status === "idle") {
        setState(a, "unknown", "unknown", "Stream unavailable; activity unverified");
      }
    }
  }
  function setConnection(input) {
    if (disposed) return false;
    const c = str(input?.id), p = str(input?.profile);
    if (!c || !p) return false;
    const id = scopeKey(c, p), old = connections.get(id);
    const status = str(input.status) || "unknown";
    const epoch = str(input.replayEpoch) || old?.replayEpoch || "";
    const observation = status === "observed" ? "observed-lease" : status === "open" ? "socket" : "none";
    const next = { id: c, key: id, profile: p, status, observation, name: label(input.name) || old?.name || c, replayEpoch: epoch };
    if (old && Object.keys(next).every((k) => next[k] === old[k])) return false;
    if (old?.replayEpoch && epoch !== old.replayEpoch) {
      for (const sid of sequences.keys()) {
        const [source, profile] = JSON.parse(sid);
        if (source === c && profile === p) sequences.delete(sid);
      }
      for (const token2 of toolEvents) {
        const [, source, profile] = JSON.parse(JSON.parse(token2)[0]);
        if (source === c && profile === p) toolEvents.delete(token2);
      }
      invalidate(c, p);
    }
    connections.set(id, next);
    if (status !== "open" && status !== "observed") invalidate(c, p);
    publish();
    return true;
  }
  function setProfiles(c, rows) {
    if (disposed || !str(c) || !Array.isArray(rows)) return false;
    let changed = false;
    for (const k of profiles.keys()) if (JSON.parse(k)[0] === c) profiles.delete(k);
    for (const row of rows) {
      const p = str(row?.name);
      if (p) profiles.set(scopeKey(c, p), label(row?.ui_meta?.["hermes-bots"]?.title) || label(row?.display_name) || label(p));
    }
    for (const a of agents.values()) if (a.connectionId === c) {
      const name = nameFor(a);
      if (name !== a.name) {
        a.name = name;
        changed = true;
      }
    }
    if (changed) publish();
    return changed;
  }
  function observeSession(input) {
    if (disposed) return false;
    const c = str(input?.connectionId), p = str(input?.profile), sid = str(input?.sessionId);
    if (!c || !p || !sid) return false;
    const before = JSON.stringify([...agents.values()]);
    const a = session(c, p, sid, str(input.storedSessionId));
    const freshTurn = input.busy === true && input.newTurn === true && a.kind === "session";
    if (connected(c, p) && typeof input.busy === "boolean" && (freshTurn || !a.terminal && !terminal.has(a.status) && a.status !== "waiting")) {
      if (freshTurn) {
        a.terminal = false;
        fingerprints.delete(a.id);
      }
      a.verified = true;
      setState(a, input.busy ? "active" : "idle", input.busy ? "thinking" : "idle", input.busy ? "Working (host state)" : "No turn in progress");
    }
    if (before === JSON.stringify([...agents.values()])) return false;
    publish();
    return true;
  }
  function ingest(event, context = {}) {
    if (disposed || !activityEvents.has(event?.type)) return false;
    const type = event.type, payload = record(event.payload);
    if (type === "status.update" && payload.kind !== "compacting") return false;
    const c = str(event.connectionId) || str(context.connectionId), p = str(event.profile) || str(context.profile), sid = str(event.session_id);
    if (!c || !p || !sid) return false;
    if (context.connectionId && event.connectionId && context.connectionId !== event.connectionId || context.profile && event.profile && context.profile !== event.profile) return false;
    const observedLease = context.observedLease === true && event.connectionId === c && event.profile === p && context.connectionId === c && context.profile === p;
    if (!connected(c, p) && !observedLease) return false;
    const sub = type.startsWith("subagent.");
    const childId = str(payload.subagent_id) || str(payload.child_session_id);
    if (sub && !childId) return false;
    const streamKey = key(c, p, sid), seq = event.seq;
    if (Number.isSafeInteger(seq) && seq >= 0) {
      if (seq <= (sequences.get(streamKey) ?? -1)) return false;
      sequences.set(streamKey, seq);
    }
    let a;
    if (sub) {
      const root = session(c, p, sid);
      const id = childKey(c, p, sid, childId);
      a = agents.get(aliases.get(id) || id);
      const stored = str(payload.child_session_id);
      const existing = stored && [...agents.values()].find((row) => sameScope(row, c, p) && row.storedSessionId === stored && row.id !== (a?.id || id));
      if (!a) a = make(id, c, p, sid, { kind: "subagent", subagentId: childId, parentSessionId: sid });
      if (existing) {
        a.slot = Math.min(a.slot, existing.slot);
        if (existing.attention === "error") a.attention = "error";
        if (existing.terminal && !a.terminal) {
          for (const field of ["terminal", "status", "activity", "detail", "tool", "attention"]) a[field] = existing[field];
        }
        if (existing.kind === "session") a.runtimeSessionId = existing.sessionId;
        else {
          a.parentId = existing.parentId;
          a.parentSubagentId = existing.parentSubagentId;
        }
        for (const [alias, target] of aliases) if (target === existing.id) aliases.set(alias, a.id);
        aliases.set(existing.id, a.id);
        for (const row of agents.values()) if (row.parentId === existing.id) row.parentId = a.id;
        events = events.map((e) => e.agentId === existing.id ? { ...e, agentId: a.id } : e);
        agents.delete(existing.id);
      }
      a.storedSessionId = stored || a.storedSessionId;
      a.delegationId = str(payload.delegation_id) || a.delegationId || "";
      const parent = str(payload.parent_id) || a.parentSubagentId;
      const parentKey = parent ? childKey(c, p, sid, parent) : root.id;
      a.parentId = aliases.get(parentKey) || parentKey;
      a.parentSubagentId = parent || null;
    } else a = session(c, p, sid);
    const fingerprint = key(type, str(payload.name), str(payload.tool_name), str(payload.tool_id), str(payload.status), str(payload.request_id));
    if (!Number.isSafeInteger(seq) && fingerprints.get(a.id) === fingerprint) return false;
    fingerprints.set(a.id, fingerprint);
    const toolToken = payload.tool_id && key(a.id, type, payload.tool_id);
    if (toolToken && toolEvents.has(toolToken)) return false;
    if (toolToken) {
      toolEvents.add(toolToken);
      if (toolEvents.size > 4096) toolEvents.delete(toolEvents.values().next().value);
    }
    const start = type === "message.start" || type === "subagent.start";
    const complete = type === "message.complete" || type === "subagent.complete";
    if ((a.terminal || terminal.has(a.status)) && !complete && type !== "error" && !(start && a.kind === "session")) return false;
    if (start) {
      if (a.kind === "subagent" && a.terminal) return false;
      a.terminal = false;
      setState(a, "active", "thinking", sub ? "Delegated worker started" : "Turn started");
    } else if (type === "subagent.spawn_requested") {
      if (a.status === "active" || a.terminal) return false;
      setState(a, "unknown", "queued", "Spawn requested; not yet running");
    } else if (complete) {
      const outcome = str(payload.status);
      const failed = Boolean(payload.error) || ["error", "failed", "timeout"].includes(outcome);
      const success = sub ? outcome === "completed" : outcome === "complete";
      if (a.terminal && a.status === "error" && !failed) return false;
      if (a.terminal && a.status === "done" && !success && !failed) return false;
      a.terminal = true;
      setState(a, failed ? "error" : success ? "done" : "unknown", failed ? "error" : success ? "celebrate" : "unknown", failed ? "Turn failed" : success ? "Turn complete \u2014 not project validation" : outcome === "interrupted" ? "Turn interrupted" : "Turn ended; outcome unverified");
    } else if (type === "error") {
      a.terminal = true;
      setState(a, "error", "error", "Session error; inspect conversation");
    } else if (waits.has(type)) {
      setState(a, "waiting", "waiting", type === "approval.request" ? "Approval needed" : "Input needed", a.tool);
      a.waitingToolId = str(payload.tool_id) || a.toolId || "";
    } else if (type === "tool.complete") {
      const result = record(payload.result);
      const failed = result.is_error === true || result.success === false || Boolean(result.error);
      if (failed) setState(a, "error", "error", "Tool reported failure; inspect conversation");
      else if (a.status !== "waiting" || a.waitingToolId && a.waitingToolId === str(payload.tool_id)) {
        setState(a, "active", "thinking", "Tool completed");
        a.waitingToolId = "";
      }
    } else if (type === "tool.start" || type === "tool.generating" || type === "subagent.tool") {
      if (a.status !== "waiting") {
        const tool = label(payload.name || payload.tool_name), activity = classifyTool(tool);
        a.toolId = str(payload.tool_id);
        setState(a, activity === "waiting" ? "waiting" : "active", activity, tool ? `Tool: ${tool}` : "Tool activity", tool);
        if (activity === "waiting") a.waitingToolId = a.toolId;
      }
    } else if (a.status !== "waiting") {
      const activity = type === "status.update" ? "planning" : type.startsWith("message.") ? "writing" : "thinking";
      setState(a, "active", activity, type === "status.update" ? "Compacting context" : activity === "writing" ? "Streaming response" : "Reasoning");
    }
    a.verified = true;
    a.lastSeen = now();
    if (observedLease) setConnection({ id: c, profile: p, status: "observed" });
    const entry = { id: `${++eventNumber}`, type, agentId: a.id, connectionId: c, profile: p, sessionId: sid, at: a.lastSeen, status: a.status, text: `${a.name} \xB7 ${a.detail}` };
    events = limit ? [entry, ...events].slice(0, limit) : [];
    publish();
    return true;
  }
  let eventNumber = 0;
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed || typeof listener !== "function") return () => {
      };
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    ingest,
    setConnection,
    observeSession,
    setProfiles,
    acknowledge(id) {
      const a = agents.get(id);
      if (disposed || !a?.attention) return false;
      a.attention = null;
      publish();
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      subscribers.clear();
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      subscribers.clear();
    }
  };
}

// src/bridge.js
var text = (value) => typeof value === "string" ? value : "";
var LEGACY_SOURCE = "legacy-primary";
var ownerKey = (r) => JSON.stringify([r.connectionId, r.profile]);
var token = (value) => typeof value === "string" && value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value);
var streaming = /* @__PURE__ */ new Set(["message.delta", "message.interim", "reasoning.delta", "reasoning.available", "thinking.delta", "subagent.thinking", "subagent.progress"]);
function connectHermes(host2, runtime, { now = Date.now, setTimeout: arm = globalThis.setTimeout, clearTimeout: cancel = globalThis.clearTimeout, leaseMs = 45e3 } = {}) {
  if (!Number.isFinite(leaseMs) || leaseMs <= 0 || leaseMs > 45e3) throw new RangeError("leaseMs must be > 0 and <= 45000");
  const state = host2?.state || {}, disposers = [], leases = /* @__PURE__ */ new Map();
  let disposed = false, queued = false, generation = 0, metadataGeneration = 0, timer = null;
  let route = null, focusSignature = "", previousFocus = null, initially = true, routeInvalidated = false;
  const get = (name) => {
    try {
      return state[name]?.get?.();
    } catch {
      return void 0;
    }
  };
  const currentRoute = () => {
    let activeId;
    try {
      activeId = host2?.activeConnectionId?.();
    } catch {
    }
    const status = text(get("gateway")) || "unknown";
    return { connectionId: text(activeId) || text(get("connectionId")) || LEGACY_SOURCE, profile: text(get("profile")), status: status === "connected" ? "open" : status };
  };
  const sameRoute = (a, b) => a && b && a.connectionId === b.connectionId && a.profile === b.profile;
  const connection = (r, status = r.status) => runtime.setConnection({ id: r.connectionId, profile: r.profile, status, name: r.connectionId === LEGACY_SOURCE ? "Legacy primary (source unqualified)" : r.connectionId });
  function armExpiry() {
    if (disposed || timer !== null || !leases.size) return;
    const deadline = Math.min(...[...leases.values()].map((lease) => lease.deadline));
    timer = arm(() => {
      timer = null;
      if (disposed) return;
      sync();
      const at = now();
      for (const [key2, lease] of leases) if (lease.deadline <= at) {
        leases.delete(key2);
        connection(lease, "unknown");
      }
      armExpiry();
    }, Math.max(0, deadline - now()));
    timer?.unref?.();
  }
  function forgetLease(owner) {
    leases.delete(ownerKey(owner));
    if (!leases.size && timer !== null) {
      cancel(timer);
      timer = null;
    }
  }
  function invalidate(owner, status = "unknown") {
    forgetLease(owner);
    connection(owner, status);
  }
  function renew(owner) {
    leases.set(ownerKey(owner), { ...owner, deadline: now() + leaseMs });
    armExpiry();
  }
  function refreshNames() {
    if (disposed || !route?.profile || route.status !== "open" || typeof host2?.request !== "function") return;
    const requestGeneration = ++metadataGeneration, lifecycle = generation, owner = { ...route };
    let pending;
    try {
      pending = host2.request("profiles.list", { include_sessions: false });
    } catch {
      return;
    }
    Promise.resolve(pending).then((result) => {
      if (disposed || lifecycle !== generation || requestGeneration !== metadataGeneration || !sameRoute(owner, currentRoute()) || currentRoute().status !== "open") return;
      if (Array.isArray(result?.profiles)) runtime.setProfiles(owner.connectionId, result.profiles);
    }).catch(() => {
    });
  }
  function readFocus() {
    const sid = text(get("focusedSessionId") ?? get("activeSessionId"));
    if (!sid) return null;
    let owner;
    if (state.focusedSessionOwner?.get) {
      owner = get("focusedSessionOwner");
      if (!owner || !token(owner.connectionId) || !token(owner.profile)) return null;
    } else {
      const profile = text(get("focusedSessionProfile")) || route?.profile;
      if (!route || profile !== route.profile) return null;
      owner = { connectionId: route.connectionId, profile };
    }
    return { connectionId: owner.connectionId, profile: owner.profile, sessionId: sid, storedSessionId: text(get("focusedStoredSessionId")), busy: get("busy") };
  }
  function sync() {
    if (disposed) return;
    const next = currentRoute(), changedRoute = !sameRoute(route, next), changedStatus = route?.status !== next.status || routeInvalidated;
    routeInvalidated = false;
    if (changedRoute || changedStatus) {
      generation += 1;
      metadataGeneration += 1;
      if (route && changedRoute) invalidate(route);
      route = next;
      forgetLease(route);
      if (route.profile) connection(route);
      if (route.status === "open") refreshNames();
    }
    const focused = readFocus(), signature = JSON.stringify(focused);
    if (focused && (signature !== focusSignature || changedRoute || changedStatus)) {
      const sameFocus = previousFocus && sameRoute(focused, previousFocus) && focused.sessionId === previousFocus.sessionId;
      const positiveEdge = sameFocus && previousFocus.busy === false && focused.busy === true;
      const ownedOpen = sameRoute(route, focused) && route.status === "open";
      let busy;
      if (ownedOpen && (focused.busy === false && (initially || signature !== focusSignature) || focused.busy === true && (initially || positiveEdge))) busy = focused.busy;
      runtime.observeSession({ ...focused, busy, newTurn: positiveEdge });
    }
    focusSignature = signature;
    previousFocus = focused;
    initially = false;
  }
  function schedule() {
    if (disposed) return;
    const next = currentRoute();
    if (route && !sameRoute(route, next)) {
      invalidate(route);
      routeInvalidated = true;
    } else if (route && next.status !== "open" && route.status !== next.status) {
      invalidate(route, next.status);
      routeInvalidated = true;
    }
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      sync();
    });
  }
  for (const name of ["connectionId", "profile", "gateway", "focusedSessionOwner", "focusedSessionId", "activeSessionId", "focusedStoredSessionId", "focusedSessionProfile", "busy"]) {
    const atom = state[name];
    try {
      const off = typeof atom?.listen === "function" ? atom.listen(schedule) : typeof atom?.subscribe === "function" ? atom.subscribe(schedule) : null;
      if (typeof off === "function") disposers.push(off);
    } catch {
    }
  }
  if (typeof host2?.onEvent === "function") {
    try {
      const off = host2.onEvent("*", (event) => {
        if (disposed) return;
        sync();
        if (!event || typeof event !== "object" || Array.isArray(event)) return;
        for (const field of ["connectionId", "connection_id", "profile"]) if (event[field] != null && !token(event[field])) return;
        if (event.connectionId != null && event.connection_id != null && event.connectionId !== event.connection_id) return;
        const c = event.connectionId ?? event.connection_id, p = event.profile;
        const owner = { connectionId: c ?? route?.connectionId, profile: p ?? route?.profile };
        const active = sameRoute(owner, route);
        if (!token(owner.connectionId) || !token(owner.profile)) return;
        if (active ? route.status !== "open" : !token(c) || !token(p)) return;
        event = { ...event, connectionId: owner.connectionId, profile: owner.profile };
        if (event.type === "gateway.ready") {
          if (active) {
            runtime.setConnection({ id: route.connectionId, profile: route.profile, status: "open", replayEpoch: text(event.payload?.replay_epoch) });
            refreshNames();
          }
          return;
        }
        if (!token(event.session_id)) return;
        const accepted = runtime.ingest(event, { ...owner, observedLease: !active });
        if (!active) {
          const unsequencedFrame = event.seq == null && streaming.has(event.type) && (!event.type.startsWith("subagent.") || token(event.payload?.subagent_id) || token(event.payload?.child_session_id));
          if (accepted || leases.has(ownerKey(owner)) && unsequencedFrame) renew(owner);
        }
      });
      if (typeof off === "function") disposers.push(off);
    } catch {
    }
  }
  sync();
  return function dispose() {
    if (disposed) return;
    disposed = true;
    generation += 1;
    metadataGeneration += 1;
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
    for (const off of disposers.splice(0).reverse()) {
      try {
        off();
      } catch {
      }
    }
    for (const lease of leases.values()) connection(lease, "unknown");
    leases.clear();
    if (route?.profile) connection(route, "unknown");
  };
}

// src/app.js
import React2, { useState as useState2, useEffect, useRef, useMemo, useSyncExternalStore as useSyncExternalStore2 } from "react";
import { Button as Button2 } from "@hermes/plugin-sdk";

// src/art/pixels.js
var W = 480;
var H = 300;
function painter(c) {
  const rect = (x, y, w, h4, color) => {
    c.fillStyle = color;
    c.fillRect(Math.round(x), Math.round(y), Math.max(0, Math.round(w)), Math.max(0, Math.round(h4)));
  };
  const line = (x, y, x2, y2, color, width = 1) => {
    const n = Math.max(Math.abs(x2 - x), Math.abs(y2 - y));
    for (let i = 0; i <= n; i++) rect(x + (x2 - x) * i / (n || 1), y + (y2 - y) * i / (n || 1), width, width, color);
  };
  const poly = (points, color) => {
    const lo = Math.floor(Math.min(...points.map((p) => p[1]))), hi = Math.ceil(Math.max(...points.map((p) => p[1])));
    for (let y = lo; y < hi; y++) {
      const xs = [];
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i], b = points[j];
        if (a[1] <= y && b[1] > y || b[1] <= y && a[1] > y) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i < xs.length; i += 2) rect(Math.ceil(xs[i]), y, Math.floor(xs[i + 1]) - Math.ceil(xs[i]) + 1, 1, color);
    }
  };
  const oval = (x, y, rx, ry, color) => {
    for (let dy = -Math.floor(ry); dy <= ry; dy++) {
      const dx = Math.round(rx * Math.sqrt(Math.max(0, 1 - dy * dy / (ry * ry))));
      rect(x - dx, y + dy, dx * 2 + 1, 1, color);
    }
  };
  const text3 = (s, x, y, color = "#eee4ce", size = 6) => {
    c.fillStyle = color;
    c.font = `${size}px monospace`;
    c.textBaseline = "top";
    c.fillText(s, Math.round(x), Math.round(y));
  };
  return { c, rect, line, poly, oval, text: text3 };
}
function rng(seed = 17) {
  return () => {
    seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
    return seed / 4294967296;
  };
}
function plant(p, x, y, scale = 1, pot = "#ab6850") {
  const { rect: r, poly: q, line: l, oval: o } = p;
  const s = scale;
  o(x + 2 * s, y + 2 * s, 12 * s, 3 * s, "#403c3030");
  q([[x - 7 * s, y - 10 * s], [x + 7 * s, y - 10 * s], [x + 5 * s, y + 2 * s], [x - 5 * s, y + 2 * s]], pot);
  r(x - 8 * s, y - 11 * s, 16 * s, 3 * s, "#d4a479");
  r(x - 5 * s, y - 8 * s, 2 * s, 8 * s, "#edc28a");
  l(x, y - 10 * s, x, y - 33 * s, "#627147", 2 * s);
  [[-9, -27, -5, -17], [7, -35, 4, -24], [-6, -39, -2, -26], [10, -24, 5, -15], [-12, -17, -4, -12]].forEach(([a, b, d, e], i) => {
    q([[x, y + e * s], [x + a * s, y + b * s], [x + (a + 7) * s, y + (b - 3) * s], [x + d * s, y + (e + 2) * s]], i % 2 ? "#627a48" : "#3d6448");
    l(x, y + e * s, x + a * s, y + b * s, "#829155");
  });
}
function cup(p, x, y, color = "#f4e5c9") {
  p.oval(x + 1, y + 5, 6, 2, "#59443535");
  p.rect(x, y, 6, 6, color);
  p.rect(x + 6, y + 1, 2, 4, color);
  p.rect(x + 1, y, 4, 1, "#62452f");
  p.rect(x, y + 5, 5, 1, "#c9b88f");
}
function books(p, x, y, n = 5) {
  const colors = ["#8c5148", "#718674", "#d4b579", "#667985", "#b28767"];
  for (let i = 0; i < n; i++) {
    const h4 = 9 + i * 3 % 6;
    p.rect(x + i * 5, y - h4, 4, h4, colors[i % 5]);
    p.rect(x + i * 5, y - h4 + 2, 4, 1, "#ecd6a2");
  }
}
function keyboard(p, x, y, w = 21) {
  p.poly([[x + 2, y], [x + w - 2, y], [x + w, y + 6], [x, y + 6]], "#d4c9ab");
  for (let j = 1; j < 5; j += 2) for (let i = 3; i < w - 2; i += 3) p.rect(x + i, y + j, 2, 1, "#807b6e");
}
function monitor(p, x, y) {
  const { rect: r, poly: q } = p;
  q([[x + 2, y + 2], [x + 23, y + 2], [x + 26, y + 6], [x + 26, y + 23], [x + 3, y + 23]], "#837b69");
  r(x, y, 23, 20, "#d9ccb0");
  r(x + 2, y + 2, 18, 13, "#505c53");
  r(x + 3, y + 3, 16, 11, "#729182");
  r(x + 4, y + 4, 10, 1, "#c1d5b4");
  r(x + 4, y + 7, 6, 1, "#a7c2aa");
  r(x + 4, y + 10, 12, 1, "#9fbda7");
  r(x + 17, y + 17, 2, 1, "#c7ddad");
  r(x + 9, y + 20, 5, 4, "#a79b80");
  r(x + 4, y + 23, 16, 2, "#e0d0ad");
}
function printer(p, x, y) {
  const { rect: r, poly: q } = p;
  p.oval(x + 2, y + 5, 17, 5, "#5b473860");
  q([[x - 14, y - 13], [x + 7, y - 13], [x + 16, y - 6], [x - 5, y - 6]], "#e7dcc0");
  r(x - 14, y - 6, 23, 14, "#c1b69a");
  q([[x + 9, y - 6], [x + 16, y - 6], [x + 16, y + 4], [x + 9, y + 8]], "#938e7f");
  r(x - 11, y - 2, 15, 4, "#484c48");
  r(x - 9, y + 1, 13, 6, "#f3edda");
  r(x - 7, y + 2, 8, 1, "#bab9a8");
  r(x - 8, y - 19, 17, 9, "#f4ebd5");
  r(x - 6, y - 17, 10, 1, "#bcbab0");
  r(x - 6, y - 14, 11, 1, "#bcbab0");
  r(x + 6, y - 5, 2, 2, "#769065");
  r(x - 11, y + 6, 3, 2, "#8c8775");
}

// src/art/lcars.js
var INK = "#101218";
var COLORS = ["#edb77c", "#b9a3d6", "#e7a28d", "#e5cea2"];
var TRACE = "#8da8bc";
function drawLcarsPanel(p, x, y, w, h4, { seed = 1, skew = 0, variant = "systems" } = {}) {
  if (![x, y, w, h4, skew].every(Number.isFinite) || w < 1 || h4 < 1) return;
  w = Math.floor(w);
  h4 = Math.floor(h4);
  const id = Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 1;
  const amber = COLORS[0], lilac = COLORS[1], peach = COLORS[2], cream = COLORS[3];
  const box = (a, b, ww, hh, color) => {
    const left2 = Math.max(0, Math.round(a)), top2 = Math.max(0, Math.round(b));
    const right2 = Math.min(w, Math.round(a + ww)), bottom2 = Math.min(h4, Math.round(b + hh));
    if (right2 <= left2 || bottom2 <= top2) return;
    for (let u = left2; u < right2; u++) p.rect(x + u, y + top2 + u * skew, 1, bottom2 - top2, color);
  };
  const round = (a, b, ww, hh, r, color) => {
    a = Math.round(a);
    b = Math.round(b);
    ww = Math.round(ww);
    hh = Math.round(hh);
    r = Math.max(0, Math.min(Math.floor(r), Math.floor(ww / 2), Math.floor(hh / 2)));
    for (let row = 0; row < hh; row++) {
      const dy = Math.max(r - row - 0.5, row - (hh - r) + 0.5, 0);
      const inset = dy ? Math.ceil(r - Math.sqrt(Math.max(0, r * r - dy * dy))) : 0;
      box(a + inset, b + row, ww - 2 * inset, 1, color);
    }
  };
  const line = (a, b, c, d, color = TRACE) => {
    const n = Math.ceil(Math.max(Math.abs(c - a), Math.abs(d - b)));
    for (let i = 0; i <= n; i++) box(a + (c - a) * i / (n || 1), b + (d - b) * i / (n || 1), 1, 1, color);
  };
  const path = (points, color = TRACE) => {
    for (let i = 1; i < points.length; i++) line(...points[i - 1], ...points[i], color);
  };
  box(0, 0, w, h4, INK);
  if (w < 5 || h4 < 3) {
    box(0, 0, w, 1, COLORS[id % 3]);
    return;
  }
  if (h4 < 14 || w < 25) {
    const top2 = 1, bar2 = Math.max(1, Math.min(3, h4 - 2)), spine2 = Math.min(5, Math.max(2, Math.floor(w / 8)));
    round(1, top2, w - 2, bar2, 2, amber);
    const split2 = Math.max(spine2 + 2, Math.floor(w * (0.42 + id % 3 * 0.06)));
    box(split2, top2, 2, bar2, INK);
    round(split2 + 2, top2, w - split2 - 3, bar2, 2, lilac);
    if (h4 >= 7) {
      round(1, top2, spine2, h4 - 2, 2, amber);
      box(1, h4 - 4, spine2, 1, INK);
      box(spine2 + 3, h4 - 3, Math.max(2, w * 0.27), 1, peach);
      box(w * 0.72, h4 - 3, w * 0.17, 1, cream);
    }
    return;
  }
  const margin = 2, bar = Math.max(3, Math.min(6, Math.floor(h4 * 0.15)));
  const spine = Math.max(5, Math.min(10, Math.floor(w * 0.105)));
  const elbowH = Math.max(bar + 5, Math.floor(h4 * 0.58)), radius = Math.min(6, spine);
  round(margin, margin, w - 4, elbowH, radius, amber);
  round(margin + spine, margin + bar, w, h4, Math.max(2, radius - 2), INK);
  const split = Math.round(w * (0.49 + id % 3 * 0.045)), end = Math.round(w * 0.81);
  box(split, margin, 2, bar, INK);
  box(split + 2, margin, end - split - 2, bar, lilac);
  box(end, margin, 2, bar, INK);
  round(end + 2, margin, w - end - 4, bar, 2, peach);
  box(margin, elbowH - 1, spine, 2, INK);
  round(margin, elbowH + 1, spine, h4 - elbowH - 3, 2, lilac);
  const seam = Math.floor((h4 + elbowH) / 2);
  box(margin, seam, spine, 1, INK);
  box(margin, seam + 1, spine, Math.max(1, h4 - seam - 4), peach);
  const left = margin + spine + 4, right = w - 4, top = margin + bar + 4, bottom = h4 - 6;
  const dw = right - left, dh = bottom - top;
  round(left, h4 - 3, dw * 0.31, 1, 0, peach);
  round(left + dw * 0.38, h4 - 3, dw * 0.42, 1, 0, lilac);
  if (dw < 9 || dh < 4) return;
  const X = (t) => Math.round(left + t * dw), Y = (t) => Math.round(top + t * dh);
  const route = (points) => path(points.map(([a, b]) => [X(a), Y(b)]));
  const node = (a, b, color = cream) => box(X(a) - 1, Y(b) - 1, 3, 2, color);
  if (variant === "navigation") {
    const offset = id % 3 * 0.025;
    route([[0.29 + offset, 0.08], [0.56, 0.08], [0.71, 0.3], [0.71, 0.68], [0.55, 0.9], [0.28, 0.9], [0.13, 0.67], [0.13, 0.31], [0.29 + offset, 0.08]]);
    route([[0.33, 0.28], [0.51, 0.28], [0.57, 0.43], [0.57, 0.61], [0.47, 0.72], [0.31, 0.66], [0.27, 0.44], [0.33, 0.28]]);
    path([[X(0.04), Y(0.82)], [X(0.45), Y(0.48)], [X(0.85), Y(0.12)]], peach);
    node(0.45, 0.48);
    node(0.85, 0.12, lilac);
    for (let j = 0; j < 3; j++) box(X(0.86), Y(0.47 + j * 0.2), dw * (0.08 - j * 0.015), 1, j === 1 ? amber : lilac);
  } else if (variant === "power") {
    route([[0.42, 0], [0.59, 0.2], [0.59, 0.76], [0.42, 1], [0.25, 0.76], [0.25, 0.2], [0.42, 0]]);
    for (let j = 0; j < 3; j++) round(X(0.33), Y(0.22 + j * 0.23), Math.max(2, dw * 0.18), 2, 1, j === 1 ? cream : lilac);
    route([[0.25, 0.35], [0.1, 0.35], [0.1, 0.08], [0, 0.08]]);
    route([[0.59, 0.58], [0.79, 0.58], [0.79, 0.17], [0.95, 0.17]]);
    route([[0.59, 0.78], [0.9, 0.78], [0.9, 1]]);
    node(0, 0.08, peach);
    node(0.95, 0.17, amber);
    node(0.9, 1, lilac);
  } else {
    const junction = 0.28 + id % 4 * 0.055, count = 2 + id % 2;
    route([[0.02, 0.22], [junction, 0.22], [junction, 0.82], [0.93, 0.82]]);
    for (let j = 0; j < count; j++) {
      const a = 0.45 + j * (0.48 / count), yy = 0.08 + (id + j) % 3 * 0.14;
      route([[a, 0.82], [a, yy], [Math.min(0.98, a + 0.12), yy]]);
      round(X(a + 0.02), Y(yy) - 1, Math.max(3, dw * 0.1), 3, 1, j % 2 ? peach : lilac);
    }
    node(0.02, 0.22, cream);
    node(junction, 0.54, amber);
    box(X(0.04), Y(0.66), Math.max(2, dw * 0.1), 1, lilac);
  }
  if (w > 100) for (let j = 0; j < 3; j++) box(right - 2 - j * 4, top, 2, 1, j === 1 ? cream : amber);
}

// src/art/bridge-scene.js
var BRIDGE_ANCHORS = [[240, 195], [161, 248], [319, 248], [196, 199], [284, 199], [240, 145], [184, 147], [296, 147], [67, 191], [413, 191], [77, 254], [403, 254]];
var C = { wall: "#9f8e77", light: "#dfcfac", seam: "#6d6255", floor: "#697674", rose: "#916863", wood: "#81523b", black: "#191e23" };
function panel(p, x, y, w, h4, skew = 0, seed = 1) {
  const count = w > 120 ? 5 : w >= 60 ? 3 : 1, step = Math.floor((w - 4) / count);
  for (let u = 0; u < w; u++) p.rect(x + u, y + u * skew, 1, h4, C.black);
  for (let i = 0; i < count; i++) {
    const left = 2 + i * step;
    if (h4 < 14) {
      drawLcarsPanel(p, x + left, y + left * skew, step - 2, h4, { seed: seed + i, skew });
      continue;
    }
    const r = (a, b, ww, hh, color) => {
      for (let u = a; u < a + ww; u++) p.rect(x + left + u, y + b + (left + u) * skew, 1, hh, color);
    };
    const l = (a, b, c, d, color) => {
      const n = Math.max(Math.abs(c - a), Math.abs(d - b));
      for (let j = 0; j <= n; j++) r(Math.round(a + (c - a) * j / (n || 1)), Math.round(b + (d - b) * j / (n || 1)), 1, 1, color);
    };
    const trace2 = (points) => {
      for (let j = 1; j < points.length; j++) l(...points[j - 1], ...points[j], "#89a6b0");
    };
    const amber = "#c8b68d", lilac = "#b4a4c0", cream = "#e0d5b6";
    r(0, 2, step - 2, h4 - 4, "#101218");
    r(2, 4, [12, 19, 10, 15, 21][i], 2, i % 2 ? lilac : amber);
    r(2, 6, 2, 7, amber);
    r(2, 15, 2, 4, lilac);
    r(2, 21, 2, 4, "#d7a17e");
    r(26, 4, 3, 1, cream);
    if (i === 0) {
      trace2([[8, 10], [14, 10], [14, 22], [29, 22]]);
      for (let j = 0; j < 3; j++) {
        trace2([[18 + j * 4, 22], [18 + j * 4, 12 + j * 2]]);
        r(17 + j * 4, 11 + j * 2, 3, 2, j % 2 ? lilac : cream);
      }
      r(7, 17, 4, 1, amber);
      r(7, 20, 3, 1, lilac);
    } else if (i === 1) {
      trace2([[12, 10], [23, 10], [28, 14], [28, 20], [23, 24], [12, 24], [8, 20], [8, 14], [12, 10]]);
      trace2([[14, 14], [21, 14], [24, 17], [21, 21], [14, 21], [11, 17], [14, 14]]);
      l(7, 23, 27, 11, "#d7a17e");
      r(17, 16, 2, 2, cream);
    } else if (i === 2) {
      for (let j = 0; j < 4; j++) r(15, 10 + j * 4, 4, 2, j === 2 ? cream : lilac);
      trace2([[12, 10], [10, 10], [10, 23], [12, 23]]);
      trace2([[21, 12], [25, 12], [25, 19], [29, 19]]);
      r(6, 15, 3, 1, amber);
      r(27, 23, 3, 1, cream);
    } else if (i === 3) {
      for (let j = 0; j < 5; j++) {
        r(8, 10 + j * 3, [10, 15, 7, 13, 9][j], 1, j % 2 ? cream : lilac);
        r(27, 10 + j * 3, 2, 1, amber);
      }
      r(23, 10, 1, 15, "#536a79");
    } else {
      trace2([[7, 19], [12, 19], [16, 13], [24, 13], [28, 17], [24, 21], [16, 21], [12, 19]]);
      trace2([[18, 13], [18, 9], [26, 9]]);
      trace2([[18, 21], [18, 24], [28, 24]]);
      r(17, 16, 8, 2, cream);
      r(7, 10, 4, 1, lilac);
      r(8, 24, 5, 1, amber);
    }
    r(7, 27, 8, 1, i % 2 ? amber : lilac);
    r(20, 27, 9, 1, "#d7a17e");
  }
}
function sideWall(p, side) {
  const point = (x, v) => [side < 0 ? x : 480 - x, 98 - 13 * x / 98 + v / 110 * (108 - 30 * x / 98)];
  const poly = (pts, color) => p.poly(pts.map(([x, v]) => point(x, v)), color);
  const box = (x, v, w, h4, color) => poly([[x, v], [x + w, v], [x + w, v + h4], [x, v + h4]], color);
  box(0, 0, 98, 110, "#a48f76");
  box(2, 3, 94, 103, "#b09a7e");
  box(4, 5, 90, 3, "#7e8d99");
  box(5, 5, 88, 1, "#c7d9df");
  box(6, 21, 68, 78, "#72695f");
  box(7, 22, 66, 76, "#a79a88");
  for (const x of [8, 30, 52]) {
    for (const [v, h4] of [[23, 12], [36, 12], [56, 12], [69, 12], [82, 13]]) {
      box(x, v, 20, h4, "#89858a");
      box(x + 13, v + 3, 6, 2, "#16191d");
      box(x + 17, v + 3, 1, 1, "#e6dfc9");
    }
    box(x, 49, 20, 6, "#11151b");
  }
  box(78, 14, 16, 85, "#756b5e");
  box(79, 15, 14, 83, "#141a20");
  box(80, 17, 12, 19, "#10151b");
  box(80, 40, 12, 31, "#10151b");
  box(80, 76, 12, 19, "#10151b");
  poly([[81, 47], [83, 44], [87, 44], [88, 42], [91, 44], [91, 46], [87, 47], [85, 49], [81, 49]], "#b59a5d");
  poly([[84, 54], [89, 54], [91, 58], [91, 62], [89, 66], [84, 66], [82, 62], [82, 58]], "#b59a5d");
  poly([[85, 55], [88, 55], [90, 59], [90, 62], [88, 65], [85, 65], [83, 62], [83, 59]], "#6f613c");
  box(81, 56, 4, 2, "#b59a5d");
  box(81, 63, 4, 2, "#b59a5d");
  for (let i = 0; i < 5; i++) {
    box(81 + i * 2, 80, 1, 2, i % 2 ? "#b8cdd7" : "#648eae");
    box(81 + i * 2, 84, 1, 2, i % 2 ? "#c9b37e" : "#83a4bc");
  }
  box(0, 107, 98, 3, "#793f43");
}
function helmChair(p, x) {
  const { rect: r, poly: q, oval: o } = p;
  o(x, 278, 15, 3, "#303a3b55");
  r(x - 5, 248, 10, 28, "#635f54");
  r(x - 3, 250, 3, 24, "#a29984");
  r(x + 2, 250, 1, 24, "#827969");
  q([[x - 13, 237], [x - 11, 209], [x - 7, 204], [x + 8, 204], [x + 12, 209], [x + 14, 237]], "#88725e");
  q([[x - 11, 237], [x - 9, 210], [x + 9, 210], [x + 12, 237]], "#bea17e");
  r(x - 8, 205, 17, 5, "#d7bd96");
  r(x - 7, 211, 15, 24, "#c4a780");
  for (let y = 217; y < 235; y += 7) {
    r(x - 8, y, 18, 1, "#8f785f");
    r(x - 7, y + 1, 17, 1, "#dfc49b");
  }
  q([[x - 12, 238], [x + 13, 238], [x + 17, 245], [x + 13, 250], [x - 12, 250], [x - 15, 245]], "#b09370");
  q([[x - 11, 238], [x + 12, 238], [x + 14, 244], [x - 13, 244]], "#dfc49b");
  r(x - 10, 248, 21, 2, "#8f785f");
}
function chair(p, x, y, s = 1) {
  const { rect: r, poly: q, oval: o } = p;
  const P = (pts, c) => q(pts.map(([a, b]) => [x + a * s, y + b * s]), c), R = (a, b, w, h4, c) => r(x + a * s, y + b * s, w * s, h4 * s, c);
  o(x, y + 5 * s, 18 * s, 4 * s, "#242b2b55");
  R(-4, 0, 8, 7, "#3e403c");
  P([[-15, -5], [-12, -40], [-8, -44], [9, -44], [13, -40], [17, -5]], "#7a6654");
  P([[-13, -6], [-10, -39], [-7, -42], [8, -42], [11, -38], [14, -6]], "#c3a27b");
  R(-8, -40, 16, 6, "#e3c8a0");
  R(-7, -34, 14, 23, "#ad8b6b");
  for (let j = 0; j < 5; j++) {
    R(-6, -31 + j * 4, 12, 1, "#d7b991");
    R(-6, -30 + j * 4, 12, 1, "#957961");
  }
  R(-11, -8, 24, 7, "#dfbe93");
  R(-10, -7, 21, 2, "#edd3aa");
  P([[-17, -18], [-11, -14], [-11, -2], [-18, -4]], "#bb9872");
  P([[12, -14], [19, -18], [20, -4], [13, -2]], "#cdb08a");
  R(-17, -18, 7, 3, "#ebcea3");
  R(13, -18, 7, 3, "#ebcea3");
}
function drawBridge(p) {
  const { rect: r, poly: q, line: l, oval: o } = p, random = rng(2026);
  r(0, 0, 480, 300, "#3c3731");
  q([[0, 132], [480, 132], [480, 300], [0, 300]], C.floor);
  q([[0, 148], [115, 132], [123, 145], [30, 300], [0, 300]], "#734e4c");
  q([[480, 148], [365, 132], [357, 145], [450, 300], [480, 300]], "#734e4c");
  for (let i = 0; i < 1200; i++) {
    const x = random() * 480, y = 145 + random() * 155;
    r(x, y, 1, 1, i % 2 ? "#e0d4b509" : "#1b272912");
  }
  q([[0, 52], [480, 52], [480, 160], [367, 144], [113, 144], [0, 160]], C.wall);
  q([[0, 57], [105, 76], [375, 76], [480, 57], [480, 90], [375, 86], [105, 86], [0, 90]], "#75654f");
  r(147, 83, 186, 60, "#6c6253");
  r(151, 86, 178, 53, "#b4a38a");
  r(152, 87, 176, 3, "#ede0c0");
  panel(p, 153, 95, 174, 31, 0, 9);
  q([[153, 127], [327, 127], [332, 137], [148, 137]], "#514944");
  panel(p, 155, 128, 170, 6, 0, 3);
  r(152, 137, 176, 9, "#a89478");
  for (let x = 155; x < 328; x += 22) {
    r(x, 138, 19, 7, "#b6a48b");
    r(x, 138, 19, 1, "#cdbb9a");
  }
  for (const x of [103, 335]) {
    q([[x, 91], [x + 4, 83], [x + 37, 83], [x + 42, 90], [x + 42, 145], [x, 145]], "#6e6659");
    r(x + 4, 90, 34, 53, "#b5ab98");
    r(x + 5, 91, 15, 51, "#a79c8b");
    r(x + 22, 91, 15, 51, "#bdb09a");
    r(x + 20, 90, 2, 54, "#635e54");
    for (const yy of [106, 123, 137]) {
      r(x + 5, yy, 15, 1, "#8e8577");
      r(x + 22, yy, 15, 1, "#8e8577");
    }
    r(x + 13, 117, 6, 2, "#514e44");
    r(x + 23, 117, 4, 2, "#efe0b9");
    r(x + 1, 145, 40, 2, "#d2c09e");
  }
  for (const x of [145, 331]) {
    r(x, 93, 4, 45, "#282727");
    r(x + 1, 99, 2, 9, "#d7a474");
    r(x + 1, 113, 2, 6, "#d07d59");
    r(x + 1, 125, 2, 9, "#e0b07a");
  }
  sideWall(p, -1);
  sideWall(p, 1);
  q([[117, 211], [126, 192], [144, 175], [170, 161], [202, 152], [240, 149], [278, 152], [310, 161], [336, 175], [354, 192], [363, 211], [350, 223], [314, 230], [166, 230], [130, 223]], C.rose);
  helmChair(p, 161);
  helmChair(p, 319);
  o(240, -12, 283, 98, "#4b3c2d");
  o(240, -14, 276, 91, "#bdac88");
  o(240, -18, 269, 89, "#eee2bd");
  o(240, -22, 267, 83, "#f7efcf");
  for (const side of [-1, 1]) {
    const map = (pts) => pts.map(([x, y]) => [240 + side * x, y]);
    q(map([[67, 0], [83, 0], [112, 27], [140, 57], [156, 65], [146, 67], [128, 56], [99, 26]]), "#867051");
    q(map([[128, 0], [146, 0], [188, 25], [213, 45], [224, 48], [219, 53], [204, 47], [173, 27]]), "#927a57");
    q(map([[192, 0], [215, 0], [250, 17], [264, 26], [260, 33], [245, 26]]), "#8b724f");
    for (const pts of [[[25, 0], [40, 17], [57, 25], [66, 47], [75, 67]], [[101, 0], [116, 15], [139, 25], [159, 47], [172, 62]]]) {
      const a = map(pts);
      for (let i = 1; i < a.length; i++) l(...a[i - 1], ...a[i], "#b2a17d", 2);
    }
  }
  o(240, -12, 83, 35, "#8a6e50");
  o(240, -14, 77, 31, "#392f29");
  o(240, -16, 70, 27, "#161f26");
  for (let i = 0; i < 34; i++) {
    const x = 174 + random() * 132, y = random() * 12;
    if (((x - 240) / 69) ** 2 + ((y + 16) / 27) ** 2 < 1) r(x, y, 1, 1, "#aaa897");
  }
  for (let x = 0; x < 480; x++) {
    const yy = 68 - 23 * ((x - 240) / 240) ** 2;
    r(x, yy, 1, 4, "#65513a");
    r(x, yy + 4, 1, 2, "#c8b38c");
    r(x, yy + 6, 1, 3, "#827057");
  }
}
function drawBridgeRail(ctx) {
  const p = painter(ctx), { poly: q, line: l } = p;
  const arc = [[117, 211], [125, 191], [143, 173], [169, 157], [200, 147], [240, 143], [280, 147], [311, 157], [337, 173], [355, 191], [363, 211]];
  const inner = [[119, 211], [129, 194], [148, 179], [173, 165], [203, 157], [240, 153], [277, 157], [307, 165], [332, 179], [351, 194], [361, 211]];
  q([[201, 146], [279, 146], [270, 157], [259, 169], [251, 179], [249, 187], [231, 187], [229, 179], [221, 169], [210, 157]], "#a89e8e");
  q([[205, 148], [275, 148], [266, 158], [255, 170], [247, 184], [233, 184], [225, 170], [214, 158]], "#d0c6b4");
  l(211, 150, 227, 170, "#e2d8c5");
  l(269, 150, 253, 170, "#afa596");
  q([...inner, ...inner.map(([x, y]) => [x, y + 2]).reverse()], "#674333");
  q([...arc, ...[...inner].reverse()], C.wood);
  for (let i = 1; i < arc.length; i++) {
    l(...arc[i - 1], ...arc[i], "#b1855b");
    l(...inner[i - 1], ...inner[i], "#916144");
  }
  chair(p, 196, 194, 0.9);
  chair(p, 240, 190, 1);
  chair(p, 284, 194, 0.9);
  for (const side of [-1, 1]) {
    const P = (pts, color) => q(pts.map(([x, y]) => [240 + side * x, y]), color);
    P([[64, 180], [79, 180], [87, 184], [86, 190], [69, 190]], "#9a7c61");
    P([[65, 180], [79, 180], [85, 183], [82, 186], [67, 186]], "#d1b18a");
    P([[61, 178], [74, 175], [87, 187], [84, 203], [66, 201]], "#a78c71");
    P([[65, 181], [74, 180], [83, 189], [80, 199], [68, 198]], "#e1e9df");
    P([[61, 171], [72, 167], [80, 177], [67, 183], [59, 178]], "#d2b594");
    P([[62, 172], [71, 169], [76, 176], [66, 179]], "#bca080");
    P([[64, 172], [70, 170], [73, 173], [66, 175]], "#434044");
  }
}
function drawBridgeHelm(ctx) {
  const p = painter(ctx), { poly: q, line: l, oval: o } = p;
  for (const side of [-1, 1]) {
    const center = 240 + side * 79, P = (pts, color) => q(pts.map(([x, y]) => [center + side * x, y]), color);
    o(center, 284, 48, 5, "#34413f45");
    P([[-37, 281], [42, 281], [46, 285], [-39, 285]], "#3d4544");
    P([[17, 248], [46, 248], [43, 276], [37, 281], [21, 281], [13, 273]], "#665c50");
    P([[20, 246], [44, 247], [40, 275], [35, 278], [22, 278], [16, 271]], "#a79378");
    P([[20, 253], [43, 253], [40, 273], [35, 277], [23, 277], [17, 270]], "#d6eee5");
    P([[21, 255], [40, 255], [37, 270], [33, 274], [23, 274], [20, 269]], "#e6f5e9");
    P([[-40, 235], [40, 235], [49, 241], [-49, 241]], "#bfa687");
    P([[-37, 236], [37, 236], [43, 241], [-43, 241]], "#29292c");
    panel(p, center - 34, 236, 68, 4, 0, side < 0 ? 11 : 19);
    P([[-49, 240], [49, 240], [52, 243], [48, 247], [-47, 247], [-52, 244]], "#a88e72");
    P([[-48, 240], [48, 240], [49, 242], [-49, 242]], "#d2b999");
    P([[-49, 242], [49, 242], [47, 245], [-47, 245]], "#bba083");
    l(center - 46, 246, center + 46, 246, "#82705d");
  }
}

// src/art/scenes.js
var ANCHORS = {
  office: [[53, 151], [145, 151], [237, 151], [53, 220], [145, 220], [237, 220], [46, 275], [108, 275], [170, 275], [232, 275], [294, 275], [293, 202]],
  cafe: [[61, 159], [160, 156], [270, 154], [379, 156], [80, 218], [180, 215], [278, 215], [391, 216], [55, 274], [155, 270], [264, 272], [379, 273]],
  bridge: BRIDGE_ANCHORS
};
var YARD = [[358, 191], [426, 191], [358, 232], [426, 232]];
function office(p) {
  const { rect: r, poly: q, line: l, oval: o, text: t } = p, random = rng(71);
  r(0, 0, 480, 300, "#423e36");
  r(9, 13, 464, 281, "#8d775c");
  r(9, 13, 317, 269, "#aaa18a");
  r(11, 17, 312, 79, "#d9ceb3");
  r(12, 20, 310, 4, "#efe3c6");
  r(12, 24, 310, 3, "#c6b99d");
  r(12, 84, 313, 10, "#b9ab8c");
  r(12, 87, 313, 2, "#eadbbe");
  r(12, 93, 313, 191, "#b6ad92");
  for (let i = 0; i < 1700; i++) {
    const x = 14 + random() * 306, y = 96 + random() * 185;
    r(x, y, 1 + (i % 3 === 0), 1, i % 2 ? "#c0b69a" : "#aaa18a");
  }
  for (let x = 18; x < 300; x += 57) {
    r(x, 28, 45, 43, "#a19880");
    r(x + 2, 29, 41, 39, "#c3c9b9");
    for (let y = 32; y < 66; y += 4) {
      r(x + 2, y, 41, 1, "#879486");
      r(x + 2, y + 1, 41, 1, "#e0ddc7");
    }
    r(x + 21, 29, 2, 38, "#b5aa8c");
    r(x - 2, 69, 49, 4, "#ecdfc1");
    l(x + 41, 33, x + 41, 60, "#f0e4bd");
  }
  r(48, 17, 59, 5, "#b6ab90");
  r(50, 18, 55, 2, "#fff0ce");
  r(188, 17, 58, 5, "#b6ab90");
  r(190, 18, 54, 2, "#fff0ce");
  r(257, 29, 39, 32, "#826b4d");
  r(259, 31, 35, 28, "#b09261");
  [[262, 35, 11, 14], [279, 34, 10, 10], [276, 47, 12, 10]].forEach(([x, y, w, h4], i) => {
    r(x, y, w, h4, i % 2 ? "#e6ce8b" : "#eee3c9");
    r(x + 2, y + 4, w - 4, 1, "#a39a83");
    r(x + 2, y + 7, w - 5, 1, "#aaa088");
    r(x + 4, y, 2, 2, "#9a4f3b");
  });
  o(311, 44, 9, 9, "#796f5d");
  o(311, 43, 7, 7, "#efe8d1");
  l(311, 43, 311, 38, "#514c43");
  l(311, 43, 315, 45, "#514c43");
  r(291, 70, 19, 21, "#99977e");
  r(293, 72, 15, 7, "#c1b697");
  r(293, 82, 15, 7, "#c1b697");
  r(298, 74, 5, 2, "#6f725f");
  r(298, 84, 5, 2, "#6f725f");
  r(19, 72, 12, 18, "#e2d6bb");
  r(21, 61, 9, 13, "#91afa8");
  r(22, 63, 6, 9, "#bed0be");
  r(22, 78, 2, 3, "#677c81");
  r(27, 78, 2, 3, "#a8604c");
  for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
    const x = 31 + col * 92, y = 111 + row * 69;
    q([[x - 11, y + 8], [x + 64, y + 8], [x + 73, y + 19], [x + 73, y + 40], [x + 9, y + 40]], "#7c766445");
    r(x - 13, y - 26, 79, 4, "#d6cfb9");
    r(x - 13, y - 22, 79, 22, "#96998a");
    r(x - 12, y - 20, 76, 17, "#afb09c");
    for (let xx = x - 8; xx < x + 62; xx += 5) r(xx, y - 18, 1, 14, "#a4a793");
    r(x - 13, y - 23, 3, 51, "#c9c5ae");
    r(x - 10, y - 2, 65, 5, "#efe2be");
    r(x - 10, y + 3, 65, 10, "#bdab83");
    r(x - 8, y + 13, 4, 18, "#8d856e");
    r(x + 47, y + 13, 5, 18, "#8d856e");
    r(x + 37, y + 11, 14, 17, "#c6b895");
    r(x + 39, y + 14, 9, 2, "#8a826b");
    r(x + 39, y + 22, 9, 2, "#8a826b");
    monitor(p, x + 4, y - 21);
    keyboard(p, x + 7, y + 5);
    cup(p, x + 37, y - 2);
    r(x + 47, y - 4, 12, 2, "#f2e6c8");
    r(x + 49, y - 6, 12, 2, "#fff0d0");
    r(x + 52, y - 9, 6, 3, col === 1 ? "#ad4f3d" : "#bbae8d");
    r(x + 29, y - 16, 7, 7, "#ead087");
    r(x + 31, y - 14, 3, 1, "#b19461");
  }
  r(326, 14, 145, 78, "#b7a081");
  r(328, 16, 142, 64, "#d0b58b");
  for (let y = 24; y < 78; y += 8) {
    r(328, y, 142, 1, "#ae9572");
    for (let x = 328 + (y % 16 ? 12 : 0); x < 470; x += 28) r(x, y - 7, 1, 7, "#bfa27c");
  }
  r(329, 81, 142, 206, "#b28b60");
  for (let i = 0; i < 1700; i++) {
    const x = 331 + random() * 137, y = 88 + random() * 195;
    r(x, y, 1 + (i % 4 === 0), 1, ["#aa8055", "#b99568", "#c09a6b", "#a47d53"][i % 4]);
  }
  q([[337, 82], [379, 82], [423, 184], [380, 184]], "#d7b87940");
  r(318, 25, 9, 103, "#706c58");
  r(321, 29, 3, 96, "#ede0b9");
  r(315, 87, 14, 37, "#f0e0bb");
  r(316, 91, 11, 30, "#c3b99b");
  r(326, 14, 5, 70, "#e0c697");
  r(326, 133, 5, 152, "#d1bf96");
  r(326, 128, 6, 5, "#a19173");
  for (let x = 337; x < 470; x += 11) {
    r(x, 54, 9, 34, "#ad8e62");
    r(x + 1, 53, 7, 2, "#cdb181");
    r(x + 1, 59, 1, 26, "#d5b989");
    r(x + 7, 58, 1, 26, "#93734e");
  }
  r(335, 66, 137, 3, "#91734f");
  r(335, 80, 137, 3, "#97774f");
  for (let i = 0; i < 34; i++) {
    const x = 337 + random() * 126, y = 91 + random() * 184;
    if (x > 345 && x < 444 && y > 126 && y < 242) continue;
    l(x, y, x - 2, y - 6, "#768053");
    l(x + 1, y, x + 3, y - 4, "#8b8b52");
    l(x, y, x, y - 8, "#64734b");
  }
  o(391, 194, 35, 12, "#ac8254");
  printer(p, 391, 192);
  r(444, 108, 17, 21, "#789080");
  r(442, 106, 21, 3, "#6b7a64");
  r(447, 111, 2, 16, "#99a18c");
  r(454, 111, 1, 15, "#536e5c");
  r(9, 282, 317, 6, "#e1d2af");
  r(9, 288, 317, 7, "#7f755e");
  r(9, 295, 317, 3, "#504d42");
  r(329, 287, 143, 8, "#846545");
  r(329, 295, 143, 3, "#5f513b");
  plant(p, 305, 263, 1.05);
  plant(p, 17, 263, 0.9);
  books(p, 270, 91, 3);
  t("TPS", 277, 37, "#665c48", 5);
}
function cafe(p) {
  const { rect: r, poly: q, line: l, oval: o, text: t } = p, random = rng(39);
  r(0, 0, 480, 300, "#504b3b");
  r(8, 13, 464, 278, "#86633f");
  r(10, 15, 460, 87, "#ebd9ad");
  r(10, 18, 460, 3, "#fff0c9");
  r(10, 93, 460, 191, "#c59a64");
  for (let y = 97, row = 0; y < 284; y += 12, row++) {
    r(10, y, 460, 1, "#a97d4f");
    r(10, y + 1, 460, 1, "#deb77c");
    for (let x = 10 - row % 2 * 33; x < 469; x += 67) {
      r(x, y, 1, 12, "#9e744a");
      r(x + 7, y + 5, 39, 1, row % 2 ? "#c0925f" : "#bd8e59");
      r(x + 33, y + 8, 19, 1, "#d0a36a");
    }
  }
  for (let i = 0; i < 3; i++) {
    const x = 27 + i * 66;
    r(x - 3, 28, 57, 58, "#9b7650");
    r(x, 30, 51, 52, "#b8d2bd");
    r(x + 2, 32, 47, 17, "#dce7c4");
    o(x + 8, 65, 18, 18, "#91b08a");
    o(x + 39, 66, 19, 24, "#9bb991");
    o(x + 24, 79, 21, 14, "#688d71");
    r(x + 2, 57, 47, 2, "#e6d6ad");
    r(x + 24, 30, 3, 52, "#f7e4b7");
    r(x, 81, 51, 3, "#795b3a");
    r(x - 5, 84, 61, 5, "#f4dfb1");
    r(x - 5, 89, 61, 3, "#b28958");
  }
  q([[30, 93], [73, 93], [165, 245], [109, 245]], "#f5da9780");
  q([[98, 93], [137, 93], [224, 245], [174, 245]], "#ffe9af65");
  q([[164, 93], [205, 93], [284, 232], [234, 232]], "#ffecb850");
  r(222, 26, 123, 41, "#6a7355");
  r(225, 29, 117, 35, "#4d624d");
  r(229, 33, 109, 1, "#a3b487");
  t("THE LITTLE", 254, 34, "#ecdfb0", 7);
  t("PAW & POUR", 243, 44, "#fff0c6", 10);
  r(10, 91, 460, 4, "#866542");
  r(361, 29, 94, 3, "#9e734c");
  r(361, 58, 94, 4, "#936743");
  for (let i = 0; i < 6; i++) {
    r(366 + i * 14, 38, 9, 18, "#ccb994");
    r(367 + i * 14, 41, 7, 12, ["#977652", "#af8e68", "#738365"][i % 3]);
    r(365 + i * 14, 36, 11, 3, "#79674b");
    r(368 + i * 14, 46, 5, 4, "#e1d2aa");
  }
  r(245, 77, 214, 7, "#f5deac");
  r(248, 84, 208, 33, "#aa7349");
  r(254, 88, 48, 25, "#bc8756");
  r(307, 88, 53, 25, "#bc8756");
  r(366, 88, 83, 25, "#9c6944");
  for (let xx = 370; xx < 447; xx += 8) r(xx, 90, 1, 23, "#c49462");
  r(249, 114, 205, 4, "#704e36");
  r(368, 64, 49, 14, "#6f7970");
  r(370, 52, 45, 13, "#adb3a0");
  r(372, 54, 40, 4, "#e5d7ba");
  r(373, 64, 4, 10, "#414c45");
  r(391, 64, 4, 10, "#414c45");
  r(369, 77, 50, 2, "#e2ceb0");
  cup(p, 377, 69);
  cup(p, 399, 69);
  r(422, 59, 13, 19, "#b29c77");
  o(428, 58, 6, 4, "#6e5440");
  r(252, 55, 99, 23, "#87a99b");
  r(254, 57, 94, 18, "#c9d2b0");
  r(254, 72, 94, 2, "#846346");
  r(256, 66, 90, 2, "#f0d4a0");
  for (let i = 0; i < 6; i++) {
    const x = 261 + i * 15;
    o(x, 62, 5, 3, i % 2 ? "#cc9860" : "#d8aa67");
    r(x - 2, 60, 4, 1, "#f1d39a");
    r(x - 4, 71, 9, 2, "#f0c583");
    r(x - 2, 69, 5, 2, i % 3 ? "#8f5140" : "#d9968b");
  }
  l(259, 57, 266, 64, "#eef1d9");
  l(325, 57, 335, 68, "#eef1d9");
  r(299, 56, 2, 20, "#efdfbd");
  r(251, 77, 102, 3, "#6b694f");
  function rug(x, y, w, h4) {
    r(x, y, w, h4, "#ad7760");
    r(x + 3, y + 2, w - 6, h4 - 4, "#d4b27f");
    r(x + 6, y + 4, w - 12, h4 - 8, "#ab8668");
    for (let xx = x + 10; xx < x + w - 10; xx += 10) r(xx, y + 6, 3, h4 - 12, "#b7936e");
    for (let xx = x + 3; xx < x + w - 2; xx += 4) {
      r(xx, y - 2, 1, 2, "#edc894");
      r(xx, y + h4, 1, 2, "#edc894");
    }
  }
  rug(31, 126, 162, 37);
  rug(236, 126, 173, 35);
  rug(33, 181, 170, 41);
  rug(239, 184, 174, 38);
  rug(33, 242, 160, 37);
  rug(236, 242, 174, 37);
  for (const x of [26, 126]) {
    r(x, 117, 70, 14, "#5c7054");
    r(x - 2, 106, 74, 13, "#91a27a");
    r(x, 107, 70, 3, "#adb590");
    r(x - 4, 110, 7, 22, "#768760");
    r(x + 66, 110, 7, 22, "#768760");
    r(x + 7, 131, 3, 6, "#765c3d");
    r(x + 57, 131, 3, 6, "#765c3d");
    r(x + 19, 111, 17, 11, "#dfb18a");
    r(x + 21, 112, 13, 1, "#f1cba0");
  }
  for (const [x, y] of [[61, 178], [162, 175], [268, 175], [380, 175], [77, 235], [178, 236], [276, 237], [387, 237]]) {
    o(x + 3, y + 7, 25, 6, "#815c3b35");
    r(x - 18, y - 1, 4, 13, "#8d6841");
    r(x + 15, y - 1, 4, 13, "#8d6841");
    o(x, y - 5, 25, 10, "#956741");
    o(x, y - 7, 25, 9, "#e3bd83");
    o(x, y - 8, 22, 7, "#edcf9c");
    cup(p, x + 11, y - 12);
    keyboard(p, x - 16, y - 9, 18);
  }
  r(423, 139, 5, 105, "#b28b59");
  r(452, 139, 5, 105, "#b28b59");
  for (let y = 141; y < 237; y += 31) {
    r(418, y, 45, 6, "#d6b17a");
    r(420, y, 41, 2, "#efcea0");
    r(426, y + 8, 2, 13, "#937347");
  }
  r(421, 239, 41, 7, "#9c744c");
  r(425, 249, 28, 14, "#b99465");
  r(429, 251, 15, 10, "#634d37");
  r(427, 264, 27, 3, "#765538");
  for (let x = 13; x < 24; x += 3) {
    r(x, 25, 3, 65, x % 2 ? "#d8c6a1" : "#f2e1b9");
  }
  for (let x = 209; x < 221; x += 3) r(x, 25, 3, 65, x % 2 ? "#d8c6a1" : "#f2e1b9");
  plant(p, 233, 107, 1.1);
  plant(p, 458, 140, 0.95);
  plant(p, 22, 224, 0.9);
  plant(p, 458, 281, 1.4);
  plant(p, 20, 282, 1.2);
  plant(p, 342, 77, 0.6);
  for (let i = 0; i < 8; i++) {
    const x = 230 + i * 8, y = 20 + Math.sin(i * 0.6) * 5;
    l(x, 15, x, y + 10, "#65784f");
    o(x, y + 10, 4, 2, i % 2 ? "#6e8456" : "#859365");
  }
  for (const x of [275, 392]) {
    r(x, 13, 1, 12, "#7d6b4b");
    q([[x - 10, 25], [x + 10, 25], [x + 16, 34], [x - 16, 34]], "#a98753");
    r(x - 14, 34, 28, 2, "#f6deb0");
  }
  books(p, 293, 118, 5);
  r(9, 284, 462, 5, "#e7c18a");
  r(9, 289, 462, 7, "#84603f");
  r(13, 296, 454, 3, "#624b34");
}
function drawBackground(ctx, theme) {
  const p = painter(ctx);
  if (theme === "cafe") cafe(p);
  else if (theme === "bridge") drawBridge(p);
  else office(p);
}

// src/art/warp-core.js
var clamp = (n) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
var timeValue = (t) => Number.isFinite(t) ? Math.max(0, t) : 0;
var bandColors = ["#245d9a", "#337fb9", "#4daddb", "#6bcdf2", "#8ce5ff"];
function bandLevel(distance, time, pulse) {
  const phase = (timeValue(time) + 0.176) % 1.4 / 0.8, delta = Math.abs(distance - phase);
  const crest = Math.max(0, 1 - delta / 0.18);
  return Math.min(4, Math.floor(crest * 4 + clamp(pulse) * 0.8));
}
function plasmaConduit(p, x, w) {
  const { rect: r, line: l, poly: q } = p;
  q([[x, 108], [x + 4, 104], [x + w - 4, 104], [x + w, 108], [x + w, 122], [x, 122]], "#20232d");
  r(x, 108, w, 14, "#39293d");
  l(x + 3, 105, x + w - 3, 105, "#697079");
  for (let row = 0; row < 3; row++) r(x + 2, 109 + row * 5, w - 4, 3, row === 1 ? "#ca758d" : "#99536d");
  for (let xx = x + 4; xx < x + w - 2; xx += 7) r(xx, 106, 2, 17, "#1d2430");
  l(x + 1, 123, x + w - 1, 123, "#151f2a");
}
function drawWarpCore(p, time = 0, pulse = 0) {
  const { rect: r, poly: q, oval: o, line: l } = p;
  r(216, 12, 86, 148, "#101f38");
  r(223, 12, 72, 148, "#18385f");
  q([[232, 10], [286, 10], [292, 76], [226, 76]], "#255389");
  r(233, 12, 51, 67, "#255f9c");
  r(237, 12, 10, 67, "#3077b2");
  r(255, 12, 17, 67, "#3786bb");
  r(277, 12, 7, 67, "#1b457a");
  r(230, 128, 60, 32, "#245b96");
  r(237, 130, 45, 30, "#2d75ac");
  r(251, 130, 15, 30, "#3c8cbb");
  for (const [start, end, fromTop] of [[13, 76, true], [131, 159, false]]) for (let y = start; y < end; y += 7) {
    const distance = fromTop ? (y - start) / (end - start) : (end - y) / (end - start), level = bandLevel(distance, time, pulse);
    r(231, y + 1, 56, 4, bandColors[level]);
    r(235, y, 48, 1, level >= 3 ? "#94e4fa" : "#4387b3");
    r(234, y + 5, 50, 1, "#163b65");
    r(248, y + 1, 22, 3, bandColors[Math.min(4, level + 1)]);
  }
  for (const x of [227, 247, 271, 287]) {
    r(x, 11, 3, 65, "#14283f");
    r(x + 1, 11, 1, 65, "#3d627b");
    r(x, 131, 3, 29, "#1a2b43");
  }
  plasmaConduit(p, 183, 45);
  plasmaConduit(p, 291, 46);
  o(259, 77, 39, 7, "#162637");
  r(222, 77, 75, 21, "#1e2b3b");
  q([[222, 94], [297, 94], [308, 108], [306, 124], [213, 124], [211, 108]], "#152333");
  o(259, 96, 43, 9, "#263b54");
  r(216, 97, 87, 24, "#1d2d44");
  o(259, 123, 43, 9, "#172335");
  l(224, 80, 294, 80, "#527794");
  l(218, 119, 301, 119, "#365a7c");
  o(259, 109, 13, 14, "#40586c");
  o(259, 109, 10, 11, "#122032");
  o(259, 109, 8, 9, "#d6f5ff");
  r(258, 99, 3, 21, "#1a2d48");
  r(257, 95, 5, 3, "#7694a5");
  r(257, 121, 5, 3, "#65869a");
  for (const x of [216, 282]) {
    r(x, 104, 22, 10, "#36517d");
    for (let i = 0; i < 4; i++) r(x + 2 + i * 5, 106, 3, 6, "#b7dfef");
  }
  q([[257, 84], [260, 79], [263, 84]], "#c99486");
  r(260, 81, 1, 2, "#d8d2b7");
}
function drawHallCore(p, time = 0, pulse = 0) {
  const Y = (y) => 43 + Math.round(y * 0.72);
  drawWarpCore({
    ...p,
    rect: (x, y, w, h4, c) => p.rect(x, Y(y), w, Math.max(1, Y(y + h4) - Y(y)), c),
    line: (x, y, xx, yy, c, w = 1) => p.line(x, Y(y), xx, Y(yy), c, w),
    poly: (points, c) => p.poly(points.map(([x, y]) => [x, Y(y)]), c),
    oval: (x, y, rx, ry, c) => p.oval(x, Y(y), rx, rx <= 13 ? Math.min(rx, ry) : Math.round(ry * 0.72), c)
  }, time, pulse);
}

// src/art/engineering-scene.js
var C2 = { cream: "#d8ceba", ivory: "#f0e5ca", taupe: "#a99c89", shade: "#71695e", deep: "#454740", sand: "#b4a58a", teal: "#557b82", glass: "#111b24", blue: "#3984df", cyan: "#94e9fa", white: "#e6fbff" };
var unit = (v) => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
var seconds = (v) => Number.isFinite(v) ? Math.max(0, v) : 0;
var freeze = (value) => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
var ENGINEERING_PORTAL = freeze({ x: 120, y: 374, approach: [120, 294], rect: [103, 338, 35, 67], offscreen: true });
var CHIEF_OFFICE_PORTAL = freeze({ x: 66, y: 158, approach: [66, 179], rect: [45, 88, 42, 72] });
var nearExit = [[139, 294], [120, 294]];
var leftExit = (x, y) => [[x, y], [139, y], ...nearExit];
var crossExit = [[342, 180], [170, 180], [170, 194], [125, 194], [125, 294], [120, 294]];
var rightExit = (x, y) => [[x, y], [342, y], [342, 294], [120, 294]];
var ENGINEERING_STATIONS = freeze([
  { id: "engineering-duty-port", x: 149, y: 169, facing: "north", seated: false, exitPath: [[149, 169], [139, 180], ...nearExit] },
  { id: "engineering-duty-starboard", x: 363, y: 163, facing: "north", seated: false, exitPath: [[363, 163], [363, 180], ...crossExit] },
  { id: "engineering-wall-port", x: 102, y: 214, facing: "west", seated: false, exitPath: leftExit(102, 214) },
  { id: "engineering-wall-starboard", x: 387, y: 214, facing: "east", seated: false, exitPath: rightExit(387, 214) },
  { id: "engineering-table-port", x: 174, y: 252, facing: "east", seated: false, exitPath: leftExit(174, 252) },
  { id: "engineering-table-starboard", x: 316, y: 252, facing: "west", seated: false, exitPath: rightExit(316, 252) },
  { id: "engineering-service-port", x: 70, y: 279, facing: "west", seated: false, exitPath: leftExit(70, 279) },
  { id: "engineering-service-starboard", x: 410, y: 279, facing: "east", seated: false, exitPath: rightExit(410, 279) }
]);
var CHIEF_OFFICE_STATIONS = freeze([
  { id: "chief-office-workbay", x: 139, y: 186, facing: "north", seated: false, exitPath: [[139, 186], [139, 208], [100, 208], [66, 179]] },
  { id: "chief-office-console", x: 275, y: 235, facing: "north", seated: false, exitPath: [[275, 235], [181, 235], [100, 208], [66, 179]] }
]);
var ENGINEERING_HOTSPOTS = freeze([
  { id: "engineering-core", label: "Warp-core resonance", x: 212, y: 61, width: 94, height: 99, action: "pulse" },
  { id: "engineering-systems-table", label: "LCARS diagnostic simulation", x: 184, y: 189, width: 122, height: 85, action: "diagnostic" },
  { id: "engineering-computer-access", label: "Computer access diagnostics", x: 137, y: 100, width: 28, height: 47, action: "diagnostic" },
  { id: "engineering-isolinear", label: "Isolinear chip diagnostics", x: 359, y: 84, width: 29, height: 43, action: "diagnostic" }
]);
var CHIEF_OFFICE_HOTSPOTS = freeze([
  { id: "chief-office-systems-wall", label: "Engineering systems diagnostics", x: 200, y: 58, width: 183, height: 82, action: "diagnostic" },
  { id: "chief-office-work-console", label: "LCARS diagnostic simulation", x: 219, y: 189, width: 120, height: 40, action: "diagnostic" },
  { id: "chief-office-tea", label: "Replicate tea", x: 407, y: 115, width: 48, height: 43, action: "tea" },
  { id: "chief-office-annex", label: "Return through Engineering annex", x: 45, y: 88, width: 42, height: 72, action: "lift" }
]);
function trace(p, points, color, width = 1) {
  for (let i = 1; i < points.length; i++) p.line(...points[i - 1], ...points[i], color, width);
}
function panel2(p, x, y, w, h4, seed = 1, skew = 0, variant = "systems") {
  drawLcarsPanel(p, x, y, w, h4, { seed, skew, variant });
}
function rail(p) {
  const { line: l, poly: q } = p;
  q([[174, 151], [193, 159], [230, 165], [288, 165], [326, 159], [346, 150], [346, 156], [326, 164], [288, 170], [230, 170], [193, 164], [174, 157]], "#353f43");
  trace(p, [[174, 150], [194, 158], [229, 164], [289, 164], [325, 158], [346, 149]], "#a99d89", 2);
  const points = [[178, 132], [194, 140], [228, 145], [289, 145], [324, 140], [343, 131]];
  for (const [x, y] of points) {
    l(x, y, x, y + 18, "#b7b6a8", 2);
    l(x + 2, y + 1, x + 2, y + 17, "#344952");
  }
  trace(p, points, "#372d30", 3);
  trace(p, points, "#af8c72");
  trace(p, points.map(([x, y]) => [x, y + 13]), "#667b85");
}
function chamber(p) {
  const { rect: r, poly: q, line: l } = p;
  q([[163, 35], [178, 24], [342, 24], [355, 37], [355, 80], [352, 80], [352, 155], [346, 156], [326, 164], [288, 170], [230, 170], [193, 164], [174, 157], [168, 155], [168, 80], [163, 80]], "#171f2a");
  q([[175, 34], [340, 34], [340, 157], [334, 160], [183, 160], [175, 157]], "#222d38");
  for (const x of [180, 317]) {
    r(x, 74, 18, 73, "#68544b");
    r(x + 4, 74, 8, 73, "#9c6155");
    r(x + 6, 75, 2, 69, "#d99378");
  }
  r(201, 32, 8, 118, "#384652");
  r(307, 32, 6, 118, "#46515b");
  q([[174, 66], [216, 77], [216, 99], [174, 87]], "#616b70");
  q([[301, 77], [346, 65], [346, 87], [301, 99]], "#5b656e");
  q([[177, 74], [210, 83], [210, 90], [177, 81]], "#172633");
  q([[308, 83], [342, 74], [342, 81], [308, 90]], "#162632");
  q([[174, 59], [216, 70], [216, 80], [174, 70]], "#766e62");
  q([[301, 70], [346, 58], [346, 70], [301, 80]], "#716b61");
  trace(p, [[174, 69], [215, 79]], "#9d9481");
  trace(p, [[301, 79], [346, 69]], "#9d9481");
  q([[176, 148], [214, 146], [232, 152], [292, 152], [312, 146], [344, 148], [333, 160], [326, 164], [193, 164], [187, 160]], "#0f1c27");
  drawHallCore(p);
  rail(p);
}
function wallBays(p, right = false) {
  const { poly: q, line: l } = p;
  const X = (x) => right ? 480 - x : x, shape = (points) => points.map(([x, y]) => [X(x), y]);
  q(shape([[4, 60], [82, 67], [96, 86], [90, 133], [6, 149]]), "#b2a793");
  q(shape([[8, 66], [77, 73], [88, 89], [85, 128], [8, 143]]), "#848780");
  q(shape([[11, 69], [73, 76], [84, 91], [81, 124], [11, 138]]), "#969a92");
  q(shape([[8, 143], [85, 128], [90, 134], [9, 150]]), "#cfc5af");
  l(X(11), 139, X(81), 125, "#696e69");
  q(shape([[82, 67], [96, 85], [105, 153], [97, 178], [91, 184], [96, 151], [90, 90]]), "#d8ceba");
  l(X(84), 70, X(94), 87, "#ece1c8");
}
function computerAccess(p) {
  const { rect: r, poly: q } = p;
  q([[78, 81], [103, 66], [138, 66], [174, 80], [174, 151], [163, 161], [88, 157]], "#716e62");
  q([[85, 86], [106, 74], [139, 74], [169, 85], [169, 144], [89, 152]], "#96907c");
  q([[92, 94], [132, 90], [166, 98], [166, 132], [94, 139]], "#3b423d");
  panel2(p, 102, 104, 14, 26, 51);
  panel2(p, 119, 102, 14, 28, 52);
  r(137, 100, 28, 32, "#6e7166");
  panel2(p, 139, 102, 24, 28, 53);
  q([[95, 139], [133, 133], [165, 134], [169, 145], [100, 153]], "#a99f88");
  q([[99, 141], [133, 136], [165, 137], [164, 142], [101, 148]], C2.glass);
  q([[136, 134], [165, 134], [169, 145], [136, 150]], C2.cream);
  panel2(p, 138, 136, 26, 7, 14);
  q([[135, 150], [167, 150], [164, 162], [139, 162]], C2.shade);
}
function isolinearBay(p) {
  const { rect: r, line: l, poly: q } = p;
  q([[345, 77], [372, 64], [405, 67], [426, 82], [420, 155], [385, 160], [347, 153]], "#716e62");
  q([[352, 80], [373, 73], [402, 76], [415, 86], [412, 149], [352, 153]], "#96907c");
  r(357, 77, 35, 53, "#7d7c6f");
  r(357, 80, 32, 48, "#c6bca5");
  r(360, 84, 26, 41, "#152c34");
  for (let col = 0; col < 5; col++) for (let row = 0; row < 3; row++) {
    const x = 362 + col * 5, y = 87 + row * 12, blue = (col + row) % 2 === 0;
    r(x, y, 3, 9, blue ? "#397ca7" : "#398b78");
    r(x + 1, y, 1, 8, blue ? "#8dd2e9" : "#94d9b1");
    r(x, y + 9, 3, 2, "#656d67");
    r(x + 1, y + 10, 1, 1, "#d9cba0");
  }
  l(361, 124, 385, 124, "#95a79b");
  starboardDutyConsole(p);
}
function starboardDutyConsole(p) {
  p.c.save();
  p.c.beginPath();
  p.c.rect(357, 122, 33, 35);
  p.c.clip();
  p.poly([[354, 122], [389, 128], [389, 145], [354, 140]], C2.cream);
  panel2(p, 358, 125, 26, 11, 19, 0.16);
  p.poly([[356, 141], [387, 145], [384, 156], [358, 155]], C2.shade);
  p.c.restore();
}
var WORKBAY_SPOTS = freeze([[112, 73], [139, 73], [162, 73], [359, 73], [382, 73]]);
function workbaySoffit(p) {
  const { poly: q } = p;
  q([[76, 58], [181, 58], [174, 64], [172, 68], [76, 68]], "#a79d89");
  q([[76, 68], [172, 68], [170, 71], [168, 80], [162, 79], [76, 79]], "#555b51");
  q([[339, 58], [421, 58], [421, 68], [348, 68], [346, 64]], "#a79d89");
  q([[348, 68], [421, 68], [421, 79], [358, 79], [352, 80], [350, 71]], "#555b51");
  for (const [x, y] of WORKBAY_SPOTS) {
    p.oval(x, y, 4, 2, "#747665");
    p.oval(x, y, 2, 1, "#f3ecdc");
  }
}
function coreBulkheadRim(p) {
  const { rect: r, line: l, poly: q } = p;
  for (const right of [false, true]) {
    const X = (x) => right ? 520 - x : x, shape = (points) => points.map(([x, y]) => [X(x), y]);
    q(shape([[171, 81], [177, 76], [177, 152], [173, 159], [171, 163]]), "#505d5e");
    q(shape([[168, 163], [168, 80], [170, 71], [174, 64], [181, 58], [183, 58], [177, 65], [173, 73], [171, 81], [171, 161]]), "#7e776a");
    q(shape([[171, 163], [171, 81], [173, 73], [177, 65], [183, 59], [182, 60], [178, 67], [175, 74], [173, 82], [173, 161]]), "#343d3d");
    q(shape([[168, 161], [173, 159], [177, 152], [177, 157], [173, 163], [168, 164]]), "#716e62");
    trace(p, shape([[169, 162], [169, 80], [171, 72], [175, 65], [182, 59]]), "#a49c88");
    trace(p, shape([[173, 160], [173, 82], [175, 74], [178, 67], [182, 60]]), "#65716e");
    for (const y of [105, 133]) l(X(168), y, X(170), y, "#50574f");
  }
  r(183, 58, 154, 1, "#7e776a");
  r(183, 59, 154, 1, "#a49c88");
  r(183, 60, 154, 1, "#343d3d");
}
function sideConsole(p, right = false, near = false) {
  const { poly: q, line: l } = p;
  const shape = (points) => points.map(([x, y]) => [right ? 480 - x : x, y]);
  const bounds = shape(near ? [[0, 215], [45, 227], [57, 258], [51, 279], [0, 298]] : [[0, 143], [83, 131], [94, 180], [91, 207], [31, 237], [0, 221]]);
  p.c.save();
  p.c.beginPath();
  bounds.forEach(([x, y], i) => i ? p.c.lineTo(x, y) : p.c.moveTo(x, y));
  p.c.closePath();
  p.c.clip();
  if (near) {
    q(shape([[0, 215], [45, 227], [51, 279], [0, 298]]), C2.shade);
    q(shape([[0, 218], [41, 230], [44, 255], [0, 271]]), C2.cream);
    q(shape([[0, 239], [43, 250], [57, 258], [0, 278]]), "#ddd1b9");
    if (right) panel2(p, 439, 232, 41, 21, -3, -0.29);
    else panel2(p, 0, 220, 41, 21, 3, 0.29);
    q(shape([[0, 260], [50, 254], [57, 258], [0, 278]]), "#a99b83");
    q(shape([[0, 280], [49, 262], [49, 276], [0, 294]]), "#eaf0df");
    q(shape([[0, 282], [45, 266], [45, 274], [0, 290]]), "#f8f8e8");
  } else {
    q(shape([[0, 143], [83, 131], [92, 179], [15, 215], [0, 205]]), C2.taupe);
    q(shape([[8, 148], [80, 136], [83, 164], [37, 184], [13, 184]]), C2.glass);
    if (right) panel2(p, 400, 137, 72, 31, 12, 0.19);
    else panel2(p, 8, 151, 72, 31, 8, -0.19);
    q(shape([[12, 184], [84, 166], [94, 180], [21, 206]]), C2.cream);
    if (right) {
      l(399, 174, 459, 189, "#c08b52");
      l(399, 176, 459, 191, "#9d8ec4");
    } else {
      l(20, 190, 80, 175, "#c08b52");
      l(20, 192, 80, 177, "#9d8ec4");
    }
    q(shape([[21, 207], [93, 182], [91, 207], [31, 237]]), "#a79d88");
    q(shape([[26, 211], [88, 190], [87, 207], [33, 233]]), "#d8ddcb");
    q(shape([[29, 213], [85, 194], [84, 206], [35, 229]]), "#f4f5e6");
  }
  p.c.restore();
}
var TABLE_READOUT = freeze({ x: 218, y: 195, width: 54, height: 12 });
function table(p) {
  const { poly: q, rect: r, line: l, oval: o } = p, glass = "#000000";
  o(247, 273, 70, 9, "#273d4540");
  q([[211, 206], [278, 206], [277, 229], [262, 235], [224, 235], [211, 228]], "#8b8575");
  q([[205, 248], [288, 248], [282, 275], [270, 280], [221, 280], [207, 274]], "#a59b87");
  q([[211, 250], [275, 250], [273, 277], [221, 277], [211, 272]], "#c6bba4");
  r(225, 253, 37, 23, "#55574e");
  r(228, 255, 31, 19, C2.glass);
  for (let j = 0; j < 4; j++) {
    r(231, 257 + j * 4, 2, 2, "#90bbaa");
    r(237, 257 + j * 4, 4, 1, "#769797");
    r(249, 257 + j * 4, 6, 2, j % 2 ? "#b6c19a" : "#729d91");
  }
  const rim = [[216, 188], [275, 188], [291, 196], [291, 206], [273, 216], [273, 221], [305, 233], [305, 249], [286, 261], [207, 261], [184, 249], [184, 233], [215, 221], [215, 216], [198, 206], [198, 197]];
  q(rim.map(([x, y]) => [x, y + 5]), "#736e64");
  q(rim, C2.cream);
  q([[217, 191], [274, 191], [287, 198], [287, 205], [268, 215], [268, 224], [300, 235], [300, 247], [284, 257], [210, 257], [189, 247], [189, 235], [220, 224], [220, 213], [202, 204], [202, 199]], glass);
  trace(p, [[217, 193], [273, 193], [284, 199], [284, 204], [264, 215]], "#adbdaf");
  trace(p, [[220, 226], [193, 237], [193, 246], [212, 254], [283, 254], [296, 246], [297, 237], [272, 226]], "#c6d0b8");
  const { x: rx, y: ry, width: rw, height: rh } = TABLE_READOUT;
  drawLcarsPanel({ rect: (x, y, w, h4, color) => r(rx + rw - x - w, ry + y, w, h4, color === "#101218" ? glass : color) }, 0, 0, rw, rh, { seed: 36, variant: "power" });
  o(206, 241, 5, 4, "#91cde5");
  l(206, 237, 206, 245, glass);
  l(201, 241, 211, 241, glass);
  o(206, 241, 2, 2, glass);
  o(206, 241, 1, 1, "#91cde5");
  for (const [y, color] of [[237, "#d8c788"], [243, "#b9a3d6"]]) {
    r(216, y, 3, 3, color);
    r(215, y + 1, 5, 1, color);
  }
  const outline = "#c4d4d7", circuit = "#537d9d", highlight = "#86b3ce", gold = "#baaa65";
  trace(p, [[225, 241], [226, 237], [230, 233], [236, 231], [244, 231], [250, 233], [254, 237], [255, 241], [254, 245], [250, 249], [244, 251], [236, 251], [230, 249], [226, 245], [225, 241]], outline);
  for (const side of [-1, 1]) {
    const path = (points, color) => trace(p, points.map(([x, y]) => [x, 241 + side * y]), color);
    path([[254, 4], [259, 3], [264, 6], [276, 6], [279, 5], [279, 0]], outline);
    path([[261, 7], [260, 8], [261, 10], [279, 10], [281, 9], [281, 7], [280, 6], [262, 6], [261, 7]], outline);
    path([[264, 8], [278, 8]], highlight);
    path([[253, 2], [269, 2], [274, 0]], highlight);
    path([[256, 4], [266, 4], [271, 6]], circuit);
    path([[227, 2], [233, 2], [233, 7], [237, 7], [237, 3]], circuit);
    path([[229, 5], [231, 5], [231, 3]], highlight);
    path([[241, 3], [241, 8], [246, 8], [246, 5], [251, 5]], circuit);
    path([[245, 2], [249, 2], [249, 6]], highlight);
    path([[235, 9], [235, 5]], circuit);
    r(234, 241 + side * 5, 3, 1, gold);
    r(247, 241 + side * 7, 3, 1, gold);
  }
  l(227, 241, 277, 241, circuit);
  l(239, 232, 239, 250, highlight);
  trace(p, [[239, 239], [241, 239], [242, 241], [241, 243], [239, 243], [238, 241], [239, 239]], outline);
  r(240, 241, 1, 1, highlight);
  r(224, 230, 3, 1, gold);
  r(284, 233, 3, 1, gold);
  r(284, 235, 2, 1, highlight);
  r(224, 252, 3, 1, gold);
  r(284, 248, 3, 1, gold);
  r(284, 250, 2, 1, highlight);
  q([[225, 221], [238, 202], [250, 201], [269, 220], [265, 228], [225, 228]], "#b7ae9c");
  q([[239, 202], [250, 202], [267, 220], [239, 220]], "#e1d6be");
  q([[227, 220], [239, 205], [239, 220]], "#776e63");
  panel2(p, 244, 211, 15, 8, 22, 0, "systems");
  l(227, 225, 265, 225, C2.ivory, 2);
  l(207, 261, 286, 261, "#ece0c4");
}
function engineeringFloor(p) {
  const { rect: r, poly: q } = p, random = rng(3601);
  r(0, 116, 480, 184, C2.sand);
  const carpet = [
    [76, 300],
    [128, 208],
    [126, 205],
    [122, 203],
    [116, 202],
    [99, 203],
    [100, 186],
    [184, 186],
    [193, 184],
    [199, 181],
    [206, 172],
    [314, 172],
    [318, 181],
    [322, 184],
    [329, 186],
    [399, 186],
    [398, 203],
    [382, 202],
    [376, 203],
    [373, 205],
    [371, 208],
    [413, 300]
  ];
  q(carpet, "#526f89");
  p.c.save();
  p.c.beginPath();
  carpet.forEach(([x, y], i) => i ? p.c.lineTo(x, y) : p.c.moveTo(x, y));
  p.c.closePath();
  p.c.clip();
  for (let i = 0; i < 820; i++) {
    const x = 76 + random() * 337, y = 172 + random() * 128;
    r(x, y, 1, 1, i % 2 ? "#c3d4de0a" : "#152b4412");
  }
  p.c.restore();
}
function drawEngineering(ctx) {
  const p = painter(ctx), { rect: r, poly: q, line: l } = p;
  r(0, 0, 480, 300, "#4a4c48");
  engineeringFloor(p);
  q([[0, 27], [94, 55], [106, 150], [102, 187], [0, 231]], "#a79b88");
  q([[480, 27], [398, 55], [385, 150], [387, 187], [480, 231]], "#a79b88");
  q([[0, 64], [94, 66], [99, 136], [0, 199]], "#b6a993");
  q([[480, 64], [398, 66], [389, 136], [480, 199]], "#b6a993");
  chamber(p);
  computerAccess(p);
  isolinearBay(p);
  workbaySoffit(p);
  q([[0, 72], [90, 73], [107, 91], [100, 165], [90, 205], [25, 239], [0, 225]], "#aaa08b");
  q([[480, 72], [398, 73], [390, 91], [387, 165], [390, 205], [455, 239], [480, 225]], "#aaa08b");
  q([[86, 73], [99, 87], [105, 150], [98, 181], [91, 204], [85, 207], [94, 161], [90, 95]], C2.cream);
  q([[399, 73], [389, 88], [383, 149], [388, 181], [389, 204], [397, 209], [394, 163], [396, 94]], C2.cream);
  wallBays(p);
  wallBays(p, true);
  sideConsole(p);
  sideConsole(p, true);
  sideConsole(p, false, true);
  sideConsole(p, true, true);
  q([[0, 0], [480, 0], [358, 58], [159, 58]], "#77786e");
  for (const points of [
    [[31, 5], [123, 5], [163, 24], [83, 24]],
    [[143, 5], [229, 5], [238, 24], [177, 24]],
    [[251, 5], [338, 5], [311, 24], [251, 24]],
    [[357, 5], [449, 5], [393, 24], [328, 24]],
    [[88, 33], [168, 33], [193, 48], [135, 48]],
    [[186, 33], [238, 33], [242, 48], [208, 48]],
    [[253, 33], [307, 33], [292, 48], [253, 48]],
    [[322, 33], [391, 33], [354, 48], [306, 48]]
  ]) q(points, "#e9ecdb");
  for (const [left, right, top, shoulder] of [[9, 471, 0, 42], [86, 403, 27, 60]]) {
    q([[left - 8, shoulder + 14], [left + 16, top], [right - 16, top], [right + 7, shoulder + 14], [right, shoulder + 17], [right - 22, top + 8], [left + 22, top + 8], [left - 1, shoulder + 17]], "#7e776a");
    trace(p, [[left - 6, shoulder + 12], [left + 18, top + 3], [right - 18, top + 3], [right + 4, shoulder + 12]], C2.cream, 3);
  }
  coreBulkheadRim(p);
  q([[0, 49], [7, 49], [8, 195], [18, 212], [9, 218], [0, 203]], C2.cream);
  q([[480, 49], [473, 49], [472, 195], [462, 212], [471, 218], [480, 203]], C2.cream);
  table(p);
}
function drawEngineeringForeground(ctx) {
  const p = painter(ctx);
  p.poly([[207, 260], [286, 260], [282, 265], [212, 265]], "#afa38b");
  p.line(208, 260, 285, 260, "#efe3c6");
}
function drawEngineeringEffects(ctx, time, options = {}) {
  const p = painter(ctx), t = seconds(time), pulse = unit(options.pulse), diagnostic = unit(options.diagnostic);
  ctx.save();
  ctx.beginPath();
  ctx.rect(175, 61, 171, 100);
  ctx.clip();
  drawHallCore(p, t, pulse);
  ctx.restore();
  rail(p);
  if (diagnostic > 0) {
    const y = 235 + Math.round(diagnostic * 13);
    p.line(210, y, 282, y, "#a4e5dc");
    p.rect(TABLE_READOUT.x + 1, TABLE_READOUT.y + 1, 3, 2, "#e9dac0");
  }
  if (options.night) for (const [x, y] of WORKBAY_SPOTS) p.oval(x, y, 2, 1, "#c4cabe");
}

// src/art/ship-effects.js
var BRIDGE_HOTSPOTS = Object.freeze([
  { id: "bridge-lift", label: "Turbolift", rect: [103, 84, 42, 64], action: "lift" },
  { id: "aft-lcars", label: "LCARS diagnostic sweep", rect: [153, 91, 174, 43], action: "diagnostic" }
]);
function drawBridgeEffects(ctx, t, { door = 0, diagnostic = 0 } = {}) {
  const p = painter(ctx);
  if (door > 0) {
    const x = 105, y = 88, w = 38, height = 55, gap = Math.round(door * 17);
    p.rect(x, y, w, height, "#161d27");
    p.rect(x + 7, y + 5, 24, 47, "#35333a");
    p.rect(x + 10, y + 7, 18, 2, "#e4d8bc");
    p.rect(x, y, 19 - gap, height, "#726b6c");
    p.rect(x + 19 + gap, y, 19 - gap, height, "#847977");
    p.rect(x, y + height, w, 3, "#bdaf99");
    p.rect(x + 16, y - 3, 7, 2, "#b3d1dd");
  }
  if (diagnostic > 0) {
    const x = 156 + Math.floor(t * 19) % 162;
    p.rect(x, 96, 2, 32, "#cbeaf0");
    p.rect(287, 100, 20, 2, "#bad7d6");
  }
}

// src/ship-layout.js
var leftExit2 = [[104, 230], [104, 155], [123, 155]];
var bridgeStations = [
  { slot: 0, route: [[240, 217], [146, 230], ...leftExit2], facing: "south" },
  // Seat anchors remain the imported-v1 anchors. Release sideways from the
  // bent-knee seated pose before walking; reverse that release only after arrival.
  // stand is NOT a walking waypoint from the seat (the own-chair/console overlap
  // at the seated anchor is intentional). The aisle stays behind each desk base.
  { slot: 1, stand: [137, 239], route: [[100, 239], [100, 230], ...leftExit2], facing: "south" },
  { slot: 2, stand: [343, 239], route: [[381, 239], [381, 294], [99, 294], [99, 230], ...leftExit2], facing: "south" },
  { slot: 3, route: [[196, 219], [146, 230], ...leftExit2], facing: "south" },
  { slot: 4, route: [[284, 219], [146, 230], ...leftExit2], facing: "south" },
  { slot: 8, route: [[67, 216], ...leftExit2], facing: "west" },
  { slot: 9, route: [[413, 220], [381, 230], [381, 294], [99, 294], [99, 230], ...leftExit2], facing: "east" }
].map(({ slot, stand, route, facing }, index) => ({ id: `bridge-${index}`, x: BRIDGE_ANCHORS[slot][0], y: BRIDGE_ANCHORS[slot][1], facing, seated: slot < 5, ...stand ? { stand } : {}, exitPath: route }));
var SHIP_ROOMS = Object.freeze({
  bridge: { id: "bridge", title: "Bridge", stations: bridgeStations, portal: { x: 123, y: 140, approach: [123, 155], rect: [103, 84, 42, 64] } },
  engineering: { id: "engineering", title: "Engineering", stations: ENGINEERING_STATIONS, portal: ENGINEERING_PORTAL }
});

// src/art/characters.js
var SKINS = [["#e8b58a", "#c58d6b", "#f5caa0"], ["#ba8768", "#8b5d49", "#d4a27d"], ["#91684f", "#654637", "#b38a68"], ["#e2c6a0", "#b8a180", "#f2d6af"]];
var HAIR = ["#574030", "#332e2e", "#815437", "#b58e54", "#655951", "#342e36"];
var SHIRTS = [["#d9d2ac", "#b2ae94"], ["#9dacb3", "#75898e"], ["#b6c0a3", "#879778"], ["#cfb0a0", "#b18c80"], ["#d8d0bb", "#aea791"], ["#a5a0b5", "#817d93"]];
var FURS = [["#d8a268", "#a97747", "#f7dfb2"], ["#666266", "#45434c", "#ddd6bf"], ["#e4d3b5", "#b5a38e", "#fff0d1"], ["#ad8270", "#765549", "#eedbc0"], ["#858f92", "#5a666f", "#c8d1c5"], ["#555451", "#383d40", "#f1e4c6"]];
var STATUS = { active: { color: "#90bb94", glyph: "\u203A" }, waiting: { color: "#ebc37f", glyph: "?" }, error: { color: "#e48e7a", glyph: "!" }, done: { color: "#afd0ba", glyph: "\u2713" }, idle: { color: "#c6bba3", glyph: "\xB7" }, unknown: { color: "#b8adcb", glyph: "\u2013" } };
function identity(id) {
  return Array.from(String(id)).reduce((n, c, i) => n + c.codePointAt(0) * (i + 1), 0);
}
function human(p, x, y, agent, theme, t, team, walk, teamIndex = 0, seated = false, facing = "south", pose = null) {
  const n = Number.isSafeInteger(agent.slot) && agent.slot >= 0 ? agent.slot : identity(agent.id), skin = SKINS[n % SKINS.length], hair = HAIR[n % HAIR.length];
  const isCrew = theme === "bridge";
  const shirt = isCrew ? [["#b9575d", "#833d49"], ["#c9a15c", "#9a7947"], ["#639797", "#487373"]][n % 3] : SHIRTS[n % 6];
  if (isCrew && facing !== "south") {
    crewProfile(p, x, y, agent, t, n, skin, hair, shirt, walk, seated, facing, pose);
    return;
  }
  const { rect: r, poly: q, line: l, oval: o } = p;
  const phase = t * 3.6 + n % 11, step = walk ? t === 0 && pose === "walk" ? 0 : Math.sin(phase * 2) : 0, bob = walk ? Math.round(Math.abs(step)) : 0;
  y -= bob;
  const active = agent.status === "active", wait = agent.status === "waiting", error = agent.status === "error", done = agent.status === "done";
  if (seated) {
    q([[x - 7, y - 14], [x - 1, y - 13], [x - 7, y - 7], [x - 12, y - 8]], "#363941");
    q([[x + 1, y - 13], [x + 7, y - 14], [x + 12, y - 8], [x + 7, y - 7]], "#292f39");
    r(x - 12, y - 9, 5, 7, "#363941");
    r(x + 7, y - 9, 5, 7, "#292f39");
    r(x - 12, y - 9, 2, 5, "#58606a");
    r(x + 7, y - 9, 2, 5, "#444c58");
    r(x - 14, y - 3, 8, 3, "#282a2e");
    r(x + 7, y - 3, 8, 3, "#25272a");
  } else {
    r(x - 7, y - 14, 6, 12, "#363941");
    r(x + 1, y - 14, 6, 12, "#292f39");
    r(x - 6, y - 11, 2, 8, "#58606a");
    r(x + 2, y - 11, 2, 8, "#444c58");
    r(x - 8, y - 3 + Math.round(step * 2), 8, 3, "#282a2e");
    r(x + 1, y - 3 - Math.round(step * 2), 8, 3, "#25272a");
    r(x - 7, y - 3 + Math.round(step * 2), 5, 1, "#66645d");
    r(x + 2, y - 3 - Math.round(step * 2), 5, 1, "#575850");
  }
  q([[x - 6, y - 25], [x + 6, y - 25], [x + 9, y - 21], [x + 8, y - 13], [x - 8, y - 13], [x - 9, y - 21]], "#39383a");
  r(x - 6, y - 24, 12, 11, shirt[0]);
  r(x - 6, y - 22, 3, 9, shirt[1]);
  r(x + 5, y - 22, 2, 9, shirt[1]);
  r(x - 4, y - 23, 2, 9, isCrew ? shirt[0] : "#e9e0c4");
  if (isCrew) {
    r(x - 7, y - 24, 14, 3, "#282d34");
    r(x - 7, y - 14, 14, 2, "#272e38");
    r(x + 3, y - 20, 2, 3, "#e3d29d");
    r(x + 4, y - 21, 1, 1, "#f4e4b4");
  } else {
    q([[x - 3, y - 24], [x, y - 21], [x + 3, y - 24]], "#f3ead6");
    r(x, y - 21, 2, 7, ["#8c5846", "#657579", "#786080"][n % 3]);
    r(x, y - 14, 2, 1, "#514c46");
    r(x + 4, y - 20, 2, 3, "#ece4c8");
  }
  p.c.save();
  const glance = t === 0 || pose ? 0 : wait ? Math.round(Math.sin(t * 0.65 + n)) : error ? Math.round(Math.sin(t * 0.85 + n)) : 0;
  p.c.translate(glance, 0);
  r(x - 2, y - 28, 5, 4, skin[1]);
  r(x - 6, y - 34, 12, 9, hair);
  r(x - 7, y - 31, 14, 5, skin[1]);
  r(x - 5, y - 33, 10, 9, skin[0]);
  r(x - 4, y - 32, 8, 5, skin[2]);
  r(x + 3, y - 30, 2, 5, skin[1]);
  r(x - 4, y - 25, 7, 1, skin[1]);
  r(x - 5, y - 36, 10, 4, hair);
  r(x - 7, y - 34, 3, 7, hair);
  r(x + 4, y - 34, 3, 5, hair);
  r(x - 3, y - 36, 5, 1, n % 3 === 0 ? "#aa8250" : "#78604b");
  if (n % 4 === 0) {
    r(x + 5, y - 28, 3, 4, hair);
    r(x - 7, y - 28, 3, 4, hair);
  }
  const blink = t > 0 && Math.floor(t * 2 + n) % 17 === 0;
  r(x - 3, y - 30, 2, blink ? 1 : 2, "#333139");
  r(x + 2, y - 30, 2, blink ? 1 : 2, "#333139");
  r(x, y - 28, 1, 2, skin[1]);
  r(x - 1, y - 25, 3, 1, "#966d5a");
  if (n % 5 === 0) {
    r(x - 5, y - 31, 5, 1, "#524e46");
    r(x + 1, y - 31, 5, 1, "#524e46");
    r(x - 5, y - 30, 1, 3, "#524e46");
    r(x + 5, y - 30, 1, 3, "#524e46");
    r(x - 1, y - 30, 2, 1, "#524e46");
  }
  if (error && !pose) {
    r(x - 4, y - 32, 3, 1, hair);
    r(x + 2, y - 33, 3, 1, hair);
  }
  p.c.restore();
  const tap = active ? Math.round(Math.sin(phase * 2) * 1.5) : 0;
  if (isCrew && pose) {
    const gesture = t === 0 ? 0 : Math.round(Math.sin(t * 1.8 + n));
    if (pose === "walk") {
      r(x - 10, y - 23, 4, 10 + Math.round(step * 2), shirt[1]);
      r(x + 7, y - 23, 4, 10 - Math.round(step * 2), shirt[0]);
      r(x - 10, y - 13 + Math.round(step * 2), 4, 3, skin[0]);
      r(x + 7, y - 13 - Math.round(step * 2), 4, 3, skin[2]);
    } else if (pose === "padd") {
      r(x - 10, y - 23, 4, 8, shirt[1]);
      r(x + 7, y - 23, 4, 8, shirt[0]);
      r(x - 5, y - 21, 10, 11, "#343e4b");
      r(x - 3, y - 19, 6, 6, "#8da9b2");
      r(x - 2, y - 18, 4, 1, "#d3c7a1");
      r(x - 2, y - 13, 3, 1, "#d7ad7c");
      r(x - 7, y - 16, 4, 3, skin[0]);
      r(x + 3, y - 17 + gesture, 4, 3, skin[2]);
    } else if (pose === "inspect") {
      r(x - 10, y - 23, 4, 11, shirt[1]);
      r(x - 10, y - 13, 4, 3, skin[0]);
      l(x + 7, y - 22, x + 12, y - 25 + gesture, shirt[0], 3);
      r(x + 11, y - 28 + gesture, 3, 4, skin[2]);
      r(x + 12, y - 31 + gesture, 3, 5, "#444d5a");
      r(x + 12, y - 30 + gesture, 2, 2, "#a6bac1");
    } else if (pose === "work") {
      r(x - 10, y - 23, 4, 8, shirt[1]);
      r(x + 7, y - 23, 4, 8, shirt[0]);
      l(x - 8, y - 16, x - 5, y - 13 + gesture, shirt[1], 3);
      l(x + 8, y - 16, x + 5, y - 13 - gesture, shirt[0], 3);
      r(x - 6, y - 13 + gesture, 4, 3, skin[0]);
      r(x + 3, y - 13 - gesture, 4, 3, skin[2]);
    } else {
      r(x - 10, y - 23, 4, 11, shirt[1]);
      r(x + 7, y - 23, 4, 11, shirt[0]);
      r(x - 10, y - 13, 4, 3, skin[0]);
      r(x + 7, y - 13, 4, 3, skin[2]);
    }
  } else if (team) {
    const cycle = (t * 0.68 + teamIndex * 0.27) % 1, angle = t === 0 ? -0.85 : cycle < 0.28 ? -0.9 - cycle * 2 : cycle < 0.48 ? -1.46 + (cycle - 0.28) * 11 : cycle < 0.7 ? 0.74 : 0.74 - (cycle - 0.7) * 5.3;
    const hx = x + 8, hy = y - 20, ex = hx + Math.cos(angle) * 22, ey = hy + Math.sin(angle) * 22;
    l(x + 6, y - 22, hx + 3, hy, shirt[0], 4);
    l(x - 7, y - 22, hx, hy + 2, shirt[1], 3);
    r(hx, hy, 5, 3, skin[0]);
    l(hx + 1, hy, ex, ey, "#745237", 4);
    l(hx + 1, hy - 1, ex, ey - 1, "#d8b97c", 2);
    r(hx, hy, 3, 3, skin[0]);
  } else if (error) {
    r(x - 10, y - 23, 4, 9, shirt[1]);
    r(x + 7, y - 25, 4, 8, shirt[0]);
    r(x + 6, y - 29, 4, 5, skin[0]);
    r(x - 10, y - 16, 4, 4, skin[0]);
  } else if (wait) {
    r(x - 10, y - 22, 4, 8, shirt[1]);
    r(x + 7, y - 22, 4, 8, shirt[0]);
    r(x - 8, y - 16, 16, 3, shirt[1]);
    r(x - 1, y - 16, 6, 2, skin[0]);
  } else if (active) {
    r(x - 10, y - 22, 4, 8, shirt[1]);
    r(x + 7, y - 22, 4, 8, shirt[0]);
    r(x - 10, y - 14, 21, 7, isCrew ? "#272f39" : "#c4b798");
    r(x - 8, y - 13, 17, 4, isCrew ? "#8b8e9b" : "#6b8177");
    r(x - 6, y - 12, 6, 1, isCrew ? "#d6af7c" : "#b6c7ac");
    r(x - 8, y - 17 + tap, 5, 4, skin[0]);
    r(x + 3, y - 16 - tap, 5, 4, skin[2]);
  } else {
    r(x - 10, y - 23, 4, 11, shirt[1]);
    r(x + 7, y - 23, 4, done ? 7 : 11, shirt[0]);
    r(x - 10, y - 13, 4, 4, skin[0]);
    r(x + 7, y - (done ? 19 : 13), 4, 4, skin[2]);
  }
}
function crewProfile(p, x, y, agent, t, n, skin, hair, shirt, walk, seated, facing, pose) {
  const { rect: r, line: l, poly: q } = p, north = facing === "north";
  const step = walk && t > 0 ? Math.sin(t * 7.2 + n % 11 * 2) : 0, swing = Math.round(step * 3);
  const gesture = t === 0 ? 0 : Math.round(Math.sin(t * 1.8 + n));
  const action = walk ? "walk" : pose || (agent.status === "active" ? "work" : agent.status);
  y -= walk ? Math.round(Math.abs(step)) : 0;
  p.c.save();
  if (facing === "west") {
    p.c.translate(x * 2, 0);
    p.c.scale(-1, 1);
  }
  if (north) {
    if (seated) {
      q([[x - 7, y - 14], [x - 1, y - 13], [x - 5, y - 6], [x - 10, y - 6]], "#363941");
      q([[x + 1, y - 13], [x + 7, y - 14], [x + 10, y - 6], [x + 5, y - 6]], "#292f39");
      r(x - 10, y - 7, 5, 5, "#363941");
      r(x + 5, y - 7, 5, 5, "#292f39");
      r(x - 11, y - 3, 6, 3, "#282a2e");
      r(x + 5, y - 3, 6, 3, "#25272a");
    } else {
      r(x - 7, y - 14, 6, 12, "#363941");
      r(x + 1, y - 14, 6, 12, "#292f39");
      r(x - 6, y - 11, 2, 7, "#58606a");
      r(x + 2, y - 11, 2, 7, "#444c58");
      r(x - 8, y - 3 + swing, 8, 3, "#282a2e");
      r(x + 1, y - 3 - swing, 8, 3, "#25272a");
    }
    q([[x - 6, y - 25], [x + 6, y - 25], [x + 9, y - 21], [x + 8, y - 13], [x - 8, y - 13], [x - 9, y - 21]], "#39383a");
    r(x - 6, y - 24, 12, 11, shirt[0]);
    r(x - 6, y - 22, 3, 9, shirt[1]);
    r(x + 5, y - 22, 2, 9, shirt[1]);
    r(x - 7, y - 25, 14, 4, "#282d34");
    r(x - 7, y - 14, 14, 2, "#272e38");
    r(x - 2, y - 28, 5, 4, skin[1]);
    r(x - 7, y - 31, 14, 5, skin[1]);
    r(x - 6, y - 35, 12, 10, hair);
    r(x - 4, y - 36, 8, 2, hair);
    r(x - 3, y - 35, 5, 1, n % 3 === 0 ? "#aa8250" : "#78604b");
    if (n % 4 === 0) {
      r(x - 7, y - 28, 3, 4, hair);
      r(x + 5, y - 28, 3, 4, hair);
    }
    if (action === "padd") {
      r(x + 8, y - 23, 5, 8, "#343e4b");
      r(x + 10, y - 22, 2, 4, "#8da9b2");
    }
    if (action === "inspect") {
      r(x + 12, y - 31 + gesture, 3, 6, "#444d5a");
      r(x + 13, y - 30 + gesture, 2, 2, "#a6bac1");
    }
    const reach = action === "work" || action === "padd", raised = action === "inspect" || action === "error";
    r(x - 10, y - 23, 4, reach ? 7 : 11 + (walk ? swing : 0), shirt[1]);
    r(x - 10, y - (reach ? 18 : 13) + (walk ? swing : 0), 4, 3, skin[0]);
    if (raised) {
      l(x + 7, y - 22, x + 12, y - 27 + gesture, shirt[0], 3);
      r(x + 11, y - 28 + gesture, 3, 4, skin[2]);
    } else {
      r(x + 7, y - 23, 4, reach ? 7 : 11 - (walk ? swing : 0), shirt[0]);
      r(x + 7, y - (reach ? 18 : 13) - (walk ? swing : 0) + (reach ? gesture : 0), 4, 3, skin[2]);
    }
  } else {
    if (seated) {
      r(x - 3, y - 14, 13, 5, "#292f39");
      r(x + 6, y - 10, 5, 8, "#292f39");
      r(x + 6, y - 3, 10, 3, "#25272a");
    } else {
      r(x - 3 - swing, y - 14, 5, 12, "#292f39");
      r(x - 3 - swing, y - 3, 8, 3, "#25272a");
    }
    r(x - 2, y - 24, 4, 11, shirt[1]);
    r(x, y - 14, 4, 3, skin[1]);
    if (seated) {
      r(x - 5, y - 14, 12, 5, "#363941");
      r(x + 3, y - 10, 5, 8, "#363941");
      r(x + 4, y - 9, 2, 6, "#58606a");
      r(x + 3, y - 3, 10, 3, "#282a2e");
    } else {
      r(x - 5 + swing, y - 14, 6, 12, "#363941");
      r(x - 4 + swing, y - 11, 2, 8, "#58606a");
      r(x - 5 + swing, y - 3, 9, 3, "#282a2e");
    }
    q([[x - 4, y - 25], [x + 3, y - 25], [x + 6, y - 21], [x + 4, y - 13], [x - 5, y - 13], [x - 6, y - 21]], "#39383a");
    r(x - 4, y - 24, 8, 11, shirt[0]);
    r(x - 4, y - 22, 3, 9, shirt[1]);
    r(x - 5, y - 25, 9, 4, "#282d34");
    r(x - 5, y - 14, 10, 2, "#272e38");
    r(x + 3, y - 20, 1, 3, "#e3d29d");
    r(x - 1, y - 28, 4, 4, skin[1]);
    r(x - 5, y - 34, 10, 10, hair);
    r(x, y - 33, 6, 9, skin[0]);
    r(x + 2, y - 32, 4, 5, skin[2]);
    r(x + 5, y - 29, 3, 2, skin[0]);
    r(x + 2, y - 25, 4, 1, skin[1]);
    r(x - 4, y - 36, 8, 4, hair);
    r(x - 5, y - 34, 4, 8, hair);
    r(x - 3, y - 35, 4, 1, n % 3 === 0 ? "#aa8250" : "#78604b");
    r(x - 1, y - 29, 2, 3, skin[1]);
    const blink = t > 0 && Math.floor(t * 2 + n) % 17 === 0;
    r(x + 3, y - 30, 2, blink ? 1 : 2, "#333139");
    if (n % 5 === 0) {
      r(x + 1, y - 31, 6, 1, "#524e46");
      r(x + 6, y - 30, 1, 3, "#524e46");
    }
    if (n % 4 === 0) r(x - 5, y - 28, 3, 4, hair);
    if (action === "padd") {
      r(x + 7, y - 23, 7, 10, "#343e4b");
      r(x + 9, y - 21, 3, 5, "#8da9b2");
      r(x + 9, y - 20, 2, 1, "#d3c7a1");
      l(x - 2, y - 22, x + 2, y - 16, shirt[0], 4);
      l(x + 2, y - 16, x + 8, y - 17, shirt[0], 3);
      r(x + 8, y - 18 + gesture, 4, 3, skin[0]);
    } else if (action === "inspect" || action === "error") {
      l(x - 2, y - 22, x + 5, y - 20, shirt[0], 4);
      l(x + 5, y - 20, x + 9, y - 27 + gesture, shirt[0], 3);
      r(x + 8, y - 29 + gesture, 4, 4, skin[0]);
      if (action === "inspect") {
        r(x + 10, y - 32 + gesture, 3, 5, "#444d5a");
        r(x + 11, y - 31 + gesture, 2, 2, "#a6bac1");
      }
    } else if (action === "work") {
      l(x - 2, y - 22, x + 3, y - 19, shirt[0], 4);
      l(x + 3, y - 19, x + 11, y - 21 + gesture, shirt[0], 3);
      r(x + 11, y - 22 + gesture, 4, 3, skin[0]);
    } else if (action === "waiting") {
      l(x - 2, y - 22, x + 1, y - 15, shirt[0], 4);
      r(x + 1, y - 16, 7, 3, shirt[1]);
      r(x + 5, y - 17, 3, 3, skin[0]);
    } else {
      l(x - 2, y - 22, x - 2 + swing, y - 13, shirt[0], 4);
      r(x - 2 + swing, y - 13, 4, 3, skin[0]);
    }
  }
  p.c.restore();
}
function kitten(p, x, y, agent, t, walk) {
  const n = Number.isSafeInteger(agent.slot) && agent.slot >= 0 ? agent.slot : identity(agent.id), fur = FURS[n % 6], { rect: r, poly: q, line: l, oval: o } = p;
  const active = agent.status === "active", idle = agent.status === "idle" || agent.status === "done", error = agent.status === "error", waiting = agent.status === "waiting";
  const tap = active ? Math.round(Math.sin(t * 7 + n) * 2) : 0, step = walk ? Math.round(Math.sin(t * 7 + n) * 2) : 0;
  const tailLift = idle ? 1 : Math.round(Math.sin(t * 0.8 + n) * 2);
  q([[x + 13, y - 10], [x + 23, y - 12], [x + 26, y - 20 - tailLift], [x + 25, y - 25 - tailLift], [x + 22, y - 26 - tailLift], [x + 20, y - 23 - tailLift], [x + 22, y - 20 - tailLift], [x + 20, y - 15], [x + 12, y - 14]], fur[1]);
  l(x + 16, y - 13, x + 23, y - 17, fur[0], 3);
  r(x + 22, y - 24 - tailLift, 3, 5, fur[0]);
  o(x + 5, y - 11, 13, idle ? 7 : 9, fur[1]);
  o(x + 4, y - 13, 12, idle ? 6 : 8, fur[0]);
  o(x + 9, y - 10, 6, 6, fur[0]);
  r(x + 9, y - 5 + step, 7, 4, fur[2]);
  r(x - 1, y - 6 - step, 5, 4, fur[1]);
  r(x - 12, y - 10, 5, 8, fur[1]);
  r(x - 13, y - 4, 7, 3, fur[2]);
  r(x - 5, y - 10, 5, 8, fur[0]);
  r(x - 6, y - 4 - tap, 8, 3, fur[2]);
  if (n % 3 === 0) {
    r(x + 4, y - 19, 3, 7, fur[1]);
    r(x + 11, y - 17, 3, 6, fur[1]);
    r(x + 21, y - 16, 3, 3, fur[1]);
  }
  if (n % 3 === 1) {
    o(x + 7, y - 14, 6, 5, fur[1]);
    r(x - 8, y - 14, 6, 8, fur[2]);
  }
  const hx = x - 9, hy = y - (idle ? 17 : 20);
  q([[hx - 10, hy + 3], [hx - 10, hy - 7], [hx - 8, hy - 12], [hx - 2, hy - 8], [hx + 3, hy - 8], [hx + 8, hy - 12], [hx + 10, hy - 5], [hx + 10, hy + 3], [hx + 6, hy + 7], [hx - 5, hy + 7]], fur[1]);
  q([[hx - 9, hy + 1], [hx - 8, hy - 8], [hx - 3, hy - 5], [hx + 4, hy - 5], [hx + 8, hy - 8], [hx + 9, hy + 2], [hx + 5, hy + 6], [hx - 4, hy + 6]], fur[0]);
  q([[hx - 7, hy - 8], [hx - 4, hy - 5], [hx - 7, hy - 3]], "#ca9390");
  q([[hx + 7, hy - 8], [hx + 4, hy - 5], [hx + 7, hy - 3]], "#ca9390");
  if (n % 3 === 0) {
    r(hx - 3, hy - 6, 2, 4, fur[1]);
    r(hx + 1, hy - 6, 2, 3, fur[1]);
    r(hx - 9, hy, 3, 2, fur[1]);
    r(hx + 7, hy, 3, 2, fur[1]);
  }
  if (n % 3 === 2) {
    r(hx - 8, hy - 4, 6, 5, fur[2]);
    r(hx + 2, hy - 4, 6, 5, fur[2]);
  }
  const blink = idle || t > 0 && Math.floor(t * 2 + n) % 19 === 0;
  r(hx - 6, hy - 1, 4, blink ? 1 : 3, "#313b36");
  r(hx + 3, hy - 1, 4, blink ? 1 : 3, "#313b36");
  if (!blink) {
    r(hx - 5, hy - 1, 1, 2, "#bdd3a2");
    r(hx + 4, hy - 1, 1, 2, "#bdd3a2");
  }
  o(hx, hy + 4, 5, 2, fur[2]);
  r(hx, hy + 2, 2, 1, "#b66e6f");
  r(hx, hy + 3, 1, 2, "#835f56");
  r(hx - 2, hy + 5, 2, 1, "#835f56");
  r(hx + 1, hy + 5, 2, 1, "#835f56");
  l(hx - 13, hy + 2, hx - 8, hy + 3, "#e9d9bb");
  l(hx + 8, hy + 3, hx + 13, hy + 2, "#e9d9bb");
  if (active) {
    keyboard(p, x - 19, y + 1, 22);
    r(x - 10, y - 1 + tap, 7, 3, fur[2]);
  }
  if (waiting) {
    r(hx - 7, hy - 7, 3, 1, fur[1]);
    r(x - 5, y - 9, 4, 7, fur[2]);
  }
  if (error) {
    r(hx - 7, hy - 3, 4, 1, fur[1]);
    r(hx + 3, hy - 4, 4, 1, fur[1]);
    r(x - 14, y - 13, 4, 4, fur[2]);
  }
}
function drawAgent(ctx, item, theme, time, selected) {
  const p = painter(ctx), { x, y, agent, team, walking } = item;
  p.oval(x + 2, y + 1, theme === "cafe" ? 22 : 13, 4, theme === "bridge" ? "#4d394b50" : "#51483545");
  if (selected) {
    p.oval(x, y + 1, theme === "cafe" ? 25 : 17, 6, "#fff1ce");
    p.oval(x, y + 1, theme === "cafe" ? 22 : 14, 4, theme === "bridge" ? "#a88b90" : "#ab9f7d");
  }
  if (theme === "cafe") kitten(p, x, y, agent, time, walking);
  else {
    const crew = theme === "bridge", directed = crew && ["north", "south", "east", "west"].includes(item.facing), facing = directed ? item.facing : "south";
    const walk = walking || crew && item.pose === "walk";
    const pose = crew ? walk ? "walk" : ["work", "padd", "inspect"].includes(item.pose) ? item.pose : item.ambient === true ? "rest" : null : null;
    const seated = crew && !walk && (typeof item.seated === "boolean" ? item.seated : item.index < 5);
    const legacyTeam = team && !directed && !pose;
    ctx.save();
    if (legacyTeam && x > 391) {
      ctx.translate(x * 2, 0);
      ctx.scale(-1, 1);
    }
    human(p, x, y, agent, theme, time, legacyTeam && item.atStation, walk, item.teamIndex, seated, facing, pose);
    ctx.restore();
  }
}
function drawBadge(ctx, item, theme, selected) {
  const p = painter(ctx), status = item.agent.attention || item.agent.status, s = STATUS[status] || STATUS.unknown, x = item.x, y = item.y;
  if (item.hideBadge !== true) {
    p.rect(x + 12, y - 40, 10, 10, "#393c38");
    p.rect(x + 13, y - 39, 8, 8, s.color);
    if (status === "active") {
      p.line(x + 15, y - 37, x + 18, y - 35, "#35473d");
      p.line(x + 18, y - 35, x + 15, y - 33, "#35473d");
    } else if (status === "done") {
      p.line(x + 14, y - 35, x + 16, y - 33, "#35473d");
      p.line(x + 16, y - 33, x + 19, y - 37, "#35473d");
    } else if (status === "error") {
      p.rect(x + 16, y - 38, 2, 4, "#5d3730");
      p.rect(x + 16, y - 33, 2, 1, "#5d3730");
    } else if (status === "waiting") {
      p.rect(x + 15, y - 38, 4, 1, "#634e30");
      p.rect(x + 18, y - 37, 1, 2, "#634e30");
      p.rect(x + 16, y - 35, 3, 1, "#634e30");
      p.rect(x + 16, y - 33, 1, 1, "#634e30");
    } else p.rect(x + 15, y - 35, 4, 1, "#544e50");
  }
  if (selected) {
    const name = String(item.agent.name || item.agent.id).slice(0, 21), width = Math.max(38, name.length * 3.8 + 12), left = Math.max(6, Math.min(474 - width, x - width / 2));
    p.rect(left, y + 8, width, 13, "#313a38");
    p.rect(left, y + 8, width, 1, "#f3dfb5");
    p.text(name, left + 6, y + 11, "#fff0cf", 7);
  }
}

// src/world.js
var THEMES = Object.freeze([
  Object.freeze({ id: "office", title: "Office Space", subtitle: "Cubicles, coffee & a printer out back", accent: "#c2a77b", description: "A beige cubicle diorama with a sun-warmed service yard. Bats appear only for active, parent-linked teammates." }),
  Object.freeze({ id: "cafe", title: "Kitten Caf\xE9", subtitle: "A little sunshine. A lot of paw work.", accent: "#c8a56f", description: "Quadruped kittens, oak floors, coffee plants and a pastry counter in a sunlit neighborhood caf\xE9." }),
  Object.freeze({ id: "bridge", title: "The Next Generation", subtitle: "Bridge & Main Engineering", accent: "#bda2ab", description: "An Enterprise-D\u2013inspired ship: warm bridge, luminous warp core, purposeful crew and playable LCARS." })
]);
var CAPACITY = 12;
var WORLD_SIZE = Object.freeze({ width: 960, height: 600 });
function teamGroups(agents) {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const groups = /* @__PURE__ */ new Map();
  for (const a of agents) {
    if (!a.parentId || a.parentId === a.id) continue;
    const members = groups.get(a.parentId) || /* @__PURE__ */ new Set();
    if (a.status === "active") members.add(a.id);
    if (byId.get(a.parentId)?.status === "active") members.add(a.parentId);
    groups.set(a.parentId, members);
  }
  return [...groups].filter(([, ids]) => ids.size >= 2).map(([parentId, ids]) => ({ parentId, ids: agents.filter((a) => ids.has(a.id)).map((a) => a.id) }));
}
function createWorld(canvas, { onSelect = () => {
}, onMetrics = () => {
}, ship = null } = {}) {
  if (!canvas?.getContext) throw new TypeError("createWorld requires a canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas2D is unavailable");
  const doc = canvas.ownerDocument || globalThis.document;
  const host2 = doc?.defaultView || globalThis;
  const request = host2.requestAnimationFrame?.bind(host2), cancel = host2.cancelAnimationFrame?.bind(host2);
  const makeSurface = () => {
    let out;
    if (doc?.createElement) out = doc.createElement("canvas");
    else if (typeof OffscreenCanvas !== "undefined") out = new OffscreenCanvas(W, H);
    else throw new Error("An offscreen Canvas2D surface is required");
    out.width = W;
    out.height = H;
    return out;
  };
  const scene = makeSurface(), sc = scene.getContext("2d");
  const backgrounds = /* @__PURE__ */ new Map(), positions = /* @__PURE__ */ new Map();
  let state = { theme: "office", realm: null, agents: [], selectedId: null, reducedMotion: false, paused: false, shipMode: "live" };
  const clockConsumer = /* @__PURE__ */ Symbol("ship renderer");
  const isShip = () => Boolean(ship && state.theme === "bridge" && !state.realm);
  const shipRoom = () => ship?.getSnapshot().room || "bridge";
  const characterStyle = () => state.realm?.characterStyle || state.theme;
  let width = 960, height = 600, dpr = 1, scale = 2, offsetX = 0, offsetY = 0, visible = true, destroyed = false;
  let frameId = null, lastFrame = -Infinity, lastTick = null, time = 0, regions = [], items = [], teamwork = null, backgroundBuilds = 0;
  let drawCount = 0, frameMs = 0, fps = 0, measureStart = 0, measureFrames = 0, lastNotify = -Infinity;
  const now = () => host2.performance?.now?.() ?? Date.now();
  const isVisible = () => visible && !doc?.hidden;
  const animate = () => !destroyed && isVisible() && !state.paused && !state.reducedMotion;
  const report = () => {
    const population = isShip() ? ship.getSnapshot().populations[state.shipMode] : null, overflow = population ? population.counts.offstage : Math.max(0, state.agents.length - items.length);
    return { theme: state.theme, room: isShip() ? shipRoom() : null, total: state.agents.length, visible: items.length, overflow, capacity: isShip() ? SHIP_ROOMS[shipRoom()].stations.length : CAPACITY, visibleCount: items.length, totalCount: state.agents.length, overflowCount: overflow, roomCounts: population?.counts || null, fps, frameMs, renderMs: frameMs, frames: drawCount, backgroundBuilds, paused: state.paused, reducedMotion: state.reducedMotion, hidden: !isVisible(), teamwork: teamwork ? { ...teamwork, participants: [...teamwork.participants] } : null };
  };
  const notify = () => {
    if (!destroyed) onMetrics(report());
  };
  function background() {
    if (state.realm) return state.realm.background;
    const room = isShip() ? shipRoom() : null, key2 = room ? `ship:${room}` : state.theme;
    if (!backgrounds.has(key2)) {
      const surface = makeSurface(), context = surface.getContext("2d");
      if (room === "engineering") drawEngineering(context);
      else drawBackground(context, state.theme);
      backgrounds.set(key2, surface);
      backgroundBuilds++;
    }
    return backgrounds.get(key2);
  }
  function bridgeLayer(name, draw) {
    const night = isShip() && ship.getSnapshot().night, key2 = `bridge:${name}:${night}`;
    if (!backgrounds.has(key2)) {
      const surface = makeSurface(), context = surface.getContext("2d");
      draw(context);
      if (night) {
        context.globalCompositeOperation = "source-atop";
        context.fillStyle = "#0a112c88";
        context.fillRect(0, 0, W, H);
        context.globalCompositeOperation = "source-over";
      }
      backgrounds.set(key2, surface);
    }
    sc.drawImage(backgrounds.get(key2), 0, 0);
  }
  function setItems(themeChanged = false) {
    if (isShip()) {
      items = ship.getFrame(state.shipMode).items;
      teamwork = null;
      return;
    }
    const selected = state.agents.find((a) => a.id === state.selectedId);
    let visibleAgents = state.agents.slice(0, CAPACITY);
    if (selected && !visibleAgents.some((a) => a.id === selected.id)) visibleAgents[CAPACITY - 1] = selected;
    const group = state.theme === "office" ? teamGroups(state.agents).find((g) => g.ids.filter((id) => visibleAgents.some((a) => a.id === id)).length >= 2) : null;
    const teamIds = group ? group.ids.filter((id) => visibleAgents.some((a) => a.id === id)).slice(0, YARD.length) : [];
    teamwork = group ? { parentId: group.parentId, participants: teamIds, additionalMembers: group.ids.length - teamIds.length } : null;
    const used = /* @__PURE__ */ new Set();
    items = visibleAgents.map((agent, i) => {
      const requested = Number.isInteger(agent.slot) && agent.slot >= 0 && agent.slot < CAPACITY ? agent.slot : i;
      const index = !used.has(requested) ? requested : Array.from({ length: CAPACITY }, (_, j) => j).find((j) => !used.has(j));
      used.add(index);
      const teamIndex = teamIds.indexOf(agent.id), team = teamIndex >= 0;
      const target = team ? YARD[teamIndex] : (state.realm?.anchors || ANCHORS[state.theme])[index];
      let pos = positions.get(agent.id);
      if (!pos || themeChanged) {
        pos = { x: target[0], y: target[1], tx: target[0], ty: target[1], route: [] };
        positions.set(agent.id, pos);
      }
      if (pos.tx !== target[0] || pos.ty !== target[1]) {
        if (state.theme === "office" && pos.x > 330 !== target[0] > 330) {
          pos.route = target[0] > 330 ? [[pos.x, Math.min(276, pos.y + 13)], [305, Math.min(276, pos.y + 13)], [305, 127], [338, 127], [target[0], target[1]]] : [[338, 127], [305, 127], [305, Math.min(276, target[1] + 13)], [target[0], Math.min(276, target[1] + 13)], [target[0], target[1]]];
        } else pos.route = [[target[0], target[1]]];
        pos.tx = target[0];
        pos.ty = target[1];
      }
      if (state.reducedMotion) {
        pos.x = pos.tx;
        pos.y = pos.ty;
        pos.route = [];
      }
      return { agent, index, team, teamIndex, position: pos, x: pos.x, y: pos.y, walking: false, atStation: pos.route.length === 0 };
    });
    const alive = new Set(state.agents.map((a) => a.id));
    for (const id of positions.keys()) if (!alive.has(id)) positions.delete(id);
  }
  function move(dt) {
    for (const item of items) {
      const p = item.position;
      item.walking = false;
      if (animate() && p.route.length) {
        const [x, y] = p.route[0], dx = x - p.x, dy = y - p.y, distance = Math.hypot(dx, dy), travel = dt * 42;
        if (distance <= travel || distance < 0.5) {
          p.x = x;
          p.y = y;
          p.route.shift();
        } else {
          p.x += dx / distance * travel;
          p.y += dy / distance * travel;
          item.walking = true;
        }
      }
      item.x = Math.round(p.x);
      item.y = Math.round(p.y);
      item.atStation = p.route.length === 0;
      item.walking = !item.atStation;
    }
  }
  function render(dt = 0) {
    if (destroyed || !isVisible()) return;
    const start = now();
    if (isShip()) setItems();
    else move(dt);
    sc.imageSmoothingEnabled = false;
    sc.clearRect(0, 0, W, H);
    sc.drawImage(background(), 0, 0);
    const shipFrame = isShip() ? ship.getFrame(state.shipMode) : null, bridge = state.theme === "bridge" && (!shipFrame || shipFrame.room === "bridge");
    if (shipFrame) {
      if (shipFrame.effects.night) {
        sc.fillStyle = "#0a112c88";
        sc.fillRect(0, 0, W, H);
      }
      const effectPainter = { bridge: drawBridgeEffects, engineering: drawEngineeringEffects }[shipFrame.room];
      effectPainter(sc, state.reducedMotion ? 0 : shipFrame.time, shipFrame.effects);
    }
    const sorted = [...items].sort((a, b) => a.y - b.y || a.index - b.index);
    const t = state.reducedMotion ? 0 : time;
    let railPainted = false, helmPainted = false, layerIndex = 0, shipForegroundPainted = false;
    const shipForeground = shipFrame?.room === "engineering" ? { name: "engineering-foreground", draw: drawEngineeringForeground, afterY: 280 } : null;
    const style = characterStyle(), layers = state.realm?.layers || [];
    for (const item of sorted) {
      if (shipForeground && !shipForegroundPainted && item.y >= shipForeground.afterY) {
        bridgeLayer(shipForeground.name, shipForeground.draw);
        shipForegroundPainted = true;
      }
      while (layerIndex < layers.length && item.y >= layers[layerIndex].afterY) sc.drawImage(layers[layerIndex++].image, 0, 0);
      if (bridge && item.y >= 160 && !railPainted) {
        bridgeLayer("rail", drawBridgeRail);
        railPainted = true;
      }
      if (bridge && shipFrame && item.y >= 286 && !helmPainted) {
        bridgeLayer("helm", drawBridgeHelm);
        helmPainted = true;
      }
      drawAgent(sc, item, style, t, item.agent.id === state.selectedId);
    }
    while (layerIndex < layers.length) sc.drawImage(layers[layerIndex++].image, 0, 0);
    if (bridge) {
      if (!railPainted) bridgeLayer("rail", drawBridgeRail);
      if (!helmPainted) bridgeLayer("helm", drawBridgeHelm);
    }
    if (shipForeground && !shipForegroundPainted) bridgeLayer(shipForeground.name, shipForeground.draw);
    for (const item of sorted) drawBadge(sc, item, style, item.agent.id === state.selectedId);
    if (teamwork) {
      const p = painter(sc);
      p.rect(350, 93, 108, 13, "#65553ddd");
      p.text("LINKED TEAM WORK", 356, 97, "#ffebc0", 6);
    }
    if (!shipFrame && state.agents.length > CAPACITY) {
      const p = painter(sc), s = `${items.length} IN SCENE \xB7 ${state.agents.length - items.length} IN LIST`;
      p.rect(151, 286, 181, 12, "#303c38");
      p.text(s, 160, 289, "#eee4c9", 6);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(scene, offsetX, offsetY, W * scale, H * scale);
    regions = sorted.map((item) => ({ id: item.agent.id, x: offsetX + (item.x - (style === "cafe" ? 25 : 18)) * scale, y: offsetY + (item.y - 42) * scale, width: (style === "cafe" ? 53 : 40) * scale, height: 49 * scale, worldX: item.x * 2, worldY: item.y * 2, team: item.team }));
    drawCount++;
    frameMs = now() - start;
    measureFrames++;
    if (!measureStart) measureStart = start;
    if (start - measureStart >= 1e3) {
      fps = Math.round(measureFrames * 1e3 / (start - measureStart));
      measureStart = start;
      measureFrames = 0;
    }
  }
  function tick(stamp) {
    frameId = null;
    if (!animate()) return;
    if (lastTick === null) lastTick = stamp;
    if (stamp - lastFrame >= 1e3 / 30 - 1) {
      const dt = Math.min(0.08, Math.max(0, (stamp - lastTick) / 1e3));
      time += dt;
      lastTick = stamp;
      lastFrame = stamp;
      if (isShip()) ship.tick(stamp, state.shipMode, { consumer: clockConsumer });
      render(dt);
      if (stamp - lastNotify > 1e3) {
        lastNotify = stamp;
        notify();
      }
    }
    if (animate() && request) frameId = request(tick);
  }
  function sync() {
    if (!animate()) {
      if (frameId !== null && cancel) cancel(frameId);
      frameId = null;
      lastTick = null;
      fps = 0;
    } else if (frameId === null && request) {
      lastTick = null;
      lastFrame = -Infinity;
      frameId = request(tick);
    }
  }
  function update(patch = {}) {
    if (destroyed) return;
    const before = state.theme, beforeRealm = state.realm, beforeSelection = state.selectedId, beforeMode = state.shipMode;
    const id = Object.hasOwn(patch, "theme") ? typeof patch.theme === "object" ? patch.theme?.id : patch.theme : state.theme;
    const realm = Object.hasOwn(patch, "realm") ? patch.realm : state.realm;
    if (THEMES.some((t) => t.id === id)) {
      state.theme = id;
      state.realm = null;
    } else if (realm && realm.id === id && /^import:[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id) && THEMES.some((t) => t.id === realm.characterStyle) && realm.background && Array.isArray(realm.anchors) && realm.anchors.length === CAPACITY) {
      state.theme = id;
      state.realm = realm;
    } else if (Object.hasOwn(patch, "realm") && patch.realm === null && state.realm) {
      state.theme = "office";
      state.realm = null;
    }
    if (Object.hasOwn(patch, "agents")) {
      const seen = /* @__PURE__ */ new Set();
      state.agents = (Array.isArray(patch.agents) ? patch.agents : []).filter((a) => a && a.id !== void 0 && a.id !== null && !seen.has(a.id) && seen.add(a.id)).map((a) => ({ ...a }));
    }
    for (const key2 of ["selectedId", "reducedMotion", "paused"]) if (Object.hasOwn(patch, key2)) state[key2] = key2 === "selectedId" ? patch[key2] : Boolean(patch[key2]);
    if (Object.hasOwn(patch, "shipMode")) state.shipMode = patch.shipMode === "demo" ? "demo" : "live";
    if (Object.hasOwn(patch, "visible")) visible = Boolean(patch.visible);
    if (before !== state.theme || beforeMode !== state.shipMode) ship?.releaseClock(clockConsumer);
    if (isShip()) {
      if (Object.hasOwn(patch, "agents")) ship.sync(patch.agents, state.shipMode);
      ship.tick(now(), state.shipMode, { paused: state.paused, reducedMotion: state.reducedMotion, hidden: !isVisible(), consumer: clockConsumer });
    }
    setItems(before !== state.theme || beforeRealm !== state.realm);
    if (!request || !animate() || frameId === null || before !== state.theme || beforeRealm !== state.realm || beforeSelection !== state.selectedId) render();
    sync();
    notify();
  }
  function resize(w, h4, pixelRatio = host2.devicePixelRatio || 1) {
    if (destroyed) return;
    width = Math.max(1, Number(w) || 960);
    height = Math.max(1, Number(h4) || 600);
    dpr = Math.max(1, Math.min(4, Number(pixelRatio) || 1));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    scale = Math.min(width / W, height / H);
    offsetX = (width - W * scale) / 2;
    offsetY = (height - H * scale) / 2;
    render();
  }
  function hitTest(x, y) {
    if (destroyed || !isVisible()) return null;
    for (let i = regions.length - 1; i >= 0; i--) {
      const r = regions[i];
      if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) return r.id;
    }
    return null;
  }
  function getSceneRegions() {
    if (!isShip()) return [];
    const hotspots = { bridge: BRIDGE_HOTSPOTS, engineering: ENGINEERING_HOTSPOTS }[shipRoom()];
    return hotspots.map((h4) => {
      const [x, y, w, hgt] = h4.rect || [h4.x, h4.y, h4.width, h4.height];
      return { ...h4, x: offsetX + x * scale, y: offsetY + y * scale, width: w * scale, height: hgt * scale };
    });
  }
  function sceneHit(x, y) {
    return getSceneRegions().find((r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height);
  }
  function select(event) {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x = (event.clientX - r.left) * width / r.width, y = (event.clientY - r.top) * height / r.height, id = hitTest(x, y);
    if (id !== null) onSelect(id);
    else {
      const hotspot = sceneHit(x, y);
      if (hotspot) ship.trigger(hotspot.action);
    }
  }
  function hover(event) {
    if (!canvas.style) return;
    const r = canvas.getBoundingClientRect(), x = (event.clientX - r.left) * width / (r.width || 1), y = (event.clientY - r.top) * height / (r.height || 1);
    canvas.style.cursor = hitTest(x, y) !== null || sceneHit(x, y) ? "pointer" : "default";
  }
  function visibilityChanged() {
    if (isShip()) ship.tick(now(), state.shipMode, { paused: state.paused, reducedMotion: state.reducedMotion, hidden: !isVisible(), consumer: clockConsumer });
    if (isVisible()) render();
    sync();
    notify();
  }
  function setVisible(value) {
    if (destroyed) return;
    visible = Boolean(value);
    visibilityChanged();
  }
  const stopShip = ship?.subscribe(() => {
    if (isShip()) {
      if (state.reducedMotion && !state.paused && isVisible()) ship.tick(now(), state.shipMode, { reducedMotion: true, consumer: clockConsumer });
      setItems();
      if (!animate()) render();
      notify();
    }
  });
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stopShip?.();
    ship?.releaseClock(clockConsumer);
    if (frameId !== null && cancel) cancel(frameId);
    frameId = null;
    canvas.removeEventListener("pointerdown", select);
    canvas.removeEventListener("pointermove", hover);
    doc?.removeEventListener?.("visibilitychange", visibilityChanged);
    backgrounds.clear();
    positions.clear();
    regions = [];
    items = [];
    state.realm = null;
    scene.width = 1;
    scene.height = 1;
  }
  canvas.addEventListener("pointerdown", select);
  canvas.addEventListener("pointermove", hover);
  doc?.addEventListener?.("visibilitychange", visibilityChanged);
  resize(canvas.clientWidth || 960, canvas.clientHeight || 600, host2.devicePixelRatio || 1);
  sync();
  return { update, resize, setVisible, destroy, hitTest, getMetrics: report, getAgentRegions: () => regions.map((r) => ({ ...r })), getSceneRegions, render: () => render(), get capacity() {
    return isShip() ? SHIP_ROOMS[shipRoom()].stations.length : CAPACITY;
  } };
}

// src/realm-packages.js
var REALM_LIMITS = Object.freeze({ maxFileBytes: 1024 * 1024, maxImageBytes: 512 * 1024, maxLayers: 4, maxPackages: 8, maxStorageBytes: 4 * 1024 * 1024, maxPending: 8 });
var REALM_STORAGE_KEY = "realm-packages-v1";
var encoder = new TextEncoder();
var bytes = (text3) => encoder.encode(text3).byteLength;
var fail = (message) => {
  throw new TypeError(`Invalid realm package: ${message}`);
};
var builtinIds = /* @__PURE__ */ new Set(["office", "cafe", "bridge"]);
var dangerousKeys = /* @__PURE__ */ new Set(["__proto__", "prototype", "constructor"]);
var isPlain = (value) => value !== null && typeof value === "object" && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
function copyPlain(value, depth = 0, budget = { nodes: 0 }) {
  if (++budget.nodes > 512 || depth > 6) fail("structure limit exceeded");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("numbers must be finite");
    return value;
  }
  if (typeof value === "string") {
    if (value.length > REALM_LIMITS.maxFileBytes) fail("string limit exceeded");
    return value;
  }
  if (!Array.isArray(value) && !isPlain(value)) fail("only plain JSON values are accepted");
  const out = Array.isArray(value) ? [] : {};
  if (Array.isArray(value) && value.length > 128) fail("array limit exceeded");
  for (const key2 of Reflect.ownKeys(value)) {
    if (key2 === "length" && Array.isArray(value)) continue;
    if (typeof key2 !== "string" || dangerousKeys.has(key2)) fail("prototype keys are forbidden");
    const descriptor = Object.getOwnPropertyDescriptor(value, key2);
    if (!Object.hasOwn(descriptor, "value") || !descriptor.enumerable) fail("plain data only; accessors are forbidden");
    if (Array.isArray(value) && (!/^(0|[1-9][0-9]*)$/.test(key2) || Number(key2) >= value.length)) fail("invalid array property");
    out[key2] = copyPlain(descriptor.value, depth + 1, budget);
  }
  if (Array.isArray(value) && Object.keys(out).length !== value.length) fail("sparse arrays are forbidden");
  return out;
}
function fields(value, required, optional = []) {
  if (!isPlain(value)) fail("expected an object");
  for (const key2 of Object.keys(value)) if (!required.includes(key2) && !optional.includes(key2)) fail(`unknown field: ${key2}`);
  for (const key2 of required) if (!Object.hasOwn(value, key2)) fail(`missing field: ${key2}`);
}
function text2(value, max, name) {
  if (typeof value !== "string" || !value.trim() || value.length > max || value !== value.trim() || !/^[\p{L}\p{N}\p{M} .,;:!?'"’“”()&+·–—/\-]+$/u.test(value) || /(?:[a-z][a-z0-9+.-]*:\/\/|javascript\s*:|data\s*:|vbscript\s*:|\b(?:eval|function)\s*\(|\burl\s*\()/i.test(value)) fail(`${name} must be bounded plain text without code or URLs`);
}
function finite(value, min, max, name, inclusive = true) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || (inclusive ? value > max : value >= max)) fail(`invalid ${name}`);
}
function crc32(data, start, end) {
  let crc = 4294967295;
  for (let i = start; i < end; i++) {
    crc ^= data[i];
    for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 3988292384 : 0);
  }
  return (crc ^ 4294967295) >>> 0;
}
function png(value) {
  const prefix = "data:image/png;base64,";
  if (typeof value !== "string" || !value.startsWith(prefix)) fail("images must be embedded PNG data URLs");
  const base64 = value.slice(prefix.length);
  if (base64.length > Math.ceil(REALM_LIMITS.maxImageBytes / 3) * 4 || base64.length % 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) fail("invalid or oversized PNG base64");
  let binary;
  try {
    binary = atob(base64);
  } catch {
    fail("invalid PNG base64");
  }
  if (btoa(binary) !== base64 || binary.length > REALM_LIMITS.maxImageBytes) fail("noncanonical or oversized PNG");
  const data = Uint8Array.from(binary, (c) => c.charCodeAt(0)), view = new DataView(data.buffer);
  if (data.length < 57 || ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => data[i] === v)) fail("invalid PNG signature");
  let offset = 8, header = false, pixels = false, ended = false, palette = false, idatEnded = false;
  const metadata = /* @__PURE__ */ new Set();
  while (offset < data.length) {
    if (offset + 12 > data.length) fail("truncated PNG chunk");
    const length = view.getUint32(offset), end = offset + 12 + length;
    if (end > data.length) fail("truncated PNG data");
    const type = String.fromCharCode(...data.subarray(offset + 4, offset + 8));
    if (crc32(data, offset + 4, end - 4) !== view.getUint32(end - 4)) fail("corrupt PNG chunk");
    if (!header && type !== "IHDR") fail("PNG header must be first");
    if (pixels && type !== "IDAT") idatEnded = true;
    switch (type) {
      case "IHDR":
        if (header || length !== 13 || view.getUint32(offset + 8) !== 480 || view.getUint32(offset + 12) !== 300) fail("PNG must be 480\xD7300");
        if (data[offset + 16] !== 8 || ![2, 6].includes(data[offset + 17]) || data[offset + 18] || data[offset + 19] || data[offset + 20]) fail("PNG must be noninterlaced 8-bit RGB or RGBA");
        header = true;
        break;
      case "IDAT":
        if (idatEnded) fail("PNG IDAT chunks must be contiguous");
        pixels = true;
        break;
      case "IEND":
        if (length !== 0 || !pixels || end !== data.length) fail("invalid PNG end or trailing content");
        ended = true;
        break;
      case "PLTE":
        if (palette || pixels || length < 3 || length > 768 || length % 3) fail("invalid PNG palette");
        palette = true;
        break;
      case "sRGB":
      case "gAMA":
      case "cHRM":
      case "pHYs":
        if (metadata.has(type) || pixels || length !== { sRGB: 1, gAMA: 4, cHRM: 32, pHYs: 9 }[type]) fail("invalid PNG metadata");
        metadata.add(type);
        break;
      default:
        fail("PNG text, executable, animated or unknown chunks are forbidden");
    }
    offset = end;
  }
  if (!ended) fail("PNG is missing IEND");
  return value;
}
function freeze2(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze2(child);
    Object.freeze(value);
  }
  return value;
}
function validateRealmPackage(input) {
  if (typeof input === "string") {
    if (input.length > REALM_LIMITS.maxFileBytes || bytes(input) > REALM_LIMITS.maxFileBytes) fail("file size limit exceeded");
    try {
      input = JSON.parse(input);
    } catch {
      fail("expected valid JSON");
    }
  }
  const p = copyPlain(input);
  fields(p, ["format", "version", "id", "title", "subtitle", "label", "width", "height", "characterStyle", "anchors", "background"], ["layers", "author", "license", "provenance"]);
  if (bytes(JSON.stringify(p)) > REALM_LIMITS.maxFileBytes) fail("file size limit exceeded");
  if (p.format !== "pwrealm" || p.version !== 1) fail("unsupported format or version");
  if (typeof p.id !== "string" || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(p.id) || p.id.length > 64 || builtinIds.has(p.id)) fail("invalid or reserved id");
  text2(p.title, 80, "title");
  text2(p.subtitle, 160, "subtitle");
  text2(p.label, 32, "label");
  for (const [key2, max] of [["author", 80], ["license", 160], ["provenance", 240]]) if (p[key2] !== void 0) text2(p[key2], max, key2);
  if (p.width !== 480 || p.height !== 300) fail("canvas must be 480\xD7300");
  if (!builtinIds.has(p.characterStyle)) fail("unknown character style");
  if (!Array.isArray(p.anchors) || p.anchors.length !== 12) fail("exactly 12 anchors are required");
  const anchors = /* @__PURE__ */ new Set();
  for (const point of p.anchors) {
    if (!Array.isArray(point) || point.length !== 2) fail("anchor must be [x,y]");
    finite(point[0], 0, 480, "anchor x", false);
    finite(point[1], 0, 300, "anchor y", false);
    const key2 = point.join(",");
    if (anchors.has(key2)) fail("anchors must be distinct");
    anchors.add(key2);
  }
  png(p.background);
  if (p.layers === void 0) p.layers = [];
  if (!Array.isArray(p.layers) || p.layers.length > REALM_LIMITS.maxLayers) fail("layer count limit exceeded");
  for (const layer of p.layers) {
    fields(layer, ["afterY", "image"]);
    finite(layer.afterY, 0, 300, "layer afterY");
    png(layer.image);
  }
  return freeze2(p);
}
function browserDecodeImage(src) {
  return new Promise((resolve, reject) => {
    if (typeof Image === "undefined") {
      reject(new Error("PNG image decoding requires a browser or decodeImage option"));
      return;
    }
    const image = new Image();
    let timer;
    const finish = (error) => {
      clearTimeout(timer);
      image.onload = image.onerror = null;
      if (error) {
        image.src = "";
        reject(error);
      } else resolve(image);
    };
    image.onload = () => finish();
    image.onerror = () => finish(new Error("PNG image could not be decoded"));
    timer = setTimeout(() => finish(new Error("PNG image decode timed out")), 1e4);
    image.src = src;
  });
}
function createRealmLibrary(storage, { decodeImage = browserDecodeImage } = {}) {
  if (!storage || typeof storage.get !== "function" || typeof storage.set !== "function") throw new TypeError("Realm library requires plugin-scoped synchronous storage");
  if (typeof decodeImage !== "function") throw new TypeError("decodeImage must be a function");
  let snapshot = Object.freeze([]), disposed = false, error = null, pending = 0;
  const listeners = /* @__PURE__ */ new Set();
  const active = () => {
    if (disposed) throw new Error("Realm library is disposed");
  };
  const publish = (next) => {
    snapshot = Object.freeze(next);
    for (const listener of listeners) {
      try {
        listener();
      } catch {
      }
    }
  };
  const remember = (reason) => {
    error = reason instanceof Error ? reason : new Error(String(reason));
    return error;
  };
  const checkBudget = (packages) => {
    if (packages.length > REALM_LIMITS.maxPackages) throw new Error("Realm package count limit exceeded");
    const raw = JSON.stringify(packages);
    if (bytes(raw) > REALM_LIMITS.maxStorageBytes) throw new Error("Realm storage size limit exceeded");
    return raw;
  };
  async function descriptor(p) {
    const decode = async (src) => {
      active();
      const image = await decodeImage(src);
      active();
      if ((image?.naturalWidth ?? image?.width) !== 480 || (image?.naturalHeight ?? image?.height) !== 300) throw new Error("Decoded PNG must be 480\xD7300");
      return image;
    };
    const background = await decode(p.background), layers = [];
    for (const layer of p.layers) layers.push(Object.freeze({ afterY: layer.afterY, image: await decode(layer.image) }));
    layers.sort((a, b) => a.afterY - b.afterY);
    return Object.freeze({ id: `import:${p.id}`, title: p.title, subtitle: p.subtitle, label: p.label, anchors: p.anchors, characterStyle: p.characterStyle, background, layers: Object.freeze(layers), packageData: p });
  }
  const ready = Promise.resolve().then(async () => {
    try {
      active();
      const saved = storage.get(REALM_STORAGE_KEY);
      if (saved == null) return;
      if (typeof saved !== "string" || saved.length > REALM_LIMITS.maxStorageBytes || bytes(saved) > REALM_LIMITS.maxStorageBytes) throw new Error("Saved realm storage size or format limit exceeded");
      const raw = JSON.parse(saved);
      if (!Array.isArray(raw) || raw.length > REALM_LIMITS.maxPackages) throw new Error("Saved realm count limit exceeded");
      const next = [];
      for (const value of raw) {
        try {
          active();
          const p = validateRealmPackage(value);
          if (next.some((r) => r.packageData.id === p.id)) throw new Error("Duplicate saved realm");
          checkBudget([...next.map((r) => r.packageData), p]);
          next.push(await descriptor(p));
        } catch (reason) {
          remember(reason);
          if (disposed) return;
        }
      }
      active();
      if (next.length) publish(next);
    } catch (reason) {
      remember(reason);
    }
  });
  let queue = ready;
  function enqueue(work) {
    if (disposed) return Promise.reject(new Error("Realm library is disposed"));
    if (pending >= REALM_LIMITS.maxPending) return Promise.reject(remember(new Error("Realm operation queue limit exceeded")));
    pending++;
    const operation = queue.then(async () => {
      active();
      return work();
    }).catch((reason) => {
      throw remember(reason);
    }).finally(() => pending--);
    queue = operation.catch(() => {
    });
    return operation;
  }
  function persist(next) {
    active();
    const serialized = checkBudget(next.map((r) => r.packageData));
    const result = storage.set(REALM_STORAGE_KEY, serialized);
    if (result === false) throw new Error("Realm persistence failed");
    if (result && typeof result.then === "function") {
      result.catch?.(() => {
      });
      throw new Error("Realm storage must be synchronous");
    }
    if (storage.get(REALM_STORAGE_KEY) !== serialized) throw new Error("Realm persistence verification failed");
    error = null;
    publish(next);
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => {
      };
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ready,
    importText(input) {
      let p;
      try {
        active();
        if (pending >= REALM_LIMITS.maxPending) throw new Error("Realm operation queue limit exceeded");
        p = validateRealmPackage(input);
      } catch (reason) {
        return Promise.reject(remember(reason));
      }
      return enqueue(async () => {
        if (snapshot.some((r) => r.packageData.id === p.id)) throw new Error("Realm is already imported; remove it first");
        checkBudget([...snapshot.map((r) => r.packageData), p]);
        const realm = await descriptor(p);
        persist([...snapshot, realm]);
        return realm;
      });
    },
    remove(id) {
      return enqueue(() => {
        const next = snapshot.filter((r) => r.id !== id);
        if (next.length === snapshot.length) return false;
        persist(next);
        return true;
      });
    },
    get error() {
      return error;
    },
    dispose() {
      disposed = true;
      listeners.clear();
      snapshot = Object.freeze([]);
    }
  };
}

// src/ui-model.js
var PRIORITY = { waiting: 0, error: 1, active: 2, queued: 3, unknown: 4, done: 5, idle: 6 };
var attentionStatus = (agent) => ["waiting", "error"].includes(agent.attention) ? agent.attention : ["waiting", "error"].includes(agent.status) ? agent.status : null;
function selectAgents(agents, { page = 0, pageSize = 12, query = "" } = {}) {
  const filtered = agents.filter((a) => [a.name, a.profile, a.tool, a.activity, a.connectionId, a.sessionId, a.storedSessionId, a.subagentId].filter(Boolean).join(" ").toLowerCase().includes(query.toLowerCase())).slice().sort((a, b) => (PRIORITY[attentionStatus(a) || a.status] ?? 4) - (PRIORITY[attentionStatus(b) || b.status] ?? 4) || (a.slot ?? 0) - (b.slot ?? 0) || a.id.localeCompare(b.id));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  page = Math.max(0, Math.min(pages - 1, page));
  return { visible: filtered.slice(page * pageSize, (page + 1) * pageSize), filtered, page, pages, total: filtered.length };
}
function counts(agents) {
  return { total: agents.length, active: agents.filter((a) => a.status === "active" && a.verified !== false).length, attention: agents.filter((a) => attentionStatus(a)).length, unknown: agents.filter((a) => a.status === "unknown" || a.verified === false).length };
}
function sessionTarget(agent, routes = []) {
  if (!agent?.storedSessionId || !agent.connectionId || !agent.profile) return null;
  const matches = routes.filter((r) => r.connectionId === agent.connectionId && (r.targetProfile || r.profile) === agent.profile);
  if (matches.length !== 1) return null;
  return { id: agent.storedSessionId, options: { route: matches[0], keepAllProfilesScope: true } };
}
function demonstration() {
  const names = ["Coordinator", "Researcher", "Builder", "Reviewer", "Designer", "Archivist"];
  const states = ["active", "active", "active", "waiting", "idle", "done"];
  const activities = ["delegating", "reading", "writing", "waiting", "idle", "complete"];
  return { revision: 0, connections: [], events: [], agents: names.map((name, slot) => ({ id: `demo:${slot}`, name, slot, profile: "demonstration", connectionId: "demo", sessionId: `demo:${slot}`, storedSessionId: "", kind: slot === 0 ? "main" : "child", parentId: slot > 0 && slot < 4 ? "demo:0" : null, status: states[slot], activity: activities[slot], tool: slot === 1 ? "web_search" : slot === 2 ? "write_file" : "", detail: slot === 3 ? "Example approval request" : "Illustrative agent \xB7 not live work", lastSeen: Date.now() })) };
}

// src/styles.js
var styles = `
.pw{--pw-ink:var(--ui-text-primary);--pw-muted:var(--ui-text-secondary);--pw-line:var(--ui-stroke-secondary);--pw-base:var(--ui-surface-background);--pw-panel:linear-gradient(var(--ui-bg-secondary),var(--ui-bg-secondary)) var(--ui-bg-elevated);--pw-accent:var(--ui-accent);color:var(--pw-ink);background:var(--pw-base);font:inherit;min-height:100%;height:100%;overflow:auto;container-type:inline-size;box-sizing:border-box}
.pw *{box-sizing:border-box}.pw button,.pw input,.pw select{font:inherit}.pw button{cursor:pointer}.pw button:disabled{cursor:default;opacity:.4}.pw button:focus-visible,.pw input:focus-visible{outline:2px solid var(--pw-accent);outline-offset:3px}.pw button{color:var(--pw-ink);background:transparent;border:1px solid var(--pw-line);border-radius:6px;padding:7px 11px;line-height:1.3}.pw button:hover:not(:disabled){background:var(--ui-control-hover-background)}.pw button[aria-pressed=true]{border-color:var(--pw-accent);background:var(--ui-control-active-background)}
.pw-shell{max-width:1800px;padding:24px 28px 18px;margin:auto}.pw-header{display:flex;align-items:flex-start;gap:20px;justify-content:space-between;margin-bottom:23px}.pw-eyebrow{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--pw-muted);margin-bottom:7px}.pw h1{font:inherit;font-size:28px;line-height:1.1;font-weight:550;letter-spacing:-.045em;margin:0}.pw-caption{font-size:12px;line-height:1.55;color:var(--pw-muted);margin:8px 0 0}.pw-header-controls{display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end;font-size:11px}.pw-mode{display:flex;border:1px solid var(--pw-line);padding:3px;border-radius:8px;gap:3px}.pw-mode button{border:0}.pw-topline{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px}.pw-world-tabs{display:flex;gap:6px;flex-wrap:wrap}.pw-world-tabs button{display:flex;align-items:center;gap:8px;padding:10px 14px;font-size:12px}.pw-theme-dot{background:var(--pw-accent);width:8px;height:8px;border-radius:2px}.pw-counters{display:flex;gap:16px;font-size:11px;color:var(--pw-muted);white-space:nowrap}.pw-counters strong{font-weight:600;color:var(--pw-ink);margin-right:4px;font-variant-numeric:tabular-nums}.pw-layout{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:16px;align-items:start}.pw-layout>section{min-width:0}.pw-world-card{border:1px solid var(--pw-line);border-radius:10px;overflow:hidden;position:relative}.pw-scene{width:100%;height:clamp(330px,43vw,660px);position:relative;overflow:auto;background:var(--pw-base)}.pw-scene-inner{width:100%;height:100%;min-width:580px;position:relative}.pw-scene canvas{background:var(--pw-base);width:100%;height:100%;display:block;image-rendering:pixelated;cursor:pointer}.pw-world-caption{display:flex;justify-content:space-between;gap:10px;padding:12px 15px;border-top:1px solid var(--pw-line);font-size:11px;color:var(--pw-muted)}.pw-world-caption strong{color:var(--pw-ink);font-weight:500}.pw-world-caption span:last-child{text-align:right}.pw-banner{padding:9px 14px;border-bottom:1px solid var(--pw-line);font-size:11px;line-height:1.5;background:color-mix(in srgb,var(--pw-accent) 8%,transparent)}.pw-banner b{font-weight:600}.pw-empty{position:absolute;bottom:16px;left:18px;right:18px;max-width:410px;background:var(--pw-panel);border:1px solid var(--pw-line);color:var(--pw-ink);padding:12px 15px;font-size:12px;line-height:1.55;border-radius:6px;pointer-events:none}.pw-empty b{display:block}.pw-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 0;font-size:11px;color:var(--pw-muted)}.pw-tools{display:flex;gap:6px;flex-wrap:wrap}.pw-tools button{padding:5px 8px}.pw-roster{border-top:1px solid var(--pw-line);margin-top:2px;padding-top:16px}.pw-section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:11px}.pw-section-heading h2,.pw-inspector h2{font:inherit;font-size:12px;font-weight:600;margin:0}.pw-search{border:1px solid var(--pw-line);border-radius:5px;background:transparent;color:var(--pw-ink);font-size:11px!important;padding:6px 9px;width:175px}.pw-agent-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(164px,1fr));gap:7px}.pw-agent{display:flex;align-items:center;text-align:left;gap:10px;padding:10px!important;min-width:0}.pw-avatar{width:29px;height:32px;flex:none;image-rendering:pixelated;display:grid;place-items:center;font-size:14px;background:color-mix(in srgb,var(--pw-accent) 8%,transparent);border-radius:4px}.pw-agent-name{display:block;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pw-agent-meta{display:block;font-size:10px;color:var(--pw-muted);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pw-agent-copy{min-width:0}.pw-mark{font-size:12px;line-height:1}.pw-inspector{border:1px solid var(--pw-line);border-radius:9px;padding:17px;min-width:0}.pw-inspector-title{margin-bottom:16px}.pw-selected-name{font-size:20px;letter-spacing:-.035em;margin:0 0 6px;overflow-wrap:anywhere}.pw-status-pill{display:inline-flex;align-items:center;gap:6px;font-size:11px;border:1px solid var(--pw-line);border-radius:4px;padding:4px 7px}.pw-detail{font-size:12px;line-height:1.6;color:var(--pw-muted);overflow-wrap:anywhere;margin:14px 0}.pw-facts{display:grid;grid-template-columns:1fr;gap:11px;margin:17px 0}.pw-facts dt{font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--pw-muted);margin-bottom:3px}.pw-facts dd{font-size:11px;margin:0;overflow-wrap:anywhere}.pw-primary{width:100%;margin-top:5px;background:var(--ui-control-active-background)!important}.pw-explainer{font-size:10px;color:var(--pw-muted);line-height:1.6;margin:9px 0 0}.pw-native{margin-top:16px;border-top:1px solid var(--pw-line);padding-top:16px}.pw-native-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px}.pw-native button{font-size:10px;padding:8px 5px}.pw-native p{font-size:10px;line-height:1.6;color:var(--pw-muted)}.pw-demo-actions{display:flex;flex-wrap:wrap;gap:5px;margin-top:15px}.pw-demo-actions button{font-size:10px;padding:6px 8px}.pw-feed{margin-top:20px}.pw-feed h2{font-size:11px;font-weight:600;margin:0 0 10px}.pw-feed-row{font-size:10px;display:flex;gap:8px;line-height:1.6;color:var(--pw-muted);margin-bottom:7px;overflow-wrap:anywhere}.pw-feed-row time{flex:none;font-variant-numeric:tabular-nums;opacity:.75}.pw-footer{margin-top:20px;display:flex;justify-content:space-between;font-size:10px;color:var(--pw-muted);border-top:1px solid var(--pw-line);padding-top:13px;gap:15px}.pw-notice{font-size:11px;padding:10px 0;color:var(--pw-muted)}
@container(max-width:1000px){.pw-shell{padding:18px}.pw-layout{grid-template-columns:minmax(0,1fr) 225px}.pw-world-tabs button{padding:8px 10px}.pw-counters{gap:8px}.pw-scene{height:410px}.pw-header{margin-bottom:18px}}
@container(max-width:780px){.pw-layout{grid-template-columns:minmax(0,1fr)}.pw-inspector{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px}.pw-native{margin:0;padding:0;border:0}.pw-feed{grid-column:1/-1;margin:0}.pw-topline{align-items:flex-start;flex-direction:column;gap:10px}.pw-header{gap:12px}.pw h1{font-size:25px}.pw-scene{height:380px}.pw-caption{max-width:300px}.pw-footer{flex-wrap:wrap}}
@container(max-width:480px){.pw-shell{padding:12px}.pw-header{flex-direction:column}.pw-header-controls{justify-content:flex-start}.pw-world-tabs{gap:4px}.pw-world-tabs button{padding:8px;font-size:11px}.pw-inspector{display:block}.pw-native{margin-top:18px}.pw-toolbar{align-items:flex-start;flex-direction:column}.pw-agent-grid{grid-template-columns:1fr 1fr}.pw-search{width:130px}.pw-scene{height:350px}.pw-world-caption{flex-direction:column}.pw-world-caption span:last-child{text-align:left}}
.pw[data-display=true]{position:relative;overflow:hidden;min-height:0}
.pw[data-display=true] .pw-shell{max-width:none;padding:0;margin:0;height:100%}
.pw[data-display=true] .pw-header,.pw[data-display=true] .pw-topline,.pw[data-display=true] .pw-toolbar,.pw[data-display=true] .pw-roster,.pw[data-display=true] .pw-inspector,.pw[data-display=true] .pw-footer,.pw[data-display=true] .pw-banner,.pw[data-display=true] .pw-world-caption{display:none}
.pw[data-display=true] .pw-layout{display:block;height:100%}
.pw[data-display=true] .pw-layout>section,.pw[data-display=true] .pw-world-card{height:100%;min-height:0}
.pw[data-display=true] .pw-world-card{border:0;border-radius:0}
.pw[data-display=true] .pw-scene{height:100%;overscroll-behavior:contain}
.pw[data-display=true] .pw-scene-inner{min-width:800px;min-height:450px}
.pw-display-controls{position:absolute;z-index:2;top:12px;left:12px;max-width:calc(100% - 24px);font-size:11px;color:var(--pw-ink)}
.pw-display-strip{display:flex;align-items:center;gap:10px;padding:5px 10px 5px 5px;border:1px solid var(--pw-line);border-radius:9px;background:var(--pw-panel)}
.pw-display-status{line-height:1.5;font-variant-numeric:tabular-nums;color:var(--pw-muted)}
.pw .pw-display-exit{white-space:nowrap;font-size:11px;padding:6px 9px;flex-shrink:0}
.pw-display-options{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:5px;padding:8px;border:1px solid var(--pw-line);border-radius:9px;background:var(--pw-panel);opacity:0;pointer-events:none;transform:translateY(-3px);transition:opacity .18s ease,transform .18s ease}
.pw-display-controls:hover .pw-display-options,.pw-display-controls:focus-within .pw-display-options{opacity:1;pointer-events:auto;transform:translateY(0)}
.pw-display-options label{display:flex;align-items:center;gap:7px;min-width:0}
.pw-display-label,.pw-display-hint{color:var(--pw-muted);font-size:10px}
.pw .pw-display-theme{min-width:0;max-width:190px;color:var(--pw-ink);background:var(--pw-panel);border:1px solid var(--pw-line);border-radius:6px;padding:6px;font-size:11px}
.pw .pw-display-theme:focus-visible{outline:2px solid var(--pw-accent);outline-offset:2px}
.pw-display-options button{font-size:11px}
.pw-realm-manager{margin:0 0 16px;padding:12px;border:1px solid var(--pw-line);border-radius:8px}.pw-realm-manager>.pw-caption{display:block;margin-top:8px}.pw[data-display=true] .pw-realm-manager{display:none}
.pw-agents{position:relative;overflow:hidden;min-height:0}.pw-agents>.pw-scene{height:100%;overscroll-behavior:contain}.pw-agents .pw-scene-inner{min-width:800px;min-height:450px}.pw-agents-controls{position:absolute;z-index:2;left:12px;top:12px;max-width:calc(100% - 24px);font-size:11px}.pw-agents-options,.pw-agents-pagination{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:5px;padding:8px;border:1px solid var(--pw-line);border-radius:9px;background:var(--pw-panel)}.pw-agents-status{color:var(--pw-muted);line-height:1.5}.pw-agents .pw-display-strip{flex-wrap:wrap}.pw-agents select{max-width:190px}
@media(hover:none){.pw-display-options{opacity:1;pointer-events:auto;transform:none}}
@media(prefers-reduced-motion:reduce){.pw *{scroll-behavior:auto!important;transition:none!important}}
`;

// src/ship-controls.js
import React, { useId, useState, useSyncExternalStore } from "react";
import { Button } from "@hermes/plugin-sdk";

// src/ship.js
var SHIP_ROOM_LABELS = Object.freeze({ bridge: "Bridge", engineering: "Engineering" });
var ROOM_IDS = Object.keys(SHIP_ROOM_LABELS);
var ORDER = ["bridge", "bridge", "engineering", "bridge", "engineering", "bridge", "engineering"];
var DURATIONS = { preparing: 0.3, seating: 0.3, opening: 0.45, crossing: 0.6, closing: 0.4, transit: 1.1, "arrival-opening": 0.45, emerging: 0.6, "arrival-closing": 0.4 };
var clamp2 = (n) => Math.max(0, Math.min(1, n));
var portalFacing = (portal, inward) => {
  const dx = (portal.x - portal.approach[0]) * (inward ? 1 : -1), dy = (portal.y - portal.approach[1]) * (inward ? 1 : -1);
  return Math.abs(dx) > Math.abs(dy) ? dx > 0 ? "east" : "west" : dy > 0 ? "south" : "north";
};
var crossingTime = (portal) => Math.max(DURATIONS.crossing, Math.hypot(portal.x - portal.approach[0], portal.y - portal.approach[1]) / 42);
var attentive = (a) => ["waiting", "error"].includes(a.attention) || ["waiting", "error"].includes(a.status);
var resting = (a) => ["idle", "done"].includes(a.status) && a.verified !== false && !attentive(a);
var freshPopulation = () => ({ records: /* @__PURE__ */ new Map(), queue: [], trip: null, time: 0, lastStamp: null, nextIdle: 15, source: null, drivers: /* @__PURE__ */ new Map() });
function createShip({ rooms, storage = null } = {}) {
  if (!rooms || ROOM_IDS.some((id) => !rooms[id]?.stations?.length || !rooms[id]?.portal)) throw new TypeError("Ship needs Bridge and Engineering layouts");
  let saved;
  try {
    saved = storage?.get("ship-settings-v1");
  } catch {
  }
  let settings = { room: ROOM_IDS.includes(saved?.room) ? saved.room : "bridge", night: saved?.night === true, energy: ["quiet", "normal", "playful"].includes(saved?.energy) ? saved.energy : "normal" };
  const populations = { live: freshPopulation(), demo: freshPopulation() }, listeners = /* @__PURE__ */ new Set(), selectedIds = { live: null, demo: null };
  let snapshot, revision = 0, lastAction = "", disposed = false, visualTime = 0, visualStamp = null;
  const effects = { pulse: 0, diagnostic: 0, lift: 0 };
  const effectLength = { pulse: 3, diagnostic: 4, lift: 1.5 };
  const getPopulation = (mode) => populations[mode === "demo" ? "demo" : "live"];
  function rebaseInactiveClocks() {
    for (const p of Object.values(populations)) if (![...p.drivers.values()].some(Boolean)) p.lastStamp = null;
    if (Object.values(populations).every((p) => p.lastStamp === null)) visualStamp = null;
  }
  function summarize(p) {
    const counts2 = { bridge: 0, engineering: 0, transit: 0, offstage: 0 };
    const locations = [...p.records.values()].map((r) => {
      counts2[r.room]++;
      return Object.freeze({ id: r.agent.id, room: r.room, destination: p.trip?.id === r.agent.id ? p.trip.to : null, phase: r.phase });
    });
    return Object.freeze({ total: p.records.size, counts: Object.freeze(counts2), locations: Object.freeze(locations), activeTripId: p.trip?.id ?? null });
  }
  function publish() {
    if (disposed) return;
    snapshot = Object.freeze({ ...settings, revision: ++revision, lastAction, selectedIds: Object.freeze({ ...selectedIds }), populations: Object.freeze({ live: summarize(populations.live), demo: summarize(populations.demo) }) });
    for (const fn of listeners) fn();
  }
  function persist() {
    try {
      storage?.set("ship-settings-v1", { room: settings.room, night: settings.night, energy: settings.energy });
    } catch {
    }
  }
  function freeStation(p, room) {
    return rooms[room].stations.find((s) => ![...p.records.values()].some((r) => r.room === room && r.station?.id === s.id) && !(p.trip?.to === room && p.trip.target.id === s.id));
  }
  function stationRecord(r, room, station) {
    Object.assign(r, { room, station, x: station.x, y: station.y, facing: station.facing || "south", seated: station.seated === true, phase: "station", walking: false, route: [] });
  }
  function place(p, r) {
    const start = [...p.records.values()].filter((v) => v.room !== "offstage").length % ORDER.length;
    const candidates = [...ORDER.slice(start), ...ORDER.slice(0, start), ...ROOM_IDS];
    for (const room of candidates) {
      const station = freeStation(p, room);
      if (station) {
        stationRecord(r, room, station);
        return true;
      }
    }
    return false;
  }
  function fillOverflow(p) {
    for (const r of p.records.values()) if (r.room === "offstage") place(p, r);
  }
  function phase(p, value) {
    const r = p.records.get(p.trip.id);
    r.phase = value;
    p.trip.elapsed = 0;
    r.walking = value === "walking-out" || value === "walking-in" || value === "crossing" || value === "emerging";
    if (value === "crossing") r.facing = portalFacing(rooms[p.trip.from].portal, true);
    if (value === "emerging") r.facing = portalFacing(rooms[p.trip.to].portal, false);
    publish();
  }
  function startNext(p) {
    if (p.trip) return;
    while (p.queue.length) {
      const request = p.queue.shift(), r = p.records.get(request.id);
      if (!r || r.room === request.to) continue;
      const target = freeStation(p, request.to);
      if (!target) {
        lastAction = `${SHIP_ROOM_LABELS[request.to]} is full. Crew stays at its current station.`;
        publish();
        continue;
      }
      if (r.room === "offstage") {
        stationRecord(r, request.to, target);
        lastAction = "Off-stage crew placed at a free station.";
        publish();
        continue;
      }
      p.trip = { id: r.agent.id, from: r.room, to: request.to, origin: r.station, target, elapsed: 0, manual: request.manual, trail: [[...r.station.stand || [r.x, r.y]]], releaseFrom: [r.x, r.y] };
      r.seated = Boolean(r.station.stand && r.station.seated);
      r.route = (r.station.exitPath || []).map((point) => [...point]);
      const approach = rooms[r.room].portal.approach;
      if (!r.route.length || r.route.at(-1)[0] !== approach[0] || r.route.at(-1)[1] !== approach[1]) r.route.push([...approach]);
      phase(p, "preparing");
      break;
    }
  }
  function finish(p) {
    if (!p.trip) return;
    const trip = p.trip, r = p.records.get(trip.id);
    if (r) {
      stationRecord(r, trip.to, trip.target);
      r.manualUntil = p.time + (trip.manual ? 90 : 30);
    }
    p.trip = null;
    fillOverflow(p);
    publish();
    startNext(p);
  }
  function walk(r, dt, trail = null) {
    let distanceLeft = dt * 42;
    while (r.route.length && distanceLeft > 0) {
      const [x, y] = r.route[0], dx = x - r.x, dy = y - r.y, distance = Math.hypot(dx, dy);
      if (distance < 0.01) {
        r.x = x;
        r.y = y;
        r.route.shift();
        continue;
      }
      r.facing = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? "east" : "west" : dy > 0 ? "south" : "north";
      if (distance <= distanceLeft) {
        r.x = x;
        r.y = y;
        r.route.shift();
        distanceLeft -= distance;
        trail?.push([x, y]);
      } else {
        r.x += dx / distance * distanceLeft;
        r.y += dy / distance * distanceLeft;
        distanceLeft = 0;
      }
    }
    return !r.route.length;
  }
  function seat(p) {
    const trip = p.trip, r = p.records.get(trip.id);
    trip.seatFrom = [r.x, r.y];
    r.seated = trip.target.seated === true;
    r.facing = trip.target.facing || "south";
    phase(p, "seating");
  }
  function runTrip(p, dt) {
    const trip = p.trip;
    if (!trip) return;
    const r = p.records.get(trip.id);
    if (!r) {
      p.trip = null;
      startNext(p);
      return;
    }
    if (!trip.manual && !resting(r.agent) && ["preparing", "walking-out", "opening"].includes(r.phase)) {
      if (r.phase === "preparing") {
        trip.to = trip.from;
        trip.target = trip.origin;
        trip.manual = true;
        if (trip.origin.stand && Math.hypot(r.x - trip.origin.x, r.y - trip.origin.y) > 0.01) seat(p);
        else finish(p);
        return;
      }
      r.route = trip.trail.slice().reverse().map((q) => [...q]);
      trip.target = trip.origin;
      trip.to = trip.from;
      phase(p, "walking-in");
      trip.manual = true;
    }
    if (r.phase === "walking-out") {
      if (walk(r, dt, trip.trail)) phase(p, "opening");
      return;
    }
    if (r.phase === "walking-in") {
      if (walk(r, dt)) {
        if (trip.target.stand) seat(p);
        else finish(p);
      }
      return;
    }
    trip.elapsed += dt;
    if (r.phase === "preparing" && trip.origin.stand) {
      const progress = clamp2(trip.elapsed / DURATIONS.preparing);
      r.x = trip.releaseFrom[0] + (trip.origin.stand[0] - trip.releaseFrom[0]) * progress;
      r.y = trip.releaseFrom[1] + (trip.origin.stand[1] - trip.releaseFrom[1]) * progress;
    }
    if (r.phase === "seating") {
      const progress = clamp2(trip.elapsed / DURATIONS.seating);
      r.x = trip.seatFrom[0] + (trip.target.x - trip.seatFrom[0]) * progress;
      r.y = trip.seatFrom[1] + (trip.target.y - trip.seatFrom[1]) * progress;
    }
    const portal = rooms[trip.from].portal, destination = rooms[trip.to].portal;
    if (r.phase === "crossing") {
      const progress = clamp2(trip.elapsed / crossingTime(portal));
      r.x = portal.approach[0] + (portal.x - portal.approach[0]) * progress;
      r.y = portal.approach[1] + (portal.y - portal.approach[1]) * progress;
    }
    if (r.phase === "emerging") {
      const progress = clamp2(trip.elapsed / crossingTime(destination));
      r.x = destination.x + (destination.approach[0] - destination.x) * progress;
      r.y = destination.y + (destination.approach[1] - destination.y) * progress;
    }
    if (trip.elapsed < (r.phase === "crossing" ? crossingTime(portal) : r.phase === "emerging" ? crossingTime(destination) : DURATIONS[r.phase] ?? Infinity)) return;
    switch (r.phase) {
      case "preparing":
        r.seated = false;
        phase(p, "walking-out");
        break;
      case "seating":
        finish(p);
        break;
      case "opening":
        phase(p, "crossing");
        break;
      case "crossing":
        r.room = "transit";
        phase(p, "closing");
        break;
      case "closing":
        phase(p, "transit");
        break;
      case "transit":
        phase(p, "arrival-opening");
        break;
      case "arrival-opening":
        r.room = trip.to;
        r.x = destination.x;
        r.y = destination.y;
        phase(p, "emerging");
        break;
      case "emerging":
        phase(p, "arrival-closing");
        break;
      case "arrival-closing":
        r.route = [...(trip.target.exitPath || []).slice().reverse().map((q) => [...q]), [...trip.target.stand || [trip.target.x, trip.target.y]]];
        phase(p, "walking-in");
        break;
    }
  }
  function idleVisit(p) {
    if (settings.energy === "quiet" || p.trip || p.queue.length || p.time < p.nextIdle) return;
    p.nextIdle = p.time + (settings.energy === "playful" ? 18 : 40);
    const r = [...p.records.values()].find((r2) => ROOM_IDS.includes(r2.room) && resting(r2.agent) && p.time >= (r2.manualUntil || 0));
    if (!r) return;
    const destinations = ROOM_IDS.filter((id) => id !== r.room);
    const to = destinations.find((id) => freeStation(p, id));
    if (to) {
      p.queue.push({ id: r.agent.id, to, manual: false });
      startNext(p);
    }
  }
  function doorState(p, room) {
    const trip = p.trip;
    if (!trip) return 0;
    const r = p.records.get(trip.id);
    if (!r) return 0;
    if (room === trip.from) {
      if (r.phase === "opening") return clamp2(trip.elapsed / DURATIONS.opening);
      if (r.phase === "crossing") return 1;
      if (r.phase === "closing") return 1 - clamp2(trip.elapsed / DURATIONS.closing);
    }
    if (room === trip.to) {
      if (r.phase === "arrival-opening") return clamp2(trip.elapsed / DURATIONS["arrival-opening"]);
      if (r.phase === "emerging") return 1;
      if (r.phase === "arrival-closing") return 1 - clamp2(trip.elapsed / DURATIONS["arrival-closing"]);
    }
    return 0;
  }
  publish();
  return {
    getSnapshot: () => snapshot,
    subscribe(fn) {
      if (disposed) return () => {
      };
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    sync(agents, mode = "live") {
      if (disposed) return;
      const p = getPopulation(mode);
      if (p.source === agents) return;
      p.source = agents;
      const valid = new Map((Array.isArray(agents) ? agents : []).filter((a) => a && typeof a.id === "string").map((a) => [a.id, a]));
      for (const id of p.records.keys()) if (!valid.has(id)) p.records.delete(id);
      const selectionKey = mode === "demo" ? "demo" : "live";
      if (selectedIds[selectionKey] && !valid.has(selectedIds[selectionKey])) selectedIds[selectionKey] = null;
      p.queue = p.queue.filter((q) => valid.has(q.id));
      if (p.trip && !valid.has(p.trip.id)) p.trip = null;
      const ordered = [...valid.values()].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0) || a.id.localeCompare(b.id));
      for (const agent of ordered) {
        const r = p.records.get(agent.id);
        if (r) r.agent = agent;
        else {
          const row = { agent, room: "offstage", station: null, x: 0, y: 0, phase: "offstage", facing: "south", seated: false, walking: false, route: [], manualUntil: 0 };
          place(p, row);
          p.records.set(agent.id, row);
        }
      }
      runTrip(p, 0);
      fillOverflow(p);
      publish();
      startNext(p);
    },
    setRoom(room) {
      if (disposed || !ROOM_IDS.includes(room)) return false;
      if (settings.room !== room) {
        settings = { ...settings, room };
        persist();
        publish();
      }
      return true;
    },
    set(key2, value) {
      if (disposed || !["night", "energy"].includes(key2)) return false;
      if (key2 === "energy" && !["quiet", "normal", "playful"].includes(value)) return false;
      const next = key2 === "energy" ? value : Boolean(value);
      if (settings[key2] === next) return true;
      settings = { ...settings, [key2]: next };
      persist();
      publish();
      return true;
    },
    trigger(action) {
      if (disposed) return false;
      if (action === "reset") {
        for (const key2 of Object.keys(effects)) effects[key2] = 0;
        lastAction = "Scene effects cleared. Agent work is unchanged.";
        publish();
        return true;
      }
      if (!Object.hasOwn(effects, action)) return false;
      if (action === "pulse") {
        settings = { ...settings, room: "engineering" };
        persist();
      }
      effects[action] = visualTime + effectLength[action];
      lastAction = { pulse: "Warp-core resonance \xB7 decorative pulse", diagnostic: "LCARS diagnostic \xB7 visual simulation", lift: "Turbolift ready \xB7 choose a room" }[action];
      publish();
      return true;
    },
    transfer(id, to, mode = "live") {
      if (disposed || !ROOM_IDS.includes(to)) return { ok: false, message: "Unknown destination." };
      const p = getPopulation(mode), r = p.records.get(id);
      if (!r) return { ok: false, message: "Choose an observed crew member." };
      if (p.trip?.id === id) return { ok: false, message: "This crew member is already traveling." };
      if (r.room === to) return { ok: false, message: "Already in this room." };
      if (!freeStation(p, to)) return { ok: false, message: `${SHIP_ROOM_LABELS[to]} is full.` };
      p.queue = p.queue.filter((q) => q.id !== id);
      p.queue.push({ id, to, manual: true });
      lastAction = `Visual assignment to ${SHIP_ROOM_LABELS[to]}. Actual work is unchanged.`;
      publish();
      startNext(p);
      return { ok: true, message: lastAction };
    },
    select(id, mode = "live") {
      const key2 = mode === "demo" ? "demo" : "live";
      if (id !== null && !populations[key2].records.has(id)) return false;
      if (selectedIds[key2] !== id) {
        selectedIds[key2] = id;
        publish();
      }
      return true;
    },
    locate(id, mode = "live") {
      const p = getPopulation(mode), r = p.records.get(id);
      if (!r) return false;
      const room = r.room === "transit" ? p.trip?.to : r.room;
      if (!ROOM_IDS.includes(room)) {
        lastAction = "This crew member is off-stage. Choose a free room to place them.";
        publish();
        return false;
      }
      return this.setRoom(room);
    },
    releaseClock(consumer = null) {
      for (const p of Object.values(populations)) p.drivers.delete(consumer);
      rebaseInactiveClocks();
    },
    tick(stamp, mode = "live", { paused = false, reducedMotion = false, hidden = false, consumer = null } = {}) {
      if (disposed || !Number.isFinite(stamp)) return;
      const p = getPopulation(mode);
      p.drivers.set(consumer, !paused && !hidden && !reducedMotion);
      rebaseInactiveClocks();
      if (paused || hidden) return;
      if (reducedMotion) {
        let limit = p.records.size + 1;
        while (p.trip && limit-- > 0) finish(p);
        return;
      }
      const dt = p.lastStamp === null ? 0 : Math.max(0, Math.min(0.08, (stamp - p.lastStamp) / 1e3));
      p.lastStamp = Math.max(stamp, p.lastStamp ?? stamp);
      if (visualStamp !== null) visualTime += Math.max(0, Math.min(0.08, (stamp - visualStamp) / 1e3));
      visualStamp = Math.max(stamp, visualStamp ?? stamp);
      if (!dt) return;
      p.time += dt;
      runTrip(p, dt);
      idleVisit(p);
    },
    getFrame(mode = "live") {
      const p = getPopulation(mode), room = settings.room;
      const items = [...p.records.values()].filter((r) => r.room === room).map((r) => ({ agent: r.agent, index: rooms[room].stations.indexOf(r.station), x: Math.round(r.x), y: Math.round(r.y), facing: r.facing, seated: r.seated, walking: r.walking, atStation: r.phase === "station", pose: r.walking ? "walk" : resting(r.agent) ? "padd" : r.agent.status === "active" ? "work" : "inspect", phase: r.phase, team: false }));
      return { room, time: visualTime, items, effects: { night: settings.night, pulse: clamp2((effects.pulse - visualTime) / effectLength.pulse), diagnostic: clamp2((effects.diagnostic - visualTime) / effectLength.diagnostic), door: rooms[room].portal.offscreen ? 0 : Math.max(doorState(p, room), clamp2((effects.lift - visualTime) / effectLength.lift)) }, counts: summarize(p).counts, total: p.records.size };
    },
    dispose() {
      disposed = true;
      listeners.clear();
      for (const p of Object.values(populations)) {
        p.records.clear();
        p.drivers.clear();
        p.queue = [];
        p.trip = null;
      }
    }
  };
}

// src/ship-controls.js
var h = React.createElement;
var ROOMS = Object.entries(SHIP_ROOM_LABELS);
var ROOM_LABELS = SHIP_ROOM_LABELS;
var STATES = { active: "Working", waiting: "Needs input", error: "Needs attention", done: "Turn complete", idle: "Idle", queued: "Queued", unknown: "Unverified" };
function Action({ children, ...props }) {
  return h(Button, { type: "button", ...props }, children);
}
function locationLabel(location) {
  if (!location) return "Location unavailable";
  if (location.room === "transit") return `In transit${ROOM_LABELS[location.destination] ? ` \u2192 ${ROOM_LABELS[location.destination]}` : ""}`;
  if (location.room === "offstage") return "Off-stage";
  return ROOM_LABELS[location.room] || "Location unavailable";
}
function statusLabel(agent) {
  const current = STATES[agent.status] || STATES.unknown;
  const attention = attentionStatus(agent);
  return `${current}${agent.verified === false && agent.status !== "unknown" ? " \xB7 Unverified" : ""}${attention && attention !== agent.status ? ` \xB7 Earlier ${attention === "error" ? "error" : "input request"}` : ""}`;
}
function actionLabel(action) {
  return typeof action === "string" ? action : typeof action?.message === "string" ? action.message : "";
}
function ShipControls({ ship, mode = "live", agents = [], selectedId = null, onSelect, compact = false }) {
  const snapshot = useSyncExternalStore(ship.subscribe, ship.getSnapshot, ship.getSnapshot);
  const [localId, setLocalId] = useState(null), [destination, setDestination] = useState("engineering"), [notice, setNotice] = useState(null);
  const hintId = useId();
  const population = snapshot.populations?.[mode];
  const locations = new Map((population?.locations || []).map((location2) => [location2.id, location2]));
  const selected = agents.find((agent) => agent.id === (onSelect ? selectedId : localId ?? selectedId));
  const location = selected ? locations.get(selected.id) : null;
  const attention = { bridge: 0, engineering: 0 };
  let elsewhere = 0;
  for (const agent of agents) {
    if (!attentionStatus(agent)) continue;
    const room = locations.get(agent.id)?.room;
    if (Object.hasOwn(attention, room)) attention[room]++;
    if (room !== snapshot.room) elsewhere++;
  }
  const names = /* @__PURE__ */ new Map();
  for (const agent of agents) {
    const name = agent.name || agent.profile || "Unnamed agent";
    names.set(name, (names.get(name) || 0) + 1);
  }
  const crewName = (agent) => {
    const name = agent.name || agent.profile || "Unnamed agent";
    return names.get(name) > 1 ? `${name} \xB7 ${agent.id}` : name;
  };
  const message = notice && notice.action === snapshot.lastAction && notice.mode === mode && notice.id === (selected?.id ?? null) ? notice.text : actionLabel(snapshot.lastAction);
  function report(text3) {
    setNotice({ text: text3, action: ship.getSnapshot().lastAction, mode, id: selected?.id ?? null });
  }
  function act(fn) {
    setNotice(null);
    fn();
  }
  function select(id) {
    setNotice(null);
    setLocalId(id || null);
    onSelect?.(id || null);
  }
  function locate() {
    if (!selected) return;
    if (ship.locate(selected.id, mode)) report(`${crewName(selected)} \xB7 ${locationLabel(locations.get(selected.id))}.`);
    else report(location?.room === "transit" ? `${crewName(selected)} is in transit. Locate again on arrival.` : location?.room === "offstage" ? `${crewName(selected)} is off-stage; choose a room to move them locally.` : "Crew location is not available yet.");
  }
  function transfer() {
    if (!selected) return;
    const result = ship.transfer(selected.id, destination, mode);
    report(result.message || (result.ok ? "Local crew move requested." : "Could not move crew locally."));
  }
  const moving = Boolean(selected && (location?.room === "transit" || population?.activeTripId === selected.id));
  return h(
    "section",
    { className: `pw-ship${compact ? " pw-ship--compact" : ""}`, "aria-label": "Ship rooms and local controls" },
    h("nav", { className: "pw-ship-rooms", "aria-label": "Ship rooms" }, ROOMS.map(([room, label2]) => h(
      Action,
      { key: room, className: "pw-ship-room", "aria-pressed": snapshot.room === room, onClick: () => act(() => ship.setRoom(room)) },
      h("span", { className: "pw-ship-room-name" }, label2),
      h("span", { className: "pw-ship-count" }, population?.counts?.[room] ?? 0, h("span", { className: "pw-ship-sr" }, " crew")),
      attention[room] > 0 && h("span", { className: "pw-ship-attention" }, "! ", attention[room], h("span", { className: "pw-ship-sr" }, " need attention"))
    ))),
    h(
      "div",
      { className: "pw-ship-population" },
      h("span", null, `${mode === "demo" ? "Demo" : "Live"} \xB7 ${population?.total ?? 0} crew`),
      h("span", null, `${population?.counts?.transit ?? 0} in transit \xB7 ${population?.counts?.offstage ?? 0} off-stage`),
      elsewhere > 0 && h("strong", { className: "pw-ship-attention" }, `${elsewhere} need attention elsewhere`)
    ),
    h(
      "details",
      { className: "pw-ship-disclosure" },
      h("summary", { className: "pw-ship-summary" }, h("span", null, "Ship controls"), h("span", { className: "pw-ship-summary-note" }, "Local scene only")),
      h(
        "div",
        { className: "pw-ship-body" },
        h("p", { className: "pw-ship-hint", id: hintId }, "Scene effects and visual crew placement only. No jobs are routed or commands run."),
        h(
          "div",
          { className: "pw-ship-row", "aria-label": "Scene lighting" },
          h(Action, { "aria-pressed": Boolean(snapshot.night), "aria-label": "Night shift", onClick: () => act(() => ship.set("night", !snapshot.night)) }, "Night shift", h("span", { className: "pw-ship-switch", "aria-hidden": true }, snapshot.night ? "On" : "Off"))
        ),
        h("fieldset", { className: "pw-ship-energy" }, h("legend", null, "Scene energy"), h("div", { className: "pw-ship-row" }, ["quiet", "normal", "playful"].map((energy) => h(Action, { key: energy, "aria-pressed": snapshot.energy === energy, onClick: () => act(() => ship.set("energy", energy)) }, energy[0].toUpperCase() + energy.slice(1))))),
        h("div", { className: "pw-ship-row", "aria-label": "Local scene effects" }, [["pulse", "Pulse warp core"], ["diagnostic", "Diagnostic sweep"], ["reset", "Clear effects"]].map(([action, label2]) => h(Action, { key: action, onClick: () => act(() => ship.trigger(action)) }, label2))),
        h(
          "div",
          { className: "pw-ship-crew" },
          h("label", { className: "pw-ship-field" }, h("span", { id: `${hintId}-crew` }, "Crew member"), h(
            "select",
            { className: "pw-ship-select", "aria-labelledby": `${hintId}-crew`, value: selected?.id || "", onChange: (event) => select(event.target.value) },
            h("option", { value: "" }, agents.length ? "Select crew\u2026" : "No crew in this source"),
            agents.map((agent) => h("option", { key: agent.id, value: agent.id }, `${crewName(agent)} \xB7 ${statusLabel(agent)} \xB7 ${locationLabel(locations.get(agent.id))}`))
          )),
          selected && h("p", { className: "pw-ship-selected" }, `${statusLabel(selected)} \xB7 ${locationLabel(location)}`),
          h(
            "div",
            { className: "pw-ship-row" },
            h(Action, { disabled: !selected, onClick: locate }, "Locate crew"),
            h("label", { className: "pw-ship-field pw-ship-destination" }, h("span", { id: `${hintId}-destination` }, "Move to room"), h("select", { className: "pw-ship-select", "aria-labelledby": `${hintId}-destination`, value: destination, onChange: (event) => setDestination(event.target.value) }, ROOMS.map(([id, label2]) => h("option", { key: id, value: id }, label2)))),
            h(Action, { disabled: !selected || moving || location?.room === destination, onClick: transfer, "aria-describedby": hintId }, "Move crew locally")
          ),
          moving && h("p", { className: "pw-ship-hint" }, "Crew is travelling; choose another destination after arrival.")
        )
      )
    ),
    h("p", { className: "pw-ship-notice", role: "status", "aria-live": "polite", "aria-atomic": true }, message)
  );
}

// src/ship-styles.js
var shipStyles = `
.pw .pw-ship{position:relative;min-width:0;max-width:100%;margin:0;padding:8px;border-bottom:1px solid var(--pw-line);color:var(--pw-ink);font-size:11px}

.pw .pw-ship-rooms{display:flex;flex-wrap:wrap;gap:5px;position:relative;min-width:0}
.pw .pw-ship .pw-ship-room{display:flex;align-items:center;gap:8px;flex:0 1 auto;min-width:0;text-align:left}
.pw .pw-ship-room-name{min-width:0;overflow-wrap:anywhere}
.pw .pw-ship button{max-width:100%;white-space:normal}
.pw .pw-ship-count{flex-shrink:0;font-variant-numeric:tabular-nums;text-align:center;border-left:1px solid var(--pw-line);padding-left:6px}
.pw .pw-ship-attention{font-size:11px;font-weight:600;color:var(--pw-ink);text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}
.pw .pw-ship-room .pw-ship-attention{white-space:nowrap;flex-shrink:0}
.pw .pw-ship-population{display:flex;flex-wrap:wrap;gap:2px 13px;padding:8px 0;color:var(--pw-muted);font-size:11px;font-variant-numeric:tabular-nums}
.pw .pw-ship-disclosure{min-width:0;border-top:1px solid var(--pw-line)}
.pw .pw-ship-summary{padding:8px 0;cursor:pointer;color:var(--pw-ink);font-weight:600;overflow-wrap:anywhere}
.pw .pw-ship-summary::marker{color:var(--pw-ink)}
.pw .pw-ship-summary-note{display:inline-block;margin-left:12px;font-weight:400;font-size:11px;color:var(--pw-muted)}
.pw .pw-ship-body{display:grid;gap:8px;min-width:0;padding:4px 0 8px}
.pw .pw-ship-hint{margin:0;font-size:11px;line-height:1.5;color:var(--pw-muted);overflow-wrap:anywhere}
.pw .pw-ship-row{display:flex;flex-wrap:wrap;align-items:flex-end;gap:6px;min-width:0}
.pw .pw-ship-switch{display:inline-block;margin-left:8px;color:var(--pw-muted);font-size:10px}
.pw .pw-ship-energy{border:0;margin:0;padding:0;min-width:0}
.pw .pw-ship-energy legend{padding:0;margin:0 0 6px;color:var(--pw-muted);font-size:11px}
.pw .pw-ship-crew{display:grid;gap:8px;min-width:0;padding-top:12px;border-top:1px solid var(--pw-line)}
.pw .pw-ship-field{display:grid;gap:4px;min-width:0;max-width:100%;color:var(--pw-muted);font-size:11px}
.pw .pw-ship .pw-ship-select{display:block;width:100%;min-width:0;max-width:100%;border:1px solid var(--pw-line);border-radius:6px;padding:6px;color:var(--pw-ink);background:var(--pw-panel);font:inherit;text-overflow:ellipsis}
.pw .pw-ship-destination{flex:1 1 160px}
.pw .pw-ship-selected{margin:0;overflow-wrap:anywhere;color:var(--pw-ink);font-size:11px}
.pw .pw-ship-notice{margin:0;max-width:100%;font-size:11px;overflow-wrap:anywhere;color:var(--pw-ink)}
.pw .pw-ship-notice:not(:empty){padding:8px 0 2px;border-top:1px solid var(--pw-line)}
.pw .pw-ship-select:focus-visible,.pw .pw-ship-summary:focus-visible{outline:2px solid var(--pw-accent);outline-offset:3px}
.pw .pw-ship-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
.pw .pw-ship--compact{margin:5px 0 0;padding:8px;border:1px solid var(--pw-line);border-radius:9px;background:var(--pw-panel)}
.pw .pw-ship--compact .pw-ship-population>span{display:none}
.pw .pw-ship--compact .pw-ship-population:not(:has(strong)){display:none}
.pw .pw-agents-controls,.pw .pw-display-controls{max-height:calc(100% - 24px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}
/* Keep shared controls on the left; Trek never pushes them below its disclosure. */
.pw :is(.pw-agents-controls,.pw-display-controls):has(.pw-ship--compact){display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);grid-template-rows:min-content min-content 1fr;column-gap:8px;align-items:start;width:960px}
.pw :is(.pw-agents-controls,.pw-display-controls)>:not(.pw-ship){grid-column:1;min-width:0}
.pw :is(.pw-agents-controls,.pw-display-controls)>.pw-ship--compact{grid-column:2;grid-row:1/4;margin-top:0}
/* Composite the host accent wash over its opaque elevated surface, never strip alpha. */
.pw :is(.pw-agents-controls,.pw-display-controls)>*{background:var(--pw-panel)}
@container(max-width:780px){.pw :is(.pw-agents-controls,.pw-display-controls):has(.pw-ship--compact){display:block}.pw :is(.pw-agents-controls,.pw-display-controls)>.pw-ship--compact{margin-top:5px}}
.pw .pw-ship--compact .pw-ship-body{max-height:min(55vh,460px);overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding:4px 5px 8px 3px}
@container(max-width:480px){.pw .pw-ship-summary-note{margin-left:8px}}
@media(prefers-reduced-motion:reduce){.pw .pw-ship,.pw .pw-ship *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
@media(forced-colors:active){.pw .pw-ship button[aria-pressed=true]{outline:2px solid Highlight;outline-offset:-3px}.pw .pw-ship-count{border-color:CanvasText}}
`;

// src/app.js
var h2 = React2.createElement;
var STATE = { active: ["\u25C6", "Working"], waiting: ["!", "Needs input"], error: ["\xD7", "Needs attention"], done: ["\u2713", "Turn complete"], idle: ["\u25CB", "Idle"], queued: ["\u25C7", "Queued"], unknown: ["?", "Unverified"] };
function Action2({ children, ...props }) {
  return h2(Button2, { type: "button", ...props }, children);
}
function Mark({ status }) {
  return h2("span", { className: "pw-mark", "aria-hidden": true }, (STATE[status] || STATE.unknown)[0]);
}
function shipSummary(snapshot, mode) {
  const p = snapshot.populations[mode], c = p.counts;
  return `${c[snapshot.room]} in ${SHIP_ROOM_LABELS[snapshot.room]} \xB7 ${p.total - c[snapshot.room] - c.offstage - c.transit} elsewhere \xB7 ${c.transit} in transit \xB7 ${c.offstage} off-stage`;
}
function useReducedMotion() {
  const [reduced, set] = useState2(() => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => set(m.matches);
    m.addEventListener("change", change);
    return () => m.removeEventListener("change", change);
  }, []);
  return reduced;
}
function Scene({ theme, realm = null, agents, selectedId, onSelect, reducedMotion, paused, onMetrics, displayMode, ship = null, shipMode = "live" }) {
  const canvas = useRef(null), container = useRef(null), renderer = useRef(null), latest = useRef(null), visible = useRef(true);
  latest.current = { theme, realm, agents, selectedId, reducedMotion, paused, shipMode };
  useEffect(() => {
    visible.current = true;
    const world = createWorld(canvas.current, { onSelect, onMetrics, ship });
    renderer.current = world;
    const update = () => world.update({ ...latest.current, paused: latest.current.paused || !visible.current || document.hidden });
    const resize = () => {
      const r = container.current.getBoundingClientRect();
      world.resize(r.width, r.height, window.devicePixelRatio || 1);
      update();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container.current);
    const intersection = new IntersectionObserver((entries) => {
      visible.current = entries[0]?.isIntersecting !== false;
      update();
    });
    intersection.observe(container.current);
    document.addEventListener("visibilitychange", update);
    resize();
    return () => {
      observer.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", update);
      world.destroy();
      renderer.current = null;
    };
  }, [onSelect, onMetrics, ship]);
  useEffect(() => {
    renderer.current?.update({ ...latest.current, paused: paused || !visible.current || document.hidden });
  }, [theme, realm, agents, selectedId, reducedMotion, paused, shipMode]);
  const shipView = theme === "bridge" && ship ? ship.getSnapshot() : null;
  return h2("div", { className: "pw-scene-inner", ref: container }, h2("canvas", { ref: canvas, role: "img", "aria-label": `${shipView ? SHIP_ROOM_LABELS[shipView.room] : realm?.title || THEMES.find((t) => t.id === theme)?.title || theme} world. ${shipView ? shipView.populations[shipMode].counts[shipView.room] : agents.length} agents on stage. ${shipView ? "Use Ship controls for keyboard-accessible rooms, crew and activities." : displayMode ? "Return to Worlds for the accessible agent roster." : "Select agents using the accessible list below."}` }));
}
function createWorldPreferences(storage) {
  const read = (key2, fallback) => {
    try {
      return storage.get(key2) ?? fallback;
    } catch {
      return fallback;
    }
  };
  let snapshot = { theme: read("theme", THEMES[0].id), paused: read("paused", false) === true, reducedMotion: read("reducedMotion", false) === true };
  const listeners = /* @__PURE__ */ new Set();
  return { getSnapshot: () => snapshot, subscribe: (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, set(key2, value) {
    try {
      storage.set(key2, value);
    } catch {
    }
    snapshot = { ...snapshot, [key2]: value };
    listeners.forEach((fn) => fn());
  }, dispose: () => listeners.clear() };
}
function useWorldSettings(preferences, realmLibrary) {
  const settings = useSyncExternalStore2(preferences.subscribe, preferences.getSnapshot, preferences.getSnapshot);
  const imported = useSyncExternalStore2(realmLibrary.subscribe, realmLibrary.getSnapshot, realmLibrary.getSnapshot);
  const themes = useMemo(() => [...THEMES, ...imported], [imported]);
  useEffect(() => {
    let active = true;
    realmLibrary.ready.then(() => {
      if (active && ![...THEMES, ...realmLibrary.getSnapshot()].some((t) => t.id === preferences.getSnapshot().theme)) preferences.set("theme", THEMES[0].id);
    });
    return () => {
      active = false;
    };
  }, [realmLibrary, preferences]);
  return { ...settings, themes, realm: imported.find((t) => t.id === settings.theme) || null, setTheme: (value) => preferences.set("theme", value), setPaused: (value) => preferences.set("paused", typeof value === "function" ? value(settings.paused) : value), setMotion: (value) => preferences.set("reducedMotion", value) };
}
function RealmManager({ realmLibrary, realm, setTheme, openExternal }) {
  const input = useRef(null), mounted = useRef(true);
  const [busy, setBusy] = useState2(false), [message, setMessage] = useState2(""), [error, setError] = useState2(false);
  useEffect(() => {
    mounted.current = true;
    realmLibrary.ready.then(() => {
      if (mounted.current && realmLibrary.error) {
        setError(true);
        setMessage(`Some saved realms could not be restored: ${realmLibrary.error.message}`);
      }
    });
    return () => {
      mounted.current = false;
    };
  }, [realmLibrary]);
  async function importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      if (file.size > REALM_LIMITS.maxFileBytes) throw new Error("File exceeds the realm package size limit (1 MB).");
      const imported = await realmLibrary.importText(await file.text());
      if (mounted.current) {
        setTheme(imported.id);
        setMessage(`Imported ${imported.title}.`);
      }
    } catch (e) {
      if (mounted.current) {
        setError(true);
        setMessage(`Could not import realm: ${e.message || e}`);
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      await realmLibrary.remove(realm.id);
      if (mounted.current) {
        setTheme(THEMES[0].id);
        setMessage(`Removed ${realm.title} from this library.`);
      }
    } catch (e) {
      if (mounted.current) {
        setError(true);
        setMessage(`Could not remove realm: ${e.message || e}`);
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function browse() {
    try {
      await openExternal("https://github.com/cygnostik/pd-pixel-worlds/blob/main/realms/README.md");
    } catch (e) {
      setError(true);
      setMessage(`Could not open realm gallery: ${e.message || e}`);
    }
  }
  return h2("section", { className: "pw-realm-manager", "aria-label": "Realm library" }, h2("div", { className: "pw-tools" }, h2(Action2, { className: "pw-primary", onClick: browse }, "Browse realms"), h2(Action2, { onClick: () => input.current?.click(), disabled: busy }, busy ? "Importing\u2026" : "Import realm"), realm && h2(Action2, { onClick: remove, disabled: busy, title: `Remove ${realm.title} from your imported library` }, "Remove selected realm"), h2("input", { ref: input, type: "file", accept: ".pwrealm.json,.json,application/json", hidden: true, "aria-label": "Import realm file", onChange: importFile })), h2("span", { className: "pw-caption" }, "Import a .pwrealm.json package. Duplicate IDs are rejected; remove a realm explicitly before replacing it."), message && h2("p", { role: error ? "alert" : "status", className: "pw-notice" }, message));
}
function PixelWorlds({ runtime, storage, host: host2, realmLibrary, preferences, openExternal, ship }) {
  const snapshot = useSyncExternalStore2(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  const { theme, setTheme, paused, setPaused, reducedMotion: motion, setMotion, themes, realm } = useWorldSettings(preferences, realmLibrary);
  const [mode, setMode] = useState2("live");
  const [demo, setDemo] = useState2(demonstration);
  const [localSelected, setSelected] = useState2(null);
  const shipState = useSyncExternalStore2(ship.subscribe, ship.getSnapshot, ship.getSnapshot);
  const selectedId = theme === "bridge" ? shipState.selectedIds[mode] : localSelected;
  const [displayMode, setDisplayMode] = useState2(() => {
    try {
      return storage.get("displayMode") === true;
    } catch {
      return false;
    }
  });
  const root = useRef(null), wasDisplay = useRef(false);
  const [page, setPage] = useState2(0), [query, setQuery] = useState2("");
  const [routes, setRoutes] = useState2([]), [notice, setNotice] = useState2(""), [opening, setOpening] = useState2(false);
  const metrics = useRef(null);
  const systemReduced = useReducedMotion();
  const data = mode === "demo" ? demo : snapshot;
  const agents = data.agents || [];
  useEffect(() => {
    ship.sync(agents, mode);
  }, [ship, agents, mode]);
  const stats = counts(agents);
  const list = useMemo(() => selectAgents(agents, { page, query }), [agents, page, query]);
  const selected = agents.find((a) => a.id === selectedId) || null;
  const nameCounts = useMemo(() => {
    const c = /* @__PURE__ */ new Map();
    for (const a of agents) {
      const n = a.name || a.profile;
      c.set(n, (c.get(n) || 0) + 1);
    }
    return c;
  }, [agents]);
  const world = themes.find((t) => t.id === theme) || THEMES[0];
  const target = selected ? sessionTarget(selected, routes) : null;
  const onSelect = useMemo(() => (value) => {
    const id = value && typeof value === "object" ? value.id : value;
    setSelected(id);
    ship.select(id, mode);
    if (theme === "bridge" && id) ship.locate(id, mode);
  }, [ship, mode, theme]);
  const onMetrics = useMemo(() => (m) => {
    metrics.current = m;
  }, []);
  const routeRevision = (snapshot.connections || []).map((c) => `${c.id || c.connectionId}:${c.status || c.state}`).join("|");
  useEffect(() => {
    let disposed = false;
    Promise.resolve(host2.profileRoutes?.() || []).then((r) => {
      if (!disposed) setRoutes(Array.isArray(r) ? r : []);
    }).catch(() => {
    });
    return () => {
      disposed = true;
    };
  }, [host2, routeRevision]);
  useEffect(() => {
    try {
      storage.set("displayMode", displayMode);
    } catch {
    }
  }, [displayMode, storage]);
  useEffect(() => {
    if (displayMode) root.current?.querySelector(".pw-display-exit")?.focus({ preventScroll: true });
    else if (wasDisplay.current) root.current?.querySelector(".pw-display-enter")?.focus({ preventScroll: true });
    wasDisplay.current = displayMode;
    if (!displayMode) return;
    const escape = (e) => {
      if (e.key === "Escape") {
        setDisplayMode(false);
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [displayMode]);
  function changeMode(next) {
    setMode(next);
    setSelected(null);
    ship.select(null, next);
    setPage(0);
    setQuery("");
    setNotice("");
  }
  function demoState(status) {
    if (!selected) return;
    setDemo((d) => ({ ...d, revision: d.revision + 1, agents: d.agents.map((a) => a.id === selected.id ? { ...a, status, activity: status === "active" ? "writing" : status, tool: status === "active" ? "write_file" : "", detail: `Demonstration: ${STATE[status]?.[1] || status}`, lastSeen: Date.now() } : a) }));
  }
  async function openSession() {
    if (!target || mode !== "live") return;
    setOpening(true);
    setNotice("");
    try {
      await host2.openSession(target.id, target.options);
    } catch (error) {
      setNotice(`Could not open this session: ${error.message || error}`);
    } finally {
      setOpening(false);
    }
  }
  const observing = (snapshot.connections || []).some((c) => c.status === "open" || c.status === "observed");
  const selectedSource = selected ? (snapshot.connections || []).find((c) => c.id === selected.connectionId && c.profile === selected.profile) : null;
  const feed = (data.events || []).slice(0, 5);
  const stageSummary = theme === "bridge" ? shipSummary(shipState, mode) : `${list.visible.length} on stage \xB7 ${agents.length - list.visible.length} off-stage`;
  return h2(
    "main",
    { ref: root, className: "pw", "data-mode": mode, "data-theme": theme, "data-display": String(displayMode) },
    h2("style", null, styles + shipStyles),
    h2(
      "div",
      { className: "pw-shell" },
      h2(
        "header",
        { className: "pw-header" },
        h2("div", null, h2("div", { className: "pw-eyebrow" }, "Your agents, a world of their own"), h2("h1", null, "Pixel Worlds"), h2("p", { className: "pw-caption" }, "One live crew. Three places to make things happen.")),
        h2("div", { className: "pw-header-controls" }, h2("div", { className: "pw-mode", "aria-label": "Data source" }, h2(Action2, { "aria-pressed": mode === "live", onClick: () => changeMode("live") }, "Live agents"), h2(Action2, { "aria-pressed": mode === "demo", onClick: () => changeMode("demo") }, "Explore themes")))
      ),
      h2(RealmManager, { realmLibrary, realm, setTheme, openExternal }),
      h2(
        "div",
        { className: "pw-topline" },
        h2("div", { className: "pw-world-tabs", "aria-label": "World theme" }, themes.map((t) => h2(Action2, { key: t.id, "aria-pressed": theme === t.id, onClick: () => setTheme(t.id) }, h2("span", { className: "pw-theme-dot" }), t.title))),
        h2("div", { className: "pw-counters", "aria-label": "Agent counts" }, h2("span", null, h2("strong", null, stats.total), "crew"), h2("span", null, h2("strong", null, stats.active), "working"), h2("span", null, h2("strong", null, stats.attention), "attention"))
      ),
      h2(
        "div",
        { className: "pw-layout" },
        h2(
          "section",
          { "aria-label": "World and crew" },
          h2(
            "div",
            { className: "pw-world-card" },
            mode === "demo" ? h2("div", { className: "pw-banner", role: "status" }, h2("b", null, "Theme demonstration. "), "Illustrative agents and teamwork. Your live sessions are unchanged.") : h2("div", { className: "pw-banner", role: "status" }, h2("b", null, observing ? "Observed event streams \xB7 " : "Observation \xB7 "), `${agents.length} observed ${agents.length === 1 ? "agent" : "agents"}`, stats.unknown ? ` \xB7 ${stats.unknown} awaiting fresh evidence` : "", " \xB7 No commands run by scenery."),
            theme === "bridge" && !displayMode && h2(ShipControls, { ship, mode, agents, selectedId, onSelect }),
            h2("div", { className: "pw-scene" }, h2(Scene, { theme, realm, agents: theme === "bridge" ? agents : list.visible, selectedId, onSelect, reducedMotion: motion || systemReduced, paused, onMetrics, displayMode, ship, shipMode: mode }), !agents.length && h2("div", { className: "pw-empty" }, h2("b", null, "The room is ready."), displayMode ? "No observed agents. Exit display to explore illustrative themes." : "Agents appear as Hermes reports their sessions. Explore themes to meet an illustrative crew.")),
            h2("div", { className: "pw-world-caption" }, h2("span", null, h2("strong", null, world.title), " / ", world.subtitle || "A different world. The same real work."), h2("span", null, "Click a character to inspect"))
          ),
          h2(
            "div",
            { className: "pw-toolbar" },
            h2("div", { className: "pw-tools" }, h2(Action2, { "aria-pressed": paused, onClick: () => setPaused(!paused) }, paused ? "Resume animation" : "Pause animation"), h2(Action2, { "aria-pressed": motion || systemReduced, onClick: () => setMotion(!motion), disabled: systemReduced, title: systemReduced ? "Reduced motion follows your system preference" : "" }, "Reduced motion"), h2(Action2, { className: "pw-display-enter", onClick: () => setDisplayMode(true), title: "Scene-only view. Press Escape to return." }, "Display mode"), h2(Action2, { onClick: () => host2.navigate("/pw-agents") }, "PW Agents")),
            h2("span", null, theme === "bridge" ? `${list.visible.length} of ${list.total} in crew list` : list.total > 12 ? `Showing ${list.page * 12 + 1}\u2013${Math.min((list.page + 1) * 12, list.total)} of ${list.total}` : `${list.total} ${list.total === 1 ? "agent" : "agents"} in view`)
          ),
          h2(
            "section",
            { className: "pw-roster", "aria-label": "Accessible agent roster" },
            h2("div", { className: "pw-section-heading" }, h2("h2", null, "The crew"), h2("input", { className: "pw-search", type: "search", value: query, placeholder: "Find an agent\u2026", "aria-label": "Find an agent", onChange: (e) => {
              setQuery(e.target.value);
              setPage(0);
            } })),
            h2("div", { className: "pw-agent-grid" }, list.visible.map((a) => h2(Action2, { key: a.id, className: "pw-agent", "aria-pressed": selectedId === a.id, onClick: () => onSelect(a.id) }, h2("span", { className: "pw-avatar" }, h2(Mark, { status: attentionStatus(a) || a.status })), h2("span", { className: "pw-agent-copy" }, h2("span", { className: "pw-agent-name", title: a.storedSessionId || a.subagentId || a.sessionId || a.id }, a.name || a.profile || "Unnamed agent", (nameCounts.get(a.name || a.profile) || 0) > 1 ? ` \xB7 ${String(a.subagentId || a.storedSessionId || a.sessionId || a.id).slice(-8)}` : ""), h2("span", { className: "pw-agent-meta" }, attentionStatus(a) && a.status !== attentionStatus(a) ? "Earlier attention \xB7 " : "", (STATE[a.status] || STATE.unknown)[1], " \xB7 ", a.tool || a.activity || "observed"))))),
            !list.total && h2("p", { className: "pw-caption" }, query ? "No agents match this search." : "No observed sessions yet."),
            list.pages > 1 && h2("div", { className: "pw-toolbar" }, h2(Action2, { onClick: () => setPage(list.page - 1), disabled: list.page === 0 }, "Previous"), h2("span", null, `Page ${list.page + 1} of ${list.pages}`), h2(Action2, { onClick: () => setPage(list.page + 1), disabled: list.page === list.pages - 1 }, "Next"))
          )
        ),
        h2(
          "aside",
          { className: "pw-inspector", "aria-label": "Agent inspector" },
          h2(
            "section",
            null,
            h2("div", { className: "pw-inspector-title" }, h2("div", { className: "pw-eyebrow" }, "At a glance"), h2("h2", null, selected ? "Agent inspector" : "Meet your crew")),
            selected ? h2(
              React2.Fragment,
              null,
              h2("p", { className: "pw-selected-name" }, selected.name || selected.profile),
              h2("span", { className: "pw-status-pill" }, h2(Mark, { status: selected.status }), (STATE[selected.status] || STATE.unknown)[1]),
              h2("p", { className: "pw-detail" }, selected.detail || "State observed from the Hermes event stream."),
              selected.verified === false && h2("p", { className: "pw-explainer" }, "Historical observation; current activity is unverified."),
              mode === "live" && selectedSource?.observation === "observed-lease" && h2("p", { className: "pw-explainer" }, "Recent background events. Observation expires after 45 seconds of source silence; background socket health is not exposed."),
              mode === "live" && selected.attention && h2("div", { className: "pw-attention" }, h2("p", { className: "pw-explainer" }, `An earlier ${selected.attention === "error" ? "error" : "input request"} remains flagged. Check the actual session.`), h2(Action2, { onClick: () => runtime.acknowledge(selected.id), title: "Clears this local reminder only. It does not approve or answer a Hermes request." }, "Dismiss local reminder")),
              h2("dl", { className: "pw-facts" }, [["Activity", selected.activity || "Unknown"], ["Tool", selected.tool || "No current tool"], ["Session", selected.storedSessionId || selected.subagentId || selected.sessionId || "Unresolved"], ["Profile", selected.profile || "Unresolved"], ["Connection", selected.connectionId || "Unresolved"], ["Team", selected.parentId ? agents.find((a) => a.id === selected.parentId)?.name || "Linked parent task" : agents.some((a) => a.parentId === selected.id) ? "Coordinating linked tasks" : "Independent session"]].map(([label2, value]) => h2("div", { key: label2 }, h2("dt", null, label2), h2("dd", null, value)))),
              mode === "live" ? h2(React2.Fragment, null, h2(Action2, { className: "pw-primary", disabled: !target || opening || !host2.openSession, onClick: openSession }, opening ? "Opening\u2026" : "Open actual session \u2197"), !target && h2("p", { className: "pw-explainer" }, "Session navigation becomes available when Hermes supplies its durable ID and exact owner.")) : h2("div", { className: "pw-demo-actions", "aria-label": "Demonstration state controls" }, h2(Action2, { onClick: () => demoState("waiting") }, "Needs input"), h2(Action2, { onClick: () => demoState("error") }, "Error"), h2(Action2, { onClick: () => demoState("active") }, "Working"), h2(Action2, { onClick: () => demoState("done") }, "Complete"))
            ) : h2("p", { className: "pw-detail" }, "Select a character or an agent below the scene. Work, attention, tools, and real parent\u2013child relationships stay intact when you change worlds."),
            notice && h2("p", { className: "pw-notice", role: "alert" }, notice)
          ),
          h2("section", { className: "pw-native" }, h2("h2", null, "Connected to Hermes"), h2("p", null, "Open native controls. The world reflects the work; Hermes stays in charge of execution."), h2("div", { className: "pw-native-grid" }, [["Agents", "/agents"], ["Capabilities", "/skills"], ["MCP connections", "/skills?tab=mcp"], ["Schedules", "/cron"], ["Messaging", "/messaging"], ["Webhooks", "/webhooks"]].map(([title, path]) => h2(Action2, { key: path, onClick: () => host2.navigate(path) }, `${title} \u2197`)))),
          feed.length > 0 && h2("section", { className: "pw-feed" }, h2("h2", null, "Recent signals"), feed.map((e, i) => h2("div", { className: "pw-feed-row", key: e.id || i }, h2("time", null, new Date(e.at || e.timestamp || e.time || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })), h2("span", null, e.text || e.summary || e.type || "Activity observed"))))
        )
      ),
      h2("footer", { className: "pw-footer" }, h2("span", null, mode === "demo" ? "Demonstration is isolated from live telemetry." : "Source-qualified identities \xB7 No invented progress \xB7 Attention stays visible"), h2("span", null, "PD Pixel Worlds \xB7 Public alpha"))
    ),
    displayMode && h2(
      "div",
      { className: "pw-display-controls", "aria-label": "Display controls" },
      h2("div", { className: "pw-display-strip" }, h2(Action2, { className: "pw-display-exit", onClick: () => setDisplayMode(false), title: "Return to dashboard (Escape)" }, "Exit display"), h2("span", { className: "pw-display-status", role: "status" }, mode === "demo" ? "Demo \xB7 illustrative" : observing ? "Live \xB7 observed streams" : "Live source \xB7 not connected", ` \xB7 ${stageSummary}`, mode === "live" && stats.unknown ? ` \xB7 ${stats.unknown} unverified` : "", paused ? " \xB7 Paused" : "")),
      h2("div", { className: "pw-display-options" }, h2("label", null, h2("span", { className: "pw-display-label" }, "Theme"), h2("select", { className: "pw-display-theme", "aria-label": "Display theme", value: theme, onChange: (e) => setTheme(e.target.value) }, themes.map((t) => h2("option", { key: t.id, value: t.id }, t.title)))), h2(Action2, { "aria-pressed": paused, onClick: () => setPaused((p) => !p) }, paused ? "Resume animation" : "Pause animation"), h2("span", { className: "pw-display-hint" }, "Esc to return")),
      theme === "bridge" && h2(ShipControls, { ship, mode, agents, selectedId, onSelect, compact: true })
    )
  );
}
function PWAgents({ runtime, host: host2, realmLibrary, preferences, ship }) {
  const snapshot = useSyncExternalStore2(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  const { theme, setTheme, paused, setPaused, reducedMotion, themes, realm } = useWorldSettings(preferences, realmLibrary);
  const [mode, setMode] = useState2("live"), [page, setPage] = useState2(0), [localSelected, setSelected] = useState2(null);
  const shipState = useSyncExternalStore2(ship.subscribe, ship.getSnapshot, ship.getSnapshot);
  const selectedId = theme === "bridge" ? shipState.selectedIds[mode] : localSelected;
  const demo = useMemo(demonstration, []), systemReduced = useReducedMotion();
  const agents = (mode === "demo" ? demo : snapshot).agents || [];
  useEffect(() => {
    ship.sync(agents, mode);
  }, [ship, agents, mode]);
  const stats = counts(agents), list = useMemo(() => selectAgents(agents, { page }), [agents, page]);
  const observing = (snapshot.connections || []).some((c) => c.status === "open" || c.status === "observed");
  const onSelect = useMemo(() => (value) => {
    const id = value && typeof value === "object" ? value.id : value;
    setSelected(id);
    ship.select(id, mode);
    if (theme === "bridge" && id) ship.locate(id, mode);
  }, [ship, mode, theme]);
  function changeMode(value) {
    setMode(value);
    setPage(0);
    setSelected(null);
    ship.select(null, value);
  }
  const stageSummary = theme === "bridge" ? shipSummary(shipState, mode) : `${list.visible.length} on stage \xB7 ${agents.length - list.visible.length} off-stage`;
  return h2(
    "main",
    { className: "pw pw-agents", "data-mode": mode, "data-theme": theme },
    h2("style", null, styles + shipStyles),
    h2("div", { className: "pw-scene" }, h2(Scene, { theme, realm, agents: theme === "bridge" ? agents : list.visible, selectedId, onSelect, reducedMotion: reducedMotion || systemReduced, paused, displayMode: true, ship, shipMode: mode }), !agents.length && h2("div", { className: "pw-empty" }, h2("b", null, "The room is ready."), "No observed agents. Demo shows an illustrative crew.")),
    h2(
      "div",
      { className: "pw-agents-controls", "aria-label": "PW Agents controls" },
      h2("div", { className: "pw-display-strip" }, h2("strong", null, "PW Agents"), h2("span", { className: "pw-agents-status", role: "status" }, mode === "demo" ? "Demo \xB7 illustrative" : observing ? "Live \xB7 observed streams" : "Live source \xB7 not connected", ` \xB7 ${stageSummary}`, mode === "live" && stats.unknown ? ` \xB7 ${stats.unknown} unverified` : "", stats.attention ? ` \xB7 ${stats.attention} need attention` : "", paused ? " \xB7 Paused" : "")),
      h2("div", { className: "pw-agents-options" }, h2(Action2, { "aria-pressed": mode === "live", onClick: () => changeMode("live") }, "Live"), h2(Action2, { "aria-pressed": mode === "demo", onClick: () => changeMode("demo") }, "Demo"), h2("select", { className: "pw-display-theme", "aria-label": "Agents theme", value: theme, onChange: (e) => setTheme(e.target.value) }, themes.map((t) => h2("option", { key: t.id, value: t.id }, t.title))), h2(Action2, { "aria-pressed": paused, onClick: () => setPaused((p) => !p) }, paused ? "Resume animation" : "Pause animation"), h2(Action2, { onClick: () => host2.navigate("/pixel-worlds") }, "Return to Worlds")),
      theme === "bridge" && h2(ShipControls, { ship, mode, agents, selectedId, onSelect, compact: true }),
      theme !== "bridge" && list.pages > 1 && h2("div", { className: "pw-agents-pagination" }, h2(Action2, { onClick: () => setPage(list.page - 1), disabled: list.page === 0 }, "Previous"), h2("span", null, `Page ${list.page + 1} of ${list.pages}`), h2(Action2, { onClick: () => setPage(list.page + 1), disabled: list.page === list.pages - 1 }, "Next"))
    )
  );
}

// src/plugin.js
var h3 = React3.createElement;
function Chip({ runtime }) {
  const s = useSyncExternalStore3(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  const c = counts(s.agents);
  return h3(Button3, { type: "button", title: `Pixel Worlds \xB7 ${c.active} working \xB7 ${c.attention} need attention`, onClick: () => host.navigate("/pixel-worlds"), style: { fontSize: 10, padding: "0 6px", height: 22 } }, `\u25C7 Worlds ${c.active}${c.attention ? ` \xB7 ! ${c.attention}` : ""}`);
}
var plugin_default = {
  id: "pixel-worlds",
  name: "Pixel Worlds",
  description: "A live agent crew in Office Space, Kitten Caf\xE9, or a TNG bridge. Theme-independent Hermes telemetry.",
  register(ctx) {
    const runtime = createRuntime();
    if (typeof ctx.onDispose !== "function") throw new Error("Pixel Worlds needs the Desktop plugin cleanup API.");
    const stop = connectHermes(host, runtime);
    const realmLibrary = createRealmLibrary(ctx.storage), preferences = createWorldPreferences(ctx.storage), ship = createShip({ rooms: SHIP_ROOMS, storage: ctx.storage });
    const openExternal = (url) => ctx.os?.openExternal ? ctx.os.openExternal(url) : globalThis.open?.(url, "_blank", "noopener,noreferrer");
    const props = { runtime, storage: ctx.storage, host, realmLibrary, preferences, openExternal, ship };
    ctx.onDispose(() => {
      stop();
      ship.dispose();
      realmLibrary.dispose();
      preferences.dispose();
      runtime.destroy?.();
    });
    ctx.register({ id: "world-page", area: ROUTES_AREA, title: "Pixel Worlds", data: { path: "/pixel-worlds" }, render: () => h3(PixelWorlds, props) });
    ctx.register({ id: "agents-page", area: ROUTES_AREA, title: "PW Agents", data: { path: "/pw-agents" }, render: () => h3(PWAgents, props) });
    ctx.register({ id: "agents-nav", area: SIDEBAR_NAV_AREA, data: { path: "/pw-agents", label: "PW Agents", codicon: "organization" } });
    ctx.register({ id: "agents-open", area: PALETTE_AREA, data: { id: "pixel-worlds.agents", label: "PW Agents: Open daily agent view", keywords: ["agents", "pixel", "daily", "display"], run: () => host.navigate("/pw-agents") } });
    ctx.register({ id: "world-nav", area: SIDEBAR_NAV_AREA, data: { path: "/pixel-worlds", label: "Pixel Worlds", codicon: "globe" } });
    ctx.register({ id: "world-chip", area: STATUSBAR_AREAS.right, order: 109, render: () => h3(Chip, { runtime }) });
    ctx.register({ id: "world-open", area: PALETTE_AREA, data: { id: "pixel-worlds.open", label: "Pixel Worlds: Open live agent worlds", keywords: ["pixel", "office", "kitten", "cafe", "trek", "tng"], run: () => host.navigate("/pixel-worlds") } });
  }
};
export {
  plugin_default as default
};
