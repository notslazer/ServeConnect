import { ErrorRequestHandler, RequestHandler } from 'express';
import { HttpError } from '../lib/errors';
import { env } from '../config/env';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` } });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: { code: 'file_too_large', message: 'That file is too large.' } });
  }
  if (err?.code === 'LIMIT_FILE_COUNT' || err?.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: { code: 'too_many_files', message: 'Too many files in one upload.' } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'bad_json', message: 'Malformed JSON body.' } });
  }
  // Postgres unique violation
  if (err?.code === '23505') {
    return res.status(409).json({ error: { code: 'duplicate', message: 'That already exists.' } });
  }
  if (err?.code === '22P02') {
    return res.status(400).json({ error: { code: 'bad_request', message: 'Invalid identifier.' } });
  }
  console.error('[error]', err);
  res.status(500).json({ error: { code: 'server_error', message: env.isProd ? 'Something went wrong. Please try again.' : String(err?.message ?? err) } });
};
