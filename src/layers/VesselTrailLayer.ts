import {PathLayer} from '@deck.gl/layers';
import type {Layer} from '@deck.gl/core';
import type {VesselPosition, VesselRoute, RoutePoint, RGBAColor, ColorMode, TrailMode, TimeRange} from '../types';
import {getTimestampMs} from '../types';
import {getVesselColor, getSpeedColor, getFuelColor} from './colorUtils.js';
import {haversineKm, calculateBearing} from '../utils';
import {doesSegmentCrossLand, LAND_CHECK_MIN_DISTANCE_KM} from '../utils';

export const MAX_TRAIL_POINTS = 500;
export const ACTUAL_GAP_THRESHOLD_KM = 50;
export const PLANNED_GAP_THRESHOLD_KM = 200;
const MIN_DEDUP_KM = 0.5;

export interface TrailData {
    vesselId: string;
    path: [number, number][];
    color: RGBAColor;
}

export interface VesselTrailLayerProps {
    id?: string;
    routes: Map<string, VesselRoute>;
    vessels: VesselPosition[];
    colorMode: ColorMode;
    visible?: boolean;
    maxPoints?: number;
    timeRange?: TimeRange;
    isDark?: boolean;
    trailMode?: TrailMode;
    zoom?: number;
}

const chaikinSmooth = (path: [number, number][], iterations = 2): [number, number][] => {
    if (path.length < 3 || iterations === 0) return path;
    let result = path;
    for (let iter = 0; iter < iterations; iter++) {
        const smoothed: [number, number][] = [result[0]];
        for (let i = 0; i < result.length - 1; i++) {
            const [x0, y0] = result[i];
            const [x1, y1] = result[i + 1];
            smoothed.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25]);
            smoothed.push([x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75]);
        }
        smoothed.push(result[result.length - 1]);
        result = smoothed;
    }
    return result;
};

const getChaikinIterations = (zoom: number): number => {
    if (zoom >= 12) return 0;
    if (zoom >= 8) return 1;
    if (zoom >= 4) return 2;
    return 3;
};

const catmullRomSmooth = (
    path: [number, number][],
    pointsPerSegment = 10,
): [number, number][] => {
    if (path.length < 3) return path;
    const result: [number, number][] = [path[0]];

    for (let i = 0; i < path.length - 1; i++) {
        const p0 = path[Math.max(0, i - 1)];
        const p1 = path[i];
        const p2 = path[i + 1];
        const p3 = path[Math.min(path.length - 1, i + 2)];

        for (let t = 1; t <= pointsPerSegment; t++) {
            const s = t / pointsPerSegment;
            const s2 = s * s;
            const s3 = s2 * s;

            const x =
                0.5 *
                (2 * p1[0] +
                    (-p0[0] + p2[0]) * s +
                    (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * s2 +
                    (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * s3);
            const y =
                0.5 *
                (2 * p1[1] +
                    (-p0[1] + p2[1]) * s +
                    (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * s2 +
                    (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * s3);

            result.push([x, y]);
        }
    }

    return result;
};

const smoothPath = (
    path: [number, number][],
    zoom: number,
    trailMode?: TrailMode,
): [number, number][] => {
    if (path.length < 3) return path;
    if (trailMode === 'ACTUAL') {
        if (zoom >= 14) return path;
        if (path.length < 10) return catmullRomSmooth(path);
        return chaikinSmooth(path, Math.max(1, getChaikinIterations(zoom)));
    }
    if (zoom >= 12) return path;
    if (path.length < 10) return catmullRomSmooth(path);
    return chaikinSmooth(path, getChaikinIterations(zoom));
};

const getTimestampMsOrZero = (point: RoutePoint): number =>
    getTimestampMs(point) ?? 0;

const binarySearchTime = (points: RoutePoint[], targetMs: number): number => {
    let low = 0;
    let high = points.length;
    while (low < high) {
        const mid = (low + high) >>> 1;
        if (getTimestampMsOrZero(points[mid]) < targetMs) low = mid + 1;
        else high = mid;
    }
    return low;
};

const ensureSortedByTime = (points: RoutePoint[]): RoutePoint[] => {
    for (let i = 1; i < points.length; i++) {
        if (getTimestampMsOrZero(points[i]) < getTimestampMsOrZero(points[i - 1])) {
            return [...points].sort((a, b) => getTimestampMsOrZero(a) - getTimestampMsOrZero(b));
        }
    }
    return points;
};

const filterPointsByTime = (
    points: RoutePoint[],
    timeRange?: TimeRange,
): RoutePoint[] => {
    if (!timeRange || points.length === 0) return points;

    const sorted = ensureSortedByTime(points);
    const startMs = timeRange.start.getTime();
    const endMs = timeRange.end.getTime();
    const startIdx = binarySearchTime(sorted, startMs);
    let endIdx = binarySearchTime(sorted, endMs + 1);
    if (endIdx > sorted.length) endIdx = sorted.length;

    return startIdx >= endIdx ? [] : sorted.slice(startIdx, endIdx);
};

const getPointColor = (
    point: RoutePoint,
    colorMode: ColorMode,
    vessel?: VesselPosition,
    isDark: boolean = true,
): RGBAColor => {
    switch (colorMode) {
        case 'SPEED':
            return getSpeedColor(point.speed ?? 0);
        case 'FUEL':
            return getFuelColor(point.fuelPercent ?? 100, isDark);
        default:
            return getVesselColor(
                {
                    ...(vessel ?? {vesselId: '', latitude: 0, longitude: 0, heading: 0, speed: point.speed ?? 0}),
                    speed: point.speed ?? 0,
                },
                'STATUS',
                isDark,
            );
    }
};

const colorKey = (color: RGBAColor): number =>
    (color[0] << 24) | (color[1] << 16) | (color[2] << 8) | (color[3] ?? 255);

const getSternPosition = (
    vessel: VesselPosition,
    trailPoints?: [number, number][],
    sternOffsetMeters = 28,
): [number, number] => {
    let heading: number | null = null;

    if (Number.isFinite(vessel.heading)) {
        heading = vessel.heading;
    } else if (vessel.course != null && Number.isFinite(vessel.course)) {
        heading = vessel.course;
    } else if (trailPoints && trailPoints.length >= 2) {
        const prev = trailPoints[trailPoints.length - 2];
        const curr = trailPoints[trailPoints.length - 1];
        heading = calculateBearing(prev[1], prev[0], curr[1], curr[0]);
    }

    if (heading === null) {
        return [vessel.longitude, vessel.latitude];
    }

    const reverseHeadingRad = ((heading + 180) % 360) * (Math.PI / 180);
    const deltaLat = (sternOffsetMeters / 111_320) * Math.cos(reverseHeadingRad);
    const cosLat = Math.cos((vessel.latitude * Math.PI) / 180) || 1;
    const deltaLon = (sternOffsetMeters / (111_320 * cosLat)) * Math.sin(reverseHeadingRad);
    return [vessel.longitude + deltaLon, vessel.latitude + deltaLat];
};

const prepareTrailData = (
    routes: Map<string, VesselRoute>,
    vessels: VesselPosition[],
    colorMode: ColorMode,
    maxPoints: number,
    timeRange?: TimeRange,
    isDark: boolean = true,
    trailMode: TrailMode = 'ACTUAL',
    zoom = 6,
): TrailData[] => {
    const result: TrailData[] = [];
    const defaultColor: RGBAColor = isDark ? [160, 170, 190, 100] : [100, 110, 130, 120];
    const vesselMap = new Map(vessels.map((v) => [v.vesselId, v]));

    routes.forEach((route, vesselId) => {
        const rawWaypoints = timeRange ? filterPointsByTime(route.points, timeRange) : route.points;
        if (rawWaypoints.length < 2) return;

        const vessel = vesselMap.get(vesselId);
        if (!vessel) return;

        let lastKept: { latitude: number; longitude: number } | null = null;
        const dedupedWaypoints = rawWaypoints.filter((wp) => {
            if (!lastKept) {
                lastKept = wp;
                return true;
            }
            const distance = haversineKm(lastKept.latitude, lastKept.longitude, wp.latitude, wp.longitude);
            if (distance < MIN_DEDUP_KM) return false;
            lastKept = wp;
            return true;
        });
        if (dedupedWaypoints.length < 2) return;

        const trimmedWaypoints = dedupedWaypoints.length > maxPoints
            ? dedupedWaypoints.slice(dedupedWaypoints.length - maxPoints)
            : dedupedWaypoints;

        if (trailMode === 'PLANNED' && route.trajectoryPath && route.trajectoryPath.length >= 2) {
            const rawPath = route.trajectoryPath as [number, number][];
            const smoothed = rawPath.length >= 3 ? smoothPath(rawPath, zoom, trailMode) : rawPath;
            result.push({vesselId, path: smoothed, color: defaultColor});
            return;
        }

        let currentPath: [number, number][] = [];
        let currentColorKey = 0;
        let currentColor: RGBAColor = defaultColor;

        const flushPath = (appendSternForVessel?: VesselPosition) => {
            if (currentPath.length >= 2) {
                const smoothed = currentPath.length >= 3 ? smoothPath(currentPath, zoom, trailMode) : currentPath;
                if (appendSternForVessel) {
                    smoothed.push(getSternPosition(
                        appendSternForVessel,
                        smoothed.length >= 2 ? smoothed.slice(-2) as [number, number][] : undefined,
                    ));
                }
                result.push({vesselId, path: smoothed, color: currentColor});
            }
            currentPath = [];
        };

        for (let i = 0; i < trimmedWaypoints.length; i++) {
            const waypoint = trimmedWaypoints[i];
            const waypointColor = trailMode === 'PLANNED'
                ? defaultColor
                : getPointColor(waypoint, colorMode, vessel, isDark);
            const waypointColorKey = colorKey(waypointColor);

            if (i === 0) {
                currentPath = [[waypoint.longitude, waypoint.latitude]];
                currentColor = waypointColor;
                currentColorKey = waypointColorKey;
                continue;
            }

            const prev = trimmedWaypoints[i - 1];
            const gapDistance = haversineKm(prev.latitude, prev.longitude, waypoint.latitude, waypoint.longitude);
            const teleportThreshold = trailMode === 'PLANNED'
                ? PLANNED_GAP_THRESHOLD_KM
                : ACTUAL_GAP_THRESHOLD_KM;

            if (gapDistance > teleportThreshold) {
                flushPath();
                currentPath = [[waypoint.longitude, waypoint.latitude]];
                currentColor = waypointColor;
                currentColorKey = waypointColorKey;
                continue;
            }

            if (
                trailMode !== 'ACTUAL' &&
                gapDistance > LAND_CHECK_MIN_DISTANCE_KM &&
                doesSegmentCrossLand(prev.latitude, prev.longitude, waypoint.latitude, waypoint.longitude)
            ) {
                flushPath();
                currentPath = [[waypoint.longitude, waypoint.latitude]];
                currentColor = waypointColor;
                currentColorKey = waypointColorKey;
                continue;
            }

            if (waypointColorKey !== currentColorKey) {
                currentPath.push([waypoint.longitude, waypoint.latitude]);
                flushPath();
                currentPath = [[waypoint.longitude, waypoint.latitude]];
                currentColor = waypointColor;
                currentColorKey = waypointColorKey;
                continue;
            }

            currentPath.push([waypoint.longitude, waypoint.latitude]);
        }

        if (trailMode !== 'PLANNED' && currentPath.length >= 1) {
            const lastPoint = currentPath[currentPath.length - 1];
            const bridgeDistance = haversineKm(lastPoint[1], lastPoint[0], vessel.latitude, vessel.longitude);
            if (bridgeDistance > 0.01 && bridgeDistance < ACTUAL_GAP_THRESHOLD_KM) {
                currentPath.push([vessel.longitude, vessel.latitude]);
            }
        }

        flushPath(trailMode !== 'PLANNED' ? vessel : undefined);
    });

    return result;
};

export function createVesselTrailLayers(props: VesselTrailLayerProps): Layer[] {
    const {
        id = 'vessel-trails',
        routes,
        vessels,
        colorMode,
        visible = true,
        maxPoints = MAX_TRAIL_POINTS,
        timeRange,
        isDark = true,
        trailMode = 'ACTUAL',
        zoom = 6,
    } = props;

    if (!visible || routes.size === 0) return [];

    const trailData = prepareTrailData(
        routes,
        vessels,
        colorMode,
        maxPoints,
        timeRange,
        isDark,
        trailMode,
        zoom,
    );

    if (trailData.length === 0) return [];

    return [
        new PathLayer<TrailData>({
            id,
            data: trailData,
            pickable: true,
            widthUnits: 'meters',
            widthMinPixels: 0.5,
            widthMaxPixels: 4,
            getPath: (d) => d.path,
            getColor: (d) => d.color,
            getWidth: 200,
            jointRounded: true,
            capRounded: true,
            billboard: false,
        }),
    ];
}

export default createVesselTrailLayers;
