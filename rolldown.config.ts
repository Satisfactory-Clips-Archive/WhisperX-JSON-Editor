import {
	defineConfig,
} from 'rolldown';

// eslint-disable-next-line imports/no-default-export
export default defineConfig([
	{
		input: './src/index.ts',
		output: {
			format: 'esm',
			dir: './src/',
			minify: true,
			sourcemap: true,
			codeSplitting: {
				groups: [
					{
						test: /node_modules\/ajv/,
						name: 'vendor--ajv',
					},
					{
						test: /node_modules\/lit(?:-html)?\//,
						name: 'vendor--lit-html',
					},
					{
						test: /node_modules/,
						name: 'vendor',
					},
				],
			},
		},
	},
]);
