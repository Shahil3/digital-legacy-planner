require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const archiver = require('archiver');
const cron = require('node-cron');
const fs = require('fs').promises;
const fsSync = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// In-memory databases (replace with real DB in production)
const users = new Map();
const artifacts = new Map();
const nominees = new Map();
const switchStatus = new Map();

// Email transporter configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// ============================================
// AUTH ROUTES
// ============================================

// Register new user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (users.has(email)) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = {
      id: Date.now().toString(),
      email,
      password: hashedPassword,
      name,
      createdAt: new Date().toISOString()
    };

    users.set(email, user);
    
    // Initialize switch status for new user
    switchStatus.set(user.id, {
      lastCheckIn: new Date().toISOString(),
      isActive: true,
      switchIntervalDays: parseInt(process.env.SWITCH_CHECK_INTERVAL_DAYS) || 90
    });

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'User registered successfully',
      token,
      user: { id: user.id, email: user.email, name: user.name }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = users.get(email);
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Update last check-in on login
    const status = switchStatus.get(user.id);
    if (status) {
      status.lastCheckIn = new Date().toISOString();
      switchStatus.set(user.id, status);
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, email: user.email, name: user.name }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ============================================
// ARTIFACT ROUTES
// ============================================

// Upload artifact
app.post('/api/artifacts', authenticateToken, async (req, res) => {
  try {
    const { type, encryptedData, description, nomineeList } = req.body;

    if (!type || !encryptedData || !description || !nomineeList || nomineeList.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const artifactId = `artifact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const artifact = {
      id: artifactId,
      userId: req.user.id,
      type, // 'pdf', 'link', or 'password'
      encryptedData, // Client-side encrypted data
      description,
      createdAt: new Date().toISOString()
    };

    artifacts.set(artifactId, artifact);

    // Store nominees for this artifact
    nominees.set(artifactId, nomineeList.map(n => ({
      aadharNumber: n.aadharNumber,
      email: n.email,
      name: n.name || 'Nominee'
    })));

    res.json({
      message: 'Artifact uploaded successfully',
      artifactId,
      artifact: {
        id: artifact.id,
        type: artifact.type,
        description: artifact.description,
        createdAt: artifact.createdAt
      }
    });
  } catch (error) {
    console.error('Artifact upload error:', error);
    res.status(500).json({ error: 'Failed to upload artifact' });
  }
});

// Get all artifacts for logged-in user
app.get('/api/artifacts', authenticateToken, async (req, res) => {
  try {
    const userArtifacts = [];
    
    for (const [id, artifact] of artifacts.entries()) {
      if (artifact.userId === req.user.id) {
        const artifactNominees = nominees.get(id) || [];
        userArtifacts.push({
          id: artifact.id,
          type: artifact.type,
          description: artifact.description,
          createdAt: artifact.createdAt,
          nomineeCount: artifactNominees.length
        });
      }
    }

    res.json({ artifacts: userArtifacts });
  } catch (error) {
    console.error('Get artifacts error:', error);
    res.status(500).json({ error: 'Failed to fetch artifacts' });
  }
});

// Delete artifact
app.delete('/api/artifacts/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const artifact = artifacts.get(id);

    if (!artifact) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    if (artifact.userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    artifacts.delete(id);
    nominees.delete(id);

    res.json({ message: 'Artifact deleted successfully' });
  } catch (error) {
    console.error('Delete artifact error:', error);
    res.status(500).json({ error: 'Failed to delete artifact' });
  }
});

// ============================================
// DEAD MAN'S SWITCH ROUTES
// ============================================

// Check-in (reset the timer) - FIXED VERSION
app.post('/api/switch/checkin', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    let status = switchStatus.get(userId);
    
    // FIX: If for some reason the switch status doesn't exist for this user, create it now
    if (!status) {
      console.log(`Initializing missing switch status for user: ${userId}`);
      status = {
        lastCheckIn: new Date().toISOString(),
        isActive: true,
        switchIntervalDays: parseInt(process.env.SWITCH_CHECK_INTERVAL_DAYS) || 90
      };
    } else {
      // Normal update
      status.lastCheckIn = new Date().toISOString();
      status.isActive = true;
    }

    // Save back to the Map
    switchStatus.set(userId, status);

    res.json({
      message: 'Check-in successful',
      lastCheckIn: status.lastCheckIn,
      nextCheckIn: new Date(Date.now() + status.switchIntervalDays * 24 * 60 * 60 * 1000).toISOString()
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Check-in failed' });
  }
});

// Get switch status - ALSO UPDATED TO PREVENT ERRORS
app.get('/api/switch/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    let status = switchStatus.get(userId);
    
    // FIX: Ensure we don't crash if the status is missing
    if (!status) {
      status = {
        lastCheckIn: new Date().toISOString(),
        isActive: true,
        switchIntervalDays: parseInt(process.env.SWITCH_CHECK_INTERVAL_DAYS) || 90
      };
      switchStatus.set(userId, status);
    }

    const lastCheckInDate = new Date(status.lastCheckIn);
    const daysSinceCheckIn = Math.floor((Date.now() - lastCheckInDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, status.switchIntervalDays - daysSinceCheckIn);

    res.json({
      lastCheckIn: status.lastCheckIn,
      isActive: status.isActive,
      switchIntervalDays: status.switchIntervalDays,
      daysSinceCheckIn,
      daysRemaining,
      nextCheckIn: new Date(lastCheckInDate.getTime() + status.switchIntervalDays * 24 * 60 * 60 * 1000).toISOString()
    });
  } catch (error) {
    console.error('Get switch status error:', error);
    res.status(500).json({ error: 'Failed to get switch status' });
  }
});

// ============================================
// DEAD MAN'S SWITCH CRON JOB
// ============================================

// Function to trigger the switch and send artifacts to nominees
async function triggerDeadMansSwitch(userId) {
  try {
    console.log(`Triggering Dead Man's Switch for user: ${userId}`);
    
    // Get user info
    let userEmail = null;
    let userName = null;
    for (const [email, user] of users.entries()) {
      if (user.id === userId) {
        userEmail = email;
        userName = user.name;
        break;
      }
    }

    if (!userEmail) {
      console.error('User not found for switch trigger');
      return;
    }

    // Get all artifacts for this user
    const userArtifacts = [];
    for (const [id, artifact] of artifacts.entries()) {
      if (artifact.userId === userId) {
        userArtifacts.push({ id, ...artifact });
      }
    }

    console.log(`Found ${userArtifacts.length} artifacts for user ${userName}`);

    // Group artifacts by nominee
    const nomineeArtifacts = new Map();

    for (const artifact of userArtifacts) {
      const artifactNominees = nominees.get(artifact.id) || [];
      
      for (const nominee of artifactNominees) {
        if (!nomineeArtifacts.has(nominee.email)) {
          nomineeArtifacts.set(nominee.email, {
            nominee,
            artifacts: []
          });
        }
        nomineeArtifacts.get(nominee.email).artifacts.push(artifact);
      }
    }

    // Send emails to each nominee
    for (const [email, data] of nomineeArtifacts.entries()) {
      await sendArtifactsToNominee(data.nominee, data.artifacts, userName);
    }

    // Mark switch as triggered
    const status = switchStatus.get(userId);
    if (status) {
      status.isActive = false;
      status.triggeredAt = new Date().toISOString();
      switchStatus.set(userId, status);
    }

    console.log(`Dead Man's Switch triggered successfully for user: ${userId}`);
  } catch (error) {
    console.error('Error triggering Dead Man\'s Switch:', error);
  }
}

// Function to send artifacts to a nominee
async function sendArtifactsToNominee(nominee, artifacts, ownerName) {
  try {
    console.log(`Sending ${artifacts.length} artifacts to ${nominee.email}`);

    // Create email content
    let emailContent = `
      <h2>Digital Legacy Inheritance Notification</h2>
      <p>Dear ${nominee.name},</p>
      <p>You have been designated as a nominee in <strong>${ownerName}'s</strong> Digital Legacy Estate Plan.</p>
      <p>The Dead Man's Switch has been triggered, and you now have access to the following artifacts:</p>
      <hr>
    `;

    for (const artifact of artifacts) {
      emailContent += `
        <div style="margin: 20px 0; padding: 15px; background: #f5f5f5; border-left: 4px solid #FF9933;">
          <h3>Artifact: ${artifact.description}</h3>
          <p><strong>Type:</strong> ${artifact.type.toUpperCase()}</p>
          <p><strong>Created:</strong> ${new Date(artifact.createdAt).toLocaleString()}</p>
          <p><strong>Encrypted Data:</strong></p>
          <div style="background: white; padding: 10px; border-radius: 5px; word-break: break-all; font-family: monospace; font-size: 12px;">
            ${artifact.encryptedData.substring(0, 200)}...
          </div>
          <p style="margin-top: 10px; color: #dc2626;">
            <strong>Password to decrypt:</strong> Your Aadhaar Number (${nominee.aadharNumber})
          </p>
        </div>
      `;
    }

    emailContent += `
      <hr>
      <p style="margin-top: 20px; font-size: 14px; color: #666;">
        <strong>Important:</strong> The encrypted data above can only be decrypted using your Aadhaar number as the password.
        Please keep this information secure and private.
      </p>
      <p style="font-size: 14px; color: #666;">
        This is an automated message from the Digital Legacy Estate Planner system.
      </p>
    `;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: nominee.email,
      subject: `Digital Legacy Inheritance - ${ownerName}`,
      html: emailContent
    };

    // Send email (only if email is configured)
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      await transporter.sendMail(mailOptions);
      console.log(`Email sent successfully to ${nominee.email}`);
    } else {
      console.log('Email not configured. Would have sent to:', nominee.email);
      console.log('Email content:', emailContent);
    }

  } catch (error) {
    console.error(`Error sending artifacts to ${nominee.email}:`, error);
  }
}

// Cron job to check for expired switches (runs every day at midnight)
cron.schedule('0 0 * * *', async () => {
  console.log('Running Dead Man\'s Switch check...');
  
  const now = Date.now();
  
  for (const [userId, status] of switchStatus.entries()) {
    if (!status.isActive) {
      continue; // Skip already triggered switches
    }

    const lastCheckInDate = new Date(status.lastCheckIn).getTime();
    const daysSinceCheckIn = Math.floor((now - lastCheckInDate) / (1000 * 60 * 60 * 24));

    if (daysSinceCheckIn >= status.switchIntervalDays) {
      console.log(`Switch expired for user ${userId}. Days since check-in: ${daysSinceCheckIn}`);
      await triggerDeadMansSwitch(userId);
    }
  }
});

// Manual trigger endpoint (for testing)
app.post('/api/switch/trigger-test', authenticateToken, async (req, res) => {
  try {
    await triggerDeadMansSwitch(req.user.id);
    res.json({ message: 'Dead Man\'s Switch triggered successfully (TEST MODE)' });
  } catch (error) {
    console.error('Manual trigger error:', error);
    res.status(500).json({ error: 'Failed to trigger switch' });
  }
});

// ============================================
// DASHBOARD STATS
// ============================================

app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    let artifactCount = 0;
    const artifactTypes = { pdf: 0, link: 0, password: 0 };
    const uniqueNominees = new Set();

    for (const [id, artifact] of artifacts.entries()) {
      if (artifact.userId === req.user.id) {
        artifactCount++;
        artifactTypes[artifact.type] = (artifactTypes[artifact.type] || 0) + 1;
        
        const artifactNominees = nominees.get(id) || [];
        artifactNominees.forEach(n => uniqueNominees.add(n.email));
      }
    }

    const status = switchStatus.get(req.user.id);
    let switchStatus_data = null;
    
    if (status) {
      const lastCheckInDate = new Date(status.lastCheckIn);
      const daysSinceCheckIn = Math.floor((Date.now() - lastCheckInDate.getTime()) / (1000 * 60 * 60 * 24));
      const daysRemaining = Math.max(0, status.switchIntervalDays - daysSinceCheckIn);
      
      switchStatus_data = {
        isActive: status.isActive,
        daysRemaining,
        lastCheckIn: status.lastCheckIn
      };
    }

    res.json({
      totalArtifacts: artifactCount,
      artifactTypes,
      totalNominees: uniqueNominees.size,
      switchStatus: switchStatus_data
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});


// Add this to your existing server.js file
// Insert these routes AFTER your existing dashboard stats route

// ============================================
// AI ROUTES (ADD THESE)
// ============================================

// AI: Get recommendations for user
app.get('/api/ai/recommendations', authenticateToken, async (req, res) => {
  try {
    // Get user's artifacts
    const userArtifacts = [];
    
    for (const [id, artifact] of artifacts.entries()) {
      if (artifact.userId === req.user.id) {
        const artifactNominees = nominees.get(id) || [];
        userArtifacts.push({
          id: artifact.id,
          type: artifact.type,
          description: artifact.description,
          createdAt: artifact.createdAt,
          nomineeCount: artifactNominees.length
        });
      }
    }

    // Simple AI analysis
    const recommendations = generateRecommendations(userArtifacts);
    const gaps = identifyGaps(userArtifacts);
    const riskScore = calculateRiskScore(userArtifacts);

    res.json({
      recommendations,
      gaps,
      riskScore,
      totalArtifacts: userArtifacts.length,
      message: riskScore > 60 ? 'High risk - action needed' : riskScore > 30 ? 'Medium risk' : 'Good coverage'
    });
  } catch (error) {
    console.error('AI recommendations error:', error);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

// AI: Auto-categorize artifact (helper endpoint)
app.post('/api/ai/categorize', authenticateToken, async (req, res) => {
  try {
    const { description } = req.body;
    
    if (!description) {
      return res.status(400).json({ error: 'Description required' });
    }

    const category = categorizeText(description);
    
    res.json({
      category: category.category,
      confidence: category.confidence,
      suggestedTags: category.tags
    });
  } catch (error) {
    console.error('Categorization error:', error);
    res.status(500).json({ error: 'Categorization failed' });
  }
});

// ============================================
// AI HELPER FUNCTIONS (ADD THESE)
// ============================================

function categorizeText(description) {
  const descLower = description.toLowerCase();
  
  const categories = {
    banking: ['bank', 'account', 'demat', 'savings', 'hdfc', 'icici', 'sbi', 'axis'],
    insurance: ['insurance', 'policy', 'lic', 'health', 'life', 'term'],
    investments: ['mutual fund', 'stocks', 'shares', 'zerodha', 'groww', 'sip'],
    crypto: ['bitcoin', 'crypto', 'wallet', 'wazirx', 'seed'],
    digital: ['email', 'gmail', 'facebook', 'instagram', 'social'],
    government: ['aadhaar', 'pan', 'passport', 'voter']
  };

  let bestCategory = 'other';
  let maxScore = 0;

  for (const [category, keywords] of Object.entries(categories)) {
    let score = 0;
    for (const keyword of keywords) {
      if (descLower.includes(keyword)) score++;
    }
    if (score > maxScore) {
      maxScore = score;
      bestCategory = category;
    }
  }

  const confidence = Math.min((maxScore / 3) * 100, 100);
  const tags = [];
  
  if (descLower.includes('urgent')) tags.push('urgent');
  if (descLower.includes('important')) tags.push('important');

  return {
    category: bestCategory,
    confidence: Math.round(confidence),
    tags
  };
}

function identifyGaps(artifacts) {
  const gaps = [];
  const categories = new Set(artifacts.map(a => categorizeText(a.description).category));

  if (!categories.has('banking')) {
    gaps.push({
      category: 'banking',
      priority: 'CRITICAL',
      message: 'No bank accounts documented'
    });
  }

  if (!categories.has('insurance')) {
    gaps.push({
      category: 'insurance',
      priority: 'HIGH',
      message: 'No insurance policies recorded'
    });
  }

  if (!categories.has('investments')) {
    gaps.push({
      category: 'investments',
      priority: 'HIGH',
      message: 'No investment accounts found'
    });
  }

  const withoutNominees = artifacts.filter(a => a.nomineeCount === 0);
  if (withoutNominees.length > 0) {
    gaps.push({
      category: 'nominees',
      priority: 'CRITICAL',
      message: `${withoutNominees.length} artifacts need nominees`
    });
  }

  return gaps;
}

function generateRecommendations(artifacts) {
  const recommendations = [];
  const categories = new Set(artifacts.map(a => categorizeText(a.description).category));

  if (!categories.has('banking')) {
    recommendations.push({
      priority: 'HIGH',
      icon: '🏦',
      title: 'Add Bank Account Details',
      description: 'Document your bank accounts with account numbers',
      estimatedTime: '5 min'
    });
  }

  if (!categories.has('investments')) {
    recommendations.push({
      priority: 'HIGH',
      icon: '📊',
      title: 'Add Investment Accounts',
      description: 'Add Demat accounts from Zerodha, Groww, etc.',
      estimatedTime: '10 min'
    });
  }

  if (!categories.has('insurance')) {
    recommendations.push({
      priority: 'MEDIUM',
      icon: '🛡️',
      title: 'Record Insurance Policies',
      description: 'Add LIC and health insurance details',
      estimatedTime: '7 min'
    });
  }

  if (artifacts.length < 5) {
    recommendations.push({
      priority: 'MEDIUM',
      icon: '✅',
      title: 'Complete Your Estate',
      description: 'Most people have 10-15 digital assets to document',
      estimatedTime: '15 min'
    });
  }

  const singleNominee = artifacts.filter(a => a.nomineeCount === 1);
  if (singleNominee.length > 2) {
    recommendations.push({
      priority: 'MEDIUM',
      icon: '👥',
      title: 'Add Backup Nominees',
      description: `${singleNominee.length} artifacts need backup nominees`,
      estimatedTime: '5 min'
    });
  }

  return recommendations;
}

function calculateRiskScore(artifacts) {
  let risk = 100;

  // Reduce risk based on number of artifacts
  risk -= Math.min(artifacts.length * 5, 30);

  // Check category coverage
  const categories = new Set(artifacts.map(a => categorizeText(a.description).category));
  risk -= categories.size * 8;

  // Check nominee coverage
  const withNominees = artifacts.filter(a => a.nomineeCount > 0).length;
  risk -= (withNominees / artifacts.length) * 30;

  return Math.max(0, Math.min(100, Math.round(risk)));
}

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║     🔐 Digital Legacy Estate Planner - Server Running     ║
║                                                            ║
║     Port: ${PORT}                                            ║
║     Environment: ${process.env.NODE_ENV}                             ║
║                                                            ║
║     API Endpoints:                                         ║
║     - POST /api/auth/register                              ║
║     - POST /api/auth/login                                 ║
║     - POST /api/artifacts                                  ║
║     - GET  /api/artifacts                                  ║
║     - POST /api/switch/checkin                             ║
║     - GET  /api/switch/status                              ║
║     - GET  /api/dashboard/stats                            ║
║                                                            ║
║     Dead Man's Switch: Active (runs daily at midnight)     ║
║     Switch Interval: ${process.env.SWITCH_CHECK_INTERVAL_DAYS} days                              ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
});



