/*
  Warnings:

  - A unique constraint covering the columns `[transactionId,userId]` on the table `TransactionMood` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "TransactionMood_transactionId_userId_key" ON "TransactionMood"("transactionId", "userId");
