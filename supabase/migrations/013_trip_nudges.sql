-- Trip nudges: lightweight in-app pings from one crew member to another, used
-- by the roll-call screen to remind a teammate to finish their kit. Persisted
-- so the recipient sees the prompt the next time they open the trip — no
-- external push/email channel yet.

CREATE TABLE trip_nudges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    sender_member_id UUID NOT NULL REFERENCES trip_members(id) ON DELETE CASCADE,
    recipient_member_id UUID NOT NULL REFERENCES trip_members(id) ON DELETE CASCADE,
    message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ
);

CREATE INDEX idx_trip_nudges_recipient_unread
    ON trip_nudges(recipient_member_id)
    WHERE read_at IS NULL;
CREATE INDEX idx_trip_nudges_trip ON trip_nudges(trip_id);

ALTER TABLE trip_nudges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip nudges access" ON trip_nudges
    FOR ALL USING (true) WITH CHECK (true);
