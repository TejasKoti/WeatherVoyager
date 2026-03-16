export interface BalloonPoint {
  balloonId: string;
  missionId: string;
  pointId: string;
  timestamp: string;
  lat: number;
  lon: number;
  alt?: number | null;
  snapshotIndex: number;
}

export interface BalloonTrack {
  id: string;
  missionId: string;
  launchSiteId?: string | null;
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

export interface WindborneFlightDataPoint {
  transmit_time: string;
  latitude: number;
  longitude: number;
  altitude?: number | null;
  id: string;
}

export interface WindborneFlightPathResponse {
  flight_data: WindborneFlightDataPoint[];
  launch_site_id?: string | null;
}