export type RcState = {
  /** on: connected; off: not connected; unavailable: this session cannot use it (a cloud session) */
  status: 'on' | 'off' | 'unavailable' | 'unknown'
  /** remote surfaces attached right now (phones, the web app) */
  clients: number
  /** whether the band's button can toggle it (the terminal can; the desktop app takes the typed command) */
  canToggle: boolean
  /** a toggle is queued and not yet answered */
  isPending: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'remote-control-toggle': { rc: RcState }
  }
}
