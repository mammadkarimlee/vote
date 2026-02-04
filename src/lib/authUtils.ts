const AZ_CHAR_MAP: Record<string, string> = {
  Ə: 'e',
  ə: 'e',
  I: 'i',
  ı: 'i',
  İ: 'i',
  Ö: 'o',
  ö: 'o',
  Ü: 'u',
  ü: 'u',
  Ç: 'c',
  ç: 'c',
  Ş: 's',
  ş: 's',
  Ğ: 'g',
  ğ: 'g',
}

const normalizeLoginPart = (value: string) => {
  const normalized = value
    .split('')
    .map((char) => AZ_CHAR_MAP[char] ?? char)
    .join('')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')

  return normalized
}

export const buildLoginFromName = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  const first = parts[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1] : ''

  const firstPart = normalizeLoginPart(first).slice(0, 3)
  const lastPart = normalizeLoginPart(last).slice(0, 2)
  const fallback = normalizeLoginPart(fullName).slice(0, 5)

  return (firstPart + lastPart) || fallback || 'user'
}

const LOGIN_EMAIL_DOMAIN = import.meta.env.VITE_LOGIN_EMAIL_DOMAIN || 'vote.local'

export const toLoginEmail = (loginOrEmail: string) => {
  const trimmed = loginOrEmail.trim().toLowerCase()
  if (trimmed.includes('@')) return trimmed
  return `${trimmed}@${LOGIN_EMAIL_DOMAIN}`
}
