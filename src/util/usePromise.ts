/**
 * A utility to externalize promise resolution
 */
export function usePromise<T>(): [
	Promise<T>,
	(input?: T) => void,
	(err?: Error) => void
] {
	let resolver: (input?: T) => void | undefined
	let rejecter: (err?: Error) => void | undefined

	/**
	 * this works, because according to the promise spec, the promise callback is invoked immediately
	 */
	const promise = new Promise<T>((resolve, reject) => {
		resolver = resolve
		rejecter = reject
	})
	return [promise, resolver!, rejecter!]
}
