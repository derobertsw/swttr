# Swttr

Find the right clothes for winter sports based on conditions.

## Features

- **Activity-based recommendations** - Get layer suggestions for Alpine skiing and XC skiing
- **Manual or forecast mode** - Enter conditions manually or look up weather by location and date
- **Customizable gear names** - Replace generic layer names with your actual gear

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
      geocode/                  # Location search API
      wardrobe/
        items/                  # GET/PUT/DELETE user gear mappings
      weather/                  # Weather forecast API
    wardrobe/                   # My Gear settings page
    page.tsx                    # Home page
  components/
    wardrobe/                   # Wardrobe components
      ItemMappingEditor.tsx     # Custom gear names editor
      useItemMappings.ts        # Gear mappings hook
    ActivitySelection.tsx       # Activity picker
    LayerDisplay.tsx            # Recommendation display
    WeatherSelection.tsx        # Temperature/wind sliders
  data/
    layerRecommendations.json   # Default layer recommendations
    layerOptions.ts             # Available layer options
  lib/
    supabase.ts                 # Supabase client
  types/
    wardrobe.ts                 # TypeScript types
```

## Database Schema (Supabase)

If using Supabase for persistent settings, create this table:

```sql
-- User gear name mappings
CREATE TABLE user_item_mappings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  body_part TEXT NOT NULL,
  layer_type TEXT NOT NULL,
  standard_option TEXT NOT NULL,
  custom_name TEXT NOT NULL,
  UNIQUE(user_id, body_part, layer_type, standard_option)
);
```

## Deployment

This application is hosted at [swttr.vercel.app](https://swttr.vercel.app)

Deploy your own instance with Vercel:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/swttr)
