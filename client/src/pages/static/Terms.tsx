import { Link } from 'react-router-dom';
import { LegalDoc, type LegalSection } from '../../components/LegalDoc';

const SUPPORT = 'support@serveconnect.app';
const GRIEVANCE = 'grievance@serveconnect.app';

const sections: LegalSection[] = [
  {
    id: 'about', title: 'About these terms',
    body: (
      <>
        <p>These Terms of Service (“Terms”) govern your use of ServeConnect — our website, progressive web app and related services (the “Service”) — operated by <strong>[Registered entity name]</strong>, <strong>[registered office address]</strong>, India (“ServeConnect”, “we”, “us”).</p>
        <p>By creating an account or using the Service you agree to these Terms and to our <Link to="/privacy">Privacy Policy</Link>. If you are using ServeConnect on behalf of an organization or company, you confirm you are authorised to accept these Terms for it, and “you” includes that organization.</p>
      </>
    ),
  },
  {
    id: 'eligibility', title: 'Eligibility and accounts',
    body: (
      <>
        <ul>
          <li>You must be at least <strong>13 years old</strong> to use ServeConnect.</li>
          <li>If you are under 18, a parent or legal guardian must give verifiable consent before you can join in-person events. By giving consent, the guardian agrees to these Terms on the minor’s behalf and accepts responsibility for the minor’s participation. Some features — including direct messages and blood-donor registration — are not available to users under 18.</li>
          <li>Organizer and CSR company accounts must be operated by an adult authorised to act for the organization.</li>
          <li>Give accurate information, keep it up to date and use only one personal account. Don’t impersonate any person or organization.</li>
          <li>You are responsible for activity on your account. Keep your password and backup codes confidential and tell us at <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a> if you suspect unauthorised access. We recommend two-factor authentication, especially for organizers.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'platform', title: 'What ServeConnect is — and isn’t',
    body: (
      <>
        <p>ServeConnect is a technology platform that helps volunteers, donors, organizers and companies find and coordinate with each other. <strong>We are an intermediary.</strong> We do not organise, supervise or control events, drives or donations listed on the Service, and we are not a party to any arrangement between users.</p>
        <ul>
          <li><strong>No guarantee of matches or outcomes.</strong> We do not guarantee that any blood request, donation drive or event will find donors, volunteers or resources, or that any donation will take place, be suitable or be timely.</li>
          <li><strong>Not an emergency or medical service.</strong> Blood requests supplement — and never replace — hospitals, licensed blood banks and emergency services. In an emergency, call 112. Every blood donation is subject to screening and cross-matching by a licensed blood bank, which has the final say.</li>
          <li><strong>Verification is limited.</strong> A Verified badge means we reviewed the documents submitted at that time. It is not an endorsement, audit, licence or guarantee of an organization’s conduct, finances or safety.</li>
          <li>We do not handle money. Any financial donation you choose to make to an organization is made outside ServeConnect and solely between you and that organization.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'organizers', title: 'Organizer responsibilities',
    body: (
      <>
        <p>If you publish events, donation drives or requests, you agree that:</p>
        <ul>
          <li>Everything you publish is accurate, lawful and kept up to date — including the date, location, tasks, requirements, minimum age and any risks. Cancel or update listings promptly when plans change.</li>
          <li><strong>You are solely responsible for on-site safety</strong>: risk assessment, briefings, supervision, protective equipment, first aid, safe transport where you provide it, and any permissions, permits or insurance required by law.</li>
          <li>You will take additional care with volunteers under 18: assign age-appropriate tasks, ensure appropriate adult supervision, never ask for a minor’s personal contact details, and use the in-app team chat for coordination.</li>
          <li>You will record attendance honestly. Verified hours and certificates depend on genuine check-ins; marking people as attended who were not present is a serious breach.</li>
          <li>You will use volunteers’ and donors’ personal information only to run the specific activity they signed up for, keep it secure, and not sell it, share it or use it for unrelated marketing.</li>
          <li>Resource requests and blood requests must reflect genuine, current needs. Close them when they are fulfilled.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'volunteers', title: 'Volunteers and donors',
    body: (
      <ul>
        <li>Register only for activities you intend to attend, and cancel as early as possible if you can’t — it frees your place for someone on the waitlist.</li>
        <li>Follow the organizer’s instructions and safety briefing, and don’t undertake tasks you are not fit or trained for. You participate voluntarily and at your own risk, to the extent permitted by law.</li>
        <li>Only register as a blood donor if you believe you are eligible, and answer the blood bank’s screening questions truthfully. Keep your last-donation date accurate.</li>
        <li>Make pledges in good faith and deliver what you pledge, or update the organizer promptly.</li>
      </ul>
    ),
  },
  {
    id: 'acceptable-use', title: 'Acceptable use',
    body: (
      <>
        <p>You must not use ServeConnect to:</p>
        <ul>
          <li>post false, misleading or fraudulent events, requests or fundraising appeals, or impersonate any person, NGO, hospital or company;</li>
          <li>harass, bully, threaten, stalk or discriminate against anyone, or post hateful, sexually explicit or violent content;</li>
          <li>contact, groom or seek personal information from minors, or otherwise endanger children;</li>
          <li>buy, sell or offer payment for blood, organs or any donated item, or otherwise breach the law (including laws on blood donation and organ transplantation);</li>
          <li>spam, run unrelated advertising, or collect users’ data by scraping or automated means;</li>
          <li>upload malware, probe or disrupt the Service, bypass security or rate limits, or access accounts or data that aren’t yours;</li>
          <li>infringe anyone’s intellectual property, privacy or other rights; or</li>
          <li>post content that is prohibited under the Information Technology Act, 2000 or the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'content', title: 'Your content and licence',
    body: (
      <>
        <p>You own the posts, photos, reviews, messages and other content you submit (“your content”). You give ServeConnect a worldwide, non-exclusive, royalty-free licence to host, store, reproduce, display, adapt (for example, resize images) and distribute your content, solely to operate, secure, improve and promote the Service. The licence ends when your content is deleted, except for copies kept in backups for a limited period or where we must retain them by law.</p>
        <p>Content you post publicly — and photos organizers add to event galleries — may be seen by anyone, including people without an account. You confirm you have the rights and any necessary consents (including from people pictured, and from a guardian for any minor) to post it.</p>
        <p>The ServeConnect name, logo and software are ours. Don’t use them without our written permission.</p>
      </>
    ),
  },
  {
    id: 'records', title: 'Verified hours, certificates and badges',
    body: (
      <p>Hours and certificates are generated from attendance records kept by organizers. We provide them for convenience and verification but don’t independently confirm the work performed. Third parties (employers, colleges, CSR auditors) should use the certificate verification page and make their own assessment. We may correct, revoke or reissue records that are inaccurate or were obtained improperly, and may award or remove milestones and leaderboard positions at our discretion.</p>
    ),
  },
  {
    id: 'moderation', title: 'Moderation, suspension and termination',
    body: (
      <>
        <p>Anyone can report content, people, events or requests. We review reports — prioritising safety and child-safety concerns — and may, at our discretion and without prior notice where safety requires it:</p>
        <ul>
          <li>remove or restrict content;</li>
          <li>warn you, limit features, cancel events or close requests;</li>
          <li>suspend your account (you can still sign in, view and download your data, but can’t post, register or message); or</li>
          <li>permanently terminate your account and refuse future access.</li>
        </ul>
        <p>We will usually tell you what action we took and why. If you believe we made a mistake, write to <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a> or our Grievance Officer (below). We may also preserve and disclose information where required by law or to protect someone’s safety.</p>
        <p>You can stop using ServeConnect and delete your account at any time from Settings → Account.</p>
      </>
    ),
  },
  {
    id: 'third-parties', title: 'Third-party services',
    body: (
      <p>The Service uses third-party services, such as OpenStreetMap for maps and geocoding, Google Sign-In if you choose it, weather forecast providers, and email and SMS providers. Their terms and privacy policies apply to your use of them. Links to external websites are provided for convenience; we are not responsible for their content.</p>
    ),
  },
  {
    id: 'liability', title: 'Disclaimers and limitation of liability',
    body: (
      <>
        <p>The Service is provided <strong>“as is” and “as available”</strong>. To the fullest extent permitted by law, we disclaim all warranties, express or implied, including fitness for a particular purpose, accuracy of listings and uninterrupted availability. Notifications, reminders, weather advisories and donor alerts may be delayed or fail to arrive.</p>
        <p>To the fullest extent permitted by law, ServeConnect is not liable for: the acts, omissions or content of any user, organizer, donor or third party; any injury, loss or damage arising from participation in an event or donation; or any indirect, incidental, special or consequential loss. Our total liability for any claim relating to the Service is limited to ₹5,000 (five thousand rupees). Nothing in these Terms limits liability that cannot be limited under Indian law.</p>
      </>
    ),
  },
  {
    id: 'indemnity', title: 'Indemnity',
    body: (
      <p>You agree to indemnify ServeConnect and its officers and staff against claims, losses and reasonable costs (including legal fees) arising from your breach of these Terms, your content, or — if you are an organizer — events, drives or requests you run through the Service.</p>
    ),
  },
  {
    id: 'changes', title: 'Changes to the Service and these Terms',
    body: (
      <p>We may change or discontinue features. We may update these Terms; for material changes we will notify you in the app or by email at least 15 days before they take effect, unless a change is required sooner by law or for safety. Continuing to use ServeConnect after changes take effect means you accept them.</p>
    ),
  },
  {
    id: 'law', title: 'Governing law and disputes',
    body: (
      <p>These Terms are governed by the laws of India. Subject to any mandatory consumer-protection rights you may have, the courts at Chennai, Tamil Nadu have exclusive jurisdiction. Before starting proceedings, please contact us so we can try to resolve the issue informally within 30 days.</p>
    ),
  },
  {
    id: 'contact', title: 'Grievance Officer and contact',
    body: (
      <>
        <p>In accordance with the Information Technology Act, 2000 and the rules made under it, you may contact our Grievance Officer about content on the Service or these Terms:</p>
        <ul>
          <li><strong>Name:</strong> [Grievance Officer name]</li>
          <li><strong>Email:</strong> <a href={`mailto:${GRIEVANCE}`}>{GRIEVANCE}</a></li>
          <li><strong>Address:</strong> [Registered office address], India</li>
        </ul>
        <p>We acknowledge complaints within 24 hours and aim to resolve them within 15 days. For everything else, email <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a>.</p>
      </>
    ),
  },
];

export default function Terms() {
  return (
    <LegalDoc
      title="Terms of Service"
      effective="1 October 2026"
      other={{ to: '/privacy', label: 'Privacy Policy' }}
      intro={<p>Thank you for helping your community. These Terms explain the rules for using ServeConnect, what you can expect from us, and what we expect from volunteers, donors and organizers. Please read them carefully — especially the sections on organizer responsibilities and our platform disclaimer.</p>}
      sections={sections}
    />
  );
}
