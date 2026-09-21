---
layout: post
title:  "Ten Python datetime pitfalls, and what libraries are (not) doing about it"
date:   2024-01-20
---

*Update (September 2026): this post is from early 2024, and a lot has happened since.
For the current state of things, see
[the pitfalls of `datetime`](https://whenever.readthedocs.io/en/latest/stdlib-pitfalls/index.html) in whenever's documentation,
which I keep up to date—along with detailed comparisons with
[Arrow](https://whenever.readthedocs.io/en/latest/why-not-arrow.html) and [Pendulum](https://whenever.readthedocs.io/en/latest/why-not-pendulum.html).
This post stays up as a historical reference. I've only corrected what has
become plain wrong (see the [changelog](#changelog)).*

It's no secret that the Python datetime library has its quirks.
Not only are there probably more than you think;
third-party libraries don't address most of them!
I created a [new library](https://github.com/ariebovenberg/whenever) to explore what a better datetime library could look like.

💬 Discuss this post [on Reddit](https://www.reddit.com/r/Python/comments/1ag6uxc/ten_python_datetime_pitfalls_and_what_libraries/)
or [Hacker News](https://news.ycombinator.com/item?id=39417231).

<div class="toc" markdown="1">

### Contents

**Before we start**

- [What's a pitfall?](#whats-a-pitfall)
- [Libraries considered](#libraries-considered)

**The pitfalls**

1. [Incompatible concepts are squeezed into one class](#1-incompatible-concepts-are-squeezed-into-one-class)
2. [Operators ignore Daylight Saving Time (DST)](#2-operators-ignore-daylight-saving-time-dst)
3. [The meaning of "naïve" is inconsistent](#3-the-meaning-of-naïve-is-inconsistent)
4. [Non-existent datetimes pass silently](#4-non-existent-datetimes-pass-silently)
5. [Guessing in the face of ambiguity](#5-guessing-in-the-face-of-ambiguity)
6. [Disambiguation breaks equality](#6-disambiguation-breaks-equality)
7. [Inconsistent equality within timezone](#7-inconsistent-equality-within-timezone)
8. [Datetime inherits from date](#8-datetime-inherits-from-date)
9. [`datetime.timezone` isn't enough for timezone support](#9-datetimetimezone-isnt-enough-for-timezone-support)
10. [The local timezone is DST-unaware](#10-the-local-timezone-is-dst-unaware)

**Takeaways**

- [Datetime library scorecard](#datetime-library-scorecard)
- [Why should you care?](#why-should-you-care)
- [Imagining a solution](#imagining-a-solution)

</div>

## What's a pitfall?

Two notes before we start:

- Pitfalls aren't bugs. They're cases where `datetime` behaves in a way
  that is surprising or confusing. It's always a bit
  subjective whether something is a pitfall or not.
- Many pitfalls exist simply because the authors couldn't
  possibly anticipate all future needs.
  Adding big features over 20 years—without breaking compatibility—isn't easy.

## Libraries considered

With that out of the way, these are the third-party datetime
libraries I'm looking at in this post:

- [`arrow`](https://github.com/arrow-py/arrow) — Probably the most historically popular
  datetime library. Its goal is to make datetime easier to use,
  and to add features that many people feel are missing from the standard library.
- [`pendulum`](https://github.com/sdispater/pendulum) — The only library that
  rivals arrow in popularity. It has similar goals, while explicitly improving
  on Arrow's handling of Daylight Saving Time (DST).
- [`DateType`](https://github.com/glyph/DateType) — a library that allows
  type-checkers to distinguish between naïve and aware datetimes.
  It doesn't change the runtime behavior of `datetime`.
- [`heliclockter`](https://github.com/channable/heliclockter) — a young library
  that offers datetime subclasses for UTC, local, and zoned datetimes.

These libraries I'm *not* looking at:

- `pytz` and `python-dateutil`, which aren't (full) datetime replacements
- `delorean`, `maya`, and `moment` which all appear abandoned

Now: on to the pitfalls!

## 1. Incompatible concepts are squeezed into one class

It's an infamous pain point that a `datetime` instance can be either naïve or aware,
and that they can't be mixed.
In any complex codebase, it's difficult to be sure you won't accidentally mix them
without actually running the code.
As a result, you end up writing redundant runtime checks,
or hoping all developers diligently read the docstrings.

```python
# Naïve or aware? No way to tell...
def plan_mission(launch_utc: datetime) -> None: ...
```

There’s also the question whether distinguishing aware and naïve is enough,
since within the "aware" category there are actually several different kinds
of datetimes.
While compatible,
the semantics of UTC/offset and IANA timezones are notably different when
it comes to ambiguity, for example.

#### What's being done about it?

- :heavy_check_mark: `heliclockter` has separate classes for local, zoned, and UTC datetimes.
- :heavy_check_mark: `DateType` allows type-checkers to distinguish naïve or aware datetimes
- :x: `arrow` and `pendulum` still have one class for naïve and aware.

## 2. Operators ignore Daylight Saving Time (DST)

Given that `datetime` supports timezones with DST transitions,
you'd reasonably expect that the `+/-` operators would take
them into account—but they don't!

```python
paris = ZoneInfo("Europe/Paris")
# On the eve of moving the clock forward
bedtime = datetime(2023, 3, 25, 22, tzinfo=paris)
wake_up = datetime(2023, 3, 26, 7, tzinfo=paris)

# It says 9 hours, but it's actually 8!
# (because we skipped directly from 2am to 3am due to DST)
sleep = wake_up - bedtime
```

#### What's being done about it?

- :heavy_check_mark: `pendulum` explicitly fixes this issue—although changing `+`
  while remaining a drop-in `datetime` subclass
  [takes some guesswork](https://whenever.readthedocs.io/en/latest/why-not-pendulum.html#pendulum-add-stack).
- :x: `heliclockter`, `arrow`, and `DateType` don't address it

## 3. The meaning of "naïve" is inconsistent

In various parts of the standard library, "naïve" datetimes are interpreted
differently. Ostensibly, "naïve" means "detached from the real world",
but in the datetime library it is often implicitly treated as local time.
Confusingly, it is sometimes treated as UTC[^1], while in other places it is
treated as neither!

```python
# a naïve datetime
d = datetime(2024, 1, 1)

# here: treated as a local time
d.timestamp()
d.astimezone(UTC)

# here: assumed UTC
d.utctimetuple()
email.utils.format_datetime(d)
datetime.utcnow()

# here: neither! (error)
d >= datetime.now(UTC)
```

#### What's being done about it?

- :x: While `pendulum` and `arrow` do discourage using naïve datetimes,
  they still support the same inconsistent semantics.
- :x: `DateType` and `heliclockter` don't address this

## 4. Non-existent datetimes pass silently

When the clock in a timezone is set forward, a "gap" is created. For example,
if DST moves the clock forward from 2am to 3am, the time 2:30am is skipped.
The standard library doesn't warn you when you create such a non-existent time.
As soon as you operate on these objects, you run into problems.

```python
# This time doesn't exist on this date
d = datetime(2023, 3, 26, 2, 30, tzinfo=paris)

# No timestamp exists, so it takes another one from the future
t = d.timestamp()
datetime.fromtimestamp(t, tz=paris) == d  # False!?
```

#### What's being done about it?

- :x: `pendulum` replaces the current silent behavior with another: it
  fast-forwards to a valid time [without warning](https://github.com/sdispater/pendulum/issues/697).
- :x: `arrow`, `DateType` and `heliclockter` don't address this issue

## 5. Guessing in the face of ambiguity

When the clock in a timezone is set backwards, an ambiguity is created.
For example, if DST sets the clock one hour back at 3am, the time 2:30am exists
twice: before and *after* the change.
The ``fold`` attribute [was introduced](https://peps.python.org/pep-0495/)
to resolve these ambiguities

The problem is that there is no objective default value for ``fold``:
whether you want the "earlier" or "later"
option will depend on the particular context.
For backwards compatibility, the standard library defaults to ``0``,
which has the effect of silently assuming that you want the earlier occurrence[^3].

```python
# Guesses your intent without warning
d = datetime(2023, 10, 29, 2, 30, tzinfo=paris)
```

#### What's being done about it?

- :x: `pendulum` also guesses, but rather arbitrarily decides that ``1``
  is the better default[^2].
- :x: `arrow` accepts `fold`, but
  [drops it again](https://whenever.readthedocs.io/en/latest/why-not-arrow.html#every-operation-drops-fold)
  on every `shift()`, `floor()`, or `range()`.
- :x: `DateType` and `heliclockter` don't address the issue.

## 6. Disambiguation breaks equality

Even though `fold` was introduced to disambiguate times,
comparisons of disambiguated times between timezones *always* evaluate false due to
[backwards compatibility reasons](https://peps.python.org/pep-0495/#id12).

```python
# A properly disambiguated time...
d = datetime(2023, 10, 29, 2, 30, tzinfo=paris, fold=1)

d_utc = d.astimezone(UTC)
d_utc.timestamp() == d.timestamp()  # True: same moment in time
d_utc == d  # False!?
```

#### What's being done about it?

- :x: None of the libraries addresses this issue

## 7. Inconsistent equality within timezone

In a mirror image of the previous pitfall, there is a false positive
when comparing two datetimes with the exact same `tzinfo` object.
In that case, they are compared by their "wall time".
This is mostly the same *except* when `fold` is involved...

```python
# two times one hour apart (due to DST transition)
earlier = datetime(2023, 10, 29, 2, 30, tzinfo=paris, fold=0)
later = datetime(2023, 10, 29, 2, 30, tzinfo=paris, fold=1)

earlier.timestamp() == later.timestamp()  # false, as expected
earlier == later  # true!?
```

Remember I said *exact same* `tzinfo` object? If you
compare with the same timezone, but you get its object from `dateutil.tz`
instead of `ZoneInfo`, you'll get a different result!

```python
from dateutil import tz
later2 = later.replace(tzinfo=tz.gettz("Europe/Paris"))
earlier == later2  # now false
```

#### What's being done about it?

- :x: None of the libraries addresses this issue.
  `pendulum` adds a twist of its own: its `-` counts elapsed time but its `==` doesn't,
  so [equal values can be an hour apart](https://whenever.readthedocs.io/en/latest/why-not-pendulum.html#pendulum-equality).

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
# Breaks on a datetime, even though it's a subclass
def is_future(d: date) -> bool:
    return d > date.today()

# Some methods inherited from `date` don't make sense
datetime.today()  # fun exercise: what does this return?
```

#### What's being done about it?

- :heavy_check_mark: `DateType` was explicitly developed to fix this inheritance relationship
  at type-checking time.
- :x: `arrow`, `pendulum`, and `heliclockter` don't address the issue.
  Their datetime classes all inherit from `datetime` (and thus also `date`).

## 9. `datetime.timezone` isn't enough for timezone support

OK—so this is maybe something you learn once and then never forget.
But it's still confusing that `datetime.timezone` is only for fixed offsets,
and you need `ZoneInfo` to express real-world timezone behavior with DST transitions.
For beginners that don't know the difference, this is an unfortunate trap.

```python
from datetime import timezone, datetime, timedelta
from zoneinfo import ZoneInfo

# Wrong: it's a fixed offset only valid in winter!
paris_tz = timezone(timedelta(hours=1), "CET")

# Correct: accounts for all timezone changes
paris_tz = ZoneInfo("Europe/Paris")
```

- :heavy_check_mark: Both `arrow` and `pendulum` side-step this issue by specifying
  timezones as strings instead of requiring special class instance.
- :x: `heliclockter` and `DateType` don't address this issue

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
datetime(2023, 7, 1, tzinfo=my_tz)  # not valid for summer!
```

#### What's being done about it?

- :heavy_check_mark: `pendulum` has methods to convert to the full local timezone.
- :x: `arrow` used to as well, but regressed: since version 1.4.0, `'local'` is
  [a fixed-offset snapshot](https://whenever.readthedocs.io/en/latest/why-not-arrow.html#local-is-a-snapshot-not-a-time-zone)
  of the current UTC offset—the very pitfall described here.
- :x: `heliclockter` has a local datetime type with the same issue,
  although a fix is in the works.
- :x: `DateType` doesn't address this issue


## Datetime library scorecard

Below is a summary of how the libraries address the pitfalls (:heavy_check_mark:) or not (:x:).

| Pitfall                     | Arrow | Pendulum | DateType | Heliclockter |
|-----------------------------|-------|----------|----------|--------------|
| aware/naïve in one class    | :x:     | :x:        | :heavy_check_mark:        | :heavy_check_mark:            |
| Operators ignore DST        | :x:     | :heavy_check_mark:        | :x:        | :x:            |
| Unclear "naïve" semantics   | :x:     | :x:        | :x:        | :x:            |
| Silent non-existence        | :x:     | :x:        | :x:        | :x:            |
| Guesses on ambiguity        | :x:     | :x:        | :x:        | :x:            |
| Disambiguation breaks equality | :x:     | :x:        | :x:        | :x:            |
| Inconsistent equality within zone | :x:     | :x:        | :x:        | :x:            |
| datetime inherits from date | :x:     | :x:        | :heavy_check_mark:        | :x:            |
| `timezone` isn't enough for timezone support | :heavy_check_mark:     | :heavy_check_mark:        | :x:        | :x:            |
| DST-unaware local timezone  | :x:     | :heavy_check_mark:        | :x:        | :x:            |

## Why should you care?

The pitfalls roughly fall into two categories:
*confusing design* and *surprising edge cases*.
Here is why you should care about both.

### Confusing design

Confusing design is the larger problem,
because it amplifies the biggest source of bugs: human error.
While good design helps minimize the chance of mistakes,
bad design introduces more opportunities for them.
Looking at other languages, it's clear that better designs are possible.
Java, C#, and Rust all have distinct classes for naïve and aware datetimes (and more).
We can also see that redesigns are worth the substantial effort:
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

   (note: the types have been updated since the original article)

   ```python
   from whenever import (
       # In case you don't care about timezones
       Instant,
       # Simple localization sans DST
       OffsetDateTime,
       # Full-featured IANA timezones (including the system's)
       ZonedDateTime,
       # 'Naive' local times without a timezone
       PlainDateTime,
   )
   ```
2. Addition and subtraction take DST into account.
3. Naïve is always naïve. UTC and local time have their own separate classes.
4. Non-existent datetimes don't pass silently: you get a warning,
   or an exception if you ask for one.
5. The same goes for ambiguous datetimes. No silent guessing:

   ```python
   ZonedDateTime(
       2023, 1, 1, tz="Europe/Paris",
   )  # ok: not ambiguous
   ZonedDateTime(
       2023, 10, 29, 2, tz="Europe/Paris",
   )  # warning: ambiguous!
   ZonedDateTime(
       2023, 10, 29, 2, tz="Europe/Paris",
       disambiguation="later"
   )  # that's better!
   ZonedDateTime(
       2023, 10, 29, 2, tz="Europe/Paris",
       disambiguation="raise"
   )  # if you'd rather get an exception
   ```
6. Disambiguated datetimes work correctly in comparisons.
7. Aware datetimes are equal if they occur at the same moment. No exceptions.

   ```python
   a == b
   # always equivalent to:
   a.instant() == b.instant()
   ```
8. The datetime classes don't inherit from date.
9. IANA timezones are used everywhere, no separate classes are needed.
10. The system timezone is a full timezone, DST transitions included—and you
    only get it if you ask for it.

[Feedback is welcome!](https://github.com/ariebovenberg/whenever) :star2:

## Changelog

See the [git history](https://github.com/ariebovenberg/ariebovenberg.github.io/commits/main/_posts/2024-01-20-python-datetime-pitfalls.md)
for exact changes to this article since initial publication.

### 2024-02-01 18:14:00+01:00

- Clarified wording and code comments in pitfall #3.

### 2024-02-02 10:13:00+01:00

- Clarified wording around timezones and IANA tz database in pitfall #9,
  and throughout the article.
- Added reddit link

### 2024-02-13 08:40:00+01:00

- Clarified wording on distinguishing "aware" types in pitfall #1.
- Added note about RFC 5545 in pitfall #5.

### 2024-02-18 20:28:00+01:00

- Added Hacker News link
- Clarification in pitfall #4, fix code example
- Added non-emoji text to scorecard for systems that don't support it

### 2024-02-18 21:10:00+01:00

- A better solution for emoji :tada:

### 2024-10-03 19:15:00+02:00

- Updated the types in the example code to match the current version of the library

### 2026-09-20 22:16:00+02:00

- Added a note pointing to the up-to-date pitfalls page in whenever's documentation.
- Pitfall #10: `arrow` regressed in version 1.4.0; updated the scorecard to match.
- Added caveats for `pendulum` (pitfalls #2 and #7) and `arrow` (pitfall #5),
  as of `pendulum` 3.2.0 and `arrow` 1.4.0.
- Updated the whenever examples to match the current version of the library

[^1]: In the standard library, methods like `utcnow()` are slowly being deprecated,
      but many UTC-assuming parts remain.

[^2]: Interestingly, pendulum used to have an explicit `dst_rule` parameter that
      was silently [removed in 3.0](https://github.com/sdispater/pendulum/issues/789)

[^3]: This does coincide with RFC 5545, but this is probably
      coincidental. PEP495 doesn't mention RFC 5545, and its semantics
      aren't followed in other areas of the standard library.
