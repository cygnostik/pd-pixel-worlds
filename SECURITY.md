# Security

Pixel Worlds observes metadata available through the Hermes Desktop SDK. It does
not upload telemetry, retain message bodies or run jobs. Preferences and imported
realm packages are stored through plugin-scoped host storage; observation state
stays in memory. Pixel Worlds and PW Agents share that runtime and local library.

The optional browser preview binds to 127.0.0.1 and serves an explicit allowlist of
its bundled fixture files.

## Realm packages

The `.pwrealm.json` importer accepts a versioned data format with bounded metadata,
embedded PNG artwork, station positions and a supported built-in character style.
It rejects executable code, arbitrary properties, SVG, external asset URLs and
oversized or malformed inputs. Importing does not install a plugin, grant new
permissions, run a shell command or fetch a remote asset.

Treat an imported realm's title, author and license as its author's claims—not
proof that the community directory has reviewed it. Remove an imported realm from
the local library to stop using it. Built-in scenes remain available.

The plugin itself runs with the privileges Hermes gives desktop plugins. Review
plugin source before installation; update the plugin through supported installation
paths. There is no self-updater or remote-code replacement hidden in the realm
importer.

For a security issue, use GitHub private vulnerability reporting if enabled on
this repository. Do not post secrets or private session data in a public issue.
