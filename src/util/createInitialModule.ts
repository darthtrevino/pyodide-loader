import { Pyodide, PyodideModule } from '../types'
import { fixRecursionLimit } from './fixRecursionLimit'
import { makePublicApi } from './makePublicApi'
import { usePromise } from './usePromise'

declare var WebAssembly: {
	instantiate: (module: any, info: any) => Promise<any>
	compileStreaming: (source: Promise<any>) => Promise<any>
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

export function createInitialModule(
	baseURL: string,
): [Partial<PyodideModule>, Promise<any>] {
	const wasmPromise = loadBaseWasm(baseURL)
	const [postRunPromise, resolvePostRun] = usePromise()
	const [dataLoadPromise, resolveDataLoad] = usePromise()

	const Module: Partial<PyodideModule> = {
		noImageDecoding: true,
		noAudioDecoding: true,
		noWasmDecoding: true,
		preloadedWasm: {},
		locateFile: (path: string) => baseURL + path,
		instantiateWasm: makeInstantiateWasm(wasmPromise),
		postRun: makePostRun(baseURL, resolvePostRun),
		monitorRunDependencies(n: number) {
			if (n === 0) {
				delete Module.monitorRunDependencies
				resolveDataLoad()
			}
		},
	}

	const completionPromise = Promise.all([postRunPromise, dataLoadPromise])
	return [Module, completionPromise]
}

function loadBaseWasm(baseURL: string) {
	const wasmURL = `${baseURL}pyodide.asm.wasm`
	return WebAssembly.compileStreaming(fetch(wasmURL))
}

function makeInstantiateWasm(wasmPromise: Promise<any>) {
	return (info: any, receiveInstance: (instance: any) => void) => {
		wasmPromise
			.then(module => WebAssembly.instantiate(module, info))
			.then(instance => receiveInstance(instance))
		return {}
	}
}

function makePostRun(baseURL: string, resolve: () => void) {
	return () => {
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
				resolve()
			})
	}
}
