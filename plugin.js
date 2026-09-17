// src/plugin.js
import React2, { useSyncExternalStore as useSyncExternalStore2 } from "react";
import { host, Button as Button2, ROUTES_AREA, SIDEBAR_NAV_AREA, PALETTE_AREA, STATUSBAR_AREAS } from "@hermes/plugin-sdk";

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
import React, { useState, useEffect, useRef, useMemo, useSyncExternalStore } from "react";
import { Button } from "@hermes/plugin-sdk";

// src/art/pixels.js
var W = 480;
var H = 300;
function painter(c) {
  const rect = (x, y, w, h3, color) => {
    c.fillStyle = color;
    c.fillRect(Math.round(x), Math.round(y), Math.max(0, Math.round(w)), Math.max(0, Math.round(h3)));
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
  const text2 = (s, x, y, color = "#eee4ce", size = 6) => {
    c.fillStyle = color;
    c.font = `${size}px monospace`;
    c.textBaseline = "top";
    c.fillText(s, Math.round(x), Math.round(y));
  };
  return { c, rect, line, poly, oval, text: text2 };
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
    const h3 = 9 + i * 3 % 6;
    p.rect(x + i * 5, y - h3, 4, h3, colors[i % 5]);
    p.rect(x + i * 5, y - h3 + 2, 4, 1, "#ecd6a2");
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

// src/art/bridge-scene.js
var BRIDGE_ANCHORS = [[240, 195], [161, 248], [319, 248], [196, 199], [284, 199], [240, 145], [184, 147], [296, 147], [67, 191], [413, 191], [77, 254], [403, 254]];
var C = { wall: "#9f8e77", light: "#dfcfac", seam: "#6d6255", floor: "#697674", rose: "#916863", wood: "#81523b", black: "#191e23" };
function panel(p, x, y, w, h3, skew = 0, seed = 1) {
  const random = rng(seed), { poly: q } = p;
  const box = (a, b, c, d, color) => q([[x + a, y + b + a * skew], [x + a + c, y + b + (a + c) * skew], [x + a + c, y + b + d + (a + c) * skew], [x + a, y + b + d + a * skew]], color);
  box(0, 0, w, h3, C.black);
  box(2, 2, w - 4, 1, "#536058");
  const colors = ["#e4c894", "#b0a1c4", "#cd9179", "#8fb3b0", "#e6d3ab"];
  const cols = Math.max(2, Math.floor(w / 32)), cw = (w - 6) / cols;
  for (let n = 0; n < cols; n++) {
    const a = 3 + n * cw;
    box(a, 4, cw - 3, 2, colors[n % 5]);
    box(a, 8, 3, h3 - 13, colors[(n + 2) % 5]);
    box(a + 4, h3 - 7, cw - 7, 2, "#b4c2a4");
    for (let j = 0; j < 5; j++) {
      const yy = 9 + j * (h3 - 18) / 5;
      box(a + 6, yy, 3 + random() * Math.max(3, cw - 14), 1, colors[(j + n) % 5]);
      box(a + cw - 5, yy, 2, 1, "#90a0aa");
    }
    if (n % 2 === 0) {
      box(a + cw / 2, 11, 1, h3 - 21, "#6d878a");
      box(a + cw / 2 - 3, 16, 7, 1, "#ccaa78");
    }
  }
}
function chair(p, x, y, s = 1) {
  const { rect: r, poly: q, oval: o } = p;
  const P = (pts, c) => q(pts.map(([a, b]) => [x + a * s, y + b * s]), c), R = (a, b, w, h3, c) => r(x + a * s, y + b * s, w * s, h3 * s, c);
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
  q([[0, 98], [98, 85], [98, 149], [0, 183]], "#cab591");
  q([[4, 101], [95, 89], [95, 138], [4, 167]], "#655e50");
  panel(p, 8, 111, 83, 38, -0.22, 4);
  q([[480, 98], [382, 85], [382, 149], [480, 183]], "#cab591");
  q([[476, 101], [385, 89], [385, 138], [476, 167]], "#655e50");
  panel(p, 389, 93, 83, 38, 0.22, 6);
  q([[3, 161], [94, 139], [97, 148], [6, 174]], "#c8b18e");
  q([[477, 161], [386, 139], [383, 148], [474, 174]], "#c8b18e");
  q([[8, 174], [92, 151], [89, 174], [16, 206]], "#9b866b");
  q([[472, 174], [388, 151], [391, 174], [464, 206]], "#9b866b");
  q([[15, 183], [87, 160], [86, 171], [23, 198]], "#d4eee5");
  q([[465, 183], [393, 160], [394, 171], [457, 198]], "#d4eee5");
  o(240, 193, 116, 38, "#414847");
  o(240, 188, 116, 37, "#b49079");
  o(240, 186, 112, 34, "#755954");
  q([[137, 180], [143, 198], [176, 214], [209, 220], [272, 220], [305, 214], [337, 198], [343, 180], [341, 200], [307, 218], [272, 225], [208, 225], [173, 219], [139, 202]], "#b59780");
  l(160, 209, 187, 217, "#d0dfcc");
  l(191, 218, 288, 218, "#c7d6c4");
  l(293, 217, 320, 209, "#d0dfcc");
  o(240, 181, 107, 34, C.rose);
  q([[145, 145], [335, 145], [345, 180], [135, 180]], C.rose);
  o(240, 200, 70, 13, "#737b73");
  chair(p, 196, 194, 0.9);
  chair(p, 240, 190, 1);
  chair(p, 284, 194, 0.9);
  for (const x of [163, 306]) {
    q([[x, 177], [x + 12, 179], [x + 18, 201], [x + 2, 202]], "#b69c80");
    q([[x - 2, 171], [x + 10, 169], [x + 15, 179], [x, 181]], "#d0b391");
    r(x + 1, 172, 8, 3, "#34353a");
    r(x + 2, 173, 5, 1, "#dbb590");
  }
  chair(p, 161, 266, 1.14);
  chair(p, 319, 266, 1.14);
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
  q([[220, 146], [260, 146], [250, 160], [247, 176], [232, 176], [229, 160]], "#c4b294");
  for (let i = 1; i < arc.length; i++) {
    const [x, y] = arc[i - 1], [xx, yy] = arc[i];
    q([[x, y], [xx, yy], [xx, yy + 5], [x, y + 5]], "#674333");
    l(x, y, xx, yy, "#b1855b", 2);
    l(x, y + 2, xx, yy + 2, "#916144", 2);
  }
}
function drawBridgeHelm(ctx) {
  const p = painter(ctx), { rect: r, poly: q, line: l, oval: o } = p;
  for (const center of [161, 319]) {
    const x = center - 49;
    o(center, 284, 51, 7, "#34413f60");
    q([[x + 6, 247], [x + 94, 247], [x + 84, 282], [x + 14, 282]], "#6d6252");
    q([[x + 10, 250], [x + 91, 250], [x + 80, 279], [x + 16, 279]], "#b3a180");
    q([[x + 12, 253], [x + 39, 253], [x + 37, 273], [x + 30, 279], [x + 18, 277]], "#d6f2e8");
    q([[x + 20, 281], [x + 80, 281], [x + 89, 285], [x + 15, 285]], "#50534a");
    q([[x + 6, 232], [x + 90, 232], [x + 103, 248], [x - 5, 248]], "#cfb791");
    q([[x + 7, 233], [x + 88, 233], [x + 95, 240], [x + 1, 240]], "#4b4540");
    panel(p, x + 12, 234, 72, 5, 0, center);
    q([[x - 5, 241], [x + 100, 241], [x + 103, 248], [x + 98, 254], [x - 4, 254], [x - 8, 249]], "#bba17e");
    l(x - 4, 242, x + 98, 242, "#e2cdaa", 2);
    l(x - 3, 254, x + 97, 254, "#7a6956");
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
  [[262, 35, 11, 14], [279, 34, 10, 10], [276, 47, 12, 10]].forEach(([x, y, w, h3], i) => {
    r(x, y, w, h3, i % 2 ? "#e6ce8b" : "#eee3c9");
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
  function rug(x, y, w, h3) {
    r(x, y, w, h3, "#ad7760");
    r(x + 3, y + 2, w - 6, h3 - 4, "#d4b27f");
    r(x + 6, y + 4, w - 12, h3 - 8, "#ab8668");
    for (let xx = x + 10; xx < x + w - 10; xx += 10) r(xx, y + 6, 3, h3 - 12, "#b7936e");
    for (let xx = x + 3; xx < x + w - 2; xx += 4) {
      r(xx, y - 2, 1, 2, "#edc894");
      r(xx, y + h3, 1, 2, "#edc894");
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

// src/art/characters.js
var SKINS = [["#e8b58a", "#c58d6b", "#f5caa0"], ["#ba8768", "#8b5d49", "#d4a27d"], ["#91684f", "#654637", "#b38a68"], ["#e2c6a0", "#b8a180", "#f2d6af"]];
var HAIR = ["#574030", "#332e2e", "#815437", "#b58e54", "#655951", "#342e36"];
var SHIRTS = [["#d9d2ac", "#b2ae94"], ["#9dacb3", "#75898e"], ["#b6c0a3", "#879778"], ["#cfb0a0", "#b18c80"], ["#d8d0bb", "#aea791"], ["#a5a0b5", "#817d93"]];
var FURS = [["#d8a268", "#a97747", "#f7dfb2"], ["#666266", "#45434c", "#ddd6bf"], ["#e4d3b5", "#b5a38e", "#fff0d1"], ["#ad8270", "#765549", "#eedbc0"], ["#858f92", "#5a666f", "#c8d1c5"], ["#555451", "#383d40", "#f1e4c6"]];
var STATUS = { active: { color: "#90bb94", glyph: "\u203A" }, waiting: { color: "#ebc37f", glyph: "?" }, error: { color: "#e48e7a", glyph: "!" }, done: { color: "#afd0ba", glyph: "\u2713" }, idle: { color: "#c6bba3", glyph: "\xB7" }, unknown: { color: "#b8adcb", glyph: "\u2013" } };
function identity(id) {
  return Array.from(String(id)).reduce((n, c, i) => n + c.codePointAt(0) * (i + 1), 0);
}
function human(p, x, y, agent, theme, t, team, walk, teamIndex = 0, seated = false) {
  const n = Number.isSafeInteger(agent.slot) && agent.slot >= 0 ? agent.slot : identity(agent.id), skin = SKINS[n % SKINS.length], hair = HAIR[n % HAIR.length];
  const isCrew = theme === "bridge";
  const shirt = isCrew ? [["#b9575d", "#833d49"], ["#c9a15c", "#9a7947"], ["#639797", "#487373"]][n % 3] : SHIRTS[n % 6];
  const { rect: r, poly: q, line: l, oval: o } = p;
  const phase = t * 3.6 + n % 11, step = walk ? Math.sin(phase * 2) : 0, bob = walk ? Math.round(Math.abs(step)) : 0;
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
  const glance = t === 0 ? 0 : wait ? Math.round(Math.sin(t * 0.65 + n)) : error ? Math.round(Math.sin(t * 0.85 + n)) : 0;
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
  if (error) {
    r(x - 4, y - 32, 3, 1, hair);
    r(x + 2, y - 33, 3, 1, hair);
  }
  p.c.restore();
  const tap = active ? Math.round(Math.sin(phase * 2) * 1.5) : 0;
  if (team) {
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
    ctx.save();
    if (team && x > 391) {
      ctx.translate(x * 2, 0);
      ctx.scale(-1, 1);
    }
    human(p, x, y, agent, theme, time, team && item.atStation, walking, item.teamIndex, theme === "bridge" && item.index < 5 && !walking);
    ctx.restore();
  }
}
function drawBadge(ctx, item, theme, selected) {
  const p = painter(ctx), status = item.agent.attention || item.agent.status, s = STATUS[status] || STATUS.unknown, x = item.x, y = item.y;
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
  Object.freeze({ id: "bridge", title: "The Next Generation", subtitle: "A quieter kind of final frontier", accent: "#bda2ab", description: "An Enterprise-D\u2013inspired bridge: warm beige structure, rose carpet, wooden horseshoe and pastel LCARS." })
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
} } = {}) {
  if (!canvas?.getContext) throw new TypeError("createWorld requires a canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
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
  let state = { theme: "office", agents: [], selectedId: null, reducedMotion: false, paused: false };
  let width = 960, height = 600, dpr = 1, scale = 2, offsetX = 0, offsetY = 0, visible = true, destroyed = false;
  let frameId = null, lastFrame = -Infinity, lastTick = null, time = 0, regions = [], items = [], teamwork = null, backgroundBuilds = 0;
  let drawCount = 0, frameMs = 0, fps = 0, measureStart = 0, measureFrames = 0, lastNotify = -Infinity;
  const now = () => host2.performance?.now?.() ?? Date.now();
  const isVisible = () => visible && !doc?.hidden;
  const animate = () => !destroyed && isVisible() && !state.paused && !state.reducedMotion;
  const report = () => ({ theme: state.theme, total: state.agents.length, visible: items.length, overflow: Math.max(0, state.agents.length - items.length), capacity: CAPACITY, visibleCount: items.length, totalCount: state.agents.length, overflowCount: Math.max(0, state.agents.length - items.length), fps, frameMs, renderMs: frameMs, frames: drawCount, backgroundBuilds, paused: state.paused, reducedMotion: state.reducedMotion, hidden: !isVisible(), teamwork: teamwork ? { ...teamwork, participants: [...teamwork.participants] } : null });
  const notify = () => {
    if (!destroyed) onMetrics(report());
  };
  function background() {
    if (!backgrounds.has(state.theme)) {
      const surface = makeSurface();
      drawBackground(surface.getContext("2d"), state.theme);
      backgrounds.set(state.theme, surface);
      backgroundBuilds++;
    }
    return backgrounds.get(state.theme);
  }
  function bridgeLayer(name, draw) {
    const key2 = `bridge:${name}`;
    if (!backgrounds.has(key2)) {
      const surface = makeSurface();
      draw(surface.getContext("2d"));
      backgrounds.set(key2, surface);
    }
    sc.drawImage(backgrounds.get(key2), 0, 0);
  }
  function setItems(themeChanged = false) {
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
      const target = team ? YARD[teamIndex] : ANCHORS[state.theme][index];
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
    move(dt);
    sc.imageSmoothingEnabled = false;
    sc.clearRect(0, 0, W, H);
    sc.drawImage(background(), 0, 0);
    const sorted = [...items].sort((a, b) => a.y - b.y || a.index - b.index);
    const t = state.reducedMotion ? 0 : time;
    let railPainted = false;
    for (const item of sorted) {
      if (state.theme === "bridge" && item.y >= 160 && !railPainted) {
        bridgeLayer("rail", drawBridgeRail);
        railPainted = true;
      }
      drawAgent(sc, item, state.theme, t, item.agent.id === state.selectedId);
    }
    if (state.theme === "bridge") {
      if (!railPainted) bridgeLayer("rail", drawBridgeRail);
      bridgeLayer("helm", drawBridgeHelm);
    }
    for (const item of sorted) drawBadge(sc, item, state.theme, item.agent.id === state.selectedId);
    if (teamwork) {
      const p = painter(sc);
      p.rect(350, 93, 108, 13, "#65553ddd");
      p.text("LINKED TEAM WORK", 356, 97, "#ffebc0", 6);
    }
    if (state.agents.length > CAPACITY) {
      const p = painter(sc), s = `${items.length} IN SCENE \xB7 ${state.agents.length - items.length} IN LIST`;
      p.rect(151, 286, 181, 12, "#303c38");
      p.text(s, 160, 289, "#eee4c9", 6);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#252a29";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(scene, offsetX, offsetY, W * scale, H * scale);
    regions = sorted.map((item) => ({ id: item.agent.id, x: offsetX + (item.x - (state.theme === "cafe" ? 25 : 18)) * scale, y: offsetY + (item.y - 42) * scale, width: (state.theme === "cafe" ? 53 : 40) * scale, height: 49 * scale, worldX: item.x * 2, worldY: item.y * 2, team: item.team }));
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
    const before = state.theme, beforeSelection = state.selectedId;
    if (Object.hasOwn(patch, "theme")) {
      const id = typeof patch.theme === "object" ? patch.theme?.id : patch.theme;
      state.theme = THEMES.some((t) => t.id === id) ? id : state.theme;
    }
    if (Object.hasOwn(patch, "agents")) {
      const seen = /* @__PURE__ */ new Set();
      state.agents = (Array.isArray(patch.agents) ? patch.agents : []).filter((a) => a && a.id !== void 0 && a.id !== null && !seen.has(a.id) && seen.add(a.id)).map((a) => ({ ...a }));
    }
    for (const key2 of ["selectedId", "reducedMotion", "paused"]) if (Object.hasOwn(patch, key2)) state[key2] = key2 === "selectedId" ? patch[key2] : Boolean(patch[key2]);
    if (Object.hasOwn(patch, "visible")) visible = Boolean(patch.visible);
    setItems(before !== state.theme);
    if (!request || !animate() || frameId === null || before !== state.theme || beforeSelection !== state.selectedId) render();
    sync();
    notify();
  }
  function resize(w, h3, pixelRatio = host2.devicePixelRatio || 1) {
    if (destroyed) return;
    width = Math.max(1, Number(w) || 960);
    height = Math.max(1, Number(h3) || 600);
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
  function select(event) {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const id = hitTest((event.clientX - r.left) * width / r.width, (event.clientY - r.top) * height / r.height);
    if (id !== null) onSelect(id);
  }
  function hover(event) {
    if (!canvas.style) return;
    const r = canvas.getBoundingClientRect();
    canvas.style.cursor = hitTest((event.clientX - r.left) * width / (r.width || 1), (event.clientY - r.top) * height / (r.height || 1)) === null ? "default" : "pointer";
  }
  function visibilityChanged() {
    if (isVisible()) render();
    sync();
    notify();
  }
  function setVisible(value) {
    if (destroyed) return;
    visible = Boolean(value);
    visibilityChanged();
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (frameId !== null && cancel) cancel(frameId);
    frameId = null;
    canvas.removeEventListener("pointerdown", select);
    canvas.removeEventListener("pointermove", hover);
    doc?.removeEventListener?.("visibilitychange", visibilityChanged);
    backgrounds.clear();
    positions.clear();
    regions = [];
    items = [];
    scene.width = 1;
    scene.height = 1;
  }
  canvas.addEventListener("pointerdown", select);
  canvas.addEventListener("pointermove", hover);
  doc?.addEventListener?.("visibilitychange", visibilityChanged);
  resize(canvas.clientWidth || 960, canvas.clientHeight || 600, host2.devicePixelRatio || 1);
  sync();
  return { update, resize, setVisible, destroy, hitTest, getMetrics: report, getAgentRegions: () => regions.map((r) => ({ ...r })), render: () => render(), get capacity() {
    return CAPACITY;
  } };
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
function themePreference(value, themes) {
  return themes.some((t) => t.id === value) ? value : themes[0]?.id;
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
.pw{--pw-ink:var(--ui-text-primary,var(--foreground,#e8e7e4));--pw-muted:var(--ui-text-secondary,var(--muted-foreground,#a9aaa7));--pw-line:var(--ui-stroke-secondary,var(--border,#ffffff20));--pw-panel:var(--ui-bg-secondary,var(--card,#191b1d));--pw-accent:var(--ui-accent,var(--accent,#b9d9c6));color:var(--pw-ink);font:inherit;min-height:100%;height:100%;overflow:auto;container-type:inline-size;box-sizing:border-box}
.pw *{box-sizing:border-box}.pw button,.pw input,.pw select{font:inherit}.pw button{cursor:pointer}.pw button:disabled{cursor:default;opacity:.4}.pw button:focus-visible,.pw input:focus-visible{outline:2px solid var(--pw-accent);outline-offset:3px}.pw button{color:inherit;background:transparent;border:1px solid var(--pw-line);border-radius:6px;padding:7px 11px;line-height:1.3}.pw button:hover:not(:disabled){background:color-mix(in srgb,var(--pw-ink) 7%,transparent)}.pw button[aria-pressed=true]{border-color:var(--pw-accent);background:color-mix(in srgb,var(--pw-accent) 10%,transparent)}
.pw-shell{max-width:1800px;padding:24px 28px 18px;margin:auto}.pw-header{display:flex;align-items:flex-start;gap:20px;justify-content:space-between;margin-bottom:23px}.pw-eyebrow{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--pw-muted);margin-bottom:7px}.pw h1{font:inherit;font-size:28px;line-height:1.1;font-weight:550;letter-spacing:-.045em;margin:0}.pw-caption{font-size:12px;line-height:1.55;color:var(--pw-muted);margin:8px 0 0}.pw-header-controls{display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end;font-size:11px}.pw-mode{display:flex;border:1px solid var(--pw-line);padding:3px;border-radius:8px;gap:3px}.pw-mode button{border:0}.pw-topline{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px}.pw-world-tabs{display:flex;gap:6px;flex-wrap:wrap}.pw-world-tabs button{display:flex;align-items:center;gap:8px;padding:10px 14px;font-size:12px}.pw-theme-dot{width:8px;height:8px;border-radius:2px}.pw-counters{display:flex;gap:16px;font-size:11px;color:var(--pw-muted);white-space:nowrap}.pw-counters strong{font-weight:600;color:var(--pw-ink);margin-right:4px;font-variant-numeric:tabular-nums}.pw-layout{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:16px;align-items:start}.pw-layout>section{min-width:0}.pw-world-card{border:1px solid var(--pw-line);border-radius:10px;overflow:hidden;position:relative}.pw-scene{width:100%;height:clamp(330px,43vw,660px);position:relative;overflow:auto;background:#1d2526}.pw-scene-inner{width:100%;height:100%;min-width:580px;position:relative}.pw-scene canvas{width:100%;height:100%;display:block;image-rendering:pixelated;cursor:pointer}.pw-world-caption{display:flex;justify-content:space-between;gap:10px;padding:12px 15px;border-top:1px solid var(--pw-line);font-size:11px;color:var(--pw-muted)}.pw-world-caption strong{color:var(--pw-ink);font-weight:500}.pw-world-caption span:last-child{text-align:right}.pw-banner{padding:9px 14px;border-bottom:1px solid var(--pw-line);font-size:11px;line-height:1.5;background:color-mix(in srgb,var(--pw-accent) 8%,transparent)}.pw-banner b{font-weight:600}.pw-empty{position:absolute;bottom:16px;left:18px;right:18px;max-width:410px;background:#142022e8;border:1px solid #ffffff25;color:#eee9dc;padding:12px 15px;font-size:12px;line-height:1.55;border-radius:6px;pointer-events:none}.pw-empty b{display:block}.pw-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 0;font-size:11px;color:var(--pw-muted)}.pw-tools{display:flex;gap:6px;flex-wrap:wrap}.pw-tools button{padding:5px 8px}.pw-roster{border-top:1px solid var(--pw-line);margin-top:2px;padding-top:16px}.pw-section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:11px}.pw-section-heading h2,.pw-inspector h2{font:inherit;font-size:12px;font-weight:600;margin:0}.pw-search{border:1px solid var(--pw-line);border-radius:5px;background:transparent;color:var(--pw-ink);font-size:11px!important;padding:6px 9px;width:175px}.pw-agent-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(164px,1fr));gap:7px}.pw-agent{display:flex;align-items:center;text-align:left;gap:10px;padding:10px!important;min-width:0}.pw-avatar{width:29px;height:32px;flex:none;image-rendering:pixelated;display:grid;place-items:center;font-size:14px;background:color-mix(in srgb,var(--pw-accent) 8%,transparent);border-radius:4px}.pw-agent-name{display:block;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pw-agent-meta{display:block;font-size:10px;color:var(--pw-muted);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pw-agent-copy{min-width:0}.pw-mark{font-size:12px;line-height:1}.pw-inspector{border:1px solid var(--pw-line);border-radius:9px;padding:17px;min-width:0}.pw-inspector-title{margin-bottom:16px}.pw-selected-name{font-size:20px;letter-spacing:-.035em;margin:0 0 6px;overflow-wrap:anywhere}.pw-status-pill{display:inline-flex;align-items:center;gap:6px;font-size:11px;border:1px solid var(--pw-line);border-radius:4px;padding:4px 7px}.pw-detail{font-size:12px;line-height:1.6;color:var(--pw-muted);overflow-wrap:anywhere;margin:14px 0}.pw-facts{display:grid;grid-template-columns:1fr;gap:11px;margin:17px 0}.pw-facts dt{font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--pw-muted);margin-bottom:3px}.pw-facts dd{font-size:11px;margin:0;overflow-wrap:anywhere}.pw-primary{width:100%;margin-top:5px;background:color-mix(in srgb,var(--pw-accent) 12%,transparent)!important}.pw-explainer{font-size:10px;color:var(--pw-muted);line-height:1.6;margin:9px 0 0}.pw-native{margin-top:16px;border-top:1px solid var(--pw-line);padding-top:16px}.pw-native-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px}.pw-native button{font-size:10px;padding:8px 5px}.pw-native p{font-size:10px;line-height:1.6;color:var(--pw-muted)}.pw-demo-actions{display:flex;flex-wrap:wrap;gap:5px;margin-top:15px}.pw-demo-actions button{font-size:10px;padding:6px 8px}.pw-feed{margin-top:20px}.pw-feed h2{font-size:11px;font-weight:600;margin:0 0 10px}.pw-feed-row{font-size:10px;display:flex;gap:8px;line-height:1.6;color:var(--pw-muted);margin-bottom:7px;overflow-wrap:anywhere}.pw-feed-row time{flex:none;font-variant-numeric:tabular-nums;opacity:.75}.pw-footer{margin-top:20px;display:flex;justify-content:space-between;font-size:10px;color:var(--pw-muted);border-top:1px solid var(--pw-line);padding-top:13px;gap:15px}.pw-notice{font-size:11px;padding:10px 0;color:var(--pw-muted)}
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
.pw-display-strip{display:flex;align-items:center;gap:10px;padding:5px 10px 5px 5px;border:1px solid var(--pw-line);border-radius:9px;background:color-mix(in srgb,var(--pw-panel) 94%,transparent);box-shadow:0 3px 16px #0002}
.pw-display-status{line-height:1.5;font-variant-numeric:tabular-nums;color:var(--pw-muted)}
.pw .pw-display-exit{white-space:nowrap;font-size:11px;padding:6px 9px;flex-shrink:0}
.pw-display-options{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:5px;padding:8px;border:1px solid var(--pw-line);border-radius:9px;background:var(--pw-panel);opacity:0;pointer-events:none;transform:translateY(-3px);transition:opacity .18s ease,transform .18s ease}
.pw-display-controls:hover .pw-display-options,.pw-display-controls:focus-within .pw-display-options{opacity:1;pointer-events:auto;transform:translateY(0)}
.pw-display-options label{display:flex;align-items:center;gap:7px;min-width:0}
.pw-display-label,.pw-display-hint{color:var(--pw-muted);font-size:10px}
.pw .pw-display-theme{min-width:0;max-width:190px;color:var(--pw-ink);background:var(--pw-panel);border:1px solid var(--pw-line);border-radius:6px;padding:6px;font-size:11px}
.pw .pw-display-theme:focus-visible{outline:2px solid var(--pw-accent);outline-offset:2px}
.pw-display-options button{font-size:11px}
@media(hover:none){.pw-display-options{opacity:1;pointer-events:auto;transform:none}}
@media(prefers-reduced-motion:reduce){.pw *{scroll-behavior:auto!important;transition:none!important}}
`;

// src/app.js
var h = React.createElement;
var STATE = { active: ["\u25C6", "Working"], waiting: ["!", "Needs input"], error: ["\xD7", "Needs attention"], done: ["\u2713", "Turn complete"], idle: ["\u25CB", "Idle"], queued: ["\u25C7", "Queued"], unknown: ["?", "Unverified"] };
var COLORS = ["#bba27c", "#c58f72", "#b3a4c7"];
function Action({ children, ...props }) {
  return h(Button, { type: "button", ...props }, children);
}
function Mark({ status }) {
  return h("span", { className: "pw-mark", "aria-hidden": true }, (STATE[status] || STATE.unknown)[0]);
}
function useReducedMotion() {
  const [reduced, set] = useState(() => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => set(m.matches);
    m.addEventListener("change", change);
    return () => m.removeEventListener("change", change);
  }, []);
  return reduced;
}
function Scene({ theme, agents, selectedId, onSelect, reducedMotion, paused, onMetrics, displayMode }) {
  const canvas = useRef(null), container = useRef(null), renderer = useRef(null), latest = useRef(null), visible = useRef(true);
  latest.current = { theme, agents, selectedId, reducedMotion, paused };
  useEffect(() => {
    visible.current = true;
    const world = createWorld(canvas.current, { onSelect, onMetrics });
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
  }, [onSelect, onMetrics]);
  useEffect(() => {
    renderer.current?.update({ ...latest.current, paused: paused || !visible.current || document.hidden });
  }, [theme, agents, selectedId, reducedMotion, paused]);
  return h("div", { className: "pw-scene-inner", ref: container }, h("canvas", { ref: canvas, role: "img", "aria-label": `${THEMES.find((t) => t.id === theme)?.title || theme} world. ${agents.length} agents on stage. ${displayMode ? "Exit display for the accessible agent roster." : "Select agents using the accessible list below."}` }));
}
function PixelWorlds({ runtime, storage, host: host2 }) {
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  const [theme, setTheme] = useState(() => themePreference(storage.get("theme"), THEMES));
  const [mode, setMode] = useState("live");
  const [demo, setDemo] = useState(demonstration);
  const [selectedId, setSelected] = useState(null);
  const [paused, setPaused] = useState(() => storage.get("paused") === true);
  const [displayMode, setDisplayMode] = useState(() => {
    try {
      return storage.get("displayMode") === true;
    } catch {
      return false;
    }
  });
  const root = useRef(null), wasDisplay = useRef(false);
  const [motion, setMotion] = useState(() => storage.get("reducedMotion") === true);
  const [page, setPage] = useState(0), [query, setQuery] = useState("");
  const [routes, setRoutes] = useState([]), [notice, setNotice] = useState(""), [opening, setOpening] = useState(false);
  const metrics = useRef(null);
  const systemReduced = useReducedMotion();
  const data = mode === "demo" ? demo : snapshot;
  const agents = data.agents || [];
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
  const world = THEMES.find((t) => t.id === theme) || THEMES[0];
  const target = selected ? sessionTarget(selected, routes) : null;
  const onSelect = useMemo(() => (id) => setSelected(typeof id === "object" ? id.id : id), []);
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
    storage.set("theme", theme);
  }, [theme, storage]);
  useEffect(() => {
    storage.set("paused", paused);
  }, [paused, storage]);
  useEffect(() => {
    storage.set("reducedMotion", motion);
  }, [motion, storage]);
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
  return h(
    "main",
    { ref: root, className: "pw", "data-mode": mode, "data-theme": theme, "data-display": String(displayMode) },
    h("style", null, styles),
    h(
      "div",
      { className: "pw-shell" },
      h(
        "header",
        { className: "pw-header" },
        h("div", null, h("div", { className: "pw-eyebrow" }, "Your agents, a world of their own"), h("h1", null, "Pixel Worlds"), h("p", { className: "pw-caption" }, "One live crew. Three places to make things happen.")),
        h("div", { className: "pw-header-controls" }, h("div", { className: "pw-mode", "aria-label": "Data source" }, h(Action, { "aria-pressed": mode === "live", onClick: () => changeMode("live") }, "Live agents"), h(Action, { "aria-pressed": mode === "demo", onClick: () => changeMode("demo") }, "Explore themes")))
      ),
      h(
        "div",
        { className: "pw-topline" },
        h("div", { className: "pw-world-tabs", "aria-label": "World theme" }, THEMES.map((t, i) => h(Action, { key: t.id, "aria-pressed": theme === t.id, onClick: () => setTheme(t.id) }, h("span", { className: "pw-theme-dot", style: { background: COLORS[i] } }), t.title))),
        h("div", { className: "pw-counters", "aria-label": "Agent counts" }, h("span", null, h("strong", null, stats.total), "crew"), h("span", null, h("strong", null, stats.active), "working"), h("span", null, h("strong", null, stats.attention), "attention"))
      ),
      h(
        "div",
        { className: "pw-layout" },
        h(
          "section",
          { "aria-label": "World and crew" },
          h(
            "div",
            { className: "pw-world-card" },
            mode === "demo" ? h("div", { className: "pw-banner", role: "status" }, h("b", null, "Theme demonstration. "), "Illustrative agents and teamwork. Your live sessions are unchanged.") : h("div", { className: "pw-banner", role: "status" }, h("b", null, observing ? "Observed event streams \xB7 " : "Observation \xB7 "), `${agents.length} observed ${agents.length === 1 ? "agent" : "agents"}`, stats.unknown ? ` \xB7 ${stats.unknown} awaiting fresh evidence` : "", " \xB7 No commands run by scenery."),
            h("div", { className: "pw-scene" }, h(Scene, { theme, agents: list.visible, selectedId, onSelect, reducedMotion: motion || systemReduced, paused, onMetrics, displayMode }), !agents.length && h("div", { className: "pw-empty" }, h("b", null, "The room is ready."), displayMode ? "No observed agents. Exit display to explore illustrative themes." : "Agents appear as Hermes reports their sessions. Explore themes to meet an illustrative crew.")),
            h("div", { className: "pw-world-caption" }, h("span", null, h("strong", null, world.title), " / ", world.subtitle || "A different world. The same real work."), h("span", null, "Click a character to inspect"))
          ),
          h(
            "div",
            { className: "pw-toolbar" },
            h("div", { className: "pw-tools" }, h(Action, { "aria-pressed": paused, onClick: () => setPaused(!paused) }, paused ? "Resume animation" : "Pause animation"), h(Action, { "aria-pressed": motion || systemReduced, onClick: () => setMotion(!motion), disabled: systemReduced, title: systemReduced ? "Reduced motion follows your system preference" : "" }, "Reduced motion"), h(Action, { className: "pw-display-enter", onClick: () => setDisplayMode(true), title: "Scene-only view. Press Escape to return." }, "Display mode")),
            h("span", null, list.total > 12 ? `Showing ${list.page * 12 + 1}\u2013${Math.min((list.page + 1) * 12, list.total)} of ${list.total}` : `${list.total} ${list.total === 1 ? "agent" : "agents"} in view`)
          ),
          h(
            "section",
            { className: "pw-roster", "aria-label": "Accessible agent roster" },
            h("div", { className: "pw-section-heading" }, h("h2", null, "The crew"), h("input", { className: "pw-search", type: "search", value: query, placeholder: "Find an agent\u2026", "aria-label": "Find an agent", onChange: (e) => {
              setQuery(e.target.value);
              setPage(0);
            } })),
            h("div", { className: "pw-agent-grid" }, list.visible.map((a) => h(Action, { key: a.id, className: "pw-agent", "aria-pressed": selectedId === a.id, onClick: () => onSelect(a.id) }, h("span", { className: "pw-avatar" }, h(Mark, { status: attentionStatus(a) || a.status })), h("span", { className: "pw-agent-copy" }, h("span", { className: "pw-agent-name", title: a.storedSessionId || a.subagentId || a.sessionId || a.id }, a.name || a.profile || "Unnamed agent", (nameCounts.get(a.name || a.profile) || 0) > 1 ? ` \xB7 ${String(a.subagentId || a.storedSessionId || a.sessionId || a.id).slice(-8)}` : ""), h("span", { className: "pw-agent-meta" }, attentionStatus(a) && a.status !== attentionStatus(a) ? "Earlier attention \xB7 " : "", (STATE[a.status] || STATE.unknown)[1], " \xB7 ", a.tool || a.activity || "observed"))))),
            !list.total && h("p", { className: "pw-caption" }, query ? "No agents match this search." : "No observed sessions yet."),
            list.pages > 1 && h("div", { className: "pw-toolbar" }, h(Action, { onClick: () => setPage(list.page - 1), disabled: list.page === 0 }, "Previous"), h("span", null, `Page ${list.page + 1} of ${list.pages}`), h(Action, { onClick: () => setPage(list.page + 1), disabled: list.page === list.pages - 1 }, "Next"))
          )
        ),
        h(
          "aside",
          { className: "pw-inspector", "aria-label": "Agent inspector" },
          h(
            "section",
            null,
            h("div", { className: "pw-inspector-title" }, h("div", { className: "pw-eyebrow" }, "At a glance"), h("h2", null, selected ? "Agent inspector" : "Meet your crew")),
            selected ? h(
              React.Fragment,
              null,
              h("p", { className: "pw-selected-name" }, selected.name || selected.profile),
              h("span", { className: "pw-status-pill" }, h(Mark, { status: selected.status }), (STATE[selected.status] || STATE.unknown)[1]),
              h("p", { className: "pw-detail" }, selected.detail || "State observed from the Hermes event stream."),
              selected.verified === false && h("p", { className: "pw-explainer" }, "Historical observation; current activity is unverified."),
              mode === "live" && selectedSource?.observation === "observed-lease" && h("p", { className: "pw-explainer" }, "Recent background events. Observation expires after 45 seconds of source silence; background socket health is not exposed."),
              mode === "live" && selected.attention && h("div", { className: "pw-attention" }, h("p", { className: "pw-explainer" }, `An earlier ${selected.attention === "error" ? "error" : "input request"} remains flagged. Check the actual session.`), h(Action, { onClick: () => runtime.acknowledge(selected.id), title: "Clears this local reminder only. It does not approve or answer a Hermes request." }, "Dismiss local reminder")),
              h("dl", { className: "pw-facts" }, [["Activity", selected.activity || "Unknown"], ["Tool", selected.tool || "No current tool"], ["Session", selected.storedSessionId || selected.subagentId || selected.sessionId || "Unresolved"], ["Profile", selected.profile || "Unresolved"], ["Connection", selected.connectionId || "Unresolved"], ["Team", selected.parentId ? agents.find((a) => a.id === selected.parentId)?.name || "Linked parent task" : agents.some((a) => a.parentId === selected.id) ? "Coordinating linked tasks" : "Independent session"]].map(([label2, value]) => h("div", { key: label2 }, h("dt", null, label2), h("dd", null, value)))),
              mode === "live" ? h(React.Fragment, null, h(Action, { className: "pw-primary", disabled: !target || opening || !host2.openSession, onClick: openSession }, opening ? "Opening\u2026" : "Open actual session \u2197"), !target && h("p", { className: "pw-explainer" }, "Session navigation becomes available when Hermes supplies its durable ID and exact owner.")) : h("div", { className: "pw-demo-actions", "aria-label": "Demonstration state controls" }, h(Action, { onClick: () => demoState("waiting") }, "Needs input"), h(Action, { onClick: () => demoState("error") }, "Error"), h(Action, { onClick: () => demoState("active") }, "Working"), h(Action, { onClick: () => demoState("done") }, "Complete"))
            ) : h("p", { className: "pw-detail" }, "Select a character or an agent below the scene. Work, attention, tools, and real parent\u2013child relationships stay intact when you change worlds."),
            notice && h("p", { className: "pw-notice", role: "alert" }, notice)
          ),
          h("section", { className: "pw-native" }, h("h2", null, "Connected to Hermes"), h("p", null, "Open native controls. The world reflects the work; Hermes stays in charge of execution."), h("div", { className: "pw-native-grid" }, [["Agents", "/agents"], ["Capabilities", "/skills"], ["MCP connections", "/skills?tab=mcp"], ["Schedules", "/cron"], ["Messaging", "/messaging"], ["Webhooks", "/webhooks"]].map(([title, path]) => h(Action, { key: path, onClick: () => host2.navigate(path) }, `${title} \u2197`)))),
          feed.length > 0 && h("section", { className: "pw-feed" }, h("h2", null, "Recent signals"), feed.map((e, i) => h("div", { className: "pw-feed-row", key: e.id || i }, h("time", null, new Date(e.at || e.timestamp || e.time || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })), h("span", null, e.text || e.summary || e.type || "Activity observed"))))
        )
      ),
      h("footer", { className: "pw-footer" }, h("span", null, mode === "demo" ? "Demonstration is isolated from live telemetry." : "Source-qualified identities \xB7 No invented progress \xB7 Attention stays visible"), h("span", null, "PD Pixel Worlds \xB7 Public alpha"))
    ),
    displayMode && h(
      "div",
      { className: "pw-display-controls", "aria-label": "Display controls" },
      h("div", { className: "pw-display-strip" }, h(Action, { className: "pw-display-exit", onClick: () => setDisplayMode(false), title: "Return to dashboard (Escape)" }, "Exit display"), h("span", { className: "pw-display-status", role: "status" }, mode === "demo" ? "Demo \xB7 illustrative" : observing ? "Live \xB7 observed streams" : "Live source \xB7 not connected", ` \xB7 ${list.visible.length} on stage \xB7 ${agents.length - list.visible.length} off-stage`, mode === "live" && stats.unknown ? ` \xB7 ${stats.unknown} unverified` : "", paused ? " \xB7 Paused" : "")),
      h("div", { className: "pw-display-options" }, h("label", null, h("span", { className: "pw-display-label" }, "Theme"), h("select", { className: "pw-display-theme", "aria-label": "Display theme", value: theme, onChange: (e) => setTheme(e.target.value) }, THEMES.map((t) => h("option", { key: t.id, value: t.id }, t.title)))), h(Action, { "aria-pressed": paused, onClick: () => setPaused((p) => !p) }, paused ? "Resume animation" : "Pause animation"), h("span", { className: "pw-display-hint" }, "Esc to return"))
    )
  );
}

// src/plugin.js
var h2 = React2.createElement;
function Chip({ runtime }) {
  const s = useSyncExternalStore2(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  const c = counts(s.agents);
  return h2(Button2, { type: "button", title: `Pixel Worlds \xB7 ${c.active} working \xB7 ${c.attention} need attention`, onClick: () => host.navigate("/pixel-worlds"), style: { fontSize: 10, padding: "0 6px", height: 22 } }, `\u25C7 Worlds ${c.active}${c.attention ? ` \xB7 ! ${c.attention}` : ""}`);
}
var plugin_default = {
  id: "pixel-worlds",
  name: "Pixel Worlds",
  description: "A live agent crew in Office Space, Kitten Caf\xE9, or a TNG bridge. Theme-independent Hermes telemetry.",
  register(ctx) {
    const runtime = createRuntime();
    if (typeof ctx.onDispose !== "function") throw new Error("Pixel Worlds needs the Desktop plugin cleanup API.");
    const stop = connectHermes(host, runtime);
    ctx.onDispose(() => {
      stop();
      runtime.destroy?.();
    });
    ctx.register({ id: "world-page", area: ROUTES_AREA, title: "Pixel Worlds", data: { path: "/pixel-worlds" }, render: () => h2(PixelWorlds, { runtime, storage: ctx.storage, host }) });
    ctx.register({ id: "world-nav", area: SIDEBAR_NAV_AREA, data: { path: "/pixel-worlds", label: "Pixel Worlds", codicon: "globe" } });
    ctx.register({ id: "world-chip", area: STATUSBAR_AREAS.right, order: 109, render: () => h2(Chip, { runtime }) });
    ctx.register({ id: "world-open", area: PALETTE_AREA, data: { id: "pixel-worlds.open", label: "Pixel Worlds: Open live agent worlds", keywords: ["pixel", "office", "kitten", "cafe", "trek", "tng"], run: () => host.navigate("/pixel-worlds") } });
  }
};
export {
  plugin_default as default
};
