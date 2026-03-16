// lib/windborne.ts
import "server-only";

import {
  BalloonHistoryResponse,
  BalloonHistoryWithWeatherResponse,
  BalloonPoint,
  WindborneFlightPathResponse,
} from "./types";
import { fetchWeatherForBalloons } from "./weather";

const WINDBORNE_BASE_URL =
  process.env.WINDBORNE_BASE_URL || "https://api.windbornesystems.com";

const WINDBORNE_CLIENT_ID = process.env.WB_CLIENT_ID;
const WINDBORNE_API_KEY = process.env.WB_API_KEY;

const WINDBORNE_MISSION_IDS = (process.env.WINDBORNE_MISSION_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

const REQUEST_TIMEOUT_MS = 8000;

function getAuthHeader(): string {
  if (!WINDBORNE_CLIENT_ID || !WINDBORNE_API_KEY) {
    throw new Error(
      "Missing Windborne credentials. Set WB_CLIENT_ID and WB_API_KEY in .env.local"
    );
  }

  const token = Buffer.from(
    `${WINDBORNE_CLIENT_ID}:${WINDBORNE_API_KEY}`
  ).toString("base64");

  return `Basic ${token}`;
}

async function fetchJsonWithTimeout<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: getAuthHeader(),
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Windborne API error ${res.status}: ${text}`);
    }

    return (await res.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeMissionFlightPath(
  missionId: string,
  raw: WindborneFlightPathResponse
): BalloonPoint[] {
  if (!Array.isArray(raw.flight_data)) {
    return [];
  }

  return raw.flight_data
    .filter((entry) => {
      return (
        typeof entry?.latitude === "number" &&
        typeof entry?.longitude === "number" &&
        entry.latitude >= -90 &&
        entry.latitude <= 90 &&
        entry.longitude >= -180 &&
        entry.longitude <= 180 &&
        typeof entry?.transmit_time === "string" &&
        typeof entry?.id === "string"
      );
    })
    .map((entry, index) => ({
      balloonId: missionId,
      missionId,
      pointId: entry.id,
      timestamp: entry.transmit_time,
      lat: entry.latitude,
      lon: entry.longitude,
      alt: typeof entry.altitude === "number" ? entry.altitude : null,
      snapshotIndex: index,
    }));
}

async function fetchMissionFlightPath(
  missionId: string
): Promise<{
  missionId: string;
  launchSiteId: string | null;
  points: BalloonPoint[];
}> {
  const url = `${WINDBORNE_BASE_URL}/observations/v1/missions/${missionId}/flight_path`;

  const raw = await fetchJsonWithTimeout<WindborneFlightPathResponse>(url);
  const points = normalizeMissionFlightPath(missionId, raw);

  points.sort(
    (a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return {
    missionId,
    launchSiteId: raw.launch_site_id ?? null,
    points,
  };
}

export async function buildBalloonHistory(): Promise<BalloonHistoryResponse> {
  if (WINDBORNE_MISSION_IDS.length === 0) {
    throw new Error(
      "No mission IDs configured. Add WINDBORNE_MISSION_IDS to .env.local"
    );
  }

  const results = await Promise.allSettled(
    WINDBORNE_MISSION_IDS.map((missionId) => fetchMissionFlightPath(missionId))
  );

  const allPoints: BalloonPoint[] = [];
  const balloons: BalloonHistoryResponse["balloons"] = {};

  for (const result of results) {
    if (result.status === "rejected") {
      console.warn("Failed to fetch mission flight path:", result.reason);
      continue;
    }

    const { missionId, launchSiteId, points } = result.value;

    allPoints.push(...points);

    balloons[missionId] = {
      id: missionId,
      missionId,
      launchSiteId,
      points,
    };
  }

  allPoints.sort(
    (a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return {
    generatedAt: new Date().toISOString(),
    points: allPoints,
    balloons,
  };
}

function getLatestPositions(
  history: BalloonHistoryResponse
): Record<string, { lat: number; lon: number }> {
  const latest: Record<string, { lat: number; lon: number }> = {};

  Object.values(history.balloons).forEach((track) => {
    const last = track.points[track.points.length - 1];
    if (!last) return;

    latest[track.id] = {
      lat: last.lat,
      lon: last.lon,
    };
  });

  return latest;
}

export async function buildBalloonHistoryWithWeather(): Promise<BalloonHistoryWithWeatherResponse> {
  const history = await buildBalloonHistory();
  const latestPositions = getLatestPositions(history);
  const latestWeather = await fetchWeatherForBalloons(latestPositions);

  return {
    ...history,
    latestWeather,
  };
}