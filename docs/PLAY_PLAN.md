# Play plan: Easy, Medium, Hard (decisions signed off 11 Nov 2026)

Plan for the next stretch of the Play game. **Eric took every recommendation in the decisions table on 11 Nov 2026.** The rules still move into `docs/GAME_SPEC.md` as v5 in parcel 7a before any engine code and into `REVIEW_CONTEXT.md` (CLAUDE.md rules 1 and 10). The daily stays on v4 and is untouched by this plan.

## Terms

- **Base route:** the gnome's shortest route with no fences.
- **Slack:** move limit minus base route length. More slack means the player needs more fences (higher par).
- **Load-bearing:** a mechanic is load-bearing on a level if swapping it for plain grass changes par or makes the par answer lose. A mechanic that isn't load-bearing is decoration.
- **Tier:** Easy, Medium, Hard. Each is a pack of 20 levels.

## The shape at a glance

| Tier | Board | Levels | Par ramp | New ideas |
|---|---|---|---|---|
| Easy | 5x5 | 1 to 20 | 1 to 4 | None new. Teaches the v4 basics: fences, the 2-side cap, bridges, teleporters |
| Medium | 7x7 | 21 to 40 | 3 to 5 | Ice, mud, plus one of the suggested extras (one-way gate) |
| Hard | 9x9 | 41 to 60 | 4 to 7 | The gnome carries one tool: ladder, pickaxe or plank. Mixed with Medium tiles late on |

This replaces pack 1 (30 levels, 5x5 / 7x7 / 9x9 mixed). Pack 1 progress can map across (see decision D8).

## Is 5x5 big enough for 20 Easy levels?

Yes. Prototype on 7 Nov: 1,197 random solvable 5x5 boards under v4 (seed 7, rocks 5 to 20%, a teleporter pair on 40%, slack 1 to 6). Par spread:

| Par | 1 | 2 | 3 | 4 | 5 | 6 | 7+ | No win |
|---|---|---|---|---|---|---|---|---|
| Boards | 115 | 270 | 244 | 233 | 151 | 89 | 40 | 55 |

So par 1 to 4 (the Easy band) is the common case, and the generator has plenty to filter from. Par 5+ exists on 5x5 but feels like "fence everything" on 25 tiles, so Easy caps at 4.

## Easy (5x5, levels 1 to 20)

No engine change. Only a new pack build, so it can ship first.

| Levels | Par | What it teaches |
|---|---|---|
| 1 to 5 | 1 to 3 | The current hand-authored tutorial, kept as is (one idea each) |
| 6 to 9 | 2 | Two fences that work together; first rocks |
| 10 to 13 | 2 to 3 | Bridges as choke points |
| 14 to 17 | 3 | Teleporters: fence the approach, not the jump |
| 18 to 20 | 3 to 4 | Mixes; level 20 is the Easy "boss" at par 4 |

Design metrics (the build script checks these and fails the build otherwise):
- Par exactly as in the table; budget par + 2 (unchanged rule).
- Par answers at most 10 on levels 6 to 13 (a crisp answer helps learning), no cap after.
- Slack 2 to 5.
- Each tier-idea level is load-bearing for its idea (a bridge level stops winning if the bridge becomes river or grass).

## New board tiles (Medium)

Each tile gets a symbol in the level format, a rule, an animation and a palette entry. Palette rule 6 applies: none of these can borrow a colour that already means something.

### 1. Ice (requested)

| | |
|---|---|
| Symbol | `*` |
| Rule | When the gnome steps onto ice he keeps sliding the same way until the next step would hit a fence, rock, river or the border, or he slides onto a tile that isn't ice (he stops there). |
| Cost | **The whole slide is one move** (same as a teleport jump). Ice is a speed lane. |
| Fences | Lines beside ice can be fenced. A fence across the slide stops him on the ice tile before it. This is the big lever: one fence turns a shortcut into a dead stop. |
| Edge cases | Sliding onto a teleporter jumps him and ends the slide. Sliding onto the house wins. Start and house are never ice. |
| Engine | Moves become directed (a slide is one-way), so routing is BFS over the directed graph. The solver branches on every fenceable line the slide crosses. No-cut uses directed reachability. |
| Art | Pale frosted tile `#dff3f8` with two white shine streaks and a crack line, outline `#3b2618`. **No glow** (glow means magic). |
| Animation | Gnome locks into a skid pose (arms out, hat tilting back), slides with a short frost-spray trail; bumps a fence with a small wobble and a "thunk" squash; steps off ice with a little relieved hop. |

### 2. Mud (requested as "sticky")

| | |
|---|---|
| Symbol | `&` |
| Rule | Stepping onto mud costs 2 moves (in, then stuck for one). Leaving is a normal step. |
| Fences | Lines beside mud can be fenced. |
| Edge cases | If his last move lands him in mud he's still stuck when moves run out (win for the player). Start and house are never mud. |
| Engine | Routes become weighted, so shortest path moves from BFS to a small Dijkstra (weights 1 or 2). Tie-break order unchanged. The solver's lower bound still holds. |
| Art | Dark peaty tile `#6b5232`, two bubbles, a boot print. Must read differently from bridge log brown `#a0703f`. |
| Animation | Gnome sinks to the knees with a "glorp", wiggles left-right for the stuck beat (a mud bubble pops), pulls free with a squelch and mud splats on his boots for the next step. |

### 3. One-way gate (suggested extra, recommended)

| | |
|---|---|
| Symbol | `<` `>` `^` `v` (the way it lets him through) |
| Rule | A garden gate tile he can only walk through in the arrow's direction: enter moving that way, leave moving that way. |
| Why it's good | Turns the board into one-way streets. The player reads it instantly, and it creates "he has to go all the way round" moments without new art for the fences. No extra engine state. |
| Engine | Directed edges, same machinery as ice. Cheap once ice exists. |
| Art | Stone-grey `#9aa3a6` arch with a gold-free arrow (cream `#fff6e0`), swinging door. Not timber (timber means a player fence). |
| Animation | Gate swings open on his approach, clacks shut behind him; if the route ever pushes against it (preview only), it rattles. |

### 4. Spring pad (suggested extra, optional)

| | |
|---|---|
| Symbol | `@` |
| Rule | Stepping onto it bounces him 2 tiles on in the same direction, hopping over the tile between (and any fence on those lines). Lands like a normal step; if the landing tile isn't walkable, the pad does nothing and he stands on it. One move. |
| Why it's good | The first thing that **ignores fences**, so it makes the player think about where not to rely on a fence. Good bridge into Hard, where the ladder does the same on purpose. |
| Risk | Overlaps ice (both are "moves you further than one tile"). Pick one of gate or spring for Medium; I'd pick the gate. |
| Art | A springy toadstool with a cream-and-brown cap, **not red** (hat red is the gnome and his house). |
| Animation | Pad squashes, gnome flies in an arc doing a little tuck, lands with a dust puff; pad boings back. |

## Gnome tools (Hard)

The gnome starts a level with one tool, shown on the board before you place anything ("Gnome brought: a ladder"). He uses it **at most once, and wherever it shortens his route the most** (he's still a shortest-route gnome; the engine searches with "tool used yet?" as part of his state). The player plans around a gnome that fights back.

| Tool | What it does once | Cost | Animation |
|---|---|---|---|
| Ladder | Climb over one player fence | Proposed: the climb is 2 moves | Props ladder on the fence, climbs, hops down; ladder tips over and poofs |
| Pickaxe / scythe | Clear one rock tile and step onto it. Bushes are rock in the engine (an art variant), so one tool covers both: pickaxe on a rock, scythe on a bush, same rule | 2 moves (dig, step) | 3 chips with stone flecks, rock crumbles to pebbles; or a swish and leaves scatter |
| Plank | Cross one river tile without a bridge | 1 move | Lays the plank, tiptoes across, plank floats off downstream |

Rules that keep tools fair:
- **No-cut ignores tools.** A fence set must still leave him a route without his tool. The tool never decides whether a fence is refused, which would feel random.
- The tool is shown before you plan, never a surprise.
- The par answer and hints account for the tool (par is exact against the tool-using gnome).
- Engine cost: state doubles (position x tool used), still small. Solver must branch on lines crossed by the tool-free part of the route, plus the candidate crossings. This needs a proof-by-brute-force test on small boards before it ships, same as Phase 3.

## Design metrics (every new mechanic, checked by the build)

| Metric | Target | Why |
|---|---|---|
| Load-bearing rate | 100% on a mechanic's intro levels, at least 70% on the tier overall | Otherwise it's decoration |
| Par band | As per the tier table | The ramp |
| Slack | Easy 2 to 5, Medium 3 to 7, Hard 5 to 10 | Slack is what lifts par (v4 Lab finding) |
| Par answers | At most 10 on intro levels | Learnable, not luck |
| Density | Ice 3 to 8 tiles, mud 2 to 5, gates 1 to 3 on 7x7 | Readable at 390px |
| Solve budget | Every level solves within the pack node budget (pack hints use the stored answer, but the build must still finish) | Keeps generation sane |
| Generation yield | Logged per band | Tells us early if a band is too strict |

Intro pattern for each mechanic: 1 level where it alone decides par, 2 where it combines with a known idea, then it joins the mix.

## Build order (parcels)

| # | Parcel | Done when | Who |
|---|---|---|---|
| 7a | **Spec v5** | Decisions below signed off; GAME_SPEC v5 sections for tiers, ice, mud, gate, tools; REVIEW_CONTEXT updated | Orchestrator (Opus) |
| 7b | **Easy pack** | 20 levels 5x5 to the table and metrics; tier select on the Play page (MENU_SPEC); pack 1 progress mapped | Builder (Sonnet) |
| 7c | **Engine: ice + mud (+ gate)** | Tests first: slides, stops, mud cost, directed no-cut, solver exact vs brute force on 5x5 | Builder (Sonnet), verified by Opus |
| 7d | **Art + animation: Medium tiles** | Sprites from `build-sprites.mjs`, slide / sink / gate animations, reduced-motion fallbacks | Builder (Sonnet) + frontend-design |
| 7e | **Lab round** | 5 Lab levels per mechanic; Eric playtests; keep, tweak or cut | Eric + QA (Sonnet, fresh) |
| 7f | **Medium pack** | 20 levels 7x7 to the metrics | Builder (Sonnet) |
| 7g | **Engine + UI: tools** | Tool state in routing and solver, brute-force proof, tool badge, three animations | Builder (Sonnet), verified by Opus |
| 7h | **Lab round 2 + Hard pack** | Tools playtested, then 20 levels 9x9 | Eric, then Builder |

7b can start straight away and ship on its own, since it needs no engine change.

## Where this could be wrong (devil's advocate)

- **The core joy is predicting his route.** Ice and tools make the route harder to predict in your head. If players can't predict it, fences feel like guesses. Mitigation: one mechanic at a time, Lab before packs, and consider a "show his route now" preview button as an Easy/Medium aid.
- **Tools are a handicap, not a toy.** Giving the gnome a ladder makes your fences worth less. Handicaps tend to feel less fun than new powers. Alternative angle below.
- **60 levels is twice the QA.** Each tier is a separate PR, so a weak tier can slip without blocking the others.
- **Ice and spring overlap.** Shipping both in Medium muddies the lesson. Hence: gate in Medium, spring maybe never.
- **The daily drifts from Play.** If Play gets ice and the daily doesn't, daily players who never open Play never see it. That's fine for now; revisit once Medium has a month of play.

### Alternative angle: give the player the powers

Instead of (or as well as) gnome tools, Hard gives the **player** one Croakwell spell per level: freeze a tile to ice, turn a tile to mud, or drop a one-way gate. Same engine work as Medium tiles (the spell just places a tile), more expressive for the player, and it fits Croakwell's prankster role. Gnome tools could then be a Hard+ / later tier.

## Decisions (signed off 11 Nov 2026: all as recommended)

| # | Question | Decision |
|---|---|---|
| D1 | 20 levels per tier (60 total)? | Yes |
| D2 | Ice slide counts as 1 move total, or 1 per tile slid? | 1 total (makes ice a shortcut the player must deal with) |
| D3 | Mud: 2 moves to enter? | Yes |
| D4 | Third Medium mechanic: one-way gate, spring pad, both, neither? | Gate only |
| D5 | Hard: gnome tools, player spells, or both? | Gnome tools first (your idea), player spells as the Lab alternative in 7h |
| D6 | Tool costs: ladder 2, pickaxe 2, plank 1? | Yes |
| D7 | No-cut ignores the gnome's tool? | Yes |
| D8 | Old pack 1: retire and map stars across by board size, or keep as "Classic"? | Retire; stars on old 5x5 levels 1 to 5 carry to Easy 1 to 5 (same levels) |
| D9 | Locks between tiers at launch (finish Easy to open Medium)? | Open in development, lock at launch, as now |
