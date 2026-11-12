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
    takeaway: "Physical datums: the base, a squared side edge, and one dowel hole."
    plan: >-
      Simplified datum sketch: the dowel-pin datums, with the position and symmetry feature control frames you actually applied. Y14.5 notation, not a photo.
    aspect: auto
    points:
      - Datum A is the base of the plate
      - Datum B is square to the base, so the slots don’t bind.
      - Datum C is located from the base and the edge, postioning dowel pins
      - Toggle clamps radial conform the cable within the jaws
      - Fixture clamps on the table constrain the cable from leaving the jaws
    image: ../../assets/images/projects/cnc-seam-cutter/cnc-seam-cutter-seamcut-datums.png
    alt: "Datum sketch of the fixture base plate: datum A is the base, datum B is the side edge with perpendicularity to A, datum C is one dowel hole. The dowel holes are positioned to A and B, the shoulder-bolt holes to A, B and C; the cable channel carries no feature control frame."
  - section: Outcome
    kind: photo
    title: Proving clamp force and cut path
    takeaway: "New figure: one line on what it shows"
    image: ../../assets/images/projects/cnc-seam-cutter/initial-testing.jpg
    aspect: 4/3
heroAspect: standard
---

## Problem

The previous end-prep operation was performed by hand. This operation took an entire shift and required a skilled technician to monitor the process constantly.

## What I did

* Developed a modular CNC seam-cutting fixture that radially conforms 11 configurations of a new cable type
* Enabled qualification testing ahead of new production line
* Applied ASME Y14.5 GD\&T: physical datums on the base, a squared side edge and a dowel pin, with position and perpendicularity controls for repeatable alignment to the CNC head.

## Outcome

* Cut anticipated prep time per assembly from 2 hours to 30 minutes.
* De-risked critical operation for new magnet production line.
* Cut-to-cut variation dropped, and operator error eliminated, reducing non-conformances.
