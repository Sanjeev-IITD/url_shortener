/* ========================================
   URL Shortener - Main Application Logic
   ======================================== */

// API Configuration
const API_BASE = window.location.origin;

// DOM Elements - use optional chaining since not all elements exist on all pages
const elements = {
    // Auth
    authLoading: document.getElementById('auth-loading'),
    authLoggedOut: document.getElementById('auth-logged-out'),
    authLoggedIn: document.getElementById('auth-logged-in'),
    loginBtn: document.getElementById('login-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    userName: document.getElementById('user-name'),
    userInitialBtn: document.getElementById('user-initial-btn'),
    menuLogoutBtn: document.getElementById('menu-logout-btn'),

    // Shorten Form (home page only)
    shortenForm: document.getElementById('shorten-form'),
    longUrlInput: document.getElementById('long-url'),
    shortenBtn: document.getElementById('shorten-btn'),
    resultContainer: document.getElementById('result-container'),
    shortUrlInput: document.getElementById('short-url'),
    copyBtn: document.getElementById('copy-btn'),
    originalUrl: document.getElementById('original-url'),

    // Analytics (analytics page only)
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
    checkAuthStatus();

    // Initialize page-specific features
    const currentPage = window.location.pathname;

    if (currentPage === '/' || currentPage === '/index.html') {
        initShortenForm();
    } else if (currentPage === '/analytics.html') {
        initAnalytics();
    }

    // Add smooth page transitions for navigation
    initPageTransitions();
    initMobileMenu();
});

function initMobileMenu() {
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const navContent = document.getElementById('nav-content');
    const menuLinks = document.querySelectorAll('.nav-content .menu-link');
    const userInitialBtn = document.getElementById('user-initial-btn');
    const menuLogoutBtn = document.getElementById('menu-logout-btn');

    if (!mobileBtn || !navContent) return;

    const toggleMenu = (forceState) => {
        const shouldOpen = forceState !== undefined ? forceState : !navContent.classList.contains('active');

        if (shouldOpen) {
            mobileBtn.classList.add('active');
            navContent.classList.add('active');
            document.body.style.overflow = 'hidden';
        } else {
            mobileBtn.classList.remove('active');
            navContent.classList.remove('active');
            document.body.style.overflow = '';
        }
    };

    mobileBtn.addEventListener('click', () => toggleMenu());

    // User initial button opens menu on mobile
    if (userInitialBtn) {
        userInitialBtn.addEventListener('click', () => {
            // Only toggle on mobile (when mobile menu is visible)
            if (window.innerWidth <= 768) {
                toggleMenu(true);
            }
        });
    }

    // Close menu when link is clicked
    menuLinks.forEach(link => {
        link.addEventListener('click', () => toggleMenu(false));
    });

    // Menu logout button
    if (menuLogoutBtn) {
        menuLogoutBtn.addEventListener('click', async () => {
            toggleMenu(false);
            try {
                await fetch(`${API_BASE}/auth/logout`, {
                    credentials: 'include'
                });
                currentUser = null;
                showLoggedOutState();
                // Hide menu logout button
                menuLogoutBtn.classList.add('hidden');
                showToast('Logged out');
            } catch (error) {
                console.error('Logout failed:', error);
                showToast('Logout failed', 'error');
            }
        });
    }
}

function initVisuals() {
    // Splitting.js for text animations (home page only)
    if (window.Splitting) {
        Splitting();
    }

    // GSAP animations
    if (window.gsap) {
        // Animate hero title characters
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

function initPageTransitions() {
    // Add transition effect when clicking navigation links
    document.querySelectorAll('.menu-link, .logo-link').forEach(link => {
        link.addEventListener('click', function (e) {
            const href = this.getAttribute('href');

            // Skip if it's the current page
            if (href === window.location.pathname) {
                e.preventDefault();
                return;
            }

            // Add exit animation
            e.preventDefault();
            document.body.classList.add('page-exit');

            setTimeout(() => {
                window.location.href = href;
            }, 300);
        });
    });
}

// Add exit animation styles dynamically
const exitStyles = document.createElement('style');
exitStyles.textContent = `
    .page-exit {
        animation: pageExit 0.3s ease-in forwards;
    }
    @keyframes pageExit {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(-20px); }
    }
`;
document.head.appendChild(exitStyles);

/* ========================================
   Authentication
   ======================================== */

async function checkAuthStatus() {
    try {
        const response = await fetch(`${API_BASE}/auth/current-auth`, {
            credentials: 'include'
        });

        const data = await response.json();
        elements.authLoading?.classList.add('hidden');

        if (data.authenticated && data.user) {
            currentUser = data.user;
            showLoggedInState();
            // Load analytics if on analytics page
            if (window.location.pathname === '/analytics.html') {
                loadAnalyticsData();
            }
        } else {
            showLoggedOutState();
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        elements.authLoading?.classList.add('hidden');
        showLoggedOutState();
    }
}

function showLoggedInState() {
    elements.authLoggedOut?.classList.add('hidden');
    elements.authLoggedIn?.classList.remove('hidden');

    if (currentUser) {
        const displayName = currentUser.name || currentUser.email || 'User';
        if (elements.userName) {
            elements.userName.textContent = displayName;
        }
        // Set user initial for mobile button
        if (elements.userInitialBtn) {
            const initial = displayName.charAt(0).toUpperCase();
            elements.userInitialBtn.textContent = initial;
        }
        // Show logout button in mobile menu
        if (elements.menuLogoutBtn) {
            elements.menuLogoutBtn.classList.remove('hidden');
        }
    }
}

function showLoggedOutState() {
    elements.authLoggedIn?.classList.add('hidden');
    elements.authLoggedOut?.classList.remove('hidden');
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
   Shorten URL Form (Home Page)
   ======================================== */

function initShortenForm() {
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
    const loaderLine = document.querySelector('.loader-line');
    loaderLine?.classList.remove('hidden');

    try {
        const payload = { longUrl: longUrl };

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

    } catch (error) {
        console.error('Shorten failed:', error);
        showToast(error.message || 'Failed to shorten URL', 'error');
    } finally {
        loaderLine?.classList.add('hidden');
        if (elements.shortenBtn) elements.shortenBtn.disabled = false;
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
   Analytics Dashboard (Analytics Page)
   ======================================== */

function initAnalytics() {
    initCharts();
    // Load data if already logged in
    if (currentUser) {
        loadAnalyticsData();
    }
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
            y: {
                beginAtZero: true,
                grid: { color: '#eee' },
                ticks: { font: { family: 'Inter' } }
            }
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
                    borderColor: '#1a1a1a',
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
                        '#1a1a1a',
                        '#666666',
                        '#999999',
                        '#d4d4d4'
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

        if (!response.ok) return;

        const data = await response.json();

        // Update numbers with animation
        if (elements.totalUrls) animateValue(elements.totalUrls, data.totalUrls || 0);
        if (elements.totalClicks) animateValue(elements.totalClicks, data.totalClicks || 0);
        if (elements.uniqueLocations) animateValue(elements.uniqueLocations, data.uniqueLocations || 0);

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
        if (data.topUrls && data.topUrls.length > 0 && elements.topUrlsBody) {
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
        toast.style.background = '#000';
        toast.style.borderLeft = '3px solid #666';
    }

    toast.textContent = message;
    elements.toastContainer?.appendChild(toast);

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
