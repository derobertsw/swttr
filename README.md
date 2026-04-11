# SWTTR

SWTTR helps you pick the right layers for outdoor activities based on conditions. It blends biophysics-based insulation targets with a gear-aware wardrobe so recommendations are grounded in real clo values.

## Highlights

- **Biophysics-based recommendations** for supported winter sports using IREQ (ISO 11079)
- **Activity-based recommendations** across multiple sports and intensity profiles
- **Manual or forecast mode** for quick input or location/time-based planning
- **Wardrobe management** with calibrated gear data (clo, breathability, wind/water protection)
- **Body-part guidance** (torso, legs, hands, head/neck) with target clo insights
- **Backpack planning** for activity + temperature range
- **Mobile-first UX** with a Gear Up FAB and bottom navigation

## Activities

- Alpine Skiing
- Backcountry Skiing
- XC Skiing
- Hiking / Snowshoeing
- Running
- Biking

**Biophysics support:** Alpine Skiing, Backcountry Skiing, and XC Skiing. Other activities use static recommendations from `src/data/layerRecommendations.json`.

## How Layer Recommendations Work

The biophysics-supported activities share a common recommendation pipeline built on the IREQ standard (ISO 11079). The diagrams below describe the architecture for contributors. All calculations live server-side under `src/lib/biophysics/` and sport-specific route handlers under `src/app/api/v1/recommendations/`.

### 1. Recommendation Pipeline

Every biophysics recommendation passes through the same eight-step pipeline, from metabolic rate lookup through final comfort classification.

```mermaid
graph TD
    A[Activity + Exertion Level] --> B[Metabolic Rate Selection]
    B --> C[IREQ Calculation]
    C --> D[Activity Target Range]
    D --> E[CoWEDA Validation Buffer]
    E --> F[Regional & Extremity IREQ]
    F --> G[Ensemble Building]
    G --> H[Ensemble Scoring]
    H --> I[Comfort Evaluation]

    subgraph "Shared Biophysics Core"
        B
        C
        D
        E
        F
    end

    subgraph "Sport-Specific"
        G
    end

    subgraph "Shared Evaluation"
        H
        I
    end
```

### 2. Garment Categorization and Pool Structure

Before ensemble building begins, all wardrobe garments are split into four mutually exclusive pools based on their category. Each garment belongs to exactly one pool.

```mermaid
graph TD
    W[User Wardrobe] --> CAT[categorizeGarments]

    CAT --> BL[Base Layers]
    CAT --> ML[Mid Layers]
    CAT --> INS[Insulation]
    CAT --> SH[Shells]

    subgraph "Pool: Base Layers"
        BL --> BL1[base_layer]
    end

    subgraph "Pool: Mid Layers"
        ML --> ML1[mid_layer_light]
        ML --> ML2[mid_layer_heavy]
    end

    subgraph "Pool: Insulation"
        INS --> INS1[insulation_synthetic]
        INS --> INS2[insulation_down]
        INS --> INS3[outer_insulated]
    end

    subgraph "Pool: Shells"
        SH --> SH1[soft_shell]
        SH --> SH2[hard_shell]
        SH --> SH3[windbreaker]
    end

    BL1 --> SEL[Ensemble Selection]
    ML1 --> SEL
    ML2 --> SEL
    INS1 --> SEL
    INS2 --> SEL
    INS3 --> SEL
    SH1 --> SEL
    SH2 --> SEL
    SH3 --> SEL
```

### 3. Ensemble Building Flow

Garments are selected in a fixed order: base layers first, then mid layers, then shells. A running clo budget prevents over-insulation, and duplicate prevention ensures no garment appears twice.

```mermaid
graph TD
    START[Target Clo Range from Pipeline] --> SORT[Sort Pool by Sport Strategy]
    SORT --> BASE[Select Base Layer]
    BASE --> MID[Select Mid Layer]
    MID --> SHELL[Select Shell]

    BASE --> T1[Pick torso garment]
    T1 --> L1[Pick legs garment — must differ from torso]

    subgraph "Guards Applied at Each Step"
        G1{Garment already selected?}
        G2{Current clo + garment clo within budget?}
        G3{Covers required body region?}
        G4{Meets breathability threshold?}
    end

    G1 -->|Duplicate| SKIP[Skip Garment]
    G1 -->|New| G2
    G2 -->|Exceeds budget| SKIP
    G2 -->|Fits| G3
    G3 -->|No| SKIP
    G3 -->|Yes| G4
    G4 -->|Below threshold| SKIP
    G4 -->|Passes| ADD[Add to Ensemble]
```

### 4. Sport Ensemble Variants

While all sports follow the same general selection order, each has architectural differences in sorting strategy, budget model, and layer handling.

```mermaid
graph TD
    SPORT{Sport} --> RUN[Running]
    SPORT --> BIKE[Biking]
    SPORT --> ALP[Alpine Skiing]
    SPORT --> XC[XC Skiing]
    SPORT --> TOUR[Ski Touring]

    subgraph "Running"
        RUN --> R1[Breathability-sorted at every layer]
        R1 --> R2[Shells conditional:<br/>clo deficit or precipitation]
        R2 --> R3[Whole-body clo budget]
    end

    subgraph "Biking"
        BIKE --> B1[Breathability-sorted]
        B1 --> B2[Shells always processed]
        B2 --> B3[Whole-body clo budget]
    end

    subgraph "Alpine Skiing"
        ALP --> A1[Insulation-sorted]
        A1 --> A2[Base layer capped at<br/>fraction of min clo]
        A2 --> A3[Mid + Insulation pools merged]
        A3 --> A4[Shells bypass clo budget]
        A4 --> A5[Dual metabolic model:<br/>skiing + chairlift blend]
    end

    subgraph "XC Skiing"
        XC --> X1[Per-region clo budgets:<br/>torso and legs independent]
        X1 --> X2[Single-region garments<br/>preferred over multi-region]
        X2 --> X3[Hard breathability filter<br/>on base and mid layers]
    end

    subgraph "Ski Touring"
        TOUR --> T1a[Triple-phase IREQ:<br/>uphill / downhill / transition]
        T1a --> T2a[Uphill ensemble only —<br/>breathability-first]
        T2a --> T3a[Insulation pool excluded<br/>from uphill — pack items only]
        T3a --> T4a[Pack items scored by<br/>warmth-to-weight ratio]
        T4a --> T5a[Transition protocol:<br/>urgent / quick / normal]
    end
```

### 5. Shell Exclusion Rules

Shell selection varies significantly by sport. This decision tree shows when and which shells are considered.

```mermaid
graph TD
    START{Which sport?} --> RUN[Running]
    START --> BIKE[Biking]
    START --> ALP[Alpine]
    START --> XC[XC Skiing]
    START --> TOUR[Ski Touring]

    RUN --> RCHECK{Clo deficit<br/>OR precipitation?}
    RCHECK -->|Yes| RADD[Add breathability-sorted shells]
    RCHECK -->|No| RSKIP[Skip shells entirely]

    BIKE --> BADD[Always consider shells<br/>— breathability-sorted]

    ALP --> AHARD{Hard shell available?}
    AHARD -->|Yes| AHSEL[Select hard shell for torso]
    AHARD -->|No| ASOFT[Select soft shell for torso]
    AHSEL --> ABUDGET[Shells bypass clo budget]
    ASOFT --> ABUDGET

    XC --> XBREATH{Meets breathability<br/>threshold?}
    XBREATH -->|Yes| XPREF[Select breathable shell]
    XBREATH -->|No shells qualify| XFALL[Fall back to all shells]

    TOUR --> THARD{Hard shell available?}
    THARD -->|Yes| THSEL[Select hard shell —<br/>soft shells excluded]
    THARD -->|No| TOTHER[Fall back to<br/>soft shells / windbreakers]
```

### 6. Extremity Selection

Extremity recommendations handle headwear, handwear, and neck warmth with distinct selection logic and sport-dependent context.

```mermaid
graph TD
    EXT[Extremity IREQ Targets] --> HEAD[Headwear Selection]
    EXT --> HAND[Handwear Selection]
    EXT --> NECK[Neck Warmth Selection]

    subgraph "Headwear — Three Independent Categories"
        HEAD --> HELMET{Sport requires helmet?}
        HELMET -->|Alpine, Touring descent| HYES[Include helmet]
        HELMET -->|Other sports| HNO[No helmet]

        HYES --> HOOD{Hood on outer layer?}
        HOOD --> HCOMPAT{Helmet-compatible?}
        HCOMPAT -->|Yes| HCONT[Hood contributes to head clo]
        HCOMPAT -->|No| HZERO[Hood clo zeroed out]

        HEAD --> HWARM[Select head warmth item]
    end

    subgraph "Handwear — Active vs Static Thresholds"
        HAND --> HMODE{Activity context?}
        HMODE -->|Running, Biking,<br/>XC, Touring uphill| ACTIVE[Use active temp thresholds]
        HMODE -->|Alpine,<br/>Touring descent| STATIC[Use static temp thresholds]
        ACTIVE --> HTARGET{IREQ target available?}
        STATIC --> HTARGET
        HTARGET -->|Yes| HSCORE[Score by proximity to target]
        HTARGET -->|No| HTEMP[Sort by warmth vs temperature]
    end

    subgraph "Neck Warmth Gate"
        NECK --> NCHECK{Temperature<br/>below freezing?}
        NCHECK -->|Yes| NSEL[Select neck warmth item]
        NCHECK -->|No| NSKIP[No neck warmth]
    end
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm, yarn, pnpm, or bun

### Install

```bash
npm install
```

### Environment Variables

Create a `.env.local` file with the following optional variables:

```bash
# Supabase (optional - enables persistent wardrobe and calibrated gear data)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Without Supabase configured, the app uses static layer recommendations from `src/data/layerRecommendations.json`.

### Development

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

### Build

```bash
npm run build
```

### Lint

```bash
npm run lint
```

## Testing

This project uses Vitest with React Testing Library.

```bash
# Run all tests (watch mode by default in dev)
npm test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

## Project Structure

```
src/
  app/                          # Next.js App Router pages
    api/                        # API routes (weather, wardrobe, recommendations)
    backpack/                   # Backpack management page
    faq/                        # FAQ page
    wardrobe/                   # My Gear page
    page.tsx                    # Home page
  components/
    icons/                      # Custom SVG icons
    wardrobe/                   # Wardrobe components
    ui/                         # Shared UI components (shadcn/ui)
    ActivitySelection.tsx       # Activity carousel
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
    recommendations/            # Shared recommendation logic
    supabase.ts                 # Supabase client
  types/
    biophysics.ts               # Thermal property types
    garments.ts                 # Garment database types
    wardrobe.ts                 # Wardrobe types
```

## Database (Supabase)

The app uses a biophysics-based garment database with calibrated thermal properties. See `supabase/migrations/` for the full schema. Key tables:

- `garments` - Clothing items with brand, model, category, and body coverage
- `garment_thermal_properties` - Rcl (thermal resistance) and Recl (evaporative resistance)
- `garment_protection` - Wind and water resistance ratings
- `garment_activity_ratings` - Activity-specific suitability scores
- `handwear` / `headwear` - Extremity items with thermal properties
- `user_wardrobe` - Links users to their owned gear

## Deployment

The app is hosted at `swttr.vercel.app`.

Deploy your own instance with Vercel:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/swttr)
