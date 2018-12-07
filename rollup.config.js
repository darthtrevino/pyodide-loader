import resolve from 'rollup-plugin-node-resolve'
import typescript from 'rollup-plugin-typescript2'

export default {
	input: 'src/index.ts',
	plugins: [
		resolve(),
		typescript({
			typescript: require('typescript'),
			clean: true,
			verbosity: 3,
		}),
	],
	output: [
		{
			format: 'iife',
			file: 'dist/pyodide-loader.js',
			name: 'languagePluginLoader',
		},
	],
}
