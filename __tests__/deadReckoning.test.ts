import {describe, it, expect} from 'vitest';
import {
    lerp,
    lerpHeading,
    predictPosition,
    predictPositionClamped,
    DEAD_RECKONING_MAX_ELAPSED_MS,
} from '../src/utils/deadReckoning';

describe('lerp', () => {
    it('returns start at t=0', () => {
        expect(lerp(0, 100, 0)).toBe(0);
    });

    it('returns end at t=1', () => {
        expect(lerp(0, 100, 1)).toBe(100);
    });

    it('returns midpoint at t=0.5', () => {
        expect(lerp(0, 100, 0.5)).toBe(50);
    });

    it('clamps t below 0', () => {
        expect(lerp(0, 100, -1)).toBe(0);
    });

    it('clamps t above 1', () => {
        expect(lerp(0, 100, 2)).toBe(100);
    });
});

describe('lerpHeading', () => {
    it('interpolates between 0 and 90 degrees', () => {
        expect(lerpHeading(0, 90, 0.5)).toBeCloseTo(45);
    });

    it('takes the short arc from 350 to 10 degrees', () => {
        // Delta = 20 degrees forward, not -340 degrees backward
        const result = lerpHeading(350, 10, 0.5);
        expect(result).toBeCloseTo(0);
    });

    it('takes the short arc from 10 to 350 degrees', () => {
        const result = lerpHeading(10, 350, 0.5);
        expect(result).toBeCloseTo(0);
    });

    it('returns from at t=0', () => {
        expect(lerpHeading(45, 135, 0)).toBeCloseTo(45);
    });

    it('returns to at t=1', () => {
        expect(lerpHeading(45, 135, 1)).toBeCloseTo(135);
    });
});

describe('predictPosition', () => {
    it('returns unchanged position when elapsedMs is 0', () => {
        const [lon, lat] = predictPosition(10, 55, 12, 0, 0);
        expect(lon).toBe(10);
        expect(lat).toBe(55);
    });

    it('returns unchanged position when speed is 0', () => {
        const [lon, lat] = predictPosition(10, 55, 0, 90, 5000);
        expect(lon).toBe(10);
        expect(lat).toBe(55);
    });

    it('moves north when heading is 0 degrees', () => {
        const [lon, lat] = predictPosition(0, 0, 10, 0, 3600_000); // 1 hour at 10 kn
        expect(lat).toBeGreaterThan(0);
        expect(lon).toBeCloseTo(0, 3);
    });

    it('moves east when heading is 90 degrees', () => {
        const [lon, lat] = predictPosition(0, 0, 10, 90, 3600_000);
        expect(lon).toBeGreaterThan(0);
        expect(lat).toBeCloseTo(0, 3);
    });

    it('moves south when heading is 180 degrees', () => {
        const [lon, lat] = predictPosition(0, 0, 10, 180, 3600_000);
        expect(lat).toBeLessThan(0);
        expect(lon).toBeCloseTo(0, 3);
    });

    it('moves west when heading is 270 degrees', () => {
        const [lon, lat] = predictPosition(0, 0, 10, 270, 3600_000);
        expect(lon).toBeLessThan(0);
        expect(lat).toBeCloseTo(0, 3);
    });

    it('projects roughly correct distance in 5 seconds at 12 knots', () => {
        // 12 kn = 6.17 m/s; in 5 s = ~30.87 m north
        const [, lat] = predictPosition(0, 0, 12, 0, 5000);
        const dLatM = lat * 111320;
        expect(dLatM).toBeCloseTo(30.87, 0);
    });

    it('returns last position for non-finite inputs', () => {
        const [lon, lat] = predictPosition(NaN, 55, 12, 90, 5000);
        expect(Number.isNaN(lon)).toBe(true);
        expect(lat).toBe(55);

        const [lon2, lat2] = predictPosition(10, 55, NaN, 90, 5000);
        expect(lon2).toBe(10);
        expect(lat2).toBe(55);
    });
});

describe('predictPositionClamped', () => {
    it('extrapolates within the max window', () => {
        const [, lat] = predictPositionClamped(0, 0, 10, 0, DEAD_RECKONING_MAX_ELAPSED_MS);
        expect(lat).toBeGreaterThan(0);
    });

    it('returns last position when elapsed exceeds max window', () => {
        const [lon, lat] = predictPositionClamped(10, 55, 20, 90, DEAD_RECKONING_MAX_ELAPSED_MS + 1);
        expect(lon).toBe(10);
        expect(lat).toBe(55);
    });
});
