'use client'

import { useCallback, useRef } from 'react'

export function useSingleFlight() {
  const inFlight = useRef(new Set<string>())

  return useCallback(async <T,>(key: string, action: () => T | Promise<T>): Promise<T | undefined> => {
    if (inFlight.current.has(key)) return

    inFlight.current.add(key)
    try {
      return await action()
    } finally {
      inFlight.current.delete(key)
    }
  }, [])
}
