import css from './tokens.css?inline'

const STYLE_ID = 'agent-code-timer-styles'

/**
 * Inject the extension's stylesheet into the host document.
 *
 * WHY the CSS is imported `?inline` and injected by hand rather than left as a
 * normal `import './tokens.css'`: Vite's library mode emits a SEPARATE
 * dist/style.css regardless of `cssCodeSplit`, and the host loads exactly one
 * file — the `entry` named in the manifest. A sibling stylesheet nothing fetches
 * is a stylesheet that silently never applies, and the failure looks like "my
 * extension renders unstyled" with no error anywhere. Inlining makes the bundle
 * self-contained, which is what a single-entry contract requires.
 *
 * Idempotent by id: the view can mount and unmount many times per session, and
 * appending a duplicate stylesheet on every open would grow the document
 * unboundedly.
 */
export function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = css
  document.head.append(style)
}

/**
 * Deliberately NOT called on view unmount — only on deactivate.
 *
 * Removing styles when the view closes would mean re-injecting and re-parsing on
 * every open, and would race a closing animation that is still rendering.
 */
export function removeStyles(): void {
  document.getElementById(STYLE_ID)?.remove()
}
