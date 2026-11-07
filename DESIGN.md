---
name: Rome Pay
description: USDC payment links on Rome, drawn as a metro route from the payer's wallet to the merchant.
colors:
  enamel: "#0f1d3a"
  enamel-deep: "#0a1530"
  enamel-raised: "#142650"
  porcelain: "#f5f6f2"
  ink: "#0f1d3a"
  ink-muted: "#46506a"
  text: "#f5f6f2"
  text-muted: "#a9b3c7"
  rule: "rgba(245, 246, 242, 0.22)"
  rule-strong: "rgba(245, 246, 242, 0.5)"
  cobalt: "#2a62e0"
  cobalt-text: "#8fb0ff"
  green: "#1f9d61"
  green-text: "#5fd39a"
  amber: "#f2a900"
  scarlet: "#d7263d"
  scarlet-text: "#ff8e99"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(4.5rem, 16vw, 9rem)"
    fontWeight: 600
    lineHeight: 0.85
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(1.75rem, 4.5vw, 2.75rem)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.01em"
  title:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "0.02em"
  button:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    letterSpacing: "0.04em"
  label:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    letterSpacing: "0.08em"
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "\"tnum\""
  body-small:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.4
  data:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.9375rem"
    fontWeight: 400
rounded:
  tag: "2px"
  base: "4px"
  round: "50%"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
  s7: "48px"
  s8: "64px"
components:
  button-next-station-evm:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.porcelain}"
    typography: "{typography.button}"
    rounded: "{rounded.base}"
    padding: "12px 24px"
    height: "64px"
    width: "100%"
  button-next-station-solana:
    backgroundColor: "{colors.green}"
    textColor: "{colors.enamel}"
    typography: "{typography.button}"
    rounded: "{rounded.base}"
    padding: "12px 24px"
    height: "64px"
    width: "100%"
  button-next-station-busy:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.enamel}"
  button-next-station-idle:
    backgroundColor: "{colors.enamel-raised}"
    textColor: "{colors.text-muted}"
  line-badge:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.base}"
    padding: "12px 16px"
    height: "72px"
  line-badge-selected:
    backgroundColor: "{colors.enamel-raised}"
  destination-plate:
    backgroundColor: "{colors.porcelain}"
    textColor: "{colors.ink}"
    rounded: "{rounded.base}"
    padding: "24px"
  network-tag:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.base}"
    padding: "4px 12px"
  testnet-flag:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.enamel}"
    rounded: "{rounded.tag}"
    padding: "0 8px"
  demo-tag:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.tag}"
    padding: "0 8px"
---

# Design System: Rome Pay

## Overview

**Creative North Star: "Interchange"**

A payment is a ride on a transit map. The payer's wallet is a line; its setup steps are stations; the PayRouter contract is the interchange where the MetaMask and Solflare lines meet; the merchant is the terminus. Everything is drawn as flat signage on a midnight enamel wall: condensed capitals, round station marks, coloured line segments, a porcelain destination plate. Nothing glows, floats, or blurs.

The surface is dense with real information (amounts, fees, signature counts, hashes) but ordered like a platform sign: the destination plate first, then the line choice, then the route, then one large button that clears the next station. The colour of a line means the wallet; amber means something is happening now; scarlet means something failed. Those meanings never move.

**Key Characteristics:**
- Midnight enamel wall with a single porcelain plate as the only light surface.
- One lane colour at a time, set by `data-lane`, painting the route, the selected badge, and the primary button.
- Station marks carry all step state; the name plates beside them never change wording.
- Condensed transit capitals for every heading, label and button; mono only for data.
- Flat: depth comes from tone (enamel-deep, enamel, enamel-raised, porcelain), never from shadow.

## Colors

A dark transit palette: one enamel wall, one porcelain plate, two line colours for the two wallets, and two signal colours reserved for state.

### Primary
- **MetaMask Cobalt** (cobalt): the EVM lane's line, its selected badge border, and its next-station button fill (porcelain text, 4.9:1). For small text on enamel use **Cobalt Signal Text** (cobalt-text).
- **Solflare Green** (green): the Solana lane's line, badge and button. Button text on green is midnight enamel, not white (4.8:1). For small text on enamel use **Green Signal Text** (green-text).

### Tertiary
- **Pending Amber** (amber): work in progress only. Busy station marks, the busy button, the testnet flag, funding notices, the focus ring, text selection and caret.
- **Failure Scarlet** (scarlet): failed station strike and the error box border. Text in failure colour uses **Scarlet Signal Text** (scarlet-text).

### Neutral
- **Midnight Enamel** (enamel): the page wall, the hollow interior of station marks, and text on porcelain (as ink) and on green and amber fills.
- **Deep Enamel** (enamel-deep): scrollbar track; the darkest recess.
- **Raised Enamel** (enamel-raised): hover and selected fill of line badges; the idle button before a line is chosen.
- **Station Porcelain** (porcelain): the destination plate, done station marks, the interchange ring, the terminus bar, and primary text on enamel.
- **Plate Ink Muted** (ink-muted): memo and meta labels on the porcelain plate (7.4:1).
- **Signage Grey** (text-muted): secondary text, section titles, idle station states on enamel (8:1).
- **Hairline** (rule) and **Strong Hairline** (rule-strong): section dividers and unselected badge/network borders respectively.

### Named Rules
**The Lane Owns the Colour Rule.** Exactly one lane colour is live on a screen, set by `[data-lane]` on the page (`--line`, `--line-ink`, `--line-text`). Cobalt and green appear together only where both lines are drawn: the schematic and the other-wallet stub at the interchange.

**The Signal Reservation Rule.** Amber means "in progress or needs attention", scarlet means "failed". Neither is decoration, and neither is used for a lane.

**The Ink on Green Rule.** Text on a green fill is midnight enamel; text on cobalt is porcelain. Never white on green.

## Typography

**Display Font:** Barlow Condensed (with Arial Narrow, sans-serif), weights 500 to 700
**Body Font:** Barlow (with system-ui, sans-serif), weights 400 to 600
**Label/Mono Font:** IBM Plex Mono (with ui-monospace), weights 400 and 500

**Character:** Condensed transit capitals do the talking, like station signage; Barlow carries plain explanatory sentences; Plex Mono is the readout for machine values. Tabular numerals are on globally.

### Hierarchy
- **Display** (600, clamp 4.5 to 9rem, line-height 0.85): the payment amount on the destination plate only, with the unit "USDC" beside it at clamp 1.5 to 2.25rem.
- **Headline** (700, clamp 1.75 to 2.75rem, line-height 1, uppercase, balanced): the merchant name, the page h1.
- **Title** (600, 1.375rem, line-height 1.1, uppercase): station names and line badge titles. The arrival line uses 1.75rem.
- **Button** (700, 1.5rem, 0.04em, uppercase): the next-station button and the wordmark.
- **Label** (600, 0.875 to 1.125rem, 0.06 to 0.08em, uppercase): definition terms, station state words, section titles, network and demo tags.
- **Body** (400, 1rem, line-height 1.5): sentences; 0.9375rem for station descriptions (max 34ch), badge detail and footer (max 68ch).
- **Data** (Plex Mono 400, 0.9375rem; 0.875rem in the transaction log): addresses, hashes, references, amounts, fee percentages.

### Named Rules
**The Signage Caps Rule.** Every heading, label, state word and button is Barlow Condensed in uppercase with positive tracking. Body sentences are never uppercase.

**The Readout Rule.** Mono is for addresses, hashes, amounts and counts only. Readout amounts carry the unit "USDC".

## Layout

Single column inside a 1120px wrap with a fluid gutter (clamp 16px, 4vw, 40px). Vertical rhythm on the 4px-based scale (s1 to s8); main sections are separated by 32px gaps and 1px hairline rules. Order is fixed: header, destination plate, line picker, route, next-station action, live readout, footer.

Breakpoints: at 720px the line badges go two-up and the schematic switches from its narrow to its wide geometry (separate SVGs, not a scaled one). At 860px the plate puts amount beside the merchant and the route turns from a vertical line on the left to a horizontal line across the top of equal columns. Below 860px, once a lane is chosen, the next-station action becomes a sticky bottom bar (enamel, top hairline, safe-area padding), and choosing a line scrolls the route into view (instantly under reduced motion).

## Elevation & Depth

Flat. There are no drop shadows, glows or blurs. Depth is tonal: deep enamel recess, enamel wall, raised enamel for interaction, porcelain for the one destination plate. `box-shadow` appears only as stroke geometry: the 2px inset outline that draws a hollow track segment, and the 3px porcelain ring around the docked terminus bar.

### Named Rules
**The No Glow Rule.** Light comes from porcelain and line colour, never from shadow, gradient or blur.

## Shapes

Small squared corners: 4px on the plate, badges, buttons, notices; 2px on inline tags. Circles are reserved for station marks, the badge bullet and the spinner. Lines are 6px bars (8px strokes in the schematic) bending only at 45 and 90 degrees. Station grammar:

- **To do:** hollow ring (enamel fill, 5px line-colour border).
- **Done:** porcelain fill inside the line-colour ring.
- **Done earlier (skip):** muted grey fill and border.
- **In progress:** solid amber.
- **Failed:** scarlet ring with a 45 degree scarlet strike through it.
- **Interchange (PayRouter):** larger 40px porcelain ring with a 7px border; fills with the line colour when done, amber when busy; the other wallet's line enters it as a 45 degree stub.
- **Terminus (merchant):** a 12 by 44px porcelain bar across the line; takes the line colour with a porcelain ring on arrival.
- **Track segments:** always line-coloured; hollow (outlined) until the station before them is cleared, then solid.

## Components

### Buttons
Signage, not a soft pill: one full-width slab that names the next station.
- **Shape:** squared corners (4px), 64px tall, full width.
- **Primary (next station):** fill is the lane colour, text is `--line-ink`, Button type, trailing square-capped arrow. Labels are verbs with amounts ("Approve 0.10 wUSDC", "Pay 0.10 USDC").
- **Idle:** raised enamel with grey text before a line is chosen.
- **Busy:** amber fill, enamel text, leading spinner, no arrow.
- **Hover / Active / Focus:** brightness 1.1 and arrow nudges 3px right; 1px press; global amber focus ring (2px, offset 3px).
- One primary action per view; there is no secondary button style.

### Line Badges (radio)
- **Style:** transparent, 1px strong hairline border, 72px min height; 40px bullet (porcelain disc in a 6px lane-colour ring) holding the wallet icon; condensed title "<Wallet> line", detail sentence, status word.
- **States:** hover takes the lane-colour border and raised enamel fill; selected is a 2px lane-colour border on raised enamel; disabled at 50% opacity while a step runs.

### Destination Plate
- **Corner Style:** 4px. **Background:** porcelain with ink text. **Padding:** 24px, 32px from 860px.
- Merchant headline, memo (optional outlined "Demo invoice" tag), the display amount, then a 2px ink rule over a meta grid (Paid to, Reference, Fee) with mono values. Focus ring inside the plate switches to ink.

### Tags
- **Network tag:** strong-hairline outlined label; an inline amber "Testnet" flag with enamel text.
- **Demo tag:** 1px ink outline on porcelain, label type.

### Notices
Outlined boxes (1px, 4px radius, 12 to 16px padding): amber border for the wallet-gap note and funding shortfall, scarlet border plus a struck-circle icon for errors. No filled alert backgrounds.

### Route Map (signature)
An ordered list of stations, each a 28px track column plus a name plate (title, description, cost line in text face, state word). Plates are fixed text; only the mark and state word change. Before a line is chosen, the Schematic shows both lines converging on the PayRouter ring and running to the merchant bar.

### Motion
One motion moment: on arrival the line sweeps into the terminus (scale 0 to 1 along the line, 900ms, ease-out cubic-bezier(0.22, 1, 0.36, 1)), then the terminus docks into the line colour (300ms, 700ms delay). Interaction transitions are 120 to 160ms. `prefers-reduced-motion` collapses all animation and transition to near zero.

### Live Readout
Label/value grid (auto-fill, min 180px) followed by a transaction log: condensed station name on the left, mono short hash linking to the explorer on the right, hairline rows. Links in readout, log, funding and footer have 44px hit areas and thicken their underline on hover.

## Do's and Don'ts

### Do:
- **Do** set lane colour through `[data-lane]` and the `--line`, `--line-ink`, `--line-text` variables, never by hard-coding cobalt or green in a component.
- **Do** put midnight enamel text on green and amber fills, porcelain text on cobalt.
- **Do** express step state only through the station mark grammar (hollow, porcelain, muted, amber, scarlet strike) plus the state word.
- **Do** keep one full-width next-station button per view, sticky on phones under 860px.
- **Do** keep every target at least 44px and keep the amber 2px focus ring (ink inside the porcelain plate).
- **Do** keep the arrival sweep the only expressive animation, and honour `prefers-reduced-motion`.
- **Do** write UI copy in English, with exact amounts and the unit "USDC" or "wUSDC".

### Don't:
- **Don't** add drop shadows, glows, gradients or blur; depth is tonal.
- **Don't** use amber or scarlet for anything but pending and failed (amber also marks focus and testnet).
- **Don't** show both lane colours as competing accents outside the schematic and the interchange stub.
- **Don't** set sentences, prose states or labels in mono.
- **Don't** round corners beyond 4px or use pill buttons; circles belong to station marks.
- **Don't** bend lines at angles other than 45 and 90 degrees.
