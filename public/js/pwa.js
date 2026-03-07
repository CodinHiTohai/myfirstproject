let deferredPrompt;

// Listen for the "beforeinstallprompt" event
window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;

    // Update UI to notify the user they can install the PWA
    showInstallPromotion();

    console.log(`'beforeinstallprompt' event was fired.`);
});

function showInstallPromotion() {
    const installBtnContainer = document.getElementById('pwaInstallContainer');
    if (installBtnContainer) {
        installBtnContainer.style.display = 'block';
    } else {
        // Create a floating install button if the container doesn't exist
        const btn = document.createElement('button');
        btn.id = 'floatingInstallBtn';
        btn.innerHTML = '📲 Install App';
        btn.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 1000;
        background: var(--primary, #3b82f6);
        color: white;
        border: none;
        border-radius: 50px;
        padding: 12px 24px;
        font-size: 1rem;
        font-weight: 600;
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
        cursor: pointer;
        transition: transform 0.2s, box-shadow 0.2s;
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: inherit;
      `;

        btn.onmouseover = () => btn.style.transform = 'translateY(-2px)';
        btn.onmouseout = () => btn.style.transform = 'translateY(0)';

        btn.addEventListener('click', async () => {
            btn.style.display = 'none';

            if (deferredPrompt) {
                deferredPrompt.prompt();

                const { outcome } = await deferredPrompt.userChoice;
                console.log(`User response to the install prompt: ${outcome}`);

                deferredPrompt = null;
            }
        });

        document.body.appendChild(btn);
    }
}

// Check if app is already installed
window.addEventListener('appinstalled', () => {
    // Hide the floating button if it exists
    const btn = document.getElementById('floatingInstallBtn');
    if (btn) btn.style.display = 'none';

    // Hide container if it exists
    const container = document.getElementById('pwaInstallContainer');
    if (container) container.style.display = 'none';

    // Clear the deferredPrompt so it can be garbage collected
    deferredPrompt = null;
    console.log('PWA was installed');
});
