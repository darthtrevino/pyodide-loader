import { Pyodide, MessageCallback, PyodideModule } from '../types'
import { getPackageDependencies } from './getPackageDependencies'
import { loadPackageSet } from './loadPackageSet'

export function loadPackage(
	baseURL: string,
	pymod: PyodideModule,
	names: string[],
	messageCallback: MessageCallback,
): Promise<any> {
	const pyodide = window.pyodide as Pyodide
	const toLoad = getPackageDependencies(names, pyodide)
	const promise = loadPackageSet(
		toLoad,
		messageCallback,
		pyodide,
		pymod,
		baseURL,
	)
	invalidatePythonImportCaches(pyodide)
	return promise
}

function invalidatePythonImportCaches(pyodide: Pyodide) {
	// We have to invalidate Python's import caches, or it won't
	// see the new files. This is done here so it happens in parallel
	// with the fetching over the network.
	pyodide.runPython(
		'import importlib as _importlib\n' + '_importlib.invalidate_caches()\n',
	)
}
