---
title: QFN Solder Fixture & Stencil
subtitle: Heat shielding fixture and stencil optimization for circuit card reflow
organization: Raytheon
date: 2024-08-01
summary: Designed a Durastone heat-shielding fixture and optimized solder stencil patterns to eliminate QFN bridging and prevent filter overheating during reflow on missile and radar circuit cards.
hero: ../../assets/images/projects/qfn-fixture/hero.jpg
heroAlt: QFN solder fixture on a populated circuit card
tools:
  - Mechanical design
  - Fixture design
  - FDM 3D printing
  - Reflow / solder process
  - DOE on stencil patterns
order: 4
---

> *Specific designs are ITAR restricted; this writeup describes the approach at a high level.*

## Problem

- QFN packages had frequent solder bridging from the leads to the center pad despite correct paste volume.
- Filters on the circuit boards were overheating above 93 °C during reflow, causing failures.

## What I did

- Designed a heat-shielding fixture out of Durastone to apply controlled pressure on the QFN during reflow while keeping adjacent components cool.
- Collaborated closely with operators to ensure ease of use, iterating with FDM 3D-printed prototypes before committing to the production fixture.
- Optimized and tested **9 solder stencil patterns** that varied paste volume and placement on the QFN center pad.

## Outcome

- Reduced QFN solder bridging, improving yield and cutting rework time.
- Prevented filter overheating across the entire board suite, since the same through-hole pattern was reused on adjacent assemblies.
