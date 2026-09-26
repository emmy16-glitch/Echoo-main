---
name: Echoo
description: Audio-first live broadcasting UI with calm operational precision.
colors:
  primary: "#245CFF"
  primary-hover: "#1F4FDB"
  primary-soft: "#EDF2FF"
  ink: "#0B1D3A"
  text: "#40516B"
  muted: "#77849A"
  canvas: "#F7F9FC"
  surface: "#FFFFFF"
  line: "#E7EDF7"
  success: "#12B76A"
  danger: "#D92D20"
typography:
  display:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.55rem, 4vw, 4.25rem)"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  body:
    fontFamily: "Source Sans 3, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.125rem"
spacing:
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "42px"
---

# Design System: Echoo

## Overview

**Creative North Star: "Signal Precision"**

Echoo should feel like a trustworthy broadcast control surface: calm, exact and fast to scan while a creator is live. Brand expression comes from disciplined blue accents, strong information hierarchy and purposeful status colors rather than decoration.

Creator and Listener surfaces share one visual vocabulary. Dense operational screens stay restrained; the strongest visual emphasis is reserved for live state, primary actions and recovery problems.

**Key Characteristics:**
- Echoo blue is singular and consistent across Creator, Listener and shared controls.
- Typography has three jobs: Space Grotesk for hierarchy, Manrope for controls, Source Sans 3 for reading.
- White surfaces sit on a very light cool canvas with restrained borders and shadows.
- Recovery/error states are explicit and readable, never decorative.

## Colors

Primary blue carries interactive emphasis and brand recognition. Navy ink anchors headings and broadcast-state information; green and red are reserved for status semantics.

**The One Blue Rule.** New UI must consume the canonical Echoo brand tokens instead of introducing another route-local blue.

## Typography

**Display Font:** Space Grotesk  
**Body Font:** Source Sans 3  
**Control Font:** Manrope

**Character:** Technical without looking like developer tooling. Headings are compact and confident, controls are highly scannable, and long-form copy stays neutral and legible.

**The Role Rule.** Headings, controls and body copy have separate font roles; do not flatten the whole product back to one hard-coded family.

## Layout

Echoo is an operational product. Preserve the existing Creator Studio and Listener shell geometry, prioritize viewport-safe live controls, and keep responsive states readable before adding decorative movement.

## Elevation & Depth

Use light borders and low ambient shadows. Depth exists to separate working surfaces, popovers and the persistent player from the canvas; it should not make cards look floaty.

## Shapes

Controls and cards use the existing restrained rounded system. Pills are appropriate for compact status and filtering controls, not as a default container shape.

## Components

Primary actions use Echoo blue with white text. Secondary controls stay quiet until hover/focus. Live and recovery surfaces must expose meaningful textual status in addition to color.

## Authentication

Authentication is Echoo's atmospheric exception to the light application canvas. Login, signup and password recovery reuse the original Figma studio photograph in `frontend/src/Components/Assets/echoo-auth-cinematic-headphones.jpeg` with a deep navy readability wash and restrained glass surface.

- The photograph supplies the warm orange/red studio light; interactive UI remains Echoo blue.
- Authentication must never become a wall in front of public Listener discovery or public live playback.
- Account prompts belong to account-dependent actions such as following, saving, history, notifications and creator tools.
- Keep authentication copy quiet and functional: visible labels, minimal placeholders, inline recovery, and a clear route back to public listening.

## Creator language and recovery

Creator-facing UI describes the creator's outcome, not Echoo's infrastructure.

- Say **Recording safe**, **Saved to Echoo**, **Device copy**, **Finishing in the background**, and **Retry Echoo save**.
- Do not expose routine terms such as server copy, server save, FFmpeg, OPFS, egress, chunk upload, or storage reconciliation in normal creator flows.
- After **End Broadcast**, return the studio to OFF AIR as soon as listener audio has stopped. Recording finalization and recovery may continue in the background with a small truthful status.
- A recovered local recording is a protected recovery state, not an error state. Keep save/retry/discard actions available without presenting it as data loss.
- Technical diagnostics belong in logs, health tools, or an explicit troubleshooting/details surface.

## Do's and Don'ts

### Do:
- **Do** use canonical design tokens for brand, text, borders and status colors.
- **Do** keep live/reconnect/error states obvious on desktop and mobile.
- **Do** preserve the existing Echoo logo and light broadcast-console character.

### Don't:
- **Don't** add a new blue, font stack or spacing vocabulary inside a route.
- **Don't** hide recovery actions behind color alone.
- **Don't** add decorative UI that competes with live controls, meters or recording state.
