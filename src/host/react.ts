import { requireHost } from './agentCode'

// Resolves `import ... from 'react'` to the HOST's React instance.
//
// WHY the named re-exports are written out by hand rather than `export *`:
// `export *` requires the source to be a real module with statically analysable
// exports. Here the source is a runtime object, so every name a consumer might
// import has to be an explicit binding. The list below covers React 18's public
// surface as used by this extension and by framer-motion — if a dependency
// imports something missing, the build fails with a clear "no export named X"
// rather than a runtime undefined, which is the failure mode we want.
const react = requireHost().react

export default react

export const {
  Children,
  Component,
  Fragment,
  Profiler,
  PureComponent,
  StrictMode,
  Suspense,
  cloneElement,
  createContext,
  createElement,
  createRef,
  forwardRef,
  isValidElement,
  lazy,
  memo,
  startTransition,
  useCallback,
  useContext,
  useDebugValue,
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  version,
} = react
