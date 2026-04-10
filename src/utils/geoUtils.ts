const EARTH_RADIUS_METERS = 6_371_000;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

function intermediatePoint(
    start: [number, number],
    end: [number, number],
    fraction: number,
): [number, number] {
    const lat1 = toRad(start[1]);
    const lon1 = toRad(start[0]);
    const lat2 = toRad(end[1]);
    const lon2 = toRad(end[0]);

    const angularDistance = 2 * Math.asin(
        Math.sqrt(
            Math.sin((lat2 - lat1) / 2) ** 2 +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
        ),
    );

    if (angularDistance < 1e-10) return start;

    const sinD = Math.sin(angularDistance);
    const a = Math.sin((1 - fraction) * angularDistance) / sinD;
    const b = Math.sin(fraction * angularDistance) / sinD;

    const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);

    return [
        toDeg(Math.atan2(y, x)),
        toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))),
    ];
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
): number {
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const dLon = toRad(lon2 - lon1);

    const y = Math.sin(dLon) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);

    const theta = Math.atan2(y, x);
    return ((toDeg(theta) % 360) + 360) % 360;
}

//Ignored at low speed (compass headings are unreliable below minSpeedThreshold knots)
export function isCourseAnomaly(
    reportedHeading: number,
    calculatedBearing: number,
    speedKnots: number,
    minSpeedThreshold: number = 3,
): boolean {
    if (speedKnots < minSpeedThreshold) return false;

    let diff = Math.abs(reportedHeading - calculatedBearing);
    if (diff > 180) diff = 360 - diff;

    return diff > 90;
}

function perpendicularDistance(
    point: [number, number],
    lineStart: [number, number],
    lineEnd: [number, number],
): number {
    const [x, y] = point;
    const [x1, y1] = lineStart;
    const [x2, y2] = lineEnd;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) return Math.sqrt((x - x1) ** 2 + (y - y1) ** 2);

    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;

    return Math.sqrt((x - projX) ** 2 + (y - projY) ** 2);
}

export function douglasPeucker(
    points: [number, number][],
    epsilon: number = 0.0001,
): [number, number][] {
    if (points.length <= 2) return points;

    let maxDistance = 0;
    let maxIndex = 0;
    const start = points[0];
    const end = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
        const distance = perpendicularDistance(points[i], start, end);
        if (distance > maxDistance) {
            maxDistance = distance;
            maxIndex = i;
        }
    }

    if (maxDistance > epsilon) {
        const left = douglasPeucker(points.slice(0, maxIndex + 1), epsilon);
        const right = douglasPeucker(points.slice(maxIndex), epsilon);
        return [...left.slice(0, -1), ...right];
    }

    return [start, end];
}

export class SimpleKalmanFilter {
    private estimate: number = 0;
    private errorCovariance: number = 1;
    private initialized = false;

    constructor(
        private readonly processNoise: number = 0.00001,
        private readonly measurementNoise: number = 0.0005,
    ) {
    }

    update(measurement: number): number {
        if (!this.initialized) {
            this.estimate = measurement;
            this.errorCovariance = this.measurementNoise;
            this.initialized = true;
            return measurement;
        }
        const predictedError = this.errorCovariance + this.processNoise;
        const kalmanGain = predictedError / (predictedError + this.measurementNoise);
        this.estimate += kalmanGain * (measurement - this.estimate);
        this.errorCovariance = (1 - kalmanGain) * predictedError;
        return this.estimate;
    }

    reset(): void {
        this.estimate = 0;
        this.errorCovariance = 1;
        this.initialized = false;
    }
}

export function smoothTrailKalman(
    points: [number, number][],
    processNoise = 0.00001,
    measurementNoise = 0.0005,
): [number, number][] {
    if (points.length < 3) return points;
    const lonFilter = new SimpleKalmanFilter(processNoise, measurementNoise);
    const latFilter = new SimpleKalmanFilter(processNoise, measurementNoise);
    return points.map(([lon, lat]) => [
        lonFilter.update(lon),
        latFilter.update(lat),
    ]);
}

export function interpolateGreatCircle(
    start: [number, number],
    end: [number, number],
    maxSegmentMeters: number = 200,
): [number, number][] {
    const distance = haversineDistance(start[1], start[0], end[1], end[0]);
    if (distance <= maxSegmentMeters) return [start, end];

    const numSegments = Math.ceil(distance / maxSegmentMeters);
    const points: [number, number][] = [start];

    for (let i = 1; i < numSegments; i++) {
        const fraction = i / numSegments;
        points.push(intermediatePoint(start, end, fraction));
    }

    points.push(end);
    return points;
}
