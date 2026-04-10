export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * Math.max(0, Math.min(1, t));
}

export function lerpHeading(from: number, to: number, t: number): number {
    let delta = ((to - from + 540) % 360) - 180;
    return (from + delta * Math.max(0, Math.min(1, t)) + 360) % 360;
}

//Uses a flat-Earth approximation valid up to ~50 km
export function predictPosition(
    lastLon: number,
    lastLat: number,
    speedKnots: number,
    headingDeg: number,
    elapsedMs: number,
): [number, number] {
    if (
        !Number.isFinite(lastLon) ||
        !Number.isFinite(lastLat) ||
        !Number.isFinite(speedKnots) ||
        !Number.isFinite(headingDeg) ||
        elapsedMs <= 0
    ) {
        return [lastLon, lastLat];
    }

    const speedMps = speedKnots * 0.514444;
    const distanceMeters = speedMps * (elapsedMs / 1000);

    const headingRad = (headingDeg * Math.PI) / 180;

    const deltaLat = (distanceMeters * Math.cos(headingRad)) / 111320;
    const cosLat = Math.cos((lastLat * Math.PI) / 180) || 1;
    const deltaLon = (distanceMeters * Math.sin(headingRad)) / (111320 * cosLat);

    return [lastLon + deltaLon, lastLat + deltaLat];
}

export const DEAD_RECKONING_MAX_ELAPSED_MS = 30_000;

export function predictPositionClamped(
    lastLon: number,
    lastLat: number,
    speedKnots: number,
    headingDeg: number,
    elapsedMs: number,
): [number, number] {
    if (elapsedMs > DEAD_RECKONING_MAX_ELAPSED_MS) {
        return [lastLon, lastLat];
    }
    return predictPosition(lastLon, lastLat, speedKnots, headingDeg, elapsedMs);
}
