export function ewmaSmooth(
    current: number,
    previous: number,
    alpha: number = 0.3,
): number {
    return alpha * current + (1 - alpha) * previous;
}

export interface EwmaFilter {
    next(value: number): number;

    reset(): void;
}

export function createEwmaFilter(alpha: number = 0.3): EwmaFilter {
    let previous: number | null = null;

    return {
        next(value: number): number {
            if (previous === null) {
                previous = value;
                return value;
            }
            previous = ewmaSmooth(value, previous, alpha);
            return previous;
        },
        reset() {
            previous = null;
        },
    };
}
