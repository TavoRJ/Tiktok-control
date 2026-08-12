// public/js/modules/themes.js

export const ThemesManager = {
    init() {
        console.info('[ThemesManager] Initializing theme switching...');
        
        // Find theme chips
        const themeChips = document.querySelectorAll('button[data-theme-set]');
        const themeSelect = document.getElementById('setup-theme');
        
        themeChips.forEach(chip => {
            chip.addEventListener('click', (e) => {
                e.preventDefault();
                const theme = chip.getAttribute('data-theme-set');
                this.applyTheme(theme);
                
                // Update dropdown value if it exists
                if (themeSelect) {
                    themeSelect.value = theme;
                }
                
                // Dispatch event so panel.js can update config and notify backend
                window.dispatchEvent(new CustomEvent('theme:changed', { detail: { theme } }));
            });
        });
        
        // Also watch for dropdown changes
        if (themeSelect) {
            themeSelect.addEventListener('change', (e) => {
                const theme = e.target.value;
                this.applyTheme(theme);
                window.dispatchEvent(new CustomEvent('theme:changed', { detail: { theme } }));
            });
        }
    },
    
    applyTheme(theme) {
        console.info(`[ThemesManager] Applying theme: ${theme}`);
        document.body.className = '';
        document.body.classList.add('theme-' + theme);
        
        // Update document title and logo
        const logoEl = document.querySelector('.brand-logo');
        const serverPort = window.location.port || '3000';
        
        if (theme === 'neutral') {
            document.title = "TavLive - Control Panel";
            if (logoEl) {
                logoEl.src = `http://127.0.0.1:${serverPort}/app-assets/neutral-logo.jpg`;
                logoEl.alt = 'GR Logo';
                logoEl.style.display = 'block';
            }
        } else {
            document.title = theme === 'majo' ? "Majo's - Control Panel" : "Naya's - Control Panel";
            if (logoEl) {
                const logoFile = theme === 'majo' ? 'majo-logo2.png' : `${theme}-logo.png`;
                logoEl.src = `http://127.0.0.1:${serverPort}/streamer-assets/${logoFile}`;
                logoEl.alt = theme.charAt(0).toUpperCase() + theme.slice(1) + ' Logo';
                logoEl.style.display = 'block';
            }
        }
    }
};
