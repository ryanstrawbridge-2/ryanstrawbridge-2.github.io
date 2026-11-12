---
title: Underwater Mechanical Release System
organization: 'Capstone – It''s That Deep'
date: 2026-06-24T20:30:15.114Z
summary: 'Designed the mechanical release for a resettable, low-cost underwater retrieval system rated to 300 m, targeting under $400 against $2,000+ commercial systems.'
hero: ../../assets/images/projects/underwater-mechanical-release-system/hero-overview.png
heroAlt: CAD mockup
heroFocalPoint: '43% 29%'
heroAspect: standard
galleryLayout: stacked
gallery:
  - model: itd-release.glb
    alt: ITD release assembly, interactive 3D model. The housing is drawn see-through so the electronics and release mechanism inside are visible.
    caption: The release assembly in 3D. Drag to rotate; the housing is see-through.
    section: What I did
    width: full
  - image: ../../assets/images/projects/underwater-mechanical-release-system/prototype-assembly.jpeg
    caption: Prototype
    alt: "Prototype parts on the bench: housing, end caps, and the motor and electronics stack, with the drawings underneath."
  - image: ../../assets/images/projects/underwater-mechanical-release-system/housing-drawing.png
    alt: "Housing drawing: acetal copolymer, GD&T on the bore and O-ring face."
  - image: ../../assets/images/projects/underwater-mechanical-release-system/pressure-test-300m.jpeg
    alt: Pressure test vessel used for the 470 psi test.
tools:
  - Mechanical design
order: 4
figures:
  - section: What I did
    kind: photo
    title: Seal stack at 470 psi
    takeaway: Two dynamic O-rings and a face seal hold 470 psi, and the latch still resets from outside.
    plan: >-
      Section view through the housing: both dynamic nitrile O-rings and the static face seal, each called out, with the gland dimensions you sized to the Parker handbook.
    points:
      - Endcap
      - Resettable without opening the housing.
    image: ../../assets/images/projects/underwater-mechanical-release-system/cross-section.png
    alt: "Section view of the release: electronics and battery inside the housing, motor driving the release shaft through the sealed end cap."
    focal: 26% 96%
    callouts:
      - { x: 85.2, y: 56.6, label: New marker, place: right }
      - { x: 61.1, y: 75.6, label: New marker, place: right }
    zoom: 1.5
    aspect: 3/4
  - section: Outcome
    kind: photo
    title: Ocean test
    takeaway: Released 20 lb at 60 ft after 5 days in the ocean.
    plan: >-
      A photo from the 60 ft, 5-day deployment if you have one; otherwise the bench pressure test at 470 psi. Pick from portfolio-photos.
    aspect: 3/2
    points:
      - Version 1 pressure-tested to 470 psi with no leaks.
      - Achieved 2.25 FS on the release arm with an 80 lb weight.
      - More testing to come!
    image: ../../assets/images/projects/underwater-mechanical-release-system/v1-testing.png
    alt: Two V1 release units and an anchor on the dock.
  - section: What I did
    kind: diagram
    title: New figure
    takeaway: "New figure: one line on what it shows"
---

## Problem

* Handle release loads up to 35 kg (80 lbs)
* Rated for 300 m depth and underwater environments
* Resettable without opening the housing
* Target production cost under $400
* Reliable actuation after six months submerged, accounting for biofouling and corrosion
* Must fit within the payload envelope of small autonomous underwater vehicles

## What I did

* Led the mechanical release design from concept through CAD, hand calculations, FEA, and prototype testing.
* Owned the top-level CAD and drafted drawings to ASME Y14.5 2009 standards
* Sized dual dynamic nitrile O-rings and a static face seal to Parker Handbook design practice at 470 psi
* Ran hand calculations for shaft bending, tensile, torsional, shear tear-out, bolt pullout, and face-seal clamping force across the full load path

## Outcome

* Version 1 vessel pressure-tested to 470 psi with no leaks.
* Released a 20 lb weight at 60 ft depth after 5 days in the ocean, proving adequate sealing and initial release reliability.
* Achieved 2.25 FS on the release arm with an 80 lb weight.
* Additional testing to be carried out to prove maximum weight release at depth and duration underwater.
