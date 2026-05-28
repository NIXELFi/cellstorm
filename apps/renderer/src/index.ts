// Library surface of @cellstorm/renderer. Importing this does NOT run the CLI (main lives in
// cli.ts, gated on direct invocation).

export { renderBattle, bundlePageScript, frameFileName, MASTER_WIDTH, MASTER_HEIGHT } from "./renderBattle";
export type { RenderOptions, RenderResult } from "./renderBattle";
export { encode, ffmpegArgs } from "./encode";
export type { EncodeOptions } from "./encode";
export { parseRenderArgs, resolveConfig, resolveHud, resolveWidth } from "./cli";
export type { RenderCliArgs } from "./cli";
