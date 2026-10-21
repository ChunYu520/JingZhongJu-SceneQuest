-- 景中局 MVP PostgreSQL Schema
-- 注意：请在正式环境执行前通过迁移工具管理版本，勿直接覆盖真实数据。

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE session_status AS ENUM ('LOBBY', 'RUNNING', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE player_status AS ENUM ('ACTIVE', 'DISCONNECTED', 'LEFT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('LOCKED', 'AVAILABLE', 'IN_PROGRESS', 'SUBMITTED', 'COMPLETED', 'FAILED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_visibility AS ENUM ('PUBLIC', 'PRIVATE', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE director_status AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'REJECTED', 'FAILED', 'STALE', 'FALLBACK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code VARCHAR(12) NOT NULL UNIQUE,
  story_id VARCHAR(100) NOT NULL,
  story_version VARCHAR(40) NOT NULL DEFAULT '1.0.0',
  status session_status NOT NULL DEFAULT 'LOBBY',
  host_player_id UUID,
  current_stage VARCHAR(100) NOT NULL DEFAULT 'lobby',
  state_version BIGINT NOT NULL DEFAULT 0,
  world_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  mode VARCHAR(20) NOT NULL DEFAULT 'AI_DIRECTOR' CHECK (mode IN ('AI_DIRECTOR', 'FIXED_SCRIPT')),
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE TABLE IF NOT EXISTS session_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  nickname VARCHAR(32) NOT NULL,
  role_id VARCHAR(100),
  access_token_hash TEXT NOT NULL UNIQUE,
  host_secret_hash TEXT,
  status player_status NOT NULL DEFAULT 'ACTIVE',
  private_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  UNIQUE(session_id, nickname)
);

ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS fk_game_host_player;
ALTER TABLE game_sessions ADD CONSTRAINT fk_game_host_player
  FOREIGN KEY (host_player_id) REFERENCES session_players(id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS task_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  task_key VARCHAR(120) NOT NULL,
  assigned_player_id UUID REFERENCES session_players(id) ON DELETE SET NULL,
  assigned_role_id VARCHAR(100),
  status task_status NOT NULL DEFAULT 'LOCKED',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_answer JSONB,
  result JSONB,
  activated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, task_key, assigned_role_id)
);

CREATE TABLE IF NOT EXISTS player_clues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  clue_key VARCHAR(120) NOT NULL,
  owner_player_id UUID NOT NULL REFERENCES session_players(id) ON DELETE CASCADE,
  granted_by_event_id UUID,
  shared_with_player_id UUID REFERENCES session_players(id) ON DELETE SET NULL,
  shared_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, clue_key, owner_player_id)
);

CREATE TABLE IF NOT EXISTS game_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  sequence_no BIGINT NOT NULL,
  actor_player_id UUID REFERENCES session_players(id) ON DELETE SET NULL,
  event_type VARCHAR(100) NOT NULL,
  visibility event_visibility NOT NULL DEFAULT 'PUBLIC',
  target_player_id UUID REFERENCES session_players(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, sequence_no),
  UNIQUE(session_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS director_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  based_on_version BIGINT NOT NULL,
  status director_status NOT NULL DEFAULT 'QUEUED',
  trigger_event_id UUID REFERENCES game_events(id) ON DELETE SET NULL,
  input_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_json JSONB,
  validation_errors JSONB,
  provider_name VARCHAR(100),
  model_name VARCHAR(100),
  latency_ms INTEGER,
  error_code VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

-- SceneQuest full-stack runtime tables. The API also creates these idempotently at startup.
CREATE TABLE IF NOT EXISTS sq_stories (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  venue JSONB NOT NULL,
  story JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sq_sessions (
  id UUID PRIMARY KEY,
  invite_code VARCHAR(8) UNIQUE NOT NULL,
  story_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'LOBBY',
  mode TEXT NOT NULL DEFAULT 'AI_DIRECTOR',
  stage TEXT NOT NULL DEFAULT 'lobby',
  state_version INTEGER NOT NULL DEFAULT 0,
  world JSONB NOT NULL,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE TABLE IF NOT EXISTS sq_players (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sq_sessions(id) ON DELETE CASCADE,
  nickname VARCHAR(32) NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  host BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  private_state JSONB NOT NULL DEFAULT '{}'::JSONB,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, nickname)
);

CREATE TABLE IF NOT EXISTS sq_events (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sq_sessions(id) ON DELETE CASCADE,
  sequence_no INTEGER NOT NULL,
  actor_id UUID,
  type TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'PUBLIC',
  target_player_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, sequence_no)
);

CREATE TABLE IF NOT EXISTS sq_director_runs (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sq_sessions(id) ON DELETE CASCADE,
  based_on_version INTEGER NOT NULL,
  status TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  latency_ms INTEGER,
  reason TEXT,
  output JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS idempotency_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  player_id UUID REFERENCES session_players(id) ON DELETE CASCADE,
  idempotency_key VARCHAR(160) NOT NULL,
  response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, player_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_players_session_status ON session_players(session_id, status);
CREATE INDEX IF NOT EXISTS idx_events_session_seq ON game_events(session_id, sequence_no);
CREATE INDEX IF NOT EXISTS idx_events_session_type ON game_events(session_id, event_type);
CREATE INDEX IF NOT EXISTS idx_tasks_session_status ON task_instances(session_id, status);
CREATE INDEX IF NOT EXISTS idx_director_runs_session_created ON director_runs(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON game_sessions(expires_at);
