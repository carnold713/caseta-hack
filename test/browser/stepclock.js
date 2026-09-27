// A transition read on its own clock, one 60 Hz frame at a time, for the motion tests that sample it frame by frame.
//
// Read off the real frames, a transition's first moments are whatever the machine made of them: the frame after a tap
// paints the new page or sheet whole, and on a busy machine the next one comes 50 or 70 ms later, so the first frame
// sampled is already well into the curve and one step between frames looks like a jump. That is the machine, not the
// motion, and a check that holds the motion to "starts where the card is" or "never more than half the way in one
// frame" failed on it now and then. Stepped by hand, every frame is exactly 1/60 s apart, from the transition's
// first moment, however long the machine takes to draw each one.
//
// In the page (addInitScript(stepClock)), window.__clock:
//   arm(limit, { any })
//                the next transition is stepped: from the first frame its own clock animation is seen (see tick) to
//                `limit` ms of it, after which everything plays on by itself. With `any`, its clock is whichever
//                animation starts first from here on, for a test that has no one animation to name
//   tick(wa)     called by the test's sampler on each frame it samples, with the transition's own clock animation (a
//                window's clip-path, say) or null. Returns the time to sample at, in ms since the clock started: the
//                first time wa is seen, every animation it was started with is taken back to where it began and held
//                there; after that each call moves every held animation (and any started since) on by one frame.
//                Undefined while nothing is being stepped, so the sampler goes on with its own clock.
//   done()       whether an armed transition has been stepped to its limit (or nothing was armed)
//   disarm()     let everything play on, at once
function stepClock() {
  const FRAME = 1000 / 60;
  const K = window.__clock = { armed: false, run: null };
  const live = a => a.playState === 'running';
  // let one go: on from where it is, or finished where it has already reached its end (play() there would start it
  // over from the beginning)
  const free = a => { try { const end = a.effect ? a.effect.getComputedTiming().endTime : Infinity; if (Number(a.currentTime) >= end) a.finish(); else a.play(); } catch (_) { /* gone */ } };
  K.arm = (limit = 1600, { any = false } = {}) => { K.disarm(); K.armed = true; K.limit = limit; K.any = any ? new Set(document.getAnimations()) : null; };
  K.disarm = () => {
    const r = K.run; K.armed = false; K.run = null;
    if (r && !r.done) for (const [a] of r.held) free(a);
  };
  K.done = () => !K.armed || (!!K.run && K.run.done);
  const hold = (r, a, c0) => { try { a.pause(); a.currentTime = Math.max(0, c0); r.held.set(a, { c0: Math.max(0, c0), v0: r.v }); } catch (_) { /* gone */ } };
  K.tick = wa => {
    if (!K.armed) return undefined;
    let r = K.run;
    if (!r) {
      if (!wa && K.any) wa = document.getAnimations().find(a => !K.any.has(a) && a.playState === 'running') || null;
      if (!wa) return undefined;
      // The transition's own clock may have run a little before this first sample (the frame after a tap is often
      // late): it and everything started with it (the same start time) are taken back to their first moment.
      r = K.run = { v: 0, held: new Map(), done: false, seen: document.timeline.currentTime };
      const back = Number(wa.currentTime) || 0;
      const t0 = wa.startTime;
      for (const a of document.getAnimations()) {
        const same = t0 != null && a.startTime != null && Math.abs(a.startTime - t0) < 1;
        if (!same && !live(a)) continue;
        hold(r, a, (Number(a.currentTime) || 0) - (same ? back : 0));
      }
      return 0;
    }
    if (r.done) return K.limit + (performance.now() - r.at);
    const seen = r.seen; r.seen = document.timeline.currentTime;
    r.v += FRAME;
    // One started since the last frame looked (a redraw a frame later, from the house or a timer) is taken from its
    // first moment too: it was drawn there once already, and a busy frame since would otherwise count as a step. One
    // started before that (an animation carried over a redraw on the clock it had, motion.js keepClock) goes on from
    // where it is.
    for (const a of document.getAnimations()) {
      if (r.held.has(a) || a.playState !== 'running') continue;
      hold(r, a, a.startTime == null || a.startTime >= seen - 1 ? 0 : Number(a.currentTime) || 0);
    }
    for (const [a, h] of r.held) { try { a.currentTime = h.c0 + (r.v - h.v0); } catch (_) { /* gone */ } }
    if (r.v >= K.limit) {
      r.done = true; r.at = performance.now();
      for (const [a] of r.held) free(a);
    }
    return r.v;
  };
}
module.exports = { stepClock };
