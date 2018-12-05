import { fixRecursionLimit } from './util/fixRecursionLimit'
import { makePublicApi } from './util/makePublicApi'
import { embedPyodideScripts } from './util/embedPyodideScripts'
import { usePromise } from './util/usePromise'
import { Pyodide, PyodideModule } from './types'

declare var WebAssembly: {
	compileStreaming: (source: Promise<any>) => Promise<any>
	instantiate: (module: any, info: any) => Promise<any>
}

/**
 * The pyodide public API
 */
const PYODIDE_PUBLIC_API = [
	'loadPackage',
	'loadedPackages',
	'pyimport',
	'repr',
	'runPython',
	'runPythonAsync',
	'version',
]

declare global {
	interface Window {
		pyodide: Pyodide
	}
}

/**
 * The main bootstrap script for loading pyodide.
 *
 * @param {string} baseURL the base URL for pyodide scripts
 */
export async function languagePluginLoader(baseURL: string): Promise<Pyodide> {
	const wasmURL = `${baseURL}pyodide.asm.wasm`
	const wasmPromise = WebAssembly.compileStreaming(fetch(wasmURL))
	const [postRunPromise, resolvePostRun] = usePromise()
	const [dataLoadPromise, resolveDataLoad] = usePromise()

	const Module: Partial<PyodideModule> = {
		noImageDecoding: true,
		noAudioDecoding: true,
		noWasmDecoding: true,
		preloadedWasm: {},
		locateFile: (path: string) => baseURL + path,
		instantiateWasm(info: any, receiveInstance: (instance: any) => void) {
			wasmPromise
				.then(module => WebAssembly.instantiate(module, info))
				.then(instance => receiveInstance(instance))
			return {}
		},
		postRun() {
			delete (window as any).Module
			fetch(`${baseURL}packages.json`)
				.then(response => response.json())
				.then(json => {
					fixRecursionLimit(window.pyodide)
					window.pyodide = makePublicApi<Pyodide>(
						window.pyodide,
						PYODIDE_PUBLIC_API,
					)
					window.pyodide._module.packages = json
					resolvePostRun()
				})
		},
		monitorRunDependencies(n: number) {
			if (n === 0) {
				delete Module.monitorRunDependencies
				resolveDataLoad()
			}
		},
	}

	;(window as any).Module = Module
	embedPyodideScripts(baseURL, Module)
	await Promise.all([postRunPromise, dataLoadPromise])
	return window.pyodide
}
