-- ServeConnect initial schema
-- Sensitive columns ending in _enc are AES-256-GCM encrypted by the application layer.
-- Columns ending in _hash are HMAC-SHA256 "blind indexes" so encrypted values can be matched without decrypting.

CREATE EXTENSION IF NOT EXISTS citext;

-- ───────────────────────────── Users & identity ─────────────────────────────
CREATE TABLE users (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                  citext UNIQUE,
  phone_enc              text,
  phone_hash             text UNIQUE,
  password_hash          text,
  google_id              text UNIQUE,
  role                   text NOT NULL DEFAULT 'volunteer' CHECK (role IN ('volunteer','organizer','csr','admin')),
  account_status         text NOT NULL DEFAULT 'active' CHECK (account_status IN ('active','suspended','deleted')),
  suspended_reason       text,
  email_verified         boolean NOT NULL DEFAULT false,
  phone_verified         boolean NOT NULL DEFAULT false,
  name                   text NOT NULL,
  handle                 citext UNIQUE NOT NULL,
  avatar_url             text,
  cover_url              text,
  headline               text,
  bio                    text,
  website                text,
  location_name          text,
  lat                    double precision,
  lng                    double precision,
  date_of_birth          date,
  is_minor               boolean NOT NULL DEFAULT false,
  guardian_email         citext,
  guardian_consent       text NOT NULL DEFAULT 'not_required' CHECK (guardian_consent IN ('not_required','pending','granted','denied')),
  guardian_consent_at    timestamptz,
  org_type               text CHECK (org_type IN ('ngo','independent','company')),
  org_registration_no    text,
  verification_status    text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','pending','verified','rejected')),
  verified_at            timestamptz,
  skills                 text[] NOT NULL DEFAULT '{}',
  interests              text[] NOT NULL DEFAULT '{}',
  privacy                jsonb NOT NULL DEFAULT '{"email":"private","phone":"private","location":"public","dob":"private","hours":"public"}',
  blood_group_enc        text,
  blood_group_hash       text,
  is_blood_donor         boolean NOT NULL DEFAULT false,
  donor_radius_km        integer NOT NULL DEFAULT 25,
  last_donation_date     date,
  notification_prefs     jsonb NOT NULL DEFAULT '{"events":{"push":true,"email":true},"requests":{"push":true,"email":true},"social":{"push":true,"email":false},"reminders":{"push":true,"email":true},"radiusKm":25}',
  leaderboard_opt_out    boolean NOT NULL DEFAULT false,
  two_factor_enabled     boolean NOT NULL DEFAULT false,
  two_factor_secret_enc  text,
  two_factor_backup      text[] NOT NULL DEFAULT '{}',
  failed_login_count     integer NOT NULL DEFAULT 0,
  locked_until           timestamptz,
  onboarding_completed   boolean NOT NULL DEFAULT false,
  terms_accepted_at      timestamptz,
  csr_invite_code        text UNIQUE,
  company_id             uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  last_active_at         timestamptz
);
CREATE INDEX users_role_idx ON users(role);
CREATE INDEX users_skills_idx ON users USING gin(skills);
CREATE INDEX users_donor_idx ON users(is_blood_donor, blood_group_hash);
CREATE INDEX users_name_trgm ON users (lower(name));

CREATE TABLE sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_hash       text NOT NULL,
  user_agent         text,
  ip                 text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  last_used_at       timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  revoked_at         timestamptz
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE otp_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES users(id) ON DELETE CASCADE,
  target_hash  text NOT NULL,             -- HMAC of the email/phone the code was sent to
  channel      text NOT NULL CHECK (channel IN ('email','sms')),
  purpose      text NOT NULL CHECK (purpose IN ('verify_email','verify_phone','login','reset_password','change_email','change_phone')),
  code_hash    text NOT NULL,
  payload      jsonb,
  attempts     integer NOT NULL DEFAULT 0,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_lookup_idx ON otp_codes(target_hash, purpose, created_at DESC);

CREATE TABLE guardian_consents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  guardian_email citext NOT NULL,
  guardian_name  text,
  decision    text CHECK (decision IN ('granted','denied')),
  decided_at  timestamptz,
  ip          text,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE follows (
  follower_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
CREATE INDEX follows_following_idx ON follows(following_id);

CREATE TABLE blocks (
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE company_members (
  company_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id)
);

-- ───────────────────────────── Events ─────────────────────────────
CREATE TABLE events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title               text NOT NULL,
  description         text NOT NULL,
  category            text NOT NULL,
  cover_url           text,
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','completed','cancelled')),
  is_outdoor          boolean NOT NULL DEFAULT false,
  start_at            timestamptz NOT NULL,
  end_at              timestamptz NOT NULL,
  location_name       text,
  address             text,
  lat                 double precision,
  lng                 double precision,
  capacity            integer NOT NULL CHECK (capacity > 0),
  skills_needed       text[] NOT NULL DEFAULT '{}',
  requirements        text,
  min_age             integer,
  checkin_grace_min   integer NOT NULL DEFAULT 30,
  reminder_offsets    integer[] NOT NULL DEFAULT '{1440,60}',
  qr_secret           text NOT NULL,
  manual_code         text NOT NULL,
  weather             jsonb,
  weather_checked_at  timestamptz,
  published_at        timestamptz,
  completed_at        timestamptz,
  certificates_issued_at timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);
CREATE INDEX events_status_start_idx ON events(status, start_at);
CREATE INDEX events_organizer_idx ON events(organizer_id);
CREATE INDEX events_skills_idx ON events USING gin(skills_needed);

CREATE TABLE event_registrations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          text NOT NULL CHECK (status IN ('registered','waitlisted','cancelled','attended','no_show')),
  checkin_code    text NOT NULL,
  checked_in_at   timestamptz,
  checkin_method  text CHECK (checkin_method IN ('qr','event_code','manual','organizer')),
  checked_in_by   uuid REFERENCES users(id),
  hours           numeric(6,2),
  registered_by   uuid REFERENCES users(id),
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id),
  UNIQUE (event_id, checkin_code)
);
CREATE INDEX reg_user_idx ON event_registrations(user_id, status);
CREATE INDEX reg_event_status_idx ON event_registrations(event_id, status, created_at);

CREATE TABLE event_gallery (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url         text NOT NULL,
  caption     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE teams (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name             text NOT NULL,
  role_description text,
  lead_id          uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE team_members (
  team_id   uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      text,
  added_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE reviews (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  reviewer_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organizer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating       integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, reviewer_id)
);
CREATE INDEX reviews_org_idx ON reviews(organizer_id);

CREATE TABLE discussions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id   uuid REFERENCES discussions(id) ON DELETE CASCADE,
  body        text NOT NULL,
  is_pinned   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX discussions_event_idx ON discussions(event_id, created_at);

-- ───────────────────────────── Social feed ─────────────────────────────
CREATE TABLE posts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL DEFAULT 'post' CHECK (kind IN ('post','event','request','milestone','gallery')),
  body        text,
  media       jsonb NOT NULL DEFAULT '[]',
  event_id    uuid REFERENCES events(id) ON DELETE CASCADE,
  request_type text CHECK (request_type IN ('blood','resource')),
  request_id  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX posts_author_idx ON posts(author_id, created_at DESC);
CREATE INDEX posts_created_idx ON posts(created_at DESC);

CREATE TABLE post_likes (
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE TABLE post_bookmarks (
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE TABLE post_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id   uuid REFERENCES post_comments(id) ON DELETE CASCADE,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX comments_post_idx ON post_comments(post_id, created_at);

CREATE TABLE polls (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id    uuid REFERENCES events(id) ON DELETE CASCADE,
  post_id     uuid REFERENCES posts(id) ON DELETE CASCADE,
  question    text NOT NULL,
  multi       boolean NOT NULL DEFAULT false,
  closes_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE poll_options (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id   uuid NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  label     text NOT NULL,
  position  integer NOT NULL DEFAULT 0
);
CREATE TABLE poll_votes (
  poll_id    uuid NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  option_id  uuid NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, option_id, user_id)
);

-- ───────────────────────────── Chat ─────────────────────────────
CREATE TABLE conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type            text NOT NULL CHECK (type IN ('dm','team')),
  team_id         uuid UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
  dm_key          text UNIQUE,         -- "<smaller uuid>:<larger uuid>" for DMs
  title           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE conversation_members (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at    timestamptz NOT NULL DEFAULT now(),
  joined_at       timestamptz NOT NULL DEFAULT now(),
  muted           boolean NOT NULL DEFAULT false,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX conv_members_user_idx ON conversation_members(user_id);
CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            text,
  attachments     jsonb NOT NULL DEFAULT '[]',
  created_at      timestamptz NOT NULL DEFAULT now(),
  edited_at       timestamptz,
  deleted_at      timestamptz
);
CREATE INDEX messages_conv_idx ON messages(conversation_id, created_at DESC);

-- ───────────────────────────── Certificates ─────────────────────────────
CREATE TABLE certificates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL UNIQUE REFERENCES event_registrations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id        uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  serial          text NOT NULL UNIQUE,
  hours           numeric(6,2) NOT NULL,
  issued_at       timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────────── Requests & donations ─────────────────────────────
CREATE TABLE blood_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blood_group     text NOT NULL,
  component       text NOT NULL DEFAULT 'whole_blood',
  units_needed    integer NOT NULL CHECK (units_needed > 0),
  units_pledged   integer NOT NULL DEFAULT 0,
  units_received  integer NOT NULL DEFAULT 0,
  patient_label   text,
  hospital_name   text NOT NULL,
  address         text,
  lat             double precision NOT NULL,
  lng             double precision NOT NULL,
  urgency         text NOT NULL DEFAULT 'urgent' CHECK (urgency IN ('normal','urgent','critical')),
  radius_km       integer NOT NULL DEFAULT 25,
  contact_enc     text,
  notes           text,
  is_rare         boolean NOT NULL DEFAULT false,
  needed_by       timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','fulfilled','closed')),
  deadline_prompted_at timestamptz,
  broadcast_count integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX blood_status_idx ON blood_requests(status, needed_by);

CREATE TABLE blood_responses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
  donor_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'pledged' CHECK (status IN ('pledged','donated','cancelled')),
  message     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, donor_id)
);

CREATE TABLE resource_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text NOT NULL,
  category      text NOT NULL,
  cover_url     text,
  location_name text,
  address       text,
  lat           double precision,
  lng           double precision,
  deadline      timestamptz,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','fulfilled','closed')),
  deadline_prompted_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX resource_status_idx ON resource_requests(status, created_at DESC);

CREATE TABLE resource_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id        uuid NOT NULL REFERENCES resource_requests(id) ON DELETE CASCADE,
  name              text NOT NULL,
  unit              text NOT NULL DEFAULT 'units',
  quantity_needed   integer NOT NULL CHECK (quantity_needed > 0),
  quantity_pledged  integer NOT NULL DEFAULT 0,
  quantity_received integer NOT NULL DEFAULT 0,
  position          integer NOT NULL DEFAULT 0
);
CREATE TABLE pledges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES resource_requests(id) ON DELETE CASCADE,
  item_id     uuid NOT NULL REFERENCES resource_items(id) ON DELETE CASCADE,
  donor_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quantity    integer NOT NULL CHECK (quantity > 0),
  status      text NOT NULL DEFAULT 'pledged' CHECK (status IN ('pledged','delivered','cancelled')),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pledges_request_idx ON pledges(request_id);

-- ───────────────────────────── Trust & safety ─────────────────────────────
CREATE TABLE verification_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doc_type     text NOT NULL,
  documents    jsonb NOT NULL DEFAULT '[]',   -- [{key,name,mime,size}] stored encrypted
  note         text,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewer_id  uuid REFERENCES users(id),
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  reviewed_at  timestamptz,
  docs_purged_at timestamptz
);
CREATE INDEX verification_status_idx ON verification_requests(status, created_at);

CREATE TABLE reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type     text NOT NULL CHECK (target_type IN ('user','event','post','comment','discussion','message','blood_request','resource_request','safety')),
  target_id       uuid NOT NULL,
  reason          text NOT NULL,
  details         text,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
  action_taken    text,
  resolver_id     uuid REFERENCES users(id),
  resolution_note text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);
CREATE INDEX reports_status_idx ON reports(status, created_at);

CREATE TABLE audit_logs (
  id          bigserial PRIMARY KEY,
  actor_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  target_type text,
  target_id   text,
  meta        jsonb,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────────── Engagement ─────────────────────────────
CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        text NOT NULL,
  category    text NOT NULL DEFAULT 'system',
  title       text NOT NULL,
  body        text,
  link        text,
  data        jsonb,
  priority    text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','high')),
  dedupe_key  text UNIQUE,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications(user_id, created_at DESC);

CREATE TABLE push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL UNIQUE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_badges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code        text NOT NULL,
  title       text NOT NULL,
  description text,
  icon        text,
  awarded_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, code)
);

CREATE TABLE geocode_cache (
  query      text PRIMARY KEY,
  result     jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
