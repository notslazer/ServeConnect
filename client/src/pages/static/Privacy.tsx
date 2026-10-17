import { Link } from 'react-router-dom';
import { LegalDoc, type LegalSection } from '../../components/LegalDoc';

const PRIVACY = 'privacy@serveconnect.app';
const GRIEVANCE = 'grievance@serveconnect.app';

const sections: LegalSection[] = [
  {
    id: 'who', title: 'Who we are',
    body: (
      <>
        <p>ServeConnect is operated by <strong>[Registered entity name]</strong>, <strong>[registered office address]</strong>, India. For the purposes of the <strong>Digital Personal Data Protection Act, 2023</strong> (“DPDP Act”) we are the <strong>Data Fiduciary</strong> for the personal data described in this policy.</p>
        <p>Organizers who receive volunteers’ details to run an event are responsible for how they use that data once received, and must use it only for that event (see our <Link to="/terms">Terms of Service</Link>).</p>
      </>
    ),
  },
  {
    id: 'collect', title: 'Personal data we collect',
    body: (
      <>
        <h3>You give us</h3>
        <ul>
          <li><strong>Account details:</strong> name, username, email address and/or mobile number, password (stored only as a one-way hash), account type, and your date of birth (volunteers) so we can apply age rules.</li>
          <li><strong>Guardian details</strong> for users under 18: the parent or guardian’s email address and name, and their consent decision.</li>
          <li><strong>Profile:</strong> photo, cover image, headline, bio, website, skills, causes, organization type and registration number.</li>
          <li><strong>Location:</strong> the area and map point you set on your profile, and locations you add to events or requests.</li>
          <li><strong>Blood-donor details</strong> if you opt in: blood group, travel radius and last donation date.</li>
          <li><strong>Verification documents</strong> you upload, such as NGO registration certificates or a government photo ID.</li>
          <li><strong>Content and activity:</strong> posts, comments, photos, messages, reviews, poll votes, reports, pledges, event registrations and responses to blood requests.</li>
        </ul>
        <h3>Created when you use ServeConnect</h3>
        <ul>
          <li>Attendance records, check-in times and methods, verified hours, certificates, streaks and milestones.</li>
          <li>Security and technical data: IP address, browser and device type, sign-in times, active sessions, failed sign-in attempts, and push-notification subscriptions.</li>
          <li>An audit log of security-relevant and moderation actions.</li>
        </ul>
        <h3>From others</h3>
        <ul>
          <li>If you sign in with Google: your Google account ID, name, email address and profile photo.</li>
          <li>Organizers and team leads may record your attendance; requesters may mark you as having donated blood.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'use', title: 'How we use it, and our grounds',
    body: (
      <>
        <p>We process personal data on the basis of your <strong>consent</strong>, which you give when you create an account and when you opt in to specific features (such as blood-donor matching or push notifications), and for <strong>legitimate uses</strong> permitted by Section 7 of the DPDP Act (for example, complying with law or responding to a medical emergency). We use it to:</p>
        <ul>
          <li>create and secure your account, verify your email and phone, and run two-factor authentication;</li>
          <li>show your profile and content according to your privacy settings;</li>
          <li>recommend nearby events and drives matching your skills and causes, and send notifications you’ve chosen;</li>
          <li>match opted-in donors to compatible blood requests nearby;</li>
          <li>run registration, waitlists, check-in, teams, certificates and verified-hours records;</li>
          <li>review verification applications and moderate reports;</li>
          <li>detect fraud, abuse and security incidents, and keep audit logs;</li>
          <li>produce aggregate, de-identified statistics (for example, total volunteer hours in a city) and CSR impact reports showing employees’ verified hours to their company if they join its team; and</li>
          <li>comply with legal obligations and lawful requests.</li>
        </ul>
        <p>We don’t sell your personal data, show you third-party advertising, or use your data to build advertising profiles.</p>
      </>
    ),
  },
  {
    id: 'sensitive', title: 'Sensitive data and how we protect it',
    body: (
      <ul>
        <li><strong>Blood group</strong> is collected only if you opt in as a donor, is <strong>encrypted at rest</strong>, and is used <strong>only to match you with compatible requests</strong>. It is never shown on your profile, in search or to requesters. If you respond to a request, the requester sees your name and phone number so they can coordinate. Opting out stops matching immediately.</li>
        <li><strong>Location</strong> is shown to others only as an area name and a point blurred to roughly 1 km, and only if your privacy settings allow it. Exact coordinates are used only for distance calculations.</li>
        <li><strong>Verification documents</strong> are encrypted before storage, never publicly accessible, viewable only by authorised administrators (every view is logged), used only to decide your verification, and <strong>deleted 90 days after a decision</strong>. We keep the decision, document type and date.</li>
        <li><strong>Phone numbers</strong> are stored encrypted, with a separate one-way index used only to find your account at sign-in.</li>
      </ul>
    ),
  },
  {
    id: 'children', title: 'Children',
    body: (
      <>
        <p>ServeConnect is not for children under 13. For users aged 13–17 we obtain <strong>verifiable consent from a parent or lawful guardian</strong>, as required by Section 9 of the DPDP Act, before the child can join in-person activities. For these users we:</p>
        <ul>
          <li>never display their email, phone number, date of birth or location to other users;</li>
          <li>disable direct messages and exclude them from people search and directories;</li>
          <li>don’t allow blood-donor registration; and</li>
          <li>don’t track them for, or target them with, advertising, and don’t process their data in ways likely to harm their well-being.</li>
        </ul>
        <p>A guardian can ask us to review, correct or delete their child’s data by writing to <a href={`mailto:${PRIVACY}`}>{PRIVACY}</a>.</p>
      </>
    ),
  },
  {
    id: 'sharing', title: 'Who we share it with',
    body: (
      <ul>
        <li><strong>Other users</strong>, according to your privacy settings — for example, your public profile, posts and verified hours.</li>
        <li><strong>Organizers</strong> of events you register for, and their team leads: your name, profile, registration and attendance status, and the contact details needed to coordinate on the day.</li>
        <li><strong>Requesters</strong>, when you choose to respond to their blood request or pledge to their drive.</li>
        <li><strong>Your company</strong>, if you join its CSR team: your verified hours and participation.</li>
        <li><strong>Service providers (Data Processors)</strong> who act on our instructions under contract: cloud hosting and storage, email and SMS delivery, web-push services, map tiles and geocoding (OpenStreetMap / Nominatim), and weather forecasts (only event locations are sent, not your identity).</li>
        <li><strong>Authorities</strong>, when required by law, or when necessary to protect someone’s life or safety.</li>
        <li>A successor organization if ServeConnect is reorganised or transferred, subject to this policy.</li>
      </ul>
    ),
  },
  {
    id: 'cookies', title: 'Cookies and device storage',
    body: (
      <>
        <p>We use <strong>one cookie</strong>: an essential, HttpOnly, secure <strong>refresh-token cookie</strong> that keeps you signed in. It is limited to our sign-in endpoints, can’t be read by scripts, and is cleared when you sign out. Because it is strictly necessary for the service you asked for, it doesn’t require a separate consent banner.</p>
        <p>We don’t use advertising, analytics or third-party tracking cookies. If you choose Google Sign-In, Google may set its own cookies under its privacy policy. Our app may also store non-identifying conveniences on your device (such as cached app files for offline use).</p>
      </>
    ),
  },
  {
    id: 'retention', title: 'How long we keep data',
    body: (
      <ul>
        <li><strong>Account and profile data:</strong> while your account is active.</li>
        <li><strong>When you delete your account:</strong> we immediately remove your name, contact details, photos, location, date of birth, blood group, guardian email and 2FA secret, revoke your sessions and remove your follows. Attendance records are kept in de-identified form so organizers’ event histories stay accurate, and certificates already issued remain verifiable.</li>
        <li><strong>Verification documents:</strong> deleted 90 days after a decision.</li>
        <li><strong>Security logs and audit trails:</strong> up to 3 years, to investigate abuse and meet legal obligations.</li>
        <li><strong>Backups:</strong> overwritten on a rolling basis, typically within 30 days.</li>
      </ul>
    ),
  },
  {
    id: 'security', title: 'Security',
    body: (
      <p>We use encryption in transit (HTTPS), field-level encryption for sensitive data, hashed passwords, optional two-factor authentication, rotating sign-in tokens with idle timeouts, account lockout after repeated failed attempts, alerts for sign-ins from new devices, role-based access for staff and audit logs. No system is perfectly secure. If a personal data breach occurs, we will notify the Data Protection Board of India and affected users as required by the DPDP Act.</p>
    ),
  },
  {
    id: 'rights', title: 'Your rights',
    body: (
      <>
        <p>Under the DPDP Act you have the right to:</p>
        <ul>
          <li><strong>Access</strong> a summary of your personal data and how it is processed — use Settings → Account → <em>Download my data</em>, or write to us.</li>
          <li><strong>Correction and completion</strong> — edit your profile in Settings, or ask us to correct anything you can’t change yourself.</li>
          <li><strong>Erasure</strong> — delete your account from Settings → Account, or ask us to erase specific data that is no longer needed.</li>
          <li><strong>Withdraw consent</strong> at any time — for example, opt out of blood-donor matching, turn off notifications, or delete your account. Withdrawal doesn’t affect processing that already took place.</li>
          <li><strong>Grievance redressal</strong> — contact our Grievance Officer below; we respond within the time set by law.</li>
          <li><strong>Nominate</strong> another person to exercise your rights in the event of your death or incapacity.</li>
        </ul>
        <p>If you’re not satisfied with our response, you may complain to the <strong>Data Protection Board of India</strong>.</p>
      </>
    ),
  },
  {
    id: 'transfers', title: 'Where your data is processed',
    body: (
      <p>We primarily store and process data in India. Some service providers may process data outside India; any such transfer complies with Section 16 of the DPDP Act and any restrictions notified by the Government of India, and is protected by contractual safeguards.</p>
    ),
  },
  {
    id: 'changes', title: 'Changes to this policy',
    body: (
      <p>We’ll notify you in the app or by email before material changes take effect, and update the effective date above. Where a change requires fresh consent, we’ll ask for it.</p>
    ),
  },
  {
    id: 'contact', title: 'Contact and Grievance Officer',
    body: (
      <>
        <ul>
          <li><strong>Grievance Officer / Data Protection contact:</strong> [Name]</li>
          <li><strong>Email:</strong> <a href={`mailto:${GRIEVANCE}`}>{GRIEVANCE}</a> (privacy requests: <a href={`mailto:${PRIVACY}`}>{PRIVACY}</a>)</li>
          <li><strong>Address:</strong> [Registered office address], India</li>
        </ul>
        <p>Please write from the email address on your account, or tell us your username, so we can verify the request is yours.</p>
      </>
    ),
  },
];

export default function Privacy() {
  return (
    <LegalDoc
      title="Privacy Policy"
      effective="1 October 2026"
      other={{ to: '/terms', label: 'Terms of Service' }}
      intro={
        <>
          <p>ServeConnect handles some sensitive information — like blood groups, locations, children’s accounts and identity documents — so we try to collect as little as possible, protect it carefully and use it only for the purpose you gave it to us for.</p>
          <p>This policy explains what personal data we collect, why, who can see it, how long we keep it and the rights you have under India’s Digital Personal Data Protection Act, 2023.</p>
        </>
      }
      sections={sections}
    />
  );
}
