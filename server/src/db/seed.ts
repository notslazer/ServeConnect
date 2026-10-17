/* Demo data for local development and project demos (Chennai-based, fictional organizations).
 *   npm run seed            → seeds only if the database has no users
 *   npm run seed -- --reset → wipes ALL data first (never run against production!) */
import bcrypt from 'bcryptjs';
import { pool, one, q } from './pool';
import { migrate } from './migrate';
import { blindIndex, encrypt, randomCode, randomToken } from '../lib/crypto';
import { awardMilestones } from '../modules/gamification/service';
import { muteMail } from '../lib/mailer';

const PASSWORD = 'Password@123';
const DAY = 86400_000;
const at = (days: number, hour = 9) => {
  const d = new Date(Date.now() + days * DAY);
  d.setHours(hour, 0, 0, 0);
  return d;
};

interface U { name: string; handle: string; email: string; role: string; phone?: string; skills?: string[]; interests?: string[]; lat?: number; lng?: number; loc?: string; verified?: boolean; orgType?: string; headline?: string; bio?: string; blood?: string; dob?: string; minor?: boolean; guardian?: string }

async function user(u: U, hash: string) {
  const row = await one(
    `INSERT INTO users (name, handle, email, email_verified, phone_enc, phone_hash, phone_verified, password_hash, role, org_type, verification_status, verified_at,
                        skills, interests, lat, lng, location_name, headline, bio, blood_group_enc, blood_group_hash, is_blood_donor, date_of_birth,
                        is_minor, guardian_email, guardian_consent, onboarding_completed, terms_accepted_at, csr_invite_code, privacy)
     VALUES ($1,$2,$3,true,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,true,now(),$26,$27) RETURNING id`,
    [
      u.name, u.handle, u.email, encrypt(u.phone ?? null), u.phone ? blindIndex(u.phone) : null, Boolean(u.phone), hash, u.role, u.orgType ?? null,
      u.verified ? 'verified' : 'unverified', u.verified ? new Date() : null, u.skills ?? [], u.interests ?? [], u.lat ?? null, u.lng ?? null, u.loc ?? null,
      u.headline ?? null, u.bio ?? null, encrypt(u.blood ?? null), u.blood ? blindIndex(u.blood) : null, Boolean(u.blood), u.dob ?? null,
      Boolean(u.minor), u.guardian ?? null, u.minor ? 'pending' : 'not_required', u.role === 'csr' ? 'NIMBUS24' : null,
      JSON.stringify({ email: u.role === 'volunteer' ? 'private' : 'public', phone: 'private', location: 'public', dob: 'private', hours: 'public' }),
    ],
  );
  return row!.id as string;
}

async function event(organizerId: string, e: any) {
  const row = await one(
    `INSERT INTO events (organizer_id, title, description, category, start_at, end_at, location_name, address, lat, lng, is_outdoor, capacity, skills_needed,
                         requirements, qr_secret, manual_code, status, published_at, completed_at, cover_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, now(), $18, $19) RETURNING id`,
    [
      organizerId, e.title, e.description, e.category, e.start, e.end, e.loc, e.address ?? null, e.lat, e.lng, e.outdoor ?? false, e.capacity, e.skills ?? [],
      e.requirements ?? null, randomToken(24), randomCode(6), e.status ?? 'published', e.status === 'completed' ? e.end : null, e.cover ?? null,
    ],
  );
  return row!.id as string;
}

async function register(eventId: string, userId: string, status: string, hours?: number, checkedAt?: Date) {
  await q(
    `INSERT INTO event_registrations (event_id, user_id, status, checkin_code, hours, checked_in_at, checkin_method, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now() - (random() * interval '10 days'))`,
    [eventId, userId, status, randomCode(6), hours ?? null, checkedAt ?? null, checkedAt ? 'qr' : null],
  );
}

async function main() {
  await migrate(false);
  muteMail(true); // never email the fictional demo addresses
  const reset = process.argv.includes('--reset');
  const existing = await one('SELECT count(*)::int AS n FROM users');
  if (existing!.n > 0 && !reset) {
    console.log('Database already has users — skipping seed. Use `npm run seed -- --reset` to wipe and reseed (DEV ONLY).');
    return;
  }
  if (reset) {
    const tables = (await q(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'schema_migrations'`)).map((t) => `"${t.tablename}"`);
    await q(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
    console.log('Wiped existing data.');
  }
  const hash = await bcrypt.hash(PASSWORD, 10);

  // ── People ──
  const admin = await user({ name: 'Platform Admin', handle: 'admin', email: 'admin@serveconnect.app', role: 'admin', verified: true, headline: 'ServeConnect moderation team', lat: 12.9716, lng: 80.2209, loc: 'Chennai' }, hash);
  const greenCoast = await user({ name: 'Green Coast Trust', handle: 'greencoast', email: 'hello@greencoast.example', role: 'organizer', orgType: 'ngo', verified: true, lat: 12.9982, lng: 80.2707, loc: 'Besant Nagar, Chennai', headline: 'Protecting Chennai’s beaches and wetlands since 2012', bio: 'We organise weekly beach clean-ups, mangrove planting drives and environmental awareness programmes along the Coromandel coast.', interests: ['environment', 'cleanup'] }, hash);
  const akshara = await user({ name: 'Akshara Learning Foundation', handle: 'akshara', email: 'team@akshara.example', role: 'organizer', orgType: 'ngo', verified: true, lat: 13.0418, lng: 80.2341, loc: 'T. Nagar, Chennai', headline: 'Free after-school learning for 1,200 children', bio: 'Volunteer tutors teach maths, English and digital skills to children from low-income families in Chennai.', interests: ['education'] }, hash);
  const lifeline = await user({ name: 'Lifeline Blood Network', handle: 'lifeline', email: 'care@lifeline.example', role: 'organizer', orgType: 'ngo', verified: true, lat: 13.0067, lng: 80.2206, loc: 'Guindy, Chennai', headline: 'Connecting donors to patients in minutes', bio: 'We run monthly blood donation camps with partner hospitals and maintain a rare-blood-group donor registry.', interests: ['blood_camp', 'health'] }, hash);
  const annapoorna = await user({ name: 'Annapoorna Food Bank', handle: 'annapoorna', email: 'food@annapoorna.example', role: 'organizer', orgType: 'ngo', verified: true, lat: 12.9249, lng: 80.1000, loc: 'Tambaram, Chennai', headline: 'No one in our neighbourhood sleeps hungry', bio: 'Daily community kitchen and monthly ration kit distribution for 400 families.', interests: ['donation_camp'] }, hash);
  const karthik = await user({ name: 'Karthik Raman', handle: 'karthikr', email: 'karthik@example.com', role: 'organizer', orgType: 'independent', lat: 12.9010, lng: 80.2279, loc: 'Sholinganallur, Chennai', headline: 'Neighbourhood clean-up organiser', interests: ['cleanup'] }, hash);
  const nimbus = await user({ name: 'Nimbus Technologies CSR', handle: 'nimbuscsr', email: 'csr@nimbus.example', role: 'csr', orgType: 'company', verified: true, lat: 12.9716, lng: 80.2459, loc: 'OMR, Chennai', headline: 'Employee volunteering programme' }, hash);

  const vols: [string, U][] = [
    ['priya', { name: 'Priya Subramanian', handle: 'priya', email: 'priya@example.com', role: 'volunteer', phone: '+919800000001', skills: ['medical', 'first_aid', 'nursing'], interests: ['health', 'blood_camp'], lat: 13.0108, lng: 80.2120, loc: 'Saidapet, Chennai', headline: 'Staff nurse · weekend volunteer', blood: 'O-', dob: '1996-04-12' }],
    ['arjun', { name: 'Arjun Mehta', handle: 'arjun', email: 'arjun@example.com', role: 'volunteer', phone: '+919800000002', skills: ['teaching', 'tech', 'tutoring'], interests: ['education'], lat: 13.0358, lng: 80.2440, loc: 'Nungambakkam, Chennai', headline: 'Software engineer who loves teaching', blood: 'B+', dob: '1994-09-03' }],
    ['divya', { name: 'Divya Krishnan', handle: 'divya', email: 'divya@example.com', role: 'volunteer', phone: '+919800000003', skills: ['photography', 'social_media', 'design'], interests: ['environment', 'cleanup'], lat: 12.9900, lng: 80.2560, loc: 'Adyar, Chennai', headline: 'Photographer · storyteller', blood: 'A+', dob: '1999-01-22' }],
    ['rahul', { name: 'Rahul Verma', handle: 'rahul', email: 'rahul@example.com', role: 'volunteer', phone: '+919800000004', skills: ['driving', 'logistics', 'general'], interests: ['donation_camp', 'disaster_relief'], lat: 12.9230, lng: 80.1270, loc: 'Chromepet, Chennai', headline: 'Has a van, will deliver', blood: 'O+', dob: '1990-07-15' }],
    ['meena', { name: 'Meena Iyer', handle: 'meena', email: 'meena@example.com', role: 'volunteer', phone: '+919800000005', skills: ['cooking', 'elder_care'], interests: ['donation_camp', 'elder_care'], lat: 12.9500, lng: 80.1400, loc: 'Pallavaram, Chennai', headline: 'Retired teacher', blood: 'AB-', dob: '1962-11-30' }],
    ['vikram', { name: 'Vikram Natarajan', handle: 'vikram', email: 'vikram@example.com', role: 'volunteer', phone: '+919800000006', skills: ['first_aid', 'disaster_response', 'driving'], interests: ['disaster_relief', 'cleanup'], lat: 12.9800, lng: 80.2200, loc: 'Velachery, Chennai', headline: 'Civil defence volunteer', blood: 'B-', dob: '1988-02-08' }],
    ['sneha', { name: 'Sneha Reddy', handle: 'sneha', email: 'sneha@example.com', role: 'volunteer', skills: ['teaching', 'translation', 'sign_language'], interests: ['education'], lat: 13.0600, lng: 80.2500, loc: 'Egmore, Chennai', headline: 'Speech therapist', dob: '1997-06-18' }],
    ['farhan', { name: 'Farhan Ali', handle: 'farhan', email: 'farhan@example.com', role: 'volunteer', phone: '+919800000008', skills: ['environment', 'general', 'construction'], interests: ['environment', 'cleanup'], lat: 12.9950, lng: 80.2650, loc: 'Thiruvanmiyur, Chennai', blood: 'O+', dob: '2001-03-05' }],
    ['lakshmi', { name: 'Lakshmi Narayan', handle: 'lakshmi', email: 'lakshmi@example.com', role: 'volunteer', skills: ['event_management', 'fundraising'], interests: ['fundraiser', 'education'], lat: 13.0827, lng: 80.2707, loc: 'Chennai Central', dob: '1993-12-01' }],
    ['aditya', { name: 'Aditya Sharma', handle: 'aditya', email: 'aditya@example.com', role: 'volunteer', skills: ['tech', 'design'], interests: ['education', 'environment'], lat: 12.9716, lng: 80.2459, loc: 'Perungudi, Chennai', dob: '1998-08-21' }],
    ['kavya', { name: 'Kavya Ramesh', handle: 'kavya', email: 'kavya@example.com', role: 'volunteer', skills: ['animal_care', 'general'], interests: ['animal_welfare', 'cleanup'], lat: 12.9600, lng: 80.2400, loc: 'Taramani, Chennai', dob: '2009-05-14', minor: true, guardian: 'parent.kavya@example.com' }],
  ];
  const V: Record<string, string> = {};
  for (const [k, u] of vols) V[k] = await user(u, hash);
  // Employees of Nimbus
  for (const k of ['arjun', 'aditya', 'lakshmi']) {
    await q('INSERT INTO company_members (company_id, user_id) VALUES ($1,$2)', [nimbus, V[k]]);
    await q('UPDATE users SET company_id=$2 WHERE id=$1', [V[k], nimbus]);
  }

  // ── Follows ──
  const follow = (a: string, b: string) => q('INSERT INTO follows (follower_id, following_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [a, b]);
  for (const v of Object.values(V)) for (const o of [greenCoast, akshara, lifeline]) if (Math.random() > 0.3) await follow(v, o);
  await follow(V.priya, lifeline); await follow(V.arjun, akshara); await follow(V.divya, greenCoast); await follow(V.rahul, annapoorna);
  await follow(V.priya, V.divya); await follow(V.divya, V.priya); await follow(V.arjun, V.sneha); await follow(V.farhan, V.divya);

  // ── Past (completed) events with verified attendance ──
  const beach1 = await event(greenCoast, { title: 'Elliot’s Beach Sunrise Clean-up', description: 'Join 60+ volunteers to clear plastic and fishing nets from Elliot’s Beach before the morning crowd. Gloves, bags and refreshments provided. Wear comfortable shoes and bring a water bottle.', category: 'cleanup', start: at(-40, 6), end: at(-40, 9), loc: 'Elliot’s Beach, Besant Nagar', lat: 12.9993, lng: 80.2718, outdoor: true, capacity: 80, skills: ['environment', 'general'], status: 'completed' });
  const tutor1 = await event(akshara, { title: 'Weekend Maths Tutoring Marathon', description: 'Help Class 8–10 students prepare for their board exams. Volunteers are paired with 3–4 students each. Materials are provided; you just need patience and a love for numbers.', category: 'education', start: at(-25, 10), end: at(-25, 14), loc: 'Akshara Centre, T. Nagar', lat: 13.0418, lng: 80.2341, capacity: 25, skills: ['teaching', 'tutoring'], status: 'completed' });
  const bloodCamp1 = await event(lifeline, { title: 'Guindy Industrial Estate Blood Donation Camp', description: 'Quarterly blood donation camp with Government Hospital blood bank. Volunteers needed for registration desk, donor care and refreshments. Medical volunteers assist the phlebotomy team.', category: 'blood_camp', start: at(-12, 9), end: at(-12, 16), loc: 'SIDCO Hall, Guindy', lat: 13.0100, lng: 80.2120, capacity: 30, skills: ['medical', 'first_aid', 'event_management'], status: 'completed' });
  const food1 = await event(annapoorna, { title: 'Ration Kit Packing Drive', description: 'Pack 400 monthly ration kits (rice, dal, oil, spices) for families in Tambaram and Chromepet. Drivers needed to deliver kits to 6 distribution points.', category: 'donation_camp', start: at(-6, 8), end: at(-6, 13), loc: 'Annapoorna Warehouse, Tambaram', lat: 12.9249, lng: 80.1000, capacity: 40, skills: ['logistics', 'driving', 'general'], status: 'completed' });

  const attend = async (eventId: string, keys: string[], noShow: string[] = [], hours = 3, when: Date = new Date()) => {
    for (const k of keys) await register(eventId, V[k], 'attended', hours, when);
    for (const k of noShow) await register(eventId, V[k], 'no_show');
  };
  await attend(beach1, ['priya', 'divya', 'farhan', 'vikram', 'rahul', 'aditya'], ['lakshmi'], 3, at(-40, 6));
  await attend(tutor1, ['arjun', 'sneha', 'lakshmi', 'aditya'], [], 4, at(-25, 10));
  await attend(bloodCamp1, ['priya', 'vikram', 'meena', 'divya'], ['rahul'], 7, at(-12, 9));
  await attend(food1, ['rahul', 'meena', 'farhan', 'arjun', 'priya'], [], 5, at(-6, 8));

  const review = (e: string, k: string, org: string, rating: number, body: string) =>
    q('INSERT INTO reviews (event_id, reviewer_id, organizer_id, rating, body) VALUES ($1,$2,$3,$4,$5)', [e, V[k], org, rating, body]);
  await review(beach1, 'priya', greenCoast, 5, 'Superbly organised — clear briefing, enough gloves and bags for everyone. We cleared 400 kg of waste!');
  await review(beach1, 'divya', greenCoast, 5, 'Got some great sunrise shots of the team. Will be back next month.');
  await review(beach1, 'farhan', greenCoast, 4, 'Great energy. Would love more segregation bins next time.');
  await review(tutor1, 'arjun', akshara, 5, 'The kids were so eager to learn. Very well-structured session plans.');
  await review(tutor1, 'sneha', akshara, 4, 'Lovely experience; a bit crowded in the afternoon batch.');
  await review(bloodCamp1, 'priya', lifeline, 5, '112 units collected! Professional medical team and great donor care.');
  await review(food1, 'rahul', annapoorna, 5, 'Delivered 70 kits in my van. Efficient routing by the team.');

  // ── Upcoming events ──
  const beach2 = await event(greenCoast, { title: 'Pallikaranai Marsh Restoration Drive', description: 'Remove invasive plants and plastic from the edge of the Pallikaranai marshland, one of Chennai’s last natural wetlands and home to 115 bird species. Expect mud! Boots and gloves provided. Bird-watching walk after the drive.', category: 'environment', start: at(3, 7), end: at(3, 11), loc: 'Pallikaranai Marsh Eco Park', address: 'Velachery Main Rd, Pallikaranai, Chennai 600100', lat: 12.9386, lng: 80.2122, outdoor: true, capacity: 50, skills: ['environment', 'general', 'photography'], requirements: 'Closed shoes, hat, water bottle. Minimum age 14.' });
  const tutor2 = await event(akshara, { title: 'Digital Literacy Workshop for Teens', description: 'Teach 40 teenagers the basics of safe internet use, email, spreadsheets and online job applications. We need volunteers comfortable explaining technology in simple English or Tamil.', category: 'education', start: at(8, 10), end: at(8, 15), loc: 'Akshara Centre, T. Nagar', lat: 13.0418, lng: 80.2341, capacity: 4, skills: ['tech', 'teaching', 'translation'] });
  const bloodCamp2 = await event(lifeline, { title: 'Mega Blood Donation Camp — World Blood Donor Week', description: 'Our biggest camp of the year with 4 partner hospitals. We need registration desk volunteers, donor-care volunteers, medical volunteers and social media help. Donors: eat a good meal before donating and carry an ID.', category: 'blood_camp', start: at(15, 9), end: at(15, 17), loc: 'Chennai Trade Centre, Nandambakkam', lat: 13.0166, lng: 80.1847, capacity: 60, skills: ['medical', 'first_aid', 'event_management', 'social_media'] });
  const relief = await event(annapoorna, { title: 'Monsoon Preparedness: Relief Kit Assembly', description: 'Assemble 1,000 emergency kits (torch, ORS, dry food, tarpaulin, first-aid supplies) to pre-position in flood-prone areas before the north-east monsoon.', category: 'disaster_relief', start: at(21, 9), end: at(21, 15), loc: 'Annapoorna Warehouse, Tambaram', lat: 12.9249, lng: 80.1000, capacity: 70, skills: ['logistics', 'disaster_response', 'driving', 'general'] });
  await event(karthik, { title: 'OMR Lake Bund Clean-up', description: 'Draft: neighbourhood clean-up of the Sholinganallur lake bund. Waiting for verification before publishing.', category: 'cleanup', start: at(10, 7), end: at(10, 10), loc: 'Sholinganallur Lake', lat: 12.9010, lng: 80.2279, outdoor: true, capacity: 20, status: 'draft' });

  for (const k of ['priya', 'divya', 'farhan', 'vikram', 'aditya']) await register(beach2, V[k], 'registered');
  for (const k of ['arjun', 'aditya', 'sneha', 'lakshmi']) await register(tutor2, V[k], 'registered');
  await register(tutor2, V.divya, 'waitlisted');
  for (const k of ['priya', 'vikram', 'meena', 'lakshmi']) await register(bloodCamp2, V[k], 'registered');
  for (const k of ['rahul', 'meena', 'farhan']) await register(relief, V[k], 'registered');

  // Team with chat for the marsh drive
  const team = await one(`INSERT INTO teams (event_id, name, role_description, lead_id) VALUES ($1,'Wetland Crew','Invasive plant removal along the north bund',$2) RETURNING id`, [beach2, V.vikram]);
  const conv = await one(`INSERT INTO conversations (type, team_id, title) VALUES ('team',$1,'Wetland Crew · Pallikaranai Marsh Restoration Drive') RETURNING id`, [team!.id]);
  for (const k of ['vikram', 'farhan', 'aditya']) await q('INSERT INTO team_members (team_id, user_id, role) VALUES ($1,$2,$3)', [team!.id, V[k], k === 'vikram' ? 'Team lead' : null]);
  for (const u of [V.vikram, V.farhan, V.aditya, greenCoast]) await q('INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1,$2)', [conv!.id, u]);
  await q(`INSERT INTO messages (conversation_id, sender_id, body, created_at) VALUES ($1,$2,'Hi team! Meet at the Eco Park gate at 6:45 sharp. I will bring extra gloves.', now() - interval '3 hours'), ($1,$3,'Count me in. Should we carry sickles for the water hyacinth?', now() - interval '2 hours'), ($1,$4,'Tools are provided — just wear boots. Thanks for leading, Vikram!', now() - interval '1 hour')`, [conv!.id, V.vikram, V.farhan, greenCoast]);

  // ── Feed posts ──
  const post = (a: string, body: string, kind = 'post', eventId: string | null = null, hoursAgo = 1) =>
    q(`INSERT INTO posts (author_id, kind, body, event_id, created_at) VALUES ($1,$2,$3,$4, now() - ($5 || ' hours')::interval)`, [a, kind, body, eventId, hoursAgo]);
  await post(greenCoast, '🌊 400 kg of plastic removed from Elliot’s Beach in 3 hours by 6 incredible volunteers! Thank you everyone who showed up at 6 AM. #BeachCleanup #ChennaiVolunteers', 'post', null, 960);
  await post(greenCoast, '📅 New event: Pallikaranai Marsh Restoration Drive', 'event', beach2, 50);
  await post(akshara, 'Our students scored an average of 78% in the mock board exams — up from 61% last term. This is what consistent volunteer tutoring does. 📚 #Education #VolunteerTutors', 'post', null, 120);
  await post(akshara, '📅 New event: Digital Literacy Workshop for Teens', 'event', tutor2, 30);
  await post(lifeline, '🩸 112 units collected at the Guindy camp — enough to help up to 330 patients. Our rare-group registry now has 48 O-negative donors. Register as a donor in Settings → Blood donation. #DonateBlood', 'post', null, 280);
  await post(lifeline, '📅 New event: Mega Blood Donation Camp — World Blood Donor Week', 'event', bloodCamp2, 10);
  await post(annapoorna, '📅 New event: Monsoon Preparedness: Relief Kit Assembly', 'event', relief, 5);
  await post(V.divya, 'Sunrise at Elliot’s Beach, right before 60 people turned up with gloves and bags. Best Saturday ever. 🌅 #BeachCleanup', 'post', null, 950);
  await post(V.arjun, 'Spent my Saturday teaching quadratic equations to 4 brilliant kids at Akshara. One of them solved a problem I couldn’t at her age. Highly recommend volunteering here! #VolunteerTutors', 'post', null, 590);
  await post(V.priya, 'Reminder for first-time donors: hydrate well, eat iron-rich food the day before, and carry an ID. See you at the mega camp! #DonateBlood', 'post', null, 8);

  // Poll on a post
  const pollPost = await one(`INSERT INTO posts (author_id, body, created_at) VALUES ($1, 'Help us plan our next drive! Which would you join?', now() - interval '20 hours') RETURNING id`, [greenCoast]);
  const poll = await one(`INSERT INTO polls (creator_id, post_id, question) VALUES ($1,$2,'Next Green Coast drive') RETURNING id`, [greenCoast, pollPost!.id]);
  const opts: string[] = [];
  for (const [i, label] of ['Mangrove planting at Adyar estuary', 'Turtle nest patrol (night walk)', 'Plastic-free market awareness'].entries()) {
    opts.push((await one('INSERT INTO poll_options (poll_id, label, position) VALUES ($1,$2,$3) RETURNING id', [poll!.id, label, i]))!.id);
  }
  for (const [k, o] of [['priya', 1], ['divya', 1], ['farhan', 0], ['vikram', 1], ['aditya', 2]] as const) await q('INSERT INTO poll_votes (poll_id, option_id, user_id) VALUES ($1,$2,$3)', [poll!.id, opts[o], V[k]]);

  // Likes/comments
  const posts = await q('SELECT id, author_id FROM posts');
  for (const p of posts) for (const v of Object.values(V)) if (Math.random() > 0.55 && v !== p.author_id) await q('INSERT INTO post_likes (post_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [p.id, v]);
  const first = posts[0];
  await q(`INSERT INTO post_comments (post_id, author_id, body) VALUES ($1,$2,'So proud to be part of this! 💚'), ($1,$3,'When is the next one?')`, [first.id, V.farhan, V.aditya]);

  await q('UPDATE posts SET updated_at = created_at');

  // Discussion board
  const d1 = await one(`INSERT INTO discussions (event_id, author_id, body) VALUES ($1,$2,'Is there parking near the Eco Park entrance?') RETURNING id`, [beach2, V.aditya]);
  await q(`INSERT INTO discussions (event_id, author_id, parent_id, body) VALUES ($1,$2,$3,'Yes — free two-wheeler parking at the gate, cars can park on the service road.')`, [beach2, greenCoast, d1!.id]);

  // ── Requests ──
  await q(
    `INSERT INTO blood_requests (requester_id, blood_group, units_needed, patient_label, hospital_name, address, lat, lng, urgency, radius_km, contact_enc, needed_by, notes, is_rare)
     VALUES ($1,'O-',3,'Post-surgery patient, 54 y','Government General Hospital','Park Town, Chennai 600003',13.0806,80.2766,'critical',40,$2, now() + interval '20 hours','Rare group — please call before coming.',true),
            ($1,'B+',2,'Thalassemia child, 9 y','Institute of Child Health','Egmore, Chennai',13.0732,80.2588,'urgent',30,$2, now() + interval '3 days',NULL,false)`,
    [lifeline, encrypt('+914400000000')],
  );
  const rr = await one(
    `INSERT INTO resource_requests (requester_id, title, description, category, location_name, lat, lng, deadline)
     VALUES ($1,'School supplies for 120 children','Our new academic term starts soon and 120 children need basic supplies. Pledge any quantity — drop-off at our T. Nagar centre between 10 AM and 6 PM.','education','Akshara Centre, T. Nagar',13.0418,80.2341, now() + interval '12 days') RETURNING id`,
    [akshara],
  );
  const items: [string, string, number, number][] = [['Notebooks (long size)', 'pieces', 600, 240], ['Geometry boxes', 'pieces', 120, 120], ['School bags', 'pieces', 120, 35], ['Pencil sets', 'packs', 150, 60], ['Water bottles', 'pieces', 120, 0]];
  for (const [i, [name, unit, need, pledged]] of items.entries()) {
    const it = await one('INSERT INTO resource_items (request_id, name, unit, quantity_needed, quantity_pledged, position) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [rr!.id, name, unit, need, pledged, i]);
    if (pledged) await q('INSERT INTO pledges (request_id, item_id, donor_id, quantity) VALUES ($1,$2,$3,$4)', [rr!.id, it!.id, i % 2 ? V.arjun : V.lakshmi, pledged]);
  }
  await q(`INSERT INTO posts (author_id, kind, body, request_type, request_id, created_at) VALUES ($1,'request','🎁 Donation drive: School supplies for 120 children','resource',$2, now() - interval '15 hours')`, [akshara, rr!.id]);
  const food = await one(
    `INSERT INTO resource_requests (requester_id, title, description, category, location_name, lat, lng, deadline)
     VALUES ($1,'Community kitchen — weekly groceries','Our kitchen serves 250 hot meals every day. Help us stock up for the week.','food','Annapoorna Warehouse, Tambaram',12.9249,80.1000, now() + interval '6 days') RETURNING id`,
    [annapoorna],
  );
  for (const [i, [name, unit, need, pledged]] of ([['Rice', 'kg', 200, 120], ['Toor dal', 'kg', 50, 10], ['Cooking oil', 'litres', 30, 30], ['Vegetables', 'kg', 150, 40]] as const).entries()) {
    await q('INSERT INTO resource_items (request_id, name, unit, quantity_needed, quantity_pledged, position) VALUES ($1,$2,$3,$4,$5,$6)', [food!.id, name, unit, need, pledged, i]);
  }

  // Pending verification for Karthik
  await q(`INSERT INTO verification_requests (user_id, doc_type, documents, note) VALUES ($1,'government_id','[]','Independent organiser — Aadhaar uploaded (demo record without file)')`, [karthik]);
  await q(`UPDATE users SET verification_status='pending' WHERE id=$1`, [karthik]);
  // A sample report
  await q(`INSERT INTO reports (reporter_id, target_type, target_id, reason, details) VALUES ($1,'post',$2,'spam','Looks like a promotional post (demo report)')`, [V.sneha, first.id]);

  // Certificates & badges
  const { issueCertificates } = await import('../modules/events/service');
  for (const e of [beach1, tutor1, bloodCamp1, food1]) await issueCertificates(e);
  for (const id of [...Object.values(V), greenCoast, akshara, lifeline, annapoorna]) await awardMilestones(id);
  await q(`DELETE FROM notifications`); // start everyone with a clean inbox
  await q(`INSERT INTO notifications (user_id, type, category, title, body, link) SELECT id, 'welcome', 'system', 'Welcome to ServeConnect 👋', 'Explore events near you and follow causes you care about.', '/explore' FROM users`);

  console.log('\n✅ Seed complete. Every demo account uses the password:', PASSWORD);
  console.log('   admin@serveconnect.app      (Administrator)');
  console.log('   hello@greencoast.example    (Verified NGO organizer)');
  console.log('   team@akshara.example        (Verified NGO organizer)');
  console.log('   care@lifeline.example       (Verified NGO — blood requests)');
  console.log('   karthik@example.com         (Independent organizer, verification pending)');
  console.log('   csr@nimbus.example          (CSR company account, invite code NIMBUS24)');
  console.log('   priya@example.com           (Volunteer · nurse · O- blood donor)');
  console.log('   arjun@example.com           (Volunteer · teacher · Nimbus employee)');
  console.log('   kavya@example.com           (Volunteer under 18 · guardian consent pending)\n');
  void admin;
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
