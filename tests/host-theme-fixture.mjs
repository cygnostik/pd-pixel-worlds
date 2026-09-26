// Semantic formulas from Hermes apps/desktop/src/styles.css; Nous seeds from
// apps/shared/src/theme-presets.ts, applied as themes/context.tsx applyTheme does.
// Secondary is a translucent accent wash, NOT an opaque panel color.
export const hostThemeCSS = `
:root {
 --ui-base:var(--theme-foreground);--ui-accent:var(--theme-midground);
 --ui-bg-editor:color-mix(in srgb,var(--theme-card-seed) var(--theme-mix-card),var(--theme-neutral-card));
 --ui-bg-elevated:color-mix(in srgb,var(--theme-elevated-seed) var(--theme-mix-elevated),var(--theme-neutral-card));
 --ui-surface-background:var(--ui-bg-editor);
 --ui-bg-secondary:color-mix(in srgb,var(--ui-accent) 11%,color-mix(in srgb,var(--ui-base) 7%,transparent));
 --ui-text-primary:color-mix(in srgb,var(--ui-base) 94%,transparent);
 --ui-text-secondary:color-mix(in srgb,var(--ui-base) 74%,transparent);
 --ui-stroke-secondary:color-mix(in srgb,var(--ui-accent) 16%,color-mix(in srgb,var(--ui-base) 7%,transparent));
 --ui-control-hover-background:color-mix(in srgb,var(--ui-accent) 6%,color-mix(in srgb,var(--ui-base) 4%,transparent));
 --ui-control-active-background:color-mix(in srgb,var(--ui-accent) 8%,color-mix(in srgb,var(--ui-base) 5%,transparent));
}
:root[data-test-host-mode=light] {
 color-scheme:light;--theme-foreground:#1f2328;--theme-midground:#0053fd;
 --theme-card-seed:#f6f8fa;--theme-elevated-seed:#ffffff;
 --theme-neutral-card:#fcfcfc;--theme-mix-card:22%;--theme-mix-elevated:28%;
}
:root[data-test-host-mode=dark] {
 color-scheme:dark;--theme-foreground:#e6edf3;--theme-midground:#4a84fe;
 --theme-card-seed:#010409;--theme-elevated-seed:#161b22;
 --theme-neutral-card:#161618;--theme-mix-card:38%;--theme-mix-elevated:46%;
}`;
