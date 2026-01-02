/*
  Warnings:

  - You are about to drop the column `failedAttempts` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `lockUntil` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "failedAttempts",
DROP COLUMN "lockUntil";
