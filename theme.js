// Add to app.js or create a new theme.js file

class WaterThemeManager {
    constructor() {
        this.isWaterTheme = localStorage.getItem('waterTheme') === 'true';
        this.init();
    }

    init() {
        this.createToggleButton();
        this.applyTheme();
        this.setupScannerAnimations();
    }

    createToggleButton() {
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'theme-toggle-btn water-ripple';
        toggleBtn.innerHTML = '<i class="fas fa-droplet"></i>';
        toggleBtn.title = 'Toggle Water Theme';
        toggleBtn.addEventListener('click', () => this.toggleTheme());

        const toggleContainer = document.createElement('div');
        toggleContainer.className = 'theme-toggle';
        toggleContainer.appendChild(toggleBtn);

        document.body.appendChild(toggleContainer);
    }

    toggleTheme() {
        this.isWaterTheme = !this.isWaterTheme;
        localStorage.setItem('waterTheme', this.isWaterTheme);
        this.applyTheme();
        
        // Add water drop animation
        this.createWaterDrops();
    }

    applyTheme() {
        if (this.isWaterTheme) {
            document.body.classList.add('water-theme');
        } else {
            document.body.classList.remove('water-theme');
        }
    }

    createWaterDrops() {
        const drops = 5;
        for (let i = 0; i < drops; i++) {
            const drop = document.createElement('div');
            drop.className = 'water-drop';
            drop.style.left = Math.random() * 100 + 'vw';
            drop.style.animationDelay = (Math.random() * 2) + 's';
            document.body.appendChild(drop);

            setTimeout(() => {
                if (drop.parentNode) {
                    drop.parentNode.removeChild(drop);
                }
            }, 2000);
        }
    }

    setupScannerAnimations() {
        // Add pulse animation to scanner button
        const scannerBtn = document.querySelector('.scanner-btn');
        if (scannerBtn) {
            setInterval(() => {
                scannerBtn.classList.toggle('pulse');
            }, 3000);
        }
    }
}

// Initialize theme manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new WaterThemeManager();
});

// Enhanced scanner button hover effects
document.addEventListener('DOMContentLoaded', () => {
    const scannerBtn = document.querySelector('.scanner-btn');
    if (scannerBtn) {
        scannerBtn.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.1) translateY(-5px)';
        });
        
        scannerBtn.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1) translateY(-25px)';
        });
    }

    // Enhanced nav item animations
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-5px)';
        });
        
        item.addEventListener('mouseleave', function() {
            if (!this.classList.contains('active')) {
                this.style.transform = 'translateY(0)';
            }
        });
    });
});
