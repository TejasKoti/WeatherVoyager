// app/api/balloon-history/route.ts
import { NextResponse } from "next/server";
import type {
  BalloonPoint,
  BalloonTrack,
  BalloonHistoryWithWeatherResponse,
  BalloonWeather,
} from "@/lib/types";
import { getRedisClient } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TREASURE_BASE = "https://a.windbornesystems.com/treasure";
const HOURS_BACK = 24;

const WEATHER_BATCH_SIZE = 50;
const GRID_DEGREES = 1;

// rate limit: max 500 Open-Meteo calls per 60s window
const MAX_REQUESTS_PER_WINDOW = 500;
const WINDOW_MS = 60_000;

// simple sleep helper
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- WindBorne snapshots ----------

async function fetchTreasureSnapshot(
  hourOffset: number
): Promise<any[] | null> {
  const hourStr = hourOffset.toString().padStart(2, "0");
  const url = `${TREASURE_BASE}/${hourStr}.json`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.error("Treasure fetch failed", hourStr, res.status);
      return null;
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      console.warn("Treasure snapshot not an array", hourStr);
      return null;
    }
    return data as any[];
  } catch (err) {
    console.error("Treasure snapshot error", hourStr, err);
    return null;
  }
}

function buildBalloonHistory(
  rawSnapshots: any[][]
): Record<string, BalloonTrack> {
  const balloons: Record<string, BalloonTrack> = {};

  for (let hour = 0; hour < rawSnapshots.length; hour++) {
    const snapshot = rawSnapshots[hour];
    if (!snapshot) continue;

    const timestamp = new Date(
      Date.now() - hour * 60 * 60 * 1000
    ).toISOString();

    snapshot.forEach((entry, idx) => {
      if (!Array.isArray(entry) || entry.length < 2) return;

      const [latRaw, lonRaw, altRaw] = entry;

      const lat = typeof latRaw === "number" ? latRaw : Number(latRaw);
      const lon = typeof lonRaw === "number" ? lonRaw : Number(lonRaw);
      const altNum =
        altRaw == null
          ? null
          : typeof altRaw === "number"
          ? altRaw
          : Number(altRaw);

      if (
        Number.isNaN(lat) ||
        Number.isNaN(lon) ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lon)
      ) {
        return;
      }

      const balloonId = `balloon-${idx}`;

      if (!balloons[balloonId]) {
        balloons[balloonId] = {
          id: balloonId,
          points: [],
        };
      }

      const point: BalloonPoint = {
        balloonId,
        timestamp,
        lat,
        lon,
        alt:
          altNum != null && Number.isFinite(altNum)
            ? altNum
            : null,
        snapshotIndex: hour,
      };

      balloons[balloonId].points.push(point);
    });
  }

  // sort by snapshotIndex ascending (0 is latest)
  for (const track of Object.values(balloons)) {
    track.points.sort((a, b) => a.snapshotIndex - b.snapshotIndex);
  }

  return balloons;
}

// ---------- Grid cells & weather ----------

type Cell = {
  key: string;
  lat: number;
  lon: number;
  balloonIds: string[];
};

function roundToGrid(value: number, gridDeg: number): number {
  return Math.round(value / gridDeg) * gridDeg;
}

function clusterLatestPointsIntoCells(
  balloons: Record<string, BalloonTrack>
): Cell[] {
  const cellsMap: Record<string, Cell> = {};

  for (const track of Object.values(balloons)) {
    if (!track.points.length) continue;
    const latest = track.points[0]; // snapshotIndex 0 is latest

    const latCenter = roundToGrid(latest.lat, GRID_DEGREES);
    const lonCenter = roundToGrid(latest.lon, GRID_DEGREES);
    const key = `${latCenter.toFixed(1)},${lonCenter.toFixed(1)}`;

    let cell = cellsMap[key];
    if (!cell) {
      cell = {
        key,
        lat: latCenter,
        lon: lonCenter,
        balloonIds: [],
      };
      cellsMap[key] = cell;
    }

    cell.balloonIds.push(track.id);
  }

  return Object.values(cellsMap);
}

function weatherCacheKey(cell: Cell): string {
  return `wx:${cell.lat.toFixed(1)}:${cell.lon.toFixed(1)}`;
}

// single Open-Meteo call, with retry/backoff on 429 / 5xx
async function fetchOpenMeteoBatch(
  cells: Cell[],
  attempt = 0
): Promise<Record<string, BalloonWeather>> {
  const result: Record<string, BalloonWeather> = {};
  if (cells.length === 0) return result;

  const maxRetries = 5;

  const latitudes = cells.map((c) => c.lat.toFixed(4)).join(",");
  const longitudes = cells.map((c) => c.lon.toFixed(4)).join(",");

  const params = new URLSearchParams({
    latitude: latitudes,
    longitude: longitudes,
    current_weather: "true",
  });

  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;

  try {
    const res = await fetch(url, { cache: "no-store" });

    if (res.status === 429 || res.status >= 500) {
      if (attempt < maxRetries) {
        const delay = 500 * (attempt + 1);
        console.warn(
          `Open-Meteo ${res.status} on batch (size=${cells.length}), retrying in ${delay}ms`
        );
        await sleep(delay);
        return fetchOpenMeteoBatch(cells, attempt + 1);
      }
      console.error("Open-Meteo batch ultimately failed after retries");
      return result;
    }

    if (!res.ok) {
      console.error("Open-Meteo error", res.status);
      return result;
    }

    const data = await res.json();

    let items: any[] = [];
    if (Array.isArray(data)) {
      items = data;
    } else if (Array.isArray((data as any).current_weather)) {
      items = (data as any).current_weather.map((cw: any) => ({
        current_weather: cw,
      }));
    } else {
      items = [data];
    }

    cells.forEach((cell, idx) => {
      const item = items[idx];
      const cw = item?.current_weather;
      if (!cw) return;

      const wx: BalloonWeather = {
        temperatureC:
          typeof cw.temperature === "number" ? cw.temperature : null,
        windSpeedMs:
          typeof cw.windspeed === "number"
            ? cw.windspeed / 3.6 // km/h -> m/s
            : null,
        windDirectionDeg:
          typeof cw.winddirection === "number" ? cw.winddirection : null,
      };

      result[cell.key] = wx;
    });

    return result;
  } catch (err) {
    if (attempt < maxRetries) {
      const delay = 500 * (attempt + 1);
      console.warn(
        `Open-Meteo network error on batch (size=${cells.length}), retrying in ${delay}ms`,
        err
      );
      await sleep(delay);
      return fetchOpenMeteoBatch(cells, attempt + 1);
    }
    console.error("Open-Meteo batch fetch error after retries", err);
    return result;
  }
}

async function fetchWeatherForAllBalloons(
  balloons: Record<string, BalloonTrack>
): Promise<Record<string, BalloonWeather>> {
  const cells = clusterLatestPointsIntoCells(balloons);
  const cellWeather: Record<string, BalloonWeather> = {};
  const latestWeather: Record<string, BalloonWeather> = {};

  const redis = getRedisClient();
  const ttlSeconds = Number(
    process.env.REDIS_WEATHER_TTL_SECONDS ?? "900"
  );

  // 1) Try Redis cache first
  let missingCells: Cell[] = cells;

  if (redis) {
    const keys = cells.map((c) => weatherCacheKey(c));
    const cached = await redis.mget(keys);

    missingCells = [];

    cells.forEach((cell, idx) => {
      const raw = cached[idx];
      if (!raw) {
        missingCells.push(cell);
        return;
      }
      try {
        const wx = JSON.parse(raw) as BalloonWeather;
        cellWeather[cell.key] = wx;
      } catch (e) {
        console.warn("Failed to parse cached weather for", cell.key, e);
        missingCells.push(cell);
      }
    });
  }

  // 2) Fetch weather from Open-Meteo for missing cells, with 500-calls/min limit
  let requestsInWindow = 0;
  let windowStart = Date.now();

  for (let i = 0; i < missingCells.length; i += WEATHER_BATCH_SIZE) {
    const now = Date.now();
    const elapsed = now - windowStart;

    // if we've hit 500 calls in this 60s window, wait for the next minute
    if (requestsInWindow >= MAX_REQUESTS_PER_WINDOW && elapsed < WINDOW_MS) {
      const waitMs = WINDOW_MS - elapsed;
      console.warn(
        `Hit ${MAX_REQUESTS_PER_WINDOW} Open-Meteo calls in current window, waiting ${waitMs}ms before continuing`
      );
      await sleep(waitMs);
      windowStart = Date.now();
      requestsInWindow = 0;
    } else if (elapsed >= WINDOW_MS) {
      // new 60s window
      windowStart = now;
      requestsInWindow = 0;
    }

    const batch = missingCells.slice(i, i + WEATHER_BATCH_SIZE);

    const batchResult = await fetchOpenMeteoBatch(batch);
    requestsInWindow += 1; // one Open-Meteo request per batch

    Object.entries(batchResult).forEach(([cellKey, wx]) => {
      cellWeather[cellKey] = wx;
    });

    // store in Redis
    if (redis && ttlSeconds > 0) {
      const pipeline = redis.pipeline();
      batch.forEach((cell) => {
        const wx = batchResult[cell.key];
        if (!wx) return;
        pipeline.set(
          weatherCacheKey(cell),
          JSON.stringify(wx),
          "EX",
          ttlSeconds
        );
      });
      await pipeline.exec();
    }
  }

  // 3) Fan out cellWeather -> per-balloon latestWeather
  for (const cell of cells) {
    const wx = cellWeather[cell.key];
    if (!wx) continue;
    for (const balloonId of cell.balloonIds) {
      latestWeather[balloonId] = wx;
    }
  }

  return latestWeather;
}

// ---------- route handler ----------

export async function GET() {
  try {
    const snapshotPromises: Promise<any[] | null>[] = [];
    for (let h = 0; h < HOURS_BACK; h++) {
      snapshotPromises.push(fetchTreasureSnapshot(h));
    }

    const rawSnapshots = await Promise.all(snapshotPromises);
    const balloons = buildBalloonHistory(
      rawSnapshots.filter((s): s is any[] => !!s)
    );

    const latestWeather = await fetchWeatherForAllBalloons(balloons);
    const points: BalloonPoint[] = Object.values(balloons).flatMap(
      (track) => track.points
    );

    const payload: BalloonHistoryWithWeatherResponse = {
      generatedAt: new Date().toISOString(),
      points,
      balloons,
      latestWeather,
    };

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    });
  } catch (err) {
    console.error("balloon-history API error", err);
    return NextResponse.json(
      { error: "Failed to build balloon history" },
      { status: 500 }
    );
  }
}