import {PathLayer, ScatterplotLayer, LineLayer} from '@deck.gl/layers';
import type {Layer} from '@deck.gl/core';

export interface CurrentVector {
    id: string;
    position: [number, number];
    direction: number;
    speed: number;
    type?: 'ocean' | 'wind' | 'tidal';
}

export interface CurrentField {
    id: string;
    bounds: [[number, number], [number, number]];
    vectors: CurrentVector[];
    timestamp?: number;
}

export interface OceanCurrentsLayerProps {
    currentField?: CurrentField;
    vectors?: CurrentVector[];
    visible?: boolean;
    opacity?: number;
    showArrows?: boolean;
    showStreamlines?: boolean;
    colorBySpeed?: boolean;
    minSpeed?: number;
    maxSpeed?: number;
    arrowSize?: number;
    density?: number;
    seed?: number;
}

const SPEED_COLORS: [number, number, number, number][] = [
    [50, 100, 200, 200],
    [50, 180, 150, 200],
    [100, 200, 100, 200],
    [200, 200, 50, 200],
    [250, 150, 50, 200],
    [230, 70, 70, 200],
];

const CURRENT_TYPE_COLORS: Record<string, [number, number, number, number]> = {
    ocean: [0, 150, 200, 200],
    wind: [100, 200, 255, 200],
    tidal: [150, 100, 200, 200],
};

function createSeededRandom(seed: number): () => number {
    let state = seed | 0;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let value = Math.imul(state ^ (state >>> 15), 1 | state);
        value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function interpolateSpeedColor(
    speed: number,
    minSpeed: number,
    maxSpeed: number,
): [number, number, number, number] {
    if (maxSpeed <= minSpeed) return SPEED_COLORS[0];
    const normalized = Math.min(1, Math.max(0, (speed - minSpeed) / (maxSpeed - minSpeed)));
    const index = Math.floor(normalized * (SPEED_COLORS.length - 1));
    const interpolation = (normalized * (SPEED_COLORS.length - 1)) - index;

    if (index >= SPEED_COLORS.length - 1) {
        return SPEED_COLORS[SPEED_COLORS.length - 1];
    }

    const from = SPEED_COLORS[index];
    const to = SPEED_COLORS[index + 1];

    return [
        Math.round(from[0] + (to[0] - from[0]) * interpolation),
        Math.round(from[1] + (to[1] - from[1]) * interpolation),
        Math.round(from[2] + (to[2] - from[2]) * interpolation),
        Math.round(from[3] + (to[3] - from[3]) * interpolation),
    ];
}

function calculateArrowEnd(
    position: [number, number],
    direction: number,
    speed: number,
    scale: number = 0.1,
): [number, number] {
    const directionRad = (direction * Math.PI) / 180;
    const length = speed * scale;

    const deltaLat = length * Math.cos(directionRad);
    const cosLat = Math.cos((position[1] * Math.PI) / 180) || 1;
    const deltaLon = length * Math.sin(directionRad) / cosLat;

    return [position[0] + deltaLon, position[1] + deltaLat];
}

function generateStreamline(
    startPosition: [number, number],
    vectors: CurrentVector[],
    steps: number = 20,
    stepSize: number = 0.1,
): [number, number][] {
    const path: [number, number][] = [startPosition];
    let currentPosition = startPosition;

    for (let i = 0; i < steps; i++) {
        const nearest = findNearestVector(currentPosition, vectors);
        if (!nearest || nearest.speed < 0.1) break;

        const nextPosition = calculateArrowEnd(currentPosition, nearest.direction, nearest.speed, stepSize);
        path.push(nextPosition);
        currentPosition = nextPosition;
    }

    return path;
}

function findNearestVector(
    position: [number, number],
    vectors: CurrentVector[],
): CurrentVector | null {
    if (vectors.length === 0) return null;

    let nearest = vectors[0];
    let minDistance = Infinity;

    for (const vector of vectors) {
        const distance = Math.sqrt(
            (vector.position[0] - position[0]) ** 2 +
            (vector.position[1] - position[1]) ** 2,
        );
        if (distance < minDistance) {
            minDistance = distance;
            nearest = vector;
        }
    }

    return nearest;
}

export function generateSampleCurrents(
    bounds: [[number, number], [number, number]],
    density: number = 10,
    seed: number = 42,
): CurrentVector[] {
    const safeDensity = Math.max(1, density);
    const random = createSeededRandom(seed);
    const vectors: CurrentVector[] = [];
    const [[minLon, minLat], [maxLon, maxLat]] = bounds;

    const lonStep = (maxLon - minLon) / safeDensity;
    const latStep = (maxLat - minLat) / safeDensity;

    for (let lat = minLat; lat <= maxLat; lat += latStep) {
        for (let lon = minLon; lon <= maxLon; lon += lonStep) {
            const baseDirection = (Math.sin(lat * 0.1) * 45 + Math.cos(lon * 0.1) * 45 + 90) % 360;
            const noise = random() * 30 - 15;
            const direction = (baseDirection + noise + 360) % 360;

            const baseSpeed = 1 + Math.abs(Math.sin(lat * 0.2)) * 2;
            const speed = baseSpeed + random() * 0.5;

            vectors.push({
                id: `current-${lat.toFixed(2)}-${lon.toFixed(2)}`,
                position: [lon, lat],
                direction,
                speed,
                type: 'ocean',
            });
        }
    }

    return vectors;
}

export function createOceanCurrentsLayers(props: OceanCurrentsLayerProps): Layer[] {
    const {
        currentField,
        vectors = [],
        visible = true,
        opacity = 0.8,
        showArrows = true,
        showStreamlines = false,
        colorBySpeed = true,
        minSpeed = 0,
        maxSpeed = 5,
        arrowSize = 1,
        density = 1,
        seed = 42,
    } = props;

    if (!visible) return [];

    const allVectors = currentField ? currentField.vectors : vectors;
    if (allVectors.length === 0) return [];

    let filteredVectors: CurrentVector[];
    if (density < 1) {
        const random = createSeededRandom(seed);
        filteredVectors = allVectors.filter(() => random() < density);
    } else {
        filteredVectors = allVectors;
    }

    const layers: Layer[] = [];

    if (showArrows) {
        layers.push(
            new ScatterplotLayer<CurrentVector>({
                id: 'current-bases',
                data: filteredVectors,
                pickable: true,
                opacity,
                stroked: false,
                filled: true,
                radiusUnits: 'pixels',
                radiusMinPixels: 2,
                radiusMaxPixels: 4,
                getPosition: (d) => d.position,
                getRadius: 3,
                getFillColor: (d) =>
                    colorBySpeed
                        ? interpolateSpeedColor(d.speed, minSpeed, maxSpeed)
                        : (CURRENT_TYPE_COLORS[d.type || 'ocean'] || CURRENT_TYPE_COLORS.ocean),
            }),
        );

        const arrowData = filteredVectors.map((vector) => ({
            ...vector,
            sourcePosition: vector.position,
            targetPosition: calculateArrowEnd(
                vector.position,
                vector.direction,
                vector.speed,
                0.05 * arrowSize,
            ),
        }));

        layers.push(
            new LineLayer<typeof arrowData[0]>({
                id: 'current-arrows',
                data: arrowData,
                pickable: true,
                opacity,
                getSourcePosition: (d) => d.sourcePosition,
                getTargetPosition: (d) => d.targetPosition,
                getColor: (d) =>
                    colorBySpeed
                        ? interpolateSpeedColor(d.speed, minSpeed, maxSpeed)
                        : (CURRENT_TYPE_COLORS[d.type || 'ocean'] || CURRENT_TYPE_COLORS.ocean),
                getWidth: 2,
                widthUnits: 'pixels',
                widthMinPixels: 1,
                widthMaxPixels: 3,
            }),
        );
    }

    if (showStreamlines) {
        const streamlineStartPoints = filteredVectors.filter((_, index) => index % 10 === 0);
        const streamlinePaths = streamlineStartPoints.map((start) => ({
            id: `streamline-${start.id}`,
            path: generateStreamline(start.position, allVectors, 30, 0.1),
            speed: start.speed,
        }));

        layers.push(
            new PathLayer<typeof streamlinePaths[0]>({
                id: 'current-streamlines',
                data: streamlinePaths,
                pickable: false,
                opacity: opacity * 0.7,
                widthUnits: 'pixels',
                widthMinPixels: 1,
                widthMaxPixels: 2,
                getPath: (d) => d.path,
                getColor: (d) =>
                    colorBySpeed
                        ? interpolateSpeedColor(d.speed, minSpeed, maxSpeed)
                        : [0, 150, 200, 180],
                getWidth: 1.5,
                jointRounded: true,
                capRounded: true,
            }),
        );
    }

    return layers;
}

export interface WindVector extends CurrentVector {
    gustSpeed?: number;
}

export interface WindLayerProps {
    windVectors: WindVector[];
    visible?: boolean;
    opacity?: number;
    showGusts?: boolean;
}

export function createWindLayers(props: WindLayerProps): Layer[] {
    const {
        windVectors,
        visible = true,
        opacity = 0.7,
        showGusts = false,
    } = props;

    if (!visible || windVectors.length === 0) return [];

    const layers: Layer[] = [];

    const arrowData = windVectors.map((vector) => ({
        ...vector,
        sourcePosition: vector.position,
        targetPosition: calculateArrowEnd(
            vector.position,
            vector.direction,
            vector.speed,
            0.08,
        ),
    }));

    layers.push(
        new LineLayer<typeof arrowData[0]>({
            id: 'wind-arrows',
            data: arrowData,
            pickable: true,
            opacity,
            getSourcePosition: (d) => d.sourcePosition,
            getTargetPosition: (d) => d.targetPosition,
            getColor: [100, 200, 255, 200],
            getWidth: 2,
            widthUnits: 'pixels',
        }),
    );

    if (showGusts) {
        const gustVectors = windVectors.filter((v) => v.gustSpeed && v.gustSpeed > v.speed * 1.3);

        layers.push(
            new ScatterplotLayer<WindVector>({
                id: 'wind-gusts',
                data: gustVectors,
                pickable: true,
                opacity: opacity * 0.5,
                stroked: true,
                filled: false,
                radiusUnits: 'pixels',
                getPosition: (d) => d.position,
                getRadius: (d) => (d.gustSpeed || d.speed) * 3,
                getLineColor: [255, 200, 0, 200],
                lineWidthMinPixels: 1,
            }),
        );
    }

    return layers;
}

export default createOceanCurrentsLayers;
