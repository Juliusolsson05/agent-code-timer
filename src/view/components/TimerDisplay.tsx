import { motion } from 'framer-motion'

import type { Phase } from '../../engine/types'

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

export function TimerDisplay({
  remainingSeconds,
  phase,
}: {
  remainingSeconds: number
  phase: Phase
}) {
  const hours = Math.floor(remainingSeconds / 3600)
  const minutes = Math.floor((remainingSeconds % 3600) / 60)
  const seconds = remainingSeconds % 60

  // Hours only appear when they exist. A 25-minute pomodoro reading "00:25:00"
  // wastes a third of the width on a leading zero that is never non-zero.
  const display =
    hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`

  return (
    <motion.span
      className="tm-digits"
      data-state={phase}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      {display}
    </motion.span>
  )
}
