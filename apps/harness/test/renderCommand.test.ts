import { describe, it, expect } from "vitest";
import { DEFAULT_HUD } from "@cellstorm/render/hud-config";
import { buildRenderCommand } from "../src/ui/renderCommand";

describe("buildRenderCommand", () => {
  it("builds the renderer CLI invocation with config, db and default out", () => {
    const cmd = buildRenderCommand({ configId: "4:Tank,Plague:7", dbPath: "/data/cellstorm.db" });
    expect(cmd).toBe(
      "pnpm --filter @cellstorm/renderer render --config '4:Tank,Plague:7' --db '/data/cellstorm.db' --out 'out.mp4'",
    );
  });

  it("includes a shell-quoted HUD JSON when provided", () => {
    const cmd = buildRenderCommand({
      configId: "2:Tank,Swift:1",
      dbPath: "/db.db",
      hud: DEFAULT_HUD,
    });
    expect(cmd).toContain("--hud '" + JSON.stringify(DEFAULT_HUD) + "'");
    expect(cmd.startsWith("pnpm --filter @cellstorm/renderer render")).toBe(true);
  });

  it("respects a custom out path", () => {
    const cmd = buildRenderCommand({ configId: "x", dbPath: "/db", out: "videos/final.mp4" });
    expect(cmd).toContain("--out 'videos/final.mp4'");
  });

  it("escapes embedded single quotes for the shell", () => {
    const cmd = buildRenderCommand({ configId: "id", dbPath: "/it's a path/db.db" });
    expect(cmd).toContain(`--db '/it'\\''s a path/db.db'`);
  });
});
