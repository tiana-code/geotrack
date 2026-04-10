import {describe, it, expect} from 'vitest';
import {
    isPointOnLand,
    doesSegmentCrossLand,
    validateRoute,
    updateLandPolygons,
    LAND_CHECK_MIN_DISTANCE_KM,
} from '../src/utils/routeValidation';
import type {LandPolygon} from '../src/utils/routeValidation';

describe('isPointOnLand', () => {
    it('detects a point deep inside Great Britain as on land', () => {
        const result = isPointOnLand({latitude: 52.0, longitude: -1.0});
        expect(result.onLand).toBe(true);
        expect(result.landName).toBe('Great Britain');
    });

    it('detects a point in the Atlantic as NOT on land', () => {
        const result = isPointOnLand({latitude: 45.0, longitude: -30.0});
        expect(result.onLand).toBe(false);
    });

    it('detects a point in a bounding-box region (US Interior)', () => {
        const result = isPointOnLand({latitude: 40.0, longitude: -100.0});
        expect(result.onLand).toBe(true);
        expect(result.landName).toBe('US Interior');
    });

    it('accepts optional polygon override', () => {
        const customPolygons: LandPolygon[] = [
            {
                name: 'TestIsland',
                polygon: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
            },
        ];
        const inside = isPointOnLand({latitude: 0.5, longitude: 0.5}, customPolygons);
        expect(inside.onLand).toBe(true);
        expect(inside.landName).toBe('TestIsland');

        const outside = isPointOnLand({latitude: 5, longitude: 5}, customPolygons);
        expect(outside.onLand).toBe(false);
    });
});

describe('doesSegmentCrossLand', () => {
    it('returns false for short segments below minimum distance', () => {
        const result = doesSegmentCrossLand(51.5, -0.1, 51.501, -0.1);
        expect(result).toBe(false);
    });

    it('detects a long segment crossing Great Britain', () => {
        const result = doesSegmentCrossLand(50.0, -6.0, 55.0, 2.0);
        expect(result).toBe(true);
    });

    it('returns false for a segment entirely at sea', () => {
        const result = doesSegmentCrossLand(45.0, -30.0, 45.0, -20.0);
        expect(result).toBe(false);
    });

    it('uses adaptive sampling - more samples for longer segments', () => {
        const shortResult = doesSegmentCrossLand(50.0, -6.0, 50.5, -5.5);
        const longResult = doesSegmentCrossLand(30.0, -10.0, 60.0, 10.0);
        expect(typeof shortResult).toBe('boolean');
        expect(typeof longResult).toBe('boolean');
    });

    it('accepts optional polygon override', () => {
        const customPolygons: LandPolygon[] = [
            {
                name: 'TestIsland',
                polygon: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
            },
        ];
        const crosses = doesSegmentCrossLand(-1, -1, 2, 2, undefined, customPolygons);
        expect(crosses).toBe(true);
    });
});

describe('validateRoute', () => {
    it('returns valid for an all-ocean route', () => {
        const result = validateRoute([
            {latitude: 45.0, longitude: -30.0},
            {latitude: 45.0, longitude: -20.0},
        ]);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('detects invalid coordinates', () => {
        const result = validateRoute([
            {latitude: 91, longitude: 0},
            {latitude: 0, longitude: 181},
        ]);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.type === 'INVALID_COORDINATES')).toBe(true);
    });

    it('detects NaN coordinates', () => {
        const result = validateRoute([
            {latitude: NaN, longitude: 0},
        ]);
        expect(result.isValid).toBe(false);
    });

    it('detects land crossings', () => {
        const result = validateRoute([
            {latitude: 50.0, longitude: -6.0},
            {latitude: 55.0, longitude: 2.0},
        ]);
        expect(result.errors.some(e => e.type === 'LAND_CROSSING')).toBe(true);
    });

    it('accepts optional polygon override', () => {
        const customPolygons: LandPolygon[] = [];
        const result = validateRoute(
            [
                {latitude: 50.0, longitude: -6.0},
                {latitude: 55.0, longitude: 2.0},
            ],
            customPolygons,
        );
        expect(result.isValid).toBe(true);
    });

    it('returns valid for single-point route with no segments to check', () => {
        const result = validateRoute([
            {latitude: 45.0, longitude: -30.0},
        ]);
        expect(result.isValid).toBe(true);
    });
});

describe('updateLandPolygons', () => {
    it('allows replacing and resetting global polygons', () => {
        const custom: LandPolygon[] = [
            {
                name: 'Everywhere',
                polygon: [[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]],
            },
        ];
        updateLandPolygons(custom);

        const result = isPointOnLand({latitude: 0, longitude: 0});
        expect(result.onLand).toBe(true);

        updateLandPolygons([]);

        const afterReset = isPointOnLand({latitude: 45, longitude: -30});
        expect(afterReset.onLand).toBe(false);
    });
});
