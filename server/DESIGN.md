# Design System — Podcast Clip Generator

## Product Context
- **What this is:** AI-powered podcast/video clip generator that transcribes long-form content, detects Q&A segments, and exports short clips for social media
- **Who it's for:** Content creators, podcasters, marketers who repurpose long-form video into TikTok, Reels, Shorts
- **Space/industry:** Creator tools, AI video editing, social media automation
- **Project type:** React web app with dashboard/editor interface

## Aesthetic Direction
- **Direction:** Creative Professional — clean but warm, tool-for-creators not AI-magic
- **Decoration level:** Intentional — subtle gradients, thoughtful shadows, not flat but not busy
- **Mood:** Friendly, capable, polished. You're the warm creator tool, not the cold AI factory.
- **Reference sites:** Descript (polish), Riverside (professionalism), but differentiated with coral orange

## Typography
- **Display/Hero:** Plus Jakarta Sans ExtraBold 800 — modern geometric sans with friendly curves, excellent at large sizes
- **Body:** Plus Jakarta Sans Regular 400 / Medium 500 — same family for cohesion, highly readable
- **UI/Labels:** Plus Jakarta Sans Medium 500 / SemiBold 600 — buttons, chips, navigation
- **Data/Tables:** Plus Jakarta Sans with `tabular-nums` CSS — timestamps, durations, scores
- **Code/Mono:** JetBrains Mono — technical details, timecodes in editor

**Font Loading:**
```html
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

**Type Scale:**
| Name | Size | Weight | Use |
|------|------|--------|-----|
| 4xl | 64px / 3.75rem | 800 | Hero headlines |
| 3xl | 48px / 3rem | 800 | Page titles |
| 2xl | 36px / 2.25rem | 700 | Section headers |
| xl | 24px / 1.5rem | 600 | Card titles |
| lg | 18px / 1.125rem | 500 | Subtitles |
| md | 16px / 1rem | 400 | Body default |
| sm | 14px / 0.875rem | 400 | Captions, hints |
| xs | 12px / 0.75rem | 500 | Chips, timestamps |

## Color
- **Approach:** Balanced — primary coral for actions, indigo for contrast, warm neutrals throughout

**Primary Palette:**
| Name | Hex | Usage |
|------|-----|-------|
| Primary | `#FF6B3F` | Main CTAs, active states, links |
| Primary Hover | `#E85D2F` | Button hover, active links |
| Primary Light | `#FFECE6` | Subtle backgrounds, selection tints |

**Secondary:**
| Name | Hex | Usage |
|------|-----|-------|
| Secondary | `#6366F1` | Accent actions, highlights (use sparingly) |
| Secondary Light | `#EEF0FF` | Accent backgrounds |

**Neutrals (Warm Gray Scale):**
| Name | Hex | Usage |
|------|-----|-------|
| 50 | `#FAFAF9` | Page background |
| 100 | `#F5F5F4` | Card backgrounds, alternate rows |
| 200 | `#E7E7E5` | Borders, dividers |
| 300 | `#D6D6D4` | Disabled borders |
| 400 | `#A8A8A6` | Disabled text |
| 500 | `#787876` | Secondary text |
| 600 | `#525250` | Body text |
| 700 | `#40403F` | Headlines on light bg |
| 800 | `#292928` | Primary text |
| 900 | `#0D0D0C` | Highest contrast text |

**Semantic Colors:**
| Name | Hex | Usage |
|------|-----|-------|
| Success | `#10B981` | Positive actions, high scores, completion |
| Warning | `#F59E0B` | Caution, medium priority, processing |
| Error | `#EF4444` | Destructive actions, failures, low scores |
| Info | `#3B82F6` | Neutral information, tips |

**Dark Mode Strategy:**
- Swap neutral scale (50→900, 900→50)
- Reduce primary saturation by 10%: `#FF5A2F`
- Reduce shadow opacity by 50%
- Maintain contrast ratios for WCAG AA

## Spacing
- **Base unit:** 8px
- **Density:** Comfortable — creators spend hours here; breathing room = premium feel

**Scale:**
| Name | Value | Usage |
|------|-------|-------|
| 0 | 0px | No spacing |
| 1 | 4px | Tight icon spacing |
| 2 | 8px | Default element gap |
| 3 | 12px | Comfortable padding |
| 4 | 16px | Card padding, input padding |
| 5 | 20px | Component internal spacing |
| 6 | 24px | Section padding |
| 8 | 32px | Large section gap |
| 10 | 40px | Page sections |
| 12 | 48px | Major divisions |
| 16 | 64px | Page-level spacing |

## Layout
- **Approach:** Grid-disciplined with creative moments — predictable structure for editor, personality in marketing
- **Max content width:** 1200px
- **Breakpoints:**
  - Mobile: `< 640px` (single column, full-width cards)
  - Tablet: `640-1024px` (2-column grid)
  - Desktop: `> 1024px` (3-column, full layout)

**Border Radius Scale:**
| Name | Value | Usage |
|------|-------|-------|
| sm | 4px | Chips, small buttons, tags |
| md | 8px | Cards, inputs, standard buttons |
| lg | 12px | Large cards, modals, dropdowns |
| xl | 16px | Feature sections, hero areas |
| full | 9999px | Pills, toggles, round buttons |

**Shadows:**
| Name | Value | Usage |
|------|-------|-------|
| sm | `0 1px 2px rgba(0,0,0,0.05)` | Subtle cards, default state |
| md | `0 4px 12px rgba(0,0,0,0.10)` | Hover states, elevated cards |
| lg | `0 8px 24px rgba(0,0,0,0.15)` | Modals, dropdowns, popovers |
| xl | `0 12px 48px rgba(0,0,0,0.20)` | Elevated overlays, focus modals |

## Motion
- **Approach:** Intentional — smooth transitions that feel polished, not flashy. Every animation serves comprehension.

**Easing:**
| Name | Value | Usage |
|------|-------|-------|
| enter | `cubic-bezier(0.16, 1, 0.3, 1)` | Elements entering (cards, modals) |
| exit | `cubic-bezier(0.16, 1, 0.3, 1)` | Elements exiting (fade out) |
| move | `cubic-bezier(0.4, 0, 0.2, 1)` | Positional changes (sort, reorder) |

**Duration:**
| Name | Value | Usage |
|------|-------|-------|
| micro | 100ms | Hover, focus states |
| short | 200ms | Button press, toggle |
| medium | 300ms | Card enter, modal open |
| long | 500ms | Page transitions, complex |

**Reduced Motion:**
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Component Patterns

### Buttons
```css
.btn {
  padding: 12px 24px;        /* space-3 × space-6 */
  border-radius: 8px;        /* md */
  font-weight: 600;          /* SemiBold */
  font-size: 15px;
  transition: all 200ms ease;
}

.btn-primary {
  background: #FF6B3F;
  color: white;
}

.btn-primary:hover {
  background: #E85D2F;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.10);
}
```

### Cards
```css
.card {
  background: white;
  border-radius: 12px;       /* lg */
  padding: 24px;             /* space-6 */
  border: 1px solid #E7E7E5; /* neutral-200 */
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  transition: box-shadow 300ms ease;
}

.card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.10);
}

.card.selected {
  border-color: #10B981;     /* success */
  background: #F0FDF4;       /* success light tint */
}
```

### Inputs
```css
.input {
  padding: 12px 16px;        /* space-3 × space-4 */
  border: 1px solid #D6D6D4; /* neutral-300 */
  border-radius: 8px;        /* md */
  font-size: 15px;
  font-family: 'Plus Jakarta Sans', sans-serif;
  transition: border-color 150ms ease;
}

.input:focus {
  outline: none;
  border-color: #FF6B3F;     /* primary */
  box-shadow: 0 0 0 3px #FFECE6; /* primary-light */
}
```

### Chips/Badges
```css
.chip {
  display: inline-block;
  padding: 4px 12px;         /* space-1 × space-3 */
  border-radius: 9999px;     /* full */
  font-size: 12px;
  font-weight: 600;
}

.chip-success {
  background: #D1FAE5;
  color: #059669;
}
```

## Icon System
- **Library:** Phosphor Icons (`@phosphor-icons/react`)
- **Usage:** Replace ALL emoji with SVG icons
- **Size:** 20px for inline, 24px for standalone

**Replacements:**
| Emoji | Phosphor Icon |
|-------|---------------|
| 📺 | `<VideoCamera />` |
| 📁 | `<UploadSimple />` |
| 📥 | `<DownloadSimple />` |
| ⏳ | `<Clock />` |
| 🎯 | `<Target />` |
| ✓ | `<Check />` |
| 👁️ | `<Eye />` |
| ⏱️ | `<Timer />` |
| 📱 | `<DeviceMobile />` |
| 📸 | `<Camera />` |
| ▶️ | `<Play />` |
| 📹 | `<Video />` |
| ⬜ | `<Square />` |
| 🖥️ | `<Monitor />` |

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-23 | Coral orange primary (#FF6B3F) | Differentiate from purple-heavy competitors (Descript, OpusClip). Warm, creative, energetic — fits creator audience |
| 2026-03-23 | Plus Jakarta Sans over Inter | Inter is overused in SaaS. Jakarta Sans equally readable but more distinctive and friendly |
| 2026-03-23 | Comfortable density (8px base) | Creators spend hours editing — breathing room = premium feel. Avoid cramped UI |
| 2026-03-23 | Phosphor Icons for iconography | Emoji = amateur/AI slop. Professional apps use icon fonts. Phosphor is modern, complete |
| 2026-03-23 | 12px border radius for cards | 4px feels dated, 8px is standard, 12px is modern-friendly without being playful |

---

## Migration Notes

### Phase 1: Foundation
1. Install fonts (Google Fonts link in `public/index.html`)
2. Install Phosphor Icons: `npm install @phosphor-icons/react`
3. Create `src/styles/variables.css` with CSS custom properties

### Phase 2: Colors
1. Replace all `#007bff` → `var(--primary)` or `#FF6B3F`
2. Replace all `#28a745` → `var(--success)` or `#10B981`
3. Replace all `#f44336` / `#dc3545` → `var(--error)` or `#EF4444`

### Phase 3: Typography
1. Replace `font-family: Arial` → `font-family: 'Plus Jakarta Sans'`
2. Update font sizes to use type scale
3. Add `tabular-nums` to timestamp elements

### Phase 4: Components
1. Update buttons with new padding, radius, hover states
2. Update cards with new shadows, borders
3. Replace emoji with Phosphor Icons
4. Update inputs with focus states

### Phase 5: Polish
1. Add motion transitions (200-300ms)
2. Implement dark mode (optional)
3. Add `prefers-reduced-motion` support
