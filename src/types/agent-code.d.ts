// The Agent Code extension API, API version 1.
//
// Vendored rather than imported from a package: there is no published SDK yet,
// and an extension that cannot be typechecked without one is worse than a copied
// declaration file. When `@agent-code/extension-api` ships, delete this file and
// import from it — the shapes are intended to be identical.

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export interface AgentCodeApiV1 {
  readonly extension: {
    readonly id: string
    readonly apiVersion: 1
  }
  readonly storage: {
    get<T extends JsonValue>(key: string): Promise<T | undefined>
    set(key: string, value: JsonValue): Promise<void>
    delete(key: string): Promise<void>
    keys(): Promise<string[]>
  }
  readonly ui: {
    close(): Promise<void>
    showToast(message: string): Promise<void>
  }
  readonly theme: {
    tokens(): Promise<Record<string, string>>
  }
}

export type Disposable = { dispose(): void }

/** A view renderer. DOM in, disposer out. */
export type ViewMount = (element: HTMLElement) => void | (() => void)

export type ExtensionContext = {
  readonly api: AgentCodeApiV1
  /** Bind a handler to a command declared in `contributes.commands`. */
  registerCommand(id: string, run: () => void | Promise<void>): Disposable
  /** Bind a renderer to a view declared in `contributes.views`. */
  registerView(id: string, mount: ViewMount): Disposable
  /** Disposed in reverse order on deactivate. */
  readonly subscriptions: Disposable[]
}
