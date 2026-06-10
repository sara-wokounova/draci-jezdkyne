import { Graphics } from 'pixi.js';

export class AtmosphereEffects {
  constructor(app, particleLayer, overlayLayer) {
    this.app = app;
    this.particleLayer = particleLayer;
    this.overlayLayer = overlayLayer;
    this.particles = [];
    this.tick = this.tick.bind(this);
  }

  start(effects) {
    this.stop();
    if (effects.includes('sunsetGlow')) this.addSunsetGlow();
    if (effects.includes('snow')) this.addSnow(120);
    if (effects.includes('wind')) this.wind = 1.8;
    this.app.ticker.add(this.tick);
  }

  stop() {
    this.app.ticker.remove(this.tick);
    this.wind = 0.4;
    this.particles = [];
    this.particleLayer.removeChildren().forEach((child) => child.destroy());
    this.overlayLayer.removeChildren().forEach((child) => child.destroy());
  }

  addSunsetGlow() {
    const { width, height } = this.app.screen;
    const glow = new Graphics();
    glow.circle(width * 0.82, height * 0.22, width * 0.25).fill({ color: 0xffc56e, alpha: 0.16 });
    glow.circle(width * 0.82, height * 0.22, width * 0.48).fill({ color: 0xffa24c, alpha: 0.08 });
    this.overlayLayer.addChild(glow);
  }

  addSnow(count) {
    const { width, height } = this.app.screen;

    for (let index = 0; index < count; index += 1) {
      const particle = new Graphics();
      const radius = 1 + Math.random() * 2.6;
      particle.circle(0, 0, radius).fill({ color: 0xffffff, alpha: 0.45 + Math.random() * 0.35 });
      particle.x = Math.random() * width;
      particle.y = Math.random() * height;
      particle.speed = 0.5 + Math.random() * 1.4;
      particle.drift = -0.5 + Math.random();
      this.particles.push(particle);
      this.particleLayer.addChild(particle);
    }
  }

  tick(ticker) {
    const { width, height } = this.app.screen;
    const delta = ticker.deltaTime;

    this.particles.forEach((particle) => {
      particle.x += (particle.drift + this.wind) * delta;
      particle.y += particle.speed * delta;

      if (particle.y > height + 10 || particle.x > width + 10) {
        particle.x = -10 + Math.random() * width * 0.15;
        particle.y = -10;
      }
    });
  }
}
