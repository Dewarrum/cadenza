/// <reference types="vite-plugin-pwa/vanillajs" />

declare module "virtual:pieces" {
  const pieces: import("./pieces.ts").PieceInfo[];
  export default pieces;
}
