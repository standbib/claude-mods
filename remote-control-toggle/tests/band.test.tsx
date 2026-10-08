import { describe, expect, mock, test } from 'claude-code/testing'
import type { CommandInfo, On } from 'claude-code'

const PLUGIN = 'remote-control-toggle'
const OFF = 'Control this session from your phone or claude.ai/code'
const ON = 'Disconnect Remote Control'
const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
} as const

const TYPED = { args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const

function rcCommand(description: string): CommandInfo {
  return { name: 'remote-control', description, source: 'builtin' }
}

function engine(on: On) {
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
}

describe('Remote Control band', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`shows off, toggles on by pressing the button (${surface})`, async ($, on) => {
      mock.clock(on)
      engine(on)
      let isOn = false
      const runs: string[] = []
      on('command.list', () => ({ value: [rcCommand(isOn ? ON : OFF)] }))
      on('session.surfaces', () => ({ value: ['terminal'] }))
      on('command.run', { command: 'remote-control' }, () => {
        runs.push('remote-control')
        isOn = !isOn
        return { text: isOn ? 'Remote Control is running.' : 'Remote Control off' }
      })

      await $.session.start({ cwd: '/tmp', surface, isInteractive: true })
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: PROPS })

      expect((await ui.find({ type: 'Text', text: /Remote Control off/ }))).toBeDefined()
      expect((await ui.find({ key: 'toggle' }))?.props.label).toBe('Turn on')

      await ui.press({ key: 'toggle' })
      expect(runs).toEqual(['remote-control'])
      expect((await ui.find({ type: 'Text', text: /Remote Control on/ }))).toBeDefined()
      expect((await ui.find({ key: 'toggle' }))?.props.label).toBe('Turn off')

      await ui.press({ key: 'toggle' })
      expect(runs).toHaveLength(2)
      expect((await ui.find({ key: 'toggle' }))?.props.label).toBe('Turn on')
    })
  }

  test('follows the person typing /rc themselves and the poll', async ($, on) => {
    const clock = mock.clock(on)
    engine(on)
    let isOn = false
    on('command.list', () => ({ value: [rcCommand(isOn ? ON : OFF)] }))
    on('session.surfaces', () => ({ value: (isOn ? ['terminal', 'mobile'] : ['terminal']) }))
    on('command.run', { command: 'remote-control' }, () => {
      isOn = !isOn
      return { text: '' }
    })

    await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: PROPS })
    expect((await ui.find({ key: 'toggle' }))?.props.label).toBe('Turn on')

    await $.command.run({ command: 'remote-control', ...TYPED })
    await clock.settle()
    expect((await ui.find({ key: 'toggle' }))?.props.label).toBe('Turn off')
    expect(await ui.find({ type: 'Text', text: /1 client/ })).toBeDefined()

    // The bridge drops on its own: the poll notices.
    isOn = false
    await clock.advance(5000)
    expect((await ui.find({ key: 'toggle' }))?.props.label).toBe('Turn on')
  })

  test('/rc-status prints the state', async ($, on) => {
    mock.clock(on)
    engine(on)
    on('command.list', () => ({ value: [rcCommand(ON)] }))
    on('session.surfaces', () => ({ value: ['terminal', 'mobile', 'mobile'] }))
    await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
    const { text } = await $.command.run({ command: 'rc-status', ...TYPED })
    expect(text).toBe('Remote Control is on, 2 clients attached.')
  })

  test('says so when the session has no Remote Control', async ($, on) => {
    mock.clock(on)
    engine(on)
    on('command.list', () => ({ value: [] }))
    on('session.surfaces', () => ({ value: [] }))
    await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: PROPS })
    expect(await ui.find({ type: 'Text', text: /not available/ })).toBeDefined()
    expect(await ui.find({ key: 'toggle' })).toBeUndefined()
  })
})
