-- Add NEW to VpnUserStatus enum (user just entered, no server activated / no payment yet)
ALTER TYPE "VpnUserStatus" ADD VALUE 'NEW';
