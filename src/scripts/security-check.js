#!/usr/bin/env node

/**
 * Script untuk memeriksa konfigurasi keamanan dan mendeteksi vulnerabilitas
 * Run dengan: npm run security:check
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// Warna untuk output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

// Banner
console.log(`
${colors.cyan}${colors.bold}==============================================${colors.reset}
${colors.cyan}${colors.bold}         TRACAS SECURITY CHECK TOOL          ${colors.reset}
${colors.cyan}${colors.bold}==============================================${colors.reset}
`);

// Hasil pemeriksaan
const results = {
  passed: 0,
  warnings: 0,
  failed: 0
};

// Lokasi file utama
const rootDir = path.join(__dirname, '..', '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const envPath = path.join(rootDir, '.env');
const indexPath = path.join(rootDir, 'src', 'index.js');
const sslDir = path.join(rootDir, 'ssl');
const keysDir = path.join(rootDir, 'keys');

/**
 * Periksa package.json untuk dependensi yang tidak aman
 */
function checkDependencies() {
  console.log(`\n${colors.bold}Checking Dependencies...${colors.reset}`);
  
  try {
    // Periksa apakah file package.json ada
    if (!fs.existsSync(packageJsonPath)) {
      console.log(`${colors.red}✘ package.json not found!${colors.reset}`);
      results.failed++;
      return;
    }
    
    // Baca package.json
    const packageJson = require(packageJsonPath);
    
    // Dependensi yang diharapkan ada untuk keamanan
    const requiredSecurityDeps = [
      'helmet',
      'express-validator',
      'express-rate-limit',
      'jsonwebtoken',
      'bcrypt'
    ];
    
    // Periksa semua dependensi yang diharapkan
    const deps = { ...packageJson.dependencies };
    
    for (const dep of requiredSecurityDeps) {
      if (deps[dep]) {
        console.log(`${colors.green}✓ ${dep} found (${deps[dep]})${colors.reset}`);
        results.passed++;
      } else {
        console.log(`${colors.red}✘ ${dep} not found - critical security dependency!${colors.reset}`);
        results.failed++;
      }
    }
    
    // Check for npm audit
    try {
      const auditOutput = execSync('npm audit --json', { stdio: ['pipe', 'pipe', 'pipe'] }).toString();
      const auditResult = JSON.parse(auditOutput);
      
      if (auditResult.metadata.vulnerabilities.high > 0 || auditResult.metadata.vulnerabilities.critical > 0) {
        console.log(`${colors.red}✘ npm audit found vulnerabilities: ${auditResult.metadata.vulnerabilities.high} high, ${auditResult.metadata.vulnerabilities.critical} critical${colors.reset}`);
        results.failed++;
      } else if (auditResult.metadata.vulnerabilities.moderate > 0) {
        console.log(`${colors.yellow}⚠ npm audit found ${auditResult.metadata.vulnerabilities.moderate} moderate vulnerabilities${colors.reset}`);
        results.warnings++;
      } else {
        console.log(`${colors.green}✓ npm audit - no high or critical vulnerabilities${colors.reset}`);
        results.passed++;
      }
    } catch (error) {
      console.log(`${colors.yellow}⚠ Could not run npm audit: ${error.message}${colors.reset}`);
      results.warnings++;
    }
    
  } catch (error) {
    console.log(`${colors.red}✘ Error checking dependencies: ${error.message}${colors.reset}`);
    results.failed++;
  }
}

/**
 * Periksa environment variables untuk keamanan
 */
function checkEnvironment() {
  console.log(`\n${colors.bold}Checking Environment...${colors.reset}`);
  
  // Cek apakah .env ada
  if (!fs.existsSync(envPath)) {
    console.log(`${colors.yellow}⚠ .env file not found${colors.reset}`);
    results.warnings++;
  } else {
    console.log(`${colors.green}✓ .env file exists${colors.reset}`);
    results.passed++;
    
    // Cek file permissions untuk .env
    try {
      const stats = fs.statSync(envPath);
      const fileMode = stats.mode.toString(8);
      const ownerPermissions = fileMode.slice(-3)[0];
      
      if (parseInt(ownerPermissions) > 6) {
        console.log(`${colors.red}✘ .env file has insecure permissions: ${fileMode}${colors.reset}`);
        results.failed++;
      } else {
        console.log(`${colors.green}✓ .env file has secure permissions${colors.reset}`);
        results.passed++;
      }
    } catch (error) {
      console.log(`${colors.yellow}⚠ Could not check .env file permissions: ${error.message}${colors.reset}`);
      results.warnings++;
    }
    
    // Periksa isi .env
    try {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const envLines = envContent.split('\n');
      
      // Variabel yang diharapkan
      const expectedEnvVars = ['JWT_SECRET', 'JWT_EXPIRES_IN', 'CSRF_SECRET'];
      
      for (const varName of expectedEnvVars) {
        const varLine = envLines.find(line => line.startsWith(`${varName}=`));
        
        if (varLine) {
          const varValue = varLine.split('=')[1].trim();
          
          if (varValue.length < 16 && (varName.includes('SECRET') || varName.includes('KEY'))) {
            console.log(`${colors.yellow}⚠ ${varName} is too short (< 16 chars)${colors.reset}`);
            results.warnings++;
          } else {
            console.log(`${colors.green}✓ ${varName} is properly set${colors.reset}`);
            results.passed++;
          }
        } else {
          console.log(`${colors.yellow}⚠ ${varName} not found in .env${colors.reset}`);
          results.warnings++;
        }
      }
    } catch (error) {
      console.log(`${colors.yellow}⚠ Could not check .env contents: ${error.message}${colors.reset}`);
      results.warnings++;
    }
  }
  
  // Cek NODE_ENV
  if (process.env.NODE_ENV === 'production') {
    console.log(`${colors.green}✓ NODE_ENV is set to production${colors.reset}`);
    results.passed++;
  } else {
    console.log(`${colors.yellow}⚠ NODE_ENV is not set to production${colors.reset}`);
    results.warnings++;
  }
}

/**
 * Periksa keberadaan dan kualitas SSL certificates
 */
function checkSSL() {
  console.log(`\n${colors.bold}Checking SSL Configuration...${colors.reset}`);
  
  // Cek folder ssl
  if (!fs.existsSync(sslDir)) {
    console.log(`${colors.yellow}⚠ SSL directory not found${colors.reset}`);
    results.warnings++;
    return;
  }
  
  // Cek keberadaan certificates
  const certFile = path.join(sslDir, 'certificate.pem');
  const keyFile = path.join(sslDir, 'private-key.pem');
  
  if (!fs.existsSync(certFile)) {
    console.log(`${colors.yellow}⚠ SSL certificate not found${colors.reset}`);
    results.warnings++;
  } else {
    console.log(`${colors.green}✓ SSL certificate exists${colors.reset}`);
    results.passed++;
    
    // Cek certificate expiry
    try {
      const certData = fs.readFileSync(certFile);
      const cert = crypto.createX509Certificate(certData);
      const notAfter = new Date(cert.validTo);
      const now = new Date();
      const daysToExpiry = Math.floor((notAfter - now) / (1000 * 60 * 60 * 24));
      
      if (daysToExpiry < 0) {
        console.log(`${colors.red}✘ SSL certificate expired ${Math.abs(daysToExpiry)} days ago${colors.reset}`);
        results.failed++;
      } else if (daysToExpiry < 30) {
        console.log(`${colors.yellow}⚠ SSL certificate expires in ${daysToExpiry} days${colors.reset}`);
        results.warnings++;
      } else {
        console.log(`${colors.green}✓ SSL certificate valid for ${daysToExpiry} more days${colors.reset}`);
        results.passed++;
      }
    } catch (error) {
      console.log(`${colors.yellow}⚠ Could not check SSL certificate validity: ${error.message}${colors.reset}`);
      results.warnings++;
    }
  }
  
  if (!fs.existsSync(keyFile)) {
    console.log(`${colors.yellow}⚠ SSL private key not found${colors.reset}`);
    results.warnings++;
  } else {
    console.log(`${colors.green}✓ SSL private key exists${colors.reset}`);
    results.passed++;
    
    // Cek private key permissions
    try {
      const stats = fs.statSync(keyFile);
      const fileMode = stats.mode.toString(8);
      const ownerPermissions = fileMode.slice(-3)[0];
      
      if (parseInt(ownerPermissions) > 6) {
        console.log(`${colors.red}✘ Private key has insecure permissions: ${fileMode}${colors.reset}`);
        results.failed++;
      } else {
        console.log(`${colors.green}✓ Private key has secure permissions${colors.reset}`);
        results.passed++;
      }
    } catch (error) {
      console.log(`${colors.yellow}⚠ Could not check private key permissions: ${error.message}${colors.reset}`);
      results.warnings++;
    }
  }
}

/**
 * Periksa konfigurasi keamanan di source code
 */
function checkSecurityCode() {
  console.log(`\n${colors.bold}Checking Security Implementations...${colors.reset}`);
  
  // Check index.js for security middleware
  if (!fs.existsSync(indexPath)) {
    console.log(`${colors.red}✘ index.js not found${colors.reset}`);
    results.failed++;
    return;
  }
  
  try {
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    
    // Check for required security middleware
    const securityMiddleware = [
      'helmet', 
      'express-rate-limit', 
      'CSRF', 
      'ipBlocker',
      'hstsMiddleware'
    ];
    
    for (const middleware of securityMiddleware) {
      if (indexContent.includes(middleware)) {
        console.log(`${colors.green}✓ ${middleware} is implemented${colors.reset}`);
        results.passed++;
      } else {
        console.log(`${colors.red}✘ ${middleware} is not implemented${colors.reset}`);
        results.failed++;
      }
    }
    
    // Check for validation
    if (indexContent.includes('validator.middleware') || indexContent.includes('validateHeaders')) {
      console.log(`${colors.green}✓ Input validation is implemented${colors.reset}`);
      results.passed++;
    } else {
      console.log(`${colors.red}✘ Input validation not found${colors.reset}`);
      results.failed++;
    }
    
    // Check for WAF
    if (indexContent.includes('wafMiddleware')) {
      console.log(`${colors.green}✓ WAF protection is implemented${colors.reset}`);
      results.passed++;
    } else {
      console.log(`${colors.yellow}⚠ WAF protection may not be implemented${colors.reset}`);
      results.warnings++;
    }
  } catch (error) {
    console.log(`${colors.red}✘ Error checking security code: ${error.message}${colors.reset}`);
    results.failed++;
  }
  
  // Check for crypto key management
  if (!fs.existsSync(keysDir)) {
    console.log(`${colors.yellow}⚠ Keys directory not found, secure crypto may not be implemented${colors.reset}`);
    results.warnings++;
  } else {
    console.log(`${colors.green}✓ Keys directory exists${colors.reset}`);
    results.passed++;
    
    // Check permissions on keys directory
    try {
      const stats = fs.statSync(keysDir);
      const dirMode = stats.mode.toString(8);
      const ownerPermissions = dirMode.slice(-3)[0];
      
      if (parseInt(ownerPermissions) > 7) {
        console.log(`${colors.red}✘ Keys directory has insecure permissions: ${dirMode}${colors.reset}`);
        results.failed++;
      } else {
        console.log(`${colors.green}✓ Keys directory has secure permissions${colors.reset}`);
        results.passed++;
      }
    } catch (error) {
      console.log(`${colors.yellow}⚠ Could not check keys directory permissions: ${error.message}${colors.reset}`);
      results.warnings++;
    }
  }
}

/**
 * Periksa konfigurasi logging dan audit
 */
function checkLoggingAndAudit() {
  console.log(`\n${colors.bold}Checking Logging and Audit...${colors.reset}`);
  
  // Check for winston
  const loggerPath = path.join(rootDir, 'src', 'utils', 'logger.js');
  
  if (!fs.existsSync(loggerPath)) {
    console.log(`${colors.yellow}⚠ Logger not found at expected location${colors.reset}`);
    results.warnings++;
  } else {
    console.log(`${colors.green}✓ Logger implementation found${colors.reset}`);
    results.passed++;
    
    // Check logger content
    try {
      const loggerContent = fs.readFileSync(loggerPath, 'utf8');
      
      if (loggerContent.includes('securityLogger')) {
        console.log(`${colors.green}✓ Security-specific logging is implemented${colors.reset}`);
        results.passed++;
      } else {
        console.log(`${colors.yellow}⚠ Security-specific logging may not be implemented${colors.reset}`);
        results.warnings++;
      }
      
      // Check for file logging
      if (loggerContent.includes('File')) {
        console.log(`${colors.green}✓ File logging is implemented${colors.reset}`);
        results.passed++;
      } else {
        console.log(`${colors.yellow}⚠ File logging may not be implemented${colors.reset}`);
        results.warnings++;
      }
    } catch (error) {
      console.log(`${colors.yellow}⚠ Could not check logger implementation: ${error.message}${colors.reset}`);
      results.warnings++;
    }
  }
  
  // Check for logs directory
  const logsDir = path.join(rootDir, 'logs');
  
  if (!fs.existsSync(logsDir)) {
    console.log(`${colors.yellow}⚠ Logs directory not found${colors.reset}`);
    results.warnings++;
  } else {
    console.log(`${colors.green}✓ Logs directory exists${colors.reset}`);
    results.passed++;
    
    // Check permissions on logs directory
    try {
      const stats = fs.statSync(logsDir);
      const dirMode = stats.mode.toString(8);
      const ownerPermissions = dirMode.slice(-3)[0];
      
      if (parseInt(ownerPermissions) > 7) {
        console.log(`${colors.red}✘ Logs directory has insecure permissions: ${dirMode}${colors.reset}`);
        results.failed++;
      } else {
        console.log(`${colors.green}✓ Logs directory has secure permissions${colors.reset}`);
        results.passed++;
      }
    } catch (error) {
      console.log(`${colors.yellow}⚠ Could not check logs directory permissions: ${error.message}${colors.reset}`);
      results.warnings++;
    }
  }
}

// Run all checks
checkDependencies();
checkEnvironment();
checkSSL();
checkSecurityCode();
checkLoggingAndAudit();

// Print results
console.log(`\n${colors.cyan}${colors.bold}==============================================${colors.reset}`);
console.log(`${colors.bold}Security Check Results:${colors.reset}`);
console.log(`${colors.green}✓ ${results.passed} tests passed${colors.reset}`);
console.log(`${colors.yellow}⚠ ${results.warnings} warnings${colors.reset}`);
console.log(`${colors.red}✘ ${results.failed} tests failed${colors.reset}`);
console.log(`${colors.cyan}${colors.bold}==============================================${colors.reset}`);

// Final score
const totalChecks = results.passed + results.warnings + results.failed;
const score = Math.floor((results.passed / totalChecks) * 100);
let rating = '';

if (score >= 90) {
  rating = `${colors.green}A${colors.reset}`;
} else if (score >= 80) {
  rating = `${colors.green}B${colors.reset}`;
} else if (score >= 70) {
  rating = `${colors.yellow}C${colors.reset}`;
} else if (score >= 60) {
  rating = `${colors.yellow}D${colors.reset}`;
} else {
  rating = `${colors.red}F${colors.reset}`;
}

console.log(`${colors.bold}Security Score: ${score}% (Rating: ${rating})${colors.reset}`);

if (results.failed > 0) {
  console.log(`\n${colors.yellow}${colors.bold}Recommendation: Fix the failed tests to improve security.${colors.reset}`);
  process.exit(1);
} else if (results.warnings > 0) {
  console.log(`\n${colors.yellow}${colors.bold}Recommendation: Address warnings to reach optimal security level.${colors.reset}`);
  process.exit(0);
} else {
  console.log(`\n${colors.green}${colors.bold}Great job! Your security configuration looks solid.${colors.reset}`);
  process.exit(0);
} 