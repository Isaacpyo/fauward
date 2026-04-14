import type { FastifyInstance } from 'fastify';
import { authController } from './auth.controller.js';

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/api/v1/auth/register', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, authController.register);
  app.post('/api/v1/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, authController.login);
  app.post('/api/v1/auth/refresh', authController.refresh);
  app.post('/api/v1/auth/logout', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, authController.logout);
  app.post('/api/v1/auth/forgot-password', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, authController.forgotPassword);
  app.post('/api/v1/auth/reset-password', authController.resetPassword);
  app.get('/api/v1/auth/me', { preHandler: [app.authenticate] }, authController.me);
  app.post('/api/v1/auth/mfa/setup', { preHandler: [app.authenticate] }, authController.mfaSetup);
  app.post('/api/v1/auth/mfa/verify', { preHandler: [app.authenticate] }, authController.mfaVerify);
  app.post('/api/v1/auth/mfa/validate', authController.mfaValidate);
}
