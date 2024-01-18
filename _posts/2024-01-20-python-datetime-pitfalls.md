---
layout: post
title:  "Ten Python datetime pitfalls, and what libraries are (not) doing about it"
date:   2024-01-20
---

It's no secret that the Python datetime library has its quirks.
Not only are there probably more than you think;
third-party libraries don't address most of them!
I created a [new library](https://github.com/ariebovenberg/whenever) to explore what a better datetime library could look like.

Two notes before we start:

- Pitfalls aren't bugs. They're cases where `datetime` behaves in a way
  that is surprising or confusing. It's always a bit
  subjective whether something is a pitfall or not.
- Many pitfalls exist simply because the authors couldn't
  possibly anticipate all future needs.
  Adding big features over 20 years—without breaking compatibility—isn't easy.

With that out of the way, these are the third-party datetime
libraries I'm looking at in this post:

- [`arrow`](https://github.com/arrow-py/arrow) — Probably the most historically popular
  datetime library. Its goal is to make datetime easier to use,
  and to add features that many people feel are missing from the standard library.
- [`pendulum`](https://github.com/sdispater/pendulum) — The only library that
  rivals arrow in popularity. It has similar goals, while explicitly improving
  on Arrow's handling of Daylight Saving Time (DST).
- [`DateType`](https://github.com/glyph/DateType) — a library that allows
  type-checkers to distinguish between naive and aware datetimes.
  It doesn't change the runtime behavior of `datetime`.
- [`heliclockter`](https://github.com/channable/heliclockter) — a young library
  that offers datetime subclasses for UTC, local, and zoned datetimes.

And the following I'm not:

- `pytz` and `python-dateutil`, which aren't (full) datetime replacements
- `delorean`, `maya`, and `moment` which all appear abandoned

<div class="toc" markdown="1">

## Contents

**The pitfalls**

1. [Incompatible concepts are squeezed into one class](#1-incompatible-concepts-are-squeezed-into-one-class)
2. [Operations ignore Daylight Saving Time (DST)](#2-operations-ignore-daylight-saving-time-dst)
3. [The meaning of "naive" is inconsistent](#3-the-meaning-of-naive-is-inconsistent)
4. [Non-existent datetimes pass silently](#4-non-existent-datetimes-pass-silently)
5. [Guessing in the face of ambiguity](#5-guessing-in-the-face-of-ambiguity)
6. [Disambiguation breaks equality](#6-disambiguation-breaks-equality)
7. [Inconsistent equality within timezone](#7-inconsistent-equality-within-timezone)
8. [Datetime inherits from date](#8-datetime-inherits-from-date)
9. [`datetime.timezone` isn't a timezone](#9-datetimetimezone-isnt-a-timezone)
10. [The local timezone is DST-unaware](#10-the-local-timezone-is-dst-unaware)

**Takeaways**

- [Datetime library scorecard](#datetime-library-scorecard)
- [Why should you care?](#why-should-you-care)
- [Imagining a solution](#imagining-a-solution)

</div>

## 1. Incompatible concepts are squeezed into one class

It's an infamous pain point that a `datetime` instance can be either naive or aware,
and that they can't be mixed.
In any complex codebase, it's difficult to be sure you won't accidentally mix them
without actually running the code.
As a result, you end up writing redundant runtime checks,
or hoping all developers diligently read the docstrings.

```python
# 🧨 naive or aware? No way to tell...
def plan_mission(launch_utc: datetime) -> None: ...
```

#### What's being done about it?

- ✅ `heliclockter` has separate classes for local, zoned, and UTC datetimes.
- ✅ `DateType` allows type-checkers to distinguish naive or aware datetimes
- ❌ `arrow` and `pendulum` still have one class for naive and aware.

## 2. Operations ignore Daylight Saving Time (DST)

Given that `datetime` supports timezones,
you'd reasonably expect that the `+/-` operators would take
them into account—but they don't!

```python
paris = ZoneInfo("Europe/Paris")
# On the eve of moving the clock forward
bedtime = datetime(2023, 3, 25, 22, tzinfo=paris)
wake_up = datetime(2023, 3, 26, 7, tzinfo=paris)

# it says 9 hours, but it's actually 8!
sleep = wake_up - bedtime
```

#### What's being done about it?

- ✅ `pendulum` explicitly fixes this issue
- ❌ `heliclockter`, `arrow`, and `DateType` don't address it

## 3. The meaning of "naive" is inconsistent

In various parts of the standard library, "naive" datetimes are interpreted
differently. Ostensibly, "naive" means "detached from the real world",
but in the datetime library it is often implicitly treated as local time.
Confusingly, it is sometimes treated as UTC[^1], while in other places it is
treated as neither!

```python
# a naive datetime
d = datetime(2024, 1, 1)

# ⚠️ here: treated as a local time
d.timestamp()
d.astimezone(UTC)

# 🧨 here: assumed UTC
d.utctimetuple()
email.utils.format_datetime(d)
datetime.utcnow()

# 🤷 here: neither! (error)
d >= datetime.now(UTC)
```

#### What's being done about it?

- ❌ While `pendulum` and `arrow` do discourage using naive datetimes,
  they still support the same inconsistent semantics.
- ❌ `DateType` and `heliclockter` don't address this

## 4. Non-existent datetimes pass silently

When the clock in a timezone is set forward, a "gap" is created. For example,
if the clock moves forward from 2am to 3am, the time 2:30am doesn't exist
in the timezone.
The standard library doesn't warn you when you create such a non-existent time.
As soon as you operate on these objects, you run into problems.

```python
# ⚠️ This time doesn't exist on this date
d = datetime(2023, 3, 26, 2, 30, tzinfo=paris)

# 🧨 No timestamp exists, so it just makes one up
t = d.timestamp()
datetime.fromtimestamp(t) == d  # False 🤷
```

#### What's being done about it?

- ❌ `pendulum` replaces the current silent behavior with another: it
  fast-forwards to a valid time [without warning](https://github.com/sdispater/pendulum/issues/697).
- ❌ `arrow`, `DateType` and `heliclockter` don't address this issue

## 5. Guessing in the face of ambiguity

When the clock in a timezone is set backwards, an ambiguity is created.
For example, if the clock is set one hour back at 3am, the time 2:30am exists
twice: before and *after* the change.
The ``fold`` attribute [was introduced](https://peps.python.org/pep-0495/)
to resolve these ambiguities

The problem is that there is no objective default value for ``fold``:
whether you want the "earlier" or "later"
option will depend on the particular context.
For backwards compatibility, the standard library defaults to ``0``,
which has the effect of silently assuming that you want the earlier occurrence.

```python
# 🧨 Guesses your intent without warning
d = datetime(2023, 10, 29, 2, 30, tzinfo=paris)
```

#### What's being done about it?

- ❌ `pendulum` also guesses, but rather arbitrarily decides that ``1``
  is the better default[^2].
- ❌ `arrow`, `DateType` and `heliclockter` don't address the issue.

## 6. Disambiguation breaks equality

Even though `fold` was introduced to disambiguate times,
comparisons of disambiguated times between timezones *always* evaluate false due to
[backwards compatibility reasons](https://peps.python.org/pep-0495/#id12).

```python
# A properly disambiguated time...
d = datetime(2023, 10, 29, 2, 30, tzinfo=paris, fold=1)

d_utc = d.astimezone(UTC)
d_utc.timestamp() == d.timestamp()  # True: same moment in time
d_utc == d  # 🧨 but oddly: False!
```

#### What's being done about it?

- ❌ None of the libraries have addressed this issue

## 7. Inconsistent equality within timezone

In a mirror image of the previous pitfall, there is a false positive
when comparing two datetimes within the exact same `tzinfo` object.
In that case, they are compared by their "wall time".
This is mostly the same *except* when `fold` is involved...

```python
# two times one hour apart (due to DST transition)
earlier = datetime(2023, 10, 29, 2, 30, tzinfo=paris, fold=0)
later = datetime(2023, 10, 29, 2, 30, tzinfo=paris, fold=1)

earlier.timestamp() == later.timestamp()  # false, as expected
earlier == later  # 🧨 oddly: true!
```

Remember I said *exact same* `tzinfo` object? If you
compare with the same timezone, but from `dateutil.tz`, you'll get
a different result!

```python
from dateutil import tz
later2 = later.replace(tzinfo=tz.gettz("Europe/Paris"))
earlier == later2  # now false
```

#### What's being done about it?

- ❌ No library has addressed this issue

## 8. Datetime inherits from date

You may be surprised to know that `datetime` is a subclass of `date`.
This doesn't seem problematic at first, but it leads to odd behavior.
Most notably, the fact that `date` and `datetime` cannot be compared
violates [basic assumptions](https://en.wikipedia.org/wiki/Liskov_substitution_principle)
of how subclasses should work.
The `datetime/date` inheritance is now
[widely considered](https://discuss.python.org/t/renaming-datetime-datetime-to-datetime-datetime/26279/2)
to be a [design flaw](https://github.com/python/typeshed/issues/4802)
in the standard library.

```python
# 🧨 Breaks when you pass in a datetime, even though it's a subclass
def is_future(dt: date) -> bool:
    return dt > date.today()

# 🧨 Some methods inherited from `date` don't make sense
datetime.today()
```

#### What's being done about it?

- ✅ `DateType` was explicitly developed to fix this inheritance relationship
  at type-checking time.
- ❌ `arrow`, `pendulum`, and `heliclockter` don't address the issue.
  Their datetime classes all inherit from `datetime` (and thus also `date`).

## 9. `datetime.timezone` isn't a timezone

OK—so this is maybe something you learn once and then never forget.
But it's still confusing that `datetime.timezone` is only for fixed offsets,
and you need `ZoneInfo` to express full timezones with DST transitions.
For beginners that don't know the difference, this is an unfortunate trap.

```python
from datetime import timezone, datetime, timedelta
from zoneinfo import ZoneInfo

# 🧨 Wrong: it's a fixed offset only valid in winter!
paris_timezone = timezone(timedelta(hours=1), "CET")

# ✅ This is what you want
paris_timezone = ZoneInfo("Europe/Paris")
```

- ✅ Both `arrow` and `pendulum` side-step this issue by specifying
  timezones as strings instead of requiring special class instance.
- ❌ `heliclockter` and `DateType` don't address this issue

## 10. The local timezone is DST-unaware

Calling `astimezone()` without arguments gives you the time in the local system
timezone. However, it returns it as a fixed offset (`datetime.timezone`) instead of a
full timezone (`ZoneInfo`) that knows about DST transitions.
In Paris, for example, `astimezone()` returns a fixed offset of UTC+1
or UTC+2 (depending on whether it's winter or summer) instead
of the full `Europe/Paris` timezone.

```python
# you think you've got the local timezone
my_tz = datetime(2023, 1, 1).astimezone().tzinfo
# but you actually only have the wintertime variant
print(my_tz)  # timezone(offset=timedelta(hours=1), "CET")
datetime(2023, 7, 1, tzinfo=my_tz)  # 🧨 not valid for summer!
```

#### What's being done about it?

- ✅ `pendulum` and `arrow` have methods to convert to the full local timezone.
- ❌ `heliclockter` has a local datetime type with the same issue
- ❌ `DateType` doesn't address this issue


## Datetime library scorecard

Below is a summary of how the libraries address the pitfalls (✅) or not (❌).

| Pitfall                     | Arrow | Pendulum | DateType | Heliclockter |
|-----------------------------|-------|----------|----------|--------------|
| aware/naive mixed class     | ❌     | ❌        | ✅        | ✅            |
| Operators ignore DST        | ❌     | ✅        | ❌        | ❌            |
| Unclear "naive" semantics   | ❌     | ❌        | ❌        | ❌            |
| Silent non-existence        | ❌     | ❌        | ❌        | ❌            |
| Guesses on ambiguity        | ❌     | ❌        | ❌        | ❌            |
| Disambiguation breaks equality | ❌     | ❌        | ❌        | ❌            |
| Inconsistent equality within zone | ❌     | ❌        | ❌        | ❌            |
| datetime inherits from date | ❌     | ❌        | ✅        | ❌            |
| `timezone` isn't a timezone | ✅     | ✅        | ❌        | ❌            |
| DST-unaware local timezone  | ✅     | ✅        | ❌        | ❌            |

## Why should you care?

The pitfalls roughly fall in two categories: *confusing design* and *surprising edge cases*.
Here is why you should care about both.

### Confusing design

Confusing design is the larger problem,
because it makes the library harder to use correctly.
Since human error will always be the biggest source of bugs,
a library's primary concern should be to minimize the chance of mistakes.
Looking at other languages, it's clear that better designs are possible.
Java, C#, and Rust all have distinct classes for naive and aware datetimes (and more).
We can also see that redesigns are worth the high cost:
Java [adopted Joda-Time](https://jcp.org/en/jsr/detail?id=310), 
and JavaScript is [modernizing as well](https://tc39.es/proposal-temporal/docs/).
Will Python's datetime be left behind?

### Surprising edge cases

Because these pitfalls are rare, you may think they're not worth worrying about.
After all, DST transitions only represent about 0.02% of the year.
While this sentiment is understandable, I'd argue that the opposite is true:

- Getting timezones right is one of the main *reasons for existence* of
  a datetime library. If it can't do that reliably, what's the point?
- Rare cases are the most dangerous: they are the ones you're least likely to test,
  and allow bad actors to trip up your code.
- Rare is still too common for such a fundamental concept as time.
  Would you run your business on `numpy` if it had a
  0.02% chance of returning the wrong result?
  Would you accept a language in which 1 in 4000 booleans would arbitrarily be flipped?
  There is no reason why these pitfalls shouldn't be corrected.

## Imagining a solution

Inspired by these findings, I created a
[new library](https://github.com/ariebovenberg/whenever) to explore
what a better datetime library could look like.
Here is how it addresses the pitfalls:

1. It has distinct classes for the most common use cases:

   ```python
   from whenever import (
       # For the "UTC everywhere" case
       UTCDateTime,
       # Simple localization sans DST
       OffsetDateTime,
       # Full-featured IANA timezones
       ZonedDateTime,
       # In the local system timezone
       LocalDateTime,
       # Detached from any timezone info
       NaiveDateTime,
   )
   ```
2. Addition and subtraction take DST into account.
3. Naive is always naive. UTC and local time have their own separate classes.
4. Creating non-existent datetimes raises an exception.
5. Ambiguous datetimes must be explicitly disambiguated.

   ```python
   ZonedDateTime(
       2023, 1, 1, tz="Europe/Paris", 
   )  # ok: not ambiguous
   ZonedDateTime(
       2023, 10, 29, 2, tz="Europe/Paris", 
   )  # ERROR: ambiguous!
   ZonedDateTime(
       2023, 10, 29, 2, tz="Europe/Paris", 
       disambiguate="later"
   )  # that's better!
   ```
6. Disambiguated datetimes work correctly in comparisons.
7. Aware datetimes are equal if they occur at the same moment.

   ```python
   a == b  # always equivalent to a.as_utc() == b.as_utc()
   ```
8. The datetime classes doesn't inherit from date.
9. IANA timezones are used everywhere, no separate timezone class needed.
10. Local datetimes handle DST transitions correctly.

Feedback is welcome! ⭐️


[^1]: In the standard library, methods like `utcnow()` are slowly being deprecated,
      but many UTC-assuming parts remain.

[^2]: Interestingly, pendulum used to have an explicit `dst_rule` parameter that
      was silently [removed in 3.0](https://github.com/sdispater/pendulum/issues/789)
