import { isFirefox } from '../flags'
import {
	MessageCallback,
	Pyodide,
	PyodideFactory,
	PyodideModule,
} from '../types'
import { uriToPackageName } from './uriToPackageName'

/**
 * Embeds the pyodide ASM scripts onto the page
 * @param {string} baseURL
 * @param {*} Module
 */
export function embedPyodideScripts(
	baseURL: string,
	Module: Partial<PyodideModule>,
) {
	// Pack the module into the window
	;(window as any).Module = Module

	let loadPackagePromise = Promise.resolve()

	const preloadWasm = () => {
		// On Chrome, we have to instantiate wasm asynchronously. Since that
		// can't be done synchronously within the call to dlopen, we instantiate
		// every .so that comes our way up front, caching it in the
		// `preloadedWasm` dictionary.
		let promise = Promise.resolve()
		const FS = window.pyodide._module.FS

		function recurseDir(rootpath: string) {
			let dirs
			try {
				dirs = FS.readdir(rootpath)
			} catch {
				return
			}
			for (const entry of dirs) {
				if (entry.startsWith('.')) {
					continue
				}
				const path = rootpath + entry
				if (entry.endsWith('.so')) {
					if (Module.preloadedWasm[path] === undefined) {
						promise = promise
							.then(() =>
								Module.loadWebAssemblyModule!(FS.readFile(path), true),
							)
							.then(module => {
								Module.preloadedWasm[path] = module
							})
					}
				} else if (FS.isDir(FS.lookupPath(path).node.mode)) {
					recurseDir(path + '/')
				}
			}
		}

		recurseDir('/')

		return promise
	}

	/**
	 * The package names to load
	 * @param {string[]} names
	 * @param {*} messageCallback
	 */
	const loadPackageInternal = (
		names: string[] | undefined,
		messageCallback: MessageCallback,
	): Promise<any> => {
		const pyodide = window.pyodide as Pyodide
		// DFS to find all dependencies of the requested packages
		const packages = pyodide._module.packages.dependencies
		const loadedPackages = pyodide.loadedPackages
		const queue: string[] = [...(names || [])]
		const toLoad: { [key: string]: string } = {}

		while (queue.length) {
			let uri = queue.pop()!
			const pkgName = uriToPackageName(uri) as any

			if (pkgName == null) {
				throw new Error(`Invalid package name or URI '${uri}'`)
			} else if (pkgName === uri) {
				uri = 'default channel'
			}

			if (pkgName in loadedPackages) {
				if (uri !== loadedPackages[pkgName]) {
					throw new Error(
						`URI mismatch, attempting to load package ` +
							`${pkgName} from ${uri} while it is already ` +
							`loaded from ${loadedPackages[pkgName]}!`,
					)
				}
			} else if (pkgName in toLoad) {
				if (uri !== toLoad[pkgName]) {
					throw new Error(
						`URI mismatch, attempting to load package ` +
							`${pkgName} from ${uri} while it is already ` +
							`being loaded from ${toLoad[pkgName]}!`,
					)
				}
			} else {
				toLoad[pkgName] = uri
				if (packages.hasOwnProperty(pkgName)) {
					packages[pkgName].forEach((subpackage: string) => {
						if (!(subpackage in loadedPackages) && !(subpackage in toLoad)) {
							queue.push(subpackage)
						}
					})
				} else {
					throw new Error(`Unknown package '${pkgName}'`)
				}
			}
		}

		pyodide._module.locateFile = path => {
			// handle packages loaded from custom URLs
			const pkg = path.replace(/\.data$/, '')
			if (pkg in toLoad) {
				const uri = (toLoad as any)[pkg]
				if (uri !== 'default channel') {
					return uri.replace(/\.js$/, '.data')
				}
			}
			return baseURL + path
		}

		const promise = new Promise((resolve, reject) => {
			if (Object.keys(toLoad).length === 0) {
				resolve('No new packages to load')
				return
			}

			const packageList = Array.from(Object.keys(toLoad)).join(', ')
			if (messageCallback !== undefined) {
				messageCallback(`Loading ${packageList}`)
			}

			pyodide._module.monitorRunDependencies = n => {
				if (n === 0) {
					for (const pkg in toLoad) {
						if (toLoad.hasOwnProperty(pkg)) {
							pyodide.loadedPackages[pkg] = toLoad[pkg]
						}
					}
					delete pyodide._module.monitorRunDependencies
					if (!isFirefox) {
						preloadWasm().then(() => {
							resolve(`Loaded ${packageList}`)
						})
					} else {
						resolve(`Loaded ${packageList}`)
					}
				}
			}

			for (const pkg in toLoad) {
				if (toLoad.hasOwnProperty(pkg)) {
					const script = document.createElement('script')
					const uri = toLoad[pkg]
					if (uri === 'default channel') {
						script.src = `${baseURL}${pkg}.js`
					} else {
						script.src = `${uri}`
					}
					script.onerror = e => {
						reject(e)
					}
					document.body.appendChild(script)
				}
			}

			// We have to invalidate Python's import caches, or it won't
			// see the new files. This is done here so it happens in parallel
			// with the fetching over the network.
			pyodide.runPython(
				'import importlib as _importlib\n' + '_importlib.invalidate_caches()\n',
			)
		})

		return promise
	}

	/**
	 *
	 * @param {string[]} names the module names
	 * @param {*} messageCallback
	 */
	const loadPackage = (names: string[], messageCallback: MessageCallback) => {
		/* We want to make sure that only one loadPackage invocation runs at any
		 * given time, so this creates a "chain" of promises. */
		loadPackagePromise = loadPackagePromise.then(() =>
			loadPackageInternal(names, messageCallback),
		)
		return loadPackagePromise
	}

	const asmDataScript = document.createElement('script')
	asmDataScript.src = `${baseURL}pyodide.asm.data.js`
	asmDataScript.onload = () => {
		const script = document.createElement('script')
		script.src = `${baseURL}pyodide.asm.js`
		script.onload = () => {
			// The emscripten module needs to be at this location for the core
			// filesystem to install itself. Once that's complete, it will be replaced
			// by the call to `makePublicAPI` with a more limited public API.
			window.pyodide = ((window.pyodide as any) as PyodideFactory)(Module)
			window.pyodide.loadedPackages = new Array() as any
			window.pyodide.loadPackage = loadPackage
		}
		document.head!.appendChild(script)
	}

	document.head!.appendChild(asmDataScript)
}
