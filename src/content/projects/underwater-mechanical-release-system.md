---
title: Underwater Mechanical Release System
organization: 'Capstone Project - Underwater Acoustic Release System - It''s That Deep '
date: 2026-06-24T20:30:15.114Z
summary: 'Designed the mechanical release for a resettable, low-cost underwater retrieval system rated to 300 m, targeting under $400 against $2,000+ commercial systems.'
hero: ../../assets/images/projects/underwater-mechanical-release-system/hero-overview.png
heroAlt: CAD mockup
heroFocalPoint: '43% 29%'
heroAspect: standard
galleryLayout: stacked
gallery:
  - image: ../../assets/images/projects/underwater-mechanical-release-system/prototype-assembly.jpeg
    caption: Prototype
  - image: ../../assets/images/projects/underwater-mechanical-release-system/cross-section.png
    alt: itd cross section
  - image: ../../assets/images/projects/underwater-mechanical-release-system/housing-drawing.png
    alt: itd housingdrawing
  - video: resetting-latch.mp4
    alt: itd resettinglatch
  - image: ../../assets/images/projects/underwater-mechanical-release-system/fea-sheath.png
    alt: itd feasheath
  - image: ../../assets/images/projects/underwater-mechanical-release-system/pressure-test-300m.jpeg
    alt: itd 300mpressure test
  - image: ../../assets/images/projects/underwater-mechanical-release-system/v1-testing.png
    alt: itd v1testing
tools:
  - Mechanical design
order: 4
figures:
  - section: Problem
    kind: diagram
    title: Cost against depth rating
    takeaway: PLACEHOLDER COPY — rewrite. The gap this design aims at.
    plan: >-
      Scatter: depth rating on X, unit cost on Y. Plot the commercial systems above $2,000 and this one at under $400 and 300 m. One quadrant is empty and that is the point.
    aspect: 4/3
    points:
      - Target production cost under $400 against $2,000+ commercial systems.
      - Rated for 300 m depth and underwater environments.
  - section: What I did
    kind: diagram
    title: Seal stack at 470 psi
    takeaway: PLACEHOLDER COPY — rewrite.
    plan: >-
      Section view through the housing: both dynamic nitrile O-rings and the static face seal, each called out, with the gland dimensions you sized to the Parker handbook.
    aspect: 16/9
    points:
      - Sized dual dynamic nitrile O-rings and a static face seal to Parker Handbook design practice at 470 psi.
      - Resettable without opening the housing.
  - section: What I did
    kind: diagram
    title: Load path, with a factor of safety at each check
    takeaway: PLACEHOLDER COPY — rewrite. Six hand calculations, one picture.
    plan: >-
      One section view, six numbered callouts — shaft bending, tensile, torsional, shear tear-out, bolt pullout, face-seal clamping. Put the factor of safety next to each number. Use the callout markers below rather than drawing the numbers into the image.
    aspect: 16/9
    points:
      - Shaft bending — ADD FS.
      - Tensile — ADD FS.
      - Torsional — ADD FS.
      - Shear tear-out — ADD FS.
      - Bolt pullout — ADD FS.
      - Face-seal clamping force — ADD FS.
  - section: What I did
    kind: diagram
    title: Release sequence
    takeaway: PLACEHOLDER COPY — rewrite.
    plan: >-
      Four frames: armed, signal received, actuating, released and ready to reset. Same section view each time so only the mechanism moves.
    aspect: 16/9
  - section: Outcome
    kind: photo
    title: Ocean test
    takeaway: PLACEHOLDER COPY — rewrite.
    plan: >-
      A photo from the 60 ft, 5-day deployment if you have one; otherwise the bench pressure test at 470 psi. Pick from portfolio-photos.
    aspect: 3/2
    points:
      - Version 1 pressure-tested to 470 psi with no leaks.
      - Released a 20 lb weight at 60 ft after 5 days in the ocean.
      - Achieved 2.25 FS on the release arm with an 80 lb weight.
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

* Version 1, vessel pressure-tested to 470 psi with no leaks!
* Successfully released a 20 lbs weight at 60 ft depth after 5 days in the ocean, proving adequate sealing and initial release reliability
* Achieved 2.25 FS on release arm with 80 lbs weight
* Additional testing to be carried out to prove maximum weight release at depth and duration underwater.
