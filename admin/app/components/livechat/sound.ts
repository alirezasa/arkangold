// admin/app/components/livechat/sound.ts — صدای اعلان (Web Audio، بدون فایل صوتی)
let ctx: AudioContext | null = null;

function context() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctx =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
  }
  void ctx.resume().catch(() => undefined);
  return ctx;
}

/** kind: message = پیام جدید در گفتگو؛ queue = گفتگوی جدید در صف (دو نت بلندتر) */
export function playChatSound(kind: "message" | "queue" = "message") {
  const c = context();
  if (!c) return;
  const notes = kind === "queue" ? [660, 880, 1100] : [880, 1320];
  notes.forEach((f, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    const t = c.currentTime + i * 0.12;
    o.type = "sine";
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.25);
  });
}

/** پس از اولین تعامل کاربر، پخش صدا مجاز می‌شود (سیاست autoplay مرورگر) */
export function unlockChatSound() {
  context();
}
