export interface BalloonPoint {
  balloonId: string;
  timestamp: string;
  lat: number;
  lon: number;
  alt?: number | null;
  snapshotIndex: number;
}

export interface BalloonTrack {
  id: string;
  points: BalloonPoint[];
}

export interface BalloonHistoryResponse {
  generatedAt: string;
  points: BalloonPoint[];
  balloons: Record<string, BalloonTrack>;
}

export interface BalloonWeather {
  temperatureC: number | null;
  windSpeedMs: number | null;
  windDirectionDeg: number | null;
}

export interface BalloonHistoryWithWeatherResponse
  extends BalloonHistoryResponse {
  latestWeather: Record<string, BalloonWeather>;
}