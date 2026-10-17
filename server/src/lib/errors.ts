export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, message: string, code = 'error', details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, 'bad_request', details);
export const unauthorized = (msg = 'Please sign in to continue.') => new HttpError(401, msg, 'unauthorized');
export const forbidden = (msg = 'You do not have permission to do that.') => new HttpError(403, msg, 'forbidden');
export const notFound = (msg = 'Not found.') => new HttpError(404, msg, 'not_found');
export const conflict = (msg: string, code = 'conflict') => new HttpError(409, msg, code);
export const tooMany = (msg: string) => new HttpError(429, msg, 'rate_limited');
