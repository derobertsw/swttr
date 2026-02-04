# Swttr

Find the right clothes for winter sports based on conditions.

## Features

- **Biophysics-based recommendations** - Layer suggestions using the IREQ (ISO 11079) thermal comfort standard
- **Activity-based recommendations** - Get layer suggestions for Alpine skiing and XC skiing
- **Manual or forecast mode** - Enter conditions manually or look up weather by location and date
- **Wardrobe management** - Build your wardrobe from a database of calibrated gear with known thermal properties
- **Organized by body part** - Wardrobe items grouped by torso, legs, hands, and head & neck

## Getting Started

### Prerequisites

- Node.js 18+
- npm, yarn, pnpm, or bun

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env.local` file with the following optional variables:

```bash
# Supabase (optional - enables persistent gear mappings)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Without Supabase configured, the app uses static layer recommendations from `src/data/layerRecommendations.json`.

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

### Build

```bash
npm run build
```

### Lint

```bash
npm run lint
```

## Testing

This project uses [Vitest](https://vitest.dev/) with [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) for testing.

### Run Tests

```bash
# Run all tests (watch mode by default in dev)
npm test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

### Test Structure

Tests are co-located with their source files:

```
src/
  components/
    LayerDisplay.tsx
    LayerDisplay.test.tsx
  app/api/
    weather/
      route.ts
      route.test.ts
  lib/
    utils.ts
    utils.test.ts
```

## Project Structure

```
src/
  app/                          # Next.js App Router pages
    api/
      backpack/                 # User backpack API
      geocode/                  # Location search API
      preferences/              # User preferences API
      v1/                       # Versioned API routes
      wardrobe/                 # Wardrobe API endpoints
      weather/                  # Weather forecast API
    backpack/                   # Backpack management page
    faq/                        # FAQ page
    wardrobe/                   # My Gear page
    page.tsx                    # Home page
  components/
    wardrobe/                   # Wardrobe components
    ui/                         # Shared UI components (shadcn/ui)
    ActivitySelection.tsx       # Activity picker
    BackpackEditor.tsx          # Pack list editor
    BiophysicsDetails.tsx       # Thermal comfort details
    LayerDisplay.tsx            # Recommendation display
    PreferencesDrawer.tsx       # User preferences
    WeatherSelection.tsx        # Temperature/wind sliders
  data/
    activities.ts               # Activity definitions
    layerRecommendations.json   # Default layer recommendations
    layerOptions.ts             # Available layer options
  hooks/
    useBackpack.ts              # Backpack state management
    useBiophysicsRecommendation.ts  # IREQ-based recommendations
    useCurrentWeather.ts        # Weather data hook
    useItemMappings.ts          # Gear mappings hook
    useLocationSearch.ts        # Location search hook
    usePreferences.ts           # User preferences hook
  lib/
    biophysics/                 # IREQ thermal comfort calculations
      constants.ts              # Physical constants
      ensemble.ts               # Clothing ensemble calculations
      ireq.ts                   # Required insulation calculations
      scorer.ts                 # Ensemble scoring
    recommendations/            # Shared recommendation logic
    supabase.ts                 # Supabase client
  types/
    biophysics.ts               # Thermal property types
    garments.ts                 # Garment database types
    wardrobe.ts                 # Wardrobe types
```

## Database Schema (Supabase)

The app uses a biophysics-based garment database with calibrated thermal properties. See `supabase/migrations/` for the full schema. Key tables:

- **garments** - Clothing items with brand, model, category, and body coverage
- **garment_thermal_properties** - Rcl (thermal resistance) and Recl (evaporative resistance) values in clo units
- **garment_protection** - Wind and water resistance ratings
- **garment_ventilation** - Pit zips, vents, and ventilation effectiveness
- **garment_activity_ratings** - Activity-specific suitability scores
- **handwear** / **headwear** - Extremity items with thermal properties
- **user_wardrobe** - Links users to their owned gear

## Deployment

This application is hosted at [swttr.vercel.app](https://swttr.vercel.app)

Deploy your own instance with Vercel:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/swttr)
