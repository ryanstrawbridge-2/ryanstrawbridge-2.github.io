---
title: CNC Seam Cutter
subtitle: Automated seam-prep tool for fusion magnet assembly
organization: Commonwealth Fusion Systems
date: 2025-01-15
summary: A CNC-driven cutting fixture that automates seam preparation for poloidal field magnet sub-assemblies, replacing a manual operation that bottlenecked the production line.
hero: ../../assets/images/projects/cnc-seam-cutter/cutter-01.jpeg
heroAlt: CNC seam cutter on the manufacturing floor
tools:
  - SolidWorks
  - Linear motion design
  - GD&T
  - CNC programming
  - Sensors and limit switches
order: 5
---

> **Placeholder content — replace with real text.** I dropped in plausible-sounding text and the photos so you can see how the page lays out. Edit this file at `src/content/projects/cnc-seam-cutter.md`.

## Problem

The previous seam-prep operation was performed by hand, requiring a skilled technician to maintain consistent cut geometry and depth across long runs. Variation between cuts caused downstream rework and consumed roughly **half a shift per assembly**. Cuts were also non-repeatable, making process documentation difficult.

## What I did

- Designed a rigid linear-motion gantry around an existing tooling base, keeping the workpiece stationary and moving the cutter along a CNC-driven path.
- Specified and integrated a servo motion system with closed-loop position feedback to hold cut depth within ±0.05 mm.
- Added quick-change cutter mounts and operator-facing safety interlocks (limit switches, e-stop, light curtain) so operators could swap consumables without leaving the safe envelope.
- Worked alongside the production team to refine the work-holding fixture so loading/unloading took under 30 seconds.

## Outcome

- Cut prep time per assembly reduced by **~70%** vs. manual.
- Cut-to-cut variation dropped from ±0.4 mm to ±0.05 mm, eliminating downstream rework.
- Operators reported a noticeably lower-fatigue workflow; documented procedure now repeatable across shifts.

## Gallery

![CNC seam cutter](../../assets/images/projects/cnc-seam-cutter/cutter-01.jpeg)

![CNC seam cutter](../../assets/images/projects/cnc-seam-cutter/cutter-02.jpeg)

![CNC seam cutter](../../assets/images/projects/cnc-seam-cutter/cutter-03.jpeg)

![CNC seam cutter](../../assets/images/projects/cnc-seam-cutter/cutter-04.jpeg)
