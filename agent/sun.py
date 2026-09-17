"""Sunrise, sunset and solar noon for a date and location, NOAA's algorithm. No network, no dependencies.

    sunrise, sunset = sun_times(date, lat, lng, tz)   # timezone-aware datetimes, or (None, None) in polar cases
    noon = solar_noon(date, lng, tz)                  # always a time: the sun is highest even when it never rises
"""
from __future__ import annotations

import math
from datetime import date, datetime, timedelta, timezone, tzinfo
from typing import Optional, Tuple


def _julian_day(d: date) -> float:
    y, m, day = d.year, d.month, d.day
    if m <= 2:
        y -= 1
        m += 12
    a = y // 100
    b = 2 - a + a // 4
    return int(365.25 * (y + 4716)) + int(30.6001 * (m + 1)) + day + b - 1524.5


def _solar_params(d: date) -> Tuple[float, float]:
    """Declination (degrees) and the equation of time (minutes) for the given date."""
    jd = _julian_day(d)
    t = (jd - 2451545.0) / 36525.0
    # geometric mean longitude and anomaly of the sun (degrees)
    l0 = (280.46646 + t * (36000.76983 + 0.0003032 * t)) % 360
    m = 357.52911 + t * (35999.05029 - 0.0001537 * t)
    mr = math.radians(m)
    c = (1.914602 - t * (0.004817 + 0.000014 * t)) * math.sin(mr) + (0.019993 - 0.000101 * t) * math.sin(2 * mr) + 0.000289 * math.sin(3 * mr)
    true_long = l0 + c
    omega = 125.04 - 1934.136 * t
    app_long = true_long - 0.00569 - 0.00478 * math.sin(math.radians(omega))
    e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
    eps0 = 23 + (26 + ((21.448 - t * (46.815 + t * (0.00059 - t * 0.001813)))) / 60) / 60
    eps = eps0 + 0.00256 * math.cos(math.radians(omega))
    decl = math.degrees(math.asin(math.sin(math.radians(eps)) * math.sin(math.radians(app_long))))
    y = math.tan(math.radians(eps / 2)) ** 2
    l0r, mr = math.radians(l0), math.radians(m)
    eq_time = 4 * math.degrees(y * math.sin(2 * l0r) - 2 * e * math.sin(mr) + 4 * e * y * math.sin(mr) * math.cos(2 * l0r) - 0.5 * y * y * math.sin(4 * l0r) - 1.25 * e * e * math.sin(2 * mr))
    return decl, eq_time


def _sun_event_utc_minutes(d: date, lat: float, lng: float, rising: bool) -> Optional[float]:
    decl, eq_time = _solar_params(d)
    latr, declr = math.radians(lat), math.radians(decl)
    cos_ha = (math.cos(math.radians(90.833)) / (math.cos(latr) * math.cos(declr))) - math.tan(latr) * math.tan(declr)
    if cos_ha < -1 or cos_ha > 1:
        return None  # sun never rises or never sets today
    ha = math.degrees(math.acos(cos_ha))
    if not rising:
        ha = -ha
    return 720 - 4 * (lng + ha) - eq_time  # minutes after UTC midnight


def sun_times(d: date, lat: float, lng: float, tz: tzinfo) -> Tuple[Optional[datetime], Optional[datetime]]:
    out = []
    for rising in (True, False):
        mins = _sun_event_utc_minutes(d, lat, lng, rising)
        if mins is None:
            out.append(None)
            continue
        utc = datetime(d.year, d.month, d.day, tzinfo=timezone.utc) + timedelta(minutes=mins)
        out.append(utc.astimezone(tz))
    return out[0], out[1]


def solar_noon(d: date, lng: float, tz: tzinfo) -> datetime:
    """When the sun is highest on that date, in the given zone. Defined everywhere, polar day and night included."""
    _, eq_time = _solar_params(d)
    mins = 720 - 4 * lng - eq_time  # minutes after UTC midnight
    utc = datetime(d.year, d.month, d.day, tzinfo=timezone.utc) + timedelta(minutes=mins)
    return utc.astimezone(tz)
