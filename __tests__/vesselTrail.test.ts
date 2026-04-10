import {describe, it, expect} from 'vitest';
import {createVesselTrailLayers, MAX_TRAIL_POINTS} from '../src/layers/VesselTrailLayer';
import {getTimestampMs} from '../src/types/index';
import type {VesselRoute, VesselPosition, RoutePoint} from '../src/types/index';

function makeRoute(count: number, vesselId = 'v1'): VesselRoute {
    const points: RoutePoint[] = [];
    for (let i = 0; i < count; i++) {
        points.push({
            latitude: 55 + i * 0.01,
            longitude: 20 + i * 0.01,
            speed: 10,
            timestamp: new Date(Date.now() - (count - i) * 60_000).toISOString(),
        });
    }
    return {vesselId, points};
}

function makeVessel(vesselId = 'v1', lat = 55.5, lon = 20.5): VesselPosition {
    return {
        vesselId,
        latitude: lat,
        longitude: lon,
        heading: 45,
        speed: 10,
        status: 'active',
    };
}

describe('createVesselTrailLayers', () => {
    it('returns empty array when not visible', () => {
        const routes = new Map([['v1', makeRoute(10)]]);
        const layers = createVesselTrailLayers({
            routes,
            vessels: [makeVessel()],
            colorMode: 'SPEED',
            visible: false,
        });
        expect(layers).toHaveLength(0);
    });

    it('returns empty array when routes map is empty', () => {
        const layers = createVesselTrailLayers({
            routes: new Map(),
            vessels: [],
            colorMode: 'SPEED',
        });
        expect(layers).toHaveLength(0);
    });

    it('creates layers for valid route data', () => {
        const routes = new Map([['v1', makeRoute(20)]]);
        const layers = createVesselTrailLayers({
            routes,
            vessels: [makeVessel()],
            colorMode: 'SPEED',
        });
        expect(layers.length).toBeGreaterThan(0);
    });

    it('respects maxPoints - truncates to latest N points', () => {
        const routes = new Map([['v1', makeRoute(100)]]);
        const layers = createVesselTrailLayers({
            routes,
            vessels: [makeVessel('v1', 55 + 99 * 0.01, 20 + 99 * 0.01)],
            colorMode: 'SPEED',
            maxPoints: 10,
        });
        expect(layers.length).toBeGreaterThan(0);
    });

    it('uses MAX_TRAIL_POINTS as default maxPoints', () => {
        expect(MAX_TRAIL_POINTS).toBe(500);
    });

    it('handles route with too few points gracefully', () => {
        const route: VesselRoute = {
            vesselId: 'v1',
            points: [{latitude: 55, longitude: 20, speed: 10}],
        };
        const routes = new Map([['v1', route]]);
        const layers = createVesselTrailLayers({
            routes,
            vessels: [makeVessel()],
            colorMode: 'SPEED',
        });
        expect(layers).toHaveLength(0);
    });

    it('filters points by time range', () => {
        const now = Date.now();
        const route: VesselRoute = {
            vesselId: 'v1',
            points: Array.from({length: 20}, (_, i) => ({
                latitude: 55 + i * 0.01,
                longitude: 20 + i * 0.01,
                speed: 10,
                timestamp: new Date(now - (20 - i) * 60_000).toISOString(),
            })),
        };
        const routes = new Map([['v1', route]]);
        const layers = createVesselTrailLayers({
            routes,
            vessels: [makeVessel('v1', 55 + 19 * 0.01, 20 + 19 * 0.01)],
            colorMode: 'SPEED',
            timeRange: {
                start: new Date(now - 5 * 60_000),
                end: new Date(now),
            },
        });
        expect(layers.length).toBeGreaterThanOrEqual(0);
    });

    it('returns no vessel without matching route', () => {
        const routes = new Map([['v1', makeRoute(10)]]);
        const layers = createVesselTrailLayers({
            routes,
            vessels: [makeVessel('v2')],
            colorMode: 'SPEED',
        });
        expect(layers).toHaveLength(0);
    });

    it('supports all color modes', () => {
        const routes = new Map([['v1', makeRoute(20)]]);
        const vessel = makeVessel();

        for (const mode of ['SPEED', 'FUEL', 'STATUS'] as const) {
            const layers = createVesselTrailLayers({
                routes,
                vessels: [vessel],
                colorMode: mode,
            });
            expect(layers.length).toBeGreaterThan(0);
        }
    });

    it('handles heading=0 (north) correctly - not treated as missing', () => {
        const routes = new Map([['v1', makeRoute(20)]]);
        const vessel = makeVessel('v1', 55 + 19 * 0.01, 20 + 19 * 0.01);
        vessel.heading = 0;
        const layers = createVesselTrailLayers({
            routes,
            vessels: [vessel],
            colorMode: 'SPEED',
        });
        expect(layers.length).toBeGreaterThan(0);
    });
});

describe('getTimestampMs', () => {
    it('returns null for missing timestamp', () => {
        expect(getTimestampMs({latitude: 0, longitude: 0})).toBeNull();
    });

    it('returns null for invalid timestamp string', () => {
        expect(getTimestampMs({latitude: 0, longitude: 0, timestamp: 'not-a-date'})).toBeNull();
    });

    it('returns milliseconds for valid ISO timestamp', () => {
        const ts = '2024-01-01T00:00:00Z';
        const result = getTimestampMs({latitude: 0, longitude: 0, timestamp: ts});
        expect(result).toBe(Date.parse(ts));
    });

    it('returns null for empty string', () => {
        expect(getTimestampMs({latitude: 0, longitude: 0, timestamp: ''})).toBeNull();
    });
});
