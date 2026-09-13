import { defineView } from 'agent-code-extension-api'
import type { TimerState } from './engine/types'
import { mountTimerView } from './view/mount'

export default defineView<TimerState>({
  mount: mountTimerView,
})
