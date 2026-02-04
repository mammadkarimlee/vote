import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

type LastRouteRedirectProps = {
  storageKey: string
  fallbackPath: string
  prefix: string
}

export const LastRouteRedirect = ({ storageKey, fallbackPath, prefix }: LastRouteRedirectProps) => {
  const navigate = useNavigate()

  useEffect(() => {
    const stored = localStorage.getItem(storageKey)
    const target = stored && stored.startsWith(prefix) ? stored : fallbackPath
    navigate(target, { replace: true })
  }, [storageKey, fallbackPath, prefix, navigate])

  return null
}
