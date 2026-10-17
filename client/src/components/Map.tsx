/* Maps use OpenStreetMap tiles via Leaflet (free, no API key). Geocoding goes through our API (Nominatim, cached). */
import { useEffect, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, MapPin, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useDebounce, useGeolocation } from '../lib/hooks';
import { Button, Spinner } from './ui';

const pin = (color = '#313C99') =>
  L.divIcon({
    className: '',
    html: `<svg width="30" height="40" viewBox="0 0 30 40"><path d="M15 0C6.7 0 0 6.6 0 14.8 0 26 15 40 15 40s15-14 15-25.2C30 6.6 23.3 0 15 0z" fill="${color}"/><circle cx="15" cy="15" r="6" fill="#fff"/></svg>`,
    iconSize: [30, 40],
    iconAnchor: [15, 40],
    popupAnchor: [0, -36],
  });
export const pins = { brand: pin('#313C99'), blood: pin('#C8102E'), marigold: pin('#E99A0E'), leaf: pin('#1F8A5B') };

const TILE = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const CHENNAI: [number, number] = [13.0827, 80.2707];

function Recenter({ center, zoom }: { center: [number, number]; zoom?: number }) {
  const map = useMap();
  useEffect(() => { map.setView(center, zoom ?? map.getZoom()); }, [center[0], center[1]]); // eslint-disable-line
  return null;
}
function ClickToSet({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export interface Place { lat: number; lng: number; name?: string }

/** Search box + map: click the map or drag the pin to choose a precise spot. */
export function MapPicker({ value, onChange, height = 260, label = 'Location' }: { value: Place | null; onChange: (p: Place) => void; height?: number; label?: string }) {
  const [query, setQuery] = useState('');
  const dq = useDebounce(query, 500);
  const [results, setResults] = useState<{ name: string; lat: number; lng: number }[]>([]);
  const [searching, setSearching] = useState(false);
  const geo = useGeolocation();
  useEffect(() => {
    if (dq.trim().length < 3) return setResults([]);
    setSearching(true);
    api<{ name: string; lat: number; lng: number }[]>('/geo/search', { query: { q: dq } }).then(setResults).catch(() => setResults([])).finally(() => setSearching(false));
  }, [dq]);
  const reverse = async (lat: number, lng: number) => {
    onChange({ lat, lng, name: value?.name });
    const r = await api<{ name: string | null }>('/geo/reverse', { query: { lat, lng } }).catch(() => ({ name: null }));
    onChange({ lat, lng, name: r.name ?? undefined });
  };
  const center: [number, number] = value ? [value.lat, value.lng] : CHENNAI;
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">{label}</div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-ink-faint" />
        <input className="input pl-10" placeholder="Search a place, area or landmark" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search location" />
        {searching && <Spinner className="absolute right-3 top-3" />}
        {results.length > 0 && (
          <ul className="absolute z-[1000] mt-1 max-h-64 w-full overflow-auto rounded-xl border border-paper-line bg-white shadow-lift">
            {results.map((r) => (
              <li key={`${r.lat},${r.lng}`}>
                <button type="button" className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-paper" onClick={() => { onChange(r); setResults([]); setQuery(''); }}>
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" /> {r.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div style={{ height }} className="overflow-hidden rounded-2xl border border-paper-line">
        <MapContainer center={center} zoom={value ? 14 : 11} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
          <TileLayer url={TILE} attribution={ATTR} />
          <Recenter center={center} />
          <ClickToSet onPick={reverse} />
          {value && (
            <Marker position={[value.lat, value.lng]} icon={pins.brand} draggable eventHandlers={{ dragend: (e) => { const p = (e.target as L.Marker).getLatLng(); reverse(p.lat, p.lng); } }} />
          )}
        </MapContainer>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-ink-soft">{value?.name ?? (value ? `${value.lat.toFixed(4)}, ${value.lng.toFixed(4)}` : 'Click the map to drop a pin.')}</span>
        <Button size="sm" variant="ghost" icon={<LocateFixed className="h-4 w-4" />} loading={geo.loading} onClick={async () => { const c = await geo.locate(); if (c) reverse(c.lat, c.lng); }}>
          Use my location
        </Button>
      </div>
      {geo.error && <p className="text-sm text-blood-600">{geo.error}</p>}
    </div>
  );
}

export interface MapMarker { id: string; lat: number; lng: number; title: string; sub?: string; href?: string; tone?: keyof typeof pins }

export function MapView({ markers, height = 320, center, radiusKm, zoom }: { markers: MapMarker[]; height?: number | string; center?: [number, number]; radiusKm?: number; zoom?: number }) {
  const first = markers.find((m) => m.lat !== null);
  const c: [number, number] = center ?? (first ? [first.lat, first.lng] : CHENNAI);
  const nav = useNavigate();
  return (
    <div style={{ height }} className="overflow-hidden rounded-2xl border border-paper-line">
      <MapContainer center={c} zoom={zoom ?? (markers.length === 1 ? 14 : 11)} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer url={TILE} attribution={ATTR} />
        {center && radiusKm && <Circle center={center} radius={radiusKm * 1000} pathOptions={{ color: '#313C99', weight: 1, fillOpacity: 0.05 }} />}
        {markers.filter((m) => m.lat !== null && m.lng !== null).map((m) => (
          <Marker key={m.id} position={[m.lat, m.lng]} icon={pins[m.tone ?? 'brand']}>
            <Popup>
              <div className="font-sans">
                {m.href ? <a href={m.href} onClick={(e) => { e.preventDefault(); nav(m.href!); }} className="font-semibold text-brand-700">{m.title}</a> : <span className="font-semibold">{m.title}</span>}
                {m.sub && <div className="text-xs text-gray-500">{m.sub}</div>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
