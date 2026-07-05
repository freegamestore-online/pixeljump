/** Web Audio API sound manager — all sounds synthesized, no external assets. */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private muted = true; // start muted per platform rules

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  toggle(): boolean {
    this.muted = !this.muted;
    return !this.muted;
  }

  get isMuted(): boolean { return this.muted; }

  unmute() { this.muted = false; }

  private play(fn: (ctx: AudioContext) => void) {
    if (this.muted) return;
    try {
      const ctx = this.getCtx();
      if (ctx.state === "suspended") ctx.resume();
      fn(ctx);
    } catch { /* ignore audio errors */ }
  }

  private beep(freq: number, type: OscillatorType, duration: number, gain = 0.3, ramp?: number) {
    this.play((ctx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g);
      g.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (ramp !== undefined) osc.frequency.linearRampToValueAtTime(ramp, ctx.currentTime + duration);
      g.gain.setValueAtTime(gain, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    });
  }

  collectCarrot() {
    this.beep(520, "sine", 0.12, 0.25, 880);
    setTimeout(() => this.beep(880, "sine", 0.08, 0.15), 80);
  }

  collectPowerUp() {
    this.beep(300, "sawtooth", 0.05, 0.2, 600);
    setTimeout(() => this.beep(600, "sine", 0.05, 0.2, 900), 60);
    setTimeout(() => this.beep(900, "sine", 0.12, 0.2, 1200), 120);
  }

  countdownWarning() {
    this.beep(440, "square", 0.08, 0.15);
  }

  gameOver() {
    this.beep(400, "sawtooth", 0.1, 0.3, 200);
    setTimeout(() => this.beep(200, "sawtooth", 0.15, 0.3, 80), 120);
    setTimeout(() => this.beep(80, "sawtooth", 0.3, 0.4, 40), 280);
  }

  victory() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => setTimeout(() => this.beep(n, "sine", 0.2, 0.3), i * 120));
  }

  buttonClick() {
    this.beep(600, "sine", 0.06, 0.1, 700);
  }

  shieldHit() {
    this.beep(300, "square", 0.15, 0.35, 150);
  }
}
