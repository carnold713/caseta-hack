// 21 · Remotes (12744:110970). Every Pico in the house as a card, two across: the remote drawn on its stage, its
// name, and one line of how far it is set up. A press on a real remote lights its card and jumps to it.
import { picoSVG, picoPhoto } from '/ui/pico.js';

// The key a remote pressed within the last moment, from the data layer's note of live presses.
export function pressedKey(c, pid) {
  let best = null;
  for (const [k, v] of Object.entries(c.S.live || {})) {
    const [id, n] = k.split('/');
    if (id !== pid || !v || Date.now() - v.at > 1200) continue;
    if (!best || v.at > best.at) best = { n: Number(n), at: v.at };
  }
  return best ? best.n : null;
}

// A remote on its stage: the drawing, or the owner's photograph under the same keys.
export function remoteArt(c, d, opts = {}) {
  const R = c.REM;
  const model = R.modelFor(d), finish = R.finishFor(d);
  const keys = R.slots(d);
  const photo = picoPhoto(model, finish, () => c.soon());
  const svg = picoSVG({ model, finish, keys, sel: opts.sel, pressed: opts.pressed, height: opts.height, interactive: opts.interactive, label: opts.label });
  return photo ? `<span class="pico-photo" style="height:${opts.height}px"><img src="${photo}" alt="">${svg}</span>` : svg;
}

function card(c, d) {
  const { esc, icon, REM } = c;
  const st = REM.remoteStatus(d);
  const pressed = pressedKey(c, d.device_id);
  const line = st.error
    ? `<span class="rc-err"><i>!</i>${esc(st.text)}</span>`
    : `<span class="rc-st">${esc(st.text)}</span>${st.none && REM.usualLayoutTargets(d) ? `<button class="rc-usual" data-act="usual" data-id="${esc(d.device_id)}">Set up the usual way</button>` : ''}`;
  return `<div class="rcard ${pressed != null ? 'pressed' : ''}" data-go="remote/${esc(d.device_id)}" role="link" aria-label="${esc(d.name)}">
    <span class="rc-stage">${remoteArt(c, d, { height: 124, pressed })}${pressed != null ? `<span class="rc-cap">${esc(REM.buttonName(d.device_id, pressed))} pressed</span>` : ''}</span>
    <span class="rc-nm nm-cut">${esc(d.name)}</span>${line}</div>`;
}

export function view(c) {
  const { esc, icon, data } = c;
  const list = data.remotes();
  const body = list.length
    ? `<div class="rgrid">${list.map(d => card(c, d)).join('')}</div>`
    : `<div class="rempty"><p class="t-body muted">No remotes yet. Pair a Pico in the Lutron app, or add one from Settings, and it shows up here.</p><button class="pill ghost" data-act="refresh">Look again</button></div>`;
  return `<div class="remotes-page">
    <h1 class="t-h1 top-h1">Remotes</h1>
    <div class="listen"><span class="breath"><i></i></span><span>Press any button on a real remote to jump to it</span></div>
    ${body}
    <div class="info-row"><span class="ic-c">${icon('remote', 20, 1.4)}</span><p>Remotes keep working even when this phone is offline.</p></div>
  </div>`;
}

export const actions = {
  // "Set up the usual way", right from the card
  usual(c, el) {
    const d = c.data.dev(el.dataset.id); if (!d) return;
    if (!c.REM.applyUsualLayout(d.device_id)) return;
    c.save(`${d.name} set up the usual way`);
  },
  async refresh(c) {
    try { await c.data.api('/api/refresh', { method: 'POST' }); c.toast('Looking for new devices'); } catch (e) { c.toast(e.message, { err: true }); }
  },
};

// A press on a real remote while the list is open: that remote's page, with the key picked.
export function live(c, m) {
  if (m.type !== 'gesture') return;
  const d = c.data.dev(m.device_id); if (!d) return;
  c.ui.remoteKey = { ...(c.ui.remoteKey || {}), [d.device_id]: m.button_number };
  c.go(`remote/${d.device_id}`);
  c.toast(`That's ${d.name}. Tap a row to change what it does.`);
}
