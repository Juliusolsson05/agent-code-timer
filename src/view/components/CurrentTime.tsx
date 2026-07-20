import { useEffect, useState } from 'react'

/**
 * Wall clock in the corner. Click to dim.
 *
 * Kept from the original because it earns its place in a focus tool: the whole
 * point is not looking at other clocks, and dimming lets you hide it once you
 * have checked.
 */
export function CurrentTime() {
  const [now, setNow] = useState(() => new Date())
  const [dimmed, setDimmed] = useState(false)

  useEffect(() => {
    // 10s, not 1s: this renders hours and minutes only, so ticking every second
    // would re-render the component sixty times to change nothing.
    const id = setInterval(() => setNow(new Date()), 10_000)
    return () => clearInterval(id)
  }, [])

  return (
    <button
      type="button"
      className="tm-clock"
      data-dimmed={dimmed}
      onClick={() => setDimmed(value => !value)}
      title={dimmed ? 'Show clock' : 'Dim clock'}
    >
      {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </button>
  )
}
