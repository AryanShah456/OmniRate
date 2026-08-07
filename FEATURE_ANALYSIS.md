# OmniRate — Feature Analysis & Decisions

**Context that drives every call below:** OmniRate is a passion project. It is not
trying to make money, it does not need to grow, and there is no investor deck that
requires a hockey-stick DAU chart. That single fact flips the sign on about half the
features on the list.

---

## The thesis

Most of the listed features are **network-effect features** — they only produce value
once there are lots of other people on the site. Following, activity feeds from
friends, similar users, personalized discovery: every one of these is worth roughly
zero at 3 users and a lot at 300,000.

A commercial product has to build them anyway, because it's betting on reaching
300,000. A passion project has no such obligation. The correct strategy is the
opposite one:

> **Make OmniRate completely useful when you are the only person using it.**
> Anything that only works with a crowd is dead weight until the crowd exists.

That reframes the "cold start problem" section. The cold start problem isn't really a
problem *to be solved* here — it's a constraint to be **designed around**. The list
frames it as "nobody wants to review where nobody reads reviews." True for a
commercial platform. But you are not trying to attract strangers. You are building a
place to keep track of what you watched, read, listened to and played, with scores that
mean something to you. That works at n=1.

Two things follow, and they're the backbone of what I actually built:

1. **Every item must have a rating from day one.** Not because of network effects, but
   because an empty grid of "—" makes the site feel broken. Solve this by *importing*
   ratings from TMDB / Open Library / RAWG / MusicBrainz, then letting community
   reviews move the number. Day one, the site looks full. This is the real fix for
   cold start, and it doesn't require a single extra user.
2. **Personal utility beats social utility.** A watchlist is useful alone. A friend
   feed is not.

---

## Item-by-item

### Following friends — ❌ SKIP

**For:** The primitive that everything social is built on. Cheap to model (`follows`
collection, two fields).

**Against:** The graph is worthless without people in it. Worse, it's *demoralizing* —
a "Following (0)" counter on your own profile is a permanent reminder that nobody is
here. It also forces a decision you can't easily reverse later (public vs. private
profiles, follow requests, blocking) and drags privacy obligations along with it.

**Verdict:** Skip. Nothing else I'm building depends on it, so it stays cheap to add
later if OmniRate ever picks up real users.

### Activity feeds — ✅ BUILD (but global, not personalized)

**For:** This is the single cheapest way to make a site feel *alive*. Someone reviewed
something 10 minutes ago → the site is a place, not a database.

**Against:** A *friend* feed needs the follow graph, so it's out. A personalized feed
needs volume.

**Verdict:** Build the **global** version — "Recent Activity", every review on the
site, newest first. This works at 2 users, works at 2,000, needs no follow graph, and
costs nothing extra because the review data is already being loaded. The nuance the
original list missed: "activity feed" is three different features wearing one name, and
only the global one is viable now.

### Lists / Watchlists / Reading lists / Collections — ✅ BUILD (as ONE feature)

**For:** Highest-value item on the entire list. A watchlist is the reason people open
Letterboxd when they're not reviewing anything. Pure personal utility — no other user
required. It also gives people a reason to *return*, which the list correctly
identifies as the thing that's missing.

**Against:** Nothing serious. This is table stakes.

**The important observation:** these are **four names for one feature.** "Watchlist"
(movies), "Reading list" (books), "Collections", "Lists" — building four separate
systems would be four times the code and four times the confusion, for one behaviour:
*save this thing for later.*

**Verdict:** Build **one** save system, with per-media labels so it reads naturally —
Watchlist for movies, Reading List for books, Listen Later for music, Play Later for
games — all backed by a single `saved` collection and one **Saved** view. Deliberately
**not** building user-created custom named lists ("Best Heist Movies") — that's a real
feature with real UI cost, and it's a sharing/audience feature at heart, which puts it
back in network-effect territory.

### Recommendations (AI) — ❌ SKIP

**For:** It's the headline feature of every modern app.

**Against:** Genuinely expensive on every axis. Real recommendations need either (a) a
lot of user-item interaction data — you have almost none, and that's the entire
problem, or (b) an LLM API call per request, which means a backend to hold the key,
which means this stops being a static site you can host free on GitHub Pages, and
starts being infrastructure with a monthly bill. For a project explicitly not making
money, adding a variable cost is the wrong trade. And with ~20 reviews in the database,
a recommender's output would be indistinguishable from random.

**Verdict:** Skip. The cheap 80% substitute — "browse by genre, sort by score" — already
exists via the filters, and now works properly because every item has a baseline score
to sort by. That's a real discovery improvement that cost zero dollars.

### Badges — ❌ SKIP

**For:** Cheap to compute client-side. Fun. Passion projects are allowed to be fun.

**Against:** Badges are an *engagement* mechanic, and engagement mechanics are for
retaining an audience you're monetizing. Awarding yourself "Reviewed 10 Movies!" is
motivation theatre — you know you reviewed 10 movies, you were there. They also
accumulate UI clutter fast (where do 15 badges live on a profile?) and create a
maintenance tail of arbitrary thresholds.

**Verdict:** Skip. Weakest ROI on the list. The stat that *is* worth showing — review
counts per media type — I'm putting on profiles as plain numbers, which delivers the
"look what I've done" payoff without the gamification scaffolding.

### Profiles — ✅ BUILD

**For:** Necessary, not optional. Right now a review is a name string and nothing else
— there's no way to answer "who is this person and what else do they like?", which is
the main thing you want to know when you read a review you disagree with. Profiles are
also where the watchlist, review history and stats naturally live, so they pay for
several other features at once. And this is the same feature as your explicit request
to see every review a user has left across all four media types.

**Against:** Privacy surface. Handled below.

**Verdict:** Build. Public profiles show display name, join date, per-media review
counts, and full review history. **Emails are never shown publicly** — see the users
table entry.

### Sharing — ✅ BUILD

**For:** One function call. But the reason to build it is what it *forces*: right now
OmniRate has **no URLs**. Everything is one page with modals — you cannot link to a
movie, cannot bookmark one, cannot reopen one, and the browser Back button doesn't
close the modal. That's a real usability bug, not just a missing growth feature.

**Against:** As a *growth* channel it will do nothing. Nobody shares links to a site
with 5 users.

**Verdict:** Build — for the deep links, and take the share button as a freebie. This is
the item where I most disagree with the original framing: "Sharing" was listed as a
social/growth feature, but its actual value here is fixing navigation.

### Network effects — ⚠️ NOT A FEATURE

Correct diagnosis, but there's nothing to implement. The response is strategic, not a
checkbox: stop treating other users as a prerequisite. Covered by the thesis above.

### Cold start problem — ✅ ADDRESSED (via baseline ratings)

Reframed as above. The version worth solving isn't "get users" — it's "don't show an
empty site." Fixed by importing external ratings so every item has a score before
anyone touches it. This is the feature the original list was circling but never named.

### Limited personalization / personalized home / trending for you / similar users / discovery engine — ❌ SKIP

**For:** Search-only browsing genuinely is limiting — a home page that just says
"Newest Movies" doesn't invite exploration.

**Against:** All four of these are the same feature (a recommender) at different levels
of ambition, and they all need the interaction data you don't have. "Similar users" is
the worst of them: with 5 users, your nearest neighbour is a stranger with one review
in common, and the site would confidently present that as a match. Bad output is worse
than no output — it teaches people not to trust the feature.

**Verdict:** Skip the personalization. **"Trending for you" is out; global "Recent
Activity" is in** — same appetite for "show me something I didn't search for," but it
degrades gracefully instead of lying.

### Visual branding: logo, visual identity, colour palette — ✅ BUILD

**For:** Best effort-to-payoff ratio on the list *for this specific project*. On a
commercial product branding is a marketing expense. On a passion project it's most of
the point — you're building something because you want it to exist and feel good to
open. And there's already a strong foundation being wasted: the per-tab colour themes
(gold / warm orange / neon pink / teal) are a genuinely distinctive idea that no
competitor has, and the current identity is a `★` glyph in a rounded square, which
throws it away.

**Against:** Zero functional impact.

**Verdict:** Build. New mark that makes the four-media concept the identity itself: a
ring of four arcs, one in each media accent colour, converging on a single point.
Fixed `--brand-*` tokens so the logo stays constant while tabs re-theme around it.

### Marketing assets — ❌ SKIP

No marketing is happening, so there's nothing for the assets to do. Building a
"marketing kit" for a project with no marketing channel is busywork.

**Partial exception:** one Open Graph / social preview image, because it's the thing
that renders when a shared link is pasted anywhere — that's not marketing, that's the
sharing feature working correctly. Included with branding.

---

## Final scorecard

| # | Feature | Verdict | Why it survived |
|---|---------|---------|-----------------|
| 1 | **Baseline ratings** (external → blended with community) | ✅ Build | Actually solves cold start. Site looks full at 0 users. |
| 2 | **Unified Saved / Watchlist** | ✅ Build | Highest personal utility. Collapses 4 listed items into 1. |
| 3 | **Profiles + cross-media review history** | ✅ Build | Makes reviews attributable; hosts stats and history. |
| 4 | **Global activity feed** | ✅ Build | Cheapest possible "this site is alive." Works at n=2. |
| 5 | **Deep links + sharing** | ✅ Build | Fixes real navigation bugs; sharing is the freebie. |
| 6 | **Visual identity** (mark, wordmark, palette, OG image) | ✅ Build | Best effort-to-payoff for a project built for love. |
| 7 | **Google sign-in** | ✅ Build | Removes the single biggest barrier to a friend leaving one review. |
| 8 | **Users directory** (owner-only) | ✅ Build | Your own admin visibility into who's using it. |

**Cut:** following, AI recommendations, badges, personalized home, trending-for-you,
similar users, discovery engine, custom named lists, marketing assets.

Eight in, nine out. Everything kept works at one user. Everything cut needed a crowd,
a backend, or a budget.

---

## One thing to be aware of

**The users table shows real email addresses.** Firestore security rules can restrict
*writes*, but any rule that lets your browser read the `users` collection also lets
anyone with your public Firebase config read it — the config in a static site is,
unavoidably, public. So a rule of `allow read: if true` on a collection containing
emails means those emails are effectively public.

The rules shipped here restrict reads of `users` to signed-in accounts, and the UI
additionally hides the table (and all emails) from anyone not in `CONFIG.admins`. That
combination is the right shape for a hobby project: the UI gate is for convenience, the
rules gate is the actual boundary. It's worth knowing that the rules gate is the only
one that's load-bearing — if you ever need emails to be genuinely private, they have to
move behind something that isn't a static site, like a Cloud Function.

Public profiles never expose an email under any configuration.
