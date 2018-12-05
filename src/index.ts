import { embedPyodideScripts } from './util/embedPyodideScripts'
import { usePromise } from './util/usePromise'
import { createInitialModule } from './util/createInitialModule'
import { Pyodide } from './types'

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
	const [postRunPromise, resolvePostRun] = usePromise()
	const [dataLoadPromise, resolveDataLoad] = usePromise()
	const Module = createInitialModule(baseURL, resolvePostRun, resolveDataLoad)

		// Pack the module into the window
	;(window as any).Module = Module

	// Load Pyodide
	embedPyodideScripts(baseURL, Module)
	await Promise.all([postRunPromise, dataLoadPromise])
	return window.pyodide
}
