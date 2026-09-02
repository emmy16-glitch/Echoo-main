---
version: alpha
name: "Echoo"
description: "A calm, operational Creator and Listener audio-broadcasting product with a deep-navy control-room identity."
colors:
  primary: "#0758F7"
  navy: "#031536"
  ink: "#071434"
  muted: "#52658E"
  live: "#D92D20"
  success: "#22C55E"
  surface: "#FFFFFF"
  border: "#CBD9F1"
typography:
  sans:
    fontFamily: "inherit"
  mono:
    fontFamily: "ui-monospace, monospace"
rounded:
  sm: "0.25rem"
  DEFAULT: "0.5rem"
  md: "0.625rem"
  lg: "1rem"
spacing:
  page-max: "none"
  section-gap: "1rem"
components:
  button: {}
  card: {}
  dialog: {}
  input: {}
---

# Echoo Design System

## Overview

### Creative North Star

Echoo should feel like a focused broadcast control room: dark, calm status surfaces for live state and clear, light work surfaces for controls.

### Product context and register

- **Audience and primary job:** Creators prepare and run live audio broadcasts; listeners receive the finished program mix.
- **Usage scene:** Dense desktop studio work where live state, source identity, and operational actions must remain clear at a glance.
- **Register:** Product-led and functional. The Creator Studio uses operational labels; Listener pages remain playback-first.
- **Memorable signature:** The deep navy live-status panel with restrained cobalt accents.
- **Restraint:** Live status may animate; routine controls and page chrome should not.
- **Token ownership/runtime mapping:** This document mirrors the component-local CSS tokens in `frontend/src/Components/CreatorStudio/CreatorBroadcastApproved.css`; it does not generate runtime tokens.

## Colors

`navy` is reserved for the live hero and high-attention broadcast state. `primary` is used for selected controls and actionable links. `live` is only a real on-air/destructive signal, `success` only signals genuine healthy connectivity, and light surfaces keep mixer controls readable. Borders are quiet blue-gray separators rather than elevation substitutes.

## Typography

The application uses its inherited sans-serif stack. Dense operational text stays compact and readable, with semibold labels; channel and broadcast names may use stronger weight but should not be replaced by decorative display typography. All-caps is reserved for short context labels such as `CHANNEL` and `LIVE`.

## Layout

Creator Studio uses a sidebar shell and responsive work surfaces. The Creator broadcast hero is a compact two-row status header: state and a live-only ticker above real metadata, with the same structure retained off air. Metadata moves to three columns at medium widths and two columns on small screens. Mixer cards preserve a consistent source-to-master order.

## Elevation & Depth

Use light borders and restrained shadows for cards. The live hero may use a shallow navy shadow to distinguish active broadcast state. Do not stack modal-like elevation for ordinary panels.

## Shapes

Cards use modest rounded corners (roughly 10–16px); compact controls use smaller radii. Pills are reserved for concise status only.

## Components

### Foundational visual states

Interactive controls must retain visible focus, disabled, busy, and selected states. Status signals must originate from real application state; never show a recording, connection, or listener state speculatively.

### Buttons and actions

Use existing outlined secondary buttons for utility actions and a separated red destructive action for ending a broadcast. Avoid duplicate calls to action for the same operation.

### Navigation and data display

Keep Creator terminology singular where the product has one canonical Channel. Channel name, artwork, and category come from the canonical station record; broadcast titles stay distinct.

### Motion

Motion communicates live state only: the Live dot may breathe and the live-only status ticker can move linearly. Honor `prefers-reduced-motion` by stopping nonessential animation.

## Do's and Don'ts

- **Do:** Keep the final stereo program mix canonical from Creator input through LiveKit to Listener playback.
- **Do:** Use the existing card, button, dialog, and spacing patterns for Creator Studio changes.
- **Don't:** Add visual clutter or speculative diagnostics to the Listener experience.
- **Don't:** Use the broadcast title as a replacement for the canonical Channel identity.
