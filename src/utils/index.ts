export {
    lerp, lerpHeading, predictPosition, predictPositionClamped, DEAD_RECKONING_MAX_ELAPSED_MS
} from './deadReckoning.js';

export {ewmaSmooth, createEwmaFilter} from './ewma.js';
export type {EwmaFilter} from './ewma.js';

export {
    haversineKm,
    haversineDistance,
    calculateBearing,
    isCourseAnomaly,
    douglasPeucker,
    SimpleKalmanFilter,
    smoothTrailKalman,
    interpolateGreatCircle,
} from './geoUtils.js';

export {
    doesSegmentCrossLand,
    isPointOnLand,
    validateRoute,
    updateLandPolygons,
    LAND_CHECK_MIN_DISTANCE_KM,
} from './routeValidation.js';
export type {ValidationResult, ValidationError, LandPolygon} from './routeValidation.js';
