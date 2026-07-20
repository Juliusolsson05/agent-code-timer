import { requireHost } from './agentCode'

// Resolves `react-dom/client` to the host's instance.
//
// The view mounts its own React root inside the element Agent Code hands it, so
// it needs createRoot. Using a bundled react-dom would attach a second renderer
// to a tree the host's React already owns.
const reactDom = requireHost().reactDom

export const { createRoot, hydrateRoot } = reactDom
export default reactDom
