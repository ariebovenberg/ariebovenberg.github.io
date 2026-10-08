---
layout: post
title:  "Why Pendulum had to write the most cursed `+` operator in all of Python"
date:   2026-10-06
tags: [python, datetime]
---

[Pendulum](https://pypi.org/project/pendulum/) is a popular Python library for working with datetimes.
Its `+` operator is unusual, even for a datetime library:
when you add a `timedelta` to a Pendulum `DateTime`,
it consults the *call stack* to decide which answer to give you.
What? And why?
The hack itself is on its way out,
but the design behind it still has impact on your code.

Here's the [`__add__` method](https://github.com/python-pendulum/pendulum/blob/aea611d7a1c15ed0da56505c3f370fe4446ba733/src/pendulum/datetime.py#L1237-L1245) from Pendulum 3.2.0, the latest release at the time of writing,[^version]
which overrides the standard library's `datetime.__add__()`:

```python
def __add__(self, other):
    ...
    caller = traceback.extract_stack(limit=2)[0].name
    if caller == "astimezone":
        return super().__add__(other)
    return self._add_timedelta_(other)
```
{: data-title="pendulum/datetime.py"}

The answer depends on the *name of the function* that called it.
So you can change the result of `+` by renaming your own function:

```console?lang=python&prompt=>>>,...
>>> import pendulum
>>> from datetime import timedelta

>>> def astimezone(dt):
...     return dt + timedelta(hours=24)

>>> base = pendulum.datetime(2013, 3, 30, 12, tz="Europe/Paris")
>>> base + timedelta(hours=24)
DateTime(2013, 3, 31, 13, ...)  # +24 hours elapsed (DST skipped an hour)
>>> astimezone(base)
DateTime(2013, 3, 31, 12, ...)  # +24 hours on the wall clock
```

I ran into this while developing
my own datetime library, [`whenever`](https://github.com/ariebovenberg/whenever),
and comparing its behavior with Pendulum's.
Pendulum prides itself on getting DST[^dst] arithmetic right,
which means its `+` needs to be different from the standard library's.
That's what the `self._add_timedelta_(other)` branch in `__add__` does.

But then why take this branch only *some of the time*?
And this isn't cheap
either: walking the call stack makes Pendulum's `+` operator *hundreds of times slower*
than the standard library's.

It reads like a desperate hack,
only it's missing the customary `# Sorry, sorry, let me explain` comment.
Nobody ships this in such a widely used library without a reason.
So what cornered them?

## Two promises

Pendulum made its name on two promises.

1. **DST-aware arithmetic**. The standard library's `+` operates on the
   wall clock, so adding a `timedelta` across a DST transition produces
   an unexpected result: "24 hours later" turns into 23 or 25 actual
   hours away. Pendulum's `+` counts elapsed time instead.
   That's in line with the model that's becoming standard in other languages,[^modern]
   and it's a good reason to use Pendulum.

2. **Drop-in compatibility**. Pendulum's `DateTime` subclasses
   `datetime`, its `Duration` subclasses `timedelta`, and its `Timezone` subclasses
   `ZoneInfo`. Your existing code, and that of every library you use,
   accepts these Pendulum subclasses without changes.
   This feature makes it easy to adopt Pendulum.

There's a conflict between these two promises though.
A "drop-in replacement" promises that you can substitute a Pendulum value
for a standard library value, and get the same behavior.
But DST-aware arithmetic promises the opposite:
an improved `+`, which *is* different behavior.[^liskov]

This conflict shows up wherever code depends on the standard library's `+`
operator, counter-intuitive as it may behave.[^semantics]
The first place this breaks is time zone conversion.
To convert a `datetime`, the standard library's own machinery
does arithmetic on your value as an intermediate step:

```text
dt.astimezone(paris)         # your code
-> DateTime.astimezone()     # Pendulum (Python)
  -> datetime.astimezone()   # standard library (C)
    -> ZoneInfo.fromutc()    # standard library (C): computes dt + offset
      -> DateTime.__add__()  # Pendulum: which + did you mean?
```

`ZoneInfo.fromutc()` calls `+` expecting wall-clock semantics.
But Pendulum's overloaded `+` applies its DST-aware arithmetic,
leading to a value that's an hour off around DST transitions.

Pendulum is stuck between a rock and a hard place:
it can't change the conversion logic
(that belongs to the standard library),
and it can't remove the `+` overload
(that would break its promise of DST-aware arithmetic).

Its answer: *guess, at runtime*,
which behavior the caller expects.

That explains the call-stack check in `__add__`:
if the caller is a function named `astimezone()`,
Pendulum assumes you must be converting through the standard library,
and applies the standard library's arithmetic
(`super().__add__(other)`).

## Who else is calling?

The trouble with guessing who's calling is that you can't
anticipate every caller.
Pendulum's hard-coded check is fragile: it covers only one name,
and relies on a precise call stack out of Pendulum's control.
Any *other* code that expects the standard library's arithmetic gets Pendulum's instead.
Converting to a `dateutil` time zone, for example, goes through a different call stack,
returning a the result that's silently naive, and off by the UTC offset
([#820](https://github.com/python-pendulum/pendulum/issues/820)):

```console?lang=python&prompt=>>>,...
>>> from dateutil import tz
>>> d = pendulum.datetime(2024, 7, 1, 12, tz="UTC")
>>> d.astimezone(tz.gettz("Europe/Paris"))
DateTime(2024, 7, 1, 12, 0, 0)     # naive — and not 14:00
```

On PyPy, even Pendulum's *own* conversions go through a different call stack,
and take the wrong branch:
`in_tz("Europe/Paris")` turns 01:30 UTC on 31 March 2024 into 04:30,
which is an hour off.

And guessing isn't free. To learn the caller's name,
`traceback.extract_stack()` summarizes each frame: it asks the operating
system whether the source file has changed (`stat()`), and reads the
line of source.
Altogether, `+` ends up about *600 times* slower:[^timing]

```console?lang=python&prompt=>>>,...
>>> from datetime import datetime
>>> from zoneinfo import ZoneInfo
>>> from timeit import timeit
>>> hour = timedelta(hours=1)
>>> std = datetime(2024, 1, 1, tzinfo=ZoneInfo("Europe/Paris"))
>>> pdl = pendulum.datetime(2024, 1, 1, tz="Europe/Paris")
>>> timeit("std + hour", globals=globals(), number=100_000)
0.0069  # seconds
>>> timeit("pdl + hour", globals=globals(), number=100_000)
4.36    # seconds
```

## Guess what?

Pendulum guesses in other places too, if less dramatically:
when information is missing, it fills the gap with an assumption.

- No time zone? `parse()` and `instance()` assume UTC.
- A time without a date? `parse("12:00")` takes today's date on your machine.
- A wall time that DST skips? Pendulum reads `fold` the opposite
  way from the standard library.
- And `+`? As described above: it depends who's asking.

Each guess may look reasonable on its own. But this guessing has four problems.

1. A guess can turn an honestly incomplete value into a *confidently incorrect* one.
A timestamp without a time zone might originate from a server in UTC,
or from a user in Tokyo.
By turning "unknown" into "UTC", Pendulum obscures the distinction
and downstream code can't tell the difference.

2. A guess makes your results depend on things your code doesn't mention: the
current time, the machine's time zone, the name of a function.
`parse()` becomes an impure function: the result of passing `12:00`
depends on when and where it runs.

3. A guess can be extended, but can never cover all use cases.
There's always another caller, another input, another time zone that wasn't anticipated.

4. A guess can't be taken back. Every program using Pendulum depends on it
   guessing the exact way it does. Taking out the guesswork would also silently
   change what existing programs compute.

   Well, with one exception: the guess in `+`.

## Did Pendulum *have* to?

So, did Pendulum *have* to write this `+` operator?
The `fromutc()` conflict certainly required a workaround,
but walking the call stack isn't the only option.

The cleanest workaround removes the guess altogether:
`astimezone()` can pass the standard library a plain `datetime`,
and wrap the result again afterwards.

```python
def astimezone(self, tz=None):
    plain = datetime(self.year, ..., tzinfo=self.tzinfo, fold=self.fold)
    dt = plain.astimezone(tz)  # only rurns the stdlib's `+`
    return self.__class__(dt.year, ..., tzinfo=dt.tzinfo, fold=dt.fold)
```

I proposed this as [a pull request](https://github.com/python-pendulum/pendulum/pull/1032),
which Pendulum has merged; it should be in the next release.

With that, `__add__` has nothing left to guess,
and the bugs above disappear.
Interestingly, Pendulum's own `add()` method already works this way.
And `+` gets five times faster: from about 600 to about 120 times slower than the
standard library's.
The remaining slowdown is simply the cost of Pendulum's arithmetic itself,
which is written in pure Python.

So yes, Pendulum was cornered. Unfortunately,
it picked a rather expensive way out.[^cheap]

None of this fixes the underlying problem, though.
There's no workaround that can reach all the code Pendulum *doesn't* control.
Anywhere you pass Pendulum's `DateTime` where `datetime` is expected,
now gets Pendulum's `+` behavior---whether it expects it or not.
A minimal example:

```console?lang=python&prompt=>>>,...
>>> d = pendulum.datetime(2024, 7, 1, 12, tz="UTC")
>>> datetime.astimezone(d, ZoneInfo("Europe/Paris"))
DateTime(2024, 7, 1, 12, 0, 0)     # naive — and not 14:00
```

The only way to fix this would be for Pendulum to break one
of its two promises: drop its DST-aware arithmetic,
or stop being a drop-in subclass. [^subclasses]

## What now?

If you already use Pendulum, there's no need to panic. But watch out when you:

- convert to third-party time zones, like `dateutil`'s;
- run on PyPy;
- use `+` in a hot loop;
- parse untrusted or incomplete strings;
- pass Pendulum values where a `datetime` is expected.

The next release should fix the first two, and make `+` less slow.
The last two follow from Pendulum's design,
and can't be fixed without breaking changes.

If you're starting fresh, you
have two other paths:
1. Stick with the standard library `datetime`.
   It's fast, robust, and well-maintained.
   The cost: you'll have to live with its counter-intuitive `+`,
   and know its [other pitfalls](https://whenever.readthedocs.io/en/latest/stdlib-pitfalls/).[^others]
2. Or, adopt a library that fixes the pitfalls.
   Pendulum shows how a drop-in replacement can't.
   This is the trade-off `whenever` makes:
   it doesn't subclass `datetime`, but
   in return you get a typesafe API where naive and aware can't mix,
   and arithmetic follows the model that's becoming standard in other languages.[^modern]
   Nothing is guessed silently either.

The call-stack hack is one of five Pendulum design decisions I've dug into.
The other four are catalogued in
[the `whenever` docs](https://whenever.readthedocs.io/en/latest/why-not-pendulum.html).

Know an even more cursed operator in Python? I'd love to hear about it!

[^version]: Everything in this post was run against Pendulum 3.2.0 on
    CPython 3.14, unless stated otherwise.

[^others]: For how other libraries, Arrow among them, deal with these
    pitfalls, see [my earlier post]({% post_url 2024-01-20-python-datetime-pitfalls %}).

[^dst]: Daylight saving time: in many time zones, the clocks move forward
    an hour in spring and back an hour in autumn. On those days, some wall
    times are skipped or repeated, making the day 23 or 25 hours long.

[^timing]: This has not gone unnoticed: [#818](https://github.com/python-pendulum/pendulum/issues/818).
    The exact slowdown depends on the platform, mostly because of the `stat()`
    calls. Is 40 microseconds a lot? Additions rarely come alone: think of
    calendars, recurring events, or bucketing log rows. A thousand of them
    take about 40 milliseconds, as long as an HTTP request. And because the
    cost is spread thinly, it won't show up as a hotspot in your profiler.

[^semantics]: Which kind of arithmetic is "correct" is a debate of its own.
    Elapsed time is the norm in modern datetime libraries, but wall-clock
    arithmetic can be useful too in some contexts.

[^v3]: That was in version 3.0, released in December 2023, before the
    project's current maintainers took over in 2025. Before 3.0, Pendulum shipped
    its own time zone implementation, avoiding the issue.

[^cheap]: Interestingly, even if the call stack was required, the guess
    could be made cheaper using `sys._getframe(1).f_code.co_name`,
    which reads the caller's name without `traceback`'s additional overhead.

[^modern]: It's built into Java, ([`java.time`](https://docs.oracle.com/javase/8/docs/api/java/time/package-summary.html)),
    and into JavaScript ([Temporal](https://tc39.es/proposal-temporal/docs/),
    since ECMAScript 2026). In Rust, [Jiff](https://github.com/BurntSushi/jiff)
    is quickly gaining adoption, and in C#, [NodaTime](https://nodatime.org/)
    is the  alternative to its standard library.

[^subclasses]: `DateTime` isn't the only subclass
    where the drop-in promise conflicts with changed behavior:
    Pendulum's `Duration` breaks `timedelta`'s promise
    about `.seconds` staying between 0 and 86,399,
    and its `Timezone` subclass misses out on `ZoneInfo`'s
    cache, making time zone lookup much slower.

[^liskov]: This is the [Liskov substitution
    principle](https://en.wikipedia.org/wiki/Liskov_substitution_principle).
