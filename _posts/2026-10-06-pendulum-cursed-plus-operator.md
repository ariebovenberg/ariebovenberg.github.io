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
but the design behind it still matters for your code.

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
minus the customary `# Sorry, sorry, let me explain` comment.
Nobody ships this in such a widely used library without a reason.
So what cornered them?

## Two promises

Pendulum made its name on two promises.

1. **DST-aware arithmetic**. The standard library's `+` operates on the
   wall clock, so adding a `timedelta` across a DST transition produces
   an unexpected result: "24 hours later" becomes 23 or 25 actual hours away.
   Pendulum's `+` counts elapsed time instead.
   That's in line with the model that's becoming standard in other languages,[^modern]
   and a good reason to use Pendulum.

2. **Drop-in compatibility**. Pendulum's `DateTime` subclasses
   `datetime`, its `Duration` subclasses `timedelta`, and its `Timezone` subclasses
   `ZoneInfo`. Your existing code, and every library you use, accepts Pendulum
   values without changes. This makes adopting Pendulum easy.

There's a conflict between these two promises though.
A "drop-in replacement" promises that you can substitute a Pendulum value for a standard library value,
and get the same behavior.
But DST-aware arithmetic promises the opposite:
an improved `+`, which *is* different behavior.[^liskov]

This conflict shows up wherever code depends on the standard library's `+`,
counter-intuitive as it may behave.[^semantics]
The first place this breaks is time zone conversion. To convert a `datetime`,
the standard library's own machinery does arithmetic on your value as an
intermediate step:

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
it can't remove the `+` overload
(that would break its promise of DST-aware arithmetic),
and it can't stop being a subclass
(that would break its promise of drop-in compatibility).

Its answer: *guess, at runtime*,
which semantics the caller expects.

That explains the call-stack check in `__add__`:
if the caller is a function named `astimezone()`,
Pendulum assumes you must be converting through the standard library,
and applies the standard library's arithmetic.

## Who else is calling?

The trouble with guessing who's calling is that you can't anticipate every caller.
Pendulum's hard-coded check is fragile: it covers only one name,
and relies on an exact call stack that Pendulum doesn't control.[^stack]
Any *other* code that expects the standard library's arithmetic gets Pendulum's instead.
Converting to a `dateutil` time zone, for example, goes through a different call stack,
and the result is silently naive, and off by the UTC offset
([#820](https://github.com/python-pendulum/pendulum/issues/820)):

```console?lang=python&prompt=>>>,...
>>> from dateutil import tz
>>> d = pendulum.datetime(2024, 7, 1, 12, tz="UTC")
>>> d.astimezone(tz.gettz("Europe/Paris"))
DateTime(2024, 7, 1, 12, 0, 0)     # naive — and not 14:00
```

On PyPy, even Pendulum's *own* conversions go through a different call stack,
and take the wrong branch:
`in_tz("Europe/Paris")` turns 01:30 UTC on 31 March 2024 into 04:30, an hour off.

And guessing isn't free. To learn the caller's name,
`traceback.extract_stack()` summarizes each frame: it asks the operating
system whether the source file has changed (a `stat()` call), and reads the
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
wherever information is missing, it fills the gap with an assumption.

- No time zone? `parse()` and `instance()` assume UTC.
- A time without a date? `parse("12:00")` takes today's date on your machine.
- A wall time that DST skips? Pendulum reads `fold` the opposite
  way from the standard library, so converting a value can move it by an hour.
- And `+`? As you've seen: it depends who's asking.

Each guess may look reasonable on its own. But guessing itself has four problems.

1. A guess can turn an honestly incomplete value into a *confidently wrong* one. A timestamp
without a time zone might come from a server in UTC, or from a user in Tokyo.
Pendulum turns "unknown" into "UTC", and nothing downstream can tell the
difference.

2. A guess can make your results depend on things your code doesn't mention: the
current time, the machine's time zone, the name of a function. `parse("12:00")` gives
a different date depending on when and where it runs.

3. A guess can be extended, but never completed. There's always another caller,
another input, another time zone that wasn't anticipated.

4. And a guess can't be taken back. Every program using Pendulum depends on it
guessing exactly the way it does, so reversing any of it would silently change
what those programs compute.

Well, with one exception: the guess in `+`.

## Did Pendulum *have* to?

So, did Pendulum *have* to write this `+` operator?
It had to write *something*.
Once its `Timezone` became a `ZoneInfo` subclass,[^v3] the clash inside `fromutc()`
needed a workaround. But walking the call stack wasn't the only option.

The cleanest workaround removes the guess altogether:
`astimezone()` can pass the standard library a plain `datetime`,
and wrap the result again on the way out.

```python
def astimezone(self, tz=None):
    plain = datetime(self.year, ..., tzinfo=self.tzinfo, fold=self.fold)
    dt = plain.astimezone(tz)  # only the standard library's + runs in here
    return self.__class__(dt.year, ..., tzinfo=dt.tzinfo, fold=dt.fold)
```

I proposed this as [a pull request](https://github.com/python-pendulum/pendulum/pull/1032),
which Pendulum has merged; it should be in the next release.

With that, `__add__` has nothing left to guess,
and the bugs above disappear.
Interestingly, Pendulum's own `add()` method already works this way.
And `+` gets five times faster: from about 600 to about 120 times slower than the
standard library's. What's left is the cost of Pendulum's arithmetic itself,
written in pure Python.

So yes, Pendulum was cornered. Unfortunately, it picked the most expensive way out.[^cheap]

None of this fixes the underlying problem, though.
No workaround reaches the code Pendulum *doesn't* control.
Anything that's handed a Pendulum `DateTime` as a `datetime`, and does
arithmetic on it, gets Pendulum's `+`---whether it expects to or not.
You don't even need a third-party library to see it.
The standard library's own `astimezone()`, called directly, is enough:

```console?lang=python&prompt=>>>,...
>>> d = pendulum.datetime(2024, 7, 1, 12, tz="UTC")
>>> datetime.astimezone(d, ZoneInfo("Europe/Paris"))
DateTime(2024, 7, 1, 12, 0, 0)     # naive — and not 14:00
```

This is wrong whichever workaround you pick.
Fixing it would take something Pendulum can't do: stop being a subclass.[^subclasses]

## What now?

If you already use Pendulum, there's no need to panic. But watch out when you:

- convert to third-party time zones, like `dateutil`'s;
- run on PyPy;
- use `+` in a hot loop;
- parse untrusted or incomplete strings;
- pass Pendulum values where a `datetime` is expected.

The next release should fix the first two, and make `+` less slow.
The rest follow from Pendulum's design, so they're here to stay.

If you're starting fresh, the question is whether to build on `datetime` at all.
The standard library itself is...actually OK, so long as you know
[its pitfalls](https://whenever.readthedocs.io/en/latest/stdlib-pitfalls/).[^others]
If you'd rather have a library that fixes them, Pendulum shows it can't also be
a drop-in replacement. That's the trade-off I made in `whenever`:
its types don't subclass `datetime`. In return, you decide what each value in
your program actually is, and the types hold you to it: naive and aware can't mix.
Arithmetic follows the model that's becoming standard in other languages.[^modern]
And nothing is guessed silently.

The call-stack hack is one of five Pendulum design decisions I've dug into.
The other four, and a few dozen ordinary bugs, are catalogued in
[the `whenever` docs](https://whenever.readthedocs.io/en/latest/why-not-pendulum.html).

Know an even more cursed operator in Python? I'd love to hear about it!

[^version]: Everything in this post was run against Pendulum 3.2.0 on
    CPython 3.14, unless stated otherwise.

[^dst]: Daylight saving time: in many time zones, the clocks move forward
    an hour in spring and back an hour in autumn. On those days, some wall
    times are skipped or happen twice, and a day can be 23 or 25 hours long.

[^timing]: This has not gone unnoticed: [#818](https://github.com/python-pendulum/pendulum/issues/818).
    The exact slowdown depends on the platform, mostly because of the `stat()`
    calls. Is 40 microseconds a lot? Additions rarely come alone: think of
    calendars, recurring events, or bucketing log rows. A thousand of them
    take about 40 milliseconds, as long as an HTTP request. And because the
    cost is spread thinly, it won't show up as a hotspot in your profiler.

[^semantics]: Which kind of arithmetic is "right" is a debate of its own.
    Elapsed time is the norm in modern datetime libraries, but wall-clock
    arithmetic has its uses: "same time tomorrow" is a wall-clock question.
    The trouble starts when one type tries to be both.

[^v3]: That was in version 3.0, released in December 2023, before the
    project's current maintainers took over in 2025. Before 3.0, Pendulum shipped
    its own time zone implementation, whose `fromutc()` never called `+`.

[^stack]: Why `astimezone()`? The standard library's part of the conversion is
    written in C, which leaves no frames on the Python stack. So the nearest
    caller Pendulum can see is its own `astimezone()`. On PyPy, the standard
    library is written in Python, so the caller is named `fromutc()` instead.

[^others]: For how other libraries, Arrow among them, deal with these
    pitfalls, see [my earlier post]({% post_url 2024-01-20-python-datetime-pitfalls %}).

[^cheap]: Even keeping the guess, it could have been nearly free:
    `sys._getframe(1).f_code.co_name` reads the caller's name without frame
    summaries or source code, and brings `+` down to the same 120 times.

[^modern]: It's built into Java, as [`java.time`](https://docs.oracle.com/javase/8/docs/api/java/time/package-summary.html),
    and into JavaScript, as [Temporal](https://tc39.es/proposal-temporal/docs/)
    (since ECMAScript 2026). In Rust, [Jiff](https://github.com/BurntSushi/jiff)
    is quickly gaining adoption, and in C#, [NodaTime](https://nodatime.org/)
    is the well-established alternative to the built-in types.

[^subclasses]: `DateTime` isn't the only subclass that pays for being drop-in.
    Pendulum's `Duration` breaks `timedelta`'s promise that `.seconds` is
    between 0 and 86,399: `duration(seconds=-1).seconds` is `-1`.
    It also carries months, which code expecting a `timedelta` sees as 30 days:
    January 31st plus `duration(months=1)` is February 29th with a Pendulum
    `DateTime`, but March 1st with a standard library `datetime`.
    And its `Timezone` subclasses `ZoneInfo` but misses out on `ZoneInfo`'s
    cache, so looking up a time zone by name can be hundreds of times slower.
    The `whenever` docs have [the details](https://whenever.readthedocs.io/en/latest/why-not-pendulum.html#pendulum-durations).

[^liskov]: Computer scientists call this the [Liskov substitution
    principle](https://en.wikipedia.org/wiki/Liskov_substitution_principle).
