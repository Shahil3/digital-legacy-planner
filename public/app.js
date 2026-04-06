
/**
 * Digital Legacy Estate Planner - Main Application
 */

const API_BASE = window.location.origin;
let authToken = localStorage.getItem('authToken');
let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
let nominees = []; // Temporary nominees list for current upload

// ════════════════════════════════════════════════════════
// INITIALIZATION
// ════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  // Check if user is logged in
  if (authToken && currentUser) {
    showDashboard();
  } else {
    showAuth();
  }

  // Setup event listeners
  setupEventListeners();
});

function setupEventListeners() {
  // Auth form toggles
  document.getElementById('authToggleLink').addEventListener('click', toggleAuthForm);

  // Auth forms
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('registerForm').addEventListener('submit', handleRegister);

  // Upload form
  document.getElementById('uploadForm').addEventListener('submit', handleUpload);

  // Artifact type radio buttons
  document.querySelectorAll('input[name="artifactType"]').forEach(radio => {
    radio.addEventListener('change', handleArtifactTypeChange);
  });
}

// ════════════════════════════════════════════════════════
// AUTH FUNCTIONS
// ════════════════════════════════════════════════════════

function toggleAuthForm() {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const toggleText = document.getElementById('authToggleText');
  const toggleLink = document.getElementById('authToggleLink');

  if (loginForm.classList.contains('hidden')) {
    // Show login
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    toggleText.textContent = "Don't have an account?";
    toggleLink.textContent = "Sign up";
  } else {
    // Show register
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    toggleText.textContent = "Already have an account?";
    toggleLink.textContent = "Sign in";
  }

  // Clear alerts
  document.getElementById('authAlert').innerHTML = '';
}

async function handleLogin(e) {
  e.preventDefault();
  
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const btn = document.querySelector('#loginForm button');
  const btnText = document.getElementById('loginBtnText');

  try {
    btn.disabled = true;
    btnText.innerHTML = '<span class="loading"></span> Signing in...';

    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }

    // Save auth token and user info
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('authToken', authToken);
    localStorage.setItem('currentUser', JSON.stringify(currentUser));

    showAuthAlert('Login successful!', 'success');
    
    setTimeout(() => {
      showDashboard();
    }, 500);

  } catch (error) {
    showAuthAlert(error.message, 'error');
    btn.disabled = false;
    btnText.textContent = 'Sign In';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  
  const name = document.getElementById('registerName').value;
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;
  const btn = document.querySelector('#registerForm button');
  const btnText = document.getElementById('registerBtnText');

  try {
    btn.disabled = true;
    btnText.innerHTML = '<span class="loading"></span> Creating account...';

    const response = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    // Save auth token and user info
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('authToken', authToken);
    localStorage.setItem('currentUser', JSON.stringify(currentUser));

    showAuthAlert('Account created successfully!', 'success');
    
    setTimeout(() => {
      showDashboard();
    }, 500);

  } catch (error) {
    showAuthAlert(error.message, 'error');
    btn.disabled = false;
    btnText.textContent = 'Create Account';
  }
}

function logout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('authToken');
  localStorage.removeItem('currentUser');
  showAuth();
}

// ════════════════════════════════════════════════════════
// DASHBOARD FUNCTIONS
// ════════════════════════════════════════════════════════

async function showDashboard() {
  document.getElementById('authPage').classList.add('hidden');
  document.getElementById('dashboardPage').classList.remove('hidden');
  
  // Set user name
  document.getElementById('userName').textContent = currentUser.name;

  // Load dashboard data
  await Promise.all([
    loadDashboardStats(),
    loadArtifacts(),
    loadSwitchStatus()
  ]);
}

function showAuth() {
  document.getElementById('authPage').classList.remove('hidden');
  document.getElementById('dashboardPage').classList.add('hidden');
}

async function loadDashboardStats() {
  try {
    const response = await fetch(`${API_BASE}/api/dashboard/stats`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        logout();
        return;
      }
      throw new Error('Failed to load stats');
    }

    const data = await response.json();

    document.getElementById('statTotalArtifacts').textContent = data.totalArtifacts;
    document.getElementById('statPdfs').textContent = data.artifactTypes.pdf || 0;
    document.getElementById('statLinks').textContent = data.artifactTypes.link || 0;
    document.getElementById('statPasswords').textContent = data.artifactTypes.password || 0;

  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

async function loadArtifacts() {
  try {
    const response = await fetch(`${API_BASE}/api/artifacts`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (!response.ok) {
      throw new Error('Failed to load artifacts');
    }

    const data = await response.json();
    displayArtifacts(data.artifacts);

  } catch (error) {
    console.error('Error loading artifacts:', error);
  }
}

function displayArtifacts(artifacts) {
  const container = document.getElementById('artifactsList');

  if (artifacts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📦</div>
        <p>No artifacts yet. Upload your first digital asset to get started.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = artifacts.map(artifact => `
    <div class="artifact-card">
      <div class="artifact-info">
        <span class="artifact-type ${artifact.type}">${artifact.type}</span>
        <div class="artifact-description">${escapeHtml(artifact.description)}</div>
        <div class="artifact-meta">
          Created ${new Date(artifact.createdAt).toLocaleDateString()} · 
          ${artifact.nomineeCount} nominee${artifact.nomineeCount !== 1 ? 's' : ''}
        </div>
      </div>
      <button class="btn btn-danger" onclick="deleteArtifact('${artifact.id}')">Delete</button>
    </div>
  `).join('');
}

async function loadSwitchStatus() {
  try {
    const response = await fetch(`${API_BASE}/api/switch/status`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (!response.ok) {
      throw new Error('Failed to load switch status');
    }

    const data = await response.json();
    displaySwitchStatus(data);

  } catch (error) {
    console.error('Error loading switch status:', error);
  }
}

function displaySwitchStatus(status) {
  document.getElementById('switchDaysRemaining').textContent = status.daysRemaining;
  document.getElementById('switchNextCheckIn').textContent = 
    `Next check-in: ${new Date(status.nextCheckIn).toLocaleDateString()}`;

  // Calculate progress (inverse - more days = fuller bar)
  const progress = (status.daysRemaining / status.switchIntervalDays) * 100;
  document.getElementById('switchProgress').style.width = `${progress}%`;

  // Change color based on remaining days
  const progressBar = document.getElementById('switchProgress');
  if (status.daysRemaining < 7) {
    progressBar.style.background = '#dc2626'; // Red
  } else if (status.daysRemaining < 30) {
    progressBar.style.background = '#f59e0b'; // Orange
  } else {
    progressBar.style.background = 'white'; // White
  }
}

async function checkIn() {
  const btn = event.target;
  const btnText = document.getElementById('checkInBtnText');
  
  try {
    btn.disabled = true;
    btnText.innerHTML = '<span class="loading"></span> Checking in...';

    const response = await fetch(`${API_BASE}/api/switch/checkin`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (!response.ok) {
      throw new Error('Check-in failed');
    }

    btnText.textContent = '✓ Checked In!';
    
    // Reload switch status
    await loadSwitchStatus();

    setTimeout(() => {
      btnText.textContent = '✓ Check In Now';
      btn.disabled = false;
    }, 2000);

  } catch (error) {
    console.error('Check-in error:', error);
    alert('Check-in failed. Please try again.');
    btnText.textContent = '✓ Check In Now';
    btn.disabled = false;
  }
}

async function testTrigger() {
  if (!confirm('This will send a test email to all your nominees. Continue?')) {
    return;
  }

  const btn = event.target;
  const originalText = btn.textContent;
  
  try {
    btn.disabled = true;
    btn.textContent = '⏳ Triggering...';

    const response = await fetch(`${API_BASE}/api/switch/trigger-test`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (!response.ok) {
      throw new Error('Trigger failed');
    }

    alert('Test trigger successful! Check nominee emails (if email is configured).');
    btn.textContent = '✓ Sent!';

    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 2000);

  } catch (error) {
    console.error('Trigger error:', error);
    alert('Trigger failed. Please try again.');
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// ════════════════════════════════════════════════════════
// UPLOAD MODAL FUNCTIONS
// ════════════════════════════════════════════════════════

function openUploadModal() {
  document.getElementById('uploadModal').classList.remove('hidden');
  nominees = [];
  document.getElementById('nomineesList').innerHTML = '';
  document.getElementById('uploadForm').reset();
  document.getElementById('uploadAlert').innerHTML = '';
  
  // Add one default nominee field
  addNominee();
}

function closeUploadModal() {
  document.getElementById('uploadModal').classList.add('hidden');
}

function handleArtifactTypeChange(e) {
  const type = e.target.value;
  
  // Hide all inputs
  document.getElementById('pdfInput').classList.add('hidden');
  document.getElementById('linkInput').classList.add('hidden');
  document.getElementById('passwordInput').classList.add('hidden');

  // Show relevant input and update label
  const label = document.getElementById('dataInputLabel');
  
  if (type === 'pdf') {
    document.getElementById('pdfInput').classList.remove('hidden');
    label.textContent = 'Upload PDF';
  } else if (type === 'link') {
    document.getElementById('linkInput').classList.remove('hidden');
    label.textContent = 'Enter URL';
  } else if (type === 'password') {
    document.getElementById('passwordInput').classList.remove('hidden');
    label.textContent = 'Enter Password/Credential';
  }
}

function addNominee() {
  const id = Date.now();
  const nomineeHtml = `
    <div class="nominee-item" id="nominee-${id}">
      <input type="text" placeholder="Nominee Name" class="nominee-name" required>
      <input type="email" placeholder="Email" class="nominee-email" required>
      <input type="text" placeholder="Aadhaar (12 digits)" class="nominee-aadhar" required pattern="\\d{12}" maxlength="12">
      <button type="button" class="btn-icon" onclick="removeNominee(${id})">🗑️</button>
    </div>
  `;
  
  document.getElementById('nomineesList').insertAdjacentHTML('beforeend', nomineeHtml);
}

function removeNominee(id) {
  const element = document.getElementById(`nominee-${id}`);
  if (element) {
    element.remove();
  }
}

async function handleUpload(e) {
  e.preventDefault();
  
  const btn = document.querySelector('#uploadForm button[type="submit"]');
  const btnText = document.getElementById('uploadBtnText');

  try {
    // Get artifact type
    const type = document.querySelector('input[name="artifactType"]:checked').value;
    
    // Get description
    const description = document.getElementById('descriptionInput').value;

    // Get nominees
    const nomineeElements = document.querySelectorAll('.nominee-item');
    const nomineeList = [];
    
    for (const elem of nomineeElements) {
      const name = elem.querySelector('.nominee-name').value;
      const email = elem.querySelector('.nominee-email').value;
      const aadhar = elem.querySelector('.nominee-aadhar').value;

      if (!CryptoUtils.validateAadhaar(aadhar)) {
        throw new Error('Invalid Aadhaar number. Must be 12 digits.');
      }

      nomineeList.push({
        name,
        email,
        aadharNumber: aadhar
      });
    }

    if (nomineeList.length === 0) {
      throw new Error('Please add at least one nominee');
    }

    btn.disabled = true;
    btnText.innerHTML = '<span class="loading"></span> Encrypting...';

    let dataToEncrypt = '';

    // Get data based on type
    if (type === 'pdf') {
      const fileInput = document.getElementById('pdfInput');
      if (!fileInput.files[0]) {
        throw new Error('Please select a PDF file');
      }
      
      // For simplicity, we'll encrypt with the first nominee's Aadhaar
      // In production, you'd encrypt separately for each nominee
      const primaryAadhar = nomineeList[0].aadharNumber;
      
      btnText.innerHTML = '<span class="loading"></span> Reading file...';
      dataToEncrypt = await CryptoUtils.encryptFile(fileInput.files[0], primaryAadhar);
      
    } else if (type === 'link') {
      const link = document.getElementById('linkInput').value;
      if (!link) {
        throw new Error('Please enter a URL');
      }
      
      const primaryAadhar = nomineeList[0].aadharNumber;
      dataToEncrypt = await CryptoUtils.encrypt(link, primaryAadhar);
      
    } else if (type === 'password') {
      const password = document.getElementById('passwordInput').value;
      if (!password) {
        throw new Error('Please enter a password');
      }
      
      const primaryAadhar = nomineeList[0].aadharNumber;
      dataToEncrypt = await CryptoUtils.encrypt(password, primaryAadhar);
    }

    btnText.innerHTML = '<span class="loading"></span> Uploading...';

    // Upload to server
    const response = await fetch(`${API_BASE}/api/artifacts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type,
        encryptedData: dataToEncrypt,
        description,
        nomineeList
      })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Upload failed');
    }

    showUploadAlert('Artifact uploaded successfully!', 'success');
    
    // Reload dashboard
    await Promise.all([
      loadDashboardStats(),
      loadArtifacts()
    ]);

    setTimeout(() => {
      closeUploadModal();
    }, 1000);

  } catch (error) {
    console.error('Upload error:', error);
    showUploadAlert(error.message, 'error');
    btn.disabled = false;
    btnText.textContent = '🔒 Encrypt & Upload';
  }
}

async function deleteArtifact(id) {
  if (!confirm('Are you sure you want to delete this artifact?')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/artifacts/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (!response.ok) {
      throw new Error('Delete failed');
    }

    // Reload dashboard
    await Promise.all([
      loadDashboardStats(),
      loadArtifacts()
    ]);

  } catch (error) {
    console.error('Delete error:', error);
    alert('Failed to delete artifact. Please try again.');
  }
}

// ════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ════════════════════════════════════════════════════════

function showAuthAlert(message, type) {
  const alertDiv = document.getElementById('authAlert');
  alertDiv.innerHTML = `
    <div class="alert alert-${type}">
      ${escapeHtml(message)}
    </div>
  `;
}

function showUploadAlert(message, type) {
  const alertDiv = document.getElementById('uploadAlert');
  alertDiv.innerHTML = `
    <div class="alert alert-${type}">
      ${escapeHtml(message)}
    </div>
  `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
