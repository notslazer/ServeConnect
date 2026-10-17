import { decrypt } from '../../lib/crypto';
import { one, q } from '../../db/pool';
import { fuzz } from '../../lib/geo';
import { camel } from '../../lib/case';

/** The signed-in user's own full view of their account (sensitive fields decrypted). */
export async function selfView(u: any) {
  const badges = await q('SELECT code, title, description, icon, awarded_at FROM user_badges WHERE user_id=$1 ORDER BY awarded_at DESC', [u.id]);
  return camel({
    id: u.id,
    name: u.name,
    handle: u.handle,
    email: u.email,
    phone: decrypt(u.phone_enc),
    role: u.role,
    email_verified: u.email_verified,
    phone_verified: u.phone_verified,
    has_password: Boolean(u.password_hash),
    google_linked: Boolean(u.google_id),
    avatar_url: u.avatar_url,
    cover_url: u.cover_url,
    headline: u.headline,
    bio: u.bio,
    website: u.website,
    location_name: u.location_name,
    lat: u.lat,
    lng: u.lng,
    date_of_birth: u.date_of_birth,
    is_minor: u.is_minor,
    guardian_email: u.guardian_email,
    guardian_consent: u.guardian_consent,
    org_type: u.org_type,
    org_registration_no: u.org_registration_no,
    verification_status: u.verification_status,
    verified_at: u.verified_at,
    skills: u.skills,
    interests: u.interests,
    privacy: u.privacy,
    blood_group: decrypt(u.blood_group_enc),
    is_blood_donor: u.is_blood_donor,
    donor_radius_km: u.donor_radius_km,
    last_donation_date: u.last_donation_date,
    notification_prefs: u.notification_prefs,
    leaderboard_opt_out: u.leaderboard_opt_out,
    two_factor_enabled: u.two_factor_enabled,
    onboarding_completed: u.onboarding_completed,
    account_status: u.account_status,
    suspended_reason: u.suspended_reason,
    company_id: u.company_id,
    csr_invite_code: u.csr_invite_code,
    created_at: u.created_at,
    badges,
  });
}

/** Lightweight card used in lists (feeds, comments, attendee lists). */
export const USER_CARD_SQL = `json_build_object('id', u.id, 'name', u.name, 'handle', u.handle, 'avatarUrl', u.avatar_url,
  'role', u.role, 'verified', u.verification_status = 'verified', 'headline', u.headline)`;

export async function profileStats(userId: string, role: string) {
  const base = await one(
    `SELECT (SELECT count(*) FROM follows WHERE following_id=$1)::int AS followers,
            (SELECT count(*) FROM follows WHERE follower_id=$1)::int AS following,
            (SELECT count(*) FROM posts WHERE author_id=$1 AND deleted_at IS NULL)::int AS posts`,
    [userId],
  );
  if (role === 'organizer' || role === 'csr' || role === 'admin') {
    const org = await one(
      `SELECT (SELECT count(*) FROM events WHERE organizer_id=$1 AND status='completed')::int AS completed_events,
              (SELECT count(*) FROM events WHERE organizer_id=$1 AND status IN ('published','completed'))::int AS hosted_events,
              (SELECT round(avg(rating)::numeric, 2) FROM reviews WHERE organizer_id=$1)::float AS avg_rating,
              (SELECT count(*) FROM reviews WHERE organizer_id=$1)::int AS review_count,
              (SELECT coalesce(sum(r.hours),0) FROM event_registrations r JOIN events e ON e.id=r.event_id
                 WHERE e.organizer_id=$1 AND r.status='attended')::float AS volunteer_hours_delivered,
              (SELECT count(DISTINCT r.user_id) FROM event_registrations r JOIN events e ON e.id=r.event_id
                 WHERE e.organizer_id=$1 AND r.status='attended')::int AS volunteers_engaged`,
      [userId],
    );
    return { ...base, ...org };
  }
  const vol = await one(
    `SELECT coalesce(sum(hours) FILTER (WHERE status='attended'),0)::float AS verified_hours,
            count(*) FILTER (WHERE status='attended')::int AS events_attended,
            count(*) FILTER (WHERE status='no_show')::int AS no_shows,
            count(*) FILTER (WHERE status IN ('registered','waitlisted'))::int AS upcoming
       FROM event_registrations WHERE user_id=$1`,
    [userId],
  );
  const donations = await one(`SELECT count(*)::int AS n FROM blood_responses WHERE donor_id=$1 AND status='donated'`, [userId]);
  const pledges = await one(`SELECT count(*)::int AS n FROM pledges WHERE donor_id=$1 AND status<>'cancelled'`, [userId]);
  return { ...base, ...vol, blood_donations: donations!.n, pledges: pledges!.n };
}

/** Public profile as seen by `viewer` — applies per-field privacy and minor-safety rules (REQ-PROF-6, SRS §5.2). */
export async function publicView(u: any, viewer?: { id: string; role: string } | null) {
  const isSelf = viewer?.id === u.id;
  const isStaff = viewer?.role === 'admin';
  const isFollower = viewer
    ? Boolean(await one('SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2', [viewer.id, u.id]))
    : false;
  const followsYou = viewer
    ? Boolean(await one('SELECT 1 FROM follows WHERE follower_id=$2 AND following_id=$1', [viewer.id, u.id]))
    : false;
  const can = (field: string) => {
    if (isSelf || isStaff) return true;
    if (u.is_minor && ['email', 'phone', 'location', 'dob'].includes(field)) return false;
    const p = u.privacy?.[field] ?? 'private';
    return p === 'public' || (p === 'followers' && isFollower);
  };
  const stats: any = await profileStats(u.id, u.role);
  // No-show count is an organizer-only metric (REQ-EVT-5).
  const canSeeNoShows = isSelf || isStaff || viewer?.role === 'organizer';
  if (!canSeeNoShows) delete stats.no_shows;
  if (!can('hours')) delete stats.verified_hours;

  const badges = await q('SELECT code, title, description, icon, awarded_at FROM user_badges WHERE user_id=$1 ORDER BY awarded_at DESC', [u.id]);
  const { streak } = await import('../gamification/service').then((m) => m.computeStreak(u.id));
  return camel({
    id: u.id,
    name: u.name,
    handle: u.handle,
    role: u.role,
    avatar_url: u.avatar_url,
    cover_url: u.cover_url,
    headline: u.headline,
    bio: u.bio,
    website: u.website,
    org_type: u.org_type,
    verified: u.verification_status === 'verified',
    verification_status: isSelf || isStaff ? u.verification_status : undefined,
    skills: u.skills,
    interests: u.interests,
    email: can('email') ? u.email : null,
    phone: can('phone') ? decrypt(u.phone_enc) : null,
    location_name: can('location') ? u.location_name : null,
    lat: can('location') ? fuzz(u.lat) : null,
    lng: can('location') ? fuzz(u.lng) : null,
    is_minor: isSelf || isStaff ? u.is_minor : undefined,
    account_status: u.account_status,
    created_at: u.created_at,
    is_following: isFollower,
    follows_you: followsYou,
    is_self: isSelf,
    stats,
    streak,
    badges,
  });
}
