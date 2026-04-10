import {point as turfPoint, polygon as turfPolygon} from '@turf/helpers';
import {booleanPointInPolygon} from '@turf/boolean-point-in-polygon';
import type {RoutePoint} from '../types';
import {haversineKm, interpolateGreatCircle} from './geoUtils.js';

export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
}

export interface ValidationError {
    type: 'LAND_CROSSING' | 'INVALID_COORDINATES';
    message: string;
    point?: RoutePoint;
    segmentIndex?: number;
}

export const LAND_CHECK_MIN_DISTANCE_KM = 10;

export interface LandPolygon {
    name: string;
    polygon: [number, number][];
}

interface LandBbox {
    name: string;
    bbox: [number, number, number, number];
}

const FALLBACK_LAND_POLYGONS: LandPolygon[] = [
    {
        name: 'Great Britain',
        polygon: [
            [-5.5, 50.0], [-4.0, 50.3], [-3.5, 50.5], [-2.5, 50.7], [-1.0, 50.8],
            [0.0, 51.0], [1.0, 51.2], [1.5, 52.0], [1.7, 52.8], [1.2, 53.5],
            [0.5, 54.0], [-0.5, 54.5], [-1.0, 55.0], [-2.0, 55.5], [-3.0, 56.0],
            [-4.0, 56.5], [-5.0, 57.5], [-5.5, 58.0], [-5.0, 58.5], [-3.5, 58.6],
            [-2.5, 58.5], [-3.0, 57.5], [-4.0, 57.0], [-5.0, 56.5], [-4.5, 56.0],
            [-3.5, 55.5], [-3.0, 55.0], [-2.5, 54.5], [-3.0, 54.0], [-3.5, 53.5],
            [-4.0, 53.0], [-4.5, 52.0], [-5.0, 51.5], [-5.5, 50.0],
        ],
    },
    {
        name: 'Ireland',
        polygon: [
            [-8.0, 51.5], [-6.5, 51.5], [-6.0, 52.0], [-6.0, 53.0], [-6.5, 53.5],
            [-7.0, 54.0], [-7.5, 54.5], [-8.5, 54.5], [-9.5, 53.5], [-9.5, 52.5],
            [-9.0, 51.8], [-8.0, 51.5],
        ],
    },
    {
        name: 'Scandinavia Interior',
        polygon: [
            [10.5, 59.5], [12.0, 58.5], [14.5, 58.0], [16.0, 59.0],
            [17.0, 60.5], [17.0, 62.0], [15.0, 64.0], [13.0, 66.0],
            [10.5, 68.0], [9.0, 66.0], [7.5, 63.0], [8.0, 61.0], [10.5, 59.5],
        ],
    },
    {
        name: 'Finland Interior',
        polygon: [
            [24.0, 60.5], [26.0, 60.5], [28.0, 61.0], [30.0, 62.0], [30.0, 65.0],
            [28.0, 67.0], [26.0, 68.0], [24.0, 66.0], [22.0, 63.0], [22.0, 61.0],
            [24.0, 60.5],
        ],
    },
    {
        name: 'Central Europe',
        polygon: [
            [6.5, 47.5], [7.5, 47.5], [10.0, 47.0], [13.0, 47.5], [15.0, 49.0],
            [18.0, 49.5], [23.0, 49.0], [24.0, 50.5], [23.0, 52.0], [21.0, 52.5],
            [18.0, 53.5], [14.5, 53.5], [14.0, 53.0], [13.0, 52.5], [11.5, 53.0],
            [10.0, 53.2], [9.0, 53.0], [8.0, 52.5], [7.0, 52.5], [6.0, 51.5],
            [5.5, 50.0], [6.0, 48.5], [6.5, 47.5],
        ],
    },
    {
        name: 'France Interior',
        polygon: [
            [0.5, 46.0], [2.0, 44.5], [4.0, 43.8], [6.0, 43.8], [6.8, 44.0],
            [7.2, 46.0], [6.5, 48.0], [5.0, 49.0], [3.5, 49.5], [2.0, 49.5],
            [1.0, 49.0], [-0.5, 48.0], [-1.5, 47.5], [-0.5, 46.5], [0.5, 46.0],
        ],
    },
    {
        name: 'Iberian Interior',
        polygon: [
            [-6.5, 37.0], [-5.0, 36.5], [-3.0, 37.0], [-1.0, 37.5], [0.0, 38.5],
            [0.5, 40.0], [-0.5, 42.0], [-2.0, 43.0], [-5.0, 43.5], [-7.5, 43.0],
            [-8.0, 41.5], [-8.0, 39.0], [-6.5, 37.0],
        ],
    },
    {
        name: 'Italy Peninsula',
        polygon: [
            [11.0, 44.0], [13.0, 43.5], [14.5, 42.5], [16.0, 41.5], [16.5, 40.5],
            [16.0, 39.5], [16.5, 38.5], [16.0, 38.0], [15.5, 38.5], [15.0, 39.0],
            [14.0, 40.0], [12.5, 41.0], [11.5, 42.5], [11.0, 43.5], [11.0, 44.0],
        ],
    },
    {
        name: 'Balkans Interior',
        polygon: [
            [15.5, 45.0], [17.0, 44.0], [19.5, 42.5], [22.5, 41.5], [24.5, 42.0],
            [26.0, 42.0], [26.5, 43.5], [25.5, 44.5], [22.0, 45.5], [19.0, 45.5],
            [16.5, 45.5], [15.5, 45.0],
        ],
    },
    {
        name: 'Turkey Interior',
        polygon: [
            [30.0, 37.5], [32.0, 37.0], [35.0, 37.0], [38.0, 37.5], [42.0, 38.0],
            [44.0, 39.0], [44.0, 41.0], [42.0, 41.5], [38.0, 41.0], [35.0, 40.5],
            [32.0, 40.5], [30.0, 39.0], [30.0, 37.5],
        ],
    },
    {
        name: 'North Africa',
        polygon: [
            [-5.0, 30.0], [0.0, 30.0], [5.0, 30.0], [10.0, 30.0], [15.0, 30.0],
            [20.0, 28.0], [25.0, 25.0], [30.0, 22.0], [30.0, 32.0], [25.0, 31.5],
            [20.0, 33.0], [15.0, 33.0], [10.0, 34.0], [5.0, 35.0], [0.0, 35.0],
            [-3.0, 34.0], [-5.0, 33.0], [-5.0, 30.0],
        ],
    },
    {
        name: 'Arabian Peninsula Interior',
        polygon: [
            [42.0, 15.0], [45.0, 14.0], [50.0, 17.0], [55.0, 22.0], [55.0, 25.0],
            [52.0, 24.0], [48.0, 25.0], [45.0, 28.0], [42.0, 28.0], [40.0, 25.0],
            [40.0, 18.0], [42.0, 15.0],
        ],
    },
    {
        name: 'India Interior',
        polygon: [
            [73.0, 22.0], [78.0, 18.0], [82.0, 15.0], [85.0, 18.0], [88.0, 22.0],
            [88.0, 26.0], [85.0, 28.0], [80.0, 28.0], [75.0, 25.0], [73.0, 22.0],
        ],
    },
    {
        name: 'Malay Peninsula',
        polygon: [
            [99.5, 6.0], [100.5, 6.0], [101.5, 4.0], [103.0, 2.0], [104.0, 1.5],
            [103.5, 1.0], [101.0, 2.5], [99.5, 4.0], [99.5, 6.0],
        ],
    },
    {
        name: 'China East Coast',
        polygon: [
            [118.0, 24.0], [120.0, 25.0], [121.0, 28.0], [121.5, 30.0], [122.0, 33.0],
            [120.5, 36.0], [118.0, 37.0], [116.0, 35.0], [115.0, 30.0], [116.0, 26.0],
            [118.0, 24.0],
        ],
    },
    {
        name: 'Eastern North America',
        polygon: [
            [-75.0, 25.0], [-67.0, 25.0], [-66.0, 30.0], [-68.0, 35.0],
            [-72.0, 38.0], [-75.0, 42.0], [-77.0, 44.0], [-76.0, 46.0],
            [-80.0, 45.0], [-83.0, 42.0], [-83.0, 39.0], [-81.0, 33.0],
            [-81.0, 29.0], [-81.5, 27.0], [-80.5, 25.5], [-75.0, 25.0],
        ],
    },
    {
        name: 'South America East Coast',
        polygon: [
            [-50.0, -30.0], [-45.0, -25.0], [-40.0, -20.0], [-38.0, -15.0],
            [-38.0, -10.0], [-40.0, -5.0], [-45.0, -2.0], [-48.0, -2.0],
            [-50.0, -5.0], [-52.0, -10.0], [-53.0, -20.0], [-51.0, -25.0],
            [-50.0, -30.0],
        ],
    },
    {
        name: 'Australia East Interior',
        polygon: [
            [145.0, -38.0], [148.0, -36.0], [151.0, -33.0], [152.0, -28.0],
            [150.0, -23.0], [147.0, -20.0], [144.0, -18.0], [142.0, -19.0],
            [142.0, -25.0], [144.0, -31.0], [145.0, -35.0], [145.0, -38.0],
        ],
    },
];

const LAND_BOUNDING_BOXES: LandBbox[] = [
    {name: 'Central Asia', bbox: [55, 38, 90, 50]},
    {name: 'Siberia West', bbox: [60, 55, 100, 70]},
    {name: 'Russian Interior', bbox: [30, 52, 65, 62]},
    {name: 'Central Africa Interior', bbox: [15, -8, 28, 8]},
    {name: 'Sub-Saharan Africa', bbox: [15, -30, 35, -8]},
    {name: 'Brazil Interior', bbox: [-65, -20, -45, 0]},
    {name: 'Andes Interior', bbox: [-72, -55, -65, -30]},
    {name: 'Australia Interior', bbox: [120, -35, 142, -20]},
    {name: 'Canadian Interior', bbox: [-110, 50, -80, 65]},
    {name: 'US Interior', bbox: [-110, 35, -85, 48]},
];

let activeLandPolygons: LandPolygon[] = FALLBACK_LAND_POLYGONS;

//Replace the active polygon set with higher-resolution data from a backend API
export function updateLandPolygons(polygons: LandPolygon[]): void {
    activeLandPolygons = polygons.length > 0 ? polygons : FALLBACK_LAND_POLYGONS;
}

function ensureClosed(polygon: [number, number][]): [number, number][] {
    if (
        polygon.length < 3 ||
        (polygon[0][0] === polygon[polygon.length - 1][0] &&
            polygon[0][1] === polygon[polygon.length - 1][1])
    ) {
        return polygon;
    }
    return [...polygon, polygon[0]];
}

function getEffectivePolygons(override?: LandPolygon[]): LandPolygon[] {
    return override ?? activeLandPolygons;
}

export function isPointOnLand(
    point: RoutePoint,
    polygons?: LandPolygon[],
): { onLand: boolean; landName?: string } {
    const {latitude: lat, longitude: lon} = point;
    const testPoint = turfPoint([lon, lat]);
    const effectivePolygons = getEffectivePolygons(polygons);

    for (const land of effectivePolygons) {
        try {
            const closedCoords = ensureClosed(land.polygon);
            const landPoly = turfPolygon([closedCoords]);
            if (booleanPointInPolygon(testPoint, landPoly)) {
                return {onLand: true, landName: land.name};
            }
        } catch {
            continue;
        }
    }

    for (const land of LAND_BOUNDING_BOXES) {
        const [minLon, minLat, maxLon, maxLat] = land.bbox;
        if (lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat) {
            return {onLand: true, landName: land.name};
        }
    }

    return {onLand: false};
}

/**
 * Check if a segment crosses land by linear interpolation sampling
 * Returns false for short segments (< LAND_CHECK_MIN_DISTANCE_KM).
 * Sample count adapts to segment length for better coverage on long routes
 *
 * Apply only to PLANNED/COMPARISON routes - simplified polygons produce
 * false positives near complex coastlines for ACTUAL GPS trails.
 */
export function doesSegmentCrossLand(
    lat1: number, lon1: number,
    lat2: number, lon2: number,
    numSamples?: number,
    polygons?: LandPolygon[],
): boolean {
    const distKm = haversineKm(lat1, lon1, lat2, lon2);
    if (distKm < LAND_CHECK_MIN_DISTANCE_KM) return false;

    const samples = numSamples ?? Math.min(32, Math.max(8, Math.ceil(distKm / 50)));
    const sampleDistanceMeters = (distKm * 1000) / samples;
    const samplePoints = interpolateGreatCircle([lon1, lat1], [lon2, lat2], sampleDistanceMeters);

    for (let i = 1; i < samplePoints.length - 1; i++) {
        const [sampleLon, sampleLat] = samplePoints[i];
        if (isPointOnLand({latitude: sampleLat, longitude: sampleLon}, polygons).onLand) return true;
    }
    return false;
}

export function validateRoute(
    points: RoutePoint[],
    polygons?: LandPolygon[],
): ValidationResult {
    const errors: ValidationError[] = [];

    for (let i = 0; i < points.length; i++) {
        const point = points[i];
        if (
            !Number.isFinite(point.latitude) ||
            !Number.isFinite(point.longitude) ||
            point.latitude < -90 || point.latitude > 90 ||
            point.longitude < -180 || point.longitude > 180
        ) {
            errors.push({
                type: 'INVALID_COORDINATES',
                message: `Point ${i} has invalid coordinates: [${point.longitude}, ${point.latitude}]`,
                point,
                segmentIndex: i,
            });
        }

        if (i > 0) {
            const prev = points[i - 1];
            if (doesSegmentCrossLand(prev.latitude, prev.longitude, point.latitude, point.longitude, undefined, polygons)) {
                errors.push({
                    type: 'LAND_CROSSING',
                    message: `Segment ${i - 1}-${i} appears to cross land`,
                    point,
                    segmentIndex: i,
                });
            }
        }
    }

    return {
        isValid: errors.length === 0,
        errors,
    };
}
