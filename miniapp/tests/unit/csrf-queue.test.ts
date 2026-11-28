// miniapp/tests/unit/csrf-queue.test.ts
import { describe, expect, it } from 'vitest'
import { CsrfTokenQueue } from '../../src/shared/api/csrf'

describe('CsrfTokenQueue', () => {
  it('serializes one-time token consumption', async () => {
    let current = 'token-1'
    const queue = new CsrfTokenQueue({
      read: () => current,
      remove: () => {
        current = ''
      },
    })
    const seen: string[] = []
    await Promise.all([
      queue.run(async (token) => {
        seen.push(token)
        current = 'token-2'
      }),
      queue.run(async (token) => {
        seen.push(token)
        current = 'token-3'
      }),
    ])
    expect(seen).toEqual(['token-1', 'token-2'])
    expect(current).toBe('token-3')
  })

  it('removes the token from the store before the task runs (one-time use)', async () => {
    const events: string[] = []
    const queue = new CsrfTokenQueue({
      read: () => {
        events.push('read')
        return 'token-1'
      },
      remove: () => {
        events.push('remove')
      },
    })
    await queue.run(async () => {
      events.push('task')
      return 'ok'
    })
    expect(events).toEqual(['read', 'remove', 'task'])
  })

  it('rejects with an empty token instead of inventing one when the store is empty', async () => {
    const queue = new CsrfTokenQueue({
      read: () => '',
      remove: () => undefined,
    })
    await expect(queue.run(async (token) => token)).resolves.toBe('')
  })

  it('keeps draining after a rejected task and forwards the rejection to its caller', async () => {
    let current = 'token-1'
    const queue = new CsrfTokenQueue({
      read: () => current,
      remove: () => {
        current = ''
      },
    })
    await expect(
      queue.run(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    current = 'token-2'
    await expect(
      queue.run(async (token) => {
        current = 'token-3'
        return token
      }),
    ).resolves.toBe('token-2')
    expect(current).toBe('token-3')
  })
})
