import {defineConfig} from 'vite';
import dts from 'vite-plugin-dts';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
    plugins: [
        dts({rollupTypes: true}),
    ],
    build: {
        lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            formats: ['es', 'cjs'],
            fileName: (format) => format === 'es' ? 'index.js' : 'index.cjs',
        },
        rollupOptions: {
            external: [
                '@deck.gl/core',
                '@deck.gl/extensions',
                '@deck.gl/layers',
                '@turf/bearing',
                '@turf/boolean-point-in-polygon',
                '@turf/great-circle',
                '@turf/helpers',
                'geojson',
                'maplibre-gl',
                'react',
            ],
        },
        sourcemap: true,
    },
});
