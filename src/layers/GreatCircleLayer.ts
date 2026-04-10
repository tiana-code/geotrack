import {PathLayer, ScatterplotLayer, TextLayer} from '@deck.gl/layers';
import {PathStyleExtension} from '@deck.gl/extensions';
import greatCircle from '@turf/great-circle';
import bearing from '@turf/bearing';
import {point as turfPoint} from '@turf/helpers';
import type {Position} from 'geojson';
import type {Layer} from '@deck.gl/core';

export interface GreatCircleRoute {
    id: string;
    name?: string;
    from: [number, number];
    to: [number, number];
    color?: [number, number, number, number];
    width?: number;
    nPoints?: number;
}

export interface GreatCircleLayerProps {
    routes: GreatCircleRoute[];
    visible?: boolean;
    showWaypoints?: boolean;
    showLabels?: boolean;
    showDistance?: boolean;
}

interface RoutePathData {
    id: string;
    path: Position[];
    color: [number, number, number, number];
    width: number;
    distance: number;
    initialBearing: number;
}

interface WaypointData {
    id: string;
    position: [number, number];
    type: 'start' | 'end';
    label?: string;
}

const EARTH_RADIUS_NM = 3440.065;
const DEFAULT_COLOR: [number, number, number, number] = [0, 150, 255, 200];
const DEFAULT_WIDTH = 3;
const DEFAULT_POINTS = 100;


export function calculateGreatCircleRoute(
    from: [number, number],
    to: [number, number],
    nPoints: number = DEFAULT_POINTS,
): Position[] {
    try {
        const line = greatCircle(turfPoint(from), turfPoint(to), {npoints: nPoints});

        if (line.geometry.type === 'LineString') {
            return line.geometry.coordinates;
        }
        if (line.geometry.type === 'MultiLineString') {
            return line.geometry.coordinates.flat();
        }
        return [from, to];
    } catch {
        return [from, to];
    }
}

export function calculateGreatCircleDistance(
    from: [number, number],
    to: [number, number],
): number {
    const [lon1, lat1] = from;
    const [lon2, lat2] = to;

    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

    return EARTH_RADIUS_NM * 2 * Math.asin(Math.sqrt(a));
}

export function calculateInitialBearing(
    from: [number, number],
    to: [number, number],
): number {
    try {
        const rawBearing = bearing(turfPoint(from), turfPoint(to));
        return (rawBearing + 360) % 360;
    } catch {
        return 0;
    }
}

export function createGreatCircleLayers(props: GreatCircleLayerProps): Layer[] {
    const {
        routes,
        visible = true,
        showWaypoints = true,
        showLabels = true,
        showDistance = true,
    } = props;

    if (!visible || routes.length === 0) return [];

    const layers: Layer[] = [];

    const routePaths: RoutePathData[] = routes.map((route) => ({
        id: route.id,
        path: calculateGreatCircleRoute(route.from, route.to, route.nPoints || DEFAULT_POINTS),
        color: route.color || DEFAULT_COLOR,
        width: route.width || DEFAULT_WIDTH,
        distance: calculateGreatCircleDistance(route.from, route.to),
        initialBearing: calculateInitialBearing(route.from, route.to),
    }));

    layers.push(
        new PathLayer<RoutePathData>({
            id: 'great-circle-paths',
            data: routePaths,
            pickable: true,
            widthUnits: 'pixels',
            widthScale: 1,
            widthMinPixels: 2,
            getPath: (d) => d.path as [number, number][],
            getColor: (d) => d.color,
            getWidth: (d) => d.width,
            jointRounded: true,
            capRounded: true,
            billboard: false,
        }),
    );

    if (showWaypoints) {
        const waypoints: WaypointData[] = routes.flatMap((route) => [
            {
                id: `${route.id}-start`,
                position: route.from,
                type: 'start' as const,
                label: route.name ? `${route.name} (Start)` : 'Start',
            },
            {
                id: `${route.id}-end`,
                position: route.to,
                type: 'end' as const,
                label: route.name ? `${route.name} (End)` : 'End',
            },
        ]);

        layers.push(
            new ScatterplotLayer<WaypointData>({
                id: 'great-circle-waypoints',
                data: waypoints,
                pickable: true,
                stroked: true,
                filled: true,
                radiusUnits: 'pixels',
                radiusMinPixels: 6,
                radiusMaxPixels: 12,
                getPosition: (d) => d.position,
                getFillColor: (d) => (d.type === 'start' ? [0, 200, 100, 255] : [255, 100, 50, 255]),
                getLineColor: [255, 255, 255, 255],
                getRadius: 8,
                lineWidthMinPixels: 2,
            }),
        );
    }

    if (showLabels && showDistance) {
        const distanceLabels = routePaths.map((route) => {
            const midIndex = Math.floor(route.path.length / 2);
            const midPoint = route.path[midIndex] as [number, number];

            return {
                id: `${route.id}-distance`,
                position: midPoint,
                text: `${Math.round(route.distance)} NM\n${Math.round(route.initialBearing)}°`,
            };
        });

        layers.push(
            new TextLayer<{ id: string; position: [number, number]; text: string }>({
                id: 'great-circle-labels',
                data: distanceLabels,
                pickable: false,
                getPosition: (d) => d.position,
                getText: (d) => d.text,
                getSize: 12,
                getColor: [255, 255, 255, 255],
                getTextAnchor: 'middle',
                getAlignmentBaseline: 'center',
                fontFamily: 'Inter, system-ui, sans-serif',
                fontWeight: 500,
                fontSettings: {sdf: true},
                outlineWidth: 2,
                outlineColor: [0, 0, 0, 200],
                background: true,
                backgroundColor: [0, 0, 0, 150],
                backgroundPadding: [4, 2],
            }),
        );
    }

    return layers;
}

export interface ComparisonRoute {
    id: string;
    from: [number, number];
    to: [number, number];
    showComparison?: boolean;
}

export function createComparisonLayers(route: ComparisonRoute): Layer[] {
    const {id, from, to, showComparison = true} = route;
    const layers: Layer[] = [];

    const gcPath = calculateGreatCircleRoute(from, to, 100);

    layers.push(
        new PathLayer({
            id: `${id}-great-circle`,
            data: [{path: gcPath}],
            getPath: (d) => d.path,
            getColor: [0, 150, 255, 200],
            getWidth: 3,
            widthUnits: 'pixels',
            pickable: true,
        }),
    );

    if (showComparison) {
        layers.push(
            new PathLayer({
                id: `${id}-rhumb-line`,
                data: [{path: [from, to]}],
                getPath: (d) => d.path,
                getColor: [255, 150, 0, 200],
                getWidth: 3,
                widthUnits: 'pixels',
                getDashArray: [8, 4],
                extensions: [new PathStyleExtension({dash: true})],
                pickable: true,
            }),
        );
    }

    return layers;
}

export default createGreatCircleLayers;
