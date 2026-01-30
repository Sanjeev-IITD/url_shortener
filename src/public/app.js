/* ========================================
   URL Shortener - Main Application Logic
   ======================================== */

// API Configuration
const API_BASE = window.location.origin;

// DOM Elements
const elements = {
    // Auth
    authLoading: document.getElementById('auth-loading'),
    authLoggedOut: document.getElementById('auth-logged-out'),
    authLoggedIn: document.getElementById('auth-logged-in'),
    loginBtn: document.getElementById('login-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    userAvatar: document.getElementById('user-avatar'),
    userName: document.getElementById('user-name'),

    // Tabs
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabContents: document.querySelectorAll('.tab-content'),

    // Shorten Form
    shortenForm: document.getElementById('shorten-form'),
    longUrlInput: document.getElementById('long-url'),
    customAlias: document.getElementById('custom-alias'),
    topic: document.getElementById('topic'),
    expiration: document.getElementById('expiration'),
    toggleOptions: document.getElementById('toggle-options'),
    advancedOptions: document.getElementById('advanced-options'),
    shortenBtn: document.getElementById('shorten-btn'),
    resultContainer: document.getElementById('result-container'),
    shortUrlInput: document.getElementById('short-url'),
    copyBtn: document.getElementById('copy-btn'),
    originalUrl: document.getElementById('original-url'),

    // Test Mode
    endpointBtns: document.querySelectorAll('.endpoint-btn'),
    selectedMethod: document.getElementById('selected-method'),
    requestUrl: document.getElementById('request-url'),
    requestBody: document.getElementById('request-body'),
    sendRequestBtn: document.getElementById('send-request-btn'),
    responseStatus: document.getElementById('response-status'),
    responseTime: document.getElementById('response-time'),
    responseBody: document.getElementById('response-body'),

    // Analytics
    refreshAnalytics: document.getElementById('refresh-analytics'),
    totalUrls: document.getElementById('total-urls'),
    totalClicks: document.getElementById('total-clicks'),
    uniqueLocations: document.getElementById('unique-locations'),
    topUrlsBody: document.getElementById('top-urls-body'),

    // Toast
    toastContainer: document.getElementById('toast-container')
};

// State
let currentUser = null;
let clicksChart = null;
let devicesChart = null;

/* ========================================
   Initialization
   ======================================== */

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initShortenForm();
    initTestMode();
    initAnalytics();
    checkAuthStatus();
});

/* ========================================
   Authentication
   ======================================== */

async function checkAuthStatus() {
    try {
        const response = await fetch(`${API_BASE}/auth/current-auth`, {
            credentials: 'include'
        });

        const data = await response.json();

        elements.authLoading.classList.add('hidden');

        if (data.authenticated && data.user) {
            currentUser = data.user;
            showLoggedInState();
        } else {
            showLoggedOutState();
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        elements.authLoading.classList.add('hidden');
        showLoggedOutState();
    }
}

function showLoggedInState() {
    elements.authLoggedOut.classList.add('hidden');
    elements.authLoggedIn.classList.remove('hidden');

    if (currentUser) {
        elements.userAvatar.src = currentUser.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(currentUser.name || 'User');
        elements.userName.textContent = currentUser.name || currentUser.email || 'User';
    }
}

function showLoggedOutState() {
    elements.authLoggedIn.classList.add('hidden');
    elements.authLoggedOut.classList.remove('hidden');
}

// Login button
elements.loginBtn?.addEventListener('click', () => {
    window.location.href = `${API_BASE}/auth/google`;
});

// Logout button
elements.logoutBtn?.addEventListener('click', async () => {
    try {
        await fetch(`${API_BASE}/auth/logout`, {
            credentials: 'include'
        });
        currentUser = null;
        showLoggedOutState();
        showToast('Logged out successfully', 'success');
    } catch (error) {
        console.error('Logout failed:', error);
        showToast('Logout failed', 'error');
    }
});

/* ========================================
   Tab Navigation
   ======================================== */

function initTabs() {
    elements.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            switchTab(tabId);
        });
    });
}

function switchTab(tabId) {
    // Update buttons
    elements.tabBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // Update content
    elements.tabContents.forEach(content => {
        content.classList.toggle('active', content.id === `${tabId}-tab`);
    });

    // Load analytics data when switching to analytics tab
    if (tabId === 'analytics') {
        loadAnalyticsData();
    }
}

/* ========================================
   Shorten URL Form
   ======================================== */

function initShortenForm() {
    // Toggle advanced options
    elements.toggleOptions?.addEventListener('click', () => {
        elements.advancedOptions.classList.toggle('hidden');
    });

    // Form submission
    elements.shortenForm?.addEventListener('submit', handleShortenSubmit);

    // Copy button
    elements.copyBtn?.addEventListener('click', handleCopy);
}

async function handleShortenSubmit(e) {
    e.preventDefault();

    if (!currentUser) {
        showToast('Please login to shorten URLs', 'error');
        return;
    }

    const longUrl = elements.longUrlInput.value.trim();

    if (!longUrl) {
        showToast('Please enter a valid URL', 'error');
        return;
    }

    // Show loading state
    const btnText = elements.shortenBtn.querySelector('.btn-text');
    const btnLoader = elements.shortenBtn.querySelector('.btn-loader');
    btnText.classList.add('hidden');
    btnLoader.classList.remove('hidden');
    elements.shortenBtn.disabled = true;

    try {
        const payload = {
            url: longUrl
        };

        // Add optional fields
        const customAlias = elements.customAlias.value.trim();
        const topic = elements.topic.value.trim();
        const expiration = elements.expiration.value;

        if (customAlias) payload.customAlias = customAlias;
        if (topic) payload.topic = topic;
        if (expiration) {
            // Convert expiration to date
            const now = new Date();
            switch (expiration) {
                case '1h': now.setHours(now.getHours() + 1); break;
                case '24h': now.setHours(now.getHours() + 24); break;
                case '7d': now.setDate(now.getDate() + 7); break;
                case '30d': now.setDate(now.getDate() + 30); break;
            }
            payload.expiresAt = now.toISOString();
        }

        const response = await fetch(`${API_BASE}/api/shorten`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to shorten URL');
        }

        // Show result
        const shortUrl = data.shortUrl || `${API_BASE}/api/shorten/${data.alias}`;
        elements.shortUrlInput.value = shortUrl;
        elements.originalUrl.textContent = longUrl;
        elements.resultContainer.classList.remove('hidden');

        // Clear form
        elements.longUrlInput.value = '';
        elements.customAlias.value = '';
        elements.topic.value = '';
        elements.expiration.value = '';

        showToast('URL shortened successfully!', 'success');

    } catch (error) {
        console.error('Shorten failed:', error);
        showToast(error.message || 'Failed to shorten URL', 'error');
    } finally {
        // Reset button state
        btnText.classList.remove('hidden');
        btnLoader.classList.add('hidden');
        elements.shortenBtn.disabled = false;
    }
}

async function handleCopy() {
    const url = elements.shortUrlInput.value;

    try {
        await navigator.clipboard.writeText(url);

        // Update button temporarily
        const originalContent = elements.copyBtn.innerHTML;
        elements.copyBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Copied!
        `;

        setTimeout(() => {
            elements.copyBtn.innerHTML = originalContent;
        }, 2000);

        showToast('URL copied to clipboard!', 'success');
    } catch (error) {
        showToast('Failed to copy URL', 'error');
    }
}

/* ========================================
   Test Mode
   ======================================== */

function initTestMode() {
    // Endpoint buttons
    elements.endpointBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const method = btn.dataset.method;
            const path = btn.dataset.path;

            selectEndpoint(method, path);
        });
    });

    // Send request button
    elements.sendRequestBtn?.addEventListener('click', sendTestRequest);
}

function selectEndpoint(method, path) {
    // Update method badge
    elements.selectedMethod.textContent = method;
    elements.selectedMethod.className = `method-badge ${method.toLowerCase()}`;

    // Update URL
    elements.requestUrl.value = path;

    // Pre-fill request body for POST requests
    if (method === 'POST' && path === '/api/shorten') {
        elements.requestBody.value = JSON.stringify({
            url: 'https://example.com/your-long-url'
        }, null, 2);
    } else {
        elements.requestBody.value = '';
    }

    // Clear previous response
    elements.responseStatus.textContent = '';
    elements.responseStatus.className = 'status-badge';
    elements.responseTime.textContent = '';
    elements.responseBody.textContent = 'Click "Send" to make a request...';
}

async function sendTestRequest() {
    const method = elements.selectedMethod.textContent;
    let path = elements.requestUrl.value;

    // Replace path parameters with prompts
    if (path.includes('{alias}')) {
        const alias = prompt('Enter the alias:');
        if (!alias) return;
        path = path.replace('{alias}', alias);
    }
    if (path.includes('{topic}')) {
        const topic = prompt('Enter the topic:');
        if (!topic) return;
        path = path.replace('{topic}', topic);
    }

    elements.responseBody.textContent = 'Loading...';
    elements.responseStatus.textContent = '';
    elements.responseTime.textContent = '';

    const startTime = performance.now();

    try {
        const options = {
            method,
            credentials: 'include',
            headers: {}
        };

        // Add body for POST/PUT requests
        if (['POST', 'PUT', 'PATCH'].includes(method) && elements.requestBody.value.trim()) {
            options.headers['Content-Type'] = 'application/json';
            options.body = elements.requestBody.value;
        }

        const response = await fetch(`${API_BASE}${path}`, options);
        const endTime = performance.now();

        // Update status
        elements.responseStatus.textContent = `${response.status} ${response.statusText}`;
        elements.responseStatus.className = `status-badge ${response.ok ? 'success' : 'error'}`;
        elements.responseTime.textContent = `${Math.round(endTime - startTime)}ms`;

        // Parse and display response
        let data;
        const contentType = response.headers.get('content-type');

        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
            elements.responseBody.textContent = JSON.stringify(data, null, 2);
        } else {
            data = await response.text();
            elements.responseBody.textContent = data || '(Empty response)';
        }

    } catch (error) {
        const endTime = performance.now();
        elements.responseStatus.textContent = 'Error';
        elements.responseStatus.className = 'status-badge error';
        elements.responseTime.textContent = `${Math.round(endTime - startTime)}ms`;
        elements.responseBody.textContent = error.message;
    }
}

/* ========================================
   Analytics Dashboard
   ======================================== */

function initAnalytics() {
    elements.refreshAnalytics?.addEventListener('click', loadAnalyticsData);

    // Initialize charts
    initCharts();
}

function initCharts() {
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: {
                    color: '#a0a0b0'
                }
            }
        },
        scales: {
            x: {
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#6b6b7b' }
            },
            y: {
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#6b6b7b' }
            }
        }
    };

    // Clicks chart
    const clicksCtx = document.getElementById('clicks-chart')?.getContext('2d');
    if (clicksCtx) {
        clicksChart = new Chart(clicksCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Clicks',
                    data: [],
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: chartOptions
        });
    }

    // Devices chart
    const devicesCtx = document.getElementById('devices-chart')?.getContext('2d');
    if (devicesCtx) {
        devicesChart = new Chart(devicesCtx, {
            type: 'doughnut',
            data: {
                labels: ['Desktop', 'Mobile', 'Tablet', 'Other'],
                datasets: [{
                    data: [0, 0, 0, 0],
                    backgroundColor: [
                        '#6366f1',
                        '#8b5cf6',
                        '#ec4899',
                        '#6b6b7b'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#a0a0b0' }
                    }
                }
            }
        });
    }
}

async function loadAnalyticsData() {
    if (!currentUser) {
        showToast('Please login to view analytics', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/analytics/overall`, {
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Failed to fetch analytics');
        }

        const data = await response.json();

        // Update stats
        elements.totalUrls.textContent = data.totalUrls || 0;
        elements.totalClicks.textContent = data.totalClicks || 0;
        elements.uniqueLocations.textContent = data.uniqueLocations || 0;

        // Update clicks chart
        if (clicksChart && data.clicksOverTime) {
            clicksChart.data.labels = data.clicksOverTime.map(d => d.date);
            clicksChart.data.datasets[0].data = data.clicksOverTime.map(d => d.count);
            clicksChart.update();
        }

        // Update devices chart
        if (devicesChart && data.deviceTypes) {
            devicesChart.data.datasets[0].data = [
                data.deviceTypes.desktop || 0,
                data.deviceTypes.mobile || 0,
                data.deviceTypes.tablet || 0,
                data.deviceTypes.other || 0
            ];
            devicesChart.update();
        }

        // Update top URLs table
        if (data.topUrls && data.topUrls.length > 0) {
            elements.topUrlsBody.innerHTML = data.topUrls.map(url => `
                <tr>
                    <td><a href="${API_BASE}/api/shorten/${url.alias}" target="_blank">${url.alias}</a></td>
                    <td class="original-url">${truncateUrl(url.originalUrl, 50)}</td>
                    <td>${url.clicks}</td>
                    <td>${formatDate(url.createdAt)}</td>
                </tr>
            `).join('');
        }

    } catch (error) {
        console.error('Analytics fetch failed:', error);
        showToast('Failed to load analytics', 'error');
    }
}

/* ========================================
   Utility Functions
   ======================================== */

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success'
        ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';

    toast.innerHTML = `${icon}<span>${message}</span>`;

    elements.toastContainer.appendChild(toast);

    // Auto remove after 4 seconds
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function truncateUrl(url, maxLength) {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength) + '...';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

// Add CSS for toast exit animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideOutRight {
        to { opacity: 0; transform: translateX(100%); }
    }
`;
document.head.appendChild(style);
