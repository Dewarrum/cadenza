/// <reference types="vite-plugin-pwa/vanillajs" />

declare module "virtual:pieces" {
  const pieces: import("./pieces.ts").PieceInfo[];
  export default pieces;
}

declare const __APP_VERSION__: string; // package.json version, set by vite.config.ts
