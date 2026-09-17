---
name: pixel-worlds-creator
description: "Use when creating Pixel Worlds realms. Design and verify original pixel scenes without changing agent truth."
license: MIT
---

# Pixel Worlds creator

Use inside a checkout of PD Pixel Worlds. Read `docs/realms.md`,
`docs/architecture.md` and the relevant source files before editing. If the host
cannot discover this skill automatically, open this file as task context; copying
it into a skill directory is optional and must not overwrite an existing skill.

## Workflow

1. Confirm the requested realm and scope from the user's request. Inspect the
   current scene and any supplied reference images. Lock one camera direction and
   a clear foreground/midground/background hierarchy before coding details.
2. Use original procedural artwork or assets with explicit redistribution rights.
   Keep third-party names and references separate from asset licenses. Never ship
   reference screenshots, private logs, credentials or live session captures.
3. Add a unique theme ID, twelve anchors, cached backdrop and appropriate characters
   through the current source API. Preserve immutable agent identities, exact source
   ownership, parent links, attention and selection across theme changes.
4. Render real proof images from a browser. Inspect composition, silhouettes,
   overlap, interaction targets and small-pane behavior. Do not judge the result
   only from source code or successful compilation.
5. Run unit tests, browser tests and the clean-display check. Verify pause, reduced
   motion, hidden lifecycle, frame budget, overflow and cleanup.
6. Update realm metadata and provide demonstration-only screenshots. Submit source
   for review; do not add an unreviewed executable download/import path.

A realm changes presentation, not agent truth. Never fabricate busy agents,
relationships, successful jobs, approvals or connection health to make a scene
look alive. Keep illustrative demo mode visibly distinct from live observation.

Do not modify Hermes core, install into another profile, publish a release or
change permissions unless the user explicitly asks for that action.
