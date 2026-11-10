---
title: "Guest"
description: "Letting visitors in without signing in."
order: 3
---

![Guest](screen:guest)

Users -> Guest: switch the guest on to let visitors in without signing in,
with a default role (e.g. a read-only visitor). The guest's choices (such as
the language) stay in their own browser.

- **Guest access on** - the guest at all; off - everyone signs in.
- **A new visitor starts as** - the role a visitor gets (what they see, which
  pages, the AI tokens a day for all the visitors together - Users -> the
  `guest` account). A link with `?account=<a role's link name>` opens another
  guest role.
- **Who reads them** - the visitors' AI conversations: **Private - each browser
  its own** or **Public - every guest reads all**.
- **Kept, days** - how long a visitor's conversations stay (empty - always).
- **Only relevant questions kept** - a question off the system's topic is not
  answered and not stored (its tokens still count).
