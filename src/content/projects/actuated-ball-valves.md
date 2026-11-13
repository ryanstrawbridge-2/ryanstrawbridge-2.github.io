---
title: Actuated Ball Valves
organization: AerospaceNU - Propulsion Feed System Team
date: 2026-07-01T20:33:39.914Z
summary: Designing an actuated ball-valve pressurant regulation system for a liquid rocket engine test stand to replace an oversized pressure-regulator architecture and improve upon a previous needle-valve/stepper-motor design limited by low flow capacity and high breakaway torque.
hero: ../../assets/images/projects/actuated-ball-valves/hero-valve-torque-coupling.png
heroAlt: Ball Valve and torque coupling
tools:
  - Mechanical design
  - SolidWorks Sheet Metal
  - PID Controls
  - Fluid System Design
order: 3
gallery:
  - image: ../../assets/images/projects/actuated-ball-valves/printed-fixture.jpeg
    alt: 3D Printed Jig
    focal: 53% 60%
figures:
  - section: Problem
    kind: diagram
    title: Where the valve sits in the feed system
    takeaway: P&ID
    plan: >-
      Flow schematic, left to right: pressurant tank, fill/vent, the position a regulator would occupy (crossed out), the actuated ball valve, then the injector. Label the pressures you know at each station.
    aspect: 16/9
    points: []
    image: ../../assets/images/projects/actuated-ball-valves/actuated-ball-valves-diagram-3.png
  - section: Outcome
    kind: data
    title: Commanded position across different pressure differentials
    takeaway: Breakaway Torque Testing
    plan: >-
      The plot you already made. Current on Y, commanded position on X, one series per test pressure up to 2300 psi. Mark the actuation threshold.
    aspect: 16/9
    points: []
    image: ../../assets/images/projects/actuated-ball-valves/actuated-ball-valves-pump-test-4.png
heroFocalPoint: 37% 51%
heroAspect: standard
---

## Problem

* Pressure regulators are too heavy to fly
* Previous needle valve/stepper motor design had too low Cv and high breaking torque.

## What I did
* Derived a required torque from differential pressure, seat friction, and port geometry, and identified the need for additional margin to account for seat creep and breakaway torque not captured by the simplified model
* Evaluating a high-torque RC servo under pressure to determine signal control, and position-feedback limitations in pressurized state before waterflow testing
* Designed 3D printed test jig mechanical design for bench testing and water flow

## Outcome
* Successful actuation under 2300 psi delta
* Commanded postion vs current at range of pressures to be tested and plotted to inform intial parameters
