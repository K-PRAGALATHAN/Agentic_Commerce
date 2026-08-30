/// <reference types="vite/client" />

// Asset imports (the login artwork) need Vite ambient types; without this the
// typecheck fails on a module the bundler resolves perfectly well.
