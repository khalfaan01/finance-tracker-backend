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

# Fintech Cyber Backend

> A production‑ready fintech backend with a strong cybersecurity focus. Built to handle secure authentication, fraud‑aware transaction processing, real‑time monitoring, and advanced financial analytics.

---

## Tech Stack

| Category       | Tools / Technologies                                    |
| -------------- | ------------------------------------------------------- |
| Runtime        | Node.js (ES Modules)                                    |
| Framework      | Express.js                                              |
| Database       | PostgreSQL + Prisma ORM                                 |
| Authentication | JWT (access & refresh tokens)                           |
| Real‑time      | Socket.IO                                               |
| Security       | Helmet, express‑rate‑limit, express‑mongo‑sanitize, HPP |
| Logging        | Winston                                                 |
| Validation     | express‑validator                                       |

---

## Prerequisites

* Node.js **18+**
* PostgreSQL **14+**
* npm or yarn
* Git

---

## Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd fintech-cyber-backend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Variables

Create a `.env` file based on `.env.example`:

```env
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:5173

DATABASE_URL="postgresql://username:password@localhost:5432/fintech_cyber?sslmode=require"

JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
BCRYPT_SALT_ROUNDS=12

SECURITY_ALERT_THRESHOLD=70
ENABLE_REALTIME_MONITORING=true
LOG_LEVEL=info
```

### 4. Database Setup

```bash
npx prisma generate
npx prisma migrate dev --name init
npm run seed # optional
```

### 5. Start the Server

#### Development

```bash
npm run dev
```

#### Production

```bash
npm start
```

Server runs at: **[http://localhost:5000](http://localhost:5000)**

---

## Project Structure

```text
FINTECH-CYBER-BACKEND/
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
├── services/                   # Business logic
├── logs/                       # Application logs
├── server.js                   # Application entry point
├── db.js                       # Database connection
└── logger.js                   # Logging configuration
```

---

## Security Features

### Authentication & Authorization

* JWT‑based authentication with refresh tokens
* Role‑based access control (Admin / User)
* Token blacklisting for immediate revocation
* Rate limiting on sensitive endpoints

### Data Protection

* Input validation & sanitization
* SQL injection prevention
* XSS protection via Helmet
* Secure CORS configuration
* Password hashing using bcrypt

### Monitoring & Detection

* Real‑time transaction monitoring
* Spending anomaly detection
* Suspicious login tracking
* IP‑based location analysis
* Security event logging & audit trails

---

## Database Schema (Key Models)

| Model                    | Description                                                               |
| ------------------------ | ------------------------------------------------------------------------- |
| **User**                 | Authentication data, login tracking, trusted locations, security metadata |
| **Transaction**          | Amount, category, timestamp, fraud flags, risk score, review status       |
| **Budget**               | Spending limits with rollover support                                     |
| **FinancialGoal**        | Target amount, progress tracking, deadlines                               |
| **SecurityLog**          | Security events and audit trails                                          |
| **TransactionMood**      | Emotional context and spending correlation                                |
| **RecurringTransaction** | Scheduling rules and automated execution                                  |
| **Debt**                 | Loan and credit tracking, interest and balances                           |

---

## API Endpoints

### Authentication (`/api/auth`)

| Method | Endpoint    | Description          | Notes              |
| ------ | ----------- | -------------------- | ------------------ |
| POST   | `/register` | Register new user    | JWT issued         |
| POST   | `/login`    | User login           | Rate‑limited       |
| POST   | `/logout`   | Logout user          | Token blacklisting |
| POST   | `/refresh`  | Refresh access token | —                  |
| GET    | `/profile`  | Get user profile     | —                  |

---

### Transactions (`/api/transactions`)

| Method | Endpoint      | Description                         |
| ------ | ------------- | ----------------------------------- |
| GET    | `/`           | Get all user transactions           |
| POST   | `/`           | Create transaction with fraud check |
| GET    | `/flagged`    | Get flagged transactions            |
| GET    | `/summary`    | Summary by timeframe                |
| PATCH  | `/:id/review` | Mark transaction as reviewed        |

---

### Analytics (`/api/analytics`)

| Method | Endpoint          | Description                     |
| ------ | ----------------- | ------------------------------- |
| GET    | `/comprehensive`  | Full financial analysis         |
| GET    | `/cash-flow`      | Cash flow analysis              |
| GET    | `/forecast`       | Spending predictions            |
| GET    | `/income-streams` | Income diversification analysis |

---

### Budgets (`/api/budgets`)

| Method | Endpoint    | Description                 |
| ------ | ----------- | --------------------------- |
| GET    | `/`         | Get all budgets             |
| POST   | `/`         | Create new budget           |
| PUT    | `/:id`      | Update budget               |
| GET    | `/overview` | Budget performance overview |

---

### Security (`/api/security`)

| Method | Endpoint   | Description                 |
| ------ | ---------- | --------------------------- |
| GET    | `/events`  | Get security events         |
| GET    | `/summary` | Security risk assessment    |
| POST   | `/alerts`  | Configure alert preferences |

---

## Development

### Testing

```bash
npm test
```

Tests are implemented using **Jest** and **Supertest**.

### Database Management

```bash
npx prisma generate
npx prisma migrate dev --name migration_name
npx prisma migrate reset
npx prisma studio
```

### Logging

* Logs stored in `/logs`
* Structured JSON logs in production
* Colored console logs in development

---

## Real‑Time Features

* Live transaction notifications
* Security alert broadcasting
* Budget threshold warnings
* Goal progress updates

---

## Performance Monitoring

* Health check endpoint: `GET /health`
* Real‑time monitoring via Socket.IO
* Structured logging & database connection pooling

---

## Deployment

### Production Considerations

* Secure all environment variables
* Use a production PostgreSQL instance
* Enable HTTPS
* Set up monitoring and alerts
* Schedule regular database backups

### Docker Example

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npx prisma generate
EXPOSE 5000
CMD ["npm", "start"]
```

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to your fork
5. Open a Pull Request

---

## License

MIT License — see the `LICENSE` file for details.

---

## Support

* Check existing issues
* Review documentation
* Create a detailed issue report if needed

---

> **Note:** This backend is designed with fintech‑grade security in mind. Always review and harden configuration before deploying to production.
