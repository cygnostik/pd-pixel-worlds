# Installation and compatibility

## Requirements

The plugin targets Hermes Desktop's ES-module environment plugin SDK. It needs
`ctx.register`, `ctx.onDispose`, plugin-scoped storage, route/sidebar/palette
contributions, React, and the exported native `Button` component.

Observation uses the public host state, `host.onEvent` and read-only metadata
requests. Optional navigation/source APIs are checked before use. This first alpha
was exercised in a running Hermes Desktop instance on macOS; a minimum released
Hermes version and Windows/Linux desktop-host compatibility have not yet been
established. The browser preview is not a host compatibility test.

## Native Hermes package

On a current Hermes build with native plugin support:

```sh
hermes plugins install cygnostik/pd-pixel-worlds --no-enable
hermes plugins enable pixel-worlds
```

Open **Pixel Worlds** or **PW Agents** from the Desktop sidebar or command palette.
The manifest declares only a desktop component: no tools, hooks, Python dependencies
or environment credentials. Official catalog availability is pending; the command
above uses the public source repository, not a catalog entry.

The native package contains `desktop/plugin.js`, identical to the standalone
`plugin.js`. Current Hermes materializes the desktop half into its app plugin root
and preserves existing standalone copies. If upgrading an existing standalone
installation, update that copy explicitly using the installer below rather than
assuming the package install overwrites it. Do not install duplicate desktop IDs.

To disable a native install, use `hermes plugins disable pixel-worlds`; use the
plugin manager to uninstall when desired. Imported realms/preferences remain in
Desktop's plugin storage unless you explicitly clear them.

## Standalone download

Copy the release's `plugin.js` to
`<HERMES_HOME>/desktop-plugins/pixel-worlds/plugin.js`. Use the active profile's
Hermes directory. The normal default is `~/.hermes`.

If replacing an existing build manually, keep a copy of the old directory first.
The repository installer does this automatically:

```sh
node scripts/install.mjs --hermes-home /path/to/hermes-profile
```

The `--hermes-home` argument wins over the `HERMES_HOME` environment variable;
otherwise the installer uses `~/.hermes`. It writes only its own plugin directory
and backup location. It rejects a symlinked plugin destination rather than writing
through it. No dependencies are needed to run the installer, only Node.js 22+.

## Updates and rollback

Run the installer from the new version. Existing files move to
`<HERMES_HOME>/plugin-backups/pixel-worlds-<timestamp>-<process>` before replacement.
The output gives the exact backup path. No-op installs do not create a backup.

To roll back, disable Pixel Worlds, move its current directory aside, and restore
the chosen backup directory to `desktop-plugins/pixel-worlds`. Re-enable the plugin.

To remove it while keeping a recovery copy:

```sh
node scripts/install.mjs --remove --hermes-home /path/to/hermes-profile
```

The original Pixel Agents plugin has a different ID and is never modified.

## Troubleshooting

- No sidebar entry: check Desktop plugin settings and that `plugin.js` is directly inside `pixel-worlds/`.
- Blank scene: check the plugin error in Desktop; confirm the required SDK exports exist in your build.
- Empty live roster: start or focus a real session. A connected socket alone does not imply an agent is working.
- Background activity turns unknown: passive observations expire after 45 seconds without qualifying activity on that source/profile stream. The plugin never wakes dormant backends to poll them.
- Native session button unavailable: the plugin needs an exact durable session ID and unambiguous owner route. It does not guess a destination.
