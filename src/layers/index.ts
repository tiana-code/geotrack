export {createOceanCurrentsLayers, createWindLayers, generateSampleCurrents} from './OceanCurrentsLayer.js';
export type {
    CurrentVector, CurrentField, OceanCurrentsLayerProps, WindVector, WindLayerProps
} from './OceanCurrentsLayer.js';

export {
    createGreatCircleLayers,
    createComparisonLayers,
    calculateGreatCircleRoute,
    calculateGreatCircleDistance,
    calculateInitialBearing
} from './GreatCircleLayer.js';
export type {GreatCircleRoute, GreatCircleLayerProps, ComparisonRoute} from './GreatCircleLayer.js';

export {
    createVesselTrailLayers, MAX_TRAIL_POINTS, ACTUAL_GAP_THRESHOLD_KM, PLANNED_GAP_THRESHOLD_KM
} from './VesselTrailLayer.js';
export type {TrailData, VesselTrailLayerProps} from './VesselTrailLayer.js';

export {getSpeedColor, getVesselColor, getFuelColor, getFuelLevel} from './colorUtils.js';
export type {FuelLevel, VesselStatus} from './colorUtils.js';
