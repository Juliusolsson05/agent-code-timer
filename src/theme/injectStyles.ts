import css from './tokens.css?inline'

const STYLE_ID = 'agent-code-timer-styles'

/**
 * Inject the extension's stylesheet into this extension view document.
 *
 * WHY the CSS is imported `?inline` and injected by hand: the manifest names JS
 * view entries, not stylesheets. An emitted sibling CSS file has no load hook and
 * silently leaves the view unstyled. Inlining makes each built view self-contained.
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
