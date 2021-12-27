---
layout: post
title:  "Is your Python code vulnerable to log injection?"
date:   2021-12-27
---

Following the news on log4j lately,
you may wonder: is Python's logging library safe?
After all, there is a potential for injection attacks anywhere string formatting
meets user input.
It turns out that logging f-strings may leave you vulnerable to attack.

## The basics of logging

Where does formatting meet user input exactly?
Let's start with a basic logging setup.

```python
import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
```

Logging a message:

```python
logger.info("hello world")
```

Which prints:

```log
INFO:__main__:hello world
```

Let's see the string formatting in action.

```python
context = {'user': 'bob', 'msg': 'hello everybody'}
logger.info("user '%(user)s' commented: '%(msg)s'.", context)
```

This outputs the following:

```log
INFO:__main__:user 'bob' commented: 'hello everybody'.
```

## Simple injection

If you don't sanitize your inputs,
you may be vulnerable to [log injection](https://owasp.org/www-community/attacks/Log_Injection).
Consider the following message:

```python
"hello'.\nINFO:__main__:user 'alice' commented: 'I like pineapple pizza"
```

If logged with the previous template, this results in:

```
INFO:__main__:user 'bob' commented: 'hello'.
INFO:__main__:user 'alice' commented: 'I like pineapple pizza'.
```

As you can see, an attacker can not only corrupt logs, but also incriminate others!

### Mitigation

We can mitigate this particular attack by [escaping newline characters](https://github.com/darrenpmeyer/logging-formatter-anticrlf).
But, beware that there are plenty of other [evil unicode control characters](https://www.python.org/dev/peps/pep-0672/)
which can mess up your logs.
The safest solution is to simply not log untrusted text.
If you need to keep untrusted text for an audit trail, store it in a database.
Alternatively, [structured logging](https://www.structlog.org/en/stable/)
can prevent newline-based attacks.

## Double formatting trouble

There's another interesting vulnerability which is particular to Python.
Because the old `%`-style formatting used by `logging` is often considered ugly,
many people prefer to use f-strings:

```python
logger.info(f"user '{user}' commented: '{msg}'")
```

Admittedly this _looks_ nicer, but it won't stop `logging`
from trying to format the resulting string itself.
So if the `msg` is...

```python
"%(foo)s"
```

...we are left with this after the f-string evaluates:

```python
logger.info("user 'bob' commented: '%(foo)s'")
```

So what does `logging` do? Does it try to look up `foo` and crash?
Thankfully not. In the depths of the `logging` source code we find:

```python
if self.args:
    msg = msg % self.args
```

No arguments, no formatting. Makes sense.
But once there is an argument, things get interesting. Consider this:

```python
logger.info(f"user '%(user)s' commented: '{msg}'.", context)
```

Of course, nobody is likely to mix formatting styles at first.
But it is plausible that either:
- Someone would add the `msg` parameter to an existing log statement in this way;
- When refactoring to an f-string, someone forgot to remove the `context` argument;
- That log messages are passed through a user-defined function which adds a `context` argument.

In this case get an error like this:

```log
--- Logging error ---
Traceback (most recent call last):
   [...snip...]
    msg = msg % self.args
KeyError: 'foo'
Call stack:
  File "example.py", line 29, in <module>
    logger.info(f"user '%(user)s' commented: '{msg}'.", context)
Message: "user '%(user)s' commented: '%(foo)s'."
Arguments: {'user': 'bob'}
```

Annoying to have in the logs? Yes. Dangerous? Not..._yet_.

### Padding a ton

One possibility is a denial-of-service attack which abuses [string padding syntax](https://pyformat.info/#string_pad_align).
Consider this message:

```python
"%(user)999999999s"
```

This will pad the `user` with almost a gigabyte of whitespace.
Not only will this slow your log statement down to a crawl,
it could also clog up your logging infrastructure.
You won't even know what hit you.

### Leaky logs

Another potential risk is leaking sensitive information.
In our example, if the `context` contains a `"secret"` key,
an attacker could leak them into the logs with the following message:

```python
"%(secret)s"
```

This is particularly dangerous when combined with the padding vulnerability,
as the attacker could use timing to sniff out which keys are present.

On the flip side, we can be thankful that Python's `%` formatting syntax is so limited.
If logging used the new braces-style, an attacker wouldn't even need
sensitive data to be present in `context`, by [using a message like](https://lucumr.pocoo.org/2016/12/29/careful-with-str-format/):

```python
"{0.__init__.__globals__['SECRET']}"
```

### Mitigation

To eliminate these risks, you should let `logging` handle string formatting.
Don't format log messages yourself with f-strings or otherwise [^1].
There is a [flake8 plugin](https://github.com/globality-corp/flake8-logging-format)
that can check this for you.
Also, once [PEP675](https://www.python.org/dev/peps/pep-0675) is implemented,
you can use a typechecker to check only literal strings are passed to the logger.

## Takeaways

1. *Don't log untrusted text*. Python's logging library doesn't protect you from
   newlines or other unicode characters which allow
   attackers to mess up — or even forge — logs.
2. *Don't format logs yourself (with f-strings or otherwise)*.
   In certain situations this could leave you vulnerable to
   denial-of-service attacks or even sensitive data exposure.

### Full code sample

Here is a full sample of the code used, so you can experiment for yourself.

```python
import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# basic usage
logger.info("hello world")

# basic formatting
context = {
    "user": "bob",
    "msg": "hello everybody",
}
logger.info("user '%(user)s' commented: '%(msg)s'.", context)

# classic log injection
context = {
    "user": "bob",
    "msg": "hello'.\nINFO:__main__:user 'alice' commented 'I like pineapple pizza",
}
logger.info("user '%(user)s' commented: '%(msg)s'.", context)

# f-string double formatting error
context = {
    "user": "bob",
    "msg": (msg := "%(foo)s"),
}
logger.info(f"user '%(user)s' commented: '{msg}'.", context)

# DoS attack
context = {
    "user": "bob",
    "msg": (msg := "%(user)999999s"),  # add more nines at your own risk
}
logger.info(f"user '%(user)s' commented: '{msg}'.", context)

# secret leakage
context = {
    "user": "bob",
    "msg": (msg := "%(secret)s"),
    "secret": "hunter2",
}
logger.info(f"user '%(user)s' commented: '{msg}'.", context)

```

[^1]: Using logging's built-in formatting is also
      [better for other reasons](https://dev.to/izabelakowal/what-is-the-best-string-formatting-technique-for-logging-in-python-d1d).
