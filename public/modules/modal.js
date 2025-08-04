// modules/modal.js

// Modal handling functions
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) {
        console.error(`Modal with id ${modalId} not found`);
        return;
    }

    // Close all other modals first
    document.querySelectorAll('.modal-backdrop').forEach(otherModal => {
        if (otherModal.id !== modalId) {
            otherModal.style.display = 'none';
        }
    });

    // Show the modal
    modal.style.display = 'flex';

    // Add event listeners
    const closeBtn = modal.querySelector('.modal-close, .close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => closeModal(modalId));
    }

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal(modalId);
        }
    });

    // Initialize tabs if they exist in this modal
    const tabsContainer = modal.querySelector('.tabs');
    if (tabsContainer) {
        initModalTabs(modal);
    }

    // Prevent scrolling on the body
    document.body.style.overflow = 'hidden';
}

function closeModal(modalId, silent = false) {
    const modal = document.getElementById(modalId);
    if (!modal) {
        if (!silent) {
            console.warn(`Modal with id ${modalId} not found`);
        }
        return false;
    }

    // Hide the modal
    modal.style.display = 'none';

    // Remove event listeners
    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) {
        closeBtn.removeEventListener('click', () => closeModal(modalId));
    }

    modal.removeEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal(modalId);
        }
    });

    // Restore scrolling on the body
    document.body.style.overflow = '';
    
    return true;
}

// Tab handling within modals
function initModalTabs(modal) {
    const modalBody = modal.querySelector('.modal-body');
    if (!modalBody) return;

    const tabs = modalBody.querySelectorAll('.tabs .tab');
    if (!tabs.length) return;

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const modalTabId = tab.getAttribute('data-modal-tab');
            if (!modalTabId) return;
            
            // Update active tab
            const allTabs = modalBody.querySelectorAll('.tabs .tab');
            allTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update active content
            const allContent = modalBody.querySelectorAll('.tab-content');
            allContent.forEach(content => {
                content.classList.remove('active');
            });
            const tabContent = modalBody.querySelector(`#${modalTabId}`);
            if (tabContent) {
                tabContent.classList.add('active');
            }
        });
    });
}

// Initialize tabs when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Find all modals with tabs and initialize them
    document.querySelectorAll('.modal').forEach(modal => {
        const tabsContainer = modal.querySelector('.tabs');
        if (tabsContainer) {
            initModalTabs(modal);
        }
    });
});

export { openModal, closeModal };

// User dropdown toggle
export function toggleDropdown() {
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) {
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    }
}