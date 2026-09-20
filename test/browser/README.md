# The browser suite

Drives the real app in Chromium against a hub and a fake connector, and checks what the screen actually
does. `npm run test:browser` runs all of it.

```
npm run test:browser                   all of them, in order, on a fresh rig
npm run test:browser -- polish night   only the ones whose name contains these
KEEP=1 npm run test:browser -- ia       leave the rig up afterwards to poke at
```

`run.js` picks a free port, starts `hub/server.js` and `fake_connector.js` on it with a throwaway data
directory, waits for the connector to reach the hub, then runs each test with that port in `PORT`. It
stops the rig on the way out, and prints where the failing output went.

## Why the runner owns the rig

These tests used to live outside the repo, and each one remembered whichever port its rig was on the
week it was written: 4400, 4408, 4409, 4420 and 4485 were all in use at once. Running one meant knowing
which it wanted. Against the wrong one it failed with `ERR_CONNECTION_REFUSED`, which reads exactly like
a broken app, and more than one afternoon went into chasing that before noticing. There is one port now
and this runner hands it down, so a test that cannot reach the app is a real failure.

The same move fixed the other half of it. Living outside the repo meant the tests never moved when the
app did: two of them still looked for `.rooms .room` and `.list.rooms .item.room` long after the room
grid became `.rgrid`. One failed loudly, which is the good case. The other compared a count before a
change with the count after and passed on `0 === 0` for as long as its selector had been wrong.

## One login for the whole run

The hub allows 20 logins from an address in 15 minutes, and this is 28 tests. A run that logged in per
test died two thirds of the way down, and the way it died is worth knowing: every remaining test timed
out waiting for `#nav`, because the page was sitting on the password gate and nothing said so. Seven
tests failed at once, all with a selector timeout that looks like a broken app.

`run.js` logs in once, puts the token in `APP_TOKEN`, and every test seeds `localStorage` with it
before its first navigation. A test run by hand without the runner falls back to typing the password,
which is fine for one test and is what the `#pw` line in each of them is still for.

## Order matters

`hue_color_test` and `nanoleaf_test` pair the fake bridges, and what they leave behind is what lets
later tests find a colour lamp. `ia_test` cannot reach the colour sheet without them. `run.js` keeps the
order; a filtered run keeps the relative order too, so `-- ia` alone may fail for want of a lamp while
`-- hue nanoleaf ia` passes.

## Fixtures

`fake_connector.js` pretends to be the in-home connector: ten lights and three remotes over the hub's
own WebSocket, plus fake Hue and Nanoleaf bridges over real HTTP. It holds its inventory in memory, so
wiping the hub's data directory is not a reset of the fixture: `rooms_test` restarts it for that reason,
killing only the one on its own port by reading `/proc/<pid>/environ`.

A test that leaves state behind is a test the next run starts inside. Reset what you set up, at the top
of the test, rather than assuming a clean rig.

## Writing one

Take the shape from any of them. The parts that matter: a `check(ok, what)` that prints the measured
value, not just a verdict; `page.on('pageerror')` collected and asserted at the end; and screenshots
written next to the run's output, which is the throwaway data directory, never the repo.

Print numbers. A line that says `(0 of 0)` is how a dead selector looks when it is passing.
