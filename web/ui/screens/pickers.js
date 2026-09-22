// Pickers and confirmations that open inside a sheet (app.js openPicker): which room, which light, "are you sure".
// Each returns a sheet spec; the taps it carries are the screen's own actions.

// A list of rooms to choose from, the current one ticked, with "New room" at the end.
export function roomPicker(c, { over = '', title, current, act, data = '', none = null, newRoom = true }) {
  const { esc, icon } = c;
  const rooms = [...c.data.areas()].sort((a, b) => a.name.localeCompare(b.name));
  const row = (id, name, sub) => `<button class="row ${sub ? 'sub' : ''} has-ic" data-act="${act}" data-room="${esc(id)}" ${data}>
      <span class="row-ic">${c.roomArt(name) ? `<img class="row-art" src="${c.artSrc(c.roomArt(name))}" alt="">` : icon('home', 20, 1.7)}</span>
      <span class="row-txt"><span class="t">${esc(name)}</span>${sub ? `<span class="d">${esc(sub)}</span>` : ''}</span>
      ${(current || '') === id ? `<span class="row-tick">${icon('check', 20, 1.9)}</span>` : ''}</button>`;
  const body = `<div class="group">
      ${none ? row('', none.label, none.sub) : ''}
      ${rooms.map(a => row(a.id, a.name, a.id === current ? 'Where it is now' : '')).join('')}
      ${newRoom ? `<button class="row has-ic" data-act="${act}" data-room="__new" ${data}><span class="row-ic">${icon('plus', 20, 1.7)}</span><span class="row-txt"><span class="t">New room</span></span></button>` : ''}
    </div>`;
  return { over, title, body };
}

// "Are you sure": what happens, one button that does it, one that does not.
export function confirmSheet(c, { over = '', title, text, yes, act, data = '' }) {
  return {
    over, title,
    body: `<p class="t-body muted sheet-p">${c.esc(text)}</p>
      <div class="sheet-btns"><button class="pill solid" data-act="${act}" ${data}>${c.esc(yes)}</button><button class="pill ghost" data-act="picker-back">Keep it</button></div>`,
  };
}

// A one-field form for a name, saved as it is typed (quietly) and when it is submitted.
export function nameSheet(c, { over = '', title, value, act, data = '', max = 40 }) {
  return {
    over, title,
    body: `<form class="name-form" data-form="name" data-act="${act}" ${data}>
      <input class="field" name="name" value="${c.esc(value)}" maxlength="${max}" autocomplete="off" spellcheck="false" aria-label="${c.esc(title)}">
      <button class="pill solid" type="submit">Done</button></form>`,
    after: (c2, r, root) => { const i = root.querySelector('.name-form input'); if (i && document.activeElement !== i) { i.focus(); i.select(); } },
  };
}

// Undo a move: the config as it was, and the bridge asked to put the device back in the room it came from, since it
// was asked to move it too.
export async function undoMove(c, did, from, prev) {
  c.data.restoreConfig(prev);
  await c.save('Moved back');
  if (from && from !== 'none') c.EDIT.bridgeMoveDevice(did, from).then(ch => { if (ch) c.save('', { quiet: true }); }).catch(() => { /* the app has it right either way */ });
}
