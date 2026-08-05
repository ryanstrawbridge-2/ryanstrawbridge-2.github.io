---
title: Underwater Acoustic Release Mechanism
subtitle: Senior capstone — mechanical design lead
organization: Northeastern University
date: 2026-06-01T00:00:00.000Z
summary: Mechanical design lead on a low-cost acoustic release for ropeless fishing gear and scientific mooring recovery — a cam-and-pin rotary latch on a pressure-sealed rotating shaft.
hero: ../../assets/images/projects/acoustic-release/hero-latch-diagram.jpg
heroAlt: Diagram of a cam-and-pin rotary latch shown locked and released, alongside a section through the pressure-sealed rotating shaft with O-ring seals
tools:
  - Mechanical design
  - Structural analysis (Shigley's)
  - Ansys Mechanical
  - O-ring / pressure sealing
  - First-principles force analysis
order: 0
draft: true
---

## Problem

Fixed fishing gear is retrieved with vertical buoy lines, and those lines are what entangle whales. Ropeless systems avoid them by leaving the gear on the seabed and recovering it on command, but the acoustic releases that make this possible are expensive enough that switching over is a hard sell for a working fleet. The same mechanism recovers scientific moorings, where a failed release means losing the instruments.

A release has to hold a mooring load for months in seawater, then let go reliably on a single acoustic command, powered by a battery that has been sitting idle the whole time.

## What I did

* Own the mechanical design of the release as capstone design lead.
* Designed a **cam-and-pin rotary latch** so the cam body carries the mooring load directly. The actuator only has to rotate the cam, rather than hold the load, which keeps the required torque — and therefore the motor and battery — small.
* Used first-principles force analysis to evaluate the initial concepts and rule several out before committing to the latch geometry.
* Analysed the release shaft under **combined axial compression and torsion** following *Shigley's Mechanical Engineering Design*, since the shaft carries the load path and the actuation torque at the same time.
* Selected O-ring seal geometry from the **Parker O-Ring Handbook** for a rotating, pressure-sealed shaft interface — the hardest part of the housing, because the shaft has to turn on command after months static under external pressure.

## Outcome

Design work is ongoing. The latch geometry and shaft sizing are established from hand calculations, and I am building proficiency in **Ansys Mechanical** to validate those stress predictions on the housing and latch under combined pressure and mechanical loading.
