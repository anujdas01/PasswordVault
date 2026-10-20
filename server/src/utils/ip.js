import { TRUST_PROXY } from '../config.js';

export function clientIp(req) {
  if (TRUST_PROXY) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) {
      const first = String(xff).split(',')[0].trim();
      if (first) {return first;}
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }
  return req.socket?.remoteAddress || 'unknown';
}
