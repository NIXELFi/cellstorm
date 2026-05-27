// Intro hook: an editable title centered over the arena for the first `introSeconds`, then a
// quick fade-out. Visibility/opacity come from ./logic (introAlpha). The title text is
// settable live (harness HUD editor).

import { Container, Text } from "pixi.js";
import { introAlpha } from "./logic";

export class Intro {
  readonly view = new Container();
  private readonly title: Text;
  private readonly arenaW: number;
  private introSeconds: number;

  constructor(arenaW: number, scale: number, titleText: string, introSeconds: number) {
    this.arenaW = arenaW * scale;
    this.introSeconds = introSeconds;
    this.title = new Text({
      text: titleText,
      style: {
        fill: 0xffffff,
        fontSize: 13 * scale,
        fontWeight: "500",
        align: "center",
        wordWrap: true,
        wordWrapWidth: arenaW * scale * 0.9,
      },
    });
    this.title.anchor.set(0.5, 0.5);
    this.title.position.set(this.arenaW / 2, 60 * scale);
    this.view.addChild(this.title);
  }

  setTitle(text: string): void {
    this.title.text = text;
  }

  setIntroSeconds(seconds: number): void {
    this.introSeconds = seconds;
  }

  update(tick: number): void {
    this.view.alpha = introAlpha(tick, this.introSeconds);
    this.view.visible = this.view.alpha > 0;
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
