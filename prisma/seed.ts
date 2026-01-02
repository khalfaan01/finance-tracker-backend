// FINTECH-CYBER-BACKEND/prisma/seed.ts
// Database seeding script for generating realistic test data with comprehensive financial scenarios
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import logger from '../logger.js';

const prisma = new PrismaClient();

/**
 * Main seeding function that orchestrates the entire data generation process
 */
async function main() {
  try {
    logger.info(' Starting database seeding process...');

    // Clear existing data in correct order to avoid foreign key constraints
    // Order matters: delete child records before parent records
    logger.info('  Clearing existing database records...');
    
    const deleteOperations = [
      prisma.transactionMood.deleteMany(),
      prisma.securityLog.deleteMany(),
      prisma.securityEvent.deleteMany(),
      prisma.transaction.deleteMany(),
      prisma.recurringTransaction.deleteMany(),
      prisma.debt.deleteMany(),
      prisma.financialGoal.deleteMany(),
      prisma.budget.deleteMany(),
      prisma.account.deleteMany(),
      prisma.user.deleteMany()
    ];

    await Promise.all(deleteOperations);
    logger.info(' Database cleared successfully');

    // Create users with enhanced security fields for realistic testing
    const hashedPassword = await bcrypt.hash('password123', 12);
    
    const user1 = await prisma.user.create({
      data: {
        email: 'john.doe@example.com',
        password: hashedPassword,
        name: 'John Doe',
        isVerified: true,
        alertEmailEnabled: true,
        typicalLoginHours: ['09:00-17:00'], // Normal working hours
        knownIPs: ['192.168.1.100'], // Trusted IP address
        lastUserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
    });

    const user2 = await prisma.user.create({
      data: {
        email: 'jane.smith@example.com',
        password: hashedPassword,
        name: 'Jane Smith',
        isVerified: true,
        alertEmailEnabled: true,
        typicalLoginHours: ['08:00-16:00'], // Different work schedule
        knownIPs: ['192.168.1.101'],
        lastUserAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      },
    });

    logger.info(` Created users: ${user1.email}, ${user2.email}`);

    // Create bank accounts for each user with realistic balances
    const user1Account = await prisma.account.create({
      data: {
        userId: user1.id,
        name: 'Primary Checking',
        balance: 5000.00, // Realistic checking account balance
      },
    });

    const user1Savings = await prisma.account.create({
      data: {
        userId: user1.id,
        name: 'Savings Account',
        balance: 15000.00, // Higher balance for savings
      },
    });

    const user2Account = await prisma.account.create({
      data: {
        userId: user2.id,
        name: 'Main Account',
        balance: 7500.00, // Different balance for second user
      },
    });

    logger.info(' Created user accounts with realistic balances');

    // Define realistic transaction categories for data generation
    const categories = {
      income: ['Salary', 'Freelance', 'Investment', 'Bonus', 'Side Hustle'],
      expense: ['Food', 'Transport', 'Entertainment', 'Bills', 'Shopping', 'Healthcare', 'Education', 'Travel']
    };

    const users = [
      { user: user1, accounts: [user1Account, user1Savings] },
      { user: user2, accounts: [user2Account] }
    ];

    // Process each user to create comprehensive financial data
    for (const { user, accounts } of users) {
      logger.info(` Generating comprehensive financial data for ${user.name}...`);

      // Create realistic budgets for each expense category
      for (const category of categories.expense) {
        await prisma.budget.create({
          data: {
            userId: user.id,
            category: category,
            limit: Math.floor(Math.random() * 1000) + 200, // Budget between $200-$1200
            spent: 0, // Will be populated by actual transactions
            period: 'monthly',
            rolloverType: ['none', 'full', 'partial'][Math.floor(Math.random() * 3)] as any,
            rolloverAmount: Math.floor(Math.random() * 100), // $0-$100 rollover
            allowExceed: Math.random() > 0.7 // 30% of budgets allow exceeding
          },
        });
      }

      logger.debug(`Created budgets for ${categories.expense.length} expense categories`);

      // Create realistic financial goals with varying targets
      const goals = [
        { name: 'Emergency Fund', target: 10000, category: 'savings' },
        { name: 'Vacation to Europe', target: 5000, category: 'savings' },
        { name: 'New Car', target: 20000, category: 'savings' },
        { name: 'Home Down Payment', target: 50000, category: 'savings' }
      ];

      for (const goal of goals.slice(0, 2)) { // Each user gets 2 active goals
        await prisma.financialGoal.create({
          data: {
            userId: user.id,
            name: goal.name,
            targetAmount: goal.target,
            currentAmount: Math.floor(Math.random() * goal.target * 0.7), // 0-70% progress
            deadline: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 6 months from now
            category: goal.category,
            allocationPercentage: Math.floor(Math.random() * 20) + 5, // 5-25% allocation
            isActive: true
          },
        });
      }

      logger.debug(`Created 2 financial goals with realistic progress tracking`);

      // Generate 3 months of realistic transaction history
      const today = new Date();
      const transactionMoods = ['happy', 'stressed', 'bored', 'impulsive', 'planned', 'anxious', 'excited', 'regretful'];
      let transactionCount = 0;
      
      for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
        const monthDate = new Date(today.getFullYear(), today.getMonth() - monthOffset, 1);
        
        // Generate 25-40 transactions per month (realistic frequency)
        const transactionsCount = Math.floor(Math.random() * 16) + 25;
        
        for (let i = 0; i < transactionsCount; i++) {
          // Create random transaction date within the month
          const transactionDate = new Date(
            monthDate.getFullYear(),
            monthDate.getMonth(),
            Math.floor(Math.random() * 28) + 1, // Day 1-28
            Math.floor(Math.random() * 24), // Random hour
            Math.floor(Math.random() * 60)  // Random minute
          );

          const isIncome = Math.random() > 0.75; // 25% chance of income (realistic ratio)
          const account = accounts[Math.floor(Math.random() * accounts.length)];
          
          let amount: number, category: string, description: string;
          
          if (isIncome) {
            // Income amounts: $1000-3000 (realistic income range)
            amount = Math.floor(Math.random() * 2000) + 1000;
            category = categories.income[Math.floor(Math.random() * categories.income.length)];
            description = `${category} payment`;
          } else {
            // Expense amounts: $10-310 (realistic expense range)
            amount = -(Math.floor(Math.random() * 300) + 10);
            category = categories.expense[Math.floor(Math.random() * categories.expense.length)];
            
            // Realistic descriptions based on category
            const descriptions: { [key: string]: string[] } = {
              'Food': ['Restaurant dinner', 'Groceries', 'Coffee shop', 'Lunch with colleagues'],
              'Transport': ['Gas station', 'Public transport', 'Uber ride', 'Car maintenance'],
              'Entertainment': ['Movie tickets', 'Concert', 'Netflix subscription', 'Game purchase'],
              'Bills': ['Electricity bill', 'Internet bill', 'Water bill', 'Phone bill'],
              'Shopping': ['Clothing', 'Electronics', 'Home goods', 'Online shopping'],
              'Healthcare': ['Doctor visit', 'Pharmacy', 'Dental checkup', 'Health insurance'],
              'Education': ['Online course', 'Books', 'Workshop', 'Software subscription'],
              'Travel': ['Hotel booking', 'Flight tickets', 'Airbnb', 'Travel insurance']
            };
            
            description = descriptions[category] ? 
              descriptions[category][Math.floor(Math.random() * descriptions[category].length)] : 
              `${category} expense`;
          }

          const transaction = await prisma.transaction.create({
            data: {
              accountId: account.id,
              amount: amount,
              type: isIncome ? 'income' : 'expense',
              category: category,
              date: transactionDate,
              description: description,
              flagged: Math.random() > 0.95, // 5% flagged for fraud detection testing
              fraudReason: Math.random() > 0.95 ? 'Unusual spending pattern detected' : null,
              riskScore: Math.random() > 0.9 ? Math.floor(Math.random() * 40) + 60 : Math.floor(Math.random() * 30),
              reviewed: Math.random() > 0.9 // 10% already reviewed
            },
          });

          // Add emotional mood data to 30% of transactions for behavioral analytics
          if (Math.random() > 0.7) {
            await prisma.transactionMood.create({
              data: {
                transactionId: transaction.id,
                userId: user.id,
                mood: transactionMoods[Math.floor(Math.random() * transactionMoods.length)] as any,
                intensity: Math.floor(Math.random() * 10) + 1, // Intensity 1-10
                notes: Math.random() > 0.8 ? 'This was an impulse purchase' : null
              },
            });
          }

          transactionCount++;
        }
      }

      logger.debug(`Generated ${transactionCount} transactions across 3 months`);

      // Create recurring transactions (subscriptions, salaries, etc.)
      const recurringTemplates = [
        { description: 'Netflix Subscription', amount: -15.99, category: 'Entertainment', frequency: 'monthly' },
        { description: 'Gym Membership', amount: -49.99, category: 'Healthcare', frequency: 'monthly' },
        { description: 'Salary', amount: 4500.00, category: 'Salary', frequency: 'monthly' },
        { description: 'Spotify Premium', amount: -9.99, category: 'Entertainment', frequency: 'monthly' }
      ];

      for (const template of recurringTemplates.slice(0, 2)) { // Each user gets 2 recurring transactions
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1); // Started last month
        
        await prisma.recurringTransaction.create({
          data: {
            userId: user.id,
            accountId: accounts[0].id,
            amount: Math.abs(template.amount),
            type: template.amount > 0 ? 'income' : 'expense',
            category: template.category,
            description: template.description,
            frequency: template.frequency as any,
            interval: 1,
            startDate: startDate,
            nextRunDate: new Date(startDate.getFullYear(), startDate.getMonth() + 1, startDate.getDate()),
            isActive: true,
            autoApprove: true,
            totalRuns: 1
          },
        });
      }

      logger.debug('Created 2 recurring transactions (income and expense)');

      // Create debt records for realistic financial profiles
      const debtTypes = [
        { name: 'Credit Card Debt', type: 'credit_card', principal: 5000, interest: 18.5, term: 36 },
        { name: 'Student Loan', type: 'loan', principal: 25000, interest: 5.5, term: 120 },
        { name: 'Car Loan', type: 'loan', principal: 15000, interest: 6.2, term: 60 }
      ];

      for (const debtType of debtTypes.slice(0, 2)) { // Each user has 2 active debts
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 12); // Started 1 year ago
        
        await prisma.debt.create({
          data: {
            userId: user.id,
            name: debtType.name,
            type: debtType.type as any,
            principal: debtType.principal,
            balance: debtType.principal * (0.3 + Math.random() * 0.5), // 30-80% remaining balance
            interestRate: debtType.interest,
            minimumPayment: debtType.principal * 0.03, // 3% minimum payment
            startDate: startDate,
            dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // Due in 15 days
            termMonths: debtType.term,
            paymentsMade: Math.floor(Math.random() * 12) + 6, // 6-18 payments made
            lender: ['Chase Bank', 'Wells Fargo', 'Bank of America', 'Local Credit Union'][Math.floor(Math.random() * 4)],
            isActive: true
          },
        });
      }

      logger.debug('Created 2 debt records with realistic repayment progress');

      // Generate security logs for login history and security monitoring
      const securityActions = ['login_success', 'login_failed', 'password_change', 'profile_update'];
      
      for (let i = 0; i < 20; i++) { // 20 security logs per user
        const logDate = new Date();
        logDate.setDate(logDate.getDate() - Math.floor(Math.random() * 30)); // Random day in last 30 days
        
        await prisma.securityLog.create({
          data: {
            userId: user.id,
            action: securityActions[Math.floor(Math.random() * securityActions.length)],
            ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            timestamp: logDate,
            details: 'Regular security activity',
            riskScore: Math.floor(Math.random() * 20) // Low risk for normal activities
          },
        });
      }

      logger.debug('Generated 20 security logs for login history');

      // Create security events for fraud detection testing
      await prisma.securityEvent.create({
        data: {
          userId: user.id,
          type: 'suspicious_transaction',
          severity: 'medium',
          title: 'Unusual spending pattern detected',
          message: 'A transaction was flagged for exceeding typical spending limits',
          resolved: false
        },
      });

      logger.info(` Completed comprehensive data generation for ${user.name}`);
    }

    // Log final summary with all generated data
    logger.info(' Database seeding completed successfully!');
    logger.info('');
    logger.info(' SEEDED DATA SUMMARY:');
    logger.info('    2 users created with security profiles');
    logger.info('    3 accounts created with realistic balances');
    logger.info('    16 budgets created (8 expense categories per user)');
    logger.info('    4 financial goals created (2 per user with progress tracking)');
    logger.info('    150-240 transactions created (75-120 per user across 3 months)');
    logger.info('    4 recurring transactions created (2 subscriptions per user)');
    logger.info('    4 debts created (2 loans per user with repayment history)');
    logger.info('     40 security logs created (20 login events per user)');
    logger.info('     2 security events created (1 suspicious activity per user)');
    logger.info('');
    logger.info(' TEST CREDENTIALS:');
    logger.info('   User 1: john.doe@example.com / password123');
    logger.info('   User 2: jane.smith@example.com / password123');
    logger.info('');
    logger.info(' You can now start the backend server and test the application!');

  } catch (error) {
    logger.error(' Critical error during database seeding:', error);
    throw error;
  }
}

// Execute seeding with proper error handling
main()
  .catch(e => {
    logger.error(' Seed process failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
      logger.debug('Database connection closed successfully');
    } catch (error) {
      logger.error('Error disconnecting from database:', error);
    }
  });