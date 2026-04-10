import {describe, it, expect} from 'vitest';
import {ewmaSmooth, createEwmaFilter} from '../src/utils/ewma';

describe('ewmaSmooth', () => {
    it('blends current and previous with default alpha 0.3', () => {
        const result = ewmaSmooth(10, 0);
        expect(result).toBeCloseTo(3); // 0.3 * 10 + 0.7 * 0 = 3
    });

    it('passes through current value when alpha is 1', () => {
        expect(ewmaSmooth(42, 100, 1)).toBe(42);
    });

    it('returns previous value when alpha is 0', () => {
        expect(ewmaSmooth(42, 100, 0)).toBe(100);
    });

    it('converges toward steady value over iterations', () => {
        let value = 0;
        for (let i = 0; i < 30; i++) {
            value = ewmaSmooth(100, value, 0.3);
        }
        expect(value).toBeGreaterThan(95);
    });

    it('handles equal current and previous', () => {
        expect(ewmaSmooth(5, 5, 0.3)).toBe(5);
    });

    it('handles negative values', () => {
        const result = ewmaSmooth(-10, -20, 0.5);
        expect(result).toBeCloseTo(-15);
    });
});

describe('createEwmaFilter', () => {
    it('returns first value unchanged (cold start)', () => {
        const filter = createEwmaFilter(0.3);
        expect(filter.next(50)).toBe(50);
    });

    it('blends subsequent values', () => {
        const filter = createEwmaFilter(0.3);
        filter.next(0); // seed
        const second = filter.next(10);
        expect(second).toBeCloseTo(3); // 0.3 * 10 + 0.7 * 0 = 3
    });

    it('accumulates state across calls', () => {
        const filter = createEwmaFilter(0.5);
        filter.next(0);
        const v1 = filter.next(10); // 0.5*10 + 0.5*0 = 5
        const v2 = filter.next(10); // 0.5*10 + 0.5*5 = 7.5
        expect(v1).toBeCloseTo(5);
        expect(v2).toBeCloseTo(7.5);
    });

    it('reset() clears state so next value is treated as cold start', () => {
        const filter = createEwmaFilter(0.3);
        filter.next(100);
        filter.reset();
        expect(filter.next(50)).toBe(50);
    });
});
