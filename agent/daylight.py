"""Follow the day: the white temperature a lamp shows when it is following the sun.

A lamp set to follow the day keeps its white matched to the time of day, on its own, for as long as it is
on: cool and bright around midday, warm in the evening, like daylight.

The curve is anchored to the home's real sun, not the clock, so it moves with the seasons and works at any
latitude. Every anchor below is an offset in minutes from one of four moments of the day (solar midnight,
sunrise, solar noon, sunset) and the white it should show there, in kelvin. Between two anchors the value
is interpolated in **mireds** (a million over kelvin), because a step in mireds looks like an even step to
the eye while a step in kelvin does not: 2000 K to 2500 K is a large change, 6000 K to 6500 K is barely
visible, and the two are the same number of kelvin.

    from daylight import day_of_home, lamp_kelvin
    day_of = day_of_home(lat, lng, tz)          # date -> Day(sunrise, sunset, noon)
    kelvin = lamp_kelvin(now, day_of, mirek_min, mirek_max)

`mirek_min` / `mirek_max` are what the lamp itself reports (Hue gives every light its own mirek range);
the value is clamped into that range so nothing is ever asked of a lamp that it cannot show.

This table is the whole curve. It is mirrored in web/js/daylight.js, which draws the day's shape in the
app: change one and change the other.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date as _date, datetime, timedelta, tzinfo
from typing import Callable, List, Optional, Tuple

from sun import solar_noon, sun_times

# (moment, minutes from it, kelvin). "midnight" is solar midnight, twelve hours before that day's noon.
ANCHORS: List[Tuple[str, int, int]] = [
    ("midnight", 0, 2000),     # deep night
    ("sunrise", -60, 2200),    # an hour before the sun is up
    ("sunrise", 0, 2700),      # sunrise
    ("sunrise", 90, 4000),     # the morning has arrived
    ("noon", 0, 5200),         # the sun is highest
    ("sunset", -120, 4000),    # the afternoon starts to warm
    ("sunset", 0, 2900),       # sunset
    ("sunset", 60, 2400),      # dusk is over
]
# How long a change takes, and how often the connector looks. A change is never a jump.
FADE_SECONDS = 30.0
EVERY_SECONDS = 300
# Below this, a new value is not worth sending: two mireds is under a tenth of a percent of the white.
MIN_STEP_MIREK = 2.0


def kelvin_to_mirek(kelvin: float) -> float:
    return 1_000_000.0 / max(1.0, float(kelvin))


def mirek_to_kelvin(mirek: float) -> int:
    return int(round(1_000_000.0 / max(1.0, float(mirek))))


@dataclass(frozen=True)
class Day:
    """The three moments a day's curve hangs from, in the home's own zone."""

    sunrise: datetime
    sunset: datetime
    noon: datetime

    @property
    def midnight(self) -> datetime:
        return self.noon - timedelta(hours=12)


def day_from_sun(day: _date, lat: float, lng: float, tz: tzinfo) -> Day:
    """One day's sun. Where the sun does not rise or set at all, noon still exists and stands in for both:
    the curve then swings between a long night and a long day around it rather than giving up."""
    noon = solar_noon(day, float(lng), tz)
    rise, sset = sun_times(day, float(lat), float(lng), tz)
    if rise is None or sset is None:
        rise, sset = noon - timedelta(hours=6), noon + timedelta(hours=6)
    return Day(sunrise=rise, sunset=sset, noon=noon)


def day_of_home(lat: float, lng: float, tz: tzinfo) -> Callable[[_date], Day]:
    """A `date -> Day` for one home, so the curve can be asked about any day without repeating the location."""
    return lambda d: day_from_sun(d, lat, lng, tz)


def anchors_for(day: Day) -> List[Tuple[datetime, float]]:
    """One day's anchors as (when, mireds), in the order the table gives them."""
    base = {"midnight": day.midnight, "sunrise": day.sunrise, "noon": day.noon, "sunset": day.sunset}
    return [(base[moment] + timedelta(minutes=offset), kelvin_to_mirek(kelvin)) for moment, offset, kelvin in ANCHORS]


def curve_points(now: datetime, day_of: Callable[[_date], Day]) -> List[Tuple[datetime, float]]:
    """Every anchor from yesterday, today and tomorrow, in time order: the day before and after are what make
    3am and the hour after dusk fall between two anchors like any other moment."""
    pts: List[Tuple[datetime, float]] = []
    for delta in (-1, 0, 1):
        pts.extend(anchors_for(day_of(now.date() + timedelta(days=delta))))
    pts.sort(key=lambda p: p[0])
    # A far northern summer can push two anchors onto the same minute (dusk running into solar midnight);
    # the first one wins, so the series is always increasing in time.
    out: List[Tuple[datetime, float]] = []
    for when, mirek in pts:
        if out and (when - out[-1][0]).total_seconds() < 60:
            continue
        out.append((when, mirek))
    return out


def mirek_at(now: datetime, day_of: Callable[[_date], Day]) -> float:
    """The white right now, in mireds, interpolated between the two anchors it sits between."""
    pts = curve_points(now, day_of)
    if now <= pts[0][0]:
        return pts[0][1]
    if now >= pts[-1][0]:
        return pts[-1][1]
    for i in range(1, len(pts)):
        t1, m1 = pts[i]
        if now <= t1:
            t0, m0 = pts[i - 1]
            span = (t1 - t0).total_seconds()
            frac = 0.0 if span <= 0 else (now - t0).total_seconds() / span
            return m0 + (m1 - m0) * frac
    return pts[-1][1]


def kelvin_at(now: datetime, day_of: Callable[[_date], Day]) -> int:
    """The white right now, in kelvin, before any lamp's own limits."""
    return mirek_to_kelvin(mirek_at(now, day_of))


def clamp_mirek(mirek: float, mirek_min: Optional[float] = None, mirek_max: Optional[float] = None) -> float:
    """Into what the lamp can actually show. A lamp that reports its range the other way round is still honoured."""
    lo, hi = mirek_min, mirek_max
    if lo is not None and hi is not None and lo > hi:
        lo, hi = hi, lo
    if lo is not None:
        mirek = max(float(lo), mirek)
    if hi is not None:
        mirek = min(float(hi), mirek)
    return mirek


def lamp_mirek(now: datetime, day_of: Callable[[_date], Day], mirek_min: Optional[float] = None,
               mirek_max: Optional[float] = None) -> float:
    return clamp_mirek(mirek_at(now, day_of), mirek_min, mirek_max)


def lamp_kelvin(now: datetime, day_of: Callable[[_date], Day], mirek_min: Optional[float] = None,
                mirek_max: Optional[float] = None) -> int:
    """What to send this lamp right now: the curve, clamped to the lamp's own range, in kelvin."""
    return mirek_to_kelvin(lamp_mirek(now, day_of, mirek_min, mirek_max))


def worth_sending(previous_mirek: Optional[float], mirek: float) -> bool:
    """A change smaller than a couple of mireds is invisible; not sending it keeps the bridge quiet."""
    return previous_mirek is None or abs(previous_mirek - mirek) >= MIN_STEP_MIREK


def shape(day: Day, steps: int = 48) -> List[Tuple[datetime, float]]:
    """The day's shape as (when, kelvin), evenly spaced from one solar midnight to the next. For drawing."""
    start = day.midnight
    end = start + timedelta(hours=24)
    day_of = _fixed_day_of(day)
    out = []
    for i in range(steps + 1):
        when = start + (end - start) * (i / steps)
        out.append((when, mirek_to_kelvin(mirek_at(when, day_of))))
    return out


def _fixed_day_of(day: Day) -> Callable[[_date], Day]:
    """The same sun for every date: good enough for drawing one day, where the neighbours differ by a minute."""

    def of(d: _date) -> Day:
        shift = timedelta(days=(d - day.noon.date()).days)
        return Day(sunrise=day.sunrise + shift, sunset=day.sunset + shift, noon=day.noon + shift)

    return of
