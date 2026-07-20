import { AnimatePresence, motion } from 'framer-motion'
import { Bell, Plus, X } from 'lucide-react'
import { useState } from 'react'

import type { Reminder } from '../../engine/types'

export function ReminderManager({
  reminders,
  onAdd,
  onRemove,
}: {
  reminders: Reminder[]
  onAdd: (label: string, intervalMinutes: number) => void
  onRemove: (id: string) => void
}) {
  const [label, setLabel] = useState('')
  const [interval, setIntervalValue] = useState('30')
  const [adding, setAdding] = useState(false)

  const submit = () => {
    const minutes = Number.parseInt(interval, 10)
    if (!label.trim() || !Number.isFinite(minutes) || minutes <= 0) return
    onAdd(label, minutes)
    setLabel('')
    setIntervalValue('30')
    setAdding(false)
  }

  // Every keystroke handler stops propagation. The extension renders inside the
  // host's dialog, which carries the interaction-ownership marker — but that
  // marker governs GLOBAL routers, not the host's own local handlers. Without
  // stopPropagation an Enter here can still reach something above us.
  const swallow = (event: { stopPropagation: () => void }) => event.stopPropagation()

  return (
    <motion.div
      className="tm-reminders"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
    >
      <div className="tm-reminders-head">
        <span className="tm-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Bell size={12} />
          Reminders
        </span>
        {!adding ? (
          <button
            type="button"
            className="tm-ghost"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            onClick={() => setAdding(true)}
          >
            <Plus size={12} />
            Add
          </button>
        ) : null}
      </div>

      <AnimatePresence mode="popLayout">
        {adding ? (
          <motion.div
            key="add"
            className="tm-add"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <input
              autoFocus
              type="text"
              placeholder="e.g. Stand up and stretch"
              value={label}
              onChange={event => setLabel(event.target.value)}
              onKeyDown={event => {
                swallow(event)
                if (event.key === 'Enter') submit()
                if (event.key === 'Escape') setAdding(false)
              }}
            />
            <div className="tm-row">
              <span className="tm-reminder-sub">Every</span>
              <input
                type="number"
                min={1}
                style={{ width: 62, textAlign: 'center' }}
                value={interval}
                onChange={event => setIntervalValue(event.target.value)}
                onKeyDown={event => {
                  swallow(event)
                  if (event.key === 'Enter') submit()
                }}
              />
              <span className="tm-reminder-sub">min</span>
            </div>
            <div className="tm-row" style={{ marginTop: 2 }}>
              <button
                type="button"
                className="tm-primary"
                style={{ flex: 1, padding: '8px 0', fontSize: 13 }}
                onClick={submit}
              >
                Add
              </button>
              <button
                type="button"
                className="tm-circle"
                style={{ width: 'auto', height: 'auto', padding: '8px 16px', borderRadius: 999 }}
                onClick={() => setAdding(false)}
              >
                <span style={{ fontSize: 13 }}>Cancel</span>
              </button>
            </div>
          </motion.div>
        ) : null}

        {reminders.map(reminder => (
          <motion.div
            key={reminder.id}
            className="tm-reminder"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 6 }}
            transition={{ duration: 0.2 }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="tm-reminder-label">{reminder.label}</span>
              <span className="tm-reminder-sub">Every {reminder.intervalMinutes} min</span>
            </div>
            <button
              type="button"
              className="tm-ghost"
              onClick={() => onRemove(reminder.id)}
              title="Remove reminder"
            >
              <X size={13} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>

      {reminders.length === 0 && !adding ? (
        <p className="tm-reminder-sub" style={{ textAlign: 'center', padding: '8px 0' }}>
          No reminders set
        </p>
      ) : null}
    </motion.div>
  )
}
