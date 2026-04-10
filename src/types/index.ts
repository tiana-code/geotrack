export interface RoutePoint {
    latitude: number;
    longitude: number;
    heading?: number;
    speed?: number;
    timestamp?: string;
    fuelPercent?: number;
}

export interface VesselPosition {
    vesselId: string;
    name?: string;
    latitude: number;
    longitude: number;
    heading: number;
    course?: number;
    speed: number;
    status?: 'active' | 'maintenance' | 'offline';
    timestamp?: string;
    fuelPercent?: number;
}

export interface VesselRoute {
    vesselId: string;
    points: RoutePoint[];
    trajectoryPath?: [number, number][];
}

export type RGBAColor = [number, number, number, number];

export type ColorMode = 'STATUS' | 'FUEL' | 'SPEED';

export type TrailMode = 'ACTUAL' | 'PLANNED' | 'COMPARISON';

export interface TimeRange {
    start: Date;
    end: Date;
}

export function getTimestampMs(point: RoutePoint): number | null {
    if (!point.timestamp) return null;
    const ms = Date.parse(point.timestamp);
    return Number.isNaN(ms) ? null : ms;
}
