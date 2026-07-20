import { motion } from 'framer-motion'
import { useState } from 'react'

import { DEFAULT_PRESETS } from '../../engine/types'

function labelFor(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = minutes / 60
  return Number.isInteger(hours) ? `${hours}h` : `${hours}h`
}

export function DurationPicker({
  totalSeconds,
  onSelect,
  onStart,
}: {
  totalSeconds: number
  onSelect: (minutes: number) => void
  onStart: () => void
}) {
  const [custom, setCustom] = useState('')
  const selectedMinutes = Math.round(totalSeconds / 60)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}
    >
      <span className="tm-label">Focus duration</span>

      <div className="tm-presets">
        {DEFAULT_PRESETS.map(minutes => (
          <button
            key={minutes}
            type="button"
            className="tm-preset"
            data-selected={!custom && selectedMinutes === minutes}
            onClick={() => {
              setCustom('')
              onSelect(minutes)
            }}
          >
            {labelFor(minutes)}
          </button>
        ))}
      </div>

      <div className="tm-row">
        <input
          className="tm-custom"
          type="number"
          min={1}
          max={480}
          placeholder="Custom"
          value={custom}
          onChange={event => {
            const raw = event.target.value
            setCustom(raw)
            const parsed = Number.parseInt(raw, 10)
            if (Number.isFinite(parsed) && parsed > 0) onSelect(parsed)
          }}
          onKeyDown={event => {
            // Enter starts the session rather than bubbling. Without stopping
            // propagation the host's palette/composer routing can see it.
            if (event.key === 'Enter') {
              event.preventDefault()
              event.stopPropagation()
              onStart()
            }
          }}
        />
      </div>

      <button type="button" className="tm-primary" onClick={onStart}>
        Start focus
      </button>
    </motion.div>
  )
}
