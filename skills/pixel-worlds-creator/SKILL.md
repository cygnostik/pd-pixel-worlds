---
name: pixel-worlds-creator
description: "Use when creating or importing Pixel Worlds realm packages."
license: MIT
---

# Pixel Worlds creator

Work in a checkout of `cygnostik/pd-pixel-worlds`. Read `docs/realms.md`,
`docs/architecture.md` and `src/realm-packages.js` before authoring. The gallery is
`realms/README.md`; complete package examples live beside it.

## Choose the right path

- For new scenery using humans, kittens or bridge crew, make a data-only
  `.pwrealm.json` package. Users import it without rebuilding or restarting.
- For new character code or animation behavior, make a reviewed source contribution
  and test a plugin build. Never hide executable behavior in downloaded realm data.

## Workflow

1. Read the request and supplied visual references. Lock one camera direction,
   foreground/midground/background hierarchy and twelve readable crew stations.
2. Use original artwork or assets with explicit redistribution rights. Never ship
   reference photographs, private logs, credentials or live session captures.
3. Author a 480×300 noninterlaced 8-bit RGB/RGBA PNG and optional transparent
   foreground layers. Follow the exact version-1 package fields and limits in
   `docs/realms.md`; include a unique ID, author, license and provenance. Supported
   styles are `office`, `cafe` and `bridge`; bridge seats slots 0–4. Do not reuse
   a builtin ID or manually add the library's `import:` prefix.
4. Call `validateRealmPackage`, then import into a real browser using
   `createRealmLibrary`. Structural validation alone does not prove image decoding,
   composition, reachability or actual host persistence.
5. Inspect real proof images. Verify all twelve hit regions, statuses, overlap,
   narrow panes, pause/reduced motion, identity/selection across switches, reload,
   duplicate rejection and explicit removal. Exercise Pixel Worlds and PW Agents.
6. Run `npm test`, `npm run build`, `npm run test:browser`,
   `npm run test:display` and `npm run test:realms`. Use
   `node scripts/export-realms.mjs --check` when changing starter art/packages.
7. Add a fixture-only screenshot, gallery/catalog entry and license/provenance.
   Use the repository's realm submission issue form or a scoped PR when authorized.

The limits are 1 MiB per package, 512 KiB per PNG, four foreground layers, eight
imports and 4 MiB persisted total. Keep markup, URLs and scripts out of metadata;
only the embedded PNG fields accept data URLs. Imported office scenery does not
inherit the builtin printer-yard choreography.

A realm changes presentation, not agent truth. Preserve source-qualified identity,
parent links, selection, attention and honest off-stage counts. Never fabricate
busy agents, approvals, successful jobs or connectivity to enliven a scene. Keep
the demonstration crew visibly separate from live observations.

Do not modify Hermes core, install into another profile, publish a release or
change permissions unless explicitly requested. If installing this skill, use the
active profile and never overwrite a different skill without reading it first.
