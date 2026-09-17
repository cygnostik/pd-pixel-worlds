// SDK boundary injected by the caller; optional atoms are capability-detected.
// The active gateway has socket health. Explicit foreign activity has only a
// bounded observation lease: no enumeration, socket retention or backend wake.
const text = value => typeof value === 'string' ? value : '';
const LEGACY_SOURCE = 'legacy-primary';
const ownerKey = r => JSON.stringify([r.connectionId,r.profile]);
const token = value => typeof value === 'string' && value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value);
// Runtime deliberately coalesces unsequenced streaming frames with identical
// metadata. Their arrival may renew an EXISTING lease without a UI publication.
const streaming = new Set(['message.delta','message.interim','reasoning.delta','reasoning.available','thinking.delta','subagent.thinking','subagent.progress']);

export function connectHermes(host, runtime, { now = Date.now, setTimeout: arm = globalThis.setTimeout, clearTimeout: cancel = globalThis.clearTimeout, leaseMs = 45_000 } = {}) {
  if (!Number.isFinite(leaseMs) || leaseMs <= 0 || leaseMs > 45_000) throw new RangeError('leaseMs must be > 0 and <= 45000');
  const state = host?.state || {}, disposers = [], leases = new Map();
  let disposed = false, queued = false, generation = 0, metadataGeneration = 0, timer = null;
  let route = null, focusSignature = '', previousFocus = null, initially = true, routeInvalidated = false;
  const get = name => { try { return state[name]?.get?.(); } catch { return undefined; } };
  const currentRoute = () => {
    let activeId;
    try { activeId = host?.activeConnectionId?.(); } catch { /* Older hosts may not expose this door. */ }
    const status = text(get('gateway')) || 'unknown';
    return { connectionId: text(activeId) || text(get('connectionId')) || LEGACY_SOURCE, profile: text(get('profile')), status: status === 'connected' ? 'open' : status };
  };
  const sameRoute = (a,b) => a && b && a.connectionId === b.connectionId && a.profile === b.profile;
  const connection = (r, status = r.status) => runtime.setConnection({ id:r.connectionId, profile:r.profile, status, name:r.connectionId === LEGACY_SOURCE ? 'Legacy primary (source unqualified)' : r.connectionId });
  function armExpiry() {
    if (disposed || timer !== null || !leases.size) return;
    const deadline = Math.min(...[...leases.values()].map(lease => lease.deadline));
    timer = arm(() => {
      timer = null;
      if (disposed) return;
      // Reconcile route/disconnect before evaluating former background claims.
      sync();
      const at = now();
      for (const [key, lease] of leases) if (lease.deadline <= at) {
        leases.delete(key); connection(lease,'unknown');
      }
      armExpiry();
    }, Math.max(0,deadline-now()));
    timer?.unref?.();
  }
  function forgetLease(owner) {
    leases.delete(ownerKey(owner));
    if (!leases.size && timer !== null) { cancel(timer); timer = null; }
  }
  function invalidate(owner, status = 'unknown') {
    forgetLease(owner); connection(owner,status);
  }
  function renew(owner) {
    leases.set(ownerKey(owner), {...owner, deadline:now()+leaseMs});
    // Existing timer can fire early and re-arm; never publish a ticking clock
    // or reset a timeout on every token. Only expiry changes source metadata.
    armExpiry();
  }
  function refreshNames() {
    if (disposed || !route?.profile || route.status !== 'open' || typeof host?.request !== 'function') return;
    const requestGeneration = ++metadataGeneration, lifecycle = generation, owner = {...route};
    // Invoke request now, not in a deferred microtask that may follow a route swap.
    let pending;
    try { pending = host.request('profiles.list', { include_sessions: false }); } catch { return; }
    Promise.resolve(pending).then(result => {
      if (disposed || lifecycle !== generation || requestGeneration !== metadataGeneration || !sameRoute(owner,currentRoute()) || currentRoute().status !== 'open') return;
      if (Array.isArray(result?.profiles)) runtime.setProfiles(owner.connectionId, result.profiles);
    }).catch(() => { /* Friendly-name discovery is optional, not activity or a connection failure. */ });
  }
  function readFocus() {
    const sid = text(get('focusedSessionId') ?? get('activeSessionId'));
    if (!sid) return null; // A draft is not an executing entity.
    let owner;
    if (state.focusedSessionOwner?.get) {
      owner = get('focusedSessionOwner');
      if (!owner || !token(owner.connectionId) || !token(owner.profile)) return null;
    } else {
      // Compatibility ladder cannot establish ownership of a foreign-profile tile.
      const profile = text(get('focusedSessionProfile')) || route?.profile;
      if (!route || profile !== route.profile) return null;
      owner = {connectionId:route.connectionId,profile};
    }
    return { connectionId:owner.connectionId, profile:owner.profile, sessionId:sid, storedSessionId:text(get('focusedStoredSessionId')), busy:get('busy') };
  }
  function sync() {
    if (disposed) return;
    const next = currentRoute(), changedRoute = !sameRoute(route,next), changedStatus = route?.status !== next.status || routeInvalidated;
    routeInvalidated = false;
    if (changedRoute || changedStatus) {
      generation += 1; metadataGeneration += 1;
      if (route && changedRoute) invalidate(route);
      route = next;
      forgetLease(route); // Active socket state always wins over passive evidence.
      if (route.profile) connection(route);
      // Reconnect / source swap alone does NOT revalidate a stale busy atom.
      if (route.status === 'open') refreshNames();
    }
    const focused = readFocus(), signature = JSON.stringify(focused);
    if (focused && (signature !== focusSignature || changedRoute || changedStatus)) {
      const sameFocus = previousFocus && sameRoute(focused,previousFocus) && focused.sessionId === previousFocus.sessionId;
      const positiveEdge = sameFocus && previousFocus.busy === false && focused.busy === true;
      const ownedOpen = sameRoute(route,focused) && route.status === 'open';
      let busy;
      if (ownedOpen && ((focused.busy === false && (initially || signature !== focusSignature)) || (focused.busy === true && (initially || positiveEdge)))) busy = focused.busy;
      runtime.observeSession({...focused, busy, newTurn:positiveEdge});
    }
    focusSignature = signature; previousFocus = focused; initially = false;
  }
  function schedule() {
    if (disposed) return;
    // Fail stale claims closed synchronously, while still coalescing positive
    // tile/session/owner updates so a host batch cannot mix their identities.
    const next = currentRoute();
    if (route && !sameRoute(route,next)) { invalidate(route); routeInvalidated = true; }
    else if (route && next.status !== 'open' && route.status !== next.status) { invalidate(route,next.status); routeInvalidated = true; }
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; sync(); });
  }
  for (const name of ['connectionId','profile','gateway','focusedSessionOwner','focusedSessionId','activeSessionId','focusedStoredSessionId','focusedSessionProfile','busy']) {
    const atom = state[name];
    try {
      const off = typeof atom?.listen === 'function' ? atom.listen(schedule) : typeof atom?.subscribe === 'function' ? atom.subscribe(schedule) : null;
      if (typeof off === 'function') disposers.push(off);
    } catch { /* Older optional atoms must not prevent basic telemetry. */ }
  }
  if (typeof host?.onEvent === 'function') {
    try {
      const off = host.onEvent('*', event => {
        if (disposed) return;
        sync();
        if (!event || typeof event !== 'object' || Array.isArray(event)) return;
        // Null/missing tags are legacy ACTIVE-route only. Empty, non-string,
        // control-character or contradictory aliases never fall back silently.
        for (const field of ['connectionId','connection_id','profile']) if (event[field] != null && !token(event[field])) return;
        if (event.connectionId != null && event.connection_id != null && event.connectionId !== event.connection_id) return;
        const c = event.connectionId ?? event.connection_id, p = event.profile;
        const owner = {connectionId:c ?? route?.connectionId, profile:p ?? route?.profile};
        const active = sameRoute(owner,route);
        if (!token(owner.connectionId) || !token(owner.profile)) return;
        if (active ? route.status !== 'open' : (!token(c) || !token(p))) return;
        // Preserve validated exact identifiers; runtime sees one normalized owner.
        event = {...event, connectionId:owner.connectionId, profile:owner.profile};
        if (event.type === 'gateway.ready') {
          if (active) {
            runtime.setConnection({id:route.connectionId, profile:route.profile, status:'open', replayEpoch:text(event.payload?.replay_epoch)});
            refreshNames();
          }
          return;
        }
        // No focused-session fallback: the SDK tap precedes core routing.
        if (!token(event.session_id)) return;
        const accepted = runtime.ingest(event, {...owner, observedLease:!active});
        if (!active) {
          const unsequencedFrame = event.seq == null && streaming.has(event.type) && (!event.type.startsWith('subagent.') || token(event.payload?.subagent_id) || token(event.payload?.child_session_id));
          if (accepted || (leases.has(ownerKey(owner)) && unsequencedFrame)) renew(owner);
        }
      });
      if (typeof off === 'function') disposers.push(off);
    } catch { /* Unsupported event tap degrades to owned focused state. */ }
  }
  sync();
  return function dispose() {
    if (disposed) return;
    disposed = true; generation += 1; metadataGeneration += 1;
    if (timer !== null) { cancel(timer); timer = null; }
    for (const off of disposers.splice(0).reverse()) { try { off(); } catch { /* Dispose every subscription. */ } }
    for (const lease of leases.values()) connection(lease,'unknown');
    leases.clear();
    if (route?.profile) connection(route,'unknown');
  };
}
