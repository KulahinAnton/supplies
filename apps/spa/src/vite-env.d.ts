/// <reference types="vite/client" />

/**
 * Vite types `import.meta.env` as `Record<string, any>` by default, so every
 * read of it is an unchecked `any` — which type-aware lint flags, correctly.
 * Declaring the variables this app actually uses turns a missing `VITE_API_URL`
 * into a typed `string | undefined` that the `??` fallback has to handle.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
