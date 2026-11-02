import { describe, it, expect } from 'vitest'

describe('core package', () => {
  it('exports without error', async () => {
    const core = await import('../index')
    expect(core).toBeDefined()
  })
})
