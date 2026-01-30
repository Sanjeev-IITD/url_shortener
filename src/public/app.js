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
    userName: document.getElementById('user-name'),

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
    initVisuals();
    initShortenForm();
    initAnalytics();
    checkAuthStatus();

    // Smooth scroll for nav links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });
});

function initVisuals() {
    // Splitting.js for text animations
    if (window.Splitting) {
        Splitting();
    }

    // GSAP ScrollTrigger
    if (window.gsap && window.ScrollTrigger) {
        gsap.registerPlugin(ScrollTrigger);

        // Reveal sections
        gsap.utils.toArray('.section').forEach(section => {
            gsap.fromTo(section,
                { opacity: 0, y: 50 },
                {
                    opacity: 1,
                    y: 0,
                    duration: 1,
                    ease: "power2.out",
                    scrollTrigger: {
                        trigger: section,
                        start: "top 80%"
                    }
                }
            );
        });

        // Reveal header text
        gsap.from(".hero-title .char", {
            duration: 1,
            y: 100,
            opacity: 0,
            stagger: 0.02,
            ease: "circ.out",
            delay: 0.5
        });
    }
}

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
            // Load analytics automatically when logged in
            loadAnalyticsData();
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
        showToast('Logged out');
    } catch (error) {
        console.error('Logout failed:', error);
        showToast('Logout failed', 'error');
    }
});

/* ========================================
   Shorten URL Form
   ======================================== */

function initShortenForm() {
    // Toggle advanced options
    elements.toggleOptions?.addEventListener('click', () => {
        elements.advancedOptions.classList.toggle('hidden');
        elements.toggleOptions.textContent = elements.advancedOptions.classList.contains('hidden')
            ? '+ Advanced Options'
            : '- Hide Options';
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

    // Loading state
    const btnIcon = elements.shortenBtn.querySelector('svg');
    const loaderLine = document.querySelector('.loader-line');

    // elements.shortenBtn.disabled = true;
    loaderLine.classList.remove('hidden');

    try {
        const payload = { longUrl: longUrl };

        // Add optional fields
        const customAlias = elements.customAlias.value.trim();
        const topic = elements.topic.value.trim();
        const expiration = elements.expiration.value;

        if (customAlias) payload.customAlias = customAlias;
        if (topic) payload.topic = topic;
        if (expiration) {
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
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to shorten URL');
        }

        // Show result
        const shortUrl = data.shortUrl || `${API_BASE}/${data.alias}`;
        elements.shortUrlInput.value = shortUrl;
        elements.originalUrl.textContent = longUrl;

        elements.resultContainer.classList.remove('hidden');

        // Animate result
        if (window.gsap) {
            gsap.from(elements.resultContainer, {
                y: 20, opacity: 0, duration: 0.5
            });
        }

        // Clear form
        elements.longUrlInput.value = '';
        elements.customAlias.value = '';

        // Refresh analytics if visible
        loadAnalyticsData();

    } catch (error) {
        console.error('Shorten failed:', error);
        showToast(error.message || 'Failed to shorten URL', 'error');
    } finally {
        loaderLine.classList.add('hidden');
        elements.shortenBtn.disabled = false;
    }
}

async function handleCopy() {
    const url = elements.shortUrlInput.value;
    try {
        await navigator.clipboard.writeText(url);
        const originalText = elements.copyBtn.textContent;
        elements.copyBtn.textContent = 'Copied';
        setTimeout(() => elements.copyBtn.textContent = originalText, 2000);
    } catch (error) {
        showToast('Failed to copy', 'error');
    }
}

/* ========================================
   Analytics Dashboard
   ======================================== */

function initAnalytics() {
    initCharts();
}

function initCharts() {
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false }
        },
        scales: {
            x: { grid: { display: false }, ticks: { font: { family: 'Inter' } } },
            y: { grid: { color: '#eee' }, ticks: { font: { family: 'Inter' } } }
        }
    };

    // Clicks chart (Monochrome)
    const clicksCtx = document.getElementById('clicks-chart')?.getContext('2d');
    if (clicksCtx) {
        clicksChart = new Chart(clicksCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Clicks',
                    data: [],
                    borderColor: '#1a1a1a', // Black
                    borderWidth: 2,
                    backgroundColor: 'rgba(0,0,0,0.05)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 4
                }]
            },
            options: commonOptions
        });
    }

    // Devices chart (Grayscale)
    const devicesCtx = document.getElementById('devices-chart')?.getContext('2d');
    if (devicesCtx) {
        devicesChart = new Chart(devicesCtx, {
            type: 'doughnut',
            data: {
                labels: ['Desktop', 'Mobile', 'Tablet', 'Other'],
                datasets: [{
                    data: [0, 0, 0, 0],
                    backgroundColor: [
                        '#1a1a1a', // Black
                        '#666666', // Dark Grey
                        '#999999', // Medium Grey
                        '#d4d4d4'  // Light Grey
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            font: { family: 'Inter' },
                            boxWidth: 10
                        }
                    }
                }
            }
        });
    }
}

async function loadAnalyticsData() {
    if (!currentUser) return;

    try {
        const response = await fetch(`${API_BASE}/api/analytics/overall`, {
            credentials: 'include'
        });

        if (!response.ok) return; // Silent fail if just background refresh

        const data = await response.json();

        // Update numbers with animation
        animateValue(elements.totalUrls, data.totalUrls || 0);
        animateValue(elements.totalClicks, data.totalClicks || 0);
        animateValue(elements.uniqueLocations, data.uniqueLocations || 0);

        // Update charts
        if (clicksChart && data.clicksOverTime) {
            clicksChart.data.labels = data.clicksOverTime.map(d => d.date);
            clicksChart.data.datasets[0].data = data.clicksOverTime.map(d => d.count);
            clicksChart.update();
        }

        if (devicesChart && data.deviceTypes) {
            devicesChart.data.datasets[0].data = [
                data.deviceTypes.desktop || 0,
                data.deviceTypes.mobile || 0,
                data.deviceTypes.tablet || 0,
                data.deviceTypes.other || 0
            ];
            devicesChart.update();
        }

        // Update Table
        if (data.topUrls && data.topUrls.length > 0) {
            elements.topUrlsBody.innerHTML = data.topUrls.map(url => `
                <tr>
                    <td><a href="${API_BASE}/${url.alias}" target="_blank" style="text-decoration:underline">${url.alias}</a></td>
                    <td style="color:#666">${new URL(url.originalUrl).hostname}</td>
                    <td>${url.clicks}</td>
                    <td style="color:#666">${new Date(url.createdAt).toLocaleDateString()}</td>
                </tr>
            `).join('');
        }

    } catch (error) {
        console.error('Analytics error:', error);
    }
}

// Helper to animate numbers
function animateValue(obj, end, duration = 1000) {
    let startTimestamp = null;
    const start = parseInt(obj.innerHTML) || 0;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

/* ========================================
   Toast System
   ======================================== */

function showToast(message, type = 'normal') {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        background: #1a1a1a;
        color: #fff;
        padding: 1rem 2rem;
        border-radius: 4px;
        z-index: 9999;
        font-family: 'Inter', sans-serif;
        font-size: 0.9rem;
        box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        animation: slideIn 0.3s ease-out forwards;
    `;

    if (type === 'error') {
        toast.style.background = '#000'; // Keep it monochrome but maybe distinct border
        toast.style.borderLeft = '3px solid #666';
    }

    toast.textContent = message;
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Inject keyframes for toast
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
    }
`;
document.head.appendChild(style);
