import { describe, expect, it } from 'vitest';

import { loginSchema, registerSchema, resetPasswordSchema } from './auth.schema.js';

describe('authSchema', () => {
  it('accepts the current test login password for login', () => {
    const parsed = loginSchema.parse({
      email: 'admin@fauward.com',
      password: '12345678A'
    });

    expect(parsed.password).toBe('12345678A');
  });

  it('rejects passwords shorter than 8 characters during login', () => {
    expect(() =>
      loginSchema.parse({
        email: 'admin@fauward.com',
        password: '123456'
      })
    ).toThrow();
  });

  it('still enforces stronger passwords for register and reset flows', () => {
    expect(() =>
      registerSchema.parse({
        companyName: 'Fauward',
        region: 'uk',
        email: 'admin@fauward.com',
        password: '123456'
      })
    ).toThrow();

    expect(() =>
      resetPasswordSchema.parse({
        token: '1234567890',
        newPassword: '123456'
      })
    ).toThrow();
  });
});
