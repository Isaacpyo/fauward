-- Console MFA (spec 02-data-model label 0036_console_mfa; renumbered because 0036_return_fees exists).
-- Self-service TOTP enrolment: pending secret (field-encryption ciphertext) and enrolment time.
ALTER TABLE "platform_users" ADD COLUMN     "mfaEnrolledAt" TIMESTAMP(3),
ADD COLUMN     "mfaPendingSecretEncrypted" TEXT;
