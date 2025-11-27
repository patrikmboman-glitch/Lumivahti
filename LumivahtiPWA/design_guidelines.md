# Lumivahti PWA Design Guidelines

## Design Approach
**Utility-Focused Mobile Application** with safety-critical information display. Drawing inspiration from weather apps (iOS Weather, YR.no) and monitoring dashboards (Nest, Tesla app) for clean, data-first mobile interfaces.

## Brand Identity

**Lumivahti Color System:**
- Primary: `#2d1b69` (dark blue-violet) - headers, primary UI elements
- Accent: `#ff6b35` (bright orange) - CTAs, alerts, active states
- Background: `#f8fafc` (light gray-blue) - app background
- Text: `#1e293b` (dark slate) - body text and labels

**Logo Treatment:**
Snowflake icon (lucide-react) + "Lumivahti" wordmark in primary color. Place in onboarding slides and top of dashboard.

## Typography

**Font Stack:** System fonts for optimal mobile performance
- iOS: -apple-system, SF Pro
- Android: Roboto
- Fallback: sans-serif

**Hierarchy:**
- Headlines: 28-32px, bold (onboarding titles)
- Subheads: 18-20px, semibold (section titles)
- Body: 16px, regular (descriptions, labels)
- Captions: 14px, medium (gauge values, metadata)
- Large Display: 48-56px, bold (gauge number)

## Layout System

**Mobile-First Constraints:**
- Max width: 100vw (full mobile screen)
- Container padding: `px-4` (16px) for content
- Section spacing: `py-6` (24px) between major sections
- Card spacing: `gap-4` (16px) between elements
- Bottom nav height: 64px (reserve space)

**Safe Areas:** Account for iOS notch and Android navigation

## Component Library

### Onboarding Slides
- **Layout:** Full-screen horizontal swipe cards (100vh)
- **Structure:** Centered content with 60% illustration/icon area, 40% text
- **Slide 1:** Large "Lumivahti" wordmark + roof icon illustration, subtitle below
- **Slide 2 & 3:** Icon at top, centered headline, 2-3 line description
- **Navigation:** Dot indicators at bottom, skip button (top-right)
- **CTA:** Full-width orange button "Aloita" fixed at bottom (above safe area)

### Setup Form
- **Input Fields:** Rounded corners (12px), light border, focus state with orange accent
- **Email/Password:** Standard text inputs with labels above
- **Postal Code:** Numeric keypad, 5-digit validation with Finland flag icon
- **Dropdown:** Native select styled with chevron icon, roof types listed with threshold values in parentheses
- **Custom Threshold:** Number input revealed when "Oma raja" selected
- **Submit:** Orange button full-width, 48px height

### Dashboard Gauge (Hero Element)
- **Circular Progress:** 280px diameter on mobile, centered
- **Colors:** 
  - Green arc: < threshold
  - Yellow arc: ≥ 80% threshold
  - Red arc: > threshold
- **Center Display:** Current load in large bold numbers (48px) + "kg/m²" unit
- **Ring Width:** 24px stroke
- **Status Text:** Below gauge, color-matched to current state, Finnish text ("Turvallinen" / "Kohtalainen riski" / "Kriittinen")

### Forecast Cards
- **Layout:** Horizontal scroll, 3 cards side-by-side
- **Card Size:** 120px wide, 140px tall, rounded corners (16px)
- **Content:** Day name, weather icon (48px), snow depth, temperature
- **Background:** White cards with subtle shadow

### CTA Button
- **Primary (Orange):** `#ff6b35` background, white text, 16px bold
- **Size:** Full-width or min 240px, 48px height
- **Corners:** Rounded 12px
- **Icon:** Email icon (24px) left of text
- **Action:** Opens native email client with pre-filled template

### Settings Controls
- **Toggle Switch:** iOS-style switch, orange when active
- **Slider:** Orange track/thumb, range 80-200 with live value display
- **Sections:** Grouped with light gray dividers between
- **Save Button:** Primary orange button to save settings

### Bottom Navigation
- **Tabs:** 3 items ("Koti" | "Tilaukset" | "Asetukset")
- **Icons:** Simple line icons (home, package, settings) 24px
- **Active State:** Orange color + label bold
- **Inactive:** Gray with lighter label
- **Height:** 64px with safe area padding

## Visual Effects

**Minimal Animations:**
- Gauge fills smoothly on load (800ms ease-out)
- Slide transitions (300ms swipe)
- Tab switching fade (200ms)
- No decorative animations

**Shadows:**
- Cards: `shadow-sm` subtle elevation
- Gauge: Soft glow in current status color
- Bottom nav: Top border + subtle shadow

## Accessibility

- Minimum touch targets: 44x44px
- High contrast ratios (WCAG AA)
- Finnish language throughout
- Form labels clearly visible
- Status colors supplemented with text/icons

## PWA Specifications

- Install prompt after onboarding
- App icon: Roof symbol on primary color background
- Splash screen: Logo centered on background color
- Offline message: "Päivitys epäonnistui" with retry
- Status bar: Primary color (#2d1b69)

## Content Strategy

All text in Finnish, safety-critical information prominently displayed. Gauge is the focal point. Forecast provides context. Email CTA is conversion-focused with pre-filled convenience.