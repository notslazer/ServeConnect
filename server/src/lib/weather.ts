/* Weather advisories using Open-Meteo (free, no API key). */
import { env } from '../config/env';

export interface WeatherDay {
  date: string;
  code: number;
  summary: string;
  tMax: number;
  tMin: number;
  precipProb: number;
  precipMm: number;
  windKmh: number;
}
export interface Advisory {
  checkedAt: string;
  days: WeatherDay[];
  adverse: boolean;
  alerts: string[];
}

const CODES: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Freezing fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  66: 'Freezing rain', 67: 'Heavy freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Rain showers', 81: 'Heavy rain showers', 82: 'Violent rain showers', 85: 'Snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Severe thunderstorm with hail',
};

export async function forecastFor(lat: number, lng: number, start: Date, end: Date): Promise<Advisory | null> {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const url = `${env.weatherUrl}?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max&timezone=auto&start_date=${fmt(start)}&end_date=${fmt(end)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const j: any = await res.json();
  const d = j.daily;
  if (!d?.time) return null;
  const days: WeatherDay[] = d.time.map((date: string, i: number) => ({
    date,
    code: d.weather_code[i],
    summary: CODES[d.weather_code[i]] ?? 'Unknown',
    tMax: d.temperature_2m_max[i],
    tMin: d.temperature_2m_min[i],
    precipProb: d.precipitation_probability_max[i] ?? 0,
    precipMm: d.precipitation_sum[i] ?? 0,
    windKmh: d.wind_speed_10m_max[i] ?? 0,
  }));
  const alerts: string[] = [];
  for (const day of days) {
    if ([95, 96, 99].includes(day.code)) alerts.push(`${day.date}: thunderstorm expected — plan for shelter and possible postponement.`);
    else if ([65, 67, 81, 82, 75, 86].includes(day.code) || day.precipMm >= 20) alerts.push(`${day.date}: heavy rain (${day.precipMm} mm) forecast — bring rain gear.`);
    else if (day.precipProb >= 70) alerts.push(`${day.date}: ${day.precipProb}% chance of rain.`);
    if (day.tMax >= 40) alerts.push(`${day.date}: extreme heat (${day.tMax}°C) — hydrate, avoid midday exertion.`);
    if (day.tMin <= 3) alerts.push(`${day.date}: near-freezing temperatures (${day.tMin}°C).`);
    if (day.windKmh >= 50) alerts.push(`${day.date}: strong winds up to ${day.windKmh} km/h.`);
  }
  return { checkedAt: new Date().toISOString(), days, adverse: alerts.length > 0, alerts };
}
