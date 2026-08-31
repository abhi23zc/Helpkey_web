---
name: Executive Reserve
colors:
  surface: '#f9f9ff'
  surface-dim: '#d3daef'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f3ff'
  surface-container: '#e9edff'
  surface-container-high: '#e1e8fd'
  surface-container-highest: '#dce2f7'
  on-surface: '#141b2b'
  on-surface-variant: '#44474d'
  inverse-surface: '#293040'
  inverse-on-surface: '#edf0ff'
  outline: '#75777e'
  outline-variant: '#c4c6ce'
  surface-tint: '#4d5f7d'
  primary: '#000615'
  on-primary: '#ffffff'
  primary-container: '#0b1f3a'
  on-primary-container: '#7587a7'
  inverse-primary: '#b5c7ea'
  secondary: '#755a1a'
  on-secondary: '#ffffff'
  secondary-container: '#fed88b'
  on-secondary-container: '#785d1c'
  tertiary: '#050605'
  on-tertiary: '#ffffff'
  tertiary-container: '#1e1f1d'
  on-tertiary-container: '#868783'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d6e3ff'
  primary-fixed-dim: '#b5c7ea'
  on-primary-fixed: '#071c36'
  on-primary-fixed-variant: '#364764'
  secondary-fixed: '#ffdf9f'
  secondary-fixed-dim: '#e6c277'
  on-secondary-fixed: '#261a00'
  on-secondary-fixed-variant: '#5b4302'
  tertiary-fixed: '#e3e2df'
  tertiary-fixed-dim: '#c7c7c3'
  on-tertiary-fixed: '#1b1c1a'
  on-tertiary-fixed-variant: '#464744'
  background: '#f9f9ff'
  on-background: '#141b2b'
  surface-variant: '#dce2f7'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  price-display:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: '1.0'
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: 0.01em
  caption:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.4'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
  section-gap: 64px
---

## Brand & Style

The design system is engineered for the discerning business traveler, blending the reliability of a high-end corporate tool with the warmth of luxury hospitality. It evokes a sense of "Effortless Precision"—where every interaction feels deliberate, polished, and premium.

The visual style is **Corporate / Modern** with a refined editorial edge. It prioritizes clarity through generous whitespace, high-contrast typography, and a "warm-neutral" base that moves away from sterile whites toward a more sophisticated ivory palette. Surfaces are treated with subtle depth, avoiding flat aesthetics in favor of a layered, tangible feel that suggests quality and permanence.

## Colors

The color strategy uses a deep **Midnight Navy** to establish authority and trust, while **Champagne Gold** is reserved strictly for value-driven signals: star ratings, premium tier badges, and subtle logo accents. 

**Warm Ivory** serves as the primary canvas, creating a softer visual experience than pure white, which can feel clinical. **Pure White** is utilized for elevated components like cards and search inputs to create a clear "layering" effect. Text hierarchy is maintained through high-contrast charcoal for readability and medium-gray for metadata.

## Typography

This design system utilizes **Plus Jakarta Sans** for its modern, clean geometric proportions that remain legible even at smaller scale. Headlines are bold and confident, using tight letter-spacing to command attention. 

For the "Premium" feel, prices are treated as primary visual elements with increased weight and size. Body copy maintains a generous line height (1.5 - 1.6) to ensure high readability during long research sessions. Uppercase tracking is applied sparingly to small labels and category tags to add a touch of formal structure.

## Layout & Spacing

The layout follows a **Fixed Grid** approach for desktop (1280px max-width) to ensure content remains centered and readable on ultra-wide monitors. It utilizes a 12-column system with 24px gutters.

- **Desktop:** 12 columns, 40px side margins.
- **Tablet:** 8 columns, 24px side margins.
- **Mobile:** 4 columns, 16px side margins.

A strict 8px spacing scale governs all internal component padding. Vertical rhythm is emphasized with large gaps (64px+) between major sections to prevent visual clutter and maintain the premium, "breathable" atmosphere.

## Elevation & Depth

Hierarchy is established through **Tonal Layering** supplemented by soft, sophisticated shadows. 

1. **Base Layer:** Warm Ivory (#F8F7F3) background.
2. **Surface Layer:** White (#FFFFFF) cards and containers use a very soft, diffused shadow (`0 4px 20px rgba(11, 31, 58, 0.04)`) to appear "lifted" from the ivory base.
3. **Interactive Layer:** Active inputs or hovered cards increase shadow depth (`0 12px 32px rgba(11, 31, 58, 0.08)`) and may feature a subtle 1px border in Midnight Navy or Champagne Gold.

Avoid heavy black shadows. All shadows should carry a hint of the primary Navy color to keep the palette cohesive.

## Shapes

The shape language is **Rounded**, striking a balance between the friendliness of a travel app and the structure of a business tool. 

- **Standard Radius (8px):** Primary buttons, input fields, and small UI elements.
- **Large Radius (16px):** Hotel cards, search panels, and modals.
- **Pill (Full):** Segmented toggles (e.g., Business vs. Family), status tags, and "Favorite" buttons.

This varied approach creates a hierarchy of containment, where larger containers feel softer and more inviting, while functional elements feel precise.

## Components

### Buttons
- **Primary:** Midnight Navy background, White text. High-contrast, 8px corner radius.
- **Secondary:** Transparent background, Midnight Navy border (1px), Navy text.
- **CTA:** For high-conversion moments (e.g., "Book Now"), use Midnight Navy with a bold, slightly larger font.

### Hotel Cards
Cards are the centerpiece. Use a 16px radius. Images should have a subtle inner-glow to prevent them from looking "flat." Prices are positioned in the bottom-right for easy scanning.

### Search Panels
The search bar is a single, elevated White container with 16px radius. Internal dividers should be 1px wide using the #E5E1D8 border color. Icons (London, Date, Guests) use the Navy color at 70% opacity.

### Trust Labels & Tags
- **Verified Stay:** Success Green (#2F7D5C) text with a small checkmark icon.
- **Free Cancellation:** Muted Grey (#6B7280) text with a 1px vertical divider.
- **Premium Tier:** Champagne Gold (#D6B36A) used for star ratings and "Luxury" categories.

### Segment Toggles
Use a pill-shaped container with a subtle background (#F3F4F6). The active state is a Midnight Navy pill that "slides" behind the text, turning the text White.