# Architecture

```text
Hermes Desktop SDK
        │
   src/bridge.js          source ownership, listeners, metadata, freshness leases
        │
   src/runtime.js         immutable normalized agents, identities, relationships
        │
   src/app.js             selection, themes, roster, inspector, clean display
        │
   src/world.js           canvas lifecycle, capacity, movement, hit testing
        │
   src/art/               original procedural scenery and characters
```

The scene renderer can run without Hermes. The host adapter is injected rather
than imported into the state engine. New host integrations can map their own
observations into the same runtime without changing the realms.

## What is observed

The active route's open socket and public activity events feed the runtime.
Explicit source/profile/session-tagged foreign events can establish a passive
45-second observation lease. A lease means **observed event stream**, not verified
socket health. Leases apply to the source/profile stream, not per-agent heartbeats.

Unknown events and housekeeping cannot create agents or renew those leases.
Disconnect and route changes invalidate supported work claims. Reconnect alone
never restores work. Waiting/error attention is sticky; dismissing a reminder is
local and cannot approve a request or change execution.

The adapter requests profile/session metadata on the already-active route and
uses supported source metadata. It does not enumerate and activate dormant
backends, run tools or open a separate network connection.

The public event stream does not guarantee push coverage of every modern approval
or clarification prompt. Pixel Worlds is not the authoritative approval inbox;
use the session's native controls. Native shortcuts navigate to Hermes capability,
connection and scheduler views rather than recreating their permission model.

## State and privacy

Each agent has source/profile/session-qualified identity, stable appearance slot,
optional real parent relationship, status, activity category and timestamps.
Snapshots are immutable. Private message bodies, reasoning text, tool arguments
and tool results are not retained by the runtime. It retains event categories and
metadata needed to describe activity, not a transcript. The roster is in memory;
visual preferences use plugin-scoped storage.

The plugin makes no telemetry uploads. Rendering a local scene does not send
content to an image service. The standalone browser preview uses only fixtures.

## Renderer constraints

The renderer accepts `update({theme,agents,selectedId,reducedMotion,paused})`,
`resize(width,height,dpr)`, `setVisible(bool)` and `destroy()`. It exposes metrics
and DPR-correct hit regions. Selection callbacks receive an agent ID.

Art capacity is twelve; the UI owns paging and must expose off-stage counts.
Changing themes changes art, not state. Static scenery is cached. Animation is
capped at 30fps, and hidden or paused scenes stop scheduling animation frames.
The canvas follows the scene's pixel grid rather than smoothing individual sprites.
