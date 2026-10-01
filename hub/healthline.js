'use strict';
// One line per connector health report, for the Railway log: enough to tell a quiet house from a link that
// carries no presses without opening the app. The press count alone read "0 presses seen" for two days while
// every remote was dead; whether the bridge is reporting presses at all, how long the connector has run and
// what the bridge last complained about are what tell those apart.

function ago(sec) {
  if (sec == null || !isFinite(sec)) return null;
  sec = Math.max(0, Math.round(sec));
  if (sec < 90) return `${sec}s`;
  if (sec < 5400) return `${Math.round(sec / 60)}m`;
  if (sec < 172800) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}

function healthLine(h, nowSec = Date.now() / 1000) {
  h = h || {};
  const parts = [`connector holds ${h.bindings} button settings`,
    `bridge ${h.bridge_ok ? 'answering' : 'not answering'} with ${h.buttons} buttons`
      + (h.subscribed != null ? ` (${h.subscribed} reporting presses)` : '')];
  parts.push(`${h.presses} presses seen` + (h.last_press_at ? `, last ${ago(nowSec - h.last_press_at)} ago (${h.last_press || '?'})` : ''));
  if (h.uptime_s != null) parts.push(`up ${ago(h.uptime_s)}`);
  if (h.buttons_ok === false) parts.push('BUTTON PRESSES NOT REPORTED BY THE BRIDGE');
  if (h.reconnects) parts.push(`${h.reconnects} fresh bridge connection${h.reconnects === 1 ? '' : 's'}`);
  if (h.link_problem) parts.push(`link: ${h.link_problem}`);
  else if (h.last_reconnect && h.last_reconnect.at) parts.push(`last fresh connection ${ago(nowSec - h.last_reconnect.at)} ago: ${h.last_reconnect.why}`);
  if (h.link_ok_at) parts.push(`bridge checked ${ago(nowSec - h.link_ok_at)} ago`);
  if ((h.quiet_remotes || []).length) parts.push(`no buttons listed for ${h.quiet_remotes.join(', ')}`);
  const loud = (h.notes || []).filter(n => n && !n.ok);
  if (loud.length) parts.push(`bridge said: "${String(loud[loud.length - 1].text || '').slice(0, 160)}"`);
  if (h.lib) parts.push(`lib ${h.lib}`);
  return parts.join(', ');
}

module.exports = { healthLine, ago };
