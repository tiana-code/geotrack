import type {RGBAColor, ColorMode, VesselPosition} from '../types/index.js';

export function getSpeedColor(speed: number): RGBAColor {
    if (speed < 1) return [140, 140, 140, 220];
    if (speed < 7) return [60, 130, 220, 220];
    if (speed < 14) return [50, 200, 100, 220];
    if (speed < 20) return [230, 160, 40, 220];
    return [220, 60, 60, 220];
}

export type VesselStatus = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'OFFLINE' | 'ANCHORED';

const STATUS_COLORS_DARK: Record<VesselStatus, RGBAColor> = {
    NORMAL: [50, 210, 100, 255],
    WARNING: [255, 190, 50, 255],
    CRITICAL: [230, 60, 60, 255],
    OFFLINE: [130, 130, 140, 255],
    ANCHORED: [60, 160, 240, 255],
};

const STATUS_COLORS_LIGHT: Record<VesselStatus, RGBAColor> = {
    NORMAL: [30, 160, 70, 255],
    WARNING: [200, 130, 20, 255],
    CRITICAL: [190, 30, 30, 255],
    OFFLINE: [100, 100, 110, 255],
    ANCHORED: [30, 110, 200, 255],
};

function vesselToStatus(vessel: VesselPosition): VesselStatus {
    if (vessel.status === 'offline') return 'OFFLINE';
    if (vessel.status === 'maintenance') return 'WARNING';
    const speed = vessel.speed ?? 0;
    if (speed < 0.5) return 'ANCHORED';
    if (speed >= 25) return 'CRITICAL';
    if (speed >= 20) return 'WARNING';
    return 'NORMAL';
}

export function getVesselColor(
    vessel: VesselPosition,
    mode: ColorMode,
    isDark: boolean = true,
): RGBAColor {
    switch (mode) {
        case 'SPEED':
            return getSpeedColor(vessel.speed ?? 0);
        case 'FUEL': {
            const percent = vessel.fuelPercent ?? 100;
            return getFuelColor(percent, isDark);
        }
        default: {
            const status = vesselToStatus(vessel);
            return isDark ? STATUS_COLORS_DARK[status] : STATUS_COLORS_LIGHT[status];
        }
    }
}

export type FuelLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'CRITICAL';

export function getFuelLevel(percent: number): FuelLevel {
    if (percent >= 70) return 'HIGH';
    if (percent >= 40) return 'MEDIUM';
    if (percent >= 20) return 'LOW';
    return 'CRITICAL';
}

export function getFuelColor(percent: number, isDark: boolean = true): RGBAColor {
    const level = getFuelLevel(Math.max(0, Math.min(100, percent)));
    const dark: Record<FuelLevel, RGBAColor> = {
        HIGH: [50, 210, 100, 220],
        MEDIUM: [255, 190, 50, 220],
        LOW: [230, 120, 40, 220],
        CRITICAL: [220, 60, 60, 220],
    };
    const light: Record<FuelLevel, RGBAColor> = {
        HIGH: [30, 160, 70, 220],
        MEDIUM: [200, 130, 20, 220],
        LOW: [190, 80, 20, 220],
        CRITICAL: [190, 30, 30, 220],
    };
    return isDark ? dark[level] : light[level];
}
