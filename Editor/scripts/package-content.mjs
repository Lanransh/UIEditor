// Vite and esbuild bundle runtime dependencies; only these outputs belong in app.asar.
// Packager supplies paths relative to dir, with forward slashes and a leading slash.
export const ignoredPackageContent = /^\/(?!(?:dist|dist-electron)(?:\/|$)|package\.json$).+/;
