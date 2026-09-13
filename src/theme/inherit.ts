// Theme inheritance.
//
// Default is black-and-white — a focus tool should be visually quiet and should
// not change character every time the host's accent changes. Inheriting is a
// deliberate opt-in, and it works by REASSIGNING the same --tm-* variables the
// stylesheet already uses, so nothing else in the extension has to know which
// mode is active.

/** Host token → local token. The host's --theme-* layer is the documented
 *  contract (the --color-* Tailwind bindings are not, and are avoided). */
const MAP: Array<[local: string, host: string]> = [
  ['--tm-bg', '--theme-canvas'],
  ['--tm-surface', '--theme-surface'],
  ['--tm-fg', '--theme-ink'],
  ['--tm-dim', '--theme-ink-dim'],
  ['--tm-faint', '--theme-muted'],
  ['--tm-border', '--theme-border'],
  ['--tm-accent', '--theme-accent'],
  ['--tm-accent-fg', '--theme-accent-fg'],
]

const FONT_MAP: Array<[local: string, host: string]> = [
  ['--tm-font-digit', '--theme-font-code'],
]

/**
 * Apply or clear inheritance on the extension's root element.
 *
 * WHY read from the ROOT element rather than from `api.theme.tokens()`: the host
 * accessor is async and returns a snapshot, but theme changes need to land
 * within a frame or the UI visibly lags the rest of the app. Reading computed
 * styles off document.documentElement is synchronous and always current — and
 * `--theme-font-code` in particular is assigned at runtime by the host and does
 * not appear in any stylesheet, so a stylesheet-derived snapshot can miss it.
 *
 * WHY setProperty on the extension root and not on :root: writing to :root would
 * mean the extension mutating the host's own theme variables. Scoping to our own
 * element keeps the blast radius at zero.
 */
export function applyThemeInheritance(root: HTMLElement, inherit: boolean): void {
  const hostStyle = getComputedStyle(document.documentElement)

  for (const [local, host] of [...MAP, ...FONT_MAP]) {
    if (!inherit) {
      // Removing restores the value from tokens.css rather than leaving a stale
      // inline override — which is why the defaults live in the stylesheet and
      // are never written inline.
      root.style.removeProperty(local)
      continue
    }
    const value = hostStyle.getPropertyValue(host).trim()
    if (value) root.style.setProperty(local, value)
  }
}

/**
 * Re-apply on host theme changes.
 *
 * The view API has no theme-change event, so this observes the attribute the host
 * flips when the mode changes plus the inline style it writes accent and font
 * tokens into. A MutationObserver on one element is cheap and beats polling;
 * when the host gains a real theme event this can be replaced by it.
 */
export function watchHostTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-mode', 'data-contrast', 'style', 'class'],
  })
  return () => observer.disconnect()
}
