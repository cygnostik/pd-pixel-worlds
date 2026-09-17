// Pure normalized telemetry. No SDK, renderer, browser APIs, timers or raw content.
const str = value => typeof value === 'string' ? value : '';
const label = value => str(value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const key = (...parts) => JSON.stringify(parts);
const terminal = new Set(['done', 'error']);
const waits = new Set(['clarify.request', 'approval.request', 'sudo.request', 'secret.request', 'connection.request', 'vault.code.request', 'vault.unlock.request', 'vault.save_login.request']);
const waitingTools = new Set(['clarify', 'browser_vault_enter_code', 'browser_vault_save_login', 'browser_vault_unlock']);
const activityEvents = new Set(['message.start', 'message.delta', 'message.interim', 'message.complete', 'reasoning.delta', 'reasoning.available', 'thinking.delta', 'tool.generating', 'tool.start', 'tool.complete', 'error', 'status.update', 'subagent.spawn_requested', 'subagent.start', 'subagent.thinking', 'subagent.tool', 'subagent.progress', 'subagent.complete', ...waits]);

export function classifyTool(name) {
  const n = str(name).split('.').at(-1);
  if (waitingTools.has(n)) return 'waiting';
  if (n === 'delegate_task') return 'delegating';
  if (/^(web_|browser_|maps)/.test(n)) return 'browsing';
  if (/^(read|search|list|get|recall|skill_view|session_search)/.test(n)) return 'reading';
  if (/^(write|patch|edit|create|update|delete|skill_manage|memory)/.test(n)) return 'writing';
  if (/^(terminal|process|execute|run)/.test(n)) return 'terminal';
  if (/^(image|video|vision|audio|text_to_speech)/.test(n)) return 'studio';
  if (/^(todo|cron)/.test(n)) return 'planning';
  return 'working';
}

export function createRuntime({ now = Date.now, eventLimit = 120 } = {}) {
  const agents = new Map(), connections = new Map(), profiles = new Map();
  const aliases = new Map(), sequences = new Map(), fingerprints = new Map(), toolEvents = new Set();
  const subscribers = new Set();
  let events = [], revision = 0, nextSlot = 0, disposed = false;
  const limit = Number.isFinite(eventLimit) ? Math.max(0, Math.floor(eventLimit)) : 120;
  let snapshot = Object.freeze({ agents: Object.freeze([]), connections: Object.freeze([]), events: Object.freeze([]), revision });
  const scopeKey = (c, p) => key(c, p);
  const sessionKey = (c, p, sid) => key('session', c, p, sid);
  const childKey = (c, p, sid, child) => key('subagent', c, p, sid, child);
  const sameScope = (a, c, p) => a.connectionId === c && a.profile === p;
  const connected = (c, p) => connections.get(scopeKey(c, p))?.status === 'open';
  const nameFor = a => a.kind === 'subagent' ? `Worker · ${(a.subagentId || a.storedSessionId).slice(-8)}` : profiles.get(scopeKey(a.connectionId, a.profile)) || a.profile || `Session · ${a.sessionId.slice(-8)}`;
  function publish() {
    revision += 1;
    snapshot = Object.freeze({
      agents: Object.freeze([...agents.values()].sort((a, b) => a.slot - b.slot).map(a => Object.freeze({ ...a }))),
      connections: Object.freeze([...connections.values()].map(c => Object.freeze({ ...c }))),
      events: Object.freeze(events.map(e => Object.freeze({ ...e }))), revision
    });
    for (const listener of [...subscribers]) { try { listener(snapshot); } catch { /* One view must not break telemetry. */ } }
  }
  function make(id, c, p, sid, extra = {}) {
    const a = { id, name: '', profile: p, connectionId: c, sessionId: sid, storedSessionId: '', parentId: null,
      kind: 'session', status: 'unknown', activity: 'unknown', tool: '', detail: 'No activity observed',
      lastSeen: now(), slot: nextSlot++, attention: null, verified: false, ...extra };
    a.name = nameFor(a); agents.set(id, a); return a;
  }
  function session(c, p, sid, stored = '') {
    const id = sessionKey(c, p, sid);
    let a = agents.get(aliases.get(id) || id);
    const child = stored && [...agents.values()].find(row => sameScope(row, c, p) && row.kind === 'subagent' && row.storedSessionId === stored);
    if (child && a !== child) {
      if (a) { child.slot = Math.min(a.slot, child.slot); if (a.attention === 'error') child.attention = 'error'; agents.delete(a.id); }
      aliases.set(id, child.id); a = child;
    }
    if (!a) a = make(id, c, p, sid);
    if (stored) a.storedSessionId = stored;
    if (a.kind === 'subagent') a.runtimeSessionId = sid;
    return a;
  }
  function setState(a, status, activity, detail, tool = '') {
    a.status = status; a.activity = activity; a.detail = detail; a.tool = tool;
    if (status === 'error') a.attention = 'error';
    else if (status === 'waiting' && !a.attention) a.attention = 'waiting';
  }
  function invalidate(c, p) {
    for (const a of agents.values()) if (sameScope(a, c, p)) {
      a.verified = false;
      fingerprints.delete(a.id);
      if (a.status === 'active' || a.status === 'waiting' || a.status === 'idle') {
        setState(a, 'unknown', 'unknown', 'Stream unavailable; activity unverified');
      }
    }
  }
  function setConnection(input) {
    if (disposed) return false;
    const c = str(input?.id), p = str(input?.profile);
    if (!c || !p) return false;
    const id = scopeKey(c, p), old = connections.get(id);
    const status = str(input.status) || 'unknown';
    const epoch = str(input.replayEpoch) || old?.replayEpoch || '';
    const observation = status === 'observed' ? 'observed-lease' : status === 'open' ? 'socket' : 'none';
    const next = { id: c, key: id, profile: p, status, observation, name: label(input.name) || old?.name || c, replayEpoch: epoch };
    if (old && Object.keys(next).every(k => next[k] === old[k])) return false;
    if (old?.replayEpoch && epoch !== old.replayEpoch) {
      for (const sid of sequences.keys()) {
        const [source, profile] = JSON.parse(sid);
        if (source === c && profile === p) sequences.delete(sid);
      }
      for (const token of toolEvents) {
        const [, source, profile] = JSON.parse(JSON.parse(token)[0]);
        if (source === c && profile === p) toolEvents.delete(token);
      }
      invalidate(c, p);
    }
    connections.set(id, next);
    if (status !== 'open' && status !== 'observed') invalidate(c, p);
    publish(); return true;
  }
  function setProfiles(c, rows) {
    if (disposed || !str(c) || !Array.isArray(rows)) return false;
    let changed = false;
    // Full profiles.list result replaces only this source's label cache.
    for (const k of profiles.keys()) if (JSON.parse(k)[0] === c) profiles.delete(k);
    for (const row of rows) {
      const p = str(row?.name);
      if (p) profiles.set(scopeKey(c, p), label(row?.ui_meta?.['hermes-bots']?.title) || label(row?.display_name) || label(p));
    }
    for (const a of agents.values()) if (a.connectionId === c) {
      const name = nameFor(a); if (name !== a.name) { a.name = name; changed = true; }
    }
    if (changed) publish(); return changed;
  }
  function observeSession(input) {
    if (disposed) return false;
    const c = str(input?.connectionId), p = str(input?.profile), sid = str(input?.sessionId);
    if (!c || !p || !sid) return false;
    const before = JSON.stringify([...agents.values()]);
    const a = session(c, p, sid, str(input.storedSessionId));
    const freshTurn = input.busy === true && input.newTurn === true && a.kind === 'session';
    if (connected(c, p) && typeof input.busy === 'boolean' && (freshTurn || (!a.terminal && !terminal.has(a.status) && a.status !== 'waiting'))) {
      if (freshTurn) { a.terminal = false; fingerprints.delete(a.id); }
      a.verified = true;
      setState(a, input.busy ? 'active' : 'idle', input.busy ? 'thinking' : 'idle', input.busy ? 'Working (host state)' : 'No turn in progress');
    }
    if (before === JSON.stringify([...agents.values()])) return false;
    publish(); return true;
  }
  function ingest(event, context = {}) {
    if (disposed || !activityEvents.has(event?.type)) return false;
    const type = event.type, payload = record(event.payload);
    if (type === 'status.update' && payload.kind !== 'compacting') return false;
    const c = str(event.connectionId) || str(context.connectionId), p = str(event.profile) || str(context.profile), sid = str(event.session_id);
    if (!c || !p || !sid) return false;
    // An explicitly scoped adapter must never silently re-home a foreign event.
    if ((context.connectionId && event.connectionId && context.connectionId !== event.connectionId) || (context.profile && event.profile && context.profile !== event.profile)) return false;
    // A bridge-owned passive lease is not socket health and never authorizes
    // focused busy atoms. Require the explicit envelope and matching owner.
    const observedLease = context.observedLease === true && event.connectionId === c && event.profile === p && context.connectionId === c && context.profile === p;
    if (!connected(c, p) && !observedLease) return false;
    const sub = type.startsWith('subagent.');
    const childId = str(payload.subagent_id) || str(payload.child_session_id);
    if (sub && !childId) return false; // task_index alone is not unique across batches.
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
      // A watched child may already exist as a focused native session.
      const stored = str(payload.child_session_id);
      const existing = stored && [...agents.values()].find(row => sameScope(row, c, p) && row.storedSessionId === stored && row.id !== (a?.id || id));
      if (!a) a = make(id, c, p, sid, { kind: 'subagent', subagentId: childId, parentSessionId: sid });
      if (existing) {
        a.slot = Math.min(a.slot, existing.slot);
        if (existing.attention === 'error') a.attention = 'error';
        if (existing.terminal && !a.terminal) {
          for (const field of ['terminal','status','activity','detail','tool','attention']) a[field] = existing[field];
        }
        if (existing.kind === 'session') a.runtimeSessionId = existing.sessionId;
        else { a.parentId = existing.parentId; a.parentSubagentId = existing.parentSubagentId; }
        for (const [alias, target] of aliases) if (target === existing.id) aliases.set(alias, a.id);
        aliases.set(existing.id, a.id);
        for (const row of agents.values()) if (row.parentId === existing.id) row.parentId = a.id;
        events = events.map(e => e.agentId === existing.id ? {...e, agentId:a.id} : e);
        agents.delete(existing.id);
      }
      a.storedSessionId = stored || a.storedSessionId;
      a.delegationId = str(payload.delegation_id) || a.delegationId || '';
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
    if (toolToken) { toolEvents.add(toolToken); if (toolEvents.size > 4096) toolEvents.delete(toolEvents.values().next().value); }
    const start = type === 'message.start' || type === 'subagent.start';
    const complete = type === 'message.complete' || type === 'subagent.complete';
    // Completed children never revive. Main sessions require a fresh start/busy transition.
    if ((a.terminal || terminal.has(a.status)) && !complete && type !== 'error' && !(start && a.kind === 'session')) return false;
    if (start) {
      if (a.kind === 'subagent' && a.terminal) return false;
      a.terminal = false; setState(a, 'active', 'thinking', sub ? 'Delegated worker started' : 'Turn started');
    } else if (type === 'subagent.spawn_requested') {
      if (a.status === 'active' || a.terminal) return false;
      setState(a, 'unknown', 'queued', 'Spawn requested; not yet running');
    } else if (complete) {
      const outcome = str(payload.status);
      const failed = Boolean(payload.error) || ['error', 'failed', 'timeout'].includes(outcome);
      const success = sub ? outcome === 'completed' : outcome === 'complete';
      // Child watch mirrors omit status: turn ended is not proof of success.
      if (a.terminal && a.status === 'error' && !failed) return false;
      if (a.terminal && a.status === 'done' && !success && !failed) return false;
      a.terminal = true;
      setState(a, failed ? 'error' : success ? 'done' : 'unknown', failed ? 'error' : success ? 'celebrate' : 'unknown', failed ? 'Turn failed' : success ? 'Turn complete — not project validation' : outcome === 'interrupted' ? 'Turn interrupted' : 'Turn ended; outcome unverified');
    } else if (type === 'error') {
      a.terminal = true; setState(a, 'error', 'error', 'Session error; inspect conversation');
    } else if (waits.has(type)) {
      setState(a, 'waiting', 'waiting', type === 'approval.request' ? 'Approval needed' : 'Input needed', a.tool);
      a.waitingToolId = str(payload.tool_id) || a.toolId || '';
    } else if (type === 'tool.complete') {
      const result = record(payload.result);
      const failed = result.is_error === true || result.success === false || Boolean(result.error);
      if (failed) setState(a, 'error', 'error', 'Tool reported failure; inspect conversation');
      else if (a.status !== 'waiting' || (a.waitingToolId && a.waitingToolId === str(payload.tool_id))) {
        setState(a, 'active', 'thinking', 'Tool completed'); a.waitingToolId = '';
      }
    } else if (type === 'tool.start' || type === 'tool.generating' || type === 'subagent.tool') {
      if (a.status !== 'waiting') {
        const tool = label(payload.name || payload.tool_name), activity = classifyTool(tool);
        a.toolId = str(payload.tool_id);
        setState(a, activity === 'waiting' ? 'waiting' : 'active', activity, tool ? `Tool: ${tool}` : 'Tool activity', tool);
        if (activity === 'waiting') a.waitingToolId = a.toolId;
      }
    } else if (a.status !== 'waiting') {
      const activity = type === 'status.update' ? 'planning' : type.startsWith('message.') ? 'writing' : 'thinking';
      setState(a, 'active', activity, type === 'status.update' ? 'Compacting context' : activity === 'writing' ? 'Streaming response' : 'Reasoning');
    }
    a.verified = true; a.lastSeen = now();
    // Commit lease metadata only after an activity event has been accepted;
    // rejected replay, housekeeping and malformed events cannot mint a source.
    if (observedLease) setConnection({id:c, profile:p, status:'observed'});
    const entry = { id: `${++eventNumber}`, type, agentId: a.id, connectionId: c, profile: p, sessionId: sid, at: a.lastSeen, status: a.status, text: `${a.name} · ${a.detail}` };
    events = limit ? [entry, ...events].slice(0, limit) : [];
    publish(); return true;
  }
  let eventNumber = 0;
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { if (disposed || typeof listener !== 'function') return () => {}; subscribers.add(listener); return () => subscribers.delete(listener); },
    ingest, setConnection, observeSession, setProfiles,
    acknowledge(id) { const a = agents.get(id); if (disposed || !a?.attention) return false; a.attention = null; publish(); return true; },
    dispose() { if (disposed) return; disposed = true; subscribers.clear(); },
    destroy() { if (disposed) return; disposed = true; subscribers.clear(); }
  };
}
