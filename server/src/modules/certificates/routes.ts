import { Router } from 'express';
import { one, q } from '../../db/pool';
import { requireAuth } from '../../middleware/auth';
import { forbidden, notFound } from '../../lib/errors';
import { camel } from '../../lib/case';
import { certificatePdf } from '../../lib/pdf';

const r = Router();

const CERT_SQL = `SELECT c.serial, c.hours::float AS hours, c.issued_at, c.user_id, u.name AS volunteer_name,
         e.id AS event_id, e.title AS event_title, e.start_at, e.location_name, e.category,
         o.name AS organizer_name, o.handle AS organizer_handle, o.verification_status='verified' AS organizer_verified
    FROM certificates c JOIN users u ON u.id=c.user_id JOIN events e ON e.id=c.event_id JOIN users o ON o.id=e.organizer_id`;

r.get('/mine', requireAuth, async (req, res) => {
  const rows = await q(`${CERT_SQL} WHERE c.user_id=$1 ORDER BY c.issued_at DESC`, [req.user!.id]);
  res.json(camel(rows));
});

/** Public verification endpoint — anyone can confirm a certificate is genuine. */
r.get('/verify/:serial', async (req, res) => {
  const c = await one(`${CERT_SQL} WHERE c.serial=$1`, [String(req.params.serial).toUpperCase()]);
  if (!c) throw notFound('No certificate with that number exists.');
  const { user_id, ...pub } = c;
  res.json(camel({ valid: true, ...pub }));
});

r.get('/:serial/pdf', requireAuth, async (req, res) => {
  const c = await one(`${CERT_SQL} WHERE c.serial=$1`, [String(req.params.serial).toUpperCase()]);
  if (!c) throw notFound();
  if (c.user_id !== req.user!.id && req.user!.role !== 'admin') throw forbidden();
  const pdf = await certificatePdf({
    serial: c.serial, volunteerName: c.volunteer_name, eventTitle: c.event_title, organizerName: c.organizer_name,
    organizerVerified: c.organizer_verified, eventDate: new Date(c.start_at), location: c.location_name, hours: c.hours, issuedAt: new Date(c.issued_at),
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.inline ? 'inline' : 'attachment'}; filename="certificate-${c.serial}.pdf"`);
  res.send(pdf);
});

export default r;
