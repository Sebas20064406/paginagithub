class GitHubRepositorySearcher {
    constructor() {
        this.API_URL = 'https://api.github.com/search/repositories';
        this.ITEMS_PER_PAGE = 15;
        this.DEBOUNCE_DELAY = 800;
        this.CACHE_DURATION = 5 * 60 * 1000;
        
        this.searchTimeout = null;
        this.currentResults = [];
        this.isLoading = false;
        this.cache = new Map();
        this.abortController = null;
        
        this.elements = {
            searchForm: document.getElementById('searchForm'),
            languageSelect: document.getElementById('language'),
            searchTermInput: document.getElementById('searchTerm'),
            statusDiv: document.getElementById('status'),
            resultsDiv: document.getElementById('results'),
            refreshBtn: document.getElementById('refreshBtn')
        };
        
        this.init();
    }
    

    init() {
        this.bindEvents();
        this.createParticles();
        this.setupIntersectionObserver();
        this.loadFromLocalStorage();
    }
    

    bindEvents() {
        const { searchForm, languageSelect, searchTermInput, refreshBtn } = this.elements;
        
        searchForm.addEventListener('submit', this.handleFormSubmit.bind(this));
        languageSelect.addEventListener('change', this.handleLanguageChange.bind(this));
        searchTermInput.addEventListener('input', this.handleSearchTermInput.bind(this));
        refreshBtn.addEventListener('click', this.showRandomRepository.bind(this));
        

        document.addEventListener('keydown', this.handleKeyboardShortcuts.bind(this));
        

        this.setupMouseEffects();
    }
    

    handleFormSubmit(e) {
        e.preventDefault();
        
        const language = this.elements.languageSelect.value;
        const searchTerm = this.elements.searchTermInput.value.trim();
        
        if (!language && !searchTerm) {
            this.showStatus('empty', 'Por favor selecciona un lenguaje o ingresa un término de búsqueda');
            return;
        }
        
        this.searchRepositories(language, searchTerm);
    }
    

    handleLanguageChange() {
        const language = this.elements.languageSelect.value;
        const searchTerm = this.elements.searchTermInput.value.trim();
        
        this.saveToLocalStorage();
        
        if (language) {
            this.searchRepositories(language, searchTerm);
        } else if (!searchTerm) {
            this.showStatus('empty', 'Selecciona un lenguaje o ingresa un término para comenzar');
            this.clearResults();
        }
    }
    

    handleSearchTermInput(e) {
        clearTimeout(this.searchTimeout);
        
        const language = this.elements.languageSelect.value;
        const searchTerm = e.target.value.trim();
        
        if (searchTerm.length >= 3 || language) {
            this.searchTimeout = setTimeout(() => {
                this.searchRepositories(language, searchTerm);
            }, this.DEBOUNCE_DELAY);
        } else if (!searchTerm && !language) {
            this.showStatus('empty', 'Selecciona un lenguaje o ingresa un término para comenzar');
            this.clearResults();
        }
    }
    

    handleKeyboardShortcuts(e) {

        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            this.elements.searchTermInput.focus();
        }
        

        if (e.key === 'Escape') {
            this.clearResults();
            this.elements.searchTermInput.blur();
        }
        

        if (e.key === 'Enter' && e.target === this.elements.languageSelect) {
            this.handleLanguageChange();
        }
    }
    

    async searchRepositories(language, searchTerm) {
        if (this.isLoading) {
            if (this.abortController) {
                this.abortController.abort();
            }
        }
        
        const query = this.buildSearchQuery(language, searchTerm);
        const cacheKey = this.getCacheKey(query);
        

        if (this.cache.has(cacheKey)) {
            const cachedData = this.cache.get(cacheKey);
            if (Date.now() - cachedData.timestamp < this.CACHE_DURATION) {
                this.handleSearchSuccess(cachedData.data);
                return;
            }
        }
        
        this.isLoading = true;
        this.abortController = new AbortController();
        
        this.showStatus('loading', '<span class="spinner"></span>Buscando repositorios increíbles...');
        this.clearResults();
        this.elements.refreshBtn.classList.add('hidden');
        
        try {
            const url = `${this.API_URL}?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${this.ITEMS_PER_PAGE}`;
            
            const response = await fetch(url, {
                signal: this.abortController.signal,
                headers: {
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            

            this.cache.set(cacheKey, {
                data: data,
                timestamp: Date.now()
            });
            
            this.handleSearchSuccess(data);
            
        } catch (error) {
            if (error.name === 'AbortError') {
                return; 
            }
            
            console.error('Error al buscar repositorios:', error);
            this.showStatus('error', 
                `❌ Error: ${error.message}<br>
                <button onclick="app.retrySearch()" class="btn btn-secondary" style="margin-top: 0.5rem; padding: 0.5rem 1rem; font-size: 0.9rem;">
                    🔄 Reintentar
                </button>`
            );
        } finally {
            this.isLoading = false;
            this.abortController = null;
        }
    }
    

    handleSearchSuccess(data) {
        if (data.items && data.items.length > 0) {
            this.currentResults = data.items;
            this.displayResults(data.items);
            this.showStatus('success', `✅ Se encontraron ${data.total_count.toLocaleString()} repositorios`);
            this.elements.refreshBtn.classList.remove('hidden');
        } else {
            this.showStatus('empty', '😕 No se encontraron repositorios que coincidan con tu búsqueda');
        }
    }
    

    buildSearchQuery(language, searchTerm) {
        let query = '';
        
        if (searchTerm && language) {
            query = `${searchTerm} language:${language}`;
        } else if (language) {
            query = `language:${language}`;
        } else {
            query = searchTerm;
        }
        

        query += ' stars:>10';
        
        return query;
    }
    

    displayResults(repositories) {
        const fragment = document.createDocumentFragment();
        
        repositories.forEach((repo, index) => {
            const repoCard = this.createRepositoryCard(repo, index);
            fragment.appendChild(repoCard);
        });
        
        this.elements.resultsDiv.innerHTML = '';
        this.elements.resultsDiv.appendChild(fragment);
        

        this.animateCards();
    }
    

    createRepositoryCard(repo, index) {
        const card = document.createElement('div');
        card.className = 'repo-card';
        card.style.animationDelay = `${index * 0.1}s`;
        card.setAttribute('data-repo-url', repo.html_url);
        

        const languageIcon = this.getLanguageIcon(repo.language);
        

        const updatedDate = new Date(repo.updated_at);
        const relativeTime = this.getRelativeTime(updatedDate);
        
        card.innerHTML = `
            <div class="repo-header">
                <div class="repo-name">
                    ${languageIcon} ${this.escapeHtml(repo.name)}
                </div>
                <div class="repo-owner">
                    👤 ${this.escapeHtml(repo.owner.login)}
                </div>
            </div>
            <div class="repo-description">
                ${this.escapeHtml(repo.description || 'Sin descripción disponible')}
            </div>
            <div class="repo-stats">
                <span class="stat" title="Estrellas">⭐ ${this.formatNumber(repo.stargazers_count)}</span>
                <span class="stat" title="Forks">🍴 ${this.formatNumber(repo.forks_count)}</span>
                <span class="stat" title="Issues abiertas">🐛 ${this.formatNumber(repo.open_issues_count)}</span>
                <span class="stat" title="Lenguaje principal">💻 ${repo.language || 'N/A'}</span>
            </div>
            <div class="repo-footer">
                <span class="repo-license" title="Licencia">
                    📄 ${repo.license ? repo.license.name : 'Sin licencia'}
                </span>
                <span class="repo-updated" title="Última actualización">
                    🕒 ${relativeTime}
                </span>
            </div>
        `;
        

        card.addEventListener('click', () => this.openRepository(repo.html_url));
        

        this.addHoverEffects(card);
        
        return card;
    }
    

    getLanguageIcon(language) {
        const icons = {
            'JavaScript': '🟨',
            'TypeScript': '🔷',
            'Python': '🐍',
            'Java': '☕',
            'C++': '⚙️',
            'C#': '🔵',
            'Go': '🐹',
            'Rust': '🦀',
            'Swift': '🐦',
            'Kotlin': '🎯',
            'Ruby': '💎',
            'PHP': '🐘',
            'Dart': '🎯',
            'R': '📊',
            'Scala': '🏗️'
        };
        
        return icons[language] || '💻';
    }
    

    getRelativeTime(date) {
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return 'Hoy';
        if (diffDays === 1) return 'Ayer';
        if (diffDays < 7) return `Hace ${diffDays} días`;
        if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`;
        if (diffDays < 365) return `Hace ${Math.floor(diffDays / 30)} meses`;
        return `Hace ${Math.floor(diffDays / 365)} años`;
    }
    

    addHoverEffects(card) {
        let isHovered = false;
        
        card.addEventListener('mouseenter', () => {
            if (!isHovered) {
                isHovered = true;
                card.style.transform = 'translateY(-8px) scale(1.02)';
                card.style.boxShadow = '0 20px 40px rgba(0, 255, 255, 0.3)';
            }
        });
        
        card.addEventListener('mouseleave', () => {
            isHovered = false;
            card.style.transform = 'translateY(0) scale(1)';
            card.style.boxShadow = '';
        });
    }
    

    animateCards() {
        const cards = this.elements.resultsDiv.querySelectorAll('.repo-card');
        
        cards.forEach((card, index) => {
            setTimeout(() => {
                card.classList.add('animate-in');
            }, index * 100);
        });
    }
    

    showRandomRepository() {
        if (this.currentResults.length > 0) {
            const randomIndex = Math.floor(Math.random() * this.currentResults.length);
            const randomRepo = this.currentResults[randomIndex];
            this.displayResults([randomRepo]);
            

            this.elements.refreshBtn.style.transform = 'rotate(360deg)';
            setTimeout(() => {
                this.elements.refreshBtn.style.transform = 'rotate(0deg)';
            }, 500);
        }
    }
    

    openRepository(url) {

        console.log(`Abriendo repositorio: ${url}`);
        window.open(url, '_blank', 'noopener,noreferrer');
    }
    

    retrySearch() {
        const language = this.elements.languageSelect.value;
        const searchTerm = this.elements.searchTermInput.value.trim();
        this.searchRepositories(language, searchTerm);
    }
    

    showStatus(type, message) {
        this.elements.statusDiv.className = `status ${type}`;
        this.elements.statusDiv.innerHTML = message;
        

        if (type === 'success') {
            setTimeout(() => {
                if (this.elements.statusDiv.classList.contains('success')) {
                    this.elements.statusDiv.innerHTML = '';
                    this.elements.statusDiv.className = 'status';
                }
            }, 3000);
        }
    }
    

    clearResults() {
        this.elements.resultsDiv.innerHTML = '';
        this.elements.refreshBtn.classList.add('hidden');
    }
    

    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toLocaleString();
    }
    

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    

    getCacheKey(query) {
        return `github_search_${btoa(query)}`;
    }
    

    saveToLocalStorage() {
        try {
            const preferences = {
                language: this.elements.languageSelect.value,
                searchTerm: this.elements.searchTermInput.value
            };
            localStorage.setItem('github_searcher_prefs', JSON.stringify(preferences));
        } catch (error) {
            console.warn('No se pudo guardar en localStorage:', error);
        }
    }
    

    loadFromLocalStorage() {
        try {
            const saved = localStorage.getItem('github_searcher_prefs');
            if (saved) {
                const preferences = JSON.parse(saved);
                if (preferences.language) {
                    this.elements.languageSelect.value = preferences.language;
                }
                if (preferences.searchTerm) {
                    this.elements.searchTermInput.value = preferences.searchTerm;
                }
            }
        } catch (error) {
            console.warn('No se pudo cargar desde localStorage:', error);
        }
    }
    

    setupIntersectionObserver() {
        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        }, { threshold: 0.1 });
    }
    

    createParticles() {
        const particlesContainer = document.getElementById('particles');
        if (!particlesContainer) return;
        
        const particleCount = Math.min(30, Math.floor(window.innerWidth / 50));
        

        particlesContainer.innerHTML = '';
        
        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            

            particle.style.left = Math.random() * 100 + '%';
            particle.style.animationDelay = Math.random() * 6 + 's';
            particle.style.animationDuration = (Math.random() * 4 + 4) + 's';
            

            const colors = ['#00ffff', '#ff0080', '#00ff41', '#ff6b00', '#8000ff'];
            particle.style.background = colors[Math.floor(Math.random() * colors.length)];
            

            const size = Math.random() * 4 + 2;
            particle.style.width = size + 'px';
            particle.style.height = size + 'px';
            
            particlesContainer.appendChild(particle);
        }
    }
    

    setupMouseEffects() {
        const container = document.querySelector('.main-container');
        let mouseMoveTimeout;
        
        document.addEventListener('mousemove', (e) => {
            clearTimeout(mouseMoveTimeout);
            
            const rect = container.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const rotateX = ((y - centerY) / centerY) * 1;
            const rotateY = ((centerX - x) / centerX) * 1;
            
            container.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
            

            mouseMoveTimeout = setTimeout(() => {
                container.style.transform = 'perspective(1200px) rotateX(0deg) rotateY(0deg)';
            }, 2000);
        });
        

        container.addEventListener('mouseleave', () => {
            container.style.transform = 'perspective(1200px) rotateX(0deg) rotateY(0deg)';
        });
    }
    

    destroy() {

        clearTimeout(this.searchTimeout);
        

        if (this.abortController) {
            this.abortController.abort();
        }
        

        if (this.observer) {
            this.observer.disconnect();
        }
        

        this.cache.clear();
    }
}


let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new GitHubRepositorySearcher();
});


window.addEventListener('beforeunload', () => {
    if (app) {
        app.destroy();
    }
});


document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && app) {

        if (!document.getElementById('particles').children.length) {
            app.createParticles();
        }
    }
});


window.retrySearch = () => app?.retrySearch();
window.showRandomRepository = () => app?.showRandomRepository();