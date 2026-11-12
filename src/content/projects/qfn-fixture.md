---
title: Solder Reflow Fixture
subtitle: Heat shielding fixture for circuit card reflow
organization: Raytheon
date: 2024-08-01T00:00:00.000Z
summary: Designed a Durastone heat-shielding fixture to prevent filter overheating during reflow of circuit cards.
hero: ../../assets/images/projects/qfn-fixture/hero-stock-reference.webp
heroAlt: Similar fixture stock image
tools:
  - Mechanical design
  - Fixture design
  - FDM 3D printing
  - Reflow / solder process
  - DOE on stencil patterns
order: 6
figures:
  - section: Problem
    kind: data
    title: The reflow profile and the 93 °C limit
    takeaway: PLACEHOLDER COPY — rewrite. The filters saw more than they are rated for.
    plan: >-
      Generic reflow temperature profile over time, with a horizontal line at 93 °C and the region above it shaded. Nothing program-specific — this is the clearest way to explain the problem without showing restricted geometry.
    aspect: 16/9
    points:
      - Filters on the circuit boards were overheating above 93 °C during reflow, causing failures.
  - section: What I did
    kind: diagram
    title: How the shield works
    takeaway: PLACEHOLDER COPY — rewrite.
    plan: >-
      Generic cross-section: board, the heat-sensitive component, and the shield sitting over it with the pin alignment. Generic outlines only — no program geometry.
    aspect: 16/9
    points:
      - Designed a universal PCB component heat shield with iterative pin alignment from Gerber files.
      - Printed 3 test fixtures to see how operators worked with the new tool.
---

> STOCK IMAGE SHOWN - *Specific designs are ITAR restricted*

## Problem

* Filters on the circuit boards were overheating above 93 °C during reflow, causing failures.

## What I did

* Designed a universal PCB component heat shield with iterative pin alignment using Gerber files and SolidWorks.
* Printed 3 test fixtures to see how operators worked with the new tool.

## Outcome

* 3D Print fit well, and operators affirmed its usefulness.
* Projected to reduce the number of required reworks on the board suite.
* A co-worker brought the design to a symposium to present after the conclusion of my co-op.
