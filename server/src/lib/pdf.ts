/* PDF generation: participation certificates (REQ-COORD-5) and the Organizer Handbook (SRS §2.6). */
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { env } from '../config/env';

function toBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

export interface CertData {
  serial: string;
  volunteerName: string;
  eventTitle: string;
  organizerName: string;
  organizerVerified: boolean;
  eventDate: Date;
  location?: string | null;
  hours: number;
  issuedAt: Date;
}

export async function certificatePdf(c: CertData): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, info: { Title: `Certificate ${c.serial}`, Author: env.appName } });
  const W = doc.page.width;
  const H = doc.page.height;
  const teal = '#0f766e';
  const gold = '#b45309';
  // Border
  doc.rect(0, 0, W, H).fill('#fdfcf7');
  doc.lineWidth(6).strokeColor(teal).rect(24, 24, W - 48, H - 48).stroke();
  doc.lineWidth(1.5).strokeColor(gold).rect(36, 36, W - 72, H - 72).stroke();
  // Header
  doc.fillColor(teal).font('Helvetica-Bold').fontSize(16).text(env.appName.toUpperCase(), 0, 70, { align: 'center', characterSpacing: 4 });
  doc.fillColor('#111827').font('Times-Bold').fontSize(40).text('Certificate of Participation', 0, 105, { align: 'center' });
  doc.font('Helvetica').fontSize(14).fillColor('#4b5563').text('This is to certify that', 0, 175, { align: 'center' });
  doc.font('Times-BoldItalic').fontSize(36).fillColor(teal).text(c.volunteerName, 0, 200, { align: 'center' });
  doc.moveTo(W / 2 - 200, 248).lineTo(W / 2 + 200, 248).lineWidth(1).strokeColor('#d1d5db').stroke();
  doc.font('Helvetica').fontSize(14).fillColor('#374151')
    .text('volunteered with verified attendance at', 0, 262, { align: 'center' });
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#111827').text(c.eventTitle, 80, 285, { align: 'center', width: W - 160 });
  const date = c.eventDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.font('Helvetica').fontSize(13).fillColor('#374151')
    .text(`organised by ${c.organizerName}${c.organizerVerified ? ' (Verified Organizer)' : ''}`, 0, 320, { align: 'center' })
    .text(`on ${date}${c.location ? ' · ' + c.location : ''}`, 0, 340, { align: 'center' });
  doc.font('Helvetica-Bold').fontSize(16).fillColor(gold).text(`${c.hours} verified service hour${c.hours === 1 ? '' : 's'}`, 0, 372, { align: 'center' });
  // Footer: signature lines + QR
  const verifyUrl = `${env.appUrl}/verify/${c.serial}`;
  const qr = await QRCode.toBuffer(verifyUrl, { margin: 0, width: 110 });
  doc.image(qr, W - 190, H - 190, { width: 100 });
  doc.font('Helvetica').fontSize(8).fillColor('#6b7280').text('Scan to verify', W - 190, H - 86, { width: 100, align: 'center' });
  doc.moveTo(100, H - 120).lineTo(300, H - 120).strokeColor('#9ca3af').stroke();
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text(c.organizerName, 100, H - 112, { width: 200, align: 'center' });
  doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text('Organizer', 100, H - 97, { width: 200, align: 'center' });
  doc.font('Helvetica').fontSize(9).fillColor('#6b7280')
    .text(`Certificate No. ${c.serial}  ·  Issued ${c.issuedAt.toLocaleDateString('en-IN')}  ·  Verify at ${verifyUrl}`, 0, H - 60, { align: 'center' });
  return toBuffer(doc);
}

export async function handbookPdf(): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 60, info: { Title: `${env.appName} Organizer Handbook`, Author: env.appName } });
  const h1 = (t: string) => doc.moveDown(0.8).font('Helvetica-Bold').fontSize(18).fillColor('#0f766e').text(t).moveDown(0.3);
  const p = (t: string) => doc.font('Helvetica').fontSize(11).fillColor('#1f2937').text(t, { align: 'left', lineGap: 3 }).moveDown(0.4);
  const li = (items: string[]) => { doc.font('Helvetica').fontSize(11).fillColor('#1f2937').list(items, { bulletRadius: 2, lineGap: 3, textIndent: 12 }); doc.moveDown(0.4); };

  doc.font('Helvetica-Bold').fontSize(28).fillColor('#0f766e').text(`${env.appName}`, { align: 'center' });
  doc.font('Helvetica').fontSize(18).fillColor('#111827').text('Organizer Handbook', { align: 'center' }).moveDown(0.5);
  doc.fontSize(10).fillColor('#6b7280').text(`Version 1.0 · ${new Date().getFullYear()}`, { align: 'center' }).moveDown(1.5);

  h1('1. Getting verified');
  p('Only verified organizers can publish events and donation requests. Verification protects volunteers and donors from fraud.');
  li([
    'Go to Settings → Verification and upload your NGO registration certificate (Trust deed, Society/Section 8 certificate, 12A/80G, Darpan ID) or, for independent organizers, a government photo ID.',
    'Documents are encrypted at rest and only visible to platform administrators. They are deleted after review per our retention policy.',
    'Most reviews complete within 2 working days. You will receive a notification with the decision and any reason for rejection.',
  ]);
  h1('2. Publishing a great event');
  li([
    'Use a clear title and describe what volunteers will do, what to bring, and who to contact on the day.',
    'Tag the skills you need (first aid, teaching, driving…) so matching volunteers are notified automatically.',
    'Set a realistic capacity. When it fills up, new sign-ups join a waitlist and are promoted automatically if someone cancels.',
    'Mark outdoor events as "Outdoor" — volunteers will receive weather advisories for the 5 days before the event.',
    'Reminders are sent 24 hours and 1 hour before start by default; you can change these intervals.',
  ]);
  h1('3. On the day: check-in');
  li([
    'Open your event → Manage → Check-in. A QR code that refreshes every minute is shown; volunteers scan it with the app.',
    'Volunteers who cannot scan can tell you their personal 6-character check-in code, which you or a team lead enters in the console.',
    'You can also share the event code verbally. Each volunteer can check in only once.',
    'Volunteers not checked in within the grace period are recorded as no-shows (visible only to organizers).',
  ]);
  h1('4. Teams and coordination');
  li([
    'Create teams, assign a team lead and roles, or use Auto-assign to group volunteers by skill.',
    'Each team gets a private group chat. Team leads can check in their members.',
  ]);
  h1('5. After the event');
  li([
    'Mark the event complete. Verified attendees automatically receive a PDF certificate with verified hours and a QR verification link.',
    'Upload photos to the event gallery — they are shared with your followers.',
    'Attendees are invited to rate the event; your average rating appears on your public profile.',
  ]);
  h1('6. Blood and resource requests');
  li([
    'Blood requests are sent only to opted-in donors whose blood group is compatible and who are within your chosen radius. Rare groups (A-, B-, AB-, O-, Bombay) are flagged as high priority.',
    'Mark donors as "donated" when they arrive — this updates the request and thanks the donor.',
    'Resource requests use itemised wishlists. Donors pledge specific quantities and counts update live. Confirm deliveries as they arrive.',
    'When a deadline passes you will be prompted to extend, close or re-broadcast the request.',
  ]);
  h1('7. Volunteer safety');
  li([
    'You, the organizer, are responsible for on-site safety arrangements. Brief volunteers, provide protective equipment, and keep a first-aid kit on site.',
    'Volunteers under 18 can only join after a parent/guardian consents. Never request a minor\'s personal contact details; use the team chat instead.',
    'Set a minimum age on events that are unsuitable for minors.',
    'Report any safety concern from the event page; the moderation team reviews reports promptly.',
  ]);
  h1('8. Community guidelines');
  p('Be truthful about your organization and needs, respect volunteer time, never charge volunteers to participate, and keep donor information confidential. Violations can lead to suspension.');
  doc.moveDown(1).font('Helvetica-Oblique').fontSize(9).fillColor('#6b7280')
    .text(`${env.appName} facilitates connections between organizers, volunteers and donors but is not a party to any volunteering activity and does not guarantee the accuracy of donation matches or the outcome of events.`);
  return toBuffer(doc);
}
