-- Trips / Crew (Flow BE)
-- Top-level "trip" object with stops, members, days, group gear, and per-member day kits.

-- ============================================
-- ENUMs
-- ============================================

CREATE TYPE trip_status AS ENUM ('planning', 'next_up', 'live', 'past');
CREATE TYPE trip_member_role AS ENUM ('organizer', 'member', 'guest');
CREATE TYPE trip_member_status AS ENUM ('joined', 'invited', 'guest', 'left');
CREATE TYPE trip_effort AS ENUM ('easy', 'steady', 'hard');
CREATE TYPE trip_kit_state AS ENUM ('ok', 'warn', 'missing');

-- ============================================
-- TABLES
-- ============================================

CREATE TABLE trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id VARCHAR(100) NOT NULL,
    name VARCHAR(200) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status trip_status NOT NULL DEFAULT 'planning',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (end_date >= start_date)
);

CREATE TABLE trip_stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    position INT NOT NULL,
    name VARCHAR(200) NOT NULL,
    latitude DECIMAL(8, 4),
    longitude DECIMAL(8, 4),
    activities TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (trip_id, position)
);

CREATE TABLE trip_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id VARCHAR(100), -- nullable: guests have no Clerk user
    display_name VARCHAR(120) NOT NULL,
    role trip_member_role NOT NULL DEFAULT 'member',
    status trip_member_status NOT NULL DEFAULT 'invited',
    invite_token VARCHAR(64), -- share-link token for pending invites
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- A real user may only appear once per trip; guests have user_id NULL so we
-- enforce uniqueness via a partial index instead of a UNIQUE constraint.
CREATE UNIQUE INDEX idx_trip_members_user_unique
    ON trip_members (trip_id, user_id)
    WHERE user_id IS NOT NULL;

CREATE TABLE trip_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    stop_id UUID REFERENCES trip_stops(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    activity VARCHAR(80),
    UNIQUE (trip_id, date)
);

CREATE TABLE trip_member_day_kits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_day_id UUID NOT NULL REFERENCES trip_days(id) ON DELETE CASCADE,
    trip_member_id UUID NOT NULL REFERENCES trip_members(id) ON DELETE CASCADE,
    effort trip_effort NOT NULL DEFAULT 'steady',
    items JSONB NOT NULL DEFAULT '[]'::jsonb, -- array of layer slot identifiers
    note TEXT,
    state trip_kit_state NOT NULL DEFAULT 'ok',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (trip_day_id, trip_member_id)
);

CREATE TABLE trip_group_gear (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    description VARCHAR(200) NOT NULL,
    assignee_member_id UUID REFERENCES trip_members(id) ON DELETE SET NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_trips_owner ON trips(owner_user_id);
CREATE INDEX idx_trips_dates ON trips(start_date, end_date);
CREATE INDEX idx_trip_stops_trip ON trip_stops(trip_id);
CREATE INDEX idx_trip_members_trip ON trip_members(trip_id);
CREATE INDEX idx_trip_members_user ON trip_members(user_id);
CREATE INDEX idx_trip_days_trip ON trip_days(trip_id);
CREATE INDEX idx_trip_member_day_kits_day ON trip_member_day_kits(trip_day_id);
CREATE INDEX idx_trip_member_day_kits_member ON trip_member_day_kits(trip_member_id);
CREATE INDEX idx_trip_group_gear_trip ON trip_group_gear(trip_id);

-- ============================================
-- TRIGGERS
-- ============================================

CREATE TRIGGER update_trips_updated_at
    BEFORE UPDATE ON trips
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trip_member_day_kits_updated_at
    BEFORE UPDATE ON trip_member_day_kits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY
-- (Matches existing project convention: USING (true); filtering enforced at
-- the application layer by passing the authenticated Clerk user id.)
-- ============================================

ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_member_day_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_group_gear ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trips access" ON trips
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Trip stops access" ON trip_stops
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Trip members access" ON trip_members
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Trip days access" ON trip_days
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Trip member day kits access" ON trip_member_day_kits
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Trip group gear access" ON trip_group_gear
    FOR ALL USING (true) WITH CHECK (true);
