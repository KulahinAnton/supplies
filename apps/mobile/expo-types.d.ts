/// <reference types="expo/types" />

// Expo's global types — `process.env` among them, declared in
// `expo/types/metro-require.d.ts` — reach this program only through a
// reference like the one above.
//
// `expo start` writes the same line into `expo-env.d.ts`, but that file is
// generated and gitignored, so a fresh checkout has neither it nor
// `.expo/types/`. CI is exactly that checkout: without this file
// `process.env.EXPO_PUBLIC_API_URL` has no type there, and the type-aware lint
// reads it as `any` — while passing on every machine that has ever run Metro.
// This file is tracked so the types do not depend on having done that.
