// Application State
let currentUser = null;
let lastLoginError = null;
let editingInspectionId = null;
let editingClientId = null;
let editingClientApproved = null;

function isApprovedUser(user) {
    return Number(user?.approved) === 1;
}

function formatLastLogin(ts) {
    if (!ts) return translations[currentLang].never;
    const raw = String(ts).trim();
    const hasZone = /Z$|[+-]\d{2}:\d{2}$/.test(raw);
    const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
    const date = new Date(hasZone ? iso : `${iso}Z`);
    return date.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
}
let editingCertificateId = null;
let uploadedFiles = {};
let charts = {};
let selectedDocCategoryId = 'all';
const collapsedDocCategoryIds = new Set();
let docCollapseInitialized = false;
let selectedDocClientId = 'all';
const AUTH_API_BASE = '/api';
const USE_BACKEND_AUTH = true;
const USE_BACKEND_DATA = true;
const SYNC_KEYS = new Set([
    'inspections',
    'certificates',
    'docCategories',
    'documents',
    'notifications',
    'notificationTemplates',
    'smtpSettings',
    'certificateSettings'
]);

let isSyncing = false;

function sameId(a, b) {
    return String(a) === String(b);
}

function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
}

function matchesClient(record, user) {
    if (!record || !user) return false;
    if (sameId(record.clientId, user.id)) return true;

    const userEmail = normalizeText(user.email);
    if (userEmail) {
        if (normalizeText(record.clientEmail) === userEmail) return true;
        if (normalizeText(record.clientId) === userEmail) return true;
    }

    const userName = normalizeText(user.name);
    if (userName && normalizeText(record.clientName) === userName) {
        return true;
    }

    return false;
}

function matchesRecipient(notification, user) {
    if (!notification || !user) return false;
    if (sameId(notification.recipientId, user.id)) return true;

    const userEmail = normalizeText(user.email);
    if (userEmail) {
        if (normalizeText(notification.recipientEmail) === userEmail) return true;
        if (normalizeText(notification.recipientId) === userEmail) return true;
    }

    return false;
}

function canClientAccessDocument(doc, user) {
    if (!doc || !user) return false;
    const allowed = Array.isArray(doc.allowedClientIds) ? doc.allowedClientIds : [];
    if (allowed.length === 0) return true;
    if (allowed.includes('all')) return true;
    if (allowed.some(id => sameId(id, user.id))) return true;

    const userEmail = normalizeText(user.email);
    if (userEmail && allowed.some(id => normalizeText(id) === userEmail)) {
        return true;
    }
    return false;
}

function getPortalUrl() {
    return `${window.location.origin}/portal.html`;
}

function getDefaultWelcomeTemplate() {
    return {
        subject: "EYS Global Portal hesab\u0131n\u0131z haz\u0131r",
        body: "Merhaba {{clientName}},\n\nEYS Global Portal hesab\u0131n\u0131z olu\u015fturuldu. Denetim ve sertifika s\u00fcre\u00e7lerinizi bu portal \u00fczerinden takip edebilirsiniz.\n\nGiri\u015f: {{portalUrl}}\nHesap: {{clientEmail}}\n\nHerhangi bir sorunuz olursa bu e-posta \u00fczerinden bize ula\u015fabilirsiniz.\n\nSayg\u0131lar\u0131m\u0131zla,\nEYS Global"
    };
}

function ensureWelcomeTemplate() {
    const templates = JSON.parse(localStorage.getItem('notificationTemplates') || '[]');
    const fallback = getDefaultWelcomeTemplate();
    const index = templates.findIndex(t => t.type === 'welcome_client');
    if (index === -1) {
        templates.push({ type: 'welcome_client', ...fallback });
    } else {
        templates[index] = { ...templates[index], ...fallback };
    }
    localStorage.setItem('notificationTemplates', JSON.stringify(templates));
}

function buildWelcomeEmailPayload(user) {
    const templates = JSON.parse(localStorage.getItem('notificationTemplates') || '[]');
    const fallback = getDefaultWelcomeTemplate();
    const template = templates.find(t => t.type === 'welcome_client') || fallback;
    const subject = template.subject
        .replace(/{{clientName}}/g, user.name || user.fullName || '')
        .replace(/{{clientEmail}}/g, user.email || '')
        .replace(/{{portalUrl}}/g, getPortalUrl());
    const message = template.body
        .replace(/{{clientName}}/g, user.name || user.fullName || '')
        .replace(/{{clientEmail}}/g, user.email || '')
        .replace(/{{portalUrl}}/g, getPortalUrl());
    return { subject, message };
}

function showToast(type, message, duration = 5000) {
    const containerId = 'toastContainer';
    let container = document.getElementById(containerId);
    if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-message">${message}</div>
        <div class="toast-progress"></div>
    `;
    container.appendChild(toast);

    const progress = toast.querySelector('.toast-progress');
    requestAnimationFrame(() => {
        progress.style.transitionDuration = `${duration}ms`;
        progress.style.transform = 'scaleX(0)';
    });

    const timeout = setTimeout(() => {
        toast.classList.add('toast-hide');
        setTimeout(() => toast.remove(), 300);
    }, duration);

    toast.addEventListener('click', () => {
        clearTimeout(timeout);
        toast.classList.add('toast-hide');
        setTimeout(() => toast.remove(), 300);
    });
}

function showPopup(type, message, options = {}) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'popup-overlay hidden';

        const popup = document.createElement('div');
        popup.className = `popup-card popup-${type}`;

        const title = document.createElement('div');
        title.className = 'popup-title';
        title.textContent = options.title || (type === 'error' ? 'Error' : type === 'success' ? 'Success' : 'Info');

        const body = document.createElement('div');
        body.className = 'popup-body';
        body.textContent = message || '';

        const actions = document.createElement('div');
        actions.className = 'popup-actions';

        const okBtn = document.createElement('button');
        okBtn.className = 'btn btn-primary';
        okBtn.textContent = options.okText || 'OK';

        actions.appendChild(okBtn);

        if (options.showCancel) {
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'btn btn-secondary';
            cancelBtn.textContent = options.cancelText || 'Cancel';
            actions.appendChild(cancelBtn);
            cancelBtn.addEventListener('click', () => {
                overlay.classList.add('hidden');
                setTimeout(() => overlay.remove(), 200);
                resolve(false);
            });
        }

        okBtn.addEventListener('click', () => {
            overlay.classList.add('hidden');
            setTimeout(() => overlay.remove(), 200);
            resolve(true);
        });

        popup.appendChild(title);
        popup.appendChild(body);
        popup.appendChild(actions);
        overlay.appendChild(popup);
        document.body.appendChild(overlay);
        
        // Trigger animation
        setTimeout(() => overlay.classList.remove('hidden'), 10);
        
        // Auto close after 3 seconds for success/info
        if (type === 'success' || type === 'info') {
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.classList.add('hidden');
                    setTimeout(() => overlay.remove(), 200);
                    resolve(true);
                }
            }, 3000);
        }
    });
}

function showConfirm(message, options = {}) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-dialog-overlay';
        
        const dialog = document.createElement('div');
        dialog.className = 'confirm-dialog';
        
        const type = options.type || 'warning'; // warning, danger, info, success
        const title = options.title || (type === 'danger' ? 'Delete' : type === 'warning' ? 'Confirm Action' : 'Confirm');
        const confirmText = options.confirmText || (type === 'danger' ? 'Delete' : 'Confirm');
        const cancelText = options.cancelText || 'Cancel';
        
        const iconMap = {
            warning: '⚠️',
            danger: '🗑️',
            info: 'ℹ️',
            success: '✓'
        };
        
        dialog.innerHTML = `
            <div class="confirm-dialog-header">
                <div class="confirm-dialog-icon ${type}">${iconMap[type] || iconMap.warning}</div>
                <div class="confirm-dialog-title">${title}</div>
            </div>
            <div class="confirm-dialog-body">${message}</div>
            <div class="confirm-dialog-actions">
                <button class="confirm-dialog-btn confirm-dialog-btn-cancel">${cancelText}</button>
                <button class="confirm-dialog-btn ${type === 'danger' ? 'confirm-dialog-btn-danger' : 'confirm-dialog-btn-confirm'}">${confirmText}</button>
            </div>
        `;
        
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        
        // Trigger animation
        setTimeout(() => overlay.classList.add('active'), 10);
        
        const cancelBtn = dialog.querySelector('.confirm-dialog-btn-cancel');
        const confirmBtn = dialog.querySelector(`.confirm-dialog-btn-${type === 'danger' ? 'danger' : 'confirm'}`);
        
        const close = (result) => {
            overlay.classList.remove('active');
            setTimeout(() => {
                overlay.remove();
                resolve(result);
            }, 200);
        };
        
        cancelBtn.addEventListener('click', () => close(false));
        confirmBtn.addEventListener('click', () => close(true));
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close(false);
        });
        
        // ESC key
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                close(false);
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    });
}

function shouldSyncKey(key) {
    return SYNC_KEYS.has(key) || key.startsWith('certificateSequence_');
}

const originalSetItem = localStorage.setItem.bind(localStorage);
const originalRemoveItem = localStorage.removeItem.bind(localStorage);

localStorage.setItem = (key, value) => {
    originalSetItem(key, value);
    if (USE_BACKEND_DATA && !isSyncing && shouldSyncKey(key)) {
        if (!USE_BACKEND_AUTH || (currentUser && currentUser.role === 'admin')) {
            persistStoreValue(key, value);
        }
    }
};

localStorage.removeItem = (key) => {
    originalRemoveItem(key);
    if (USE_BACKEND_DATA && !isSyncing && shouldSyncKey(key)) {
        if (!USE_BACKEND_AUTH || (currentUser && currentUser.role === 'admin')) {
            persistStoreValue(key, null);
        }
    }
};

const translations = {
    en: {
        // General
        "app_title_client": "EYS Global Portal",
        "app_title_admin": "EYS Global - Admin Panel",
        "welcome": "Welcome",
        "admin": "Admin",
        "logout": "Logout",
        "signin": "Sign In",
        "invalid_credentials": "Invalid email or password",
        "approval_status": "Approval",
        "approved": "Approved",
        "pending": "Pending",
        "approve": "Approve",
        "approval_pending": "Your account is pending admin approval. You will be able to sign in after approval.",
        "not_approved": "Your account is not approved yet.",
        "rate_limited": "Too many attempts. Please wait a few minutes and try again.",
        "role": "Role",
        "client": "Client",
        "admin_role": "Admin",
        "admins": "Admins",
        "last_login": "Last Login",
        "never": "Never",
        "register": "Register",
        "create_account": "Create Account",
        "no_account": "No account?",
        "have_account": "Already have an account?",
        "registration_success": "Registration successful. You can sign in now.",
        "registration_failed": "Registration failed. Please try again.",
        "weak_password": "Password must be at least 6 characters.",

        // Login Screen
        "advanced_client_portal": "Advanced Client Portal",
        "email": "Email",
        "password": "Password",
        "enter_password": "Enter password",
        "demo_accounts": "Demo Accounts:",
        "client_demo": "Client: client1@company.com / client123",

        // Admin Nav
        "dashboard": "Dashboard",
        "partner_dashboard": "Partner Dashboard",
        "global_overview": "Global Overview",
        "client_directory": "Client Directory",
        "project_portfolio": "Project Portfolio",
        "revenue_analytics": "Revenue & Analytics",
        "team_management": "Team Management",
        "firm_settings": "Firm Settings",
        "export_data": "Export Data",
        "inspections": "Inspections",
        "certificates": "Certificates",
        "clients": "Clients",
        "reports": "Reports",
        "notifications": "Notifications",
        "settings": "Settings",

        // Dashboard Stats
        "total_inspections": "Total Inspections",
        "revenue_ytd": "Revenue YTD",
        "active_clients": "Active Clients",
        "pending_inspections": "Pending Inspections",
        "live_projects": "Live Projects",
        "expiring_certificates": "Expiring Certificates",
        "satisfaction": "Satisfaction",
        "inspections_overview": "Inspections Overview",
        "certificates_status": "Certificates Status",
        "inspections_trend": "Inspections Trend",
        "inspections_by_type": "Inspections by Type",
        "revenue_overview": "Revenue Overview",
        "recent_activity": "Recent Activity",

        // Common Table Headers
        "id": "ID",
        "client": "Client",
        "location": "Location",
        "type": "Type",
        "date": "Date",
        "status": "Status",
        "reports_col": "Reports",
        "actions": "Actions",
        "certificate_number": "Certificate Number",
        "issue_date": "Issue Date",
        "expiry_date": "Expiry Date",
        "days_remaining": "Days Remaining",
        "name": "Name",
        "company": "Company",
        "inspections_count": "Inspections",
        "certificates_count": "Certificates",

        // Controls
        "search_inspections": "Search inspections...",
        "all_status": "All Status",
        "scheduled": "Scheduled",
        "in_progress": "In Progress",
        "completed": "Completed",
        "new_inspection": "New Inspection",
        "edit_inspection": "Edit Inspection",
        "select_client": "Select client",
        "inspection_type": "Inspection Type",
        "property_address": "Property address",
        "inspection_date": "Inspection Date",
        "notes": "Notes",
        "additional_notes": "Additional notes",
        "upload_reports_documents": "Upload Reports/Documents",
        "click_to_upload": "Click to upload or drag and drop",
        "file_types_hint": "PDF, DOC, DOCX, JPG, PNG (Max 10MB per file)",
        "save_inspection": "Save Inspection",
        "cancel": "Cancel",
        "delete": "Delete",
        "edit": "Edit",
        "send_email": "Email",
        "new_certificate": "New Certificate",
        "edit_certificate": "Edit Certificate",
        "certificate_type": "Certificate Type",
        "certificate_description": "Certificate description",
        "upload_certificate_document": "Upload Certificate Document",
        "save_certificate": "Save Certificate",
        "new_client": "New Client",
        "edit_client": "Edit Client",
        "full_name": "Full Name",
        "phone": "Phone",
        "save_client": "Save Client",
        "select_type": "Select type",
        "full_name_placeholder": "Full name",
        "company_placeholder": "Company name",
        "phone_placeholder": "Phone number",
        "all_time": "All Time",
        "this_month": "This Month",
        "this_quarter": "This Quarter",
        "this_year": "This Year",
        "my_inspections": "My Inspections",
        "my_certificates": "My Certificates",
        "documentation": "Documentation",
        "documents": "Documents",
        "categories": "Categories",
        "search_documents": "Search documents...",
        "all_clients": "All Clients",
        "visible_to_clients": "Visible to",
        "select_clients": "Select at least one client.",
        "search_clients": "Search clients...",
        "select_client_filter": "Please select a client first.",
        "new_category": "+ New Category",
        "upload_document": "+ Upload Document",
        "category_name": "Category Name",
        "select_category": "Select category",
        "save_category": "Save Category",
        "save_document": "Save Document",
        "no_documents_found": "No documents found",
        "no_categories_found": "No categories found",
        "uncategorized": "Uncategorized",
        "are_you_sure_delete_category": "Are you sure you want to delete this category and its documents?",
        "are_you_sure_delete_document": "Are you sure you want to delete this document?",
        "please_upload_file": "Please upload at least one file.",
        "all": "All",
        "pending": "Pending",
        "active": "Active",
        "expiring_soon": "Expiring Soon",
        "expired": "Expired",
        "search_certificates": "Search certificates...",
        "search_clients": "Search clients...",
        "inspection_reports_documents": "Inspection Reports & Documents",
        "view_details": "View Details",
        "send_report_email": "Send Report via Email",
        "email_notifications": "Email Notifications",
        "certificate_settings": "Certificate Settings",
        "manage_templates": "Manage Templates",
        "notification_templates": "Notification Templates",
        "add_new_template": "Add New Template",
        "notification_history": "Notification History",
        "edit_template": "Edit",
        "system_settings": "System Settings",
        "email_configuration": "Email Configuration",
        "info_smtp_backend": "Browser direct SMTP sending is not possible for security reasons. You can send emails using Backend API or EmailJS with your Webmail SMTP information.",
        "cpanel_webmail_hint": "You can enter your cPanel Webmail (webmail.eysglobal.com.tr) SMTP settings below.",
        "option1_backend_api": "Option 1: Backend API (Recommended - Production)",
        "backend_api_url": "Backend API URL",
        "backend_api_url_hint": "Enter your Backend API endpoint URL (e.g., https://api.example.com/api/send-email)",
        "save_backend_api": "Save Backend API",
        "option2_emailjs": "Option 2: EmailJS (Frontend - Free)",
        "emailjs_hint": "EmailJS is a free service. You can register and get your API keys.",
        "save_emailjs_settings": "Save EmailJS Settings",
        "smtp_settings_backend_api": "SMTP Settings (for Backend API)",
        "smtp_server": "SMTP Server",
        "smtp_port": "SMTP Port",
        "email_address": "Email Address",
        "password_app_password": "Password/App Password",
        "smtp_password_hint": "These details are sent to the backend API (not stored in browser)",
        "security": "Security",
        "save_smtp_settings": "Save SMTP Settings",
        "certificate_expiry_notifications": "Certificate Expiry Notifications",
        "notify_before_expiry_days": "Notify Before Expiry (Days)",
        "auto_send_reminders": "Auto-send Reminders",
        "save_settings": "Save Settings",
        "smtp_connection_test_simulated": "SMTP connection test (simulated). In production, this would test your SMTP server connection.",
        "inspection_details": "Inspection Details",
        "files": "Files",
        "notes": "Notes",
        "download": "Download",
        "no_files": "No files",
        "no_notes_available": "No notes available.",
        "certificate_details": "Certificate Details",
        "number": "Number",
        "issued": "Issued",
        "expires": "Expires",
        "notifications_panel_title": "Notifications",
        "no_notifications": "No notifications",
        "add_new_template_title": "New Notification Template",
        "template_type": "Template Type",
        "template_type_hint": "Unique identifier for the template (e.g., certificate_expiring, inspection_info)",
        "subject": "Subject",
        "email_subject_hint": "Email subject. Use {{variableName}} for dynamic content.",
        "email_body_html_supported": "Email Body (HTML Supported)",
        "email_body_hint": "Email body content. Use {{clientName}}, {{certificateNumber}}, {{expiryDate}} as variables.",
        "save_template": "Save Template",
        "edit_notification_template_title": "Edit Notification Template",
        "template_not_found": "Template not found!",
        "are_you_sure_delete_certificate": "Are you sure you want to delete this certificate?",
        "certificate_not_found": "Certificate not found!",
        "client_email_not_found": "Client email not found!",
        "client_email_not_found_inspection": "Client email not found for this inspection!",
        "client_email_not_found_report": "Client email not found for this report!",
        "email_sent_successfully": "Email sent successfully to",
        "inspection_not_found": "Inspection not found!",
        "report_not_found": "Report not found!",
        "report_email_sent_successfully": "Report email sent successfully to",
        "file_too_large": "File {fileName} is too large. Maximum size is 10MB.",
        "backend_api_url_not_configured": "Backend API URL not configured! Enter Backend API URL in Settings section.",
        "email_not_sent": "Email could not be sent: ",
        "backend_api_running": "Make sure Backend API is running (http://localhost:3000)",
        "no_inspections_found": "No inspections found.",
        "no_certificates_found": "No certificates found.",
        "no_clients_found": "No clients found.",
        "no_inspection_reports_available": "No inspection reports available.",
        "no_recent_activity": "No recent activity.",
        "days_ago": "days ago",
        "days": "days",
        "expired_status": "Expired",
        "expiring_status": "Expiring Soon",
        "active_status": "Active",
        "client_welcome_subject": "Welcome to EYS Global Portal, {{clientName}}!",
        "client_welcome_body": "Dear {{clientName}},\n\nWelcome to the EYS Global Client Portal! You can now access your inspections, certificates, and reports securely.\n\nYour login email is: {{clientEmail}}\n\nBest regards,\nEYS Global Team",
        "inspection_info_subject": "Inspection Report - {{inspectionType}} for {{clientName}}",
        "inspection_info_body": "Dear {{clientName}},\n\nHere is the report for your recent inspection:\n\nInspection Type: {{inspectionType}}\nLocation: {{inspectionLocation}}\nDate: {{inspectionDate}}\nStatus: {{inspectionStatus}}\nNotes: {{inspectionNotes}}\n\nBest regards,\nEYS Global Team",
        "certificate_expiring_subject": "Certificate Expiring Soon - {{certificateNumber}}",
        "certificate_expiring_body": "Dear {{clientName}},\n\nYour certificate {{certificateNumber}} will expire on {{expiryDate}}. Please renew it soon.\n\nBest regards,\nEYS Global Team",
        "certificate_expired_subject": "Certificate Expired - {{certificateNumber}}",
        "certificate_expired_body": "Dear {{clientName}},\n\nYour certificate {{certificateNumber}} has expired on {{expiryDate}}. Please renew it immediately.\n\nBest regards,\nEYS Global Team",
        "report_info_subject": "Inspection Report - {{reportType}} for {{clientName}}",
        "report_info_body": "Dear {{clientName}},\n\nHere is your report for a recent inspection:\n\nReport Type: {{reportType}}\nLocation: {{reportLocation}}\nDate: {{reportDate}}\nStatus: {{reportStatus}}\nNotes: {{reportNotes}}\n\nBest regards,\nEYS Global Team"
    },
    tr: {
        "app_title_client": "EYS Global Portal&#305;",
        "app_title_admin": "EYS Global - Y&#246;netici Paneli",
        "welcome": "Ho&#351; geldiniz",
        "admin": "Y&#246;netici",
        "logout": "&#199;&#305;k&#305;&#351; Yap",
        "signin": "Giri&#351; Yap",
        "invalid_credentials": "Ge&#231;ersiz e-posta veya &#351;ifre",
        "approval_status": "Onay",
        "approved": "Onayl&#305;",
        "pending": "Beklemede",
        "approve": "Onayla",
        "approval_pending": "Hesab&#305;n&#305;z admin onay&#305; bekliyor. Onayland&#305;ktan sonra giri&#351; yapabilirsiniz.",
        "not_approved": "Hesab&#305;n&#305;z hen&#252;z onaylanmad&#305;.",
        "rate_limited": "&#199;ok fazla deneme yap&#305;ld&#305;. L&#252;tfen birka&#231; dakika bekleyip tekrar deneyin.",
        "role": "Rol",
        "client": "M&#252;&#351;teri",
        "admin_role": "Admin",
        "admins": "Adminler",
        "last_login": "Son Giri&#351;",
        "never": "Hi&#231;",
        "register": "&#220;ye Ol",
        "create_account": "Hesap Olu&#351;tur",
        "no_account": "Hesab&#305;n&#305;z yok mu?",
        "have_account": "Zaten hesab&#305;n&#305;z var m&#305;?",
        "registration_success": "Kayd&#305;n&#305;z al&#305;nd&#305;. &#350;imdi giri&#351; yapabilirsiniz.",
        "registration_failed": "Kay&#305;t ba&#351;ar&#305;s&#305;z. L&#252;tfen tekrar deneyin.",
        "weak_password": "&#350;ifre en az 6 karakter olmal&#305;.",

        "advanced_client_portal": "Geli&#351;mi&#351; M&#252;&#351;teri Portal&#305;",
        "email": "E-posta",
        "password": "&#350;ifre",
        "enter_password": "&#350;ifre girin",
        "demo_accounts": "Demo Hesaplar:",
        "admin_demo": "Y&#246;netici: admin@inspection.com / admin123",
        "client_demo": "M&#252;&#351;teri: client1@company.com / client123",

        "dashboard": "G&#246;sterge Paneli",
        "partner_dashboard": "Ortakl&#305;k Paneli",
        "global_overview": "Genel G&#246;r&#252;n&#252;m",
        "client_directory": "M&#252;&#351;teri Dizini",
        "project_portfolio": "Proje Portf&#246;y&#252;",
        "revenue_analytics": "Gelir &amp; Analitik",
        "team_management": "Ekip Y&#246;netimi",
        "firm_settings": "Firma Ayarlar&#305;",
        "export_data": "Veri D&#305;&#351;a Aktar",
        "inspections": "Denetimler",
        "certificates": "Sertifikalar",
        "clients": "M&#252;&#351;teriler",
        "reports": "Raporlar",
        "notifications": "Bildirimler",
        "settings": "Ayarlar",

        "total_inspections": "Toplam Denetim",
        "revenue_ytd": "Y&#305;l Geliri",
        "active_clients": "Aktif M&#252;&#351;teri",
        "pending_inspections": "Bekleyen Denetim",
        "live_projects": "Aktif Projeler",
        "expiring_certificates": "S&#252;resi Dolan Sertifikalar",
        "satisfaction": "Memnuniyet",
        "inspections_overview": "Denetim Genel Bak&#305;&#351;",
        "certificates_status": "Sertifika Durumu",
        "inspections_trend": "Denetim Trendi",
        "inspections_by_type": "Denetim T&#252;r&#252;ne G&#246;re",
        "revenue_overview": "Gelir Genel Bak&#305;&#351;",
        "recent_activity": "Son Etkinlik",

        "id": "ID",
        "client": "M&#252;&#351;teri",
        "location": "Konum",
        "type": "Tip",
        "date": "Tarih",
        "status": "Durum",
        "reports_col": "Raporlar",
        "actions": "Eylemler",
        "certificate_number": "Sertifika Numaras&#305;",
        "issue_date": "Verili&#351; Tarihi",
        "expiry_date": "Son Ge&#231;erlilik Tarihi",
        "days_remaining": "Kalan G&#252;n",
        "name": "Ad",
        "company": "&#350;irket",
        "inspections_count": "Denetimler",
        "certificates_count": "Sertifikalar",

        "search_inspections": "Denetim ara...",
        "all_status": "T&#252;m Durumlar",
        "scheduled": "Planland&#305;",
        "in_progress": "Devam Ediyor",
        "completed": "Tamamland&#305;",
        "new_inspection": "Yeni Denetim",
        "edit_inspection": "Denetimi D&#252;zenle",
        "select_client": "M&#252;&#351;teri se&#231;in",
        "inspection_type": "Denetim Tipi",
        "property_address": "M&#252;lk adresi",
        "inspection_date": "Denetim Tarihi",
        "notes": "Notlar",
        "additional_notes": "Ek notlar",
        "upload_reports_documents": "Rapor/Belge Y&#252;kle",
        "click_to_upload": "Y&#252;klemek i&#231;in t&#305;klay&#305;n veya s&#252;r&#252;kleyip b&#305;rak&#305;n",
        "file_types_hint": "PDF, DOC, DOCX, JPG, PNG (Maks 10MB/dosya)",
        "save_inspection": "Denetimi Kaydet",
        "cancel": "&#304;ptal",
        "delete": "Sil",
        "edit": "D&#252;zenle",
        "send_email": "E-posta G&#246;nder",
        "new_certificate": "Yeni Sertifika",
        "edit_certificate": "Sertifikay&#305; D&#252;zenle",
        "certificate_type": "Sertifika Tipi",
        "certificate_description": "Sertifika a&#231;&#305;klamas&#305;",
        "upload_certificate_document": "Sertifika Belgesi Y&#252;kle",
        "save_certificate": "Sertifikay&#305; Kaydet",
        "new_client": "Yeni M&#252;&#351;teri",
        "edit_client": "M&#252;&#351;teriyi D&#252;zenle",
        "full_name": "Tam Ad&#305;",
        "phone": "Telefon",
        "save_client": "M&#252;&#351;teriyi Kaydet",
        "select_type": "Tip se&#231;in",
        "full_name_placeholder": "Ad&#305;n&#305;z Soyad&#305;n&#305;z",
        "company_placeholder": "&#350;irket Ad&#305;",
        "phone_placeholder": "Telefon numaras&#305;",

        "all_time": "T&#252;m Zamanlar",
        "this_month": "Bu Ay",
        "this_quarter": "Bu &#199;eyrek",
        "this_year": "Bu Y&#305;l",
        "my_inspections": "Denetimlerim",
        "my_certificates": "Sertifikalar&#305;m",
        "documentation": "Dok&#252;mantasyon",
        "documents": "Dok&#252;manlar",
        "categories": "Kategoriler",
        "search_documents": "Dok&#252;man ara...",
        "all_clients": "T&#252;m M&#252;&#351;teriler",
        "visible_to_clients": "G&#246;r&#252;necek M&#252;&#351;teriler",
        "select_clients": "L&#252;tfen en az bir m&#252;&#351;teri se&#231;in.",
        "search_clients": "M&#252;&#351;teri ara...",
        "select_client_filter": "L&#252;tfen &#246;nce bir m&#252;&#351;teri se&#231;in.",
        "new_category": "+ Yeni Kategori",
        "upload_document": "+ Dok&#252;man Y&#252;kle",
        "category_name": "Kategori Ad&#305;",
        "select_category": "Kategori Se&#231;in",
        "save_category": "Kategoriyi Kaydet",
        "save_document": "Dok&#252;man&#305; Kaydet",
        "no_documents_found": "Dok&#252;man bulunamad&#305;",
        "no_categories_found": "Kategori bulunamad&#305;",
        "uncategorized": "Kategorisiz",
        "are_you_sure_delete_category": "Bu kategoriyi ve i&#231;indeki dok&#252;manlar&#305; silmek istedi&#287;inize emin misiniz?",
        "are_you_sure_delete_document": "Bu dok&#252;man&#305; silmek istedi&#287;inize emin misiniz?",
        "please_upload_file": "L&#252;tfen en az bir dosya y&#252;kleyin.",
        "all": "T&#252;m&#252;",
        "pending": "Beklemede",
        "active": "Aktif",
        "expiring_soon": "S&#252;resi Yak&#305;nda Dolan",
        "expired": "S&#252;resi Dolmu&#351;",

        "search_certificates": "Sertifika ara...",
        "search_clients": "M&#252;&#351;teri ara...",
        "inspection_reports_documents": "Denetim Raporlar&#305; ve Belgeleri",
        "view_details": "Detaylar&#305; G&#246;r&#252;nt&#252;le",
        "send_report_email": "Raporu E-posta ile G&#246;nder",

        "email_notifications": "E-posta Bildirimleri",
        "certificate_settings": "Sertifika Ayarlar&#305;",
        "manage_templates": "&#350;ablonlar&#305; Y&#246;net",
        "notification_templates": "Bildirim &#350;ablonlar&#305;",
        "add_new_template": "Yeni &#350;ablon Ekle",
        "notification_history": "Bildirim Ge&#231;mi&#351;i",
        "edit_template": "D&#252;zenle",
        "system_settings": "Sistem Ayarlar&#305;",
        "email_configuration": "E-posta Yap&#305;land&#305;rmas&#305;",
        "info_smtp_backend": "G&#252;venlik nedeniyle taray&#305;c&#305;dan do&#287;rudan SMTP g&#246;nderimi m&#252;mk&#252;n de&#287;ildir. Webmail SMTP bilgilerinizi kullanarak Backend API veya EmailJS ile e-posta g&#246;nderebilirsiniz.",
        "cpanel_webmail_hint": "cPanel Webmail (webmail.eysglobal.com.tr) SMTP ayarlar&#305;n&#305;z&#305; a&#351;a&#287;&#305;ya girebilirsiniz.",
        "option1_backend_api": "Se&#231;enek 1: Backend API (&#214;nerilen - &#220;retim)",
        "backend_api_url": "Backend API URL",
        "backend_api_url_hint": "Backend API u&#231; nokta URL'inizi girin (&#246;rn: https://api.example.com/api/send-email)",
        "save_backend_api": "Backend API'yi Kaydet",
        "option2_emailjs": "Se&#231;enek 2: EmailJS (Frontend - &#220;cretsiz)",
        "emailjs_hint": "EmailJS &#252;cretsiz bir servistir. Kay&#305;t olup API anahtarlar&#305;n&#305;z&#305; alabilirsiniz.",
        "save_emailjs_settings": "EmailJS Ayarlar&#305;n&#305; Kaydet",
        "smtp_settings_backend_api": "SMTP Ayarlar&#305; (Backend API i&#231;in)",
        "smtp_server": "SMTP Sunucusu",
        "smtp_port": "SMTP Portu",
        "email_address": "E-posta Adresi",
        "password_app_password": "&#350;ifre/Uygulama &#350;ifresi",
        "smtp_password_hint": "Bu bilgiler backend API'ye g&#246;nderilir (taray&#305;c&#305;da saklanmaz)",
        "security": "G&#252;venlik",
        "save_smtp_settings": "SMTP Ayarlar&#305;n&#305; Kaydet",
        "certificate_expiry_notifications": "Sertifika S&#252;resi Dolma Bildirimleri",
        "notify_before_expiry_days": "S&#252;re Bitiminden &#214;nce Bildir (G&#252;n)",
        "auto_send_reminders": "Otomatik Hat&#305;rlat&#305;c&#305; G&#246;nder",
        "save_settings": "Ayarlar&#305; Kaydet",
        "smtp_connection_test_simulated": "SMTP ba&#287;lant&#305; testi (sim&#252;le edildi). &#220;retimde bu, SMTP sunucusu ba&#287;lant&#305;n&#305;z&#305; test eder.",

        "inspection_details": "Denetim Detaylar&#305;",
        "files": "Dosyalar",
        "download": "&#304;ndir",
        "no_files": "Dosya yok",
        "no_notes_available": "Not mevcut de&#287;il.",
        "certificate_details": "Sertifika Detaylar&#305;",
        "number": "Numara",
        "issued": "Verildi",
        "expires": "Sona Eriyor",
        "notifications_panel_title": "Bildirimler",
        "no_notifications": "Bildirim yok",
        "add_new_template_title": "Yeni Bildirim &#350;ablonu",
        "template_type": "&#350;ablon Tipi",
        "template_type_hint": "&#350;ablon i&#231;in benzersiz tan&#305;mlay&#305;c&#305; (&#246;rn: certificate_expiring, inspection_info)",
        "subject": "Konu",
        "email_subject_hint": "E-posta konusu. Dinamik i&#231;erik i&#231;in {{variableName}} kullan&#305;n.",
        "email_body_html_supported": "E-posta &#304;&#231;eri&#287;i (HTML Destekli)",
        "email_body_hint": "E-posta g&#246;vde i&#231;eri&#287;i. {{clientName}}, {{certificateNumber}}, {{expiryDate}} gibi de&#287;i&#351;kenleri kullan&#305;n.",
        "save_template": "&#350;ablonu Kaydet",
        "edit_notification_template_title": "Bildirim &#350;ablonunu D&#252;zenle",
        "template_not_found": "&#350;ablon bulunamad&#305;!",
        "are_you_sure_delete_certificate": "Bu sertifikay&#305; silmek istedi&#287;inizden emin misiniz?",
        "certificate_not_found": "Sertifika bulunamad&#305;!",
        "client_email_not_found": "Bu m&#252;&#351;terinin e-postas&#305; bulunamad&#305;!",
        "client_email_not_found_inspection": "Bu denetim i&#231;in m&#252;&#351;teri e-postas&#305; bulunamad&#305;!",
        "client_email_not_found_report": "Bu rapor i&#231;in m&#252;&#351;teri e-postas&#305; bulunamad&#305;!",
        "email_sent_successfully": "E-posta ba&#351;ar&#305;yla g&#246;nderildi:",
        "inspection_not_found": "Denetim bulunamad&#305;!",
        "report_not_found": "Rapor bulunamad&#305;!",
        "file_too_large": "{fileName} dosyas&#305; &#231;ok b&#252;y&#252;k. Maksimum boyut 10MB.",
        "backend_api_url_not_configured": "Backend API URL yap&#305;land&#305;r&#305;lmam&#305;&#351;! Ayarlar b&#246;l&#252;m&#252;nden Backend API URL girin.",
        "email_not_sent": "E-posta g&#246;nderilemedi: ",
        "backend_api_running": "Backend API'nin &#231;al&#305;&#351;t&#305;&#287;&#305;ndan emin olun (http://localhost:3000)",
        "no_inspections_found": "Denetim bulunamad&#305;.",
        "no_certificates_found": "Sertifika bulunamad&#305;.",
        "no_clients_found": "M&#252;&#351;teri bulunamad&#305;.",
        "no_inspection_reports_available": "Denetim raporu mevcut de&#287;il.",
        "no_recent_activity": "Son etkinlik yok.",
        "days_ago": "g&#252;n &#246;nce",
        "days": "g&#252;n",
        "expired_status": "S&#252;resi Dolmu&#351;",
        "expiring_status": "S&#252;resi Yak&#305;nda Dolan",
        "active_status": "Aktif",
        "client_welcome_subject": "EYS Global Portal&#305;'na Ho&#351; Geldiniz, {{clientName}}!",
        "client_welcome_body": "Say&#305;n {{clientName}},\n\nEYS Global M&#252;&#351;teri Portal&#305;'na ho&#351; geldiniz! Art&#305;k denetimlerinize, sertifikalar&#305;n&#305;za ve raporlar&#305;n&#305;za g&#252;venli bir &#351;ekilde eri&#351;ebilirsiniz.\n\nGiri&#351; e-postan&#305;z: {{clientEmail}}\n\nSayg&#305;lar&#305;m&#305;zla,\nEYS Global Ekibi",
        "inspection_info_subject": "Denetim Raporu - {{inspectionType}} ({{clientName}})",
        "inspection_info_body": "Say&#305;n {{clientName}},\n\nSon denetim raporunuz a&#351;a&#287;&#305;dad&#305;r:\n\nDenetim Tipi: {{inspectionType}}\nKonum: {{inspectionLocation}}\nTarih: {{inspectionDate}}\nDurum: {{inspectionStatus}}\nNotlar: {{inspectionNotes}}\n\nSayg&#305;lar&#305;m&#305;zla,\nEYS Global Ekibi",
        "certificate_expiring_subject": "Sertifika S&#252;resi Yak&#305;nda Doluyor - {{certificateNumber}}",
        "certificate_expiring_body": "Say&#305;n {{clientName}},\n\nSertifika numaran&#305;z {{certificateNumber}}, {{expiryDate}} tarihinde sona erecektir. L&#252;tfen en k&#305;sa s&#252;rede yenileyin.\n\nSayg&#305;lar&#305;m&#305;zla,\nEYS Global Ekibi",
        "certificate_expired_subject": "Sertifika S&#252;resi Doldu - {{certificateNumber}}",
        "certificate_expired_body": "Say&#305;n {{clientName}},\n\nSertifika numaran&#305;z {{certificateNumber}}, {{expiryDate}} tarihinde s&#252;resi dolmu&#351;tur. L&#252;tfen hemen yenileyin.\n\nSayg&#305;lar&#305;m&#305;zla,\nEYS Global Ekibi",
        "report_info_subject": "Denetim Raporu - {{reportType}} ({{clientName}})",
        "report_info_body": "Say&#305;n {{clientName}},\n\nSon denetim raporunuz a&#351;a&#287;&#305;dad&#305;r:\n\nRapor Tipi: {{reportType}}\nKonum: {{reportLocation}}\nTarih: {{reportDate}}\nDurum: {{reportStatus}}\nNotlar: {{reportNotes}}\n\nSayg&#305;lar&#305;m&#305;zla,\nEYS Global Ekibi"
    }
};

// Fallback handled by key lookup in setLanguage

let currentLang = localStorage.getItem('lang') || 'en'; // Default to English

function decodeHtmlEntities(value) {
    if (typeof value !== 'string') return value;
    const textarea = document.createElement('textarea');
    textarea.innerHTML = value;
    return textarea.value;
}

function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    
    // Update elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (translations[currentLang] && translations[currentLang][key]) {
            element.textContent = decodeHtmlEntities(translations[currentLang][key]);
        }
    });

    // Update placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        const key = element.getAttribute('data-i18n-placeholder');
        if (translations[currentLang] && translations[currentLang][key]) {
            element.placeholder = decodeHtmlEntities(translations[currentLang][key]);
        }
    });

    // Update options
    document.querySelectorAll('[data-i18n-option]').forEach(element => {
        const key = element.getAttribute('data-i18n-option');
        if (translations[currentLang] && translations[currentLang][key]) {
            element.textContent = decodeHtmlEntities(translations[currentLang][key]);
        }
    });

    // Update active flag
    document.querySelectorAll('.language-selector img').forEach(img => {
        if (img.getAttribute('data-lang') === currentLang) {
            img.classList.add('active');
        } else {
            img.classList.remove('active');
        }
    });
    
    // Reload dynamic content that uses text directly from JS (tables, charts, etc.)
    if (currentUser) {
        if (currentUser.role === 'admin') {
            const activeSection = localStorage.getItem('activeAdminSection') || 'dashboard';
            showAdminSection(activeSection); 
        } else {
            showClientSection('dashboard');
            loadClientDashboard();
        }
    }

    // Update titles and other hardcoded text that might not have data-i18n
    document.title = decodeHtmlEntities(
        translations[currentLang][currentUser && currentUser.role === 'admin' ? 'app_title_admin' : 'app_title_client']
    );
    document.querySelector('.login-card .logo-section h1').textContent = decodeHtmlEntities(
        translations[currentLang]['app_title_client']
    );
    document.getElementById('adminScreen').querySelector('.app-header h1').textContent = decodeHtmlEntities(
        translations[currentLang]['app_title_admin']
    );
}


// Initialize demo data
function initializeDemoData(forceRefresh = false) {
    if (USE_BACKEND_DATA) {
        return;
    }
    if (forceRefresh) {
        console.log("Force refreshing demo data...");
        localStorage.removeItem('users');
        localStorage.removeItem('inspections');
        localStorage.removeItem('certificates');
        localStorage.removeItem('smtpSettings');
        localStorage.removeItem('certificateSettings');
        localStorage.removeItem('notifications');
        localStorage.removeItem('notificationTemplates');
        
        // Clear certificate sequence for demo refresh
        const currentYear = new Date().getFullYear();
        const shortYear = currentYear.toString().slice(-2);
        localStorage.removeItem(`certificateSequence_${shortYear}`);
    }

    let users = JSON.parse(localStorage.getItem('users') || '[]');
    if (USE_BACKEND_AUTH) {
        localStorage.removeItem('users');
        users = [];
    }

    // Ensure default admin is always present
    const defaultAdminUser = {
        id: 'admin1',
        email: 'danisman@eysglobal.com.tr',
        password: '12345678',
        name: 'Default Admin',
        role: 'admin',
        approved: true
    };

    let adminExistsInCurrentUsers = users.some(u => u.id === defaultAdminUser.id);

    if (!adminExistsInCurrentUsers) {
        users.unshift(defaultAdminUser); // Add admin to the beginning
    }

    // Only set demo users if no users exist or forced refresh
    if (!USE_BACKEND_AUTH && (users.length === 1 && users[0].id === defaultAdminUser.id || forceRefresh)) { // Check if only default admin exists or forceRefresh
        const demoUsers = [
            {
                id: 'admin1',
                email: 'danisman@eysglobal.com.tr',
                password: '12345678',
                name: 'Default Admin',
                role: 'admin',
                approved: true
            },
            {
                id: 'client1',
                email: 'client1@company.com',
                password: 'client123',
                name: 'John Smith',
                company: 'ABC Corporation',
                phone: '+1 234 567 8900',
                role: 'client',
                approved: true
            },
            {
                id: 'client2',
                email: 'jane@example.com',
                password: 'client123',
                name: 'Jane Doe',
                company: 'XYZ Industries',
                phone: '+1 987 654 3210',
                role: 'client',
                approved: true
            },
            {
                id: 'client3',
                email: 'mike@example.com',
                password: 'client123',
                name: 'Mike Johnson',
                company: 'PQR Solutions',
                phone: '+1 555 123 4567',
                role: 'client',
                approved: true
            }
        ];
        localStorage.setItem('users', JSON.stringify(demoUsers));
        users = demoUsers; // Update local users array as well
    }

    if (!localStorage.getItem('inspections') || forceRefresh) {
        const today = new Date();
        const demoInspections = [
            {
                id: 'insp1',
                clientId: 'client1',
                clientName: 'John Smith',
                location: '123 Main Street, City Center',
                type: 'Building Inspection',
                date: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                status: 'Completed',
                notes: 'All safety checks passed. Minor maintenance recommendations provided.',
                files: [],
                createdAt: new Date().toISOString()
            },
            {
                id: 'insp2',
                clientId: 'client2',
                clientName: 'Jane Doe',
                location: '456 Business Park, Industrial Zone',
                type: 'Safety Inspection',
                date: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                status: 'In Progress',
                notes: 'Ongoing inspection. Preliminary findings look good.',
                files: [],
                createdAt: new Date().toISOString()
            },
            {
                id: 'insp3',
                clientId: 'client3',
                clientName: 'Mike Johnson',
                location: '789 Commercial Blvd, Downtown',
                type: 'Environmental Inspection',
                date: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                status: 'Scheduled',
                notes: 'Scheduled for next week.',
                files: [],
                createdAt: new Date().toISOString()
            },
            {
                id: 'insp4',
                clientId: 'client1',
                clientName: 'John Smith',
                location: '101 Industrial Way',
                type: 'Fire Safety Audit',
                date: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                status: 'Completed',
                notes: 'Annual fire safety audit passed with no critical issues.',
                files: [],
                createdAt: new Date().toISOString()
            }
        ];
        localStorage.setItem('inspections', JSON.stringify(demoInspections));
    }

    if (!localStorage.getItem('certificates') || forceRefresh) {
        const today = new Date();
        const currentYearShort = today.getFullYear().toString().slice(-2);
        let certSequence = 0;

        const getNextCertNumber = () => {
            certSequence++;
            return `EYS-CERT-${currentYearShort}${String(certSequence).padStart(3, '0')}`;
        };

        const demoCertificates = [
            {
                id: 'cert1',
                clientId: 'client1',
                clientName: 'John Smith',
                certificateNumber: getNextCertNumber(),
                type: 'Safety Certificate',
                issueDate: new Date(today.getTime() - 200 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                expiryDate: new Date(today.getTime() + 25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                description: 'Building Safety Compliance Certificate',
                file: null,
                status: 'Active',
                createdAt: new Date().toISOString()
            },
            {
                id: 'cert2',
                clientId: 'client2',
                clientName: 'Jane Doe',
                certificateNumber: getNextCertNumber(),
                type: 'Environmental Certificate',
                issueDate: new Date(today.getTime() - 300 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                expiryDate: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                description: 'Environmental Compliance Certificate',
                file: null,
                status: 'Expired',
                createdAt: new Date().toISOString()
            },
            {
                id: 'cert3',
                clientId: 'client3',
                clientName: 'Mike Johnson',
                certificateNumber: getNextCertNumber(),
                type: 'Fire Safety Certificate',
                issueDate: new Date(today.getTime() - 250 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                expiryDate: new Date(today.getTime() + 165 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                description: 'Fire Safety Compliance Certificate',
                file: null,
                status: 'Active',
                createdAt: new Date().toISOString()
            },
            {
                id: 'cert4',
                clientId: 'client1',
                clientName: 'John Smith',
                certificateNumber: getNextCertNumber(),
                type: 'Quality Assurance',
                issueDate: new Date(today.getTime() - 150 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                expiryDate: new Date(today.getTime() + 200 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                description: 'ISO 9001:2015 Certification',
                file: null,
                status: 'Active',
                createdAt: new Date().toISOString()
            }
        ];
        localStorage.setItem('certificates', JSON.stringify(demoCertificates));
        // Set the certificate sequence to the last generated value
        localStorage.setItem(`certificateSequence_${currentYearShort}`, certSequence.toString());
    }

    if (!localStorage.getItem('smtpSettings')) {
        localStorage.setItem('smtpSettings', JSON.stringify({
            server: '',
            port: 587,
            email: '',
            password: '',
            security: 'tls'
        }));
    }

    if (!localStorage.getItem('certificateSettings')) {
        localStorage.setItem('certificateSettings', JSON.stringify({
            notifyDays: 30,
            autoReminder: true
        }));
    }

    if (!localStorage.getItem('notifications') || forceRefresh) {
        localStorage.setItem('notifications', JSON.stringify([]));
    }

    if (!localStorage.getItem('notificationTemplates') || forceRefresh) {
        localStorage.setItem('notificationTemplates', JSON.stringify([
            {
                type: 'certificate_expiring',
                subject: 'Certificate Expiring Soon - {{certificateNumber}}',
                body: 'Dear {{clientName}},\n\nYour certificate {{certificateNumber}} will expire on {{expiryDate}}. Please renew it soon.\n\nBest regards,\nEYS Global Team'
            },
            {
                type: 'certificate_expired',
                subject: 'Certificate Expired - {{certificateNumber}}',
                body: 'Dear {{clientName}},\n\nYour certificate {{certificateNumber}} has expired on {{expiryDate}}. Please renew it immediately.\n\nBest regards,\nEYS Global Team'
            },
            {
                type: 'inspection_info',
                subject: 'Inspection Report - {{inspectionType}} for {{clientName}}',
                body: 'Dear {{clientName}},\n\nHere is the report for your recent inspection:\n\nInspection Type: {{inspectionType}}\nLocation: {{inspectionLocation}}\nDate: {{inspectionDate}}\nStatus: {{inspectionStatus}}\nNotes: {{inspectionNotes}}\n\nBest regards,\nEYS Global Team'
            },
            {
                type: 'welcome_client',
                subject: "EYS Global\u2019e Ho\u015f Geldiniz, {{clientName}}!",
                body: "Merhaba {{clientName}},\n\nEYS Global\u2019e ho\u015f geldiniz. Art\u0131k m\u00fc\u015fteri portal\u0131n\u0131zdan denetim, sertifika ve raporlar\u0131n\u0131za g\u00fcvenle eri\u015febilirsiniz.\n\nPortal giri\u015fi: {{portalUrl}}\nHesab\u0131n\u0131z: {{clientEmail}}\n\nHerhangi bir sorunuzda bize yazabilirsiniz. Sizinle \u00e7al\u0131\u015fmaktan mutluluk duyar\u0131z.\n\nSayg\u0131lar\u0131m\u0131zla,\nEYS Global"
            },
            {
                type: 'report_info',
                subject: 'Inspection Report - {{reportType}} for {{clientName}}',
                body: 'Dear {{clientName}},\n\nHere is your report for a recent inspection:\n\nReport Type: {{reportType}}\nLocation: {{reportLocation}}\nDate: {{reportDate}}\nStatus: {{reportStatus}}\nNotes: {{reportNotes}}\n\nBest regards,\nEYS Global Team'
            }
        ]));
    }

    ensureWelcomeTemplate();

    // Check for expiring certificates and create notifications
    // checkCertificateExpiry(); // Moved to be called after admin login
}

// Authentication Functions
async function apiRequest(path, payload) {
    const token = localStorage.getItem('authToken') || '';
    const response = await fetch(`${AUTH_API_BASE}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload || {})
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
        const message = data.message || 'request_failed';
        if (response.status === 401 || message === 'unauthorized') {
            localStorage.removeItem('authToken');
            localStorage.removeItem('currentUser');
        }
        throw new Error(message);
    }
    return data;
}

async function persistStoreValue(key, rawValue) {
    if (!USE_BACKEND_DATA) return;
    let value = rawValue;
    if (typeof rawValue === 'string') {
        try {
            value = JSON.parse(rawValue);
        } catch (e) {
            value = rawValue;
        }
    }
    try {
        await apiRequest('/data/store.php', { action: 'set', key, value });
    } catch (error) {
        console.warn('Store sync failed', key, error);
    }
}

async function syncFromBackend() {
    if (!USE_BACKEND_DATA) return;
    if (USE_BACKEND_AUTH && !localStorage.getItem('authToken')) return;
    try {
        isSyncing = true;
        const storeResult = await apiRequest('/data/store.php', { action: 'get_all' });
        if (storeResult && storeResult.store) {
            Object.entries(storeResult.store).forEach(([key, value]) => {
                originalSetItem(key, JSON.stringify(value));
            });
        }

        if (currentUser && currentUser.role === 'admin') {
            const usersResult = await apiRequest('/data/users.php', { action: 'list' });
            if (usersResult && Array.isArray(usersResult.users)) {
                originalSetItem('users', JSON.stringify(usersResult.users));
            }
        }
    } catch (error) {
        if (error.message !== 'unauthorized') {
            console.warn('Backend sync failed', error);
        }
    } finally {
        isSyncing = false;
    }
}

async function refreshUsers() {
    if (!USE_BACKEND_DATA) {
        return JSON.parse(localStorage.getItem('users') || '[]');
    }
    if (!currentUser || currentUser.role !== 'admin') {
        return JSON.parse(localStorage.getItem('users') || '[]');
    }
    const usersResult = await apiRequest('/data/users.php', { action: 'list' });
    if (usersResult && Array.isArray(usersResult.users)) {
        originalSetItem('users', JSON.stringify(usersResult.users));
        return usersResult.users;
    }
    return [];
}

async function login(email, password) {
    lastLoginError = null;
    if (!USE_BACKEND_AUTH) {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const user = users.find(u => u.email === email && u.password === password);
    
        if (!user) {
            return false;
        }
        currentUser = { ...user };
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        return true;
    }

    try {
        const result = await apiRequest('/auth/login.php', { email, password });
        if (result.token) {
            localStorage.setItem('authToken', result.token);
        }
        currentUser = result.user;
        
        // Check if user is approved (unless admin)
        if (currentUser.role !== 'admin' && !isApprovedUser(currentUser)) {
            lastLoginError = 'not_approved';
            currentUser = null;
            localStorage.removeItem('currentUser');
            localStorage.removeItem('authToken');
            return false;
        }
        
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        logActivity('login', 'logged into the portal');
        return true;
    } catch (error) {
        lastLoginError = error.message;
        return false;
    }
}

async function registerUser(payload) {
    const result = await apiRequest('/auth/register.php', payload);
    if (result.token) {
        localStorage.setItem('authToken', result.token);
    }
    return result.user;
}

function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    localStorage.removeItem('authToken');
    showScreen('loginScreen');
}

function checkAuth() {
    const stored = localStorage.getItem('currentUser');
    const token = localStorage.getItem('authToken');
    if (stored && (!USE_BACKEND_AUTH || token)) {
        currentUser = JSON.parse(stored);
        if (currentUser.role !== 'admin' && !isApprovedUser(currentUser)) {
            logout();
            return false;
        }
        if (currentUser.role === 'admin') {
            showScreen('adminScreen');
            const lastAdminSection = localStorage.getItem('activeAdminSection') || 'dashboard';
            showAdminSection(lastAdminSection); // Navigate to the last active section
        } else {
            showScreen('clientScreen');
            showClientSection('dashboard');
            loadClientDashboard();
        }
        return true;
    }
    return false;
}

// Screen Management
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

function toggleAuthForms(showRegister) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const demoBlock = document.querySelector('.demo-credentials');

    if (showRegister) {
        loginForm.classList.add('auth-hidden');
        registerForm.classList.remove('auth-hidden');
        if (demoBlock) demoBlock.classList.add('auth-hidden');
    } else {
        registerForm.classList.add('auth-hidden');
        loginForm.classList.remove('auth-hidden');
        if (demoBlock) demoBlock.classList.remove('auth-hidden');
    }
}

// Login Form Handler
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    const ok = await login(email, password);
    if (ok) {
        if (USE_BACKEND_DATA) {
            await syncFromBackend();
        }
        if (currentUser.role === 'admin') {
            checkCertificateExpiry();
            setInterval(checkCertificateExpiry, 60 * 60 * 1000);
            showScreen('adminScreen');
            const lastAdminSection = localStorage.getItem('activeAdminSection') || 'dashboard';
            showAdminSection(lastAdminSection); // Load the last active admin section
        } else {
            showScreen('clientScreen');
            showClientSection('dashboard');
            loadClientDashboard(); // Load client dashboard content
        }
        document.getElementById('loginForm').reset();
    } else {
        if (lastLoginError === 'not_approved') {
            showPopup('info', translations[currentLang].approval_pending);
        } else if (lastLoginError === 'rate_limited') {
            showPopup('error', translations[currentLang].rate_limited);
        } else {
            showPopup('error', translations[currentLang].invalid_credentials);
        }
    }
});

// Register Form Handler
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        fullName: document.getElementById('registerName').value.trim(),
        email: document.getElementById('registerEmail').value.trim(),
        password: document.getElementById('registerPassword').value,
        company: document.getElementById('registerCompany').value.trim(),
        phone: document.getElementById('registerPhone').value.trim()
    };

    if (payload.password.length < 6) {
        showPopup('error', translations[currentLang].weak_password);
        return;
    }

    try {
        await registerUser(payload);
        showPopup('info', translations[currentLang].approval_pending);
        document.getElementById('registerForm').reset();
        toggleAuthForms(false);
    } catch (error) {
        showPopup('error', translations[currentLang].registration_failed);
    }
});

// Auth switch buttons
document.getElementById('showRegister').addEventListener('click', () => toggleAuthForms(true));
document.getElementById('showLogin').addEventListener('click', () => toggleAuthForms(false));

// Client Dashboard Functions
function loadClientDashboard() {
    if (!currentUser) return;
    
    // Update client name and avatar
    const clientNameEl = document.getElementById('clientName');
    const clientAvatarEl = document.getElementById('clientAvatar');
    if (clientNameEl) {
        clientNameEl.textContent = currentUser.name || currentUser.fullName || currentUser.email || 'Client';
    }
    if (clientAvatarEl) {
        const initials = (currentUser.name || currentUser.fullName || currentUser.email || 'C').charAt(0).toUpperCase();
        clientAvatarEl.textContent = initials;
    }
    
    const inspections = JSON.parse(localStorage.getItem('inspections') || '[]');
    const certificates = JSON.parse(localStorage.getItem('certificates') || '[]');
    const clientInspections = inspections.filter(i => matchesClient(i, currentUser));
    const clientCertificates = certificates.filter(c => matchesClient(c, currentUser));
    
    // Update stats
    const totalInspectionsEl = document.getElementById('clientTotalInspections');
    const pendingInspectionsEl = document.getElementById('clientPendingInspections');
    const completedInspectionsEl = document.getElementById('clientCompletedInspections');
    const expiringCertificatesEl = document.getElementById('clientExpiringCertificates');
    
    if (totalInspectionsEl) totalInspectionsEl.textContent = clientInspections.length;
    if (pendingInspectionsEl) {
        pendingInspectionsEl.textContent = clientInspections.filter(i => i.status === 'Scheduled' || i.status === 'In Progress').length;
    }
    if (completedInspectionsEl) {
        completedInspectionsEl.textContent = clientInspections.filter(i => i.status === 'Completed').length;
    }
    
    const expiringCertificates = clientCertificates.filter(c => {
        const days = getDaysUntilExpiry(c.expiryDate);
        return days > 0 && days <= 30;
    });
    if (expiringCertificatesEl) expiringCertificatesEl.textContent = expiringCertificates.length;
    
    // Update notification badge
    updateNotificationBadge('client');
    
    // Load charts
    loadClientCharts(clientInspections, clientCertificates);
    
    // Render lists
    renderClientInspections(clientInspections);
    renderClientCertificates(clientCertificates);
    loadClientDocuments();
}

function showClientSection(section) {
    if (!currentUser) return;
    
    document.querySelectorAll('#clientScreen .admin-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('#clientScreen .nav-btn').forEach(btn => btn.classList.remove('active'));
    
    const sectionMap = {
        dashboard: 'clientDashboard',
        inspections: 'clientInspections',
        certificates: 'clientCertificates',
        documents: 'clientDocuments'
    };
    
    const sectionEl = document.getElementById(sectionMap[section]);
    if (sectionEl) {
        sectionEl.classList.add('active');
    }
    
    const navBtn = document.querySelector(`#clientScreen .nav-btn[onclick*="showClientSection('${section}')"]`);
    if (navBtn) {
        navBtn.classList.add('active');
    }
    
    if (section === 'dashboard') {
        loadClientDashboard();
    } else if (section === 'inspections') {
        const inspections = JSON.parse(localStorage.getItem('inspections') || '[]');
        const clientInspections = inspections.filter(i => matchesClient(i, currentUser));
        renderClientInspections(clientInspections, 'clientInspectionsListFull');
    } else if (section === 'certificates') {
        const certificates = JSON.parse(localStorage.getItem('certificates') || '[]');
        const clientCertificates = certificates.filter(c => matchesClient(c, currentUser));
        renderClientCertificates(clientCertificates, 'clientCertificatesListFull');
    } else if (section === 'documents') {
        const categories = getDocCategories();
        const documents = getDocuments();
        renderClientDocuments(categories, documents, 'clientDocumentsListFull');
    }
}

function loadClientCharts(inspections, certificates) {
    // Inspections Chart
    const inspectionsCtx = document.getElementById('clientInspectionsChart');
    if (charts.clientInspections) charts.clientInspections.destroy();
    
    const inspectionsData = {
        [translations[currentLang].scheduled]: inspections.filter(i => i.status === 'Scheduled').length,
        [translations[currentLang].in_progress]: inspections.filter(i => i.status === 'In Progress').length,
        [translations[currentLang].completed]: inspections.filter(i => i.status === 'Completed').length
    };
    
    charts.clientInspections = new Chart(inspectionsCtx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(inspectionsData),
            datasets: [{
                data: Object.values(inspectionsData),
                backgroundColor: ['#3b82f6', '#f59e0b', '#10b981']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true
        }
    });
    
    // Certificates Chart
    const certificatesCtx = document.getElementById('clientCertificatesChart');
    if (charts.clientCertificates) charts.clientCertificates.destroy();
    
    const certificatesData = {
        [translations[currentLang].active]: certificates.filter(c => c.status === 'Active').length,
        [translations[currentLang].expiring_soon]: certificates.filter(c => {
            const days = getDaysUntilExpiry(c.expiryDate);
            return days > 0 && days <= 30;
        }).length,
        [translations[currentLang].expired]: certificates.filter(c => c.status === 'Expired').length
    };
    
    charts.clientCertificates = new Chart(certificatesCtx, {
        type: 'bar',
        data: {
            labels: Object.keys(certificatesData),
            datasets: [{
                label: translations[currentLang].certificates,
                data: Object.values(certificatesData),
                backgroundColor: ['#10b981', '#f59e0b', '#ef4444']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function renderClientInspections(inspections, containerId = null) {
    const container = containerId ? document.getElementById(containerId) : document.getElementById('clientInspectionsList');
    if (!container) return;
    
    if (inspections.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>${translations[currentLang]?.no_inspections_found || 'No inspections found'}</p></div>`;
        return;
    }
    
    container.innerHTML = inspections.map(inspection => `
        <div class="inspection-card" onclick="viewInspectionDetail('${inspection.id}')">
            <div class="inspection-card-header">
                <div>
                    <div class="inspection-card-title">${inspection.type}</div>
                    <div style="color: var(--text-secondary); font-size: 14px;">${inspection.location}</div>
                </div>
                <span class="status-badge status-${inspection.status.toLowerCase().replace(' ', '-')}">${inspection.status}</span>
            </div>
            <div class="inspection-card-meta">
                <span>&#128197; ${formatDate(inspection.date)}</span>
                ${inspection.files && inspection.files.length > 0 ? `<span>&#128206; ${inspection.files.length} file(s)</span>` : ''}
            </div>
        </div>
    `).join('');
}

function filterClientInspections(filter) {
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    const inspections = JSON.parse(localStorage.getItem('inspections') || '[]');
    const clientInspections = inspections.filter(i => matchesClient(i, currentUser));
    
    let filtered = clientInspections;
    if (filter === 'pending') {
        filtered = clientInspections.filter(i => i.status === 'Scheduled' || i.status === 'In Progress');
    } else if (filter === 'completed') {
        filtered = clientInspections.filter(i => i.status === 'Completed');
    }
    
    renderClientInspections(filtered);
}

function renderClientCertificates(certificates, containerId = null) {
    const container = containerId ? document.getElementById(containerId) : document.getElementById('clientCertificatesList');
    if (!container) return;
    
    if (certificates.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>${translations[currentLang]?.no_certificates_found || 'No certificates found'}</p></div>`;
        return;
    }
    
    container.innerHTML = certificates.map(cert => {
        const daysUntilExpiry = getDaysUntilExpiry(cert.expiryDate);
        const statusClass = daysUntilExpiry < 0 ? 'expired' : (daysUntilExpiry <= 30 ? 'expiring' : '');
        const expiryText = daysUntilExpiry < 0 
            ? `<span class="expiry-warning">${translations[currentLang]?.expired_status || 'Expired'} ${Math.abs(daysUntilExpiry)} ${translations[currentLang]?.days_ago || 'days ago'}</span>`
            : daysUntilExpiry <= 30
            ? `<span class="expiry-warning">${translations[currentLang]?.expiring_status || 'Expiring'} ${daysUntilExpiry} ${translations[currentLang]?.days || 'days'}</span>`
            : `${translations[currentLang]?.expires || 'Expires'}: ${formatDate(cert.expiryDate)}`;
        
        return `
            <div class="certificate-card ${statusClass}" onclick="viewCertificateDetail('${cert.id}')">
                <div class="certificate-card-header">
                    <div class="certificate-number">${cert.certificateNumber}</div>
                    <span class="status-badge status-${cert.status.toLowerCase().replace(' ', '-')}">${cert.status}</span>
                </div>
                <div class="certificate-meta">
                    <div><strong>Type:</strong> ${cert.type}</div>
                    <div><strong>Issued:</strong> ${formatDate(cert.issueDate)}</div>
                </div>
                <div class="certificate-expiry">
                    ${expiryText}
                </div>
            </div>
        `;
    }).join('');
}

// Documentation
function getDocCategories() {
    return JSON.parse(localStorage.getItem('docCategories') || '[]');
}

function getDocuments() {
    return JSON.parse(localStorage.getItem('documents') || '[]');
}

function loadClientDocuments() {
    const categories = getDocCategories();
    const documents = getDocuments();
    renderClientDocuments(categories, documents);
}

function renderClientDocuments(categories, documents, containerId = null) {
    const container = containerId ? document.getElementById(containerId) : document.getElementById('clientDocumentsList');
    if (!container) return;

    const searchInputId = containerId === 'clientDocumentsListFull' ? 'clientDocumentsSearchFull' : 'clientDocumentsSearch';
    const searchInput = document.getElementById(searchInputId);
    const searchTerm = normalizeText(searchInput ? searchInput.value : '');

    const visibleDocuments = documents.filter(doc => canClientAccessDocument(doc, currentUser));

    if (!visibleDocuments.length) {
        container.innerHTML = `<div class="empty-state"><p>${translations[currentLang]?.no_documents_found || 'No documents found'}</p></div>`;
        return;
    }

    const categoriesById = new Map(categories.map(category => [String(category.id), category]));
    const grouped = visibleDocuments.reduce((acc, doc) => {
        const key = String(doc.categoryId || 'uncategorized');
        if (!acc[key]) acc[key] = [];
        acc[key].push(doc);
        return acc;
    }, {});

    if (!docCollapseInitialized) {
        Object.keys(grouped).forEach(categoryId => {
            collapsedDocCategoryIds.add(String(categoryId));
        });
        docCollapseInitialized = true;
    }

    const content = Object.entries(grouped).map(([categoryId, docs]) => {
        const category = categoriesById.get(String(categoryId));
        const categoryName = category ? category.name : translations[currentLang].uncategorized;
        const isCollapsed = collapsedDocCategoryIds.has(String(categoryId));
        const filteredDocs = docs.map(doc => {
            if (!searchTerm) return doc;
            const matchingFiles = (doc.files || []).filter(file =>
                normalizeText(file.name).includes(searchTerm)
            );
            if (matchingFiles.length === 0) return null;
            return { ...doc, files: matchingFiles };
        }).filter(Boolean);

        if (searchTerm && filteredDocs.length === 0) {
            return '';
        }

        return `
            <div class="doc-category-card ${isCollapsed ? 'collapsed' : ''}">
                <button class="doc-category-toggle" onclick="toggleDocCategory('${categoryId}')">
                    <span>${categoryName}</span>
                    <span class="doc-category-arrow">&#9662;</span>
                </button>
                <div class="doc-document-list">
                    ${filteredDocs.map(doc => `
                        <div class="doc-document-item">
                            <div class="doc-document-files">
                                ${(doc.files || []).map(file => `
                                    <div class="file-item">
                                        <div class="file-item-info">
                                            <span class="file-item-name">${file.name}</span>
                                            <span class="file-item-size">${formatFileSize(file.size)}</span>
                                        </div>
                                        <button class="btn btn-primary btn-sm" onclick="downloadFile('${file.name}', '${file.data}')">${translations[currentLang].download}</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = content || `<div class="empty-state"><p>${translations[currentLang].no_documents_found}</p></div>`;
}

function loadDocumentationAdmin() {
    const categories = getDocCategories();
    const documents = getDocuments();
    renderDocCategories(categories);
    renderDocClientSelector();
    renderDocDocuments(categories, documents);
}

function renderDocCategories(categories) {
    const list = document.getElementById('docCategoriesList');
    if (!list) return;

    if (selectedDocCategoryId !== 'all' && !categories.some(cat => sameId(cat.id, selectedDocCategoryId))) {
        selectedDocCategoryId = 'all';
    }

    const allCount = getDocuments().length;
    const categoryItems = categories.map(cat => {
        const count = getDocuments().filter(doc => sameId(doc.categoryId, cat.id)).length;
        return `
            <div class="doc-category-item ${sameId(cat.id, selectedDocCategoryId) ? 'active' : ''}" onclick="selectDocCategory('${cat.id}')">
                <span>${cat.name}</span>
                <span class="category-count">${count}</span>
            </div>
        `;
    }).join('');

    list.innerHTML = `
        <div class="doc-category-item ${selectedDocCategoryId === 'all' ? 'active' : ''}" onclick="selectDocCategory('all')">
            <span>${translations[currentLang].all}</span>
            <span class="category-count">${allCount}</span>
        </div>
        ${categoryItems}
    `;
}

function renderDocClientSelector() {
    const list = document.getElementById('docClientList');
    if (!list) return;

    const searchInput = document.getElementById('docClientSearch');
    const searchTerm = normalizeText(searchInput ? searchInput.value : '');

    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const clients = users.filter(u => u.role === 'client');
    const filtered = clients.filter(client => {
        if (!searchTerm) return true;
        return normalizeText(client.name).includes(searchTerm) ||
            normalizeText(client.email).includes(searchTerm) ||
            normalizeText(client.company).includes(searchTerm);
    });

    if (selectedDocClientId !== 'all' && !clients.some(c => sameId(c.id, selectedDocClientId))) {
        selectedDocClientId = 'all';
    }

    list.innerHTML = `
        <div class="doc-client-chip ${selectedDocClientId === 'all' ? 'active' : ''}" onclick="selectDocClient('all')">
            ${translations[currentLang].all_clients}
        </div>
        ${filtered.map(client => `
            <div class="doc-client-chip ${sameId(client.id, selectedDocClientId) ? 'active' : ''}" onclick="selectDocClient('${client.id}')">
                ${client.name || client.email}
            </div>
        `).join('')}
    `;
}

function renderDocDocuments(categories, documents) {
    const list = document.getElementById('docDocumentsList');
    if (!list) return;

    const filteredByCategory = selectedDocCategoryId === 'all'
        ? documents
        : documents.filter(doc => sameId(doc.categoryId, selectedDocCategoryId));
    const filtered = selectedDocClientId === 'all'
        ? filteredByCategory
        : filteredByCategory.filter(doc => Array.isArray(doc.allowedClientIds) && doc.allowedClientIds.some(id => sameId(id, selectedDocClientId)));

    if (!filtered.length) {
        list.innerHTML = `<div class="empty-state"><p>${translations[currentLang].no_documents_found}</p></div>`;
        return;
    }

    const categoriesById = new Map(categories.map(category => [String(category.id), category]));
    list.innerHTML = filtered.map(doc => {
        const category = categoriesById.get(String(doc.categoryId));
        const allowed = Array.isArray(doc.allowedClientIds) ? doc.allowedClientIds : [];
        const visibility = allowed.includes('all') || allowed.length === 0
            ? translations[currentLang].all_clients
            : `${allowed.length} client(s)`;
        const title = doc.title || (doc.files && doc.files[0] ? doc.files[0].name : translations[currentLang].documents);
        const fileExt = doc.files && doc.files[0] ? doc.files[0].name.split('.').pop().toUpperCase() : 'DOC';
        
        return `
            <div class="doc-card">
                <div class="doc-card-header">
                    <div class="doc-icon">${fileExt.substring(0, 3)}</div>
                    <div class="doc-card-info">
                        <div class="doc-card-title">${title}</div>
                        <div class="doc-card-meta">${(doc.files || []).length} file(s)</div>
                    </div>
                </div>
                <div class="doc-card-category">${category ? category.name : translations[currentLang].uncategorized}</div>
                <div class="doc-card-meta" style="margin-top: 8px; font-size: 13px;">
                    <strong>Visible to:</strong> ${visibility}
                </div>
                <div class="doc-card-actions">
                    ${(doc.files || []).slice(0, 1).map(file => `
                        <button class="btn btn-secondary" onclick="downloadFile('${file.name}', '${file.data}')" title="${file.name}">
                            📥 Download
                        </button>
                    `).join('')}
                    <button class="btn btn-danger" onclick="deleteDocument('${doc.id}')">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

function selectDocCategory(id) {
    selectedDocCategoryId = id;
    loadDocumentationAdmin();
}

function selectDocClient(id) {
    selectedDocClientId = id;
    loadDocumentationAdmin();
}

function toggleDocCategory(id) {
    const key = String(id);
    if (collapsedDocCategoryIds.has(key)) {
        collapsedDocCategoryIds.delete(key);
    } else {
        collapsedDocCategoryIds.add(key);
    }
    loadClientDocuments();
}

function showCategoryModal() {
    document.getElementById('categoryForm').reset();
    document.getElementById('categoryModal').classList.add('active');
}

function showDocumentModal() {
    const modal = document.getElementById('documentModal');
    if (!modal) {
        console.error('Document modal not found');
        return;
    }
    
    const categories = getDocCategories();
    const categorySelect = document.getElementById('documentCategory');
    if (!categorySelect) {
        console.error('Document category select not found');
        return;
    }

    categorySelect.innerHTML = `<option value="">${translations[currentLang]?.select_category || 'Select Category'}</option>` +
        categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('');

    uploadedFiles.document = [];
    updateFilesList('document');
    
    const form = document.getElementById('documentForm');
    if (form) {
        form.reset();
    }
    
    modal.classList.add('active');
}

async function deleteDocCategory(id) {
    if (!id) {
        showPopup('error', 'Category ID is missing');
        return;
    }
    
    const categories = getDocCategories();
    const categoryToDelete = categories.find(cat => sameId(cat.id, id));
    
    if (!categoryToDelete) {
        showPopup('error', 'Category not found');
        return;
    }
    
    const documents = getDocuments();
    const docsInCategory = documents.filter(doc => sameId(doc.categoryId, id));
    
    const confirmMessage = docsInCategory.length > 0
        ? `Are you sure you want to delete category "${categoryToDelete.name}"? This will also delete ${docsInCategory.length} document(s) in this category. This action cannot be undone.`
        : `Are you sure you want to delete category "${categoryToDelete.name}"? This action cannot be undone.`;
    
    const confirmed = await showConfirm(confirmMessage, {
        type: 'danger',
        title: 'Delete Category',
        confirmText: 'Delete',
        cancelText: 'Cancel'
    });
    
    if (!confirmed) return;

    const filteredCategories = categories.filter(cat => !sameId(cat.id, id));
    const filteredDocuments = documents.filter(doc => !sameId(doc.categoryId, id));

    localStorage.setItem('docCategories', JSON.stringify(filteredCategories));
    localStorage.setItem('documents', JSON.stringify(filteredDocuments));

    if (sameId(selectedDocCategoryId, id)) {
        selectedDocCategoryId = 'all';
    }

    loadDocumentationAdmin();
    loadClientDocuments();
    
    showPopup('success', translations[currentLang]?.category_deleted || 'Category deleted successfully');
}

async function deleteDocument(id) {
    if (!id) {
        showPopup('error', 'Document ID is missing');
        return;
    }
    
    const documents = getDocuments();
    const docToDelete = documents.find(doc => sameId(doc.id, id));
    
    if (!docToDelete) {
        showPopup('error', 'Document not found');
        return;
    }
    
    const confirmMessage = `Are you sure you want to delete "${docToDelete.title}"? This action cannot be undone.`;
    const confirmed = await showConfirm(confirmMessage, {
        type: 'danger',
        title: 'Delete Document',
        confirmText: 'Delete',
        cancelText: 'Cancel'
    });
    
    if (!confirmed) return;
    
    const filtered = documents.filter(doc => !sameId(doc.id, id));
    localStorage.setItem('documents', JSON.stringify(filtered));
    
    logActivity('edit', `deleted document "${docToDelete.title}"`);
    
    loadDocumentationAdmin();
    loadClientDocuments();
    
    showPopup('success', translations[currentLang]?.document_deleted || 'Document deleted successfully');
}

// Admin Dashboard Functions
function renderAdminDashboardContent() {
    if (!currentUser || currentUser.role !== 'admin') return;
    
    const sidebarName = document.getElementById('adminSidebarName');
    if (sidebarName) {
        sidebarName.textContent = currentUser.name || 'Admin';
    }
    
    const inspections = JSON.parse(localStorage.getItem('inspections') || '[]');
    const certificates = JSON.parse(localStorage.getItem('certificates') || '[]');
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const clients = users.filter(u => u.role === 'client');
    const now = new Date();
    const lastUpdated = document.getElementById('adminLastUpdated');
    if (lastUpdated) {
        lastUpdated.textContent = `Last updated: ${now.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, at ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    // Update stats with real data
    const totalClientsEl = document.getElementById('adminTotalClients');
    if (totalClientsEl) totalClientsEl.textContent = clients.length;
    
    const totalCertificatesEl = document.getElementById('adminTotalCertificates');
    if (totalCertificatesEl) totalCertificatesEl.textContent = certificates.length;
    
    const totalInspectionsEl = document.getElementById('adminTotalInspections');
    if (totalInspectionsEl) totalInspectionsEl.textContent = inspections.length;
    
    const pendingCount = inspections.filter(i => i.status === 'Scheduled' || i.status === 'In Progress').length +
                        users.filter(u => !isApprovedUser(u) && u.role === 'client').length;
    const pendingCountEl = document.getElementById('adminPendingCount');
    if (pendingCountEl) pendingCountEl.textContent = pendingCount;
    
    // Update notification badge
    updateNotificationBadge('admin');
    
    // Load charts
    loadAdminCharts(inspections, certificates);
    
    // Load recent activity (only if element exists)
    const recentActivityElement = document.getElementById('recentActivityList');
    if (recentActivityElement) {
        loadRecentActivity();
    }
    
    // Load activity log - multiple attempts to ensure it loads
    loadActivityLog();
    setTimeout(() => loadActivityLog(), 300);
    setTimeout(() => loadActivityLog(), 600);
    renderAdminAlerts();
    updateAdminUtilization(inspections);
}

function loadAdminDashboard() {
    renderAdminDashboardContent();
}

// Activity Log System
function logActivity(type, action, details = {}) {
    const activities = JSON.parse(localStorage.getItem('activityLog') || '[]');
    const activity = {
        id: Date.now().toString(),
        type: type, // login, download, view, upload, edit
        action: action,
        userId: currentUser?.id || null,
        userName: currentUser?.name || currentUser?.fullName || currentUser?.email || 'Unknown',
        details: details,
        timestamp: new Date().toISOString()
    };
    activities.unshift(activity);
    // Keep only last 100 activities
    if (activities.length > 100) activities.pop();
    localStorage.setItem('activityLog', JSON.stringify(activities));
    
    // Always refresh activity log if dashboard section is active
    const dashboardSection = document.getElementById('adminDashboard');
    if (dashboardSection && dashboardSection.classList.contains('active')) {
        loadActivityLog();
    }
}

function loadActivityLog() {
    const container = document.getElementById('activityList');
    if (!container) {
        // Retry with exponential backoff
        if (!window.activityLogRetryCount) window.activityLogRetryCount = 0;
        if (window.activityLogRetryCount < 10) {
            window.activityLogRetryCount++;
            setTimeout(() => loadActivityLog(), 200);
        }
        return;
    }
    
    // Reset retry count on success
    window.activityLogRetryCount = 0;
    
    const activities = JSON.parse(localStorage.getItem('activityLog') || '[]');
    
    // Always show something, even if empty
    if (activities.length === 0) {
        container.innerHTML = '<div class="activity-empty">No recent activity</div>';
        window.lastActivityCount = 0;
        return;
    }
    
    const icons = {
        login: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>',
        download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
        view: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
        upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
        edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
    };
    
    const html = activities.slice(0, 10).map(activity => {
        const timeAgo = getTimeAgo(activity.timestamp);
        return `
            <div class="activity-item" data-activity-id="${activity.id}">
                <div class="activity-icon ${activity.type}">
                    ${icons[activity.type] || icons.view}
                </div>
                <div class="activity-content">
                    <div class="activity-text"><strong>${activity.userName}</strong> ${activity.action}</div>
                    <div class="activity-time" data-timestamp="${activity.timestamp}">${timeAgo}</div>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
    
    // Store last activity count for comparison
    window.lastActivityCount = activities.length;
    
    // Auto-update time indicators every 30 seconds
    if (!window.activityTimeInterval) {
        window.activityTimeInterval = setInterval(() => {
            const activityList = document.getElementById('activityList');
            if (activityList && activityList.offsetParent !== null) {
                const timeElements = activityList.querySelectorAll('.activity-time[data-timestamp]');
                timeElements.forEach(el => {
                    const timestamp = el.getAttribute('data-timestamp');
                    el.textContent = getTimeAgo(timestamp);
                });
            }
        }, 30000); // Update every 30 seconds
    }
    
    // Auto-refresh activity log every 3 seconds if dashboard is active
    if (!window.activityLogInterval) {
        window.activityLogInterval = setInterval(() => {
            const dashboardSection = document.getElementById('adminDashboard');
            if (dashboardSection && dashboardSection.classList.contains('active')) {
                const currentActivities = JSON.parse(localStorage.getItem('activityLog') || '[]');
                if (currentActivities.length !== (window.lastActivityCount || 0)) {
                    loadActivityLog();
                }
            }
        }, 3000); // Check every 3 seconds
    }
}

function getTimeAgo(timestamp) {
    const now = new Date();
    const then = new Date(timestamp);
    const diff = Math.floor((now - then) / 1000);
    
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
    return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function renderAdminAlerts() {
    const container = document.getElementById('adminAlerts');
    if (!container) return;
    
    const inspections = JSON.parse(localStorage.getItem('inspections') || '[]');
    const certificates = JSON.parse(localStorage.getItem('certificates') || '[]');
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    
    const alerts = [];
    
    // Check for pending approvals
    const pendingUsers = users.filter(u => !isApprovedUser(u) && u.role === 'client');
    if (pendingUsers.length > 0) {
        alerts.push({
            type: 'warning',
            icon: '⚠️',
            title: 'MISSING AUDIT DATA',
            description: `${pendingUsers.length} new user${pendingUsers.length > 1 ? 's' : ''} pending approval.`,
            time: '2h ago'
        });
    }
    
    // Check for expiring certificates
    const expiringCerts = certificates.filter(c => {
        const days = getDaysUntilExpiry(c.expiryDate);
        return days > 0 && days <= 30;
    });
    if (expiringCerts.length > 0) {
        alerts.push({
            type: 'warning',
            icon: '⚠️',
            title: 'CONTRACT SIGNED',
            description: `${expiringCerts.length} certificate${expiringCerts.length > 1 ? 's' : ''} expiring soon.`,
            time: '5h ago'
        });
    }
    
    // Check for pending inspections
    const pending = inspections.filter(i => i.status === 'Scheduled');
    if (pending.length > 0) {
        alerts.push({
            type: 'info',
            icon: 'ℹ️',
            title: 'REVIEW REQUIRED',
            description: `${pending.length} inspection${pending.length > 1 ? 's' : ''} scheduled for review.`,
            time: '1d ago'
        });
    }
    
    if (alerts.length === 0) {
        alerts.push({
            type: 'info',
            icon: 'ℹ️',
            title: 'ALL CLEAR',
            description: 'No alerts at this time.',
            time: 'Just now'
        });
    }
    
    container.innerHTML = alerts.slice(0, 3).map(alert => `
        <div class="alert-item">
            <div class="alert-icon ${alert.type}">${alert.icon}</div>
            <div class="alert-content">
                <div class="alert-title">${alert.title}</div>
                <div class="alert-description">${alert.description}</div>
                <div class="alert-time">${alert.time}</div>
            </div>
        </div>
    `).join('');
}

function updateAdminUtilization(inspections) {
    const consultantEl = document.getElementById('consultantAllocation');
    if (consultantEl) {
        const active = inspections.filter(i => i.status === 'In Progress' || i.status === 'Scheduled').length;
        const total = inspections.length || 10;
        const percentage = Math.min(100, Math.round((active / total) * 100));
        consultantEl.textContent = `${percentage}%`;
        const fill = document.querySelector('.resource-fill');
        if (fill) {
            fill.style.width = `${percentage}%`;
            fill.className = `resource-fill ${percentage > 70 ? 'high' : 'medium'}`;
        }
    }
}

function loadAdminCharts(inspections, certificates) {
    // Inspections Trend Chart
    const trendCtx = document.getElementById('adminInspectionsTrendChart');
    if (!trendCtx) return; // Canvas not found, skip chart creation
    
    if (charts.adminInspectionsTrend) charts.adminInspectionsTrend.destroy();
    
    const last6Months = Array.from({length: 6}, (_, i) => {
        const date = new Date();
        date.setMonth(date.getMonth() - (5 - i));
        return date.toLocaleDateString('en-US', { month: 'short' });
    });
    
    const trendData = last6Months.map(month => {
        return inspections.filter(i => {
            const inspDate = new Date(i.createdAt);
            return inspDate.toLocaleDateString('en-US', { month: 'short' }) === month;
        }).length;
    });
    
    try {
        charts.adminInspectionsTrend = new Chart(trendCtx, {
            type: 'line',
            data: {
                labels: last6Months,
                datasets: [{
                    label: translations[currentLang].inspections,
                    data: trendData,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true
            }
        });
    } catch (error) {
        console.warn('Failed to create trend chart:', error);
    }
    
    // Inspections by Type Chart
    const typeCtx = document.getElementById('adminInspectionsTypeChart');
    if (!typeCtx) return; // Canvas not found, skip chart creation
    
    if (charts.adminInspectionsType) charts.adminInspectionsType.destroy();
    
    const typeData = {};
    inspections.forEach(i => {
        typeData[i.type] = (typeData[i.type] || 0) + 1;
    });
    
    try {
        charts.adminInspectionsType = new Chart(typeCtx, {
            type: 'pie',
            data: {
                labels: Object.keys(typeData),
                datasets: [{
                    data: Object.values(typeData),
                    backgroundColor: ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true
            }
        });
    } catch (error) {
        console.warn('Failed to create type chart:', error);
    }
    
    // Certificates Chart
    const certCtx = document.getElementById('adminCertificatesChart');
    if (!certCtx) return; // Canvas not found, skip chart creation
    
    if (charts.adminCertificates) charts.adminCertificates.destroy();
    
    const certData = {
        Active: certificates.filter(c => c.status === 'Active').length,
        'Expiring Soon': certificates.filter(c => {
            const days = getDaysUntilExpiry(c.expiryDate);
            return days > 0 && days <= 30;
        }).length,
        Expired: certificates.filter(c => c.status === 'Expired').length
    };
    
    try {
        charts.adminCertificates = new Chart(certCtx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(certData),
                datasets: [{
                    data: Object.values(certData),
                    backgroundColor: ['#10b981', '#f59e0b', '#ef4444']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true
            }
        });
    } catch (error) {
        console.warn('Failed to create certificates chart:', error);
    }
    
    // Revenue Chart (simulated)
    const revenueCtx = document.getElementById('adminRevenueChart');
    if (!revenueCtx) return; // Canvas not found, skip chart creation
    
    if (charts.adminRevenue) charts.adminRevenue.destroy();
    
    try {
        charts.adminRevenue = new Chart(revenueCtx, {
            type: 'bar',
            data: {
                labels: last6Months,
                datasets: [{
                label: 'Revenue ($)',
                data: trendData.map(count => count * 1500),
                backgroundColor: '#10b981'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
    } catch (error) {
        console.warn('Failed to create revenue chart:', error);
    }
}

function loadRecentActivity() {
    const container = document.getElementById('recentActivityList');
    if (!container) return; // Element not found, skip
    
    const inspections = JSON.parse(localStorage.getItem('inspections') || '[]');
    const certificates = JSON.parse(localStorage.getItem('certificates') || '[]');
    const notifications = JSON.parse(localStorage.getItem('notifications') || '[]');
    
    const activities = [
        ...inspections.slice(-5).map(i => ({
            type: 'inspection',
            text: `${i.type} - ${i.clientName}`,
            date: i.createdAt,
            status: i.status
        })),
        ...certificates.slice(-5).map(c => ({
            type: 'certificate',
            text: `Certificate ${c.certificateNumber} - ${c.clientName}`,
            date: c.createdAt,
            status: c.status
        }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
    
    if (activities.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>${translations[currentLang].no_recent_activity}</p></div>`;
        return;
    }
    
    container.innerHTML = activities.map(activity => `
        <div class="inspection-card">
            <div class="inspection-card-header">
                <div>
                    <div class="inspection-card-title">${activity.text}</div>
                    <div style="color: var(--text-secondary); font-size: 14px;">${formatDateTime(activity.date)}</div>
                </div>
                <span class="status-badge status-${activity.status.toLowerCase().replace(' ', '-')}">${activity.type}</span>
            </div>
        </div>
    `).join('');
}

function showAdminSection(section) {
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    localStorage.setItem('activeAdminSection', section); // Save active section
    
    const sectionMap = {
        dashboard: 'Dashboard',
        inspections: 'Inspections',
        certificates: 'Certificates',
        clients: 'Clients',
        reports: 'Reports',
        documentation: 'Documentation',
        notifications: 'Notifications',
        settings: 'Settings'
    };
    
    document.getElementById(`admin${sectionMap[section].charAt(0).toUpperCase() + sectionMap[section].slice(1)}`).classList.add('active');
    // Find the corresponding navigation button and activate it
    document.querySelector(`.nav-btn[onclick*='showAdminSection(\\'${section}\\')']`).classList.add('active');
    
    if (section === 'dashboard') {
        renderAdminDashboardContent();
        // Ensure activity log loads after section is active
        setTimeout(() => loadActivityLog(), 300);
        setTimeout(() => loadActivityLog(), 600);
    } else if (section === 'inspections') {
        loadInspectionsTable();
    } else if (section === 'certificates') {
        loadCertificatesTable();
    } else if (section === 'clients') {
        loadClientsTable();
    } else if (section === 'reports') {
        loadReports();
    } else if (section === 'documentation') {
        loadDocumentationAdmin();
    } else if (section === 'notifications') {
        loadNotifications();
    } else if (section === 'settings') {
        loadSettings();
    }
}

// Certificate Management
function loadCertificatesTable() {
    const certificates = JSON.parse(localStorage.getItem('certificates') || '[]');
    const tableBody = document.getElementById('adminCertificatesTable');
    
    if (certificates.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="8" class="empty-state">${translations[currentLang].no_certificates_found}</td></tr>`;
        return;
    }
    
    tableBody.innerHTML = certificates.map(cert => {
        const daysUntilExpiry = getDaysUntilExpiry(cert.expiryDate);
        const status = daysUntilExpiry < 0 ? translations[currentLang].expired_status : (daysUntilExpiry <= 30 ? translations[currentLang].expiring_status : translations[currentLang].active_status);
        
        return `
            <tr>
                <td>${cert.certificateNumber}</td>
                <td>${cert.clientName}</td>
                <td>${cert.type}</td>
                <td>${formatDate(cert.issueDate)}</td>
                <td>${formatDate(cert.expiryDate)}</td>
                <td><span class="status-badge status-${status.toLowerCase().replace(' ', '-')}">${status}</span></td>
                <td>${daysUntilExpiry < 0 ? `${Math.abs(daysUntilExpiry)} ${translations[currentLang].days_ago}` : `${daysUntilExpiry} ${translations[currentLang].days}`}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-success btn-sm" onclick="sendCertificateEmail('${cert.id}')" title="${translations[currentLang].send_email}">${translations[currentLang].send_email}</button>
                        <button class="btn btn-primary btn-sm" onclick="editCertificate('${cert.id}')">${translations[currentLang].edit}</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteCertificate('${cert.id}')">${translations[currentLang].delete}</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function showAddCertificateModal() {
    editingCertificateId = null;
    document.getElementById('certificateModalTitle').textContent = translations[currentLang].new_certificate;
    document.getElementById('certificateForm').reset();
    
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const clients = users.filter(u => u.role === 'client');
    const clientSelect = document.getElementById('certificateClient');
    clientSelect.innerHTML = `<option value="">${translations[currentLang].select_client}</option>` +
        clients.map(c => `<option value="${c.id}">${c.name} (${c.company || c.email})</option>`).join('');
    
    const today = new Date();
    document.getElementById('certificateIssueDate').value = today.toISOString().split('T')[0];
    const expiryDate = new Date(today);
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    document.getElementById('certificateExpiryDate').value = expiryDate.toISOString().split('T')[0];
    
    // Hide certificate number input for new certificates
    document.getElementById('certificateNumber').closest('.form-group').style.display = 'none';
    
    document.getElementById('certificateModal').classList.add('active');
}

function editCertificate(id) {
    editingCertificateId = id;
    const certificates = JSON.parse(localStorage.getItem('certificates') || '[]');
    const cert = certificates.find(c => c.id === id);
    
    if (!cert) return;
    
    document.getElementById('certificateModalTitle').textContent = translations[currentLang].edit_certificate;
    
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const clients = users.filter(u => u.role === 'client');
    const clientSelect = document.getElementById('certificateClient');
    clientSelect.innerHTML = `<option value="">${translations[currentLang].select_client}</option>` +
        clients.map(c => `<option value="${c.id}" ${sameId(c.id, cert.clientId) ? 'selected' : ''}>${c.name} (${c.company || c.email})</option>`).join('');
    
    document.getElementById('certificateNumber').value = cert.certificateNumber;
    document.getElementById('certificateNumber').closest('.form-group').style.display = 'block'; // Show and enable for editing
    document.getElementById('certificateType').value = cert.type;
    document.getElementById('certificateIssueDate').value = cert.issueDate;
    document.getElementById('certificateExpiryDate').value = cert.expiryDate;
    document.getElementById('certificateDescription').value = cert.description || '';
    
    document.getElementById('certificateModal').classList.add('active');
}

async function deleteCertificate(id) {
    if (!(await showConfirm(translations[currentLang].are_you_sure_delete_certificate))) return;
    
    const certificates = JSON.parse(localStorage.getItem('certificates') || '[]');
    const filtered = certificates.filter(c => c.id !== id);
    localStorage.setItem('certificates', JSON.stringify(filtered));
    
    loadCertificatesTable();
    loadAdminDashboard();
}

document.getElementById('certificateForm').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const selectedClient = users.find(u => sameId(u.id, document.getElementById('certificateClient').value));
    
    const expiryDate = new Date(document.getElementById('certificateExpiryDate').value);
    const daysUntilExpiry = getDaysUntilExpiry(document.getElementById('certificateExpiryDate').value);
    const status = daysUntilExpiry < 0 ? 'Expired' : 'Active';
    
    const certificateData = {
        clientId: selectedClient ? selectedClient.id : document.getElementById('certificateClient').value,
        clientName: selectedClient ? selectedClient.name : '',
        clientEmail: selectedClient ? selectedClient.email : '',
        type: document.getElementById('certificateType').value,
        issueDate: document.getElementById('certificateIssueDate').value,
        expiryDate: document.getElementById('certificateExpiryDate').value,
        description: document.getElementById('certificateDescription').value,
        status: status,
        file: editingCertificateId ? (JSON.parse(localStorage.getItem('certificates') || '[]').find(c => c.id === editingCertificateId)?.file || null) : null
    };
    
    const certificates = JSON.parse(localStorage.getItem('certificates') || '[]');
    
    if (editingCertificateId) {
        const index = certificates.findIndex(c => c.id === editingCertificateId);
        if (index !== -1) {
            certificateData.certificateNumber = document.getElementById('certificateNumber').value; // Get from input for existing
            certificates[index] = { ...certificates[index], ...certificateData };
        }
    } else {
        certificateData.certificateNumber = generateCertificateNumber(); // Auto-generate for new
        certificateData.id = 'CERT-' + Date.now(); // Internal ID, can be different from display number
        certificateData.createdAt = new Date().toISOString();
        certificates.push(certificateData);
    }
    
    localStorage.setItem('certificates', JSON.stringify(certificates));
    logActivity('edit', editingCertificateId ? `updated certificate "${certificateData.type}"` : `created new certificate "${certificateData.type}"`);
    closeModal('certificateModal');
    loadCertificatesTable();
    loadAdminDashboard();
    checkCertificateExpiry();
});

function getDaysUntilExpiry(expiryDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);
    return Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
}

// Send Certificate Email to Client
function sendCertificateEmail(certificateId) {
    const certificates = JSON.parse(localStorage.getItem('certificates') || '[]');
    const cert = certificates.find(c => c.id === certificateId);
    
    if (!cert) {
        showPopup('error', translations[currentLang].certificate_not_found);
        return;
    }
    
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const client = users.find(u => sameId(u.id, cert.clientId));
    
    if (!client || !client.email) {
        showPopup('error', translations[currentLang].client_email_not_found);
        return;
    }
    
    const daysUntilExpiry = getDaysUntilExpiry(cert.expiryDate);
    const expiryStatus = daysUntilExpiry < 0 ? 'expired' : (daysUntilExpiry <= 30 ? 'expiring soon' : 'active');
    
    // Get notification templates
    const templates = JSON.parse(localStorage.getItem('notificationTemplates') || '[]');
    let template = templates.find(t => t.type === 'certificate_expiring' || t.type === 'certificate_expired');
    
    if (!template) {
        // Default template
        template = {
            subject: `${translations[currentLang].certificate_details} - ${cert.certificateNumber}`,
            body: `${translations[currentLang].dear} ${client.name},\n\n${translations[currentLang].certificate_details}:\n\n${translations[currentLang].certificate_number}: ${cert.certificateNumber}\n${translations[currentLang].type}: ${cert.type}\n${translations[currentLang].issue_date}: ${formatDate(cert.issueDate)}\n${translations[currentLang].expiry_date}: ${formatDate(cert.expiryDate)}\n${translations[currentLang].status}: ${cert.status}\n${daysUntilExpiry >= 0 ? `${translations[currentLang].days_remaining}: ${daysUntilExpiry}` : `${translations[currentLang].expired_status} ${Math.abs(daysUntilExpiry)} ${translations[currentLang].days_ago}`}\n\n${cert.description ? `${translations[currentLang].description}: ${cert.description}` : ''}\n\n${translations[currentLang].best_regards},\nEYS Global Team`
        };
    } else {
        // Replace template variables
        template.subject = template.subject
            .replace(/{{certificateNumber}}/g, cert.certificateNumber)
            .replace(/{{clientName}}/g, client.name)
            .replace(/{{expiryDate}}/g, formatDate(cert.expiryDate));
        
        template.body = template.body
            .replace(/{{certificateNumber}}/g, cert.certificateNumber)
            .replace(/{{clientName}}/g, client.name)
            .replace(/{{expiryDate}}/g, formatDate(cert.expiryDate))
            .replace(/{{issueDate}}/g, formatDate(cert.issueDate))
            .replace(/{{certificateType}}/g, cert.type)
            .replace(/{{daysRemaining}}/g, daysUntilExpiry >= 0 ? daysUntilExpiry.toString() : 'Expired');
    }
    
    // Create notification and send email
    createNotification({
        type: 'certificate_info',
        recipientId: cert.clientId,
        recipientEmail: client.email,
        subject: template.subject,
        message: template.body,
        data: { certificateId: cert.id, certificateNumber: cert.certificateNumber }
    });
}

function sendInspectionEmail(inspectionId) {
    const inspections = JSON.parse(localStorage.getItem('inspections') || '[]');
    const inspection = inspections.find(i => i.id === inspectionId);

    if (!inspection) {
        showPopup('error', translations[currentLang].inspection_not_found);
        return;
    }

    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const client = users.find(u => sameId(u.id, inspection.clientId));

    if (!client || !client.email) {
        showPopup('error', translations[currentLang].client_email_not_found_inspection);
        return;
    }

    // Get notification templates
    const templates = JSON.parse(localStorage.getItem('notificationTemplates') || '[]');
    let template = templates.find(t => t.type === 'inspection_info');

    if (!template) {
        // Default template for inspections
        template = {
            type: 'inspection_info',
            subject: `${translations[currentLang].inspection_info_subject}`.replace(/{{inspectionType}}/g, inspection.type).replace(/{{clientName}}/g, inspection.clientName),
            body: `${translations[currentLang].inspection_info_body}`.replace(/{{clientName}}/g, client.name).replace(/{{inspectionType}}/g, inspection.type).replace(/{{inspectionLocation}}/g, inspection.location).replace(/{{inspectionDate}}/g, formatDate(inspection.date)).replace(/{{inspectionStatus}}/g, inspection.status).replace(/{{inspectionNotes}}/g, inspection.notes || translations[currentLang].no_notes_provided)
        };
    } else {
        // Replace template variables
        template.subject = template.subject
            .replace(/{{inspectionType}}/g, inspection.type)
            .replace(/{{clientName}}/g, inspection.clientName)
            .replace(/{{inspectionLocation}}/g, inspection.location)
            .replace(/{{inspectionDate}}/g, formatDate(inspection.date))
            .replace(/{{inspectionStatus}}/g, inspection.status);
        
        template.body = template.body
            .replace(/{{inspectionType}}/g, inspection.type)
            .replace(/{{clientName}}/g, inspection.clientName)
            .replace(/{{inspectionLocation}}/g, inspection.location)
            .replace(/{{inspectionDate}}/g, formatDate(inspection.date))
            .replace(/{{inspectionStatus}}/g, inspection.status)
            .replace(/{{inspectionNotes}}/g, inspection.notes || 'No notes provided.');
    }

    // Create notification and send email
    createNotification({
        type: 'inspection_info',
        recipientId: inspection.clientId,
        recipientEmail: client.email,
        subject: template.subject,
        message: template.body,
        data: { inspectionId: inspection.id, inspectionType: inspection.type }
    });
}

function sendReportEmail(inspectionId) {
    const inspections = JSON.parse(localStorage.getItem('inspections') || '[]');
    const inspection = inspections.find(i => i.id === inspectionId);

    if (!inspection) {
        showPopup('error', translations[currentLang].report_not_found);
        return;
    }

    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const client = users.find(u => sameId(u.id, inspection.clientId));

    if (!client || !client.email) {
        showPopup('error', translations[currentLang].client_email_not_found_report);
        return;
    }

    // Get notification templates
    const templates = JSON.parse(localStorage.getItem('notificationTemplates') || '[]');
    let template = templates.find(t => t.type === 'report_info');

    if (!template) {
        // Default template for reports
        template = {
            type: 'report_info',
            subject: `${translations[currentLang].report_info_subject}`.replace(/{{reportType}}/g, inspection.type).replace(/{{clientName}}/g, inspection.clientName),
            body: `${translations[currentLang].report_info_body}`.replace(/{{clientName}}/g, client.name).replace(/{{reportType}}/g, inspection.type).replace(/{{reportLocation}}/g, inspection.location).replace(/{{reportDate}}/g, formatDate(inspection.date)).replace(/{{reportStatus}}/g, inspection.status).replace(/{{reportNotes}}/g, inspection.notes || translations[currentLang].no_notes_provided)
        };
    } else {
        // Replace template variables
        template.subject = template.subject
            .replace(/{{reportType}}/g, inspection.type)
            .replace(/{{clientName}}/g, inspection.clientName)
            .replace(/{{reportLocation}}/g, inspection.location)
            .replace(/{{reportDate}}/g, formatDate(inspection.date))
            .replace(/{{reportStatus}}/g, inspection.status);
        
        template.body = template.body
            .replace(/{{reportType}}/g, inspection.type)
            .replace(/{{clientName}}/g, inspection.clientName)
            .replace(/{{reportLocation}}/g, inspection.location)
            .replace(/{{reportDate}}/g, formatDate(inspection.date))
            .replace(/{{reportStatus}}/g, inspection.status)
            .replace(/{{reportNotes}}/g, inspection.notes || 'No notes provided.');
    }

    // Create notification and send email
    createNotification({
        type: 'report_info',
        recipientId: inspection.clientId,
        recipientEmail: client.email,
        subject: template.subject,
        message: template.body,
        data: { reportId: inspection.id, reportType: inspection.type }
    });
}

function checkCertificateExpiry() {
    const certificates = JSON.parse(localStorage.getItem('certificates') || '[]');
    const settings = JSON.parse(localStorage.getItem('certificateSettings') || '{"notifyDays": 30, "autoReminder": true}');
    
    certificates.forEach(cert => {
        const days = getDaysUntilExpiry(cert.expiryDate);
        const users = JSON.parse(localStorage.getItem('users') || '[]');
    const client = users.find(u => sameId(u.id, cert.clientId));
        
        if (days <= settings.notifyDays && days > 0 && settings.autoReminder) {
            createNotification({
                type: 'certificate_expiring',
                recipientId: cert.clientId,
                recipientEmail: client?.email || '',
                subject: `Certificate Expiring Soon - ${cert.certificateNumber}`,
                message: `Your certificate ${cert.certificateNumber} will expire in ${days} days.`,
                data: { certificateId: cert.id, certificateNumber: cert.certificateNumber }
            });
        } else if (days < 0) {
            createNotification({
                type: 'certificate_expired',
                recipientId: cert.clientId,
                recipientEmail: client?.email || '',
                subject: `Certificate Expired - ${cert.certificateNumber}`,
                message: `Your certificate ${cert.certificateNumber} has expired.`,
                data: { certificateId: cert.id, certificateNumber: cert.certificateNumber }
            });
        }
    });
}

// Continue in next part due to length...
// File Upload Functions
function handleFileUpload(input, type) {
    const files = Array.from(input.files);
    files.forEach(file => {
        if (file.size > 10 * 1024 * 1024) {
            showPopup('error', `File ${file.name} is too large. Maximum size is 10MB.`);
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            if (!uploadedFiles[type]) uploadedFiles[type] = [];
            uploadedFiles[type].push({
                name: file.name,
                size: file.size,
                data: e.target.result,
                type: file.type
            });
            updateFilesList(type);
        };
        reader.readAsDataURL(file);
    });
    input.value = '';
}

function handleCertificateFileUpload(input) {
    handleFileUpload(input, 'certificate');
}

function updateFilesList(type) {
    const containerMap = {
        certificate: 'certificateFileList',
        inspection: 'inspectionFilesList',
        document: 'documentFilesList'
    };
    const container = document.getElementById(containerMap[type]);
    if (!container) return;
    if (!uploadedFiles[type] || uploadedFiles[type].length === 0) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = uploadedFiles[type].map((file, index) => `
        <div class="file-item">
            <div class="file-item-info">
                <span class="file-item-name">${file.name}</span>
                <span class="file-item-size">${formatFileSize(file.size)}</span>
            </div>
            <button type="button" class="file-item-remove" onclick="removeFile('${type}', ${index})">Remove</button>
        </div>
    `).join('');
}

function removeFile(type, index) {
    uploadedFiles[type].splice(index, 1);
    updateFilesList(type);
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// Continue with remaining functions...
// Inspections Management (Enhanced)
function loadInspectionsTable() {
    const inspections = JSON.parse(localStorage.getItem('inspections') || '[]');
    const tableBody = document.getElementById('adminInspectionsTable');
    
    if (inspections.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="8" class="empty-state">${translations[currentLang].no_inspections_found}</td></tr>`;
        return;
    }
    
    tableBody.innerHTML = inspections.map(inspection => `
        <tr>
            <td>${inspection.id}</td>
            <td>${inspection.clientName}</td>
            <td>${inspection.location}</td>
            <td>${inspection.type}</td>
            <td>${formatDate(inspection.date)}</td>
            <td><span class="status-badge status-${inspection.status.toLowerCase().replace(' ', '-')}">${inspection.status}</span></td>
            <td>${inspection.files && inspection.files.length > 0 ? `<span class="file-badge">&#128206; ${inspection.files.length}</span>` : translations[currentLang].no_files}</td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-success btn-sm" onclick="sendInspectionEmail('${inspection.id}')" title="${translations[currentLang].send_email}">${translations[currentLang].send_email}</button>
                    <button class="btn btn-primary btn-sm" onclick="editInspection('${inspection.id}')">${translations[currentLang].edit}</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteInspection('${inspection.id}')">${translations[currentLang].delete}</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function filterInspectionsTable() {
    const search = document.getElementById('inspectionSearch').value.toLowerCase();
    const statusFilter = document.getElementById('inspectionStatusFilter').value;
    const inspections = JSON.parse(localStorage.getItem('inspections') || '[]');
    
    let filtered = inspections.filter(i => {
        const matchesSearch = !search || 
            i.id.toLowerCase().includes(search) ||
            i.clientName.toLowerCase().includes(search) ||
            i.location.toLowerCase().includes(search) ||
            i.type.toLowerCase().includes(search);
        const matchesStatus = !statusFilter || i.status === statusFilter;
        return matchesSearch && matchesStatus;
    });
    
    const tableBody = document.getElementById('adminInspectionsTable');
    if (filtered.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" class="empty-state">No inspections found.</td></tr>';
        return;
    }
    
    tableBody.innerHTML = filtered.map(inspection => `
        <tr>
            <td>${inspection.id}</td>
            <td>${inspection.clientName}</td>
            <td>${inspection.location}</td>
            <td>${inspection.type}</td>
            <td>${formatDate(inspection.date)}</td>
            <td><span class="status-badge status-${inspection.status.toLowerCase().replace(' ', '-')}">${inspection.status}</span></td>
            <td>${inspection.files && inspection.files.length > 0 ? `<span class="file-badge">&#128206; ${inspection.files.length}</span>` : 'No files'}</td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-primary btn-sm" onclick="editInspection('${inspection.id}')">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteInspection('${inspection.id}')">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function showAddInspectionModal() {
    editingInspectionId = null;
    uploadedFiles.inspection = [];
    document.getElementById('inspectionModalTitle').textContent = translations[currentLang].new_inspection;
    document.getElementById('inspectionForm').reset();
    document.getElementById('inspectionFilesList').innerHTML = '';
    
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const clients = users.filter(u => u.role === 'client');
    const clientSelect = document.getElementById('inspectionClient');
    clientSelect.innerHTML = `<option value="">${translations[currentLang].select_client}</option>` +
        clients.map(c => `<option value="${c.id}">${c.name} (${c.company || c.email})</option>`).join('');
    
    document.getElementById('inspectionDate').value = new Date().toISOString().split('T')[0];
    
    document.getElementById('inspectionModal').classList.add('active');
}

function editInspection(id) {
    editingInspectionId = id;
    uploadedFiles.inspection = [];
    const inspections = JSON.parse(localStorage.getItem('inspections') || '[]');
    const inspection = inspections.find(i => i.id === id);
    
    if (!inspection) return;
    
    document.getElementById('inspectionModalTitle').textContent = translations[currentLang].edit_inspection;
    
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const clients = users.filter(u => u.role === 'client');
    const clientSelect = document.getElementById('inspectionClient');
    clientSelect.innerHTML = `<option value="">${translations[currentLang].select_client}</option>` +
        clients.map(c => `<option value="${c.id}" ${sameId(c.id, inspection.clientId) ? 'selected' : ''}>${c.name} (${c.company || c.email})</option>`).join('');
    
    document.getElementById('inspectionLocation').value = inspection.location;
    document.getElementById('inspectionType').value = inspection.type;
    document.getElementById('inspectionDate').value = inspection.date;
    document.getElementById('inspectionStatus').value = inspection.status;
    document.getElementById('inspectionNotes').value = inspection.notes || '';
    
    if (inspection.files && inspection.files.length > 0) {
        uploadedFiles.inspection = inspection.files;
        updateFilesList('inspection');
    }
    
    document.getElementById('inspectionModal').classList.add('active');
}

async function deleteInspection(id) {
    if (!(await showConfirm(translations[currentLang].are_you_sure_delete_inspection))) return;
    
    const inspections = JSON.parse(localStorage.getItem('inspections') || '[]');
    const filtered = inspections.filter(i => i.id !== id);
    localStorage.setItem('inspections', JSON.stringify(filtered));
    
    loadInspectionsTable();
    loadAdminDashboard();
}

document.getElementById('inspectionForm').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const selectedClient = users.find(u => sameId(u.id, document.getElementById('inspectionClient').value));
    
    const inspectionData = {
        clientId: selectedClient ? selectedClient.id : document.getElementById('inspectionClient').value,
        clientName: selectedClient ? selectedClient.name : '',
        clientEmail: selectedClient ? selectedClient.email : '',
        location: document.getElementById('inspectionLocation').value,
        type: document.getElementById('inspectionType').value,
        date: document.getElementById('inspectionDate').value,
        status: document.getElementById('inspectionStatus').value,
        notes: document.getElementById('inspectionNotes').value,
        files: uploadedFiles.inspection || []
    };
    
    const inspections = JSON.parse(localStorage.getItem('inspections') || '[]');
    
    if (editingInspectionId) {
        const index = inspections.findIndex(i => i.id === editingInspectionId);
        if (index !== -1) {
            inspections[index] = { ...inspections[index], ...inspectionData };
        }
    } else {
        inspectionData.id = 'insp' + Date.now();
        inspectionData.createdAt = new Date().toISOString();
        inspections.push(inspectionData);
    }
    
    localStorage.setItem('inspections', JSON.stringify(inspections));
    logActivity('edit', editingInspectionId ? `updated inspection for "${inspectionData.clientName}"` : `scheduled new inspection for "${inspectionData.clientName}"`);
    uploadedFiles.inspection = [];
    closeModal('inspectionModal');
    loadInspectionsTable();
    loadAdminDashboard();
});

// Clients Management
async function loadClientsTable() {
    await refreshUsers();
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const clients = users;
    const admins = users.filter(u => u.role === 'admin');
    const inspections = JSON.parse(localStorage.getItem('inspections') || '[]');
    const certificates = JSON.parse(localStorage.getItem('certificates') || '[]');
    
    const tableBody = document.getElementById('adminClientsTable');
    const adminList = document.getElementById('adminUsersList');
    if (adminList) {
        adminList.innerHTML = admins.length
            ? `<div class="admin-list-title">${translations[currentLang].admins}</div>
               <div class="admin-list-items">${admins.map(a => `<span class="admin-chip">${a.name} (${a.email})</span>`).join('')}</div>`
            : '';
    }
    
    if (clients.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="9" class="empty-state">${translations[currentLang].no_clients_found}</td></tr>`;
        return;
    }
    
    tableBody.innerHTML = clients.map(client => {
        const clientInspections = inspections.filter(i => sameId(i.clientId, client.id));
        const clientCertificates = certificates.filter(c => sameId(c.clientId, client.id));
        const approved = isApprovedUser(client);
        const isAdmin = client.role === 'admin';
        const lastLogin = formatLastLogin(client.last_login);
        return `
            <tr>
                <td>${client.name}</td>
                <td>${client.email}</td>
                <td>${client.company || 'N/A'}</td>
                <td>
                    <span class="status-badge ${isAdmin ? 'status-admin' : 'status-client'}">
                        ${isAdmin ? translations[currentLang].admin_role : translations[currentLang].client}
                    </span>
                </td>
                <td>${lastLogin}</td>
                <td>${clientInspections.length}</td>
                <td>${clientCertificates.length}</td>
                <td>
                    <span class="status-badge ${approved ? 'status-approved' : 'status-pending'}">
                        ${approved ? translations[currentLang].approved : translations[currentLang].pending}
                    </span>
                </td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-primary btn-sm" onclick="editClient('${client.id}')">${translations[currentLang].edit}</button>
                        ${(!approved && !isAdmin) ? `<button class="btn btn-secondary btn-sm" onclick="approveClient('${client.id}')">${translations[currentLang].approve}</button>` : ''}
                        <button class="btn btn-danger btn-sm" onclick="deleteClient('${client.id}')">${translations[currentLang].delete}</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function filterClientsTable() {
    const search = document.getElementById('clientSearch').value.toLowerCase();
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const clients = users;
    
    const filtered = clients.filter(c => {
        return !search ||
            c.name.toLowerCase().includes(search) ||
            c.email.toLowerCase().includes(search) ||
            (c.company && c.company.toLowerCase().includes(search));
    });
    
    const inspections = JSON.parse(localStorage.getItem('inspections') || '[]');
    const certificates = JSON.parse(localStorage.getItem('certificates') || '[]');
    const tableBody = document.getElementById('adminClientsTable');
    
    if (filtered.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="9" class="empty-state">${translations[currentLang].no_clients_found}</td></tr>`;
        return;
    }
    
    tableBody.innerHTML = filtered.map(client => {
        const clientInspections = inspections.filter(i => sameId(i.clientId, client.id));
        const clientCertificates = certificates.filter(c => sameId(c.clientId, client.id));
        const approved = isApprovedUser(client);
        const isAdmin = client.role === 'admin';
        const lastLogin = formatLastLogin(client.last_login);
        return `
            <tr>
                <td>${client.name}</td>
                <td>${client.email}</td>
                <td>${client.company || 'N/A'}</td>
                <td>
                    <span class="status-badge ${isAdmin ? 'status-admin' : 'status-client'}">
                        ${isAdmin ? translations[currentLang].admin_role : translations[currentLang].client}
                    </span>
                </td>
                <td>${lastLogin}</td>
                <td>${clientInspections.length}</td>
                <td>${clientCertificates.length}</td>
                <td>
                    <span class="status-badge ${approved ? 'status-approved' : 'status-pending'}">
                        ${approved ? translations[currentLang].approved : translations[currentLang].pending}
                    </span>
                </td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-primary btn-sm" onclick="editClient('${client.id}')">${translations[currentLang].edit}</button>
                        ${(!approved && !isAdmin) ? `<button class="btn btn-secondary btn-sm" onclick="approveClient('${client.id}')">${translations[currentLang].approve}</button>` : ''}
                        <button class="btn btn-danger btn-sm" onclick="deleteClient('${client.id}')">${translations[currentLang].delete}</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function showAddClientModal() {
    editingClientId = null;
    editingClientApproved = null;
    document.getElementById('clientModalTitle').textContent = translations[currentLang].new_client;
    document.getElementById('clientForm').reset();
    document.getElementById('clientFormApproved').value = '1';
    document.getElementById('clientFormRole').value = 'client';
    const passwordInput = document.getElementById('clientFormPassword');
    passwordInput.required = true;
    passwordInput.placeholder = 'Password';
    document.getElementById('clientModal').classList.add('active');
}

async function editClient(id) {
    editingClientId = id;
    await refreshUsers();
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const client = users.find(u => sameId(u.id, id));
    
    if (!client) return;
    
    document.getElementById('clientModalTitle').textContent = translations[currentLang].edit_client;
    document.getElementById('clientFormName').value = client.name;
    document.getElementById('clientFormEmail').value = client.email;
    document.getElementById('clientFormCompany').value = client.company || '';
    document.getElementById('clientFormPhone').value = client.phone || '';
    document.getElementById('clientFormApproved').value = isApprovedUser(client) ? '1' : '0';
    document.getElementById('clientFormRole').value = client.role || 'client';
    editingClientApproved = isApprovedUser(client);
    const passwordInput = document.getElementById('clientFormPassword');
    passwordInput.value = '';
    passwordInput.required = false;
    passwordInput.placeholder = 'Leave blank to keep current';
    
    document.getElementById('clientModal').classList.add('active');
}

async function deleteClient(id) {
    if (!(await showConfirm(translations[currentLang].are_you_sure_delete_client))) return;

    const usersBeforeDelete = JSON.parse(localStorage.getItem('users') || '[]');
    const userToDelete = usersBeforeDelete.find(u => sameId(u.id, id));
    const deletedEmail = userToDelete ? normalizeText(userToDelete.email) : '';

    try {
        await apiRequest('/data/users.php', { action: 'delete', id });
        await refreshUsers();
    } catch (error) {
        showPopup('error', translations[currentLang].registration_failed);
        return;
    }
    
    const inspections = JSON.parse(localStorage.getItem('inspections') || '[]');
    const filteredInspections = inspections.filter(i => !sameId(i.clientId, id));
    localStorage.setItem('inspections', JSON.stringify(filteredInspections));
    
    const certificates = JSON.parse(localStorage.getItem('certificates') || '[]');
    const filteredCertificates = certificates.filter(c => !sameId(c.clientId, id));
    localStorage.setItem('certificates', JSON.stringify(filteredCertificates));

    const notifications = JSON.parse(localStorage.getItem('notifications') || '[]');
    const filteredNotifications = notifications.filter(n => {
        if (sameId(n.recipientId, id)) return false;
        if (deletedEmail && normalizeText(n.recipientEmail) === deletedEmail) return false;
        return true;
    });
    localStorage.setItem('notifications', JSON.stringify(filteredNotifications));

    const documents = JSON.parse(localStorage.getItem('documents') || '[]');
    const filteredDocuments = documents.map(doc => {
        if (!Array.isArray(doc.allowedClientIds)) return doc;
        const remaining = doc.allowedClientIds.filter(clientId => {
            if (sameId(clientId, id)) return false;
            if (deletedEmail && normalizeText(clientId) === deletedEmail) return false;
            return true;
        });
        return { ...doc, allowedClientIds: remaining };
    }).filter(doc => {
        if (!Array.isArray(doc.allowedClientIds)) return true;
        return doc.allowedClientIds.length > 0;
    });
    localStorage.setItem('documents', JSON.stringify(filteredDocuments));

    if (currentUser && sameId(currentUser.id, id)) {
        logout();
    }
    
    loadClientsTable();
    loadAdminDashboard();
    loadDocumentationAdmin();
}

document.getElementById('clientForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const clientData = {
        name: document.getElementById('clientFormName').value,
        email: document.getElementById('clientFormEmail').value,
        company: document.getElementById('clientFormCompany').value,
        phone: document.getElementById('clientFormPhone').value,
        password: document.getElementById('clientFormPassword').value,
        role: document.getElementById('clientFormRole').value || 'client',
        approved: document.getElementById('clientFormApproved').value === '1'
    };
    
    try {
        let createdUser = null;
        let approvedUser = null;
        if (editingClientId) {
            await apiRequest('/data/users.php', { action: 'update', id: editingClientId, ...clientData });
            if (editingClientApproved === false && clientData.approved === true) {
                approvedUser = { id: editingClientId, name: clientData.name, email: clientData.email };
            }
        } else {
            const result = await apiRequest('/data/users.php', { action: 'create', ...clientData });
            createdUser = result.user;
        }
        await refreshUsers();
        closeModal('clientModal');
        loadClientsTable();

        if (createdUser && createdUser.email) {
            ensureWelcomeTemplate();
            const welcomePayload = buildWelcomeEmailPayload(createdUser);
            sendEmailNotification({
                type: 'welcome_client',
                recipientId: createdUser.id,
                recipientEmail: createdUser.email,
                subject: welcomePayload.subject,
                message: welcomePayload.message
            });
        } else if (approvedUser) {
            ensureWelcomeTemplate();
            const welcomePayload = buildWelcomeEmailPayload(approvedUser);
            sendEmailNotification({
                type: 'welcome_client',
                recipientId: approvedUser.id,
                recipientEmail: approvedUser.email,
                subject: welcomePayload.subject,
                message: welcomePayload.message
            });
        }
    } catch (error) {
        showPopup('error', translations[currentLang].registration_failed);
    }
});

async function approveClient(id) {
    try {
        await refreshUsers();
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        const client = users.find(u => sameId(u.id, id));
        if (!client || client.role === 'admin') return;
        await apiRequest('/data/users.php', { action: 'update', id, approved: true });
        await refreshUsers();
        loadClientsTable();
        ensureWelcomeTemplate();
        const welcomePayload = buildWelcomeEmailPayload(client);
        sendEmailNotification({
            type: 'welcome_client',
            recipientId: client.id,
            recipientEmail: client.email,
            subject: welcomePayload.subject,
            message: welcomePayload.message
        });
    } catch (error) {
        showPopup('error', translations[currentLang].registration_failed);
    }
}

document.getElementById('categoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('categoryName').value.trim();
    if (!name) {
        showPopup('error', translations[currentLang]?.missing_fields || 'Please enter a category name');
        return;
    }

    // Show confirmation popup
    const confirmed = await showConfirm(
        `Are you sure you want to create category "${name}"?`,
        {
            type: 'info',
            title: 'Create Category',
            confirmText: 'Create',
            cancelText: 'Cancel'
        }
    );
    
    if (!confirmed) return;

    const categories = getDocCategories();
    categories.push({
        id: 'cat' + Date.now(),
        name,
        createdAt: new Date().toISOString()
    });
    localStorage.setItem('docCategories', JSON.stringify(categories));
    closeModal('categoryModal');
    loadDocumentationAdmin();
    loadClientDocuments();
    
    showPopup('success', translations[currentLang]?.category_created || 'Category created successfully');
});

// Document Form Submit Handler
const documentForm = document.getElementById('documentForm');
if (documentForm) {
    documentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const categoryId = document.getElementById('documentCategory')?.value;
        const categorySelect = document.getElementById('documentCategory');

        if (!categoryId || !categorySelect) {
            showPopup('error', translations[currentLang]?.missing_fields || 'Please select a category');
            return;
        }
        
        // Allow document upload even if "all" is selected - assign to selected category
        const clientId = selectedDocClientId === 'all' ? null : selectedDocClientId;
        
        if (!uploadedFiles.document || uploadedFiles.document.length === 0) {
            showPopup('error', translations[currentLang]?.please_upload_file || 'Please upload a file');
            return;
        }

        const fileName = uploadedFiles.document[0]?.name || 'Untitled Document';
        const categories = getDocCategories();
        const categoryName = categories.find(c => sameId(c.id, categoryId))?.name || 'Unknown';
        
        // Show confirmation popup
        const confirmed = await showConfirm(
            `Are you sure you want to upload "${fileName}" to category "${categoryName}"?`,
            {
                type: 'info',
                title: 'Upload Document',
                confirmText: 'Upload',
                cancelText: 'Cancel'
            }
        );
        
        if (!confirmed) return;

        const documents = getDocuments();
        const newDoc = {
            id: 'doc' + Date.now(),
            categoryId,
            title: fileName,
            allowedClientIds: clientId ? [clientId] : ['all'],
            files: uploadedFiles.document || [],
            createdAt: new Date().toISOString()
        };
        
        documents.push(newDoc);
        localStorage.setItem('documents', JSON.stringify(documents));
        
        logActivity('upload', `uploaded document "${newDoc.title}"`);
        
        uploadedFiles.document = [];
        updateFilesList('document');
        closeModal('documentModal');
        loadDocumentationAdmin();
        loadClientDocuments();
        
        showPopup('success', translations[currentLang]?.document_saved || 'Document saved successfully');
    });
}

// Reports
function loadReports() {
    const inspections = JSON.parse(localStorage.getItem('inspections') || '[]');
    const reportsGrid = document.getElementById('reportsGrid');
    
    if (inspections.length === 0) {
        reportsGrid.innerHTML = `<div class="empty-state"><p>${translations[currentLang].no_inspection_reports_available}</p></div>`;
        return;
    }
    
    reportsGrid.innerHTML = inspections.map(inspection => `
        <div class="report-card">
            <h4>${inspection.type}</h4>
            <p style="color: var(--text-secondary); margin: 8px 0;">${inspection.location}</p>
            <p style="font-size: 14px; margin: 4px 0;">${translations[currentLang].client}: ${inspection.clientName}</p>
            <p style="font-size: 14px; margin: 4px 0;">${translations[currentLang].date}: ${formatDate(inspection.date)}</p>
            ${inspection.files && inspection.files.length > 0 ? `<p style="font-size: 14px; margin: 4px 0;">&#128206; ${inspection.files.length} ${translations[currentLang].files}</p>` : ''}
            <span class="status-badge status-${inspection.status.toLowerCase().replace(' ', '-')}" style="display: inline-block; margin-top: 12px;">${inspection.status}</span>
            <div class="report-actions" style="margin-top: 15px;">
                <button class="btn btn-secondary btn-sm" onclick="viewInspectionDetail('${inspection.id}')">${translations[currentLang].view_details}</button>
                <button class="btn btn-success btn-sm" onclick="sendReportEmail('${inspection.id}')" title="${translations[currentLang].send_report_email}">${translations[currentLang].send_email}</button>
            </div>
        </div>
    `).join('');
}

// View Inspection Detail
function viewInspectionDetail(id) {
    const inspections = JSON.parse(localStorage.getItem('inspections') || '[]');
    const inspection = inspections.find(i => i.id === id);
    
    if (!inspection) return;
    
    const content = document.getElementById('inspectionDetailContent');
    content.innerHTML = `
        <div style="margin-bottom: 20px;">
            <h4 style="margin-bottom: 8px;">${translations[currentLang].inspection_type}</h4>
            <p style="font-size: 18px; color: var(--primary-color);">${inspection.type}</p>
        </div>
        <div style="margin-bottom: 20px;">
            <h4 style="margin-bottom: 8px;">${translations[currentLang].location}</h4>
            <p>${inspection.location}</p>
        </div>
        <div style="margin-bottom: 20px;">
            <h4 style="margin-bottom: 8px;">${translations[currentLang].client}</h4>
            <p>${inspection.clientName}</p>
        </div>
        <div style="margin-bottom: 20px;">
            <h4 style="margin-bottom: 8px;">${translations[currentLang].date}</h4>
            <p>${formatDate(inspection.date)}</p>
        </div>
        <div style="margin-bottom: 20px;">
            <h4 style="margin-bottom: 8px;">${translations[currentLang].status}</h4>
            <span class="status-badge status-${inspection.status.toLowerCase().replace(' ', '-')}">${inspection.status}</span>
        </div>
        ${inspection.files && inspection.files.length > 0 ? `
        <div style="margin-bottom: 20px;">
            <h4 style="margin-bottom: 8px;">${translations[currentLang].files}</h4>
            ${inspection.files.map(file => `
                <div class="file-item">
                    <div class="file-item-info">
                        <span class="file-item-name">${file.name}</span>
                        <span class="file-item-size">${formatFileSize(file.size)}</span>
                    </div>
                    <button class="btn btn-primary btn-sm" onclick="downloadFile('${file.name}', '${file.data}')">${translations[currentLang].download}</button>
                </div>
            `).join('')}
        </div>
        ` : ''}
        <div style="margin-bottom: 20px;">
            <h4 style="margin-bottom: 8px;">${translations[currentLang].notes}</h4>
            <p style="white-space: pre-wrap; background: var(--bg-color); padding: 16px; border-radius: 8px;">${inspection.notes || translations[currentLang].no_notes_available}</p>
        </div>
    `;
    
    document.getElementById('inspectionDetailModal').classList.add('active');
}

function downloadFile(name, data) {
    const link = document.createElement('a');
    link.href = data;
    link.download = name;
    link.click();
    logActivity('download', `downloaded "${name}"`);
}

function viewCertificateDetail(id) {
    const certificates = JSON.parse(localStorage.getItem('certificates') || '[]');
    const cert = certificates.find(c => c.id === id);
    
    if (!cert) return;
    
    logActivity('view', `viewed certificate "${cert.certificateNumber}"`);
    const daysUntilExpiry = getDaysUntilExpiry(cert.expiryDate);
    showPopup('info', `${translations[currentLang].certificate_details}:\n\n${translations[currentLang].number}: ${cert.certificateNumber}\n${translations[currentLang].type}: ${cert.type}\n${translations[currentLang].client}: ${cert.clientName}\n${translations[currentLang].issue_date}: ${formatDate(cert.issueDate)}\n${translations[currentLang].expiry_date}: ${formatDate(cert.expiryDate)}\n${translations[currentLang].days_remaining}: ${daysUntilExpiry < 0 ? translations[currentLang].expired_status : daysUntilExpiry}`);
}

// Notifications
function createNotification(notification) {
    const notifications = JSON.parse(localStorage.getItem('notifications') || '[]');
    notification.id = 'notif' + Date.now();
    notification.createdAt = new Date().toISOString();
    notification.read = false;
    notifications.push(notification);
    localStorage.setItem('notifications', JSON.stringify(notifications));
    
    // Only send email if an admin is currently logged in
    if (currentUser && currentUser.role === 'admin') {
    sendEmailNotification(notification);
    }
    
    updateNotificationBadge(currentUser ? currentUser.role : null);
}

function sendEmailNotification(notification) {
    const options = notification.__options || {};
    const smtpSettings = JSON.parse(localStorage.getItem('smtpSettings') || '{}');
    const fallbackApiUrl = `${window.location.origin}/api/send-email.php`;
    
        // Method 1: EmailJS usage (frontend only - free)
    if (smtpSettings.emailjsPublicKey && smtpSettings.emailjsServiceId && smtpSettings.emailjsTemplateId) {
        try {
            // EmailJS initialize (sadece bir kez)
            if (typeof emailjs !== 'undefined' && !window.emailjsInitialized) {
                emailjs.init(smtpSettings.emailjsPublicKey);
                window.emailjsInitialized = true;
            }
            
            if (typeof emailjs !== 'undefined') {
                emailjs.send(
                    smtpSettings.emailjsServiceId,
                    smtpSettings.emailjsTemplateId,
                    {
                        to_email: notification.recipientEmail,
                        subject: notification.subject,
                        message: notification.message,
                        from_name: 'EYS Global'
                    }
                ).then(() => {
                    console.log('Email sent successfully via EmailJS');
                    if (!options.silent) {
                        showPopup('success', translations[currentLang].email_sent_successfully);
                    }
                }).catch((error) => {
                    console.error('EmailJS Error:', error);
                    // Fallback to backend API
                    sendEmailViaBackend(notification, options);
                });
                return;
            }
        } catch (error) {
            console.error('EmailJS initialization error:', error);
        }
    }
    
    // Method 2: Backend API usage (recommended - production)
    if (smtpSettings.backendApiUrl || fallbackApiUrl) {
        sendEmailViaBackend(notification, options);
        return;
    }
    
    // Method 3: Simulation (demo mode)
    console.log('Email would be sent (simulation mode):', {
        to: notification.recipientEmail,
        subject: notification.subject,
        body: notification.message,
        note: 'Configure EmailJS or Backend API to send real emails'
    });
}

function sendEmailViaBackend(notification, options = {}) {
    const smtpSettings = JSON.parse(localStorage.getItem('smtpSettings') || '{}');
    const fallbackApiUrl = `${window.location.origin}/api/send-email.php`;
    const apiUrl = smtpSettings.backendApiUrl || fallbackApiUrl;
    const token = localStorage.getItem('authToken') || '';
    
    if (!apiUrl) {
        console.log('Backend API URL not configured');
        if (!options.silent) {
            showPopup('error', translations[currentLang].backend_api_url_not_configured);
        }
        return;
    }
    
    // Send email request to Backend API
    fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
            to: notification.recipientEmail,
            subject: notification.subject,
            body: notification.message
        })
    }).then(async response => {
        const contentType = response.headers.get('content-type');
        let data;
        
        if (contentType && contentType.includes('application/json')) {
            try {
                data = await response.json();
            } catch (e) {
                const text = await response.text();
                throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
            }
        } else {
            const text = await response.text();
            throw new Error(`Server error (${response.status}): ${text.substring(0, 200)}`);
        }
        
        if (response.ok) {
            console.log('Email sent successfully via Backend API:', data);
            return data;
        } else {
            const detail = data.detail ? `: ${data.detail}` : '';
            throw new Error((data.message || 'Backend API error') + detail);
        }
    }).then(data => {
        // Success
        console.log('Email sent:', data.messageId);
        if (!options.silent) {
            showPopup('success', translations[currentLang]?.email_sent_successfully || 'Email sent successfully');
        }
    }).catch(error => {
        console.error('Backend API request failed:', error);
        if (!options.silent) {
            let errorMessage = error.message || 'Failed to send email';
            if (errorMessage.includes('smtp_error') || errorMessage.includes('SMTP')) {
                errorMessage = 'SMTP configuration error. Please check your email settings.';
            } else if (errorMessage.includes('smtp_not_configured')) {
                errorMessage = 'SMTP is not configured. Please configure email settings.';
            } else if (errorMessage.includes('500') || errorMessage.includes('Server error')) {
                errorMessage = 'Server error occurred. Please try again later or contact support.';
            }
            showPopup('error', errorMessage);
        }
    });
}

function updateNotificationBadge(role) {
    const notifications = JSON.parse(localStorage.getItem('notifications') || '[]');
    const userNotifications = notifications.filter(n =>
        matchesRecipient(n, currentUser) && !n.read
    );
    
    const badgeId = role === 'admin' ? 'adminNotificationBadge' : 'clientNotificationBadge';
    const badge = document.getElementById(badgeId);
    
    if (userNotifications.length > 0) {
        badge.style.display = 'flex';
        badge.textContent = userNotifications.length;
    } else {
        badge.style.display = 'none';
        badge.textContent = '';
    }
}

function showNotifications(role) {
    const notifications = JSON.parse(localStorage.getItem('notifications') || '[]');
    const userNotifications = notifications.filter(n => matchesRecipient(n, currentUser))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    const panel = document.getElementById('notificationsPanel');
    const overlay = document.getElementById('notificationsPanelOverlay');
    const body = document.getElementById('notificationsPanelBody');
    
    if (userNotifications.length === 0) {
        body.innerHTML = '<div class="empty-state"><p>No notifications</p></div>';
    } else {
        body.innerHTML = userNotifications.map(notif => `
            <div class="notification-item ${notif.read ? '' : 'unread'}" onclick="markNotificationRead('${notif.id}')">
                <div style="font-weight: 600; margin-bottom: 4px;">${notif.subject}</div>
                <div style="font-size: 14px; color: var(--text-secondary);">${notif.message}</div>
                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 8px;">${formatDateTime(notif.createdAt)}</div>
            </div>
        `).join('');
    }

    if (userNotifications.length > 0) {
        userNotifications.forEach(notif => { notif.read = true; });
        localStorage.setItem('notifications', JSON.stringify(notifications));
        updateNotificationBadge(role);
    }
    
    panel.classList.add('active');
    if (overlay) overlay.classList.add('active');
}

function closeNotificationsPanel() {
    document.getElementById('notificationsPanel').classList.remove('active');
    const overlay = document.getElementById('notificationsPanelOverlay');
    if (overlay) overlay.classList.remove('active');
}

function markNotificationRead(id) {
    const notifications = JSON.parse(localStorage.getItem('notifications') || '[]');
    const notif = notifications.find(n => n.id === id);
    if (notif) {
        notif.read = true;
        localStorage.setItem('notifications', JSON.stringify(notifications));
        updateNotificationBadge(currentUser.role);
        showNotifications(currentUser.role);
    }
}

function loadNotifications() {
    const templates = JSON.parse(localStorage.getItem('notificationTemplates') || '[]');
    const history = JSON.parse(localStorage.getItem('notifications') || '[]');
    
    const templatesList = document.getElementById('notificationTemplatesList');
    if (templatesList) {
        templatesList.innerHTML = templates.map(template => `
            <div class="template-item">
                <div class="template-item-header">
                    <span class="template-name">${template.subject}</span>
                    <span class="template-type">${template.type.replace('_', ' ').toUpperCase()}</span>
                </div>
                <div class="template-description">${template.body.substring(0, 100)}...</div>
                <div class="template-actions">
                    <button class="btn btn-sm btn-secondary" onclick="editNotificationTemplate('${template.type}')">✏️ Edit</button>
                </div>
            </div>
        `).join('') || '<div class="empty-state"><p>No templates found. Create one to get started.</p></div>';
    }
    
    const historyList = document.getElementById('notificationHistoryList');
    if (historyList) {
        const recentHistory = history.slice(-20).reverse();
        historyList.innerHTML = recentHistory.map(notif => {
            const status = notif.sent ? 'sent' : (notif.failed ? 'failed' : 'pending');
            const timeAgo = getTimeAgo(notif.createdAt);
            return `
                <div class="history-item">
                    <div class="history-item-header">
                        <span class="history-subject">${notif.subject || notif.title}</span>
                        <span class="history-status ${status}">${status.toUpperCase()}</span>
                    </div>
                    <div class="history-preview">To: ${notif.recipientEmail || notif.recipientName || 'Unknown'}</div>
                    <div class="history-meta">
                        <span class="history-time">⏱️ ${timeAgo}</span>
                    </div>
                </div>
            `;
        }).join('') || '<div class="empty-state"><p>No notification history yet.</p></div>';
    }
}

function getTimeAgo(dateString) {
    if (!dateString) return 'Just now';
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return formatDateTime(dateString);
}

function showNotificationSettingsModal() {
    document.getElementById('notificationSettingsModal').classList.add('active');
}

let editingTemplateType = null;

function showNotificationTemplateModal() {
    editingTemplateType = null;
    document.getElementById('notificationTemplateModalTitle').textContent = 'New Notification Template';
    document.getElementById('notificationTemplateForm').reset();
    document.getElementById('notificationTemplateType').value = '';
    document.getElementById('notificationTemplateType').disabled = false; // Enable type for new template
    document.getElementById('notificationTemplateSubject').value = '';
    document.getElementById('notificationTemplateBody').value = '';
    document.getElementById('notificationTemplateModal').classList.add('active');
}

function editNotificationTemplate(type) {
    editingTemplateType = type;
    const templates = JSON.parse(localStorage.getItem('notificationTemplates') || '[]');
    const template = templates.find(t => t.type === type);

    if (!template) {
        showPopup('error', 'Template not found!');
        return;
    }

    document.getElementById('notificationTemplateModalTitle').textContent = 'Edit Notification Template';
    document.getElementById('notificationTemplateType').value = template.type;
    document.getElementById('notificationTemplateType').disabled = true; // Disable type editing for existing templates
    document.getElementById('notificationTemplateSubject').value = template.subject;
    document.getElementById('notificationTemplateBody').value = template.body;
    document.getElementById('notificationTemplateModal').classList.add('active');
}

document.getElementById('notificationTemplateForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const templates = JSON.parse(localStorage.getItem('notificationTemplates') || '[]');
    const type = document.getElementById('notificationTemplateType').value;
    const subject = document.getElementById('notificationTemplateSubject').value;
    const body = document.getElementById('notificationTemplateBody').value;
    
    if (editingTemplateType) {
        // Editing existing template
        const index = templates.findIndex(t => t.type === editingTemplateType);
    if (index !== -1) {
            templates[index] = { ...templates[index], subject, body };
        }
    } else {
        // Adding new template
        templates.push({ type, subject, body });
    }
    
    localStorage.setItem('notificationTemplates', JSON.stringify(templates));
    closeModal('notificationTemplateModal'); // Close the new template modal
    loadNotifications();
});

function filterCertificatesTable() {
    const search = document.getElementById('certificateSearch').value.toLowerCase();
    const statusFilter = document.getElementById('certificateStatusFilter').value;
    const certificates = JSON.parse(localStorage.getItem('certificates') || '[]');
    
    let filtered = certificates.filter(c => {
        const days = getDaysUntilExpiry(c.expiryDate);
        const status = days < 0 ? 'Expired' : (days <= 30 ? 'Expiring Soon' : 'Active');
        
        const matchesSearch = !search ||
            c.certificateNumber.toLowerCase().includes(search) ||
            c.clientName.toLowerCase().includes(search) ||
            c.type.toLowerCase().includes(search);
        const matchesStatus = !statusFilter || status === statusFilter;
        return matchesSearch && matchesStatus;
    });
    
    const tableBody = document.getElementById('adminCertificatesTable');
    if (filtered.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" class="empty-state">No certificates found.</td></tr>';
        return;
    }
    
    tableBody.innerHTML = filtered.map(cert => {
        const daysUntilExpiry = getDaysUntilExpiry(cert.expiryDate);
        const status = daysUntilExpiry < 0 ? 'Expired' : (daysUntilExpiry <= 30 ? 'Expiring Soon' : 'Active');
        
        return `
            <tr>
                <td>${cert.certificateNumber}</td>
                <td>${cert.clientName}</td>
                <td>${cert.type}</td>
                <td>${formatDate(cert.issueDate)}</td>
                <td>${formatDate(cert.expiryDate)}</td>
                <td><span class="status-badge status-${status.toLowerCase().replace(' ', '-')}">${status}</span></td>
                <td>${daysUntilExpiry < 0 ? `${Math.abs(daysUntilExpiry)} days ago` : `${daysUntilExpiry} days`}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-success btn-sm" onclick="sendCertificateEmail('${cert.id}')" title="Send Email to Client">Email</button>
                        <button class="btn btn-primary btn-sm" onclick="editCertificate('${cert.id}')">Edit</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteCertificate('${cert.id}')">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Settings
function loadSettings() {
    const smtpSettings = JSON.parse(localStorage.getItem('smtpSettings') || '{}');
    const certSettings = JSON.parse(localStorage.getItem('certificateSettings') || '{}');
    
    // Backend API
    document.getElementById('backendApiUrl').value = smtpSettings.backendApiUrl || '';
    
    // EmailJS
    document.getElementById('emailjsPublicKey').value = smtpSettings.emailjsPublicKey || '';
    document.getElementById('emailjsServiceId').value = smtpSettings.emailjsServiceId || '';
    document.getElementById('emailjsTemplateId').value = smtpSettings.emailjsTemplateId || '';
    
    // SMTP (for backend)
    document.getElementById('smtpServer').value = smtpSettings.server || '';
    document.getElementById('smtpPort').value = smtpSettings.port || 587;
    document.getElementById('smtpEmail').value = smtpSettings.email || '';
    document.getElementById('smtpPassword').value = smtpSettings.password || '';
    document.getElementById('smtpSecurity').value = smtpSettings.security || 'tls';
    
    document.getElementById('certificateNotifyDays').value = certSettings.notifyDays || 30;
    document.getElementById('certificateAutoReminder').checked = certSettings.autoReminder !== false;
}

// Backend API Form
document.getElementById('backendApiForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const smtpSettings = JSON.parse(localStorage.getItem('smtpSettings') || '{}');
    smtpSettings.backendApiUrl = document.getElementById('backendApiUrl').value;
    localStorage.setItem('smtpSettings', JSON.stringify(smtpSettings));
    showPopup('success', 'Backend API URL saved!');
});

// EmailJS Form
document.getElementById('emailjsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const smtpSettings = JSON.parse(localStorage.getItem('smtpSettings') || '{}');
    smtpSettings.emailjsPublicKey = document.getElementById('emailjsPublicKey').value;
    smtpSettings.emailjsServiceId = document.getElementById('emailjsServiceId').value;
    smtpSettings.emailjsTemplateId = document.getElementById('emailjsTemplateId').value;
    localStorage.setItem('smtpSettings', JSON.stringify(smtpSettings));
    showPopup('success', 'EmailJS settings saved!');
});

// SMTP Settings Form (for backend API)
document.getElementById('smtpSettingsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const smtpSettings = JSON.parse(localStorage.getItem('smtpSettings') || '{}');
    smtpSettings.server = document.getElementById('smtpServer').value;
    smtpSettings.port = parseInt(document.getElementById('smtpPort').value);
    smtpSettings.email = document.getElementById('smtpEmail').value;
    smtpSettings.password = document.getElementById('smtpPassword').value;
    smtpSettings.security = document.getElementById('smtpSecurity').value;
    localStorage.setItem('smtpSettings', JSON.stringify(smtpSettings));
    showPopup('success', 'SMTP settings saved! (These will be sent to your backend API)');
});

document.getElementById('certificateSettingsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const settings = {
        notifyDays: parseInt(document.getElementById('certificateNotifyDays').value),
        autoReminder: document.getElementById('certificateAutoReminder').checked
    };
    localStorage.setItem('certificateSettings', JSON.stringify(settings));
    showPopup('success', 'Certificate settings saved!');
    checkCertificateExpiry();
});

function testSMTPSettings() {
    const settings = JSON.parse(localStorage.getItem('smtpSettings') || '{}');
    if (!settings.server || !settings.email) {
        showPopup('error', 'Please fill in SMTP settings first.');
        return;
    }
    
    // Simulate test - in real app, this would test the connection
    showPopup('info', 'SMTP connection test (simulated). In production, this would test your SMTP server connection.');
}

// Modal Functions
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    editingInspectionId = null;
    editingClientId = null;
    editingCertificateId = null;
    uploadedFiles = {};
}

document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
});

// Utility Functions
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatCurrencyUSD(value) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function generateCertificateNumber() {
    const currentYear = new Date().getFullYear();
    const shortYear = currentYear.toString().slice(-2);
    const storageKey = `certificateSequence_${shortYear}`;
    
    let sequence = parseInt(localStorage.getItem(storageKey) || '0');
    sequence++;
    localStorage.setItem(storageKey, sequence.toString());
    
    return `EYS-CERT-${shortYear}${String(sequence).padStart(3, '0')}`;
}


// Make functions globally available
window.logout = logout;
window.showClientSection = showClientSection;
window.showAdminSection = showAdminSection;
window.showAddInspectionModal = showAddInspectionModal;
window.editInspection = editInspection;
window.deleteInspection = deleteInspection;
window.showAddCertificateModal = showAddCertificateModal;
window.editCertificate = editCertificate;
window.deleteCertificate = deleteCertificate;
window.sendCertificateEmail = sendCertificateEmail;
window.sendInspectionEmail = sendInspectionEmail;
window.sendReportEmail = sendReportEmail;
window.showAddClientModal = showAddClientModal;
window.editClient = editClient;
window.deleteClient = deleteClient;
window.viewInspectionDetail = viewInspectionDetail;
window.viewCertificateDetail = viewCertificateDetail;
window.closeModal = closeModal;
window.filterClientInspections = filterClientInspections;
window.filterInspectionsTable = filterInspectionsTable;
window.filterClientsTable = filterClientsTable;
window.filterCertificatesTable = filterCertificatesTable;
window.handleFileUpload = handleFileUpload;
window.handleCertificateFileUpload = handleCertificateFileUpload;
window.removeFile = removeFile;
window.downloadFile = downloadFile;
window.showNotifications = showNotifications;
window.closeNotificationsPanel = closeNotificationsPanel;
window.markNotificationRead = markNotificationRead;
window.showNotificationSettingsModal = showNotificationSettingsModal;
window.showNotificationTemplateModal = showNotificationTemplateModal;
window.editNotificationTemplate = editNotificationTemplate;
window.testSMTPSettings = testSMTPSettings;
window.renderAdminDashboardContent = renderAdminDashboardContent;
window.loadAdminDashboard = loadAdminDashboard;
window.showCategoryModal = showCategoryModal;
window.showDocumentModal = showDocumentModal;
window.selectDocCategory = selectDocCategory;
window.selectDocClient = selectDocClient;
window.deleteDocCategory = deleteDocCategory;
window.deleteDocument = deleteDocument;
window.toggleDocCategory = toggleDocCategory;
window.logActivity = logActivity;
window.loadActivityLog = loadActivityLog;

// Initialize App
async function initializeApp() {
initializeDemoData();
    if (USE_BACKEND_AUTH) {
        const demoBlock = document.querySelector('.demo-credentials');
        if (demoBlock) {
            demoBlock.classList.add('auth-hidden');
        }
    }
    setLanguage(currentLang); // Apply initial language on page load

if (!checkAuth()) {
    showScreen('loginScreen');
    } else if (USE_BACKEND_DATA) {
        await syncFromBackend();
    }
}

initializeApp();

// Add event listeners to language flags
document.querySelectorAll('.language-selector img').forEach(flag => {
    flag.addEventListener('click', (event) => {
        const lang = event.target.getAttribute('data-lang');
        setLanguage(lang);
    });
});

