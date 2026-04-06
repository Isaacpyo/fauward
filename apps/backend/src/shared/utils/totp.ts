import { authenticator } from 'otplib';
import qrcode from 'qrcode';
import { config } from '../../config/index.js';

export function generateTotpSecret(email: string) {
  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(email, config.mfaIssuer, secret);
  return { secret, otpauth };
}

export async function generateQrCodeDataUrl(otpauth: string) {
  return qrcode.toDataURL(otpauth);
}

export function verifyTotp(code: string, secret: string) {
  return authenticator.check(code, secret);
}