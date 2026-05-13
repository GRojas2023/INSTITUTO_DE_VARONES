---
name: Professional Admin System
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#42474f'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#727780'
  outline-variant: '#c2c7d1'
  surface-tint: '#2d6197'
  primary: '#00355f'
  on-primary: '#ffffff'
  primary-container: '#0f4c81'
  on-primary-container: '#8ebdf9'
  inverse-primary: '#a0c9ff'
  secondary: '#505f76'
  on-secondary: '#ffffff'
  secondary-container: '#d0e1fb'
  on-secondary-container: '#54647a'
  tertiary: '#532800'
  on-tertiary: '#ffffff'
  tertiary-container: '#743b00'
  on-tertiary-container: '#f9a767'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d2e4ff'
  primary-fixed-dim: '#a0c9ff'
  on-primary-fixed: '#001c37'
  on-primary-fixed-variant: '#07497d'
  secondary-fixed: '#d3e4fe'
  secondary-fixed-dim: '#b7c8e1'
  on-secondary-fixed: '#0b1c30'
  on-secondary-fixed-variant: '#38485d'
  tertiary-fixed: '#ffdcc4'
  tertiary-fixed-dim: '#ffb780'
  on-tertiary-fixed: '#2f1400'
  on-tertiary-fixed-variant: '#6f3800'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  table-data:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-padding: 24px
  gutter: 16px
  row-height-dense: 40px
  row-height-standard: 56px
---

## Brand & Style
The design system is engineered for high-utility administrative environments where clarity, speed, and reliability are paramount. It adopts a **Corporate Modern** aesthetic, prioritizing data density without sacrificing legibility. 

The brand personality is institutional yet contemporary—evoking feelings of stability and precision. By utilizing a minimalist framework, we remove visual noise, allowing users to focus entirely on task completion and data management. The interface relies on structural logic and clear hierarchies to guide the user through complex CRUD workflows effortlessly.

## Colors
The color palette of this design system is rooted in a deep **Corporate Blue** to establish authority and trust. 

- **Primary:** Used for main actions, active states, and brand presence.
- **Neutrals:** A sophisticated range of cool grays. Surfaces use the lightest tints to differentiate between the background workspace and functional containers.
- **Semantic Accents:** Green and Red are reserved strictly for status indicators (e.g., "Active", "Completed", "Error") and destructive actions. They are used with high-saturation for icons and low-saturation backgrounds to ensure they don't overwhelm the visual field.
- **Borders:** A consistent light gray (#E2E8F0) is used to define structure without creating heavy visual "cages" around data.

## Typography
This design system utilizes **Inter** for its exceptional legibility in data-heavy environments. The typographic scale is optimized for high information density.

For administrative efficiency, we differentiate between standard body text and "table-data." The latter uses a slightly smaller font size and tighter line height to allow more rows to be visible on screen. **Label-md** is utilized for form headers and table headers, using an uppercase style with increased letter spacing to provide a clear distinction from the data itself.

## Layout & Spacing
The design system employs a **12-column fluid grid** for the main content area, anchored by a fixed-width sidebar (240px). 

The spacing rhythm is based on a **4px/8px baseline**. 
- **Desktop:** 24px outer margins and 16px gutters between cards/modules.
- **Tablet:** 16px outer margins and 12px gutters.
- **Data Density:** In CRUD views, tables should utilize the `row-height-dense` (40px) to maximize the "above-the-fold" information. Standard forms and informational pages use `row-height-standard` to improve breathing room.

## Elevation & Depth
Visual hierarchy in this design system is achieved through **Tonal Layers** and **Low-Contrast Outlines**. 

The main application background is a neutral light gray (#F8FAFC). White surfaces (#FFFFFF) are "lifted" using a very subtle, highly diffused shadow (0px 1px 3px rgba(0,0,0,0.05)) and a soft 1px border. This creates a clear distinction between the "stage" (background) and the "work" (containers). 

Modals and dropdown menus use a slightly higher elevation with a more pronounced shadow to indicate they are temporary, interactive layers positioned above the primary workspace.

## Shapes
The shape language is professional and approachable. We use **Level 2 (Rounded)** settings to soften the industrial nature of data management.

- **Primary Containers/Cards:** 8px (0.5rem) corner radius.
- **Buttons and Inputs:** 6px radius to appear precise yet modern.
- **Tags/Status Pills:** Fully rounded (pill-shaped) to distinguish them from interactive buttons.
- **Selection Indicators:** Hard edges are strictly avoided to ensure the UI feels modern and fluid.

## Components
- **Data Tables:** Headers must remain sticky. Row hover states use a subtle tint (#F1F5F9). Use "Cell Rendering" for status tags, ensuring they are high-contrast for quick scanning.
- **Input Fields:** Use a 1px border that shifts to the Corporate Blue on focus. Labels are positioned above the input, never as placeholders, to maintain context.
- **Buttons:** Primary buttons are solid Blue. Secondary buttons use a light gray outline. Destructive actions (Delete) use a subtle red text-only or outlined style, turning solid red only on hover or confirmation.
- **Selects (Dropdowns):** Stylized with a custom chevron icon. The dropdown menu should match the card radius and include a subtle search bar if the list exceeds 8 items.
- **Status Pills:** Small, high-visibility badges. Green for "Success/Active," Red for "Error/Inactive," and Blue for "Neutral/Processing." 
- **Modals:** Centered, with a maximum width of 600px for forms to prevent line lengths from becoming unreadable.