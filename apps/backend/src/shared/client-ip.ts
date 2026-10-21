import { isIP } from 'node:net';
import type { FastifyRequest } from 'fastify';

/**
 * The caller's address: Cloudflare's CF-Connecting-IP (the API is only reachable through the Cloudflare tunnel), then
 * the first X-Forwarded-For hop, then the socket address. Login records, audit rows and IP-block enforcement all use
 * this, so a block placed on a recorded address matches the next request from it. IPv4-mapped IPv6 is unwrapped.
 */
export function clientIp(request: Pick<FastifyRequest, 'headers' | 'ip'>) {
  const cf = request.headers['cf-connecting-ip'];
  const forwarded = request.headers['x-forwarded-for'];
  const candidate = typeof cf === 'string' && cf.trim() ? cf.trim() : typeof forwarded === 'string' && forwarded.trim() ? forwarded.split(',')[0].trim() : request.ip;
  return normalizeIp(candidate);
}

export function normalizeIp(value: string) {
  const trimmed = value.trim();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(trimmed);
  if (mapped && isIP(mapped[1]) === 4) return mapped[1];
  return trimmed.toLowerCase();
}
