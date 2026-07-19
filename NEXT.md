---
schema: portfolio-next-v1
repo: portfolio
status: live
phase: v1-maintenance
priority: low
owner: navy
last_updated: 2026-07-19
active_goal: Resolve the two leftover cloud-session branches so remote state is clean and intentional.
next_action: Navy makes the epigraph taste call — merge origin/claude/portfolio-epigraph-numeral (numerals "10%"/"90%" in the quote) or close it (keep spelled-out "ten percent"/"ninety").
allowed_actions:
  - read repo and live site (https://cultivatedco.ca)
  - fetch/pull to keep local main current
  - delete origin/claude/portfolio-experience-copy-q7an7u after Navy confirms (verified duplicate of merged PR #1)
  - update this file when state changes
blocked_actions:
  - merging claude/portfolio-epigraph-numeral without Navy's explicit call (taste decision, not a correctness fix)
  - pushing any content change to main without Navy review (site is live and public)
source_docs:
  - index.html
  - ../../AGENTS.md
handoff_target: Navy directly — both open items are his taste/approval calls.
---

# NEXT

Portfolio v1.0 is live at cultivatedco.ca; only cleanup decisions remain.

## Current State

Static GitHub Pages site (mdvnavy/portfolio, CNAME cultivatedco.ca). Local main synced at df90d64 ("10+" numeral in hero, PR #1). Two remote branches from cloud Claude sessions remain unmerged.

## Active Decision

Epigraph copy: numerals ("10%" / "90%") vs spelled-out ("ten percent" / "ninety") in the pull-quote. Branch `claude/portfolio-epigraph-numeral` holds the numeral version; live site has spelled-out.

## Do Next

- Navy: eyeball both epigraph versions, pick one; merge or close the branch.
- Delete `claude/portfolio-experience-copy-q7an7u` (duplicate of merged PR #1 — verified 2026-07-19).
- Update this file after both are resolved.

## Do Not Do Yet

- No merges or pushes to main without Navy's call.

## Acceptance Criteria

- Zero unmerged remote branches; local, remote, and live all agree.
- NEXT.md reflects the resolved state.

## Handoff Format

Status: live, healthy; two stale branches pending decision
Decision needed: epigraph numerals vs spelled-out
Allowed: fetch/pull, delete verified-duplicate branch after confirmation
Blocked: merging/pushing content without Navy
Evidence: git log df90d64; branches origin/claude/portfolio-epigraph-numeral (0818e77, d4658ec), origin/claude/portfolio-experience-copy-q7an7u (87563e5)
