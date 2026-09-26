# Create a realm

A realm changes the place agents inhabit, not what their activity means. Start
with the [downloadable collection](../realms/README.md) and the
[creator skill](../skills/pixel-worlds-creator/SKILL.md).

## Make a realm package

1. Download a starter `.pwrealm.json` as an example.
2. Paint an original **480×300 PNG** background. Export noninterlaced **8-bit RGB
   or RGBA**, not indexed-color, animated PNG, SVG or a remote image URL.
3. Give the package a unique ID, title, author credit and license. Set twelve
   distinct `[x,y]` station positions and choose the `office`, `cafe` or `bridge`
   character style.
4. Import through **Pixel Worlds → Import realm**. Select it in both Pixel Worlds
   and PW Agents. Check selection, all states, layering and narrow panes with the
   demonstration crew.
5. Add a demonstration screenshot and [submit your realm](https://github.com/cygnostik/pd-pixel-worlds/issues/new?template=realm-submission.yml).

No plugin rebuild is needed. Packages persist through Hermes's plugin storage.
Duplicate IDs are rejected: use **Remove realm** before importing a replacement.
The importer cannot remove or overwrite built-in scenes.

## Package format: `pwrealm`, version 1

The exact validator lives in [`src/realm-packages.js`](../src/realm-packages.js).
The three complete files under `realms/` are working examples.

| Field | Value |
| --- | --- |
| `format` | `"pwrealm"` |
| `version` | `1` (format version, not plugin version) |
| `id` | Lowercase words/numbers separated by hyphens, starting with a letter; at most 64 characters. `office`, `cafe`, `bridge` are reserved. |
| `title`, `subtitle`, `label` | Plain text; maximum 80, 160 and 32 characters. |
| `author`, `license`, `provenance` | Optional plain text; maximum 80, 160 and 240 characters. Include these for submissions. |
| `width`, `height` | `480`, `300` |
| `characterStyle` | `"office"`, `"cafe"` or `"bridge"` |
| `anchors` | Twelve distinct `[x,y]` pairs: `0 ≤ x < 480`, `0 ≤ y < 300`. |
| `background` | Complete PNG in a `data:image/png;base64,` data URL. |
| `layers` | Optional array of up to four `{ "afterY": number, "image": PNG data URL }` objects, each 480×300. |

Text fields are display text, not URLs or markup. Unknown properties are rejected.
The library assigns the `import:` runtime namespace; do not put it in a package ID.

Layers sort by `afterY`. Each paints before characters whose anchor Y is greater
than or equal to that value; `300` paints in front of every character. Use RGBA
transparency for rails and consoles. The `bridge` style seats slots 0–4; the other
styles use their built-in character behavior at your anchors.

Limits: **1 MiB/package**, **512 KiB/PNG**, **eight imported packages**, **4 MiB
persisted total**. Decoding/storage failures do not publish partial imports.

### Assemble a package from a PNG

Run inside a repository checkout after saving `my-background.png`. The starter
provides valid anchors; adjust them for your composition.

```js
// Save as make-my-realm.mjs, then run: node make-my-realm.mjs
import {readFile, writeFile} from 'node:fs/promises';
import {validateRealmPackage} from './src/realm-packages.js';

const realm = JSON.parse(await readFile('realms/pd-kitten-cafe.pwrealm.json', 'utf8'));
Object.assign(realm, {
  id: 'my-cafe', title: 'My Café', label: 'My Café',
  subtitle: 'An original place for the crew',
  author: 'Your artist name', license: 'MIT', provenance: 'Original artwork',
  background: 'data:image/png;base64,' + (await readFile('my-background.png')).toString('base64'),
  layers: []
});
validateRealmPackage(realm);
await writeFile('my-cafe.pwrealm.json', JSON.stringify(realm, null, 2) + '\n');
```

Packages cannot supply JavaScript, CSS, HTML, fonts, networking, tool calls or new
character code. New animation/character behavior requires a reviewed source
contribution. Imported office packages use their own anchors; the builtin office's
printer-yard teamwork choreography remains part of the builtin scene.

## Design before drawing

Choose one camera direction and foreground/midground/background hierarchy.
Keep perspective coherent. The TNG example looks aft from the forward screen;
that screen cannot also appear behind the command seats. Keep silhouettes and
selection targets readable. Small panes scroll rather than shrinking characters.

Use original work or assets with explicit redistribution rights. Keep franchise
names separate from asset licenses. Never distribute reference photographs,
private telemetry or live-session screenshots.

## Advanced source contributions

- `src/art/scenes.js`: office/café scenery and builtin stations.
- `src/art/bridge-scene.js`: bridge architecture and foreground layers.
- `src/art/lcars.js`: clipped, skew-aware LCARS panel grammar.
- `src/art/engineering-scene.js`: Engineering art, stations and layers; dormant
  chief engineer's office artwork is preserved here for later, not enabled in the release.
- `src/ship.js` / `src/ship-layout.js`: built-in TNG local crew travel and rooms.
- `src/art/characters.js`: characters, status motion and attention cues.
- `src/world.js`: placement, depth sorting, selection and scheduling.

Add a stable theme ID, twelve anchors, cached background and appropriate character
behavior through these source APIs. Preserve immutable agent IDs, source ownership,
parent links, selection and attention. Teamwork requires actual parent links;
being on-screen together is not a relationship.

The built-in TNG rooms are Bridge and Main Engineering; the chief engineer's
office is excluded from the release runtime. The multi-room experience is
source behavior, not a version-1
package feature. Its downloadable bridge retains twelve legacy anchors and
static layers. Room travel, local toys and shared station reservations do not
execute from imported JSON; no schema migration is required.

`npm run export:realms` exports the three procedural scenes as packages.
`node scripts/export-realms.mjs --check` decodes them in a real browser and checks
pixel equality, seating, layering, hit testing and persistence without rewriting.

## Test before sharing

- Active, waiting, error, done, idle and unknown remain distinguishable.
- Every station is selectable after resize; scenery does not hide the crew.
- Selection and identity survive realm/view switches.
- Pause, reduced motion and hidden-view behavior stop motion correctly.
- PW Agents discloses demo/live status and off-stage agents.
- Import, reload, duplicate rejection and explicit removal work.
- Screenshots use the demonstration crew; credit/licenses travel with the package.

Run [the contribution checks](../CONTRIBUTING.md), then submit the package or source
PR with its gallery entry. An issue submission does not automatically publish it.
