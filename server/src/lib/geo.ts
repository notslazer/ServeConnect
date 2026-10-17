import { env } from '../config/env';
import { one, q } from '../db/pool';

/** Great-circle distance in km. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** SQL expression for distance (km) between a table's lat/lng columns and parameter placeholders. */
export function sqlDistance(latCol: string, lngCol: string, pLat: string, pLng: string) {
  return `(6371 * 2 * asin(sqrt(power(sin(radians(${latCol} - ${pLat}) / 2), 2) + cos(radians(${pLat})) * cos(radians(${latCol})) * power(sin(radians(${lngCol} - ${pLng}) / 2), 2))))`;
}

let lastCall = 0;
async function nominatim(path: string): Promise<any> {
  // Respect the OpenStreetMap Nominatim usage policy: max 1 request/second, identify the app.
  const wait = Math.max(0, lastCall + 1100 - Date.now());
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const res = await fetch(`${env.nominatimUrl}${path}`, {
    headers: { 'User-Agent': `${env.appName}/1.0 (${env.smtp.from})`, 'Accept-Language': 'en' },
  });
  if (!res.ok) throw new Error(`Geocoder error ${res.status}`);
  return res.json();
}

export interface Place {
  name: string;
  lat: number;
  lng: number;
}

/** Forward geocoding with a database cache. */
export async function geocode(query: string): Promise<Place[]> {
  const key = 'f:' + query.trim().toLowerCase();
  const cached = await one('SELECT result FROM geocode_cache WHERE query=$1', [key]);
  if (cached) return cached.result;
  const data = await nominatim(`/search?format=json&limit=6&q=${encodeURIComponent(query)}`);
  const places: Place[] = (data as any[]).map((d) => ({ name: d.display_name, lat: parseFloat(d.lat), lng: parseFloat(d.lon) }));
  await q('INSERT INTO geocode_cache(query,result) VALUES ($1,$2) ON CONFLICT DO NOTHING', [key, JSON.stringify(places)]);
  return places;
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = `r:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = await one('SELECT result FROM geocode_cache WHERE query=$1', [key]);
  if (cached) return cached.result.name;
  const d = await nominatim(`/reverse?format=json&zoom=14&lat=${lat}&lon=${lng}`);
  const a = d.address || {};
  const name = [a.suburb || a.neighbourhood || a.village || a.town, a.city || a.county || a.state_district, a.state].filter(Boolean).join(', ') || d.display_name || null;
  await q('INSERT INTO geocode_cache(query,result) VALUES ($1,$2) ON CONFLICT DO NOTHING', [key, JSON.stringify({ name })]);
  return name;
}

/** Round coordinates to ~1 km so a person's exact location is never exposed publicly. */
export const fuzz = (n: number | null) => (n === null || n === undefined ? null : Math.round(n * 100) / 100);
