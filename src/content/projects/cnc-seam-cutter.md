---
title: CNC Seam Cutter
subtitle: Automated seam-prep tool for fusion magnet assembly
organization: Commonwealth Fusion Systems
date: 2026-05-12T00:00:00.000Z
summary: 'A CNC-driven cutting fixture that semi-automates end preparation for poloidal field magnet sub-assemblies, replacing a manual operation that bottlenecked the production line.'
hero: ../../assets/images/projects/cnc-seam-cutter/hero-on-floor.jpeg
heroAlt: CNC seam cutter on the manufacturing floor
gallery:
  - image: ../../assets/images/projects/cnc-seam-cutter/straight-cut-test.jpg
    alt: Straight cut test
  - image: ../../assets/images/projects/cnc-seam-cutter/initial-testing.jpg
    alt: 'Initial Testing '
  - image: ../../assets/images/projects/cnc-seam-cutter/edge-finder-testing.jpeg
    alt: Edge Finder Testing
tools:
  - NX
  - GD&T
  - CNC programming
  - Fixture design
order: 5
draft: false
figures:
  - section: What I did
    kind: diagram
    title: Datum scheme
    takeaway: "Plane and two dowels: the base sits on A, and the fixed plate's dowel holes fix everything else."
    plan: >-
      Simplified datum sketch: the dowel-pin datums, with the position and symmetry feature control frames you actually applied. Y14.5 notation, not a photo.
    aspect: auto
    points:
      - A is the base. Dowel 1 is B, which fixes X and Y; dowel 2 is C, which only stops rotation.
      - The fixed plate sits on the dowels. The ram plate's slots ride on shoulder bolts positioned to A|B|C, so it travels square to the fixed plate.
      - Toggle clamps push the ram plate in, and the cable is held between the two green plates.
      - The cable channel in the base only has to clear the cable, so it carries no feature control frame.
    image: ../../assets/images/projects/cnc-seam-cutter/cnc-seam-cutter-datum-scheme-2.png
    alt: "Datum sketch of the fixture base plate: datum A is the base, B and C are the two dowel holes the fixed plate sits on. The shoulder-bolt holes under the ram plate's slots are positioned to A, B and C; toggle clamps push the ram plate toward the fixed plate, with the cable between them."
heroAspect: standard
---

## Problem

The previous end-prep operation was performed by hand. This operation took an entire shift and required a skilled technician to monitor the process constantly.

## What I did

* Developed a modular CNC seam-cutting fixture that radially conforms 11 configurations of a new cable type
* Enabled qualification testing ahead of new production line
* Applied ASME Y14.5 GD\&T: datums on the base and dowel pins, with position controls for repeatable alignment to the CNC head.

## Outcome

* Cut anticipated prep time per assembly from 2 hours to 30 minutes.
* De-risked critical operation for new magnet production line.
* Cut-to-cut variation dropped, and operator error eliminated, reducing non-conformances.
