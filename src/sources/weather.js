import { config } from "../config.js";

const WMO = {
  0: "senin", 1: "predominant senin", 2: "partial noros", 3: "noros",
  45: "ceata", 48: "ceata cu chiciura",
  51: "burnita slaba", 53: "burnita", 55: "burnita densa",
  61: "ploaie slaba", 63: "ploaie", 65: "ploaie puternica",
  66: "ploaie inghetata", 67: "ploaie inghetata puternica",
  71: "ninsoare slaba", 73: "ninsoare", 75: "ninsoare puternica",
  77: "lapovita", 80: "averse slabe", 81: "averse", 82: "averse puternice",
  85: "averse de zapada", 86: "averse de zapada puternice",
  95: "furtuna", 96: "furtuna cu grindina", 99: "furtuna cu grindina puternica",
};

/**
 * Intoarce un obiect simplu cu vremea curenta + prognoza zilei pentru Sibiu.
 * Returneaza null la eroare (raportul continua fara vreme).
 */
export async function getWeather() {
  try {
    const { lat, lon, city } = config.weather;
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code` +
      `&timezone=Europe%2FBucharest&forecast_days=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const d = await res.json();
    const c = d.current, day = d.daily;
    return {
      city,
      now: Math.round(c.temperature_2m),
      feels: Math.round(c.apparent_temperature),
      desc: WMO[c.weather_code] || "necunoscut",
      wind: Math.round(c.wind_speed_10m),
      max: Math.round(day.temperature_2m_max[0]),
      min: Math.round(day.temperature_2m_min[0]),
      rainChance: day.precipitation_probability_max[0],
      dayDesc: WMO[day.weather_code[0]] || "necunoscut",
    };
  } catch (e) {
    console.error("[weather]", e.message);
    return null;
  }
}
