# finance-tracker-backend

A secure, feature-rich backend for personal finance management with advanced cybersecurity features and real-time monitoring.

---

## Features

### Core Financial
| Feature                  | Description                               |
|---------------------------|-------------------------------------------|
| Transactions              | Track income and expenses with categories |
| Budgets                   | Set and monitor budgets with rollover     |
| Financial Goals           | Save and track progress                   |
| Debt Management           | Track loans and credit cards              |
| Recurring Transactions    | Automate regular payments                 |

### Advanced Analytics
| Feature                  | Description                                |
|---------------------------|--------------------------------------------|
| Financial Analysis        | Multi-dimensional insights                  |
| Cash Flow                 | Daily/weekly/monthly tracking               |
| Spending Forecasting      | AI-powered predictions                      |
| Income Streams            | Diversification & reliability assessment   |
| Transaction Mood Tracking | Correlate spending with emotions           |

### Cybersecurity
| Feature                   | Description                                  |
|----------------------------|---------------------------------------------|
| Fraud Detection            | Real-time anomaly monitoring                |
| User Behavior Analytics    | Login patterns and location tracking        |
| Security Event Monitoring  | Suspicious activity alerts                  |
| Rate Limiting & Protection | DDoS and brute force protection             |
| Token Management           | JWT with blacklisting                        |

---

## Tech Stack
| Category       | Tools/Technologies                                     |
|----------------|-------------------------------------------------------|
| Runtime        | Node.js (ES Modules)                                  |
| Framework      | Express.js                                           |
| Database       | PostgreSQL with Prisma ORM                            |
| Authentication | JWT with refresh tokens                               |
| Real-time      | Socket.IO                                            |
| Security       | Helmet, express-rate-limit, express-mongo-sanitize, hpp |
| Logging        | Winston                                              |
| Validation     | express-validator                                    |

---

## Prerequisites
- Node.js 18+  
- PostgreSQL 14+  
- npm or yarn  
- Git  

---

Quick Start
1. Clone the Repository
git clone <repository-url>
cd fintech-cyber-backend

2. Install Dependencies
npm install

3. Environment Variables

Create a .env file based on .env.example:

NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:5173

DATABASE_URL="postgresql://username:password@localhost:5432/fintech_cyber?sslmode=require"

JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
BCRYPT_SALT_ROUNDS=12

SECURITY_ALERT_THRESHOLD=70
ENABLE_REALTIME_MONITORING=true
LOG_LEVEL=info

4. Database Setup
npx prisma generate
npx prisma migrate dev --name init
npm run seed # optional

5. Start the Server
# Development
npm run dev

# Production
npm start


Server runs at: http://localhost:5000

Project Structure
FINTECH-CYBER-BACKEND/
│
├── middleware/                 # Authentication & security middleware
├── prisma/                     # Database schema & migrations
├── routes/                     # API route handlers
│   ├── auth.js                 # Authentication & users
│   ├── transactions.js         # Transaction management
│   ├── analytics.js            # Financial analytics
│   ├── budgets.js              # Budget management
│   ├── goals.js                # Financial goals
│   ├── security.js             # Security monitoring
│   ├── debts.js                # Debt management
│   ├── recurringTransactions.js# Recurring payments
│   └── transactionMoods.js     # Emotional spending tracking
│
├── services/                   # Business logic
├── logs/                       # Application logs
├── server.js                   # App entry point
├── db.js                       # Database connection
└── logger.js                   # Logging configuration

Security Features
Authentication & Authorization

JWT authentication with refresh tokens

Role-based access control (Admin / User)

Token blacklisting (immediate revocation)

Rate limiting on sensitive endpoints

Data Protection

Input validation & sanitization

SQL injection prevention

XSS protection via Helmet

Secure CORS configuration

Password hashing with bcrypt

Monitoring & Detection

Real-time transaction monitoring

Spending anomaly detection

Suspicious login tracking

IP-based location analysis

Security event logging & audit trails

Database Schema (Key Models)
Model	Description
User	Auth data, login tracking, trusted locations, security metadata
Transaction	Amount, category, timestamp, fraud flags, risk score
Budget	Spending limits with rollover support
FinancialGoal	Target amount, progress tracking, deadlines
SecurityLog	Security events & audit trails
TransactionMood	Emotional context & spending correlation
RecurringTransaction	Scheduling rules & automation
Debt	Loans, credit balances, interest tracking
API Endpoints
Authentication (/api/auth)
Method	Endpoint	Description	Notes
POST	/register	Register new user	JWT issued
POST	/login	User login	Rate-limited
POST	/logout	Logout	Token blacklist
POST	/refresh	Refresh access token	
GET	/profile	Get user profile	
Transactions (/api/transactions)
Method	Endpoint	Description
GET	/	Get all transactions
POST	/	Create transaction + fraud check
GET	/flagged	Get flagged transactions
GET	/summary	Summary by timeframe
PATCH	/:id/review	Mark as reviewed
Analytics (/api/analytics)
Method	Endpoint	Description
GET	/comprehensive	Full financial analysis
GET	/cash-flow	Cash flow analysis
GET	/forecast	Spending predictions
GET	/income-streams	Income diversification
Budgets (/api/budgets)
Method	Endpoint	Description
GET	/	Get budgets
POST	/	Create budget
PUT	/:id	Update budget
GET	/overview	Performance overview
Security (/api/security)
Method	Endpoint	Description
GET	/events	Security events
GET	/summary	Risk assessment
POST	/alerts	Alert configuration
Development
Testing
npm test


Tests implemented using Jest & Supertest

Database Management
npx prisma generate
npx prisma migrate dev --name migration_name
npx prisma migrate reset
npx prisma studio

Logging

Logs stored in /logs

JSON logs in production

Colored console logs in development

Deployment
Production Checklist

Secure environment variables

Production PostgreSQL

HTTPS enabled

Monitoring & alerting

Regular backups

Docker Example
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npx prisma generate
EXPOSE 5000
CMD ["npm", "start"]

Real-Time Features

Live transaction notifications

Security alert broadcasting

Budget threshold warnings

Goal progress updates

Performance Monitoring

Health check: GET /health

Socket.IO real-time monitoring

Structured logging & DB pooling

Contributing

Fork the repository

Create a feature branch

Commit changes

Push to your fork

Open a Pull Request

License

MIT License — see LICENSE

Support

Check existing issues

Review documentation

Open a detailed issue report

Note: This is a production-grade fintech backend with a strong cybersecurity focus.
Ensure proper security configuration before deploying to production.