"""Follow the day: the anchors, the mired interpolation, a lamp's own limits, the day's boundaries and a
northern summer where sunrise and sunset are far apart.
Run: python test_daylight.py"""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from daylight import (ANCHORS, Day, anchors_for, clamp_mirek, curve_points, day_from_sun, day_of_home, kelvin_at,
                      kelvin_to_mirek, lamp_kelvin, mirek_at, mirek_to_kelvin, shape, worth_sending)

TZ = ZoneInfo("America/Los_Angeles")


def at(y, m, d, hh, mm=0, tz=TZ):
    return datetime(y, m, d, hh, mm, tzinfo=tz)


def a_day(rise=(6, 30), noon=(13, 0), sset=(19, 30), d=(2026, 3, 20), tz=TZ):
    return Day(sunrise=at(*d, *rise, tz=tz), noon=at(*d, *noon, tz=tz), sunset=at(*d, *sset, tz=tz))


def day_of(day):
    """Every date gets the same clock times, shifted: a steady equinox-ish home, easy to reason about."""
    def of(dd):
        shift = timedelta(days=(dd - day.noon.date()).days)
        return Day(sunrise=day.sunrise + shift, noon=day.noon + shift, sunset=day.sunset + shift)
    return of


# ----- mireds, not kelvin -----
assert round(kelvin_to_mirek(2000)) == 500 and round(kelvin_to_mirek(5000)) == 200
assert mirek_to_kelvin(500) == 2000 and mirek_to_kelvin(200) == 5000
assert mirek_to_kelvin(kelvin_to_mirek(3456)) == 3456

# ----- the anchors are the ones the owner asked for -----
assert [k for _, _, k in ANCHORS] == [2000, 2200, 2700, 4000, 5200, 4000, 2900, 2400]
assert [(m, o) for m, o, _ in ANCHORS] == [("midnight", 0), ("sunrise", -60), ("sunrise", 0), ("sunrise", 90),
                                           ("noon", 0), ("sunset", -120), ("sunset", 0), ("sunset", 60)]

day = a_day()
of = day_of(day)
pts = anchors_for(day)
# solar midnight is twelve hours before noon, so the day's first anchor is at 1am here
assert pts[0][0] == at(2026, 3, 20, 1, 0), pts[0][0]
assert pts[1][0] == at(2026, 3, 20, 5, 30) and pts[2][0] == at(2026, 3, 20, 6, 30)
assert pts[3][0] == at(2026, 3, 20, 8, 0) and pts[4][0] == at(2026, 3, 20, 13, 0)
assert pts[5][0] == at(2026, 3, 20, 17, 30) and pts[6][0] == at(2026, 3, 20, 19, 30)
assert pts[7][0] == at(2026, 3, 20, 20, 30)
# on the anchor itself the value is the anchor, to the kelvin
for (when, _), (_, _, kelvin) in zip(pts, ANCHORS):
    assert kelvin_at(when, of) == kelvin, (when, kelvin, kelvin_at(when, of))

# ----- interpolation happens in mireds, not in kelvin -----
mid = at(2026, 3, 20, 7, 15)  # exactly halfway from sunrise (2700 K) to sunrise + 90 (4000 K)
half_mirek = (kelvin_to_mirek(2700) + kelvin_to_mirek(4000)) / 2
assert abs(mirek_at(mid, of) - half_mirek) < 0.01, mirek_at(mid, of)
assert kelvin_at(mid, of) == mirek_to_kelvin(half_mirek) == 3224
# the midpoint in kelvin would be 3350: a mired curve sits warmer there, which is the whole point
assert kelvin_at(mid, of) < 3350

# ----- the shape of the day: warm at night, coolest at noon, warm again by dusk -----
assert kelvin_at(at(2026, 3, 20, 3, 0), of) < 2400
assert kelvin_at(at(2026, 3, 20, 13, 0), of) == 5200
assert kelvin_at(at(2026, 3, 20, 21, 30), of) < 2400
# it only rises to noon and only falls after it
morning = [kelvin_at(at(2026, 3, 20, 1) + timedelta(minutes=30 * i), of) for i in range(24)]  # 1am to 12:30pm
assert morning == sorted(morning), morning
evening = [kelvin_at(at(2026, 3, 20, 13) + timedelta(minutes=30 * i), of) for i in range(15)]  # noon to 8pm
assert evening == sorted(evening, reverse=True), evening

# ----- the day's boundaries: a lamp switched on at 3am, at noon, at dusk -----
assert 2000 <= kelvin_at(at(2026, 3, 20, 3, 0), of) <= 2200          # deep night, on the way to the pre-dawn anchor
assert kelvin_at(at(2026, 3, 20, 12, 0), of) > 4900                   # nearly noon
assert 2400 <= kelvin_at(at(2026, 3, 20, 19, 45), of) <= 2900         # just after sunset
# 3am on one day and 3am on the next agree: the curve is continuous across midnight, not restarted at 00:00
assert abs(kelvin_at(at(2026, 3, 20, 3), of) - kelvin_at(at(2026, 3, 21, 3), of)) <= 1
# and it is continuous across the hour before and after midnight
before = kelvin_at(at(2026, 3, 20, 23, 59), of)
after = kelvin_at(at(2026, 3, 21, 0, 1), of)
assert abs(before - after) < 15, (before, after)
# every anchor of yesterday, today and tomorrow is in the series the curve is read from, in time order
series = curve_points(at(2026, 3, 20, 3), of)
assert len(series) == 24 and series == sorted(series, key=lambda p: p[0])

# ----- a lamp's own range -----
# a warm-white-only lamp (2200 K to 4000 K is 250 to 454 mireds) never gets asked for noon's 5200 K
warm_only = lamp_kelvin(at(2026, 3, 20, 13), of, kelvin_to_mirek(4000), kelvin_to_mirek(2200))
assert warm_only == 4000, warm_only
# and deep night is not colder than the lamp's warmest
assert lamp_kelvin(at(2026, 3, 20, 3), of, kelvin_to_mirek(4000), kelvin_to_mirek(2200)) == 2200
# a wide lamp gets the curve itself
assert lamp_kelvin(at(2026, 3, 20, 13), of, kelvin_to_mirek(6500), kelvin_to_mirek(2000)) == 5200
# no limits at all: the curve, untouched
assert lamp_kelvin(at(2026, 3, 20, 13), of) == 5200
# a range handed over the wrong way round still clamps
assert clamp_mirek(500, 153, 500) == 500 and clamp_mirek(600, 500, 153) == 500 and clamp_mirek(100, 153, 500) == 153

# ----- a northern summer: sunrise and sunset far apart -----
north = day_from_sun(date(2026, 6, 21), 65.58, 22.15, ZoneInfo("Europe/Stockholm"))  # Lulea, midsummer
assert (north.sunset - north.sunrise) > timedelta(hours=20), north.sunset - north.sunrise
nof = day_of_home(65.58, 22.15, ZoneInfo("Europe/Stockholm"))
# every anchor still lands in time order, and the night between dusk and the pre-dawn anchor is short but real
np = curve_points(north.noon, nof)
assert np == sorted(np, key=lambda p: p[0])
assert all((np[i + 1][0] - np[i][0]).total_seconds() >= 60 for i in range(len(np) - 1))
# noon is the coolest moment of that day, and the small hours are the warmest
k_noon = kelvin_at(north.noon, nof)
k_small = kelvin_at(north.noon.replace(hour=1, minute=0), nof)
assert k_noon > k_small and k_noon == 5200, (k_noon, k_small)
assert k_small <= 2700, k_small
# and a warm-only lamp up there is still inside its range at every hour of that day
for hour in range(24):
    k = lamp_kelvin(north.noon.replace(hour=hour, minute=0), nof, kelvin_to_mirek(4000), kelvin_to_mirek(2200))
    assert 2200 <= k <= 4000, (hour, k)

# a polar night (the sun never rises): noon still exists, so the curve does too, and it stays warm all day
polar = day_from_sun(date(2026, 12, 21), 78.2, 15.6, ZoneInfo("Europe/Oslo"))  # Longyearbyen, midwinter
pof = day_of_home(78.2, 15.6, ZoneInfo("Europe/Oslo"))
assert polar.sunrise < polar.noon < polar.sunset
for hour in range(24):
    k = kelvin_at(polar.noon.replace(hour=hour, minute=0), pof)
    assert 2000 <= k <= 5200, (hour, k)

# ----- the real sun, through the home's own location -----
home = day_of_home(45.52, -122.68, TZ)  # Portland
sept = home(date(2026, 9, 17))
assert sept.sunrise.hour == 6 and sept.sunset.hour == 19 and sept.noon.hour == 13
assert kelvin_at(sept.noon, home) == 5200
assert kelvin_at(sept.sunset, home) == 2900

# ----- what is worth sending -----
assert worth_sending(None, 300.0) and worth_sending(300.0, 310.0)
assert not worth_sending(300.0, 301.0)

# ----- the shape, for drawing -----
sh = shape(day, steps=24)
assert len(sh) == 25 and sh[0][0] == day.midnight and sh[-1][0] == day.midnight + timedelta(hours=24)
assert max(k for _, k in sh) == 5200 and min(k for _, k in sh) <= 2100

print("daylight: ok")
