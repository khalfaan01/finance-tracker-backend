-- AlterTable
ALTER TABLE "Budget" ADD COLUMN     "allowExceed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rolloverAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "rolloverType" TEXT NOT NULL DEFAULT 'none';

-- AlterTable
ALTER TABLE "FinancialGoal" ADD COLUMN     "allocationPercentage" DOUBLE PRECISION,
ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'savings',
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isCompleted" BOOLEAN NOT NULL DEFAULT false;
