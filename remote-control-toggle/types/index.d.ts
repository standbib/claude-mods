export type RcState = {
  /** on: the bridge is up; off: it is not; unavailable: this session has no /remote-control (cloud, org policy) */
  status: 'on' | 'off' | 'unavailable' | 'unknown'
  /** remote surfaces attached right now (phones, the web app) */
  clients: number
  /** a toggle is queued and not yet answered */
  isPending: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'remote-control-toggle': { rc: RcState }
  }
}
