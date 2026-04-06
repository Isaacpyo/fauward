import type { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import { hashPassword, verifyPassword } from '../../shared/utils/hash.js';
import { signAccessToken, signRefreshToken, type JwtPayload, verifyRefreshToken } from '../../shared/utils/jwt.js';
import { EMAIL_TEMPLATE_KEYS } from '../tenants/email-templates.js';
import { createHash } from 'crypto';

type RegisterPayload = {
  companyName: string;
  region: string;
  email: string;
  password: string;
};

type LoginPayload = {
  email: string;
  password: string;
};

type RefreshPayload = {
  refreshToken: string;
};

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 60);
}

async function ensureUniqueSlug(prisma: PrismaClient, base: string) {
  let slug = base || 'tenant';
  let counter = 1;
  while (await prisma.tenant.findUnique({ where: { slug } })) {
    slug = `${base}-${counter}`;
    counter += 1;
    if (counter > 50) {
      slug = `${base}-${randomBytes(3).toString('hex')}`;
      break;
    }
  }
  return slug;
}

function monthKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function buildJwtPayload(user: { id: string; email: string; role: string; tenantId: string }, tenant: { slug: string; plan: string }) {
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    tenantSlug: tenant.slug,
    plan: tenant.plan,
    mfaVerified: true
  };
  return payload;
}

export const authService = {
  register: async (payload: RegisterPayload, prisma: PrismaClient) => {
    const email = payload.email.toLowerCase().trim();
    const existingUser = await prisma.user.findFirst({
      where: { email }
    });
    if (existingUser) {
      throw new Error('Email already in use');
    }

    const baseSlug = slugify(payload.companyName);
    const slug = await ensureUniqueSlug(prisma, baseSlug);
    const passwordHash = await hashPassword(payload.password);
    const usageMonth = monthKey();

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: payload.companyName,
          slug,
          region: payload.region,
          plan: 'TRIALING',
          status: 'TRIALING'
        }
      });

      await tx.tenantSettings.create({
        data: {
          tenantId: tenant.id,
          timezone: tenant.timezone,
          currency: tenant.defaultCurrency,
          opsEmailRecipients: [],
          serviceTierConfig: {
            STANDARD: {
              label: 'Standard',
              multiplier: 1,
              description: '3-5 business days',
              isEnabled: true
            },
            EXPRESS: {
              label: 'Express',
              multiplier: 1.6,
              description: 'Next business day',
              isEnabled: true
            },
            OVERNIGHT: {
              label: 'Overnight',
              multiplier: 2.2,
              description: 'By 9am next day',
              isEnabled: false
            }
          }
        }
      });

      await tx.emailTemplateConfig.createMany({
        data: EMAIL_TEMPLATE_KEYS.map((templateKey) => ({
          tenantId: tenant.id,
          templateKey,
          isEnabled: true
        })),
        skipDuplicates: true
      });

      await tx.surcharge.createMany({
        data: [
          {
            tenantId: tenant.id,
            name: 'Fuel Surcharge',
            condition: 'ALWAYS',
            type: 'PERCENT_OF_BASE',
            value: 0,
            isEnabled: false
          },
          {
            tenantId: tenant.id,
            name: 'Oversize Fee',
            condition: 'OVERSIZE',
            type: 'FLAT_FEE',
            value: 0,
            threshold: 120,
            isEnabled: false
          },
          {
            tenantId: tenant.id,
            name: 'Remote Area Surcharge',
            condition: 'REMOTE_AREA',
            type: 'FLAT_FEE',
            value: 0,
            isEnabled: false
          },
          {
            tenantId: tenant.id,
            name: 'Dangerous Goods',
            condition: 'DANGEROUS_GOODS',
            type: 'PERCENT_OF_BASE',
            value: 0,
            isEnabled: false
          },
          {
            tenantId: tenant.id,
            name: 'Residential Delivery',
            condition: 'RESIDENTIAL',
            type: 'FLAT_FEE',
            value: 0,
            isEnabled: false
          },
          {
            tenantId: tenant.id,
            name: 'Peak Season',
            condition: 'PEAK_SEASON',
            type: 'PERCENT_OF_BASE',
            value: 0,
            isEnabled: false
          }
        ]
      });

      await tx.usageRecord.create({
        data: {
          tenantId: tenant.id,
          month: usageMonth
        }
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email,
          passwordHash,
          role: 'TENANT_ADMIN'
        }
      });

      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          plan: 'TRIALING',
          status: 'TRIALING',
          billingCycle: 'MONTHLY'
        }
      });

      return { tenant, user };
    });

    const jwtPayload = buildJwtPayload(
      { id: result.user.id, email: result.user.email, role: result.user.role, tenantId: result.user.tenantId },
      { slug: result.tenant.slug, plan: result.tenant.plan }
    );

    const accessToken = signAccessToken(jwtPayload);
    const refreshToken = signRefreshToken(jwtPayload);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: result.user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    return {
      tenant: { id: result.tenant.id, slug: result.tenant.slug, status: result.tenant.status },
      user: { id: result.user.id, email: result.user.email, role: result.user.role },
      accessToken,
      refreshToken
    };
  },
  login: async (payload: LoginPayload, prisma: PrismaClient, tenantId: string) => {
    const email = payload.email.toLowerCase().trim();
    const user = await prisma.user.findFirst({
      where: { email, tenantId, isActive: true }
    });
    if (!user || !user.passwordHash) {
      throw new Error('Invalid credentials');
    }
    const ok = await verifyPassword(payload.password, user.passwordHash);
    if (!ok) {
      throw new Error('Invalid credentials');
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    const jwtPayload = buildJwtPayload(
      { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId },
      { slug: tenant.slug, plan: tenant.plan }
    );

    const accessToken = signAccessToken(jwtPayload);
    const refreshToken = signRefreshToken(jwtPayload);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    return {
      accessToken,
      refreshToken,
      tenantSlug: tenant.slug,
      tenantId: tenant.id
    };
  },
  refresh: async (payload: RefreshPayload, prisma: PrismaClient) => {
    let decoded: JwtPayload;
    try {
      decoded = verifyRefreshToken(payload.refreshToken);
    } catch {
      throw new Error('Invalid refresh token');
    }

    const refreshToken = await prisma.refreshToken.findUnique({
      where: { token: payload.refreshToken }
    });

    if (!refreshToken || refreshToken.expiresAt < new Date()) {
      throw new Error('Invalid refresh token');
    }

    const [user, tenant] = await Promise.all([
      prisma.user.findUnique({
        where: { id: decoded.sub },
        select: { id: true, email: true, role: true, tenantId: true, isActive: true }
      }),
      prisma.tenant.findUnique({
        where: { id: decoded.tenantId },
        select: { id: true, slug: true, plan: true }
      })
    ]);

    if (!user || !tenant || !user.isActive || user.tenantId !== tenant.id) {
      throw new Error('Invalid refresh token');
    }

    const jwtPayload = buildJwtPayload(
      { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId },
      { slug: tenant.slug, plan: tenant.plan }
    );

    const nextAccessToken = signAccessToken(jwtPayload);
    const nextRefreshToken = signRefreshToken(jwtPayload);

    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.delete({
        where: { token: payload.refreshToken }
      });
      await tx.refreshToken.create({
        data: {
          token: nextRefreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      });
    });

    return {
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
      tenantSlug: tenant.slug,
      tenantId: tenant.id
    };
  },
  forgotPassword: async (payload: { email: string }, prisma: PrismaClient, tenantId: string) => {
    const normalizedEmail = payload.email.toLowerCase().trim();
    const user = await prisma.user.findFirst({
      where: { tenantId, email: normalizedEmail, isActive: true }
    });

    if (!user) {
      return { success: true };
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: {
        tenantId,
        userId: user.id,
        tokenHash,
        expiresAt
      }
    });

    await prisma.notificationLog.create({
      data: {
        tenantId,
        userId: user.id,
        channel: 'EMAIL',
        event: 'password_reset',
        status: 'QUEUED',
        providerRef: rawToken
      }
    });

    return { success: true, token: rawToken };
  },
  resetPassword: async (
    payload: { token: string; newPassword: string },
    prisma: PrismaClient
  ) => {
    const tokenHash = createHash('sha256').update(payload.token).digest('hex');
    const token = await prisma.passwordResetToken.findUnique({
      where: { tokenHash }
    });

    if (!token || token.usedAt || token.expiresAt < new Date()) {
      throw new Error('Invalid or expired reset token');
    }

    const newHash = await hashPassword(payload.newPassword);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: token.userId },
        data: { passwordHash: newHash }
      }),
      prisma.passwordResetToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() }
      }),
      prisma.refreshToken.deleteMany({
        where: { userId: token.userId }
      })
    ]);

    return { success: true };
  }
};
