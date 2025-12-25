// lib/windborne.ts
import {
  BalloonHistoryResponse,
  BalloonHistoryWithWeatherResponse,
  BalloonPoint,
} from "./types";
import { fetchWeatherForBalloons } from "./weather";

const TREASURE_BASE_URL = "https://a.windbornesystems.com/treasure";
const HISTORY_HOURS = 24;
const REQUEST_TIMEOUT_MS = 8000;

type RawPoint = [number, number, number?];
type RawSnapshot = RawPoint[] | unknown;

async function fetchSnapshot(hourIndex: number): Promise<RawSnapshot | null> {
  const suffix = hourIndex.toString().padStart(2, "0");
  const url = `${TREASURE_BASE_URL}/${suffix}.json`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS
    );

    const res = await fetch(url, { signal: controller.signal });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`Snapshot ${suffix}: HTTP ${res.status}`);
      return null;
    }

    const text = await res.text();

    try {
      const json = JSON.parse(text);
      return json;
    } catch (err) {
      console.warn(`Snapshot ${suffix}: JSON parse error`, err);
      return null;
    }
  } catch (err) {
    console.warn(`Snapshot ${suffix}: network/timeout error`, err);
    return null;
  }
}

function extractPointsFromSnapshot(
  raw: RawSnapshot,
  hourIndex: number
): BalloonPoint[] {
  const points: BalloonPoint[] = [];

  if (!Array.isArray(raw)) {
    return points;
  }

  const now = Date.now();
  const snapshotTimestamp = new Date(
    now - hourIndex * 3600_000
  ).toISOString();

  raw.forEach((entry, idx) => {
    try {
      if (!Array.isArray(entry)) return;

      const [lat, lon, altMaybe] = entry as RawPoint;

      if (typeof lat !== "number" || typeof lon !== "number") return;
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return;

      const alt =
        typeof altMaybe === "number" ? altMaybe : null;

      const balloonId = `balloon-${idx}`;

      points.push({
        balloonId,
        timestamp: snapshotTimestamp,
        lat,
        lon,
        alt,
        snapshotIndex: hourIndex,
      });
    } catch {
      return;
    }
  });

  return points;
}

export async function buildBalloonHistory(): Promise<BalloonHistoryResponse> {
  const allPoints: BalloonPoint[] = [];

  const snapshotPromises: Promise<RawSnapshot | null>[] = [];
  for (let hour = 0; hour < HISTORY_HOURS; hour++) {
    snapshotPromises.push(fetchSnapshot(hour));
  }

  const snapshots = await Promise.all(snapshotPromises);

  snapshots.forEach((raw, hourIndex) => {
    if (!raw) return;
    const pts = extractPointsFromSnapshot(raw, hourIndex);
    allPoints.push(...pts);
  });

  allPoints.sort(
    (a, b) =>
      new Date(a.timestamp).getTime() -
      new Date(b.timestamp).getTime()
  );

  const balloons: BalloonHistoryResponse["balloons"] = {};
  for (const p of allPoints) {
    if (!balloons[p.balloonId]) {
      balloons[p.balloonId] = { id: p.balloonId, points: [] };
    }
    balloons[p.balloonId].points.push(p);
  }

  return {
    generatedAt: new Date().toISOString(),
    points: allPoints,
    balloons,
  };
}

function getLatestPositions(history: BalloonHistoryResponse): Record<
  string,
  { lat: number; lon: number }
> {
  const latest: Record<string, { lat: number; lon: number }> = {};

  Object.values(history.balloons).forEach((track) => {
    const last = track.points[track.points.length - 1];
    if (!last) return;
    latest[track.id] = { lat: last.lat, lon: last.lon };
  });

  return latest;
}

export async function buildBalloonHistoryWithWeather(): Promise<BalloonHistoryWithWeatherResponse> {
  const history = await buildBalloonHistory();

  const latestPositions = getLatestPositions(history);

  const latestWeather = await fetchWeatherForBalloons(
    latestPositions
  );

  return {
    ...history,
    latestWeather,
  };
}