import { motion } from 'framer-motion'

import type { Reminder } from '../../engine/types'

/**
 * The reminder takeover.
 *
 * Confined to the extension's own root (`.tm-alert` is `position: absolute`
 * inside a relatively-positioned container) rather than the viewport. The
 * original app used `fixed inset-0` because it owned the whole page; here that
 * would escape Agent Code's dialog and cover the entire application, including
 * the chrome the user needs to dismiss it.
 */
export function ReminderAlert({
  reminder,
  onDismiss,
}: {
  reminder: Reminder
  onDismiss: () => void
}) {
  return (
    <motion.div
      className="tm-alert"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <motion.div
        className="tm-alert-card"
        initial={{ scale: 0.94, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.div
          className="tm-alert-icon"
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ repeat: Infinity, duration: 1.6 }}
        >
          ⏰
        </motion.div>

        <div>
          <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 3 }}>{reminder.label}</div>
          <div className="tm-reminder-sub">Timer paused until you dismiss this</div>
        </div>

        <button type="button" className="tm-primary" style={{ width: '100%' }} onClick={onDismiss}>
          Done
        </button>
      </motion.div>
    </motion.div>
  )
}
