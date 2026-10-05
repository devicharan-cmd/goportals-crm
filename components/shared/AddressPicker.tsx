'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPin, Pencil, Search } from 'lucide-react'
import { Field } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import type { AddressInputMethod } from '@/types/database'

export type AddressValue = {
  address_line: string
  city: string
  state: string
  postal_code: string
  country: string
  latitude: number | null
  longitude: number | null
  place_id: string | null
  address_source: AddressInputMethod | null
}

export const EMPTY_ADDRESS: AddressValue = {
  address_line: '', city: '', state: '', postal_code: '', country: 'India',
  latitude: null, longitude: null, place_id: null, address_source: null,
}

const INDIA_CENTER: [number, number] = [20.5937, 78.9629]

type NominatimAddress = {
  road?: string; neighbourhood?: string; suburb?: string
  city?: string; town?: string; village?: string
  state?: string; postcode?: string; country?: string
}
type NominatimResult = { place_id: number; display_name: string; lat: string; lon: string; address?: NominatimAddress }

function toAddressValue(display_name: string, lat: number, lon: number, a: NominatimAddress | undefined, placeId: number | null): AddressValue {
  return {
    address_line: display_name,
    city: a?.city || a?.town || a?.village || a?.suburb || a?.neighbourhood || '',
    state: a?.state || '',
    postal_code: a?.postcode || '',
    country: a?.country || '',
    latitude: lat,
    longitude: lon,
    place_id: placeId != null ? String(placeId) : null,
    address_source: 'map',
  }
}

// Nominatim's usage policy: identify the app (browsers auto-send Referer) and don't hammer it —
// the input's debounce below is what keeps request volume reasonable, not an API key or quota.
const NOMINATIM = 'https://nominatim.openstreetmap.org'

/**
 * Address entry: an embedded OpenStreetMap (via Leaflet) with search-as-you-type
 * (via OSM's free Nominatim geocoder — no API key, no billing account, no Cloud
 * Console setup), plus a draggable/clickable pin, or manual typing with no
 * coordinates required. Trade-off vs. Google: good at streets/addresses, not as
 * strong at finding specific named businesses by name alone.
 */
export function AddressPicker({ value, onChange }: { value: AddressValue; onChange: (v: AddressValue) => void }) {
  const [mode, setMode] = useState<AddressInputMethod>(value.address_source === 'manual' ? 'manual' : 'map')
  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const [query, setQuery] = useState(value.address_line)
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)

  // ─── Map setup (once, while in map mode) ─────────────────────
  useEffect(() => {
    if (mode !== 'map' || !mapDivRef.current || mapRef.current) return
    let cancelled = false

    import('leaflet').then(({ default: L }) => {
      if (cancelled || !mapDivRef.current || mapRef.current) return

      // Default marker icons reference image paths webpack can't resolve — point at a CDN instead.
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const hasStartingPoint = value.latitude != null && value.longitude != null
      const start: [number, number] = hasStartingPoint ? [value.latitude!, value.longitude!] : INDIA_CENTER

      const map = L.map(mapDivRef.current).setView(start, hasStartingPoint ? 16 : 5)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map)

      const marker = L.marker(start, { draggable: true }).addTo(map)
      if (!hasStartingPoint) marker.remove()

      marker.on('dragend', async () => {
        const { lat, lng } = marker.getLatLng()
        await reverseGeocode(lat, lng)
      })
      map.on('click', async (e: any) => {
        marker.setLatLng(e.latlng)
        if (!map.hasLayer(marker)) marker.addTo(map)
        await reverseGeocode(e.latlng.lat, e.latlng.lng)
      })

      mapRef.current = map
      markerRef.current = marker
    })

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  async function reverseGeocode(lat: number, lng: number) {
    try {
      const res = await fetch(`${NOMINATIM}/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&countrycodes=in`)
      const data = await res.json()
      const av = toAddressValue(data.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng, data.address, data.place_id ?? null)
      setQuery(av.address_line)
      onChangeRef.current(av)
    } catch {
      onChangeRef.current({ ...value, latitude: lat, longitude: lng, address_source: 'map' })
    }
  }

  function selectSuggestion(r: NominatimResult) {
    const lat = Number(r.lat), lon = Number(r.lon)
    setQuery(r.display_name)
    setSuggestions([])
    setShowSuggestions(false)
    onChange(toAddressValue(r.display_name, lat, lon, r.address, r.place_id))
    const map = mapRef.current
    if (map) {
      map.setView([lat, lon], 16)
      if (!markerRef.current) return
      markerRef.current.setLatLng([lat, lon])
      if (!map.hasLayer(markerRef.current)) markerRef.current.addTo(map)
    }
  }

  // ─── Search-as-you-type, debounced ───────────────────────────
  useEffect(() => {
    if (mode !== 'map' || query.trim().length < 3 || query === value.address_line) { setSuggestions([]); return }
    let cancelled = false
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${NOMINATIM}/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=6&countrycodes=in`)
        const data = await res.json()
        if (!cancelled) setSuggestions(data)
      } catch {
        if (!cancelled) setSuggestions([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 500)
    return () => { cancelled = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, mode])

  if (mode === 'manual') {
    return (
      <div className="space-y-3">
        <button type="button" onClick={() => setMode('map')}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800">
          <MapPin className="h-3.5 w-3.5" /> Search on the map instead
        </button>
        <Field label="Address line" required>
          <input className="input" value={value.address_line}
                 onChange={e => onChange({ ...value, address_line: e.target.value, address_source: 'manual' })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="City"><input className="input" value={value.city} onChange={e => onChange({ ...value, city: e.target.value, address_source: 'manual' })} /></Field>
          <Field label="State"><input className="input" value={value.state} onChange={e => onChange({ ...value, state: e.target.value, address_source: 'manual' })} /></Field>
          <Field label="Postal code"><input className="input" value={value.postal_code} onChange={e => onChange({ ...value, postal_code: e.target.value, address_source: 'manual' })} /></Field>
          <Field label="Country"><input className="input" value={value.country} onChange={e => onChange({ ...value, country: e.target.value, address_source: 'manual' })} /></Field>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Field label="Search your address" required hint="Search, click the map, or drag the pin to fine-tune.">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" value={query} placeholder="Search for your business address…"
                 onChange={e => { setQuery(e.target.value); setShowSuggestions(true) }}
                 onFocus={() => setShowSuggestions(true)}
                 onBlur={() => setTimeout(() => setShowSuggestions(false), 150)} />
          {showSuggestions && (searching || suggestions.length > 0) && (
            <ul className="absolute z-[1000] mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {searching && <li className="px-3 py-2 text-xs text-slate-400">Searching…</li>}
              {suggestions.map(r => (
                <li key={r.place_id}>
                  <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => selectSuggestion(r)}
                          className="block w-full truncate px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                    {r.display_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Field>
      <div ref={mapDivRef} className={cn('h-64 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100')} />
      {value.address_source === 'map' && value.latitude != null && (
        <p className="flex items-center gap-1.5 rounded-lg bg-lime-50 px-3 py-2 text-xs text-lime-800">
          <MapPin className="h-3.5 w-3.5 flex-shrink-0" /> {value.address_line}
        </p>
      )}
      <button type="button" onClick={() => setMode('manual')}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
        <Pencil className="h-3.5 w-3.5" /> Enter the address manually instead
      </button>
    </div>
  )
}
