import {describe, it, expect} from 'vitest';
import {
    haversineDistance,
    haversineKm,
    calculateBearing,
    isCourseAnomaly,
    douglasPeucker,
    SimpleKalmanFilter,
    smoothTrailKalman,
    interpolateGreatCircle,
} from '../src/utils/geoUtils';

describe('haversineDistance', () => {
    it('returns 0 for identical points', () => {
        expect(haversineDistance(51.5, -0.1, 51.5, -0.1)).toBe(0);
    });

    it('returns approximately the half-circumference of Earth for antipodal points', () => {
        // Half circumference ≈ 20,015 km = 20,015,000 m
        const dist = haversineDistance(0, 0, 0, 180);
        expect(dist).toBeCloseTo(20_015_000, -4); // within 10km accuracy
    });

    it('computes ~111km between two points 1° of latitude apart at equator', () => {
        const dist = haversineDistance(0, 0, 1, 0);
        expect(dist).toBeCloseTo(111_195, -2); // within 1km
    });

    it('returns a smaller east-west distance at higher latitude', () => {
        const distEquator = haversineDistance(0, 0, 0, 1);
        const distHighLat = haversineDistance(60, 0, 60, 1);
        expect(distHighLat).toBeLessThan(distEquator);
    });

    it('is symmetric (distance A→B equals distance B→A)', () => {
        const d1 = haversineDistance(55.0, 20.0, 56.0, 21.0);
        const d2 = haversineDistance(56.0, 21.0, 55.0, 20.0);
        expect(d1).toBeCloseTo(d2, 6);
    });
});

describe('haversineKm', () => {
    it('returns approximately 111 km per degree of latitude at equator', () => {
        const dist = haversineKm(0, 0, 1, 0);
        expect(dist).toBeCloseTo(111.19, 0);
    });

    it('returns 0 for identical points', () => {
        expect(haversineKm(51, 20, 51, 20)).toBe(0);
    });
});

describe('calculateBearing', () => {
    it('returns 0 for due north', () => {
        const b = calculateBearing(0, 0, 1, 0);
        expect(b).toBeCloseTo(0, 0);
    });

    it('returns 90 for due east', () => {
        const b = calculateBearing(0, 0, 0, 1);
        expect(b).toBeCloseTo(90, 0);
    });

    it('returns 180 for due south', () => {
        const b = calculateBearing(1, 0, 0, 0);
        expect(b).toBeCloseTo(180, 0);
    });

    it('returns 270 for due west', () => {
        const b = calculateBearing(0, 1, 0, 0);
        expect(b).toBeCloseTo(270, 0);
    });

    it('returns value in [0, 360)', () => {
        const b = calculateBearing(55, 20, 56, 21);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThan(360);
    });
});

describe('isCourseAnomaly', () => {
    it('returns false when speed is below threshold', () => {
        expect(isCourseAnomaly(0, 90, 2)).toBe(false);
    });

    it('returns false when heading matches bearing within 90 degrees', () => {
        expect(isCourseAnomaly(45, 60, 10)).toBe(false);
    });

    it('returns true when heading differs more than 90 degrees at speed', () => {
        expect(isCourseAnomaly(0, 180, 10)).toBe(true);
    });

    it('handles wraparound - 355 vs 5 is only 10 degrees apart', () => {
        expect(isCourseAnomaly(355, 5, 10)).toBe(false);
    });
});

describe('douglasPeucker', () => {
    it('returns input unchanged when <= 2 points', () => {
        const pts: [number, number][] = [[0, 0], [1, 1]];
        expect(douglasPeucker(pts)).toEqual(pts);
    });

    it('removes collinear middle point', () => {
        const pts: [number, number][] = [[0, 0], [0.5, 0.5], [1, 1]];
        const result = douglasPeucker(pts, 0.001);
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual([0, 0]);
        expect(result[result.length - 1]).toEqual([1, 1]);
    });

    it('preserves significant deviation points', () => {
        const pts: [number, number][] = [[0, 0], [0.5, 1.0], [1, 0]];
        const result = douglasPeucker(pts, 0.001);
        expect(result).toHaveLength(3);
    });

    it('always preserves first and last points', () => {
        const pts: [number, number][] = [[0, 0], [0.3, 0.1], [0.6, 0.05], [1, 0]];
        const result = douglasPeucker(pts, 0.2);
        expect(result[0]).toEqual([0, 0]);
        expect(result[result.length - 1]).toEqual([1, 0]);
    });
});

describe('SimpleKalmanFilter', () => {
    it('returns first measurement on cold start', () => {
        const filter = new SimpleKalmanFilter();
        expect(filter.update(42)).toBe(42);
    });

    it('smooths subsequent measurements toward true value', () => {
        const filter = new SimpleKalmanFilter();
        filter.update(0);
        let val = 0;
        for (let i = 0; i < 20; i++) val = filter.update(10);
        expect(val).toBeGreaterThan(9);
    });

    it('reset() allows cold restart', () => {
        const filter = new SimpleKalmanFilter();
        filter.update(100);
        filter.reset();
        expect(filter.update(50)).toBe(50);
    });
});

describe('smoothTrailKalman', () => {
    it('returns input unchanged for < 3 points', () => {
        const pts: [number, number][] = [[0, 0], [1, 1]];
        expect(smoothTrailKalman(pts)).toEqual(pts);
    });

    it('returns same number of points as input', () => {
        const pts: [number, number][] = [[0, 0], [1, 0.1], [2, -0.1], [3, 0.05], [4, 0]];
        expect(smoothTrailKalman(pts)).toHaveLength(pts.length);
    });

    it('reduces noise magnitude', () => {
        // Noisy signal alternating ±0.1 around 0
        const noisy: [number, number][] = Array.from({length: 20}, (_, i) => [
            i,
            i % 2 === 0 ? 0.1 : -0.1,
        ]);
        const smoothed = smoothTrailKalman(noisy);
        // After Kalman filter, lats should cluster closer to 0
        const maxAbs = Math.max(...smoothed.slice(5).map(([, lat]) => Math.abs(lat)));
        expect(maxAbs).toBeLessThan(0.1);
    });
});

describe('interpolateGreatCircle', () => {
    it('returns [start, end] when distance <= maxSegmentMeters', () => {
        const start: [number, number] = [20.0, 55.0];
        const end: [number, number] = [20.001, 55.001];
        const pts = interpolateGreatCircle(start, end, 200);
        expect(pts).toHaveLength(2);
        expect(pts[0]).toEqual(start);
        expect(pts[1]).toEqual(end);
    });

    it('inserts intermediate points for segments > maxSegmentMeters', () => {
        const start: [number, number] = [0, 0];
        const end: [number, number] = [0, 0.009]; // ~1002m at equator
        const pts = interpolateGreatCircle(start, end, 200);
        expect(pts.length).toBeGreaterThan(2);
        expect(pts[0]).toEqual(start);
        expect(pts[pts.length - 1]).toEqual(end);
    });

    it('always starts with start and ends with end', () => {
        const start: [number, number] = [10.0, 50.0];
        const end: [number, number] = [10.1, 50.1];
        const pts = interpolateGreatCircle(start, end, 200);
        expect(pts[0]).toEqual(start);
        expect(pts[pts.length - 1]).toEqual(end);
    });

    it('no consecutive pair of output points exceeds maxSegmentMeters', () => {
        const start: [number, number] = [0, 0];
        const end: [number, number] = [0, 0.09]; // ~10km at equator
        const maxSeg = 200;
        const pts = interpolateGreatCircle(start, end, maxSeg);

        for (let i = 1; i < pts.length; i++) {
            const [lon0, lat0] = pts[i - 1];
            const [lon1, lat1] = pts[i];
            const dist = haversineDistance(lat0, lon0, lat1, lon1);
            expect(dist).toBeLessThanOrEqual(maxSeg + 1);
        }
    });

    it('handles very long segments (cross-ocean) without hanging', () => {
        const rotterdam: [number, number] = [4.5, 51.9];
        const singapore: [number, number] = [103.8, 1.3];
        const pts = interpolateGreatCircle(rotterdam, singapore, 500);
        expect(pts.length).toBeGreaterThan(100);
        expect(pts[0]).toEqual(rotterdam);
        expect(pts[pts.length - 1]).toEqual(singapore);
    });

    it('uses default maxSegmentMeters of 200 when not specified', () => {
        const start: [number, number] = [0, 0];
        const end: [number, number] = [0, 0.009];
        const defaultPts = interpolateGreatCircle(start, end);
        const explicitPts = interpolateGreatCircle(start, end, 200);
        expect(defaultPts).toEqual(explicitPts);
    });

    it('returns [start, end] for identical points', () => {
        const pt: [number, number] = [20.5, 55.5];
        const pts = interpolateGreatCircle(pt, pt, 200);
        expect(pts).toHaveLength(2);
    });

    it('intermediate point on great circle at high latitude bulges toward pole', () => {
        // At 60° lat the great circle between two points at same latitude curves poleward
        const startHL: [number, number] = [0, 60];
        const endHL: [number, number] = [10, 60];
        const ptsHL = interpolateGreatCircle(startHL, endHL, 200);
        const mid = ptsHL[Math.floor(ptsHL.length / 2)];
        expect(mid[1]).toBeGreaterThanOrEqual(60);
    });
});
