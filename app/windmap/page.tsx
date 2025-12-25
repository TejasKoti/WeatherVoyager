"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import GlobeView from "../components/GlobeView";
import FlatGlobeView from "../components/MapView";
import type {
  BalloonHistoryWithWeatherResponse,
  BalloonWeather,
} from "@/lib/types";

type ViewMode = "globe" | "map";
type MapType = "dark" | "satellite";

interface SelectedBalloonSummary {
  id: string;
  lat: number;
  lon: number;
  alt: number | null;
  timestamp: string;
  weather: BalloonWeather | null;
  verticalSpeedMs: number | null;
  groundSpeedMs: number | null;
  bearingDeg: number | null;
  altHistoryKm: number[];
  altHistoryTimestamps: string[];
  distanceLast24hKm: number | null;
}

// Great-circle distance helper to measure ground distance between two lat/lon points
function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
// Altitude filter bounds (shared with heatmap logic)
const ALT_FILTER_MIN_KM = 0;
const ALT_FILTER_MAX_KM = 30;

// Computes compass bearing (0–360°, 0 = north) from one coordinate to another
function computeBearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const λ1 = toRad(lon1);
  const λ2 = toRad(lon2);

  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);

  const θ = Math.atan2(y, x);
  let deg = (toDeg(θ) + 360) % 360;
  return deg;
}

type FocusCenter = { lat: number; lon: number } | null;
const DEFAULT_FOCUS_RADIUS_KM = 500;

export default function HomePage() {
  // Core data + loading state
  const [history, setHistory] =
    useState<BalloonHistoryWithWeatherResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Global view settings (3D globe vs flat map, and map style)
  const [viewMode, setViewMode] = useState<ViewMode>("globe");
  const [mapType, setMapType] = useState<MapType>("dark");

  // Selection and side panel visibility
  const [selectedBalloonId, setSelectedBalloonId] = useState<string | null>(
    null
  );
  const [panelOpen, setPanelOpen] = useState<boolean>(false);
  const [altitudeRangeKm, setAltitudeRangeKm] = useState<[number, number]>([
    ALT_FILTER_MIN_KM,
    ALT_FILTER_MAX_KM,
  ]);
  // Map focus and zoom radius when in flat map mode
  const [focusCenter, setFocusCenter] = useState<FocusCenter>(null);
  const [focusRadiusKm, setFocusRadiusKm] =
    useState<number>(DEFAULT_FOCUS_RADIUS_KM);

  // Manual coordinate input for “teleport” feature
  const [latInput, setLatInput] = useState("");
  const [lonInput, setLonInput] = useState("");

  // Share link state (copy to clipboard feedback)
  const [shareStatus, setShareStatus] = useState<"" | "copied" | "error">("");

  // Location and balloon search inputs + labels
  const [locationQuery, setLocationQuery] = useState("");
  const [currentLocationLabel, setCurrentLocationLabel] = useState<string>("");
  const [balloonQuery, setBalloonQuery] = useState("");

  // Fly mode and compass controls
  const [flyModeActive, setFlyModeActive] = useState(false);
  const [showFlyHint, setShowFlyHint] = useState(false);
  const [showCompass, setShowCompass] = useState(false);
  const [headingDeg, setHeadingDeg] = useState(0);
  const [cameraResetToken, setCameraResetToken] = useState(0);

  // Load latest balloon history + weather from the API when the page mounts
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/balloon-history");
        if (!res.ok) {
          throw new Error(`API returned ${res.status}`);
        }
        const data =
          (await res.json()) as BalloonHistoryWithWeatherResponse;
        setHistory(data);
      } catch (err: any) {
        console.error("Failed to load balloon history", err);
        setError(err?.message ?? "Failed to load balloon history");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // Simple aggregate counts derived from history
  const activeBalloonCount = history
    ? Object.keys(history.balloons).length
    : 0;

  const weatherAttachedCount = useMemo(() => {
    if (!history) return 0;
    let count = 0;
    Object.values(history.latestWeather || {}).forEach((wx) => {
      if (
        wx &&
        (wx.temperatureC != null ||
          wx.windSpeedMs != null ||
          wx.windDirectionDeg != null)
      ) {
        count += 1;
      }
    });
    return count;
  }, [history]);

  // Human-readable timestamp for when the data snapshot was generated
  const lastUpdatedDisplay = useMemo(() => {
    if (!history) return "";
    try {
      const d = new Date(history.generatedAt);
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
    } catch {
      return history.generatedAt;
    }
  }, [history]);

  // Selection summary (used to drive the left stats panel for a single balloon)
  const [avgWindowHours, setAvgWindowHours] = useState<3 | 6 | 12 | 24>(24);
  const [avgWindowMenuOpen, setAvgWindowMenuOpen] = useState(false);

  // Precompute per-balloon summary values (altitude, speeds, bearing, history, etc.)
  const selectedSummary: SelectedBalloonSummary | null = useMemo(() => {
    if (!history || !selectedBalloonId) return null;
    const track = history.balloons[selectedBalloonId];
    if (!track || track.points.length === 0) return null;

    const points = track.points;

    const last = points[points.length - 1];
    const latest = points[0];
    const prev =
      points.length >= 2 ? points[1] : null;

    const wx = history.latestWeather[selectedBalloonId] ?? null;

    let verticalSpeedMs: number | null = null;
    let groundSpeedMs: number | null = null;
    let bearingDeg: number | null = null;

    const latestTs = new Date(latest.timestamp).getTime();
    const cutoff = latestTs - avgWindowHours * 3600 * 1000;

    let totalDt = 0;
    let totalDist = 0;
    let totalAltDelta = 0;
    let altSegments = 0;

    let dirX = 0;
    let dirY = 0;
    let dirCount = 0;

    // Walk along the track and accumulate distance, altitude change, and direction over the window
    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];

      const t1 = new Date(p1.timestamp).getTime();
      const t2 = new Date(p2.timestamp).getTime();
      if (!Number.isFinite(t1) || !Number.isFinite(t2)) continue;

      if (t1 < cutoff) continue;

      const dtSec = (t1 - t2) / 1000;
      if (dtSec <= 0) continue;

      const dMeters = haversineMeters(p2.lat, p2.lon, p1.lat, p1.lon);

      totalDt += dtSec;
      totalDist += dMeters;

      const alt1 = p1.alt ?? null;
      const alt2 = p2.alt ?? null;
      if (alt1 != null && alt2 != null) {
        totalAltDelta += (alt1 - alt2) * 1000;
        altSegments += 1;
      }

      const segBearing = computeBearingDeg(p2.lat, p2.lon, p1.lat, p1.lon);
      if (Number.isFinite(segBearing)) {
        const rad = (segBearing * Math.PI) / 180;
        dirX += Math.sin(rad);
        dirY += Math.cos(rad);
        dirCount++;
      }
    }

    // Turn accumulated values into average speeds and heading for the chosen time window
    if (totalDt > 0) {
      groundSpeedMs = totalDist / totalDt;

      if (altSegments > 0) {
        verticalSpeedMs = totalAltDelta / totalDt;
      }
    }

    if (dirCount > 0) {
      const avgRad = Math.atan2(dirX, dirY);
      bearingDeg = ((avgRad * 180) / Math.PI + 360) % 360;
    }

    // Total distance covered along the whole track (used as a 24h-ish proxy)
    let distanceLast24hKm: number | null = null;
    if (points.length >= 2) {
      let totalDistMeters = 0;
      for (let i = 1; i < points.length; i += 1) {
        const p1 = points[i - 1];
        const p2 = points[i];
        totalDistMeters += haversineMeters(p1.lat, p1.lon, p2.lat, p2.lon);
      }
      distanceLast24hKm = totalDistMeters / 1000;
    }

    // Take the last handful of altitude samples for the sparkline
    const slice = points.slice(Math.max(0, points.length - 30));
    const altHistoryKm: number[] = [];
    const altHistoryTimestamps: string[] = [];
    let lastAltForHistory: number | null = null;
    slice.forEach((p) => {
      const alt = p.alt ?? lastAltForHistory ?? 0;
      altHistoryKm.push(alt);
      altHistoryTimestamps.push(p.timestamp);
      lastAltForHistory = alt;
    });

    return {
      id: track.id,
      lat: last.lat,
      lon: last.lon,
      alt: last.alt ?? null,
      timestamp: last.timestamp,
      weather: wx,
      verticalSpeedMs,
      groundSpeedMs,
      bearingDeg,
      altHistoryKm,
      altHistoryTimestamps,
      distanceLast24hKm,
    };
  }, [history, selectedBalloonId, avgWindowHours]);

  // Derived helper values for the “altitude heatmap” visualization
  const ALT_MIN_KM = 0;
  const ALT_MAX_KM = 30;

  let altitudePointerPercent: number | null = null;
  if (selectedSummary && selectedSummary.alt != null) {
    const clamped = Math.max(
      ALT_MIN_KM,
      Math.min(selectedSummary.alt, ALT_MAX_KM)
    );
    altitudePointerPercent =
      ((clamped - ALT_MIN_KM) / (ALT_MAX_KM - ALT_MIN_KM)) * 100;
  }

  // Normalized vertical speed position for the ascent/descent slider
  const VERTICAL_MAX_MS = 0.5;
  let verticalPointerPercent: number | null = null;
  if (selectedSummary?.verticalSpeedMs != null) {
    const v = Math.max(
      -VERTICAL_MAX_MS,
      Math.min(selectedSummary.verticalSpeedMs, VERTICAL_MAX_MS)
    );
    verticalPointerPercent =
      ((v + VERTICAL_MAX_MS) / (2 * VERTICAL_MAX_MS)) * 100;
  }

  // Normalized ground speed for the horizontal speed bar
  const GROUND_MAX_MS = 100;
  let groundSpeedPercent: number | null = null;
  if (selectedSummary?.groundSpeedMs != null) {
    const g = Math.max(
      0,
      Math.min(selectedSummary.groundSpeedMs, GROUND_MAX_MS)
    );
    groundSpeedPercent = (g / GROUND_MAX_MS) * 100;
  }

  // Bucket the balloon into a simple flight state based on average vertical speed
  type FlightState = "ascending" | "descending" | "cruising" | "stagnant" | "unknown";
  let flightState: FlightState = "unknown";
  if (selectedSummary?.verticalSpeedMs != null) {
    const v = selectedSummary.verticalSpeedMs;
    if (Math.abs(v) < 0.05) {
      flightState = "stagnant";
    } else if (v > 0.1) {
      flightState = "ascending";
    } else if (v < -0.1) {
      flightState = "descending";
    } else {
      flightState = "cruising";
    }
  }

  // Temperature mapping for the colored temperature bar
  const TEMP_MIN_C = -60;
  const TEMP_MAX_C = 40;
  let tempPointerPercent: number | null = null;
  if (selectedSummary?.weather?.temperatureC != null) {
    const t = Math.max(
      TEMP_MIN_C,
      Math.min(selectedSummary.weather.temperatureC, TEMP_MAX_C)
    );
    tempPointerPercent =
      ((t - TEMP_MIN_C) / (TEMP_MAX_C - TEMP_MIN_C)) * 100;
  }

  // Build a small SVG path string for the recent altitude trend sparkline
  const altitudeSparklinePath = useMemo(() => {
    if (!selectedSummary || selectedSummary.altHistoryKm.length < 2) return "";

    const data = selectedSummary.altHistoryKm;
    const width = 100;
    const height = 32;

    let min = Math.min(...data);
    let max = Math.max(...data);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return "";

    if (Math.abs(max - min) < 0.001) {
      min -= 0.5;
      max += 0.5;
    }
    const range = max - min;

    const pts = data.map((alt, i) => {
      const x = (i / (data.length - 1)) * width;
      const norm = (alt - min) / range;
      const y = height - norm * height;
      return { x, y };
    });

    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i += 1) {
      d += ` L ${pts[i].x},${pts[i].y}`;
    }
    return d;
  }, [selectedSummary]);

  // In-memory cache of city/state/country rows parsed from Locations.csv
  const [locations, setLocations] = useState<
    {
      city: string;
      state: string;
      country: string;
      lat: number;
      lon: number;
      cityLower: string;
      stateLower: string;
      countryLower: string;
    }[]
  >([]);

  // Lazy-load the Locations.csv file in the background and normalize it for search
  useEffect(() => {
    async function loadLocationsCsv() {
      try {
        const res = await fetch("/locations/Locations.csv");
        if (!res.ok) return;

        const text = await res.text();
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length <= 1) return;

        const header = lines[0].split(",").map((h) => h.trim().toLowerCase());

        const cityIdx = header.indexOf("city_name");
        const stateIdx = header.indexOf("state_name");
        const countryIdx = header.indexOf("country_name");
        const latIdx = header.indexOf("latitude");
        const lonIdx = header.indexOf("longitude");

        if (
          cityIdx === -1 ||
          stateIdx === -1 ||
          countryIdx === -1 ||
          latIdx === -1 ||
          lonIdx === -1
        ) {
          return;
        }

        const parsed: {
          city: string;
          state: string;
          country: string;
          lat: number;
          lon: number;
          cityLower: string;
          stateLower: string;
          countryLower: string;
        }[] = [];

        for (let i = 1; i < lines.length; i += 1) {
          const raw = lines[i];
          if (!raw.trim()) continue;

          const parts = raw.split(",").map((p) =>
            p.trim().replace(/^"|"$/g, "")
          );

          if (
            parts.length <=
            Math.max(cityIdx, stateIdx, countryIdx, latIdx, lonIdx)
          ) {
            continue;
          }

          const city = parts[cityIdx] ?? "";
          const state = parts[stateIdx] ?? "";
          const country = parts[countryIdx] ?? "";
          const lat = parseFloat(parts[latIdx]);
          const lon = parseFloat(parts[lonIdx]);

          if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

          parsed.push({
            city,
            state,
            country,
            lat,
            lon,
            cityLower: city.toLowerCase(),
            stateLower: state.toLowerCase(),
            countryLower: country.toLowerCase(),
          });
        }

        setLocations(parsed);
      } catch {
      }
    }

    loadLocationsCsv();
  }, []);

  // Turn free-text location search into a ranked list of city/state/country hits
  const locationSuggestions = useMemo(() => {
    const q = locationQuery.trim().toLowerCase();
    if (!q)
      return [] as { label: string; lat: number; lon: number }[];

    const cityMatches: typeof locations = [];
    const stateMatches: typeof locations = [];
    const countryMatches: typeof locations = [];

    for (const loc of locations) {
      const isCityMatch = loc.cityLower.includes(q);
      const isStateMatch = loc.stateLower.includes(q);
      const isCountryMatch = loc.countryLower.includes(q);

      if (isCityMatch) {
        cityMatches.push(loc);
      } else if (isStateMatch) {
        stateMatches.push(loc);
      } else if (isCountryMatch) {
        countryMatches.push(loc);
      }
    }

    const ordered = [...cityMatches, ...stateMatches, ...countryMatches];

    return ordered.slice(0, 50).map((loc) => {
      const pieces = [loc.city, loc.state, loc.country].filter(
        (p) => p && p.length > 0
      );
      return {
        label: pieces.join(", "),
        lat: loc.lat,
        lon: loc.lon,
      };
    });
  }, [locationQuery, locations]);

  // Suggestions for balloon IDs matching the text input
  const balloonSuggestions = useMemo(() => {
    if (!history) return [] as { id: string }[];

    const q = balloonQuery.trim().toLowerCase();
    if (!q) return [];

    const matches: { id: string }[] = [];

    Object.values(history.balloons).forEach((track) => {
      if (track.id.toLowerCase().includes(q)) {
        matches.push({ id: track.id });
      }
    });

    return matches.slice(0, 50);
  }, [balloonQuery, history]);

  // Keyboard/mouse listeners that only exist while fly mode is active
  useEffect(() => {
    if (!flyModeActive) return;

    const handleKey = (e: KeyboardEvent) => {
      if (showFlyHint) {
        setShowFlyHint(false);
      }
      if (e.key === "Escape") {
        setFlyModeActive(false);
        setShowFlyHint(false);
        setPanelOpen(true);
      }
    };

    const handleMouse = () => {
      if (showFlyHint) {
        setShowFlyHint(false);
      }
    };

    window.addEventListener("keydown", handleKey);
    window.addEventListener("mousedown", handleMouse);

    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("mousedown", handleMouse);
    };
  }, [flyModeActive, showFlyHint]);

  // Simple UI event handlers below for selection, navigation, and view state wiring
  const handleBalloonSelect = (id: string | null) => {
    setSelectedBalloonId(id);
  };

  const handleCenterOnSelectedBalloon = () => {
    if (!history || !selectedBalloonId) return;

    const track = history.balloons[selectedBalloonId];
    if (!track || !track.points.length) return;

    const last = track.points[track.points.length - 1];

    setFocusCenter({
      lat: last.lat,
      lon: last.lon,
    });

    setCurrentLocationLabel(`Balloon ${track.id}`);
  };

  const handleResetView = () => {
    setCameraResetToken((t) => t + 1);
    setFocusCenter(null);
    setFlyModeActive(false);
    setShowFlyHint(false);
    setPanelOpen(true);
  };

  const handleShareView = async () => {
    if (typeof window === "undefined") return;

    try {
      const urlObj = new URL(window.location.href);

      if (focusCenter) {
        urlObj.searchParams.set("lat", focusCenter.lat.toFixed(4));
        urlObj.searchParams.set("lon", focusCenter.lon.toFixed(4));
      }
      urlObj.searchParams.set("radiusKm", String(focusRadiusKm));

      const url = urlObj.toString();

      if (!navigator.clipboard) {
        setShareStatus("error");
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareStatus("copied");
      setTimeout(() => setShareStatus(""), 2000);
    } catch {
      setShareStatus("error");
      setTimeout(() => setShareStatus(""), 2000);
    }
  };

  const handleUseMyLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setFocusCenter({ lat: latitude, lon: longitude });
        setCurrentLocationLabel("My location");
      },
      () => {
      }
    );
  };

  const handleTeleport = () => {
    const lat = parseFloat(latInput);
    const lon = parseFloat(lonInput);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      lat >= -90 &&
      lat <= 90 &&
      lon >= -180 &&
      lon <= 180
    ) {
      setFocusCenter({ lat, lon });
      setCurrentLocationLabel("");
      setLatInput("");
      setLonInput("");
    }
  };

  const handleLocationSelect = (loc: { label: string; lat: number; lon: number }) => {
    setFocusCenter({ lat: loc.lat, lon: loc.lon });
    setCurrentLocationLabel(loc.label);
    setLocationQuery("");
  };

  const handleEnterFlyMode = () => {
    setFlyModeActive(true);
    setShowFlyHint(true);
    setPanelOpen(false);
    setSelectedBalloonId(null);
  };

  const handleToggleCompass = () => {
    setShowCompass((prev) => !prev);
  };

  const handleUnselectBalloon = () => {
    setSelectedBalloonId(null);
  };
  // Top-level render: layout shell, top bar, main world view, and overlays
  return (
    <main
      className="wb-root"
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* Top bar: view toggle, app title, and last-updated pill */}
      <header
        className="wb-topbar"
        style={{
          position: "fixed",
          top: 16,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 40,
          width: "min(1120px, calc(100% - 32px))",
          padding: "10px 16px",
          borderRadius: 999,
          background:
            "radial-gradient(circle at top left, rgba(15,23,42,0.9), rgba(15,23,42,0.7))",
          border: "1px solid rgba(148,163,184,0.7)",
          boxShadow: "0 18px 45px rgba(15,23,42,0.9)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div className="wb-topbar-left">
          {/* View mode switcher between 3D globe and flat map */}
          <div className="wb-view-toggle">
            <div
              className="wb-view-toggle-thumb"
              style={{
                left: viewMode === "globe" ? "2px" : "50%",
              }}
            />
            <button
              type="button"
              className={
                "wb-view-toggle-option" +
                (viewMode === "globe" ? " wb-view-toggle-option--active" : "")
              }
              onClick={() => {
                setViewMode("globe");
                setFocusCenter(null);
              }}
            >
              Globe view
            </button>
            <button
              type="button"
              className={
                "wb-view-toggle-option" +
                (viewMode === "map" ? " wb-view-toggle-option--active" : "")
              }
              onClick={() => {
                setViewMode("map");

                setFocusCenter((current) =>
                  current ?? { lat: 51.49, lon: -0.01 }
                );

                setCurrentLocationLabel((current) =>
                  current || "Greenwich, England"
                );
              }}
            >
              Map view
            </button>
          </div>
        </div>

        {/* Centered product title over the top bar */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            pointerEvents: "none",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#e5e7eb",
              textShadow: "0 0 10px rgba(15,23,42,0.8)",
            }}
          >
            Weather Voyager - WindMap
          </div>
        </div>

        {/* Right-side pill showing when the data snapshot was last updated */}
        <div
          className="wb-stat-pill"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: "6px 12px",
            borderRadius: 12,
            border: "1px solid rgba(148,163,184,0.45)",
            background: "rgba(30,41,59,0.55)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span
              className="wb-stat-label"
              style={{
                fontSize: 11,
                opacity: 0.85,
                whiteSpace: "nowrap",
              }}
            >
              Last updated
            </span>

            <div
              style={{
                padding: "1px 6px",
                fontSize: 10,
                borderRadius: 6,
                background: "rgba(148,163,184,0.25)",
                border: "1px solid rgba(148,163,184,0.35)",
                whiteSpace: "nowrap",
                color: "#e5e7eb",
              }}
            >
              24h window
            </div>
          </div>

          <span
            className="wb-stat-value"
            style={{
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: "0.01em",
              whiteSpace: "nowrap",
            }}
          >
            {loading ? "Loading…" : lastUpdatedDisplay || "—"}
          </span>
        </div>
      </header>

      {/* Small toggle button to open/close the right-side map panel on flat view */}
      {(viewMode === "map" || viewMode === "globe") && (
        <button
          type="button"
          className="wb-panel-toggle wb-panel-toggle--icon"
          onClick={() => setPanelOpen((open) => !open)}
          style={{
            position: "fixed",
            top: 50,
            right: 24,
            zIndex: 45,
          }}
          title={panelOpen ? "Hide panel" : "Show panel"}
        >
          ⋮
        </button>
      )}

      {/* Main content area: world visualization plus overlays and side panels */}
      <section
        className="wb-workspace"
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
        }}
      >
        {/* Fullscreen canvas area that hosts the globe or flat map */}
        <div
          className="wb-world"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 0,
            borderRadius: 0,
            overflow: "hidden",
          }}
        >
          {error && (
            <div className="wb-error-banner">
              <span>Could not load live constellation: </span>
              <span className="wb-error-text">{error}</span>
            </div>
          )}

          {!history && !error && (
            <div
              className="wb-loading-banner"
              style={{
                top: 150,
                zIndex: 60,
              }}
            >
              Loading constellation…
            </div>
          )}

          {/* Main world view */}
          {history && (
            <>
              {viewMode === "globe" ? (
              <GlobeView
                history={history}
                selectedBalloonId={selectedBalloonId}
                onBalloonSelect={handleBalloonSelect}
                altitudeRangeKm={altitudeRangeKm}
                focusCenter={focusCenter}
              />
              ) : (
                <FlatGlobeView
                  history={history}
                  selectedBalloonId={selectedBalloonId}
                  onBalloonSelect={handleBalloonSelect}
                  focusCenter={focusCenter}
                  focusRadiusKm={focusRadiusKm}
                  flyModeActive={flyModeActive}
                  mapType={mapType}
                  showCompass={showCompass}
                  cameraResetToken={cameraResetToken}
                  onHeadingChange={setHeadingDeg}
                />
              )}
            </>
          )}

          {/* Home button */}
          <Link
            href="/"
            aria-label="Back to Weather Voyager landing page"
            style={{
              position: "fixed",
              top: 40,
              left: 50,
              zIndex: 40,
              textDecoration: "none",
            }}
          >
            <div
              style={{
                width: 50,
                height: 50,
                borderRadius: "999px",
                background:
                  "radial-gradient(circle at top left, rgba(15,23,42,0.9), rgba(15,23,42,0.6))",
                border: "1px solid rgba(148,163,184,0.7)",
                boxShadow: "0 18px 45px rgba(15,23,42,0.9)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",

                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <img
                src="/logo/Icon.png"
                alt="Weather Voyager"
                style={{
                  width: 40,
                  height: 40,
                  opacity: 1,
                }}
              />
            </div>
          </Link>

          {/* Compass */}
          {showCompass && viewMode === "map" && (
            <div
              style={{
                position: "fixed",
                bottom: 24,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 40,
                width: 80,
                height: 80,
                borderRadius: "999px",
                border: "1px solid rgba(148,163,184,0.7)",
                background:
                  "radial-gradient(circle at 30% 30%, rgba(30,64,175,0.4), rgba(15,23,42,0.95))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#e5e7eb",
                fontSize: 11,
                boxShadow: "0 14px 35px rgba(15,23,42,0.85)",
                backdropFilter: "blur(8px)",
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: "70%",
                  height: "70%",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: -6,
                    left: "50%",
                    transform: "translateX(-50%)",
                    fontWeight: 700,
                  }}
                >
                  N
                </div>
                <div
                  style={{
                    position: "absolute",
                    bottom: -6,
                    left: "50%",
                    transform: "translateX(-50%)",
                    opacity: 0.7,
                  }}
                >
                  S
                </div>
                <div
                  style={{
                    position: "absolute",
                    left: -8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    opacity: 0.7,
                  }}
                >
                  W
                </div>
                <div
                  style={{
                    position: "absolute",
                    right: -8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    opacity: 0.7,
                  }}
                >
                  E
                </div>

                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: `translate(-50%, -50%) rotate(${-headingDeg}deg)`,
                    transformOrigin: "50% 50%",
                    transition: "transform 0.05s linear",
                    width: 2,
                    height: 40,
                    borderRadius: 999,
                    background:
                      "linear-gradient(to bottom, #f97316 0%, #f97316 50%, #0f172a 50%, #0f172a 100%)",
                  }}
                />
              </div>
            </div>
          )}

          {/* Fullscreen hint overlay shown briefly when entering fly mode */}
          {flyModeActive && showFlyHint && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
                zIndex: 50,
              }}
            >
              <div
                style={{
                  pointerEvents: "auto",
                  padding: "18px 22px",
                  borderRadius: 16,
                  maxWidth: 360,
                  background:
                    "radial-gradient(circle at top, rgba(15,23,42,0.98), rgba(15,23,42,0.94))",
                  border: "1px solid rgba(248,113,113,0.9)",
                  boxShadow: "0 22px 60px rgba(15,23,42,0.95)",
                  color: "#e5e7eb",
                  fontSize: 13,
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    marginBottom: 8,
                    fontSize: 14,
                  }}
                >
                  Fly Mode Controls
                </div>
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    display: "grid",
                    gap: 4,
                  }}
                >
                  <li>W/A/S/D – Move forward / left / back / right</li>
                  <li>Space – Move up</li>
                  <li>Shift – Move down</li>
                  <li>Mouse – Look around</li>
                  <li>Click anywhere to start flying</li>
                  <li>Esc – Exit fly mode</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Left side panel showing detailed telemetry for the selected balloon */}
        {selectedSummary && (
          <aside
            className="wb-sidepanel wb-sidepanel--open"
            style={{
              position: "fixed",
              left: 24,
              top: 120,
              zIndex: 35,
              width: 320,
              pointerEvents: "auto",
              maxHeight: "calc(100vh - 140px)",
              overflow: "hidden",
            }}
          >
            <div
              className="wb-sidepanel-inner"
              style={{
                height: "100%",
                overflowY: "auto",
              }}
            >
              {/* Panel header explaining what this panel represents */}
              <div className="wb-sidepanel-header">
                <div>
                  <div className="wb-sidepanel-title">Balloon stats</div>
                  <div className="wb-sidepanel-subtitle">
                    Latest snapshot for the selected balloon.
                  </div>
                </div>
              </div>

              {/* Primary stats card: position, altitude, temperature, wind + quick actions */}
              <div className="wb-panel-section">
                <div className="wb-detail-card">
                  <div className="wb-detail-heading">
                    <div>
                      <div className="wb-detail-id">{selectedSummary.id}</div>
                      <div className="wb-detail-timestamp">
                        Last snapshot:
                        <span> {selectedSummary.timestamp}</span>
                      </div>
                    </div>
                  </div>

                  <div className="wb-detail-grid">
                    <div>
                      <div className="wb-detail-label">
                        Latitude / Longitude
                      </div>
                      <div className="wb-detail-value">
                        {selectedSummary.lat.toFixed(2)},{" "}
                        {selectedSummary.lon.toFixed(2)}
                      </div>
                    </div>

                    <div>
                      <div className="wb-detail-label">Altitude</div>
                      <div className="wb-detail-value">
                        {selectedSummary.alt != null
                          ? `${selectedSummary.alt.toFixed(1)} km`
                          : "n/a"}
                      </div>
                    </div>

                    <div>
                      <div className="wb-detail-label">Temperature</div>
                      <div className="wb-detail-value">
                        {selectedSummary.weather &&
                        selectedSummary.weather.temperatureC != null
                          ? `${selectedSummary.weather.temperatureC.toFixed(
                              1
                            )} °C`
                          : "n/a"}
                      </div>
                    </div>

                    <div>
                      <div className="wb-detail-label">
                        Wind speed / direction
                      </div>
                      <div className="wb-detail-value">
                        {selectedSummary.weather &&
                        selectedSummary.weather.windSpeedMs != null
                          ? `${selectedSummary.weather.windSpeedMs.toFixed(
                              1
                            )} m/s${
                              selectedSummary.weather.windDirectionDeg != null
                                ? ` @ ${selectedSummary.weather.windDirectionDeg.toFixed(
                                    0
                                  )}°`
                                : ""
                            }`
                          : "n/a"}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="wb-search-button"
                    style={{
                      marginTop: "8px",
                      width: "100%",
                      background:
                        "linear-gradient(135deg, #16a34a, #22c55e)",
                    }}
                    onClick={handleCenterOnSelectedBalloon}
                  >
                    Center to balloon
                  </button>

                  <button
                    type="button"
                    className="wb-search-button"
                    style={{
                      marginTop: "8px",
                      width: "100%",
                      background:
                        "linear-gradient(135deg, #b91c1c, #ef4444)",
                    }}
                    onClick={handleUnselectBalloon}
                  >
                    Unselect Balloon
                  </button>
                </div>
              </div>

              {/* Compact altitude “heatmap” showing where the balloon sits in the 0–30 km band */}
              <div className="wb-panel-section" style={{ marginTop: 12 }}>
                <div className="wb-detail-card">
                  <div className="wb-detail-heading">
                    <div>
                      <div className="wb-detail-id">Altitude heatmap</div>
                      <div className="wb-detail-timestamp">
                        0 km to 30 km band
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div
                      style={{
                        position: "relative",
                        height: 18,
                        borderRadius: 999,
                        background:
                          "linear-gradient(90deg, #22c55e, #84cc16, #eab308, #f97316, #ef4444)",
                        boxShadow:
                          "inset 0 0 0 1px rgba(15,23,42,0.7)",
                      }}
                    >
                      {altitudePointerPercent !== null && (
                        <div
                          style={{
                            position: "absolute",
                            top: 3,
                            left: `calc(${altitudePointerPercent}% - 6px)`,
                            width: 12,
                            height: 12,
                            borderRadius: "999px",
                            border: "2px solid #e5e7eb",
                            background: "#0f172a",
                            boxShadow:
                              "0 0 0 2px rgba(15,23,42,0.85)",
                          }}
                        />
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginTop: 6,
                        fontSize: 11,
                        opacity: 0.8,
                      }}
                    >
                      <span>Surface</span>
                      <span>Stratosphere</span>
                    </div>

                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 11,
                        opacity: 0.9,
                      }}
                    >
                      {selectedSummary.alt != null
                        ? `Current altitude: ${selectedSummary.alt.toFixed(
                            1
                          )} km`
                        : "Altitude unknown for this snapshot."}
                    </div>
                  </div>
                </div>
              </div>

              {/* Flight state block: distance, vertical speed, horizontal speed, and average heading */}
              <div className="wb-panel-section" style={{ marginTop: 12 }}>
                <div className="wb-detail-card">
                  <div
                    className="wb-detail-heading"
                    style={{
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div className="wb-detail-id">Flight state</div>

                      <div
                        className="wb-detail-timestamp"
                        style={{
                          marginTop: 4,
                          fontSize: 11,
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            flexWrap: "wrap",
                          }}
                        >
                          <span>Avg window.</span>

                          <div
                            style={{
                              position: "relative",
                              display: "inline-block",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => setAvgWindowMenuOpen((open) => !open)}
                              style={{
                                borderRadius: 999,
                                border: "1px solid rgba(148,163,184,0.5)",
                                background: "rgba(15,23,42,0.9)",
                                fontSize: 11,
                                padding: "4px 10px",
                                color: "#e5e7eb",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                cursor: "pointer",
                                minWidth: 66,
                                justifyContent: "space-between",
                              }}
                            >
                              <span>{avgWindowHours}h</span>
                              <span
                                style={{
                                  fontSize: 9,
                                  opacity: 0.8,
                                  transform: avgWindowMenuOpen ? "rotate(180deg)" : "rotate(0deg)",
                                  transition: "transform 0.15s ease-out",
                                }}
                              >
                                ▼
                              </span>
                            </button>

                            {avgWindowMenuOpen && (
                              <div
                                style={{
                                  position: "absolute",
                                  top: "calc(100% + 4px)",
                                  left: 0,
                                  zIndex: 30,
                                  borderRadius: 10,
                                  border: "1px solid rgba(148,163,184,0.6)",
                                  background:
                                    "radial-gradient(circle at top, rgba(15,23,42,0.98), rgba(15,23,42,0.94))",
                                  boxShadow: "0 14px 35px rgba(15,23,42,0.95)",
                                  padding: 4,
                                  minWidth: 80,
                                }}
                              >
                                {[3, 6, 12, 24].map((h) => (
                                  <button
                                    key={h}
                                    type="button"
                                    className="avg-window-option"
                                    onClick={() => {
                                      setAvgWindowHours(h as 3 | 6 | 12 | 24);
                                      setAvgWindowMenuOpen(false);
                                    }}
                                    style={{
                                      width: "100%",
                                      textAlign: "left",
                                      padding: "6px 10px",
                                      borderRadius: 8,
                                      border: "none",
                                      background: "transparent",
                                      color: "#e5e7eb",
                                      fontSize: 11,
                                      cursor: "pointer",
                                      transition:
                                        "background 0.15s ease-out, box-shadow 0.15s ease-out, transform 0.05s ease-out",
                                    }}
                                  >
                                    {h}h
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ opacity: 0.8 }}>Distance still shown for last 24h.</div>
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "2px 10px",
                        borderRadius: 999,
                        fontSize: 11,
                        textTransform: "capitalize",
                        background:
                          flightState === "ascending"
                            ? "rgba(34,197,94,0.18)"
                            : flightState === "descending"
                            ? "rgba(239,68,68,0.2)"
                            : flightState === "cruising"
                            ? "rgba(59,130,246,0.18)"
                            : "rgba(148,163,184,0.15)",
                        border:
                          flightState === "ascending"
                            ? "1px solid rgba(34,197,94,0.7)"
                            : flightState === "descending"
                            ? "1px solid rgba(239,68,68,0.7)"
                            : flightState === "cruising"
                            ? "1px solid rgba(59,130,246,0.7)"
                            : "1px solid rgba(148,163,184,0.5)",
                        color: "#e5e7eb",
                      }}
                    >
                      {flightState === "unknown" ? "Unknown" : flightState}
                    </div>
                  </div>

                  <div style={{ marginTop: 10, fontSize: 11 }}>
                    <div
                      className="wb-detail-label"
                      style={{ marginBottom: 2 }}
                    >
                      Distance travelled (last 24h)
                    </div>
                    <div style={{ opacity: 0.9 }}>
                      {selectedSummary?.distanceLast24hKm != null
                        ? `${selectedSummary.distanceLast24hKm.toFixed(1)} km`
                        : "n/a"}
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div
                      className="wb-detail-label"
                      style={{ marginBottom: 4 }}
                    >
                      {`Ascent / descent rate (last ${avgWindowHours}h)`}
                    </div>
                    <div
                      style={{
                        position: "relative",
                        height: 18,
                        borderRadius: 999,
                        background:
                          "linear-gradient(90deg, #ef4444, #64748b, #22c55e)",
                        boxShadow:
                          "inset 0 0 0 1px rgba(15,23,42,0.7)",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          left: "50%",
                          top: 0,
                          bottom: 0,
                          width: 1,
                          background: "rgba(15,23,42,0.95)",
                          opacity: 0.7,
                        }}
                      />
                      {verticalPointerPercent !== null && (
                        <div
                          style={{
                            position: "absolute",
                            top: 3,
                            left: `calc(${verticalPointerPercent}% - 6px)`,
                            width: 12,
                            height: 12,
                            borderRadius: "999px",
                            border: "2px solid #e5e7eb",
                            background: "#0f172a",
                            boxShadow:
                              "0 0 0 2px rgba(15,23,42,0.85)",
                          }}
                        />
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginTop: 4,
                        fontSize: 11,
                        opacity: 0.8,
                      }}
                    >
                      <span>Descending</span>
                      <span>Ascending</span>
                    </div>
                    <div style={{ marginTop: 2, fontSize: 11 }}>
                      {selectedSummary?.verticalSpeedMs != null
                        ? `Avg vertical speed (last ${avgWindowHours}h): ${selectedSummary.verticalSpeedMs.toFixed(
                            2
                          )} m/s`
                        : `Avg vertical speed (last ${avgWindowHours}h): n/a`}
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div
                      className="wb-detail-label"
                      style={{ marginBottom: 4 }}
                    >
                      {`Average speed (last ${avgWindowHours}h)`}
                    </div>
                    <div
                      style={{
                        position: "relative",
                        height: 10,
                        borderRadius: 999,
                        background: "rgba(15,23,42,0.85)",
                        overflow: "hidden",
                        boxShadow:
                          "inset 0 0 0 1px rgba(30,64,175,0.6)",
                      }}
                    >
                      {groundSpeedPercent !== null && (
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: `${groundSpeedPercent}%`,
                            borderRadius: 999,
                            background:
                              "linear-gradient(90deg, #0ea5e9, #22c55e, #facc15)",
                          }}
                        />
                      )}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 11 }}>
                      {selectedSummary?.groundSpeedMs != null
                        ? `Avg ground speed (last ${avgWindowHours}h): ${selectedSummary.groundSpeedMs.toFixed(
                            1
                          )} m/s`
                        : `Avg ground speed (last ${avgWindowHours}h): n/a`}
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 12,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      fontSize: 11,
                    }}
                  >
                    <div>{`Average direction (last ${avgWindowHours}h)`}</div>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "999px",
                        border:
                          "1px solid rgba(148,163,184,0.6)",
                        position: "relative",
                        background:
                          "radial-gradient(circle at 30% 30%, rgba(30,64,175,0.4), rgba(15,23,42,0.95))",
                      }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "999px",
                          border: "1px solid rgba(148,163,184,0.6)",
                          position: "relative",
                          background:
                            "radial-gradient(circle at 30% 30%, rgba(30,64,175,0.4), rgba(15,23,42,0.95))",
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            inset: 6,
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              left: "50%",
                              bottom: "50%",
                              width: 2,
                              height: 14,
                              borderRadius: 999,
                              background: "#e5e7eb",
                              transformOrigin: "50% 100%",
                              transform: `translateX(-50%) rotate(${
                                selectedSummary?.bearingDeg ?? 0
                              }deg)`,
                              transition: "transform 0.1s linear",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <div style={{ opacity: 0.8 }}>
                      {selectedSummary?.bearingDeg != null
                        ? `${selectedSummary.bearingDeg.toFixed(0)}°`
                        : "n/a"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Card summarizing local wind and temperature conditions for the balloon */}
              <div className="wb-panel-section" style={{ marginTop: 12 }}>
                <div className="wb-detail-card">
                  <div className="wb-detail-heading">
                    <div>
                      <div className="wb-detail-id">Wind & temperature</div>
                      <div className="wb-detail-timestamp">
                        Local conditions around the balloon
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div style={{ fontSize: 11 }}>Wind direction</div>

                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "999px",
                        border: "1px solid rgba(148,163,184,0.6)",
                        position: "relative",
                        background:
                          "radial-gradient(circle at 30% 30%, rgba(30,64,175,0.4), rgba(15,23,42,0.95))",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          inset: 6,
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            left: "50%",
                            bottom: "50%",
                            width: 2,
                            height: 14,
                            borderRadius: 999,
                            background: "#f97316",
                            transformOrigin: "50% 100%",
                            transform: `translateX(-50%) rotate(${
                              selectedSummary.weather?.windDirectionDeg ?? 0
                            }deg)`,
                            transition: "transform 0.1s linear",
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ fontSize: 11, opacity: 0.85 }}>
                      {selectedSummary.weather?.windDirectionDeg != null
                        ? `${selectedSummary.weather.windDirectionDeg.toFixed(0)}°`
                        : "n/a"}
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div
                      className="wb-detail-label"
                      style={{ marginBottom: 4 }}
                    >
                      Temperature
                    </div>
                    <div
                      style={{
                        position: "relative",
                        height: 14,
                        borderRadius: 999,
                        background:
                          "linear-gradient(90deg, #0ea5e9, #22c55e, #facc15, #f97316, #ef4444)",
                        boxShadow:
                          "inset 0 0 0 1px rgba(15,23,42,0.7)",
                      }}
                    >
                      {tempPointerPercent !== null && (
                        <div
                          style={{
                            position: "absolute",
                            top: 2,
                            left: `calc(${tempPointerPercent}% - 6px)`,
                            width: 12,
                            height: 12,
                            borderRadius: "999px",
                            border: "2px solid #e5e7eb",
                            background: "#0f172a",
                            boxShadow:
                              "0 0 0 2px rgba(15,23,42,0.85)",
                          }}
                        />
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginTop: 4,
                        fontSize: 11,
                        opacity: 0.8,
                      }}
                    >
                      <span>Very cold</span>
                      <span>Very warm</span>
                    </div>
                    <div style={{ marginTop: 2, fontSize: 11 }}>
                      {selectedSummary.weather?.temperatureC != null
                        ? `Temperature: ${selectedSummary.weather.temperatureC.toFixed(
                            1
                          )} °C`
                        : "Temperature: n/a"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sparkline card visualizing recent altitude samples for this balloon */}
              <div
                className="wb-panel-section"
                style={{ marginTop: 12, marginBottom: 8 }}
              >
                <div className="wb-detail-card">
                  <div className="wb-detail-heading">
                    <div>
                      <div className="wb-detail-id">Altitude trend</div>
                      <div className="wb-detail-timestamp">
                        Recent samples along the path
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <svg
                      viewBox="0 0 100 32"
                      preserveAspectRatio="none"
                      style={{
                        width: "100%",
                        height: 40,
                        borderRadius: 8,
                        background:
                          "linear-gradient(to bottom, rgba(15,23,42,0.4), rgba(15,23,42,0.9))",
                      }}
                    >
                      {altitudeSparklinePath && (
                        <path
                          d={altitudeSparklinePath}
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth={1.5}
                        />
                      )}
                    </svg>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 11,
                        opacity: 0.8,
                      }}
                    >
                      {selectedSummary.altHistoryKm.length >= 2
                        ? "Showing last few altitude samples."
                        : "Not enough history to show trend."}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}
        {/* Right-side panel for globe view */}
        {viewMode === "globe" && (
          <aside
            className={"wb-sidepanel" + (panelOpen ? " wb-sidepanel--open" : "")}
            style={{
              position: "fixed",
              right: panelOpen ? 24 : -380,
              top: 100,
              zIndex: 35,
              width: 340,
              maxHeight: "calc(100vh - 120px)",
              pointerEvents: panelOpen ? "auto" : "none",
              transition: "right 0.25s ease-in-out",
            }}
          >
            <div
              className="wb-sidepanel-inner"
              style={{ height: "100%", overflowY: "auto" }}
            >
              {/* Header */}
              <div className="wb-sidepanel-header">
                <div>
                  <div className="wb-sidepanel-title">Globe controls</div>
                  <div className="wb-sidepanel-subtitle">
                    Contact, search balloons, and filter by altitude.
                  </div>
                </div>
              </div>

              {/* Contact Me*/}
              <div className="wb-panel-section">
                <div className="wb-field-group">
                  <div
                    className="wb-field-label"
                    style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}
                  >
                    Contact
                  </div>

                  <a
                    href="https://linkedin.com/in/tejaskoti"
                    target="_blank"
                    rel="noreferrer"
                    className="wb-search-button"
                    style={{
                      display: "inline-block",
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 999,
                      textAlign: "center",
                      textDecoration: "none",
                      background:
                        "linear-gradient(135deg, #a855f7, #ec4899)",
                    }}
                  >
                    Contact me
                  </a>
                </div>
              </div>

              {/* Divider */}
              <div
                style={{
                  margin: "8px 0 18px",
                  borderTop: "1px solid rgba(148,163,184,0.3)",
                }}
              />

              {/* Balloon Search */}
              <div className="wb-panel-section">
                <div className="wb-field-group">
                  <div
                    className="wb-field-label"
                    style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}
                  >
                    Balloon search
                  </div>

                  <div className="wb-search-row" style={{ position: "relative" }}>
                    <input
                      type="text"
                      className="wb-input"
                      placeholder="Search Balloon ID…"
                      value={balloonQuery}
                      onChange={(e) => setBalloonQuery(e.target.value)}
                    />
                  </div>

                  <div
                    className="wb-detail-value"
                    style={{ marginTop: 6, fontSize: 12 }}
                  >
                    {selectedBalloonId
                      ? `Current balloon: ${selectedBalloonId}`
                      : "Current balloon: none selected"}
                  </div>

                  {balloonSuggestions.length > 0 && (
                    <div
                      className="wb-dropdown wb-dropdown--locations"
                      style={{
                        marginTop: 6,
                        borderRadius: 12,
                        border: "1px solid rgba(148,163,184,0.4)",
                        background:
                          "radial-gradient(circle at top, rgba(15,23,42,0.98), rgba(15,23,42,0.92))",
                        fontSize: 12,
                      }}
                    >
                      <div className="wb-dropdown-scroll">
                        {balloonSuggestions.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            className="wb-location-option"
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: "4px 10px",
                              borderRadius: 999,
                              border: "none",
                              background: "transparent",
                              cursor: "pointer",
                            }}
                            onClick={() => {
                              handleBalloonSelect(b.id);
                              setBalloonQuery("");
                            }}
                          >
                            {b.id}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div
                style={{
                  marginTop: 16,
                  marginBottom: 16,
                  borderTop: "1px solid rgba(148,163,184,0.3)",
                }}
              />

              {/* ========================= */}
              {/* SECTION 3 — ALTITUDE FILTER */}
              {/* ========================= */}
              <div className="wb-panel-section">
                <div className="wb-field-group">
                  <div
                    className="wb-field-label"
                    style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}
                  >
                    Altitude filter
                  </div>

                  {/* Reused map radius slider styling */}
                  <div className="wb-radius-slider">
                    <input
                      type="range"
                      min={0}
                      max={30}
                      step={0.5}
                      value={altitudeRangeKm[1]}
                      onChange={(e) =>
                        setAltitudeRangeKm(([min]) => [
                          min,
                          Number(e.target.value),
                        ])
                      }
                    />
                  </div>

                  <div className="wb-detail-value" style={{ fontSize: 12 }}>
                    Up to {altitudeRangeKm[1].toFixed(1)} km
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* Right-side panel used only in map mode; contains search, sharing, navigation, and map settings */}
        {viewMode === "map" && (
          <aside
            className={"wb-sidepanel" + (panelOpen ? " wb-sidepanel--open" : "")}
            style={{
              position: "fixed",
              right: panelOpen ? 24 : -380,
              top: 100,
              zIndex: 35,
              width: 340,
              maxHeight: "calc(100vh - 120px)",
              pointerEvents: panelOpen ? "auto" : "none",
              transition: "right 0.25s ease-in-out",
            }}
          >
            <div
              className="wb-sidepanel-inner"
              style={{
                height: "100%",
                overflowY: "auto",
              }}
            >
              {/* Header showing what this panel controls */}
              <div className="wb-sidepanel-header">
                <div>
                  <div
                    className="wb-sidepanel-title"
                    style={{ fontSize: 18, fontWeight: 700 }}
                  >
                    Map controls
                  </div>
                  <div
                    className="wb-sidepanel-subtitle"
                    style={{ fontSize: 12, opacity: 0.85 }}
                  >
                    Share this view, jump to locations, and tune navigation.
                  </div>
                </div>
              </div>

              {/* Share tools + contact link */}
              <div className="wb-panel-section">
                <div className="wb-field-group">
                  <div
                    className="wb-field-label"
                    style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}
                  >
                    Share & contact
                  </div>

                  <button
                    type="button"
                    className="wb-search-button"
                    style={{ width: "100%", marginBottom: 6 }}
                    onClick={handleShareView}
                  >
                    Share current view
                  </button>

                  <a
                    href="https://linkedin.com/in/tejaskoti"
                    target="_blank"
                    rel="noreferrer"
                    className="wb-search-button"
                    style={{
                      display: "inline-block",
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 999,
                      textAlign: "center",
                      textDecoration: "none",
                      background:
                        "linear-gradient(135deg, #a855f7, #ec4899)",
                    }}
                  >
                    Contact me
                  </a>

                  {shareStatus === "copied" && (
                    <div
                      className="wb-detail-value"
                      style={{ marginTop: 8, fontSize: 11 }}
                    >
                      Link (with lat / lon / radius) copied to clipboard.
                    </div>
                  )}
                  {shareStatus === "error" && (
                    <div
                      className="wb-error-text"
                      style={{ marginTop: 8, fontSize: 11 }}
                    >
                      Could not copy automatically. Copy from the address bar instead.
                    </div>
                  )}
                </div>
              </div>

              {/* Divider before location tools */}
              <div
                style={{
                  margin: "8px 0 18px",
                  borderTop: "1px solid rgba(148,163,184,0.3)",
                }}
              />

              {/* Block for searching locations, balloons, and jumping to coordinates */}
              <div className="wb-panel-section">
                <div className="wb-field-group">
                  <div
                    className="wb-field-label"
                    style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}
                  >
                    Location & balloons
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      opacity: 0.8,
                      marginBottom: 8,
                    }}
                  >
                    Search locations, jump to balloons, or enter coordinates.
                  </div>

                  {/* Location search */}
                  <div className="wb-field-group">
                    <div
                      className="wb-field-label"
                      style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}
                    >
                      Location search
                    </div>
                    <div className="wb-search-row" style={{ position: "relative" }}>
                      <input
                        type="text"
                        className="wb-input"
                        placeholder="Search City, State, Country…"
                        value={locationQuery}
                        onChange={(e) => setLocationQuery(e.target.value)}
                      />
                    </div>

                    {locationSuggestions.length > 0 && (
                      <div
                        className="wb-dropdown wb-dropdown--locations"
                        style={{
                          marginTop: 4,
                          borderRadius: 12,
                          border: "1px solid rgba(148,163,184,0.4)",
                          background:
                            "radial-gradient(circle at top, rgba(15,23,42,0.98), rgba(15,23,42,0.92))",
                          fontSize: 12,
                        }}
                      >
                        <div className="wb-dropdown-scroll">
                          {locationSuggestions.map((loc) => (
                            <button
                              key={loc.label}
                              type="button"
                              className="wb-location-option"
                              style={{
                                width: "100%",
                                textAlign: "left",
                                padding: "4px 10px",
                                borderRadius: 999,
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                              }}
                              onClick={() => handleLocationSelect(loc)}
                            >
                              {loc.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      className="wb-reset-link"
                      style={{ marginTop: 6 }}
                      onClick={handleUseMyLocation}
                    >
                      Use my location
                    </button>

                    <div
                      className="wb-detail-value"
                      style={{ marginTop: 6, fontSize: 12 }}
                    >
                      {currentLocationLabel
                        ? `Current: ${currentLocationLabel}`
                        : focusCenter
                        ? `Current focus: ${focusCenter.lat.toFixed(
                            2
                          )}, ${focusCenter.lon.toFixed(2)}`
                        : "Current focus: not set"}
                    </div>
                  </div>

                  {/* Balloon search */}
                  <div className="wb-field-group" style={{ marginTop: 16 }}>
                    <div
                      className="wb-field-label"
                      style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}
                    >
                      Balloon search
                    </div>

                    <div
                      className="wb-search-row"
                      style={{ position: "relative" }}
                    >
                      <input
                        type="text"
                        className="wb-input"
                        placeholder="Search Balloon ID…"
                        value={balloonQuery}
                        onChange={(e) => setBalloonQuery(e.target.value)}
                      />
                    </div>

                    {balloonSuggestions.length > 0 && (
                      <div
                        className="wb-dropdown wb-dropdown--locations"
                        style={{
                          marginTop: 4,
                          borderRadius: 12,
                          border: "1px solid rgba(148,163,184,0.4)",
                          background:
                            "radial-gradient(circle at top, rgba(15,23,42,0.98), rgba(15,23,42,0.92))",
                          fontSize: 12,
                        }}
                      >
                        <div className="wb-dropdown-scroll">
                          {balloonSuggestions.map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              className="wb-location-option"
                              style={{
                                width: "100%",
                                textAlign: "left",
                                padding: "4px 10px",
                                borderRadius: 999,
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                              }}
                              onClick={() => {
                                handleBalloonSelect(b.id);
                                setBalloonQuery("");
                              }}
                            >
                              {b.id}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div
                      className="wb-detail-value"
                      style={{ marginTop: 6, fontSize: 12 }}
                    >
                      {selectedBalloonId
                        ? `Current balloon: ${selectedBalloonId}`
                        : "Current balloon: none selected"}
                    </div>
                  </div>

                  {/* Divider between searches and coordinate input */}
                  <div
                    style={{
                      marginTop: 16,
                      marginBottom: 16,
                      borderTop: "1px solid rgba(148,163,184,0.3)",
                    }}
                  />

                  {/* Manual coordinate entry */}
                  <div className="wb-field-group">
                    <div
                      className="wb-field-label"
                      style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}
                    >
                      Jump to coordinates
                    </div>
                    <div
                      className="wb-search-row"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                        gap: 8,
                      }}
                    >
                      <input
                        type="text"
                        className="wb-input"
                        placeholder="Lat"
                        value={latInput}
                        onChange={(e) => setLatInput(e.target.value)}
                      />
                      <input
                        type="text"
                        className="wb-input"
                        placeholder="Lon"
                        value={lonInput}
                        onChange={(e) => setLonInput(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      className="wb-search-button"
                      style={{ marginTop: 8, width: "100%" }}
                      onClick={handleTeleport}
                    >
                      Teleport
                    </button>
                  </div>

                  {/* Radius slider controlling map coverage */}
                  <div className="wb-field-group" style={{ marginTop: 16 }}>
                    <div
                      className="wb-field-label"
                      style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}
                    >
                      Map radius (km)
                    </div>
                    <div className="wb-radius-slider">
                      <input
                        type="range"
                        min={500}
                        max={2500}
                        step={100}
                        value={focusRadiusKm}
                        onChange={(e) => setFocusRadiusKm(Number(e.target.value))}
                      />
                    </div>
                    <div className="wb-detail-value" style={{ fontSize: 12 }}>
                      {focusRadiusKm.toLocaleString()} km
                    </div>
                  </div>
                </div>
              </div>

              {/* Control buttons for fly mode, compass, and view reset */}
              <div className="wb-panel-section" style={{ marginTop: 24 }}>
                <div className="wb-field-group">
                  <div
                    className="wb-field-label"
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      marginBottom: 6,
                    }}
                  >
                    Controls & navigation
                  </div>

                  <button
                    type="button"
                    className="wb-search-button"
                    style={{
                      width: "100%",
                      marginBottom: 8,
                      background: flyModeActive
                        ? "linear-gradient(135deg, #b91c1c, #ef4444)"
                        : "linear-gradient(135deg, #b91c1c, #dc2626)",
                    }}
                    onClick={handleEnterFlyMode}
                  >
                    {flyModeActive
                      ? "Fly mode active (Esc to exit)"
                      : "Fly mode (WASD)"}
                  </button>

                  <button
                    type="button"
                    className="wb-search-button"
                    style={{ width: "100%", marginBottom: 8 }}
                    onClick={handleToggleCompass}
                  >
                    {showCompass ? "Hide compass" : "Show compass"}
                  </button>

                  <button
                    type="button"
                    className="wb-search-button"
                    style={{
                      width: "100%",
                      background: "linear-gradient(135deg, #16a34a, #22c55e)",
                    }}
                    onClick={handleResetView}
                  >
                    Reset view
                  </button>

                  <div
                    style={{
                      marginTop: 10,
                      fontSize: 11,
                      opacity: 0.8,
                      lineHeight: 1.4,
                    }}
                  >
                    Fly mode lets you roam freely around the space!
                  </div>
                </div>
              </div>

              {/* Map type toggle (dark or satellite) */}
              <div className="wb-panel-section" style={{ marginTop: 24, marginBottom: 8 }}>
                <div className="wb-field-group">
                  <div
                    className="wb-field-label"
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      marginBottom: 6,
                    }}
                  >
                    Map style
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: 40,
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      padding: 4,
                      borderRadius: 999,
                      background:
                        "radial-gradient(circle at top, rgba(15,23,42,0.95), rgba(15,23,42,0.9))",
                      border: "1px solid rgba(148,163,184,0.7)",
                      boxShadow: "0 10px 30px rgba(15,23,42,0.9)",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: 4,
                        bottom: 4,
                        width: "calc(50% - 4px)",
                        left: mapType === "dark" ? 4 : "calc(50% + 0px)",
                        borderRadius: 999,
                        transition: "left 0.18s ease-out",
                        background:
                          mapType === "dark"
                            ? "linear-gradient(135deg, #1d4ed8, #3b82f6)"
                            : "linear-gradient(135deg, #16a34a, #22c55e)",
                        pointerEvents: "none",
                      }}
                    />

                    <button
                      type="button"
                      onClick={() => setMapType("dark")}
                      style={{
                        flex: 1,
                        zIndex: 1,
                        height: "100%",
                        borderRadius: 999,
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        color: mapType === "dark" ? "#e5e7eb" : "#9ca3af",
                        fontSize: 14,
                        fontWeight: mapType === "dark" ? 700 : 500,
                      }}
                    >
                      Dark
                    </button>

                    <button
                      type="button"
                      onClick={() => setMapType("satellite")}
                      style={{
                        flex: 1,
                        zIndex: 1,
                        height: "100%",
                        borderRadius: 999,
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        color: mapType === "satellite" ? "#e5e7eb" : "#9ca3af",
                        fontSize: 14,
                        fontWeight: mapType === "satellite" ? 700 : 500,
                      }}
                    >
                      Satellite
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}
      </section>
    </main>
  );
}