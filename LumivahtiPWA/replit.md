# Lumivahti - Snow Load Monitoring PWA

## Overview
Lumivahti is a Finnish-language Progressive Web App (PWA) for monitoring snow load on roofs. It helps property owners track real-time snow accumulation and receive alerts when their roof's safety threshold is approached. The app works without authentication, storing user preferences locally for a frictionless experience.

## Recent Changes (November 27, 2025)
### Phase 10 - Improved Station Selection (Latest)
- **Fixed Static Coordinates**: Corrected wrong coordinates for 99800 (Ivalo), 99600 (Sodankylä), 99870 (Inari)
- **Ivalo/Inari Station Priority**: Added specific FMI station IDs for Ivalo/Inari area (101784, 101885, 102003)
- **Two-Phase Search**: If no station found within 25km, expands search radius to 50km
- **Accurate Distance Calculation**: Station distance now calculated from predefined coordinates, not XML parsing
- **Before**: 99800 incorrectly used "Utsjoki Kevo" (120km away)
- **After**: 99800 correctly uses "Inari Saariselkä matkailukeskus" (28km away)
- **Verified Stations**:
  - 99800 (Ivalo) → "Inari Saariselkä matkailukeskus" at 28km
  - 99870 (Inari) → "Inari Saariselkä matkailukeskus"
  - 99600 (Sodankylä) → "Sodankylä Tähtelä"

### Phase 9 - ECMWF Forecast Model
- **Switched to ECMWF**: Replaced HARMONIE model with ECMWF for weather forecasts
- **Accurate 3-Day Forecast**: HARMONIE only provided ~48 hours of data, ECMWF provides up to 10 days
- **Fixed Temperature Ranges**: Min/max temperatures now match FMI.fi official website
- **Full Daily Coverage**: All 24 hours of each forecast day have data (no more NaN values)
- **Verified Accuracy**: Kolari Sunday 30.11 shows -6/+1°C (matches FMI.fi exactly)
- **Stored Query**: `ecmwf::forecast::surface::point::timevaluepair`

### Phase 8 - Dynamic Postal Code Geocoding
- **Dynamic Geocoding**: Replaced static postal code map with OpenStreetMap Nominatim API
- **Any Finnish Postal Code**: Now works with any valid Finnish postal code, not just pre-defined ones
- **Cached Results**: Geocoded coordinates are cached in memory to avoid repeated API calls
- **Error Handling**: Returns user-friendly error message when postal code cannot be found
- **Nominatim Compliance**: User-Agent header includes contact info per OSM usage policy
- **Verified Working**: Tested with Tampere (33720), Turku (20100), Lahti (15100), Pori (28100), Kouvola (45100)

### Phase 7 - Improved FMI Timevaluepair API & Enhanced Forecast
- **Snow Observations**: Switched to `fmi::observations::weather::daily::timevaluepair` with `snow` parameter
- **Station ID Support**: Kilpisjärvi uses specific station IDs (102016 kyläkeskus, 102017 Saana)
- **20km Search Radius**: Reduced from 30km for more accurate local data
- **7-Day Lookback**: Daily observations use 7-day history for reliable data
- **Enhanced Forecast Format**: 
  - Date label: "Pe 28.11." (weekday + date)
  - Temperature range: "-11/-6 °C" (min/max)
  - Precipitation with type: "0–1 mm lunta" / "2 mm vettä" / "1 mm räntää"
- **Precipitation Type Detection**: Based on temperature (snow < -1°C, rain > +2°C, sleet in between)
- **Verified Data**: Kilpisjärvi 22cm, Kuopio 3cm, Helsinki 2cm (all with station names)

### Phase 6 - FMI Station Info & Improved Accuracy
- **Station Info Display**: Shows actual FMI weather station name, distance, and last update time below the gauge
- **Format**: "Lumidata: [aseman nimi] ([etäisyys] km) – päivitetty [aika sitten]"
- **Fallback Message**: When no station within 20km, shows "Arvio perustuu sijaintiin ja vuodenaikaan"
- **Expanded Postal Codes**: Added Kilpisjärvi (99130), Utsjoki, Inari, Muonio, and other Lapland locations
- **API Response**: Includes `stationInfo` object with `name`, `distance`, and `updatedAgo` fields

### Phase 5 - Location Detection & Terminology Update
- **Automatic Location Detection**: On first visit, app requests browser geolocation permission
- **Reverse Geocoding**: Uses OpenStreetMap Nominatim API to convert GPS to postal code
- **Auto-fill**: Detected postal code automatically fills the input field
- **Visual Feedback**: Green checkmark with "Havaittu sijainti: XXXXX [City] (voit muuttaa)"
- **Graceful Fallback**: If user denies permission or error occurs, manual input remains
- **Terminology Change**: All "tilaus" renamed to "tarjouspyyntö" throughout the app
- **Updated Button**: "Pyydä tarjouksia lumenpudotuksesta" (was "Tilaa lumenpudotus")
- **Updated Tab**: "Tarjouspyynnöt" (was "Tilaukset")

### Phase 4 - Service Area & Settings Update
- **Kuopio Service Area**: Service limited to 80km radius from Kuopio center (62.8933, 27.6783)
- **Distance Calculation**: Haversine formula calculates distance from user's postal code to Kuopio
- **Conditional UI**: "Tilaa lumenpudotus" button only shown within service area
- **Outside Area Message**: Users outside 80km see info box about service expansion plans
- **Email Recipient**: Changed to info@pp-kattohuolto.fi
- **Updated Email Body**: Includes city name and distance from Kuopio
- **Extended Postal Codes**: Added 100+ Finnish postal codes with coordinates and city names
- **Removed Footer**: "Lumivahti – lumenpudotuspalvelut koko Suomessa" removed
- **Editable Settings**: Users can now change postal code and roof type in Settings
- **Immediate Refresh**: Location/roof type changes trigger cache invalidation and fresh data fetch
- **Auto-Navigation**: After saving settings, app navigates to Home with updated service area status

### Phase 3 - Simplified Architecture
- **Removed Authentication**: App now works without login/registration - all data stored in localStorage
- **Rebranded**: Changed from "P&P Kattohuolto Oy" to simply "Lumivahti" throughout the app
- **Simplified Setup**: New SimpleSetup page requires only postal code and roof type (no email/password)
- **Local Orders**: Order history stored in localStorage instead of database
- **Updated Logo**: Changed from house icon to snowflake icon with "Lumivahti" text

### Phase 2 - Database & Order History
- Database infrastructure with PostgreSQL (Neon) and Drizzle ORM (backend still available for future use)
- WebSocket configuration for Neon serverless driver

### Phase 1 - MVP (Completed)
- 3-slide onboarding flow
- Home dashboard with circular gauge showing snow load status
- Integrated FMI (Finnish Meteorological Institute) Open Data API for real snow depth data
- 3-day snow forecast using FMI ECMWF model with real temperature and precipitation data
- Settings page with threshold adjustment and notification toggle
- PWA manifest for mobile installation

## Project Architecture

### Frontend (React + TypeScript)
- **Framework**: React with Vite
- **Routing**: Custom state management for PWA (onboarding → setup → main app)
- **Styling**: Tailwind CSS with Lumivahti branding
- **State**: TanStack Query for API data, localStorage for user data and orders
- **Components**:
  - Onboarding: 3-slide introduction with brand messaging
  - SimpleSetup: Postal code and roof type selection (no auth)
  - Home: Dashboard with circular gauge, forecast cards, and service order button
  - Settings: Threshold adjustment, notification toggle (no logout)
  - Orders: Order history from localStorage
  - Shared: Logo (Snowflake icon), CircularGauge, ForecastCard components

### Backend (Express + TypeScript)
- **Framework**: Express.js
- **API**: Snow data endpoint (no auth required)
- **Future Ready**: Database infrastructure available for potential future features

### API Endpoints
**Snow Data (No Auth Required)**
- `GET /api/snow-data/:postalCode` - Get current snow load and forecast from FMI API

### Data Flow
1. First launch → Show onboarding slides → SimpleSetup (postal code + roof type)
2. User data stored in localStorage under "lumivahti_user" key
3. Snow data fetched from FMI API every 6 hours
4. Orders stored locally in "lumivahti_orders" key
5. Settings changes update localStorage immediately

## FMI API Integration
- **Data Source**: FMI Open Data WFS API
- **Snow Observations Query**: `fmi::observations::weather::daily::timevaluepair` with `snow` parameter
- **Forecast Query**: `ecmwf::forecast::surface::point::timevaluepair` with Temperature, Precipitation1h
- **Priority Stations**:
  - Kilpisjärvi: FMISIDs 102016 (kyläkeskus), 102017 (Saana)
  - Inari/Ivalo: FMISIDs 101784 (Ivalo lentoasema), 101885 (Saariselkä), 102003 (Raja-Jooseppi)
- **Two-Phase Search**: First searches 25km radius, then expands to 50km if no station found
- **Calculation**: Snow depth (cm) × 2.5 = Load (kg/m²)
- **Forecast Format**: 
  - Date label: "Pe 28.11." (weekday + date)
  - Temperature: min/max range (e.g., "-11/-6 °C")
  - Precipitation: amount with type (e.g., "2 mm lunta", "3 mm vettä", "1 mm räntää")
- **Precipitation Type**: Determined by temperature (snow < -1°C, rain > +2°C, sleet in between)
- **Fallback**: Latitude/season-based estimates when FMI API unavailable
- **Thaw Detection**: Max temp ≥ +1°C AND precipitation ≥ 5mm triggers warning condition

## Heavy Wet Snow Warning System
- **Trigger Conditions**:
  - Current load ≥ 60% of roofThreshold
  - Forecast has thaw: max temp ≥ +1°C AND precipitation ≥ 5mm in any of next 3 days
- **Warning Banner**: Orange-to-red gradient card on Home page
  - Title: "HUOM: LUMI VOI RASKAANTUA HUOMATTAVASTI!"
  - Text: "Ennusteessa lauhaa ja vesisadetta. Kastunut lumi on 3–5 kertaa painavampi kuin pakkaslumi."
  - Risk: "kuorma voi nousta kriittiselle tasolle yhdessä vuorokaudessa"
- **Push Notification**: Uses browser Notification API + OneSignal (if configured)
  - Message: "Lumivahti: Varoitus! Lämpenee ja sataa vettä – lumikuorma voi kasvaa rajusti. Tarkista katto."
- **API Response**: Includes `heavyWetSnowWarning` (boolean) and `thawConditions` array

## Push Notifications (OneSignal)
- **SDK**: OneSignal Web SDK v16
- **Backend**: REST API endpoint `/api/notifications/send`
- **Environment Variables Required**:
  - `ONESIGNAL_APP_ID` - Public app identifier (safe for frontend)
  - `ONESIGNAL_REST_API_KEY` - Secret REST API key (backend only)
- **Notification Types**:
  - Regular alert: When load exceeds alertThreshold
  - Wet-snow warning: When thaw conditions + high load detected
- **Permission Prompt**: Finnish "Haluatko saada ilmoituksia lumikuormasta?"
- **Welcome Notification**: "Lumivahti - Ilmoitukset käytössä!"
- **Fallback**: Browser Notification API when OneSignal unavailable

## Email Service Order
- **To**: info@pp-kattohuolto.fi
- **Subject**: Lumenpudotuspyyntö – Lumivahti
- **Body Template**:
  - Hei P&P Kattohuolto,
  - Postinumero: [postal code] ([city], n. [distance] km Kuopiosta)
  - Kattotyyppi: [user's roof type]
  - Nykyinen lumikuorma: [current load] kg/m²
  - Ystävällisin terveisin, Lumivahti-käyttäjä
- **Service Area**: Only available within 80km of Kuopio (62.8933, 27.6783)

## Roof Type Thresholds
- Omakotitalo (kestävä): 180 kg/m²
- Vanhempi omakotitalo: 140 kg/m²
- Autokatos / varasto: 100 kg/m²
- Halli / peltikatos: 120 kg/m²
- Oma raja: Custom (80-200 kg/m²)

## Status Calculation
- **Safe** (Green): < 80% of threshold
- **Moderate** (Yellow): 80-99% of threshold
- **Critical** (Red): ≥ 100% of threshold

## Design System
### Brand Colors (Lumivahti)
- Primary: `#2d1b69` (dark blue-violet)
- Accent: `#ff6b35` (bright orange)
- Background: `#f8fafc` (light gray-blue)
- Text: `#1e293b` (dark slate)

### Status Colors
- Safe: `rgb(34 197 94)` (green)
- Moderate: `rgb(234 179 8)` (yellow)
- Critical: `rgb(239 68 68)` (red)

## PWA Features
- Installable on iOS and Android
- Offline data caching via localStorage
- Mobile-optimized responsive design
- Safe area support for notched devices
- Manifest with theme colors and icons

## localStorage Keys
- `lumivahti_user`: User preferences (postalCode, roofType, customThreshold, notificationsEnabled)
- `lumivahti_orders`: Array of order history objects

## User Preferences
- Language: Finnish (fi)
- Mobile-first design approach
- Simple, safety-focused UX
- No authentication required
- Minimal animations for performance

## Development
- Run: `npm run dev`
- Port: 5000 (serves both frontend and backend)
- Hot reload: Vite HMR for frontend changes
