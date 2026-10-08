import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { RcState } from '../types'

const PLUGIN = 'remote-control-toggle'
const COMMAND = 'remote-control'
const POLL_MS = 5000

const rc = atom({ plugin: 'remote-control-toggle', key: 'rc' } as const, {
  status: 'unknown',
  clients: 0,
  isPending: false,
} as RcState)

// The engine's own signal: the built-in /remote-control command describes
// itself as "Disconnect Remote Control" while the bridge is up.
async function refresh($: EngineInterface): Promise<RcState['status']> {
  $.ui.invalidate('command.describe')
  const [commands, surfaces] = await Promise.all([
    $.command.list(),
    $.session.surfaces(),
  ])
  const command = commands.find(c => c.name === COMMAND)
  const status: RcState['status'] = !command
    ? 'unavailable'
    : /^disconnect/i.test(command.description)
      ? 'on'
      : 'off'
  const clients = surfaces.filter(s => s !== 'terminal').length
  await update($, rc, state => ({ ...state, status, clients }))

  return status
}

function statusLine(state: RcState): string {
  if (state.status === 'unavailable') return 'Remote Control is not available in this session.'
  if (state.status === 'unknown') return 'Remote Control status unknown.'
  const clients =
    state.clients === 0 ? '' : `, ${state.clients} client${state.clients === 1 ? '' : 's'} attached`

  return `Remote Control is ${state.status}${clients}.`
}

async function toggle($: EngineInterface) {
  const before = await read($, rc)
  if (before.isPending || before.status === 'unavailable') return
  await update($, rc, state => ({ ...state, isPending: true }))
  try {
    await $.command.run({ command: COMMAND })
    const status = await refresh($)
    $.ui.toast(`Remote Control ${status === 'on' ? 'on' : status === 'off' ? 'off' : status}`)
  } catch (error) {
    $.ui.toast(`Remote Control toggle failed: ${error instanceof Error ? error.message : String(error)}`)
    await refresh($)
  } finally {
    await update($, rc, state => ({ ...state, isPending: false }))
  }
}


export const register: Register = on => {
  let poll: { cancel: () => void } | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'rc-status',
      description: 'Show whether Remote Control is on',
    })
    void refresh($)
    poll?.cancel()
    poll = $.clock.every(POLL_MS, () => void refresh($))

    return next(e)
  })

  on('command.run', { command: 'rc-status' }, async $ => {
    await refresh($)

    return { text: statusLine(await read($, rc)) }
  })

  // The person's own /rc or /remote-control: re-read once it has run.
  on('command.run', { command: COMMAND }, async ($, e, next) => {
    const ran = await next(e)
    void refresh($)

    return ran
  }).catch(($, e, next) => next(e))

  on('session.attach', async ($, e, next) => {
    const joined = await next(e)
    void refresh($)

    return joined
  })

  on('session.detach', async ($, e, next) => {
    const left = await next(e)
    if (e.reason !== 'end') void refresh($)

    return left
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const state = await read($, rc)
    const { Box, Button, Text } = $.ui.resolve(e)

    if (state.status === 'unavailable' || state.status === 'unknown') {
      return (
        <Box>
          <Text dimColor>○ {statusLine(state)}</Text>
        </Box>
      )
    }

    const isOn = state.status === 'on'
    const clients =
      state.clients === 0 ? '' : ` · ${state.clients} client${state.clients === 1 ? '' : 's'}`

    return (
      <Box>
        <Text bold color={isOn ? 'success' : 'inactive'}>
          {isOn ? '●' : '○'} Remote Control {isOn ? 'on' : 'off'}
        </Text>
        <Text dimColor>{clients} </Text>
        <Button
          key="toggle"
          hotkey="r"
          variant={isOn ? 'secondary' : 'primary'}
          dimColor={state.isPending}
          label={state.isPending ? 'Working…' : isOn ? 'Turn off' : 'Turn on'}
          onPress={() => void toggle($)}
        />
      </Box>
    )
  })
}
