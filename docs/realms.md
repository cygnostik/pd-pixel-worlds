# Create a realm

A realm is a visual interpretation of normalized agent state. It must not decide
whether agents are working, manufacture teammates, run jobs or collect secrets.

## Start from the demos

- `src/art/scenes.js`: Office Space and Kitten Café backgrounds, anchor positions and scenery.
- `src/art/bridge-scene.js`: aft-facing TNG bridge, architectural layers and station anchors.
- `src/art/characters.js`: humans, kittens, status motion, selection and attention cues.
- `src/art/pixels.js`: original pixel drawing helpers, bitmap text and deterministic random helper.
- `src/world.js`: theme registry, agent placement, depth sorting, input and scheduling.

Current realms are reviewed JavaScript compiled into the plugin. There is no ZIP
importer, arbitrary remote script loader or stable external realm-package API yet.

## Design first

Choose one camera direction. Lay out foreground, agent stations, routes and the
background before drawing detail. Keep the same perspective across all props.
For the bridge, the viewer stands at the forward screen looking aft; the forward
screen therefore must not also appear behind the command seats.

Use intentional palettes, readable silhouettes and light/material detail. Keep
characters legible at normal pane sizes. Treat the starter realms as examples,
not mandatory color schemes. Avoid copying reference photographs or third-party
assets into the repository.

## Connect to the renderer

1. Add a theme with a unique stable `id`, `title`, `subtitle` and `label` to `THEMES` in `src/world.js`.
2. Add twelve distinct world-space anchors to `ANCHORS` in `src/art/scenes.js`. The logical canvas is 480×300, scaled with smoothing disabled.
3. Dispatch your cached background from `drawBackground`. Use a separate module for complex scenery.
4. Add realm-specific characters, ambient effects and occlusion layers where needed. Do not assume adding a theme entry automatically supplies them.
5. Keep routing around obstacles intentional. Verify moving characters and their selectable regions after resize.
6. Add metadata to `realms/catalog.json` and a demonstration-only screenshot.

Renderer agents include `id`, `slot`, `kind`, `parentId`, `status`, `activity`,
`attention` and optional metadata. Treat inputs as immutable. Supported statuses
include active, waiting, error, done, idle and unknown. Animation must reflect
those states without inventing progress or hiding historical attention.

Identity must survive theme changes. Teamwork motifs require actual parent links;
being on-screen together is not a relationship. Stable appearance comes from the
assigned slot. Do not infer personal characteristics from real agent names.

## Test before submitting

- Working, waiting, failure, completion, idle and unverified states are visually distinct.
- Twelve hit regions remain reachable at different DPRs and pane sizes.
- Selection survives theme switching. Overflow is never silently hidden.
- Motion stops when paused, reduced or hidden; event bursts do not bypass the frame cap.
- Small panes scroll only the scene when necessary, not the whole interface.
- Display mode works without the inspector or roster.
- Screenshots contain fixture agents only. Declare all asset rights and licenses.

Run the commands in [CONTRIBUTING.md](../CONTRIBUTING.md), then submit a pull
request. Include a short design explanation and proof images rather than raw
development logs or real session data.
