// State is loaded from the backend API (MongoDB), not browser localStorage.
// For local development, run `node server.js` and open index.html in your browser.
const API_BASE = 'http://localhost:3000/api';
let invoices = [];
let currentLineItems = [];
let clients = [];

async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(options.headers || {})
        }
    });

    let data = null;
    try { data = await response.json(); } catch (_) { /* Empty response body */ }
    if (!response.ok) {
        throw new Error(data?.error || `Request failed (${response.status})`);
    }
    return data;
}

// DOM Elements
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');
const pageTitle = document.getElementById('page-title');

// Formatters
const formatMoney = (amount) => {
    return new Intl.NumberFormat('en-LK', {
        style: 'currency',
        currency: 'LKR'
    }).format(amount);
};

const formatDate = (dateString) => {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
};

const generateId = () => {
    let maxId = 0;
    invoices.forEach(inv => {
        const match = inv.id.match(/INV-RDK(\d+)/);
        if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxId) maxId = num;
        }
    });
    const nextId = maxId + 1;
    return 'INV-RDK' + nextId.toString().padStart(4, '0');
};

// Navigation
function switchView(targetId) {
    views.forEach(view => view.classList.remove('active'));
    document.getElementById(targetId).classList.add('active');

    navItems.forEach(item => {
        if (item.dataset.target === targetId) {
            item.classList.add('active');
            pageTitle.textContent = item.textContent.trim();
            positionIndicator(item);
        } else {
            item.classList.remove('active');
        }
    });

    if (targetId === 'dashboard-view') updateDashboard();
    if (targetId === 'list-view') renderInvoiceList();
    if (targetId === 'create-view') resetForm();
    if (targetId === 'clients-view') renderClients();
    if (targetId === 'reports-view') initReportsView();
}

navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        switchView(item.dataset.target);
    });
});

function navigateToFilteredInvoices(status) {
    // 1. Switch view to invoices list
    switchView('list-view');

    // 2. Find and update select fields
    const hiddenInput = document.getElementById('status-filter');
    const triggerSpan = document.querySelector('#statusFilterTrigger span');
    const optionsContainer = document.getElementById('statusFilterOptions');
    if (!hiddenInput || !triggerSpan || !optionsContainer) return;

    // 3. Set the hidden filter input value
    hiddenInput.value = status;

    // 4. Update visual selector trigger text
    let label = 'All Status';
    if (status === 'paid') label = 'Paid';
    if (status === 'pending') label = 'Pending';
    triggerSpan.textContent = label;

    // 5. Update custom options active classes
    optionsContainer.querySelectorAll('.custom-option').forEach(opt => {
        if (opt.dataset.value === status) {
            opt.classList.add('selected');
        } else {
            opt.classList.remove('selected');
        }
    });

    // 6. Force reload list view contents
    renderInvoiceList();
}

// Dashboard Logic
function updateDashboard() {
    const totalCount = invoices.length;
    const paidInvoices = invoices.filter(inv => inv.status === 'paid');
    const unpaidInvoices = invoices.filter(inv => inv.status === 'pending');

    const totalPaidAmount = paidInvoices.reduce((sum, inv) => sum + inv.total, 0);
    const totalUnpaidAmount = unpaidInvoices.reduce((sum, inv) => sum + inv.total, 0);

    document.getElementById('metric-total-count').textContent = totalCount;
    document.getElementById('metric-total-paid').textContent = formatMoney(totalPaidAmount);
    document.getElementById('metric-total-unpaid').textContent = formatMoney(totalUnpaidAmount);

    renderRecentInvoices();
}

function renderRecentInvoices() {
    const tbody = document.getElementById('recent-invoices-body');
    tbody.innerHTML = '';

    // Show last 5
    const recent = [...invoices].reverse().slice(0, 5);

    if (recent.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-secondary);">No invoices found. Create one!</td></tr>';
        return;
    }

    recent.forEach(inv => {
        tbody.innerHTML += `
            <tr>
                <td><span class="text-muted">${inv.id}</span></td>
                <td>${inv.client}</td>
                <td>${formatDate(inv.date)}</td>
                <td class="text-right">${formatMoney(inv.total)}</td>
                <td><span class="badge ${inv.status}">${inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}</span></td>
                <td>
                    <div class="action-btns">
                        <button class="btn-icon" onclick="viewInvoice('${inv.id}')" title="View"><i class="ph ph-eye"></i></button>
                    </div>
                </td>
            </tr>
        `;
    });
}

// All Invoices List Logic
function renderInvoiceList() {
    const tbody = document.getElementById('all-invoices-body');
    const filter = document.getElementById('status-filter').value;
    const search = (document.getElementById('invoice-search')?.value || '').trim().toLowerCase();
    const sort = document.getElementById('invoice-sort')?.value || 'newest';
    tbody.innerHTML = '';

    let filteredInvoices = invoices.filter(inv => {
        const statusMatches = filter === 'all' || inv.status === filter;
        const searchMatches = !search || String(inv.id || '').toLowerCase().includes(search) ||
            String(inv.client || '').toLowerCase().includes(search);
        return statusMatches && searchMatches;
    });

    // Sort a copy of the filtered results so the main invoice array remains unchanged.
    filteredInvoices = [...filteredInvoices].sort((a, b) => {
        if (sort === 'oldest') return new Date(a.date) - new Date(b.date);
        if (sort === 'amount-high') return Number(b.total) - Number(a.total);
        if (sort === 'amount-low') return Number(a.total) - Number(b.total);
        if (sort === 'client') return String(a.client).localeCompare(String(b.client));
        return new Date(b.date) - new Date(a.date);
    });

    if (filteredInvoices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-secondary);">No invoices found.</td></tr>';
        return;
    }

    filteredInvoices.forEach(inv => {
        const itemsCount = inv.items.length;
        tbody.innerHTML += `
            <tr>
                <td><span class="text-muted">${inv.id}</span></td>
                <td>${inv.client}</td>
                <td>${formatDate(inv.date)}</td>
                <td>${itemsCount} item(s)</td>
                <td class="text-right">${formatMoney(inv.total)}</td>
                <td><span class="badge ${inv.status}">${inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}</span></td>
                <td>
                    <div class="action-btns">
                        <button class="btn-icon" onclick="viewInvoice('${inv.id}')" title="View"><i class="ph ph-eye"></i></button>
                        ${inv.status === 'pending' ? `<button class="btn-icon" onclick="markPaid('${inv.id}')" title="Mark Paid"><i class="ph ph-check-circle"></i></button>` : ''}
                        <button class="btn-icon delete" onclick="deleteInvoice('${inv.id}')" title="Delete"><i class="ph ph-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    });
}

document.getElementById('status-filter').addEventListener('change', renderInvoiceList);
document.getElementById('invoice-search')?.addEventListener('input', renderInvoiceList);
document.getElementById('invoice-sort')?.addEventListener('change', renderInvoiceList);

// Create Invoice Logic
const itemsContainer = document.getElementById('items-container');
const addItemBtn = document.getElementById('add-item-btn');
const grandTotalDisplay = document.getElementById('grand-total-display');

function addLineItem() {
    const itemId = Date.now().toString();
    const item = { id: itemId, desc: '', qty: 1, price: 0, total: 0 };
    currentLineItems.push(item);
    renderLineItems();
}

function removeLineItem(id) {
    currentLineItems = currentLineItems.filter(item => item.id !== id);
    renderLineItems();
}

function updateItem(id, field, value) {
    const item = currentLineItems.find(i => i.id === id);
    if (item) {
        item[field] = field === 'desc' ? value : parseFloat(value) || 0;
        item.total = item.qty * item.price;
        renderLineItems(); // Simple re-render for accuracy, could be optimized
    }
}

function renderLineItems() {
    itemsContainer.innerHTML = '';
    let grandTotal = 0;

    currentLineItems.forEach(item => {
        grandTotal += item.total;

        const row = document.createElement('div');
        row.className = 'item-row';
        row.innerHTML = `
            <div class="col-desc">
                <input type="text" placeholder="Item description" value="${item.desc}" onchange="updateItem('${item.id}', 'desc', this.value)" required>
            </div>
            <div class="col-qty">
                <div class="qty-spinner">
                    <input type="number" min="1" value="${item.qty}" onchange="updateItem('${item.id}', 'qty', this.value)" required>
                    <div class="qty-arrows">
                        <button type="button" class="qty-btn" tabindex="-1" onclick="updateItem('${item.id}', 'qty', ${item.qty + 1})"><i class="ph ph-caret-up"></i></button>
                        <button type="button" class="qty-btn" tabindex="-1" onclick="updateItem('${item.id}', 'qty', Math.max(1, ${item.qty - 1}))"><i class="ph ph-caret-down"></i></button>
                    </div>
                </div>
            </div>
            <div class="col-price">
                <input type="number" min="0" step="0.01" value="${item.price || ''}" placeholder="Enter the price" onchange="updateItem('${item.id}', 'price', this.value)" required>
            </div>
            <div class="col-total">
                ${formatMoney(item.total)}
            </div>
            <div class="col-action">
                <button type="button" class="btn-icon delete" onclick="removeLineItem('${item.id}')"><i class="ph ph-x-circle"></i></button>
            </div>
        `;
        itemsContainer.appendChild(row);
    });

    grandTotalDisplay.textContent = formatMoney(grandTotal);
}

addItemBtn.addEventListener('click', addLineItem);

function resetForm() {
    document.getElementById('invoice-form').reset();
    const dateInput = document.getElementById('invoiceDate');
    if (dateInput && dateInput._flatpickr) {
        dateInput._flatpickr.setDate(new Date());
    } else if (dateInput) {
        dateInput.value = "";
    }
    // Reset status toggle switch to pending
    const statusInput = document.getElementById('invoiceStatus');
    if (statusInput) {
        statusInput.value = 'pending';
    }
    const statusToggle = document.getElementById('status-toggle');
    if (statusToggle) {
        statusToggle.classList.remove('is-paid');
        const pendingOpt = statusToggle.querySelector('.option-pending');
        const paidOpt = statusToggle.querySelector('.option-paid');
        if (pendingOpt) pendingOpt.classList.add('active');
        if (paidOpt) paidOpt.classList.remove('active');
    }
    currentLineItems = [];
    populateClientDropdown();
    addLineItem(); // Start with one empty item
}

document.getElementById('invoice-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (currentLineItems.length === 0) {
        alert("Please add at least one line item.");
        return;
    }

    // Check for empty descriptions or 0 totals
    const valid = currentLineItems.every(item => item.desc.trim() !== '' && item.total > 0);
    if (!valid) {
        alert("Please fill out all line item descriptions and ensure prices are greater than 0.");
        return;
    }

    const clientName = document.getElementById('clientSelect').value;
    if (!clientName || !clients.some(client => client.name === clientName)) {
        alert('Please select a saved client before creating an invoice.');
        return;
    }

    // Parse the date from Flatpickr (or custom DD-MM-YYYY typed string) to YYYY-MM-DD
    const dateInput = document.getElementById('invoiceDate');
    let dateVal = "";
    if (dateInput && dateInput._flatpickr && dateInput._flatpickr.selectedDates.length > 0) {
        const d = dateInput._flatpickr.selectedDates[0];
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        dateVal = `${year}-${month}-${day}`;
    } else if (dateInput) {
        const dateParts = dateInput.value.split('-');
        if (dateParts.length === 3) {
            dateVal = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
        } else {
            dateVal = dateInput.value;
        }
    }

    const grandTotal = currentLineItems.reduce((sum, item) => sum + item.total, 0);

    const newInvoice = {
        id: generateId(),
        client: clientName,
        date: dateVal,
        items: [...currentLineItems],
        total: grandTotal,
        status: document.getElementById('invoiceStatus').value || 'pending',
        createdAt: new Date().toISOString()
    };

    try {
        const savedInvoice = await apiRequest('/invoices', {
            method: 'POST',
            body: JSON.stringify(newInvoice)
        });
        invoices.push(savedInvoice);
        switchView('dashboard-view');
    } catch (error) {
        console.error('Could not save invoice:', error);
        alert(`Could not save invoice to MongoDB. ${error.message}`);
    }
});

// Actions — all changes are persisted through the backend API.
async function markPaid(id) {
    const inv = invoices.find(i => i.id === id);
    if (!inv) return;

    try {
        const updated = await apiRequest(`/invoices/${encodeURIComponent(id)}`, {
            method: 'PUT',
            body: JSON.stringify({ status: 'paid' })
        });
        invoices = invoices.map(item => item.id === id ? updated : item);
        renderInvoiceList();
        updateDashboard();
        if (document.getElementById('invoice-modal').classList.contains('active')) viewInvoice(id);
    } catch (error) {
        console.error('Could not update invoice:', error);
        alert(`Could not update invoice. ${error.message}`);
    }
}

async function deleteInvoice(id) {
    if (!confirm('Are you sure you want to delete this invoice?')) return;

    try {
        await apiRequest(`/invoices/${encodeURIComponent(id)}`, { method: 'DELETE' });
        invoices = invoices.filter(i => i.id !== id);
        renderInvoiceList();
        updateDashboard();
        closeModal();
    } catch (error) {
        console.error('Could not delete invoice:', error);
        alert(`Could not delete invoice. ${error.message}`);
    }
}

// Modal Logic
const modal = document.getElementById('invoice-modal');
const closeBtn = document.getElementById('close-modal-btn');

function viewInvoice(id) {
    const inv = invoices.find(i => i.id === id);
    if (!inv) return;

    const modalBody = document.getElementById('modal-content');
    const modalActions = document.getElementById('modal-actions');

    const clientObj = clients.find(c => c.name === inv.client);

    let itemsHtml = inv.items.map(item => `
        <tr style="border-bottom: 1px solid var(--border-color); font-size: 14px;">
            <td style="padding: 12px 0; padding-right: 20px; word-break: break-word; vertical-align: middle;">${item.desc}</td>
            <td style="padding: 12px 0; padding-right: 20px; text-align: right; white-space: nowrap; vertical-align: middle; color: var(--text-secondary);">${item.qty} &times; ${formatMoney(item.price)}</td>
            <td style="padding: 12px 0; text-align: right; font-weight: 600; white-space: nowrap; vertical-align: middle;">${formatMoney(item.total)}</td>
        </tr>
    `).join('');

    modalBody.innerHTML = `
        <div class="invoice-logo-header" style="display: flex; justify-content: space-between; margin-bottom: 24px; border-bottom: 1px solid var(--border-color); padding-bottom: 16px;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 24px; font-weight: 800; color: var(--accent-primary); letter-spacing: -0.5px;">RDK</span>
            </div>
        </div>
        <div class="invoice-meta-row" style="display: flex; justify-content: space-between; margin-bottom: 24px;">
            <div>
                <p style="color: var(--text-secondary); font-size: 14px;">Invoice For</p>
                <h3 style="font-size: 20px; margin-top: 4px; margin-bottom: 6px;">${inv.client}</h3>
                ${clientObj ? `
                    <div style="color: var(--text-secondary); font-size: 13px; line-height: 1.5;">
                        ${clientObj.address ? `${clientObj.address.replace(/\n/g, '<br>')}<br>` : ''}
                        ${clientObj.email ? `${clientObj.email}<br>` : ''}
                        ${clientObj.phone ? `${clientObj.phone}` : ''}
                    </div>
                ` : ''}
            </div>
            <div style="text-align: right;">
                <p style="color: var(--text-secondary); font-size: 14px;">Invoice ID</p>
                <h3 style="font-size: 18px; margin-top: 4px;">${inv.id}</h3>
                <p style="color: var(--text-secondary); font-size: 14px; margin-top: 8px;">Date</p>
                <p>${formatDate(inv.date)}</p>
            </div>
        </div>
        <div style="margin-bottom: 16px;">
            <span class="badge ${inv.status}">${inv.status.toUpperCase()}</span>
        </div>
        <div style="background-color: var(--bg-base); padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <thead>
                    <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-secondary); font-size: 13px; text-transform: uppercase; font-weight: 600;">
                        <th style="padding-bottom: 12px; font-weight: 600; text-align: left;">Description</th>
                        <th style="padding-bottom: 12px; font-weight: 600; text-align: right; padding-right: 20px; white-space: nowrap;">Rate</th>
                        <th style="padding-bottom: 12px; font-weight: 600; text-align: right; white-space: nowrap;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>
            <div style="display: flex; justify-content: space-between; padding-top: 16px; font-size: 20px; font-weight: 700; color: var(--accent-primary);">
                <div>Total</div>
                <div>${formatMoney(inv.total)}</div>
            </div>
        </div>
    `;

    modalActions.innerHTML = `
        <button class="btn btn-primary" onclick="downloadPDF('${inv.id}')">Download PDF</button>
        ${inv.status === 'pending' ? `<button class="btn btn-primary" onclick="markPaid('${inv.id}')">Mark as Paid</button>` : ''}
        <button class="btn btn-ghost" style="color: var(--danger);" onclick="deleteInvoice('${inv.id}')">Delete</button>
    `;

    modal.classList.add('active');
}

function closeModal() {
    modal.classList.remove('active');
}

closeBtn.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
});

// PDF Download Logic
function downloadPDF(id) {
    const inv = invoices.find(i => i.id === id);
    if (!inv) return;

    const element = document.getElementById('modal-content');

    // Temporarily apply PDF styling class to the document root html element
    document.documentElement.classList.add('pdf-download-active');

    // Programmatically set elements to solid black to bypass stylesheet cache issues
    const originalBg = element.style.background;
    const originalBgColor = element.style.backgroundColor;
    const originalBorder = element.style.border;
    const originalBorderRadius = element.style.borderRadius;
    const originalBoxShadow = element.style.boxShadow;
    const originalPadding = element.style.padding;
    const originalMinHeight = element.style.minHeight;

    element.style.background = '#000000';
    element.style.backgroundColor = '#000000';
    element.style.border = 'none';
    element.style.borderRadius = '0';
    element.style.boxShadow = 'none';
    element.style.padding = '32px';

    // Calculate height of the element after standard layout styling overrides to find how many pages are required
    const pageHeightPx = 11 * 96; // 1056px for Letter size page
    const elementHeight = element.scrollHeight;
    const numPages = Math.ceil((elementHeight - 5) / pageHeightPx) || 1;
    element.style.minHeight = `${numPages * 11}in`;

    const opt = {
        margin: 0, // Zero margin to make the entire PDF page background solid black
        filename: `Invoice_${id}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            scrollX: 0,
            scrollY: 0,
            backgroundColor: '#000000'
        },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    html2pdf()
        .set(opt)
        .from(element)
        .save()
        .then(() => {
            // Restore normal screen styling
            document.documentElement.classList.remove('pdf-download-active');
            element.style.background = originalBg;
            element.style.backgroundColor = originalBgColor;
            element.style.border = originalBorder;
            element.style.borderRadius = originalBorderRadius;
            element.style.boxShadow = originalBoxShadow;
            element.style.padding = originalPadding;
            element.style.minHeight = originalMinHeight;
        });
}

// Init
document.addEventListener('DOMContentLoaded', async () => {
    // Load persistent records from MongoDB before rendering the dashboard.
    try {
        const [invoiceData, clientData] = await Promise.all([
            apiRequest('/invoices'),
            apiRequest('/clients')
        ]);
        invoices = invoiceData;
        clients = clientData;
    } catch (error) {
        console.error('Could not load RDK Bills data from MongoDB:', error);
        alert(`Could not connect to the RDK Bills backend. Make sure

1. ` +
            `the terminal running "node server.js" is still open, and
2. ` +
            `the backend is connected to MongoDB.

Details: ${error.message}`);
    }

    // Initialize Flatpickr on #invoiceDate
    const dateInput = document.getElementById('invoiceDate');
    let fpInstance = null;
    if (dateInput) {
        fpInstance = flatpickr(dateInput, {
            allowInput: true,
            dateFormat: "d-m-Y",
            defaultDate: "today"
        });
    }

    // Set up calendar icon click trigger
    const calendarBtn = document.querySelector('.calendar-icon-btn');
    if (calendarBtn && fpInstance) {
        calendarBtn.addEventListener('click', () => {
            fpInstance.open();
        });
    }

    // Initialize custom select components
    initCustomSelects();
    // Initialize status toggle switch
    initStatusToggle();

    // Start with empty line item for form
    resetForm();
    // Default view
    switchView('dashboard-view');
    // Set up navigation gooey highlight indicators
    initNavGooeyEffects();
    // Set up light/dark theme toggle
    initThemeToggle();

    // Redirection listener when "+ Add New Client..." is chosen
    const clientSelect = document.getElementById('clientSelect');
    if (clientSelect) {
        clientSelect.addEventListener('change', (e) => {
            if (e.target.value === 'ADD_NEW_CLIENT') {
                e.target.value = ''; // Reset dropdown to placeholder state
                // Reset the custom dropdown trigger label
                const triggerSpan = document.querySelector('#clientSelectTrigger span');
                if (triggerSpan) triggerSpan.textContent = 'Select a client';

                switchView('clients-view'); // Navigate to clients page
                openClientModal(); // Trigger client add modal
            }
        });
    }
});

function positionIndicator(item) {
    const indicator = document.getElementById('nav-indicator');
    if (!indicator) return;

    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        const left = item.offsetLeft;
        const width = item.offsetWidth;
        indicator.style.transform = `translateX(${left}px)`;
        indicator.style.width = `${width}px`;
        indicator.style.height = `100%`;
    } else {
        const top = item.offsetTop;
        const height = item.offsetHeight;
        indicator.style.transform = `translateY(${top}px)`;
        indicator.style.width = `100%`;
        indicator.style.height = `${height}px`;
    }
    indicator.style.opacity = '1';
}

function initNavGooeyEffects() {
    const hoverBubble = document.getElementById('nav-hover-bubble');
    if (!hoverBubble) return;

    navItems.forEach(item => {
        item.addEventListener('mouseenter', () => {
            const isMobile = window.innerWidth <= 768;
            if (isMobile) {
                const left = item.offsetLeft;
                const width = item.offsetWidth;
                hoverBubble.style.transform = `translateX(${left}px)`;
                hoverBubble.style.width = `${width}px`;
                hoverBubble.style.height = `100%`;
            } else {
                const top = item.offsetTop;
                const height = item.offsetHeight;
                hoverBubble.style.transform = `translateY(${top}px)`;
                hoverBubble.style.width = `100%`;
                hoverBubble.style.height = `${height}px`;
            }
            hoverBubble.style.opacity = '1';
        });

        item.addEventListener('mouseleave', () => {
            hoverBubble.style.opacity = '0';
        });
    });

    window.addEventListener('resize', () => {
        const activeItem = document.querySelector('.nav-item.active');
        if (activeItem) positionIndicator(activeItem);
    });

    const activeItem = document.querySelector('.nav-item.active');
    if (activeItem) {
        setTimeout(() => positionIndicator(activeItem), 50);
    }
}

function initThemeToggle() {
    const toggleBtn = document.getElementById('theme-toggle');
    if (!toggleBtn) return;

    const savedTheme = localStorage.getItem('theme');
    const systemPrefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;

    const setLightMode = (isLight) => {
        if (isLight) {
            document.documentElement.classList.add('light-mode');
            localStorage.setItem('theme', 'light');
        } else {
            document.documentElement.classList.remove('light-mode');
            localStorage.setItem('theme', 'dark');
        }
    };

    // Initial state
    if (savedTheme === 'light' || (!savedTheme && systemPrefersLight)) {
        setLightMode(true);
    } else {
        setLightMode(false);
    }

    // Toggle on click
    toggleBtn.addEventListener('click', () => {
        const isCurrentlyLight = document.documentElement.classList.contains('light-mode');
        setLightMode(!isCurrentlyLight);
    });
}

// Clients Directory Logic
function renderClients() {
    const grid = document.getElementById('clients-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const search = (document.getElementById('client-search')?.value || '').trim().toLowerCase();
    const visibleClients = clients.filter(client => !search ||
        [client.name, client.email, client.phone, client.address].some(value => String(value || '').toLowerCase().includes(search)));

    if (visibleClients.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 48px; color: var(--text-secondary);">${clients.length ? 'No clients match your search.' : 'No clients found. Click "New Client" to add one!'}</div>`;
        return;
    }

    visibleClients.forEach(client => {
        // Initials avatar
        const initials = client.name
            .split(' ')
            .map(word => word.charAt(0))
            .join('')
            .slice(0, 2)
            .toUpperCase();

        const emailHtml = client.email ? `
            <div class="client-detail-item">
                <i class="ph ph-envelope"></i>
                <span>${client.email}</span>
            </div>` : '';

        const phoneHtml = client.phone ? `
            <div class="client-detail-item">
                <i class="ph ph-phone"></i>
                <span>${client.phone}</span>
            </div>` : '';

        const addressHtml = client.address ? `
            <div class="client-detail-item">
                <i class="ph ph-map-pin"></i>
                <span>${client.address}</span>
            </div>` : '';

        const card = document.createElement('div');
        card.className = 'client-card';
        card.innerHTML = `
            <div class="client-card-header">
                <div class="client-avatar">${initials}</div>
                <div class="client-name">${client.name}</div>
            </div>
            <div class="client-details">
                ${emailHtml}
                ${phoneHtml}
                ${addressHtml}
            </div>
            <div class="client-card-actions">
                <button class="btn btn-secondary btn-small" onclick="openClientModal('${client.id}')">Edit</button>
                <button class="btn btn-ghost btn-small" style="color: var(--danger);" onclick="deleteClient('${client.id}')">Delete</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

document.getElementById('client-search')?.addEventListener('input', renderClients);

// Modal actions
const clientModal = document.getElementById('client-modal');

function openClientModal(clientId = null) {
    const form = document.getElementById('client-form');
    if (!form) return;
    form.reset();

    const titleEl = document.getElementById('client-modal-title');
    const saveBtn = document.getElementById('client-save-btn');
    const editIdEl = document.getElementById('edit-client-id');

    if (clientId) {
        const client = clients.find(c => c.id === clientId);
        if (client) {
            titleEl.textContent = 'Edit Client';
            saveBtn.textContent = 'Save Changes';
            editIdEl.value = client.id;
            document.getElementById('client-name').value = client.name;
            document.getElementById('client-email').value = client.email;
            document.getElementById('client-phone').value = client.phone;
            document.getElementById('client-address').value = client.address;
        }
    } else {
        titleEl.textContent = 'New Client';
        saveBtn.textContent = 'Add Client';
        editIdEl.value = '';
    }

    clientModal.classList.add('active');
}

function closeClientModal() {
    clientModal.classList.remove('active');
}

// Close client modal on background click
clientModal.addEventListener('click', (e) => {
    if (e.target === clientModal) closeClientModal();
});

async function saveClient(event) {
    event.preventDefault();

    const name = document.getElementById('client-name').value.trim();
    const email = document.getElementById('client-email').value.trim();
    const phone = document.getElementById('client-phone').value.trim();
    const address = document.getElementById('client-address').value.trim();
    const editId = document.getElementById('edit-client-id').value;

    if (!name) {
        alert("Please enter a client name.");
        return;
    }

    const payload = { name, email, phone, address };

    try {
        if (editId) {
            const updated = await apiRequest(`/clients/${encodeURIComponent(editId)}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            clients = clients.map(client => client.id === editId ? updated : client);
        } else {
            const created = await apiRequest('/clients', {
                method: 'POST',
                body: JSON.stringify({ id: 'cli_' + Date.now(), ...payload })
            });
            clients.push(created);
        }

        closeClientModal();
        renderClients();
        populateClientDropdown();
    } catch (error) {
        console.error('Could not save client:', error);
        alert(`Could not save client to MongoDB. ${error.message}`);
    }
}

async function deleteClient(clientId) {
    if (!confirm('Are you sure you want to delete this client?')) return;

    // Keep invoice/client records consistent by preventing deletion of a client
    // that is referenced by an existing invoice.
    if (invoices.some(invoice => invoice.client === clients.find(c => c.id === clientId)?.name)) {
        alert('This client is linked to an invoice. Delete or update the related invoice first.');
        return;
    }

    try {
        await apiRequest(`/clients/${encodeURIComponent(clientId)}`, { method: 'DELETE' });
        clients = clients.filter(c => c.id !== clientId);
        renderClients();
        populateClientDropdown();
    } catch (error) {
        console.error('Could not delete client:', error);
        alert(`Could not delete client. ${error.message}`);
    }
}

function populateClientDropdown() {
    const wrapper = document.getElementById('clientSelectWrapper');
    if (!wrapper) return;

    const hiddenInput = document.getElementById('clientSelect');
    const triggerSpan = document.querySelector('#clientSelectTrigger span');
    const optionsContainer = document.getElementById('clientSelectOptions');
    if (!optionsContainer) return;

    const currentValue = hiddenInput.value;

    optionsContainer.innerHTML = '';

    // 1. Add New Client Option
    const addNewOption = document.createElement('div');
    addNewOption.className = 'custom-option add-new-option';
    addNewOption.dataset.value = 'ADD_NEW_CLIENT';
    addNewOption.textContent = '+ Add New Client...';
    optionsContainer.appendChild(addNewOption);

    // 2. Client Names Options
    clients.forEach(client => {
        const option = document.createElement('div');
        option.className = 'custom-option';
        option.dataset.value = client.name;
        option.textContent = client.name;

        if (client.name === currentValue) {
            option.classList.add('selected');
        }

        optionsContainer.appendChild(option);
    });

    // Reset view text if current value is empty or not matching any client
    const clientExists = clients.some(c => c.name === currentValue);
    if (!currentValue || !clientExists) {
        hiddenInput.value = '';
        triggerSpan.textContent = 'Select a client';
    } else {
        triggerSpan.textContent = currentValue;
    }
}

// Custom select wrappers initialization logic
function initCustomSelects() {
    // Setup clientSelect dropdown
    setupCustomSelect('clientSelectWrapper');
    // Setup status-filter dropdown
    setupCustomSelect('statusFilterWrapper');

    // Close all open menus when clicking outside
    document.addEventListener('click', (e) => {
        const openSelects = document.querySelectorAll('.custom-select-wrapper.open');
        openSelects.forEach(select => {
            if (!select.contains(e.target)) {
                select.classList.remove('open');
            }
        });
    });
}

function setupCustomSelect(wrapperId) {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;

    const trigger = wrapper.querySelector('.custom-select-trigger');
    const optionsContainer = wrapper.querySelector('.custom-select-options');
    const hiddenInput = wrapper.querySelector('input[type="hidden"]');

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = wrapper.classList.contains('open');

        // Close other custom selects
        document.querySelectorAll('.custom-select-wrapper.open').forEach(s => {
            if (s !== wrapper) s.classList.remove('open');
        });

        if (isOpen) {
            wrapper.classList.remove('open');
        } else {
            wrapper.classList.add('open');
        }
    });

    optionsContainer.addEventListener('click', (e) => {
        const option = e.target.closest('.custom-option');
        if (!option) return;

        e.stopPropagation();
        const value = option.dataset.value;
        const text = option.textContent;

        // Update selected state visually
        optionsContainer.querySelectorAll('.custom-option').forEach(opt => {
            opt.classList.remove('selected');
        });
        option.classList.add('selected');

        // Update hidden input and trigger text
        hiddenInput.value = value;
        trigger.querySelector('span').textContent = text;

        wrapper.classList.remove('open');

        // Fire synthetic 'change' event to maintain standard compatibility
        hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

function initStatusToggle() {
    const statusToggle = document.getElementById('status-toggle');
    if (!statusToggle) return;

    const statusInput = document.getElementById('invoiceStatus');
    const pendingOpt = statusToggle.querySelector('.option-pending');
    const paidOpt = statusToggle.querySelector('.option-paid');

    const setStatus = (val) => {
        statusInput.value = val;
        if (val === 'paid') {
            statusToggle.classList.add('is-paid');
            paidOpt.classList.add('active');
            pendingOpt.classList.remove('active');
        } else {
            statusToggle.classList.remove('is-paid');
            pendingOpt.classList.add('active');
            paidOpt.classList.remove('active');
        }
        statusInput.dispatchEvent(new Event('change', { bubbles: true }));
    };

    // Click on option
    statusToggle.querySelectorAll('.status-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            setStatus(opt.dataset.value);
        });
    });

    // Click on container (toggle)
    statusToggle.addEventListener('click', () => {
        const nextVal = statusInput.value === 'paid' ? 'pending' : 'paid';
        setStatus(nextVal);
    });

    // Keyboard support (Space / Enter)
    statusToggle.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            const nextVal = statusInput.value === 'paid' ? 'pending' : 'paid';
            setStatus(nextVal);
        }
    });
}

// Financial Reports Logic
let reportsInitialized = false;
let reportStartFp = null;
let reportEndFp = null;

function initReportsView() {
    if (!reportsInitialized) {
        setupCustomSelect('reportTypeWrapper');
        setupCustomSelect('reportMonthWrapper');
        
        // Listeners for custom select changes
        const reportTypeInput = document.getElementById('reportType');
        if (reportTypeInput) {
            reportTypeInput.addEventListener('change', (e) => {
                const val = e.target.value;
                const monthWrapper = document.getElementById('reportMonthWrapper');
                const customGroup = document.getElementById('reportCustomGroup');
                
                if (val === 'monthly') {
                    if (monthWrapper) monthWrapper.style.display = 'block';
                    if (customGroup) customGroup.style.display = 'none';
                } else {
                    if (monthWrapper) monthWrapper.style.display = 'none';
                    if (customGroup) customGroup.style.display = 'flex';
                }
                generateReport();
            });
        }

        const reportMonthInput = document.getElementById('reportMonth');
        if (reportMonthInput) {
            reportMonthInput.addEventListener('change', () => {
                generateReport();
            });
        }

        // Initialize flatpickr on start and end dates
        const startInput = document.getElementById('reportStartDate');
        const endInput = document.getElementById('reportEndDate');
        
        if (startInput && endInput) {
            reportStartFp = flatpickr(startInput, {
                allowInput: true,
                dateFormat: "d-m-Y",
                defaultDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1), // first day of month
                onChange: () => generateReport()
            });

            reportEndFp = flatpickr(endInput, {
                allowInput: true,
                dateFormat: "d-m-Y",
                defaultDate: "today",
                onChange: () => generateReport()
            });
        }

        reportsInitialized = true;
    }

    // Always rebuild month list on view entry to include any new invoice month-years
    populateReportMonthDropdown();
    generateReport();
}

function populateReportMonthDropdown() {
    const optionsContainer = document.getElementById('reportMonthOptions');
    if (!optionsContainer) return;

    optionsContainer.innerHTML = '';
    
    // Generate last 12 months
    const monthsList = [];
    const date = new Date();
    for (let i = 0; i < 12; i++) {
        const year = date.getFullYear();
        const monthNum = String(date.getMonth() + 1).padStart(2, '0');
        const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        monthsList.push({ value: `${year}-${monthNum}`, label: label });
        date.setMonth(date.getMonth() - 1);
    }

    // Include any invoice dates that are older than the last 12 months
    invoices.forEach(inv => {
        if (inv.date) {
            const parts = inv.date.split('-');
            if (parts.length === 3) {
                const val = `${parts[0]}-${parts[1]}`;
                const exists = monthsList.some(m => m.value === val);
                if (!exists) {
                    const d = new Date(parts[0], parseInt(parts[1]) - 1, 1);
                    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                    monthsList.push({ value: val, label: label });
                }
            }
        }
    });

    // Sort months list descending (newest first)
    monthsList.sort((a, b) => b.value.localeCompare(a.value));

    // Render options
    const hiddenInput = document.getElementById('reportMonth');
    const triggerSpan = document.querySelector('#reportMonthTrigger span');
    
    if (hiddenInput && triggerSpan) {
        // If there's no current selection, default to the latest month
        const currentValue = hiddenInput.value;
        let defaultVal = monthsList[0].value;
        let defaultLabel = monthsList[0].label;

        // If the current value doesn't match any option, fallback to default
        if (currentValue && monthsList.some(m => m.value === currentValue)) {
            const currentMatch = monthsList.find(m => m.value === currentValue);
            defaultVal = currentMatch.value;
            defaultLabel = currentMatch.label;
        }

        hiddenInput.value = defaultVal;
        triggerSpan.textContent = defaultLabel;

        monthsList.forEach(m => {
            const opt = document.createElement('div');
            opt.className = 'custom-option';
            opt.dataset.value = m.value;
            opt.textContent = m.label;
            if (m.value === defaultVal) {
                opt.classList.add('selected');
            }
            optionsContainer.appendChild(opt);
        });
    }
}

function generateReport() {
    const reportTypeInput = document.getElementById('reportType');
    if (!reportTypeInput) return;
    
    const reportType = reportTypeInput.value;
    let filtered = [];

    if (reportType === 'monthly') {
        const monthVal = document.getElementById('reportMonth').value; // e.g. "2026-06"
        if (monthVal) {
            filtered = invoices.filter(inv => {
                if (!inv.date) return false;
                return inv.date.startsWith(monthVal);
            });
        }
    } else {
        // Custom date range
        let startDate = null;
        let endDate = null;
        
        if (reportStartFp && reportStartFp.selectedDates.length > 0) {
            startDate = new Date(reportStartFp.selectedDates[0]);
            startDate.setHours(0, 0, 0, 0);
        }
        if (reportEndFp && reportEndFp.selectedDates.length > 0) {
            endDate = new Date(reportEndFp.selectedDates[0]);
            endDate.setHours(23, 59, 59, 999);
        }

        filtered = invoices.filter(inv => {
            if (!inv.date) return false;
            
            // invoice date is stored as YYYY-MM-DD
            const parts = inv.date.split('-');
            if (parts.length !== 3) return false;
            
            const invDate = new Date(parts[0], parseInt(parts[1]) - 1, parts[2]);
            if (isNaN(invDate.getTime())) return false;
            
            if (startDate && invDate < startDate) return false;
            if (endDate && invDate > endDate) return false;
            return true;
        });
    }

    // Calculate totals
    const totalInvoiced = filtered.reduce((sum, inv) => sum + inv.total, 0);
    const totalPaid = filtered.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + inv.total, 0);
    const totalPending = filtered.filter(inv => inv.status === 'pending').reduce((sum, inv) => sum + inv.total, 0);

    // Update summary metrics
    const invoicedEl = document.getElementById('report-total-invoiced');
    const paidEl = document.getElementById('report-total-paid');
    const pendingEl = document.getElementById('report-total-pending');

    if (invoicedEl) invoicedEl.textContent = formatMoney(totalInvoiced);
    if (paidEl) paidEl.textContent = formatMoney(totalPaid);
    if (pendingEl) pendingEl.textContent = formatMoney(totalPending);

    // Populate Report details table
    const tbody = document.getElementById('report-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-secondary);">No invoices found for the selected period.</td></tr>';
        return;
    }

    // Sort newest first
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    filtered.forEach(inv => {
        tbody.innerHTML += `
            <tr>
                <td><span class="text-muted">${inv.id}</span></td>
                <td>${inv.client}</td>
                <td>${formatDate(inv.date)}</td>
                <td class="text-right">${formatMoney(inv.total)}</td>
                <td><span class="badge ${inv.status}">${inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}</span></td>
            </tr>
        `;
    });
}

function printReport() {
    const cardElement = document.getElementById('reports-card');
    if (!cardElement) return;

    // Update print subtitle in DOM
    const subtitleEl = document.getElementById('report-print-subtitle');
    const reportType = document.getElementById('reportType').value;
    let periodName = "";
    
    if (reportType === 'monthly') {
        const monthText = document.querySelector('#reportMonthTrigger span').textContent;
        periodName = monthText.replace(/\s+/g, '_');
        if (subtitleEl) subtitleEl.textContent = `Report Period: ${monthText}`;
    } else {
        const start = document.getElementById('reportStartDate').value;
        const end = document.getElementById('reportEndDate').value;
        periodName = `${start}_to_${end}`.replace(/\-/g, '_');
        if (subtitleEl) subtitleEl.textContent = `Report Period: ${start || 'Start'} to ${end || 'End'}`;
    }

    // Temporarily apply PDF styling class to body
    document.documentElement.classList.add('pdf-download-active');

    // Programmatically force solid black backgrounds and layout values to prevent CSS cache issues
    const originalBg = cardElement.style.background;
    const originalBgColor = cardElement.style.backgroundColor;
    const originalBgImage = cardElement.style.backgroundImage;
    const originalBorder = cardElement.style.border;
    const originalBorderRadius = cardElement.style.borderRadius;
    const originalBoxShadow = cardElement.style.boxShadow;
    const originalPadding = cardElement.style.padding;
    const originalMinHeight = cardElement.style.minHeight;

    cardElement.style.background = '#000000';
    cardElement.style.backgroundColor = '#000000';
    cardElement.style.backgroundImage = 'none';
    cardElement.style.border = 'none';
    cardElement.style.borderRadius = '0';
    cardElement.style.boxShadow = 'none';
    cardElement.style.padding = '24px';

    // Calculate height of the element after standard layout styling overrides to find how many pages are required
    const pageHeightPx = 11 * 96; // 1056px for Letter size page
    const elementHeight = cardElement.scrollHeight;
    const numPages = Math.ceil((elementHeight - 5) / pageHeightPx) || 1;
    cardElement.style.minHeight = `${numPages * 11}in`;

    const opt = {
        margin: 0, // Zero margin to make the entire PDF page background solid black
        filename: `Financial_Report_${periodName}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
            scale: 2, 
            useCORS: true,
            scrollX: 0,
            scrollY: 0,
            backgroundColor: '#000000'
        },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    html2pdf()
        .set(opt)
        .from(cardElement)
        .save()
        .then(() => {
            // Restore normal screen styling
            document.documentElement.classList.remove('pdf-download-active');
            cardElement.style.background = originalBg;
            cardElement.style.backgroundColor = originalBgColor;
            cardElement.style.backgroundImage = originalBgImage;
            cardElement.style.border = originalBorder;
            cardElement.style.borderRadius = originalBorderRadius;
            cardElement.style.boxShadow = originalBoxShadow;
            cardElement.style.padding = originalPadding;
            cardElement.style.minHeight = originalMinHeight;
        });
}
