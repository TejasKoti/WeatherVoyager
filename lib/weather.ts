import type { BalloonWeather } from "./types";

async function fetchWeatherForCoord(
  lat: number,
  lon: number
): Promise<BalloonWeather | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat.toString());
  url.searchParams.set("longitude", lon.toString());
  url.searchParams.set("current_weather", "true");
  url.searchParams.set("windspeed_unit", "ms");
  url.searchParams.set("temperature_unit", "celsius");

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      console.warn(
        `Open-Meteo error HTTP ${res.status} for (${lat}, ${lon})`
      );
      return null;
    }

    const data = await res.json();

    const cw = data.current_weather;
    if (!cw) {
      return null;
    }

    const temperatureC =
      typeof cw.temperature === "number" ? cw.temperature : null;
    const windSpeedMs =
      typeof cw.windspeed === "number" ? cw.windspeed : null;
    const windDirectionDeg =
      typeof cw.winddirection === "number" ? cw.winddirection : null;

    return {
      temperatureC,
      windSpeedMs,
      windDirectionDeg,
    };
  } catch (err) {
    console.warn(
      `Open-Meteo network/error for (${lat}, ${lon})`,
      err
    );
    return null;
  }
}

export async function fetchWeatherForBalloons(
  latestPositions: Record<
    string,
    {
      lat: number;
      lon: number;
    }
  >
): Promise<Record<string, BalloonWeather>> {
  const entries = Object.entries(latestPositions);
  const results: Record<string, BalloonWeather> = {};
  const MAX_BALLOONS_WITH_WEATHER = 50;
  const [toQuery, toSkip] = [
    entries.slice(0, MAX_BALLOONS_WITH_WEATHER),
    entries.slice(MAX_BALLOONS_WITH_WEATHER),
  ];

  await Promise.all(
    toQuery.map(async ([balloonId, pos]) => {
      const wx = await fetchWeatherForCoord(pos.lat, pos.lon);

      results[balloonId] =
        wx ?? {
          temperatureC: null,
          windSpeedMs: null,
          windDirectionDeg: null,
        };
    })
  );

  for (const [balloonId] of toSkip) {
    if (!results[balloonId]) {
      results[balloonId] = {
        temperatureC: null,
        windSpeedMs: null,
        windDirectionDeg: null,
      };
    }
  }
  return results;
}