"""A scene that says "follow the day", run against a lamp that is currently showing a colour.

This is the case the owner hit: a Nanoleaf sitting on a custom purple, a scene whose entry for it is
{level, follow: true}, and the panel staying purple after the scene runs. The lamp is a fake Nanoleaf
controller over real HTTP, so the assertions are about the bytes that reached the panel, not about
what this code believed it sent. Run: python test_followscene.py  (needs aiohttp)
"""
import asyncio
import json
import tempfile
from datetime import datetime
from pathlib import Path

from aiohttp import web

import daylight
from nanoleaf import Nanoleaf, nid

FAILS = []


def check(name, got, want):
    ok = got == want
    print(f"{'ok  ' if ok else 'FAIL'} {name}: {got!r}" + ('' if ok else f' (wanted {want!r})'))
    if not ok:
        FAILS.append(name)


def make_panel(state, serial='AAAA1111', name='Aurora', ct_lo=1200, ct_hi=6500):
    """A fake panel that records every state PUT it is given, in order."""
    async def info(request):
        if request.match_info['token'] != state['token']:
            return web.Response(status=401)
        return web.json_response({
            'name': name, 'serialNo': serial, 'model': 'NL22', 'firmwareVersion': '1.0.0',
            'state': {
                'on': {'value': state['on']},
                'brightness': {'value': state['bri'], 'min': 0, 'max': 100},
                'hue': {'value': state['hue'], 'min': 0, 'max': 360},
                'sat': {'value': state['sat'], 'min': 0, 'max': 100},
                'ct': {'value': state['ct'], 'min': ct_lo, 'max': ct_hi},
                'colorMode': state['mode'],
            },
            'effects': {'select': '*Solid*', 'effectsList': []},
        })

    async def put_state(request):
        if request.match_info['token'] != state['token']:
            return web.Response(status=401)
        body = await request.json()
        state['puts'].append(body)
        if 'on' in body:
            state['on'] = bool(body['on']['value'])
        if 'brightness' in body:
            state['bri'] = int(body['brightness']['value'])
        if 'ct' in body:
            state['ct'] = int(body['ct']['value']); state['mode'] = 'ct'
        if 'hue' in body:
            state['hue'] = int(body['hue']['value']); state['mode'] = 'hs'
        if 'sat' in body:
            state['sat'] = int(body['sat']['value'])
        return web.Response(status=204)

    app = web.Application()
    app.router.add_get('/api/v1/{token}/', info)
    app.router.add_put('/api/v1/{token}/state', put_state)
    return app


async def serve(app):
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '127.0.0.1', 0)
    await site.start()
    return runner, runner.addresses[0][1]


async def main():
    state = {'token': 'tok', 'on': True, 'bri': 70, 'hue': 280, 'sat': 90, 'ct': 4000,
             'mode': 'hs', 'puts': []}
    runner, port = await serve(make_panel(state))
    tmpdir = Path(tempfile.mkdtemp())
    host = f'127.0.0.1:{port}'
    (tmpdir / 'nanoleaf.json').write_text(json.dumps([{'host': host, 'token': 'tok', 'serial': 'AAAA1111', 'name': 'Aurora', 'model': 'NL22'}]))

    nl = Nanoleaf(tmpdir)
    await nl.start()
    did = nid('AAAA1111')
    d = nl.devices[did]
    check('the panel is listed as a colour lamp', bool(d.get('color')), True)
    check('the panel is listed as a white-temperature lamp', bool(d.get('ct')), True)
    check('it is showing a colour, not a white', d.get('color_mode'), 'xy')

    # What follow-the-day would ask for right now, through daylight.py's own helpers.
    from zoneinfo import ZoneInfo
    tz = ZoneInfo('America/Los_Angeles')
    now = datetime(2026, 6, 21, 14, 0, tzinfo=tz)
    day_of = daylight.day_of_home(45.52, -122.68, tz)
    ct = d['ct']
    mirek = daylight.lamp_mirek(now, day_of, ct.get('min'), ct.get('max'))

    state['puts'].clear()
    ok = await nl.set_warmth(did, daylight.mirek_to_kelvin(mirek), fade_s=2.0, level=60)
    check('set_warmth acted', ok, True)
    sent_ct = [p for p in state['puts'] if 'ct' in p]
    check('a white temperature reached the panel', len(sent_ct) >= 1, True)
    check('the panel left colour mode', state['mode'], 'ct')
    check('the app now calls it a white', d.get('color_mode'), 'ct')

    # The bug's real shape: the panel is on a colour, but its stale ct reading already matches today's
    # white. agent.py's _follow_apply skips a lamp whose ct "is already right", without asking whether
    # the lamp is currently showing white at all.
    shown = d['ct'].get('mirek')
    d['color_mode'] = 'xy'                      # back to purple, as if set by hand
    d['color']['xy'] = [0.28, 0.12]
    state['mode'] = 'hs'
    worth = daylight.worth_sending(shown, mirek)
    stale_match = shown is not None and abs(float(shown) - mirek) < daylight.MIN_STEP_MIREK

    # Before the fix the test was only these two, and a purple lamp was skipped whenever they agreed.
    check('its cached white still reads as already correct', (not worth) and stale_match, True)

    # The fix: the skip also requires the lamp to actually be showing white right now.
    def would_skip(devdict):
        on_white = devdict.get('color_mode') == 'ct'
        return on_white and (not worth) and stale_match
    check('a lamp showing purple is not skipped', would_skip(d), False)
    d['color_mode'] = 'ct'
    check('a lamp showing that very white is still skipped', would_skip(d), True)
    d['color_mode'] = None                      # an effect, or a mode the app does not model
    check('a lamp on an effect is not skipped', would_skip(d), False)

    await nl.stop()
    await runner.cleanup()
    print('\n' + ('FAILED: ' + ', '.join(FAILS) if FAILS else 'all checks passed'))
    return 1 if FAILS else 0


if __name__ == '__main__':
    raise SystemExit(asyncio.run(main()))
