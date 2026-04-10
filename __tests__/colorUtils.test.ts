import {describe, it, expect} from 'vitest';
import {getSpeedColor, getVesselColor, getFuelColor, getFuelLevel} from '../src/layers/colorUtils';
import type {VesselPosition} from '../src/types/index';

function makeVessel(overrides: Partial<VesselPosition> = {}): VesselPosition {
    return {
        vesselId: 'v1',
        latitude: 55,
        longitude: 20,
        heading: 0,
        speed: 10,
        ...overrides,
    };
}

describe('getSpeedColor', () => {
    it('returns gray for stopped (< 1 kn)', () => {
        expect(getSpeedColor(0)[0]).toBe(140);
        expect(getSpeedColor(0.99)[0]).toBe(140);
    });

    it('returns blue for slow (1-7 kn)', () => {
        expect(getSpeedColor(1)[0]).toBe(60);
        expect(getSpeedColor(6.99)[0]).toBe(60);
    });

    it('returns green for normal (7-14 kn)', () => {
        expect(getSpeedColor(7)[0]).toBe(50);
        expect(getSpeedColor(13.99)[0]).toBe(50);
    });

    it('returns orange for fast (14-20 kn)', () => {
        expect(getSpeedColor(14)[0]).toBe(230);
        expect(getSpeedColor(19.99)[0]).toBe(230);
    });

    it('returns red for very fast (>= 20 kn)', () => {
        expect(getSpeedColor(20)[0]).toBe(220);
        expect(getSpeedColor(30)[0]).toBe(220);
    });
});

describe('getFuelLevel', () => {
    it('returns CRITICAL below 20%', () => {
        expect(getFuelLevel(0)).toBe('CRITICAL');
        expect(getFuelLevel(19)).toBe('CRITICAL');
    });

    it('returns LOW at 20-39%', () => {
        expect(getFuelLevel(20)).toBe('LOW');
        expect(getFuelLevel(39)).toBe('LOW');
    });

    it('returns MEDIUM at 40-69%', () => {
        expect(getFuelLevel(40)).toBe('MEDIUM');
        expect(getFuelLevel(69)).toBe('MEDIUM');
    });

    it('returns HIGH at 70%+', () => {
        expect(getFuelLevel(70)).toBe('HIGH');
        expect(getFuelLevel(100)).toBe('HIGH');
    });
});

describe('getFuelColor', () => {
    it('clamps negative percent to 0 (CRITICAL)', () => {
        const color = getFuelColor(-10);
        expect(color).toEqual(getFuelColor(0));
    });

    it('clamps percent above 100', () => {
        const color = getFuelColor(150);
        expect(color).toEqual(getFuelColor(100));
    });

    it('returns different colors for dark and light themes', () => {
        const dark = getFuelColor(50, true);
        const light = getFuelColor(50, false);
        expect(dark).not.toEqual(light);
    });
});

describe('getVesselColor / vesselToStatus', () => {
    it('returns OFFLINE color for offline status', () => {
        const color = getVesselColor(makeVessel({status: 'offline'}), 'STATUS');
        expect(color).toBeDefined();
        expect(color[3]).toBe(255);
    });

    it('returns WARNING color for maintenance status', () => {
        const color = getVesselColor(makeVessel({status: 'maintenance'}), 'STATUS');
        expect(color[0]).toBe(255);
    });

    it('returns ANCHORED color for very low speed', () => {
        const color = getVesselColor(makeVessel({speed: 0.3}), 'STATUS');
        expect(color[0]).toBe(60);
    });

    it('returns CRITICAL color for dangerously fast speed >= 25', () => {
        const color = getVesselColor(makeVessel({speed: 25}), 'STATUS');
        expect(color[0]).toBe(230);
        expect(color[1]).toBe(60);
    });

    it('returns WARNING color for fast speed 20-25', () => {
        const color = getVesselColor(makeVessel({speed: 22}), 'STATUS');
        expect(color[0]).toBe(255);
        expect(color[1]).toBe(190);
    });

    it('returns NORMAL color for normal speed', () => {
        const color = getVesselColor(makeVessel({speed: 10}), 'STATUS');
        expect(color[0]).toBe(50);
        expect(color[1]).toBe(210);
    });

    it('uses speed color in SPEED mode', () => {
        const color = getVesselColor(makeVessel({speed: 10}), 'SPEED');
        expect(color).toEqual(getSpeedColor(10));
    });

    it('uses fuel color in FUEL mode', () => {
        const color = getVesselColor(makeVessel({fuelPercent: 50}), 'FUEL');
        expect(color).toEqual(getFuelColor(50));
    });
});
