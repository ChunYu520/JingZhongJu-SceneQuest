import pg from 'pg';
const { Pool } = pg;
export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10, idleTimeoutMillis: 30000 });
export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sq_stories (
      id text PRIMARY KEY, version text NOT NULL, title text NOT NULL, venue jsonb NOT NULL,
      story jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS sq_sessions (
      id uuid PRIMARY KEY, invite_code varchar(8) UNIQUE NOT NULL, story_id text NOT NULL,
      status text NOT NULL DEFAULT 'LOBBY', mode text NOT NULL DEFAULT 'AI_DIRECTOR',
      stage text NOT NULL DEFAULT 'lobby', state_version integer NOT NULL DEFAULT 0,
      world jsonb NOT NULL, result jsonb, created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours'
    );
    ALTER TABLE sq_sessions ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours';
    CREATE TABLE IF NOT EXISTS sq_players (
      id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES sq_sessions(id) ON DELETE CASCADE,
      nickname varchar(32) NOT NULL, token_hash text UNIQUE NOT NULL, host boolean NOT NULL DEFAULT false,
      status text NOT NULL DEFAULT 'ACTIVE', private_state jsonb NOT NULL DEFAULT '{}'::jsonb,
      joined_at timestamptz NOT NULL DEFAULT now(), UNIQUE(session_id,nickname)
    );
    CREATE TABLE IF NOT EXISTS sq_events (
      id bigserial PRIMARY KEY, session_id uuid NOT NULL REFERENCES sq_sessions(id) ON DELETE CASCADE,
      sequence_no integer NOT NULL, actor_id uuid, type text NOT NULL, visibility text NOT NULL DEFAULT 'PUBLIC',
      target_player_id uuid, payload jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(session_id,sequence_no)
    );
    CREATE TABLE IF NOT EXISTS sq_director_runs (
      id bigserial PRIMARY KEY, session_id uuid NOT NULL REFERENCES sq_sessions(id) ON DELETE CASCADE,
      based_on_version integer NOT NULL, status text NOT NULL, provider text, model text,
      latency_ms integer, reason text, output jsonb, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_sq_sessions_expiry ON sq_sessions(expires_at);
  `);
}
