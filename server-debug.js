console.log(" DEBUG: Starting import checks...");

// Test imports one by one
const testImports = async () => {
  const imports = [
    { name: "cors", module: "cors" },
    { name: "dotenv", module: "dotenv" },
    { name: "express", module: "express" },
    { name: "express-mongo-sanitize", module: "express-mongo-sanitize" },
    { name: "express-rate-limit", module: "express-rate-limit" },
    { name: "helmet", module: "helmet" },
    { name: "hpp", module: "hpp" },
    { name: "http", module: "http" },
    { name: "socket.io", module: "socket.io" },
  ];

  for (const imp of imports) {
    try {
      console.log(` Testing ${imp.name}...`);
      await import(imp.module);
      console.log(` ${imp.name} imported successfully`);
    } catch (error) {
      console.log(` ${imp.name} FAILED: ${error.message}`);
      console.log(`   ${error.stack}`);
      return false;
    }
  }

  return true;
};

// Test local imports
const testLocalImports = () => {
  console.log("\n Testing local imports...");

  const localImports = [
    "./db.js",
    "./logger.js",
    "./routes/auth.js",
    "./routes/transactions.js",
    "./routes/accounts.js",
    "./routes/budgets.js",
    "./routes/goals.js",
    "./routes/security.js",
    "./routes/transactionMoods.js",
    "./routes/recurringTransactions.js",
    "./routes/analytics.js",
    "./routes/debts.js",
  ];

  for (const imp of localImports) {
    try {
      console.log(` Testing ${imp}...`);
      // Use dynamic import for ES6 modules
      import(imp)
        .then(() => {
          console.log(` ${imp} imported successfully`);
        })
        .catch((error) => {
          console.log(` ${imp} FAILED: ${error.message}`);
          console.log(`   ${error.stack}`);
        });
    } catch (error) {
      console.log(` ${imp} FAILED: ${error.message}`);
    }
  }
};

// Run tests
testImports().then((success) => {
  if (success) {
    console.log("\n All npm imports passed!");
    testLocalImports();
  } else {
    console.log("\n Failed on npm import");
  }
});
