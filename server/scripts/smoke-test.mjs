// End-to-end API smoke test. Run against a dev server started with seed data:
//   npm run seed -- --reset && npm run dev     (in one terminal)
//   node scripts/smoke-test.mjs                (in another)
// Requires DEV_EXPOSE_OTP=true so OTP codes are returned by the API.
const BASE = process.env.API ?? 'http://localhost:4000/api';
let pass = 0;
let fail = 0;

function jar() {
  let cookie = '';
  let token = '';
  const call = async (method, path, body, opts = {}) => {
    const headers = { ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}) };
    const res = await fetch(BASE + path, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const ct = res.headers.get('content-type') ?? '';
    const data = ct.includes('json') ? await res.json() : await res.arrayBuffer();
    if (data?.accessToken) token = data.accessToken;
    if (opts.expect && res.status !== opts.expect) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(data)}`);
    return { status: res.status, data };
  };
  return { call, setToken: (t) => (token = t), get token() { return token; } };
}

async function step(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

const stamp = Date.now().toString().slice(-6);
const vol = jar();
const org = jar();
const admin = jar();
const donor = jar();
let eventId;
let me;

console.log('\nAuth');
await step('register volunteer with email → OTP', async () => {
  const r = await vol.call('POST', '/auth/register', { name: 'Test Volunteer', email: `t${stamp}@example.com`, password: 'Secret123', role: 'volunteer', dateOfBirth: '2000-01-01', acceptTerms: true }, { expect: 201 });
  assert(r.data.devCode, 'no dev code');
  const v = await vol.call('POST', '/auth/verify', { identifier: `t${stamp}@example.com`, code: r.data.devCode }, { expect: 200 });
  me = v.data.user;
  assert(me.emailVerified, 'not verified');
});
await step('reject weak password', async () => {
  const r = await jar().call('POST', '/auth/register', { name: 'X Y', email: `w${stamp}@example.com`, password: 'short', role: 'volunteer', dateOfBirth: '2000-01-01', acceptTerms: true });
  assert(r.status === 400 && r.data.error.details.fields.password, 'expected field error');
});
await step('under-13 is rejected; under-18 needs guardian', async () => {
  const a = await jar().call('POST', '/auth/register', { name: 'Kid', email: `k${stamp}@example.com`, password: 'Secret123', role: 'volunteer', dateOfBirth: `${new Date().getFullYear() - 10}-01-01`, acceptTerms: true });
  assert(a.status === 400, 'under 13 allowed');
  const b = await jar().call('POST', '/auth/register', { name: 'Teen', email: `tn${stamp}@example.com`, password: 'Secret123', role: 'volunteer', dateOfBirth: `${new Date().getFullYear() - 15}-01-01`, acceptTerms: true });
  assert(b.status === 400 && /guardian/i.test(b.data.error.message), 'guardian not required');
});
await step('refresh token rotation', async () => {
  const r = await vol.call('POST', '/auth/refresh', null, { expect: 200 });
  assert(r.data.user.id === me.id, 'wrong user');
});
await step('password login + wrong password counts down', async () => {
  const j = jar();
  const bad = await j.call('POST', '/auth/login', { identifier: `t${stamp}@example.com`, password: 'Wrong1234' });
  assert(bad.status === 401 && /attempt/.test(bad.data.error.message), 'no attempts message');
  await j.call('POST', '/auth/login', { identifier: `t${stamp}@example.com`, password: 'Secret123' }, { expect: 200 });
});
await step('passwordless OTP login', async () => {
  const j = jar();
  const r = await j.call('POST', '/auth/otp/request', { identifier: 'priya@example.com' }, { expect: 200 });
  await j.call('POST', '/auth/otp/verify', { identifier: 'priya@example.com', code: r.data.devCode }, { expect: 200 });
});
await step('forgot + reset password', async () => {
  const j = jar();
  const r = await j.call('POST', '/auth/forgot', { identifier: `t${stamp}@example.com` }, { expect: 200 });
  await j.call('POST', '/auth/reset', { identifier: `t${stamp}@example.com`, code: r.data.devCode, newPassword: 'NewSecret456' }, { expect: 200 });
  await j.call('POST', '/auth/login', { identifier: `t${stamp}@example.com`, password: 'NewSecret456' }, { expect: 200 });
  // reset revoked old sessions → re-login the main jar
  await vol.call('POST', '/auth/login', { identifier: `t${stamp}@example.com`, password: 'NewSecret456' }, { expect: 200 });
});
await step('sessions list + revoke others', async () => {
  const s = await vol.call('GET', '/auth/sessions', null, { expect: 200 });
  assert(s.data.some((x) => x.current), 'no current session');
  await vol.call('POST', '/auth/sessions/revoke-others', {}, { expect: 200 });
});
await step('2FA setup → enable → login requires code', async () => {
  const { authenticator } = await import('otplib');
  const s = await vol.call('POST', '/auth/2fa/setup', {}, { expect: 200 });
  const en = await vol.call('POST', '/auth/2fa/enable', { code: authenticator.generate(s.data.secret) }, { expect: 200 });
  assert(en.data.backupCodes.length === 10, 'no backup codes');
  const j = jar();
  const l = await j.call('POST', '/auth/login', { identifier: `t${stamp}@example.com`, password: 'NewSecret456' }, { expect: 200 });
  assert(l.data.mfaRequired, '2FA not required');
  await j.call('POST', '/auth/2fa/verify', { mfaToken: l.data.mfaToken, code: en.data.backupCodes[0] }, { expect: 200 });
  const reuse = await jar().call('POST', '/auth/2fa/verify', { mfaToken: l.data.mfaToken, code: en.data.backupCodes[0] });
  assert(reuse.status === 401, 'backup code reusable');
  await vol.call('POST', '/auth/2fa/disable', { code: authenticator.generate(s.data.secret) }, { expect: 200 });
});

console.log('\nProfiles & social');
await step('update profile, skills, privacy, location', async () => {
  await vol.call('PATCH', '/users/me', { headline: 'Tester', skills: ['first_aid', 'environment'], interests: ['cleanup'], lat: 12.95, lng: 80.21, locationName: 'Velachery' }, { expect: 200 });
  await vol.call('PATCH', '/users/me/privacy', { email: 'followers' }, { expect: 200 });
});
await step('follow organizer + feed', async () => {
  const o = await vol.call('GET', '/users/greencoast', null, { expect: 200 });
  await vol.call('POST', `/users/${o.data.id}/follow`, {}, { expect: 200 });
  const f = await vol.call('GET', '/posts/feed', null, { expect: 200 });
  assert(f.data.items.length > 0, 'empty feed');
});
await step('create post with poll, like, comment, vote', async () => {
  const fd = new FormData();
  fd.append('body', 'Hello #ServeConnect');
  fd.append('poll', JSON.stringify({ question: 'Best day?', options: ['Sat', 'Sun'] }));
  const p = await vol.call('POST', '/posts', fd, { expect: 201 });
  await vol.call('POST', `/posts/${p.data.id}/like`, {}, { expect: 200 });
  await vol.call('POST', `/posts/${p.data.id}/comments`, { body: 'Nice' }, { expect: 201 });
  const v = await vol.call('POST', `/posts/polls/${p.data.poll.id}/vote`, { optionIds: [p.data.poll.options[0].id] }, { expect: 200 });
  assert(v.data.options[0].votes === 1, 'vote not counted');
});
await step('people search + suggestions', async () => {
  const s = await vol.call('GET', '/users/search?q=akshara', null, { expect: 200 });
  assert(s.data.length, 'no search results');
  await vol.call('GET', '/users/suggestions', null, { expect: 200 });
});

console.log('\nEvents');
await step('unverified organizer cannot publish', async () => {
  await org.call('POST', '/auth/login', { identifier: 'karthik@example.com', password: 'Password@123' }, { expect: 200 });
  const r = await org.call('POST', '/events', { title: 'Test publish', description: 'A long enough description for the event', category: 'cleanup', startAt: new Date(Date.now() + 86400000).toISOString(), endAt: new Date(Date.now() + 90000000).toISOString(), capacity: 1, publish: true });
  assert(r.status === 403, 'unverified could publish');
});
await step('verified organizer creates event (capacity 1) and publishes', async () => {
  await org.call('POST', '/auth/login', { identifier: 'hello@greencoast.example', password: 'Password@123' }, { expect: 200 });
  const start = new Date(Date.now() + 10 * 60000);
  const r = await org.call('POST', '/events', { title: 'Smoke test drive', description: 'A long enough description for the event', category: 'cleanup', startAt: start.toISOString(), endAt: new Date(start.getTime() + 2 * 3600000).toISOString(), capacity: 1, isOutdoor: true, lat: 12.99, lng: 80.27, skillsNeeded: ['first_aid'], publish: true }, { expect: 201 });
  eventId = r.data.id;
});
await step('register → second user waitlisted → cancel promotes', async () => {
  const a = await vol.call('POST', `/events/${eventId}/register`, {}, { expect: 201 });
  assert(a.data.status === 'registered', 'not registered');
  const dup = await vol.call('POST', `/events/${eventId}/register`);
  assert(dup.status === 409, 'duplicate allowed');
  await donor.call('POST', '/auth/login', { identifier: 'priya@example.com', password: 'Password@123' }, { expect: 200 });
  const b = await donor.call('POST', `/events/${eventId}/register`, {}, { expect: 201 });
  assert(b.data.status === 'waitlisted', 'not waitlisted');
  await vol.call('POST', `/events/${eventId}/cancel-registration`, {}, { expect: 200 });
  const d = await donor.call('GET', `/events/${eventId}`, null, { expect: 200 });
  assert(d.data.myRegistration.status === 'registered', 'not promoted');
});
await step('minor without consent cannot register', async () => {
  const k = jar();
  await k.call('POST', '/auth/login', { identifier: 'kavya@example.com', password: 'Password@123' }, { expect: 200 });
  const r = await k.call('POST', `/events/${eventId}/register`);
  assert(r.status === 403, 'minor registered');
});
await step('QR check-in (rotating token), duplicate rejected', async () => {
  const qr = await org.call('GET', `/events/${eventId}/checkin-qr`, null, { expect: 200 });
  const token = new URL(qr.data.url).searchParams.get('t');
  await donor.call('POST', `/events/${eventId}/checkin`, { token }, { expect: 200 });
  const again = await donor.call('POST', `/events/${eventId}/checkin`, { token });
  assert(again.status === 409, 'duplicate check-in allowed');
});
await step('attendees filter by skill + CSV export', async () => {
  const a = await org.call('GET', `/events/${eventId}/attendees?skill=medical`, null, { expect: 200 });
  assert(a.data.length === 1, 'skill filter wrong');
  const csv = await org.call('GET', `/events/${eventId}/attendees.csv`, null, { expect: 200 });
  assert(new TextDecoder().decode(csv.data).includes('Priya'), 'csv missing row');
});
await step('teams + team chat', async () => {
  const t = await org.call('POST', `/teams/events/${eventId}/teams`, { name: 'Alpha', leadId: (await donor.call('GET', '/users/me')).data.id }, { expect: 201 });
  const convs = await donor.call('GET', '/chat/conversations', null, { expect: 200 });
  const conv = convs.data.find((c) => c.teamId === t.data.id);
  assert(conv, 'no team conversation');
  await donor.call('POST', `/chat/conversations/${conv.id}/messages`, (() => { const f = new FormData(); f.append('body', 'Hello team'); return f; })(), { expect: 201 });
});
await step('complete event → certificate + review', async () => {
  // event starts in 10 min; force start into the past for completion
  const { default: pg } = await import('pg').catch(() => ({ default: null }));
  if (pg) {
    const c = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/serveconnect' });
    await c.connect();
    await c.query(`UPDATE events SET start_at = now() - interval '1 hour' WHERE id=$1`, [eventId]);
    await c.end();
  }
  await org.call('POST', `/events/${eventId}/complete`, {}, { expect: 200 });
  const certs = await donor.call('GET', '/certificates/mine', null, { expect: 200 });
  const cert = certs.data.find((c) => c.eventId === eventId);
  assert(cert, 'no certificate');
  const pdf = await donor.call('GET', `/certificates/${cert.serial}/pdf`, null, { expect: 200 });
  assert(new TextDecoder().decode(pdf.data.slice(0, 5)) === '%PDF-', 'not a pdf');
  await jar().call('GET', `/certificates/verify/${cert.serial}`, null, { expect: 200 });
  await donor.call('POST', `/events/${eventId}/reviews`, { rating: 5, body: 'Great' }, { expect: 201 });
  const dup = await donor.call('POST', `/events/${eventId}/reviews`, { rating: 4 });
  assert(dup.status === 409, 'double review');
});
await step('discussion thread + event poll', async () => {
  const d = await vol.call('POST', `/events/${eventId}/discussions`, { body: 'Any parking?' }, { expect: 201 });
  await org.call('POST', `/events/${eventId}/discussions`, { body: 'Yes', parentId: d.data.id }, { expect: 201 });
  await org.call('POST', `/events/${eventId}/polls`, { question: 'T-shirt size?', options: ['M', 'L'] }, { expect: 201 });
});

console.log('\nRequests');
await step('blood request notifies compatible donors (O- donor for AB+ request)', async () => {
  await org.call('POST', '/auth/login', { identifier: 'care@lifeline.example', password: 'Password@123' }, { expect: 200 });
  const r = await org.call('POST', '/requests/blood', { bloodGroup: 'AB+', unitsNeeded: 2, hospitalName: 'Test Hospital', lat: 13.01, lng: 80.21, contactPhone: '9876543210', neededBy: new Date(Date.now() + 86400000).toISOString() }, { expect: 201 });
  assert(r.data.matchedDonors >= 1, 'no donors matched');
  // priya (O-) last donated? not set → can respond
  const list = await donor.call('GET', '/requests/blood', null, { expect: 200 });
  assert(list.data.nearby.some((x) => x.id === r.data.id), 'donor cannot see request');
  const resp = await donor.call('POST', `/requests/blood/${r.data.id}/respond`, { shareContact: true }, { expect: 200 });
  assert(resp.data.contactPhone, 'contact not shared');
  const nonDonor = await vol.call('GET', `/requests/blood/${r.data.id}`);
  assert(nonDonor.status === 403, 'non-donor saw blood request');
});
await step('resource wishlist pledge + over-pledge rejected', async () => {
  await org.call('POST', '/auth/login', { identifier: 'team@akshara.example', password: 'Password@123' }, { expect: 200 });
  const r = await org.call('POST', '/requests/resources', { title: 'Books for library', description: 'We need books for the new library room', category: 'education', items: [{ name: 'Story books', quantityNeeded: 10 }] }, { expect: 201 });
  const item = r.data.items[0];
  await vol.call('POST', `/requests/resources/${r.data.id}/pledges`, { itemId: item.id, quantity: 6 }, { expect: 201 });
  const over = await vol.call('POST', `/requests/resources/${r.data.id}/pledges`, { itemId: item.id, quantity: 5 });
  assert(over.status === 400, 'over-pledge allowed');
});

console.log('\nTrust, engagement & admin');
await step('verification upload (encrypted) → admin approves', async () => {
  const fd = new FormData();
  fd.append('docType', 'government_id');
  fd.append('files', new Blob([Buffer.from('%PDF-1.4\n%test document\n')], { type: 'application/pdf' }), 'id.pdf');
  await vol.call('POST', '/verification', fd, { expect: 201 });
  await admin.call('POST', '/auth/login', { identifier: 'admin@serveconnect.app', password: 'Password@123' }, { expect: 200 });
  const queue = await admin.call('GET', '/admin/verifications', null, { expect: 200 });
  const mine = queue.data.find((v) => v.user.id === me.id);
  const doc = await admin.call('GET', `/admin/verifications/${mine.id}/documents/0`, null, { expect: 200 });
  assert(new TextDecoder().decode(doc.data).startsWith('%PDF'), 'document not decrypted');
  await admin.call('POST', `/admin/verifications/${mine.id}/decide`, { decision: 'approved' }, { expect: 200 });
});
await step('fake file type rejected', async () => {
  const fd = new FormData();
  fd.append('file', new Blob([Buffer.from('<script>alert(1)</script>')], { type: 'image/png' }), 'evil.png');
  const r = await vol.call('POST', '/users/me/avatar', fd);
  assert(r.status === 400, 'malicious file accepted');
});
await step('report → admin resolves', async () => {
  await vol.call('POST', '/reports', { targetType: 'event', targetId: eventId, reason: 'spam' }, { expect: 201 });
  const reps = await admin.call('GET', '/admin/reports', null, { expect: 200 });
  const rep = reps.data.find((x) => x.targetId === eventId);
  await admin.call('POST', `/admin/reports/${rep.id}/resolve`, { outcome: 'dismissed' }, { expect: 200 });
});
await step('leaderboard + milestones + notifications', async () => {
  const lb = await donor.call('GET', '/engagement/leaderboard?period=all', null, { expect: 200 });
  assert(lb.data.rows.length, 'empty leaderboard');
  await donor.call('GET', '/engagement/progress', null, { expect: 200 });
  const n = await donor.call('GET', '/notifications', null, { expect: 200 });
  assert(n.data.items.length, 'no notifications');
});
await step('suspended user cannot write', async () => {
  await admin.call('POST', `/admin/users/${me.id}/suspend`, { reason: 'Test' }, { expect: 200 });
  const r = await vol.call('POST', '/posts', (() => { const f = new FormData(); f.append('body', 'x'); return f; })());
  assert(r.status === 403, 'suspended user could post');
  await admin.call('POST', `/admin/users/${me.id}/unsuspend`, {}, { expect: 200 });
});
await step('CSR bulk registration + impact', async () => {
  const c = jar();
  await c.call('POST', '/auth/login', { identifier: 'csr@nimbus.example', password: 'Password@123' }, { expect: 200 });
  const m = await c.call('GET', '/csr/members', null, { expect: 200 });
  const evs = await c.call('GET', '/events?when=upcoming', null, { expect: 200 });
  const target = evs.data.items.find((e) => e.title.includes('Relief'));
  const r = await c.call('POST', `/csr/events/${target.id}/bulk-register`, { userIds: m.data.members.map((x) => x.id) }, { expect: 200 });
  assert(r.data.registered >= 1, 'nobody registered');
  await c.call('GET', '/csr/impact', null, { expect: 200 });
});
await step('handbook PDF + admin stats', async () => {
  const h = await jar().call('GET', '/handbook.pdf', null, { expect: 200 });
  assert(new TextDecoder().decode(h.data.slice(0, 5)) === '%PDF-', 'no handbook');
  await admin.call('GET', '/admin/stats', null, { expect: 200 });
});
await step('account deletion anonymises user', async () => {
  await vol.call('POST', '/users/me/delete', { password: 'NewSecret456', confirm: 'DELETE' }, { expect: 200 });
  const r = await jar().call('POST', '/auth/login', { identifier: `t${stamp}@example.com`, password: 'NewSecret456' });
  assert(r.status === 401, 'deleted user can log in');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
