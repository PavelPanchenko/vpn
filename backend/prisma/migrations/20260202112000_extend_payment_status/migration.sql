-- Extend PaymentStatus for scalable providers
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'CANCELED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'CHARGEBACK';

