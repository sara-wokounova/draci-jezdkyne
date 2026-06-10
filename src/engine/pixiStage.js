import { Application, Container } from 'pixi.js';

export async function createPixiStage(host) {
  const app = new Application();

  await app.init({
    resizeTo: host,
    antialias: true,
    autoDensity: true,
    background: 0x000000,
    backgroundAlpha: 1,
  });

  host.appendChild(app.canvas);

  const layers = {
    background: new Container(),
    characters: new Container(),
    effects: new Container(),
    overlay: new Container(),
  };

  app.stage.addChild(layers.background, layers.characters, layers.effects, layers.overlay);

  return { app, layers };
}
