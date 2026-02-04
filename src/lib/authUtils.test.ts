import { describe, expect, it } from 'vitest'
import { buildLoginFromName, toLoginEmail } from './authUtils'

describe('buildLoginFromName', () => {
  it('builds login from first and last name', () => {
    expect(buildLoginFromName('Elvin Əliyev')).toBe('elvel')
  })

  it('falls back to normalized input', () => {
    expect(buildLoginFromName('A')).toBe('a')
  })
})

describe('toLoginEmail', () => {
  it('keeps emails intact', () => {
    expect(toLoginEmail('test@example.com')).toBe('test@example.com')
  })

  it('converts login to email', () => {
    expect(toLoginEmail('elvial')).toBe('elvial@vote.local')
  })
})
