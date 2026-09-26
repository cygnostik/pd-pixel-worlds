// Scene controls share the standard Pixel Worlds buttons and host palette.
export const shipStyles = `
.pw .pw-ship{position:relative;min-width:0;max-width:100%;margin:0;padding:8px;border-bottom:1px solid var(--pw-line);color:var(--pw-ink);font-size:11px}

.pw .pw-ship-rooms{display:flex;flex-wrap:wrap;gap:5px;position:relative;min-width:0}
.pw .pw-ship .pw-ship-room{display:flex;align-items:center;gap:8px;flex:0 1 auto;min-width:0;text-align:left}
.pw .pw-ship-room-name{min-width:0;overflow-wrap:anywhere}
.pw .pw-ship button{max-width:100%;white-space:normal}
.pw .pw-ship-count{flex-shrink:0;font-variant-numeric:tabular-nums;text-align:center;border-left:1px solid var(--pw-line);padding-left:6px}
.pw .pw-ship-attention{font-size:11px;font-weight:600;color:var(--pw-ink);text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}
.pw .pw-ship-room .pw-ship-attention{white-space:nowrap;flex-shrink:0}
.pw .pw-ship-population{display:flex;flex-wrap:wrap;gap:2px 13px;padding:8px 0;color:var(--pw-muted);font-size:11px;font-variant-numeric:tabular-nums}
.pw .pw-ship-disclosure{min-width:0;border-top:1px solid var(--pw-line)}
.pw .pw-ship-summary{padding:8px 0;cursor:pointer;color:var(--pw-ink);font-weight:600;overflow-wrap:anywhere}
.pw .pw-ship-summary::marker{color:var(--pw-ink)}
.pw .pw-ship-summary-note{display:inline-block;margin-left:12px;font-weight:400;font-size:11px;color:var(--pw-muted)}
.pw .pw-ship-body{display:grid;gap:8px;min-width:0;padding:4px 0 8px}
.pw .pw-ship-hint{margin:0;font-size:11px;line-height:1.5;color:var(--pw-muted);overflow-wrap:anywhere}
.pw .pw-ship-row{display:flex;flex-wrap:wrap;align-items:flex-end;gap:6px;min-width:0}
.pw .pw-ship-switch{display:inline-block;margin-left:8px;color:var(--pw-muted);font-size:10px}
.pw .pw-ship-energy{border:0;margin:0;padding:0;min-width:0}
.pw .pw-ship-energy legend{padding:0;margin:0 0 6px;color:var(--pw-muted);font-size:11px}
.pw .pw-ship-crew{display:grid;gap:8px;min-width:0;padding-top:12px;border-top:1px solid var(--pw-line)}
.pw .pw-ship-field{display:grid;gap:4px;min-width:0;max-width:100%;color:var(--pw-muted);font-size:11px}
.pw .pw-ship .pw-ship-select{display:block;width:100%;min-width:0;max-width:100%;border:1px solid var(--pw-line);border-radius:6px;padding:6px;color:var(--pw-ink);background:var(--pw-panel);font:inherit;text-overflow:ellipsis}
.pw .pw-ship-destination{flex:1 1 160px}
.pw .pw-ship-selected{margin:0;overflow-wrap:anywhere;color:var(--pw-ink);font-size:11px}
.pw .pw-ship-notice{margin:0;max-width:100%;font-size:11px;overflow-wrap:anywhere;color:var(--pw-ink)}
.pw .pw-ship-notice:not(:empty){padding:8px 0 2px;border-top:1px solid var(--pw-line)}
.pw .pw-ship-select:focus-visible,.pw .pw-ship-summary:focus-visible{outline:2px solid var(--pw-accent);outline-offset:3px}
.pw .pw-ship-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
.pw .pw-ship--compact{margin:5px 0 0;padding:8px;border:1px solid var(--pw-line);border-radius:9px;background:var(--pw-panel)}
.pw .pw-ship--compact .pw-ship-population>span{display:none}
.pw .pw-ship--compact .pw-ship-population:not(:has(strong)){display:none}
.pw .pw-agents-controls,.pw .pw-display-controls{max-height:calc(100% - 24px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}
.pw .pw-ship--compact .pw-ship-body{max-height:min(55vh,460px);overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding:4px 5px 8px 3px}
@container(max-width:480px){.pw .pw-ship-summary-note{margin-left:8px}}
@media(prefers-reduced-motion:reduce){.pw .pw-ship,.pw .pw-ship *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
@media(forced-colors:active){.pw .pw-ship button[aria-pressed=true]{outline:2px solid Highlight;outline-offset:-3px}.pw .pw-ship-count{border-color:CanvasText}}
`;
