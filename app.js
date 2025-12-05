class SimpleConfigViewer {
    constructor() {
        // 操作系统检测
        this.osType = this.detectOperatingSystem();
        
        // 根据操作系统设置默认opt路径
        this.defaultOptPath = this.osType === 'Windows' ? 'C:/opt' : '/opt';
        this.defaultConfigPath = `${this.defaultOptPath}/data`;
        this.currentConfigPath = this.defaultConfigPath;
        this.serverPropertiesPath = `${this.defaultOptPath}/settings/server.properties`;
        
        // 初始化其他配置
        this.isLocalEnv = false;
        this.currentDirectoryHandle = null;
        this.optDirectoryHandle = null;
        this.currentProjectName = "";
        this.currentConfigFile = null;
        this.currentConfigData = [];
        this.isAuthorized = false;
        this.hasUnsavedChanges = false;
        
        // 搜索相关变量
        this.searchVisible = false;
        this.searchIndex = -1;
        this.searchResults = [];
        
        // 初始化UI
        this.initUI();
        // 尝试自动授权
        this.initializeAuthorization();
    }

    showWelcomeMessage() {
        const configGrid = document.getElementById('configGrid');
        configGrid.innerHTML = `
            <div class="welcome-container">
                <h2>欢迎使用本地apollo配置编辑器</h2>
                <p>请选择配置文件夹 <strong>C:/opt/data</strong> 开始使用</p>
                <button id="selectDirBtn" class="select-dir-btn">
                    选择配置文件夹
                </button>
            </div>
        `;
        
        // 重置为居中样式
        configGrid.style.display = 'flex';
        configGrid.style.alignItems = 'center';
        configGrid.style.justifyContent = 'center';
        
        // 添加选择目录按钮事件
        document.getElementById('selectDirBtn').addEventListener('click', () => {
            this.changeConfigPath();
        });
    }

    initUI() {
        // 安全获取元素的辅助函数
        const getElement = (id) => {
            const element = document.getElementById(id);
            if (!element) {
                console.warn(`Element with id '${id}' not found`);
                return null;
            }
            return element;
        };
        
        // 绑定事件
        const refreshBtn = getElement('refreshBtn');
        if (refreshBtn) refreshBtn.addEventListener('click', () => this.loadConfigs());
        
        const closeBtn = getElement('closeBtn');
        if (closeBtn) closeBtn.addEventListener('click', () => this.closeApp());
        
        const pathLabel = getElement('pathLabel');
        if (pathLabel) pathLabel.addEventListener('click', () => this.changeConfigPath());
        
        const envLabel = getElement('envLabel');
        if (envLabel) envLabel.addEventListener('click', () => this.toggleEnvironment());
        
        // 模态框事件
        const closeModalBtn = getElement('closeModalBtn');
        if (closeModalBtn) closeModalBtn.addEventListener('click', () => this.closeConfigDetails());
        
        const closeEditorBtn = getElement('closeEditorBtn');
        if (closeEditorBtn) closeEditorBtn.addEventListener('click', () => this.closeConfigEditor());
        
        const saveBtn = getElement('saveBtn');
        if (saveBtn) saveBtn.addEventListener('click', () => this.saveConfig());
        
        const searchBtn = getElement('searchBtn');
        if (searchBtn) searchBtn.addEventListener('click', () => this.toggleSearch());
        
        const addBtn = getElement('addBtn');
        if (addBtn) addBtn.addEventListener('click', () => this.addConfigItem());
        
        // 应用安装提示事件
        const installBtn = getElement('installBtn');
        if (installBtn) installBtn.addEventListener('click', () => this.handleInstall());
        
        const dismissInstallBtn = getElement('dismissInstallBtn');
        if (dismissInstallBtn) dismissInstallBtn.addEventListener('click', () => this.handleDismissInstall());
        
        // 搜索事件
        const searchInput = getElement('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.onSearchTextChanged(e.target.value));
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.searchNext();
                }
            });
        }
        
        const prevBtn = getElement('prevBtn');
        if (prevBtn) prevBtn.addEventListener('click', () => this.searchPrevious());
        
        const nextBtn = getElement('nextBtn');
        if (nextBtn) nextBtn.addEventListener('click', () => this.searchNext());
        
        // 点击模态框外部关闭
        const configDetailsModal = getElement('configDetailsModal');
        if (configDetailsModal) {
            configDetailsModal.addEventListener('click', (e) => {
                if (e.target.id === 'configDetailsModal') {
                    this.closeConfigDetails();
                }
            });
        }
        
        const configEditorModal = getElement('configEditorModal');
        if (configEditorModal) {
            configEditorModal.addEventListener('click', (e) => {
                if (e.target.id === 'configEditorModal') {
                    this.closeConfigEditor();
                }
            });
        }
        
        // 添加Ctrl+F快捷键支持
        document.addEventListener('keydown', (e) => {
            // 检查是否在配置编辑模态框中
            const editorModal = getElement('configEditorModal');
            if (editorModal && !editorModal.classList.contains('hidden')) {
                // 检查是否按下Ctrl+F
                if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                    e.preventDefault();
                    this.toggleSearch();
                }
            }
        });
    }

    async changeConfigPath() {
        try {
            // 使用File System Access API选择目录
            const directoryHandle = await window.showDirectoryPicker({
                mode: 'readwrite',
                startIn: 'documents'
            });
            
            this.currentDirectoryHandle = directoryHandle;
            this.currentConfigPath = directoryHandle.name; // 这里我们只获取目录名，实际使用handle操作
            document.getElementById('pathLabel').textContent = `当前配置路径: ${directoryHandle.name}`;
            this.loadConfigs();
        } catch (err) {
            console.error('选择目录失败:', err);
            this.showMessage('选择目录失败', '错误');
        }
    }

    async loadConfigs() {
        const configGrid = document.getElementById('configGrid');
        configGrid.innerHTML = '<div class="loading">加载中...</div>';
        
        try {
            let configFolders = [];
            
            if (this.isAuthorized && this.optDirectoryHandle) {
                // 使用授权的opt目录下的data文件夹
                try {
                    // 获取data子目录
                    const dataDir = await this.optDirectoryHandle.getDirectoryHandle('data', { create: true });
                    this.currentDirectoryHandle = dataDir;
                    
                    // 更新路径显示
                    document.getElementById('pathLabel').textContent = `当前配置路径: C:/opt/data`;
                    
                    // 读取配置文件夹
                    for await (const entry of dataDir.values()) {
                        if (entry.kind === 'directory') {
                            configFolders.push(entry);
                        }
                    }
                } catch (err) {
                    console.error('无法访问data目录:', err);
                    this.showMessage('无法访问C:/opt/data目录', '错误');
                    configFolders = [];
                }
            } else {
                // 未授权，显示授权提示
                this.showAuthorizationPrompt();
                return;
            }
            
            this.renderConfigCards(configFolders);
        } catch (err) {
            console.error('加载配置失败:', err);
            configGrid.innerHTML = '<div class="loading">加载失败</div>';
            this.showMessage('加载配置失败', '错误');
        }
    }

    renderConfigCards(configFolders) {
        const configGrid = document.getElementById('configGrid');
        
        // 恢复网格布局样式
        configGrid.style.display = 'grid';
        configGrid.style.alignItems = 'stretch';
        configGrid.style.justifyContent = 'flex-start';
        
        if (configFolders.length === 0) {
            configGrid.innerHTML = '<div class="loading">路径下没有配置文件夹</div>';
            // 重置为居中样式
            configGrid.style.display = 'flex';
            configGrid.style.alignItems = 'center';
            configGrid.style.justifyContent = 'center';
            return;
        }
        
        configGrid.innerHTML = configFolders.map(folder => `
            <div class="config-card" data-folder="${folder.name}">
                <div class="config-card-name">${folder.name}</div>
                <div class="config-card-path">路径: ${this.currentConfigPath}/${folder.name}</div>
                <div class="config-card-env">环境数: 3</div>
            </div>
        `).join('');
        
        // 添加点击事件
        configGrid.querySelectorAll('.config-card').forEach(card => {
            card.addEventListener('click', () => {
                const folderName = card.dataset.folder;
                this.openConfigDetails(folderName);
            });
        });
    }

    async openConfigDetails(projectName) {
        this.currentProjectName = projectName;
        const modalTitle = document.getElementById('modalTitle');
        const configFilesGrid = document.getElementById('configFilesGrid');
        
        modalTitle.textContent = projectName;
        configFilesGrid.innerHTML = '<div class="loading">加载中...</div>';
        
        try {
            // 真实读取配置文件
            let configFiles = [];
            
            if (this.currentDirectoryHandle) {
                try {
                    const projectDir = await this.currentDirectoryHandle.getDirectoryHandle(projectName, { create: false });
                    const configCacheDir = await projectDir.getDirectoryHandle('config-cache', { create: false });
                    
                    for await (const entry of configCacheDir.values()) {
                        if (entry.kind === 'file' && entry.name.endsWith('.properties')) {
                            configFiles.push(entry.name);
                        }
                    }
                } catch (err) {
                    console.error('无法读取配置文件:', err);
                    configFiles = [];
                }
            }
            
            configFilesGrid.innerHTML = configFiles.map(file => {
                // 解析配置名称
                let configName = file.replace('.properties', '');
                if (file.includes('+')) {
                    const parts = file.split('+');
                    configName = parts[1] || configName;
                }
                
                return `
                    <div class="config-file-card" data-file="${file}">
                        <div class="config-file-name">${configName}</div>
                        <div class="config-file-path">${file}</div>
                    </div>
                `;
            }).join('');
            
            // 添加点击事件
            configFilesGrid.querySelectorAll('.config-file-card').forEach(card => {
                card.addEventListener('click', () => {
                    const fileName = card.dataset.file;
                    this.openConfigEditor(fileName);
                });
            });
            
            // 显示模态框
            document.getElementById('configDetailsModal').classList.remove('hidden');
        } catch (err) {
            console.error('加载配置文件失败:', err);
            configFilesGrid.innerHTML = '<div class="loading">加载失败</div>';
            this.showMessage('加载配置文件失败', '错误');
        }
    }

    closeConfigDetails() {
        document.getElementById('configDetailsModal').classList.add('hidden');
    }

    async openConfigEditor(fileName) {
        this.currentConfigFile = fileName;
        const editorTitle = document.getElementById('editorTitle');
        editorTitle.textContent = `编辑配置: ${fileName}`;
        
        // 加载配置文件内容
        await this.loadConfigFile(fileName);
        
        // 根据在线/离线状态控制编辑功能
        this.updateEditorMode();
        
        // 显示模态框
        document.getElementById('configEditorModal').classList.remove('hidden');
    }

    updateEditorMode() {
        // 获取编辑相关按钮
        const saveBtn = document.getElementById('saveBtn');
        const addBtn = document.getElementById('addBtn');
        const deleteBtns = document.querySelectorAll('.delete-btn');
        const resizableInputs = document.querySelectorAll('.resizable-input');
        
        if (this.isLocalEnv) {
            // 本地模式：启用编辑功能
            if (saveBtn) saveBtn.classList.remove('disabled');
            if (addBtn) addBtn.classList.remove('disabled');
            
            // 启用删除按钮
            deleteBtns.forEach(btn => {
                btn.classList.remove('disabled');
            });
            
            // 启用输入框编辑
            resizableInputs.forEach(input => {
                input.removeAttribute('readonly');
                input.style.cursor = 'text';
            });
        } else {
            // 在线模式：禁用编辑功能
            if (saveBtn) saveBtn.classList.add('disabled');
            if (addBtn) addBtn.classList.add('disabled');
            
            // 禁用删除按钮
            deleteBtns.forEach(btn => {
                btn.classList.add('disabled');
            });
            
            // 禁用输入框编辑
            resizableInputs.forEach(input => {
                input.setAttribute('readonly', 'true');
                input.style.cursor = 'not-allowed';
            });
        }
    }

    closeConfigEditor() {
        // 检查是否有未保存的更改
        if (this.hasUnsavedChanges) {
            if (confirm('您有未保存的更改，确定要关闭吗？')) {
                this.closeEditor();
            }
        } else {
            this.closeEditor();
        }
    }

    closeEditor() {
        document.getElementById('configEditorModal').classList.add('hidden');
        this.currentConfigFile = null;
        this.currentConfigData = [];
        this.hasUnsavedChanges = false;
        this.setUnsavedChanges(false);
    }

    async loadConfigFile(fileName) {
        try {
            this.currentConfigData = [];
            
            if (this.currentDirectoryHandle) {
                try {
                    const projectDir = await this.currentDirectoryHandle.getDirectoryHandle(this.currentProjectName, { create: false });
                    const configCacheDir = await projectDir.getDirectoryHandle('config-cache', { create: false });
                    const fileHandle = await configCacheDir.getFileHandle(fileName, { create: false });
                    const file = await fileHandle.getFile();
                    const content = await file.text();
                    
                    // 解析properties文件
                    const lines = content.split('\n');
                    lines.forEach(line => {
                        line = line.trim();
                        if (line && !line.startsWith('#')) {
                            const equalsIndex = line.indexOf('=');
                            if (equalsIndex > 0) {
                                const key = line.substring(0, equalsIndex).trim();
                                const value = line.substring(equalsIndex + 1).trim();
                                this.currentConfigData.push([key, value]);
                            }
                        }
                    });
                } catch (err) {
                    console.error('无法读取配置文件内容:', err);
                    this.showMessage('无法读取配置文件内容', '错误');
                }
            }
            
            this.updateTable();
        } catch (err) {
            console.error('读取配置文件失败:', err);
            this.showMessage('读取配置文件失败', '错误');
        }
    }

    updateTable() {
        const tableBody = document.getElementById('configTableBody');
        tableBody.innerHTML = this.currentConfigData.map(([key, value], row) => `
            <tr>
                <td>
                    <textarea class="resizable-input" oninput="configViewer.onConfigChange(${row}, 0, this.value)" rows="1">${key}</textarea>
                </td>
                <td>
                    <textarea class="resizable-input" oninput="configViewer.onConfigChange(${row}, 1, this.value)" rows="1">${value}</textarea>
                </td>
                <td align="center">
                    <button class="delete-btn" onclick="configViewer.deleteConfigItem(${row})">删除</button>
                </td>
            </tr>
        `).join('');
        
        // 初始化可调整大小的输入框
        this.initResizableInputs();
        
        // 根据在线/离线状态更新编辑模式
        this.updateEditorMode();
    }

    onConfigChange(row, col, value) {
        // 在线模式下不处理配置变更
        if (!this.isLocalEnv) {
            return;
        }
        
        if (col === 0) {
            this.currentConfigData[row][0] = value;
        } else {
            this.currentConfigData[row][1] = value;
        }
        // 设置未保存状态
        this.setUnsavedChanges(true);
    }

    setUnsavedChanges(hasChanges) {
        this.hasUnsavedChanges = hasChanges;
        const unsavedIndicator = document.getElementById('unsavedIndicator');
        if (unsavedIndicator) {
            if (hasChanges) {
                unsavedIndicator.classList.remove('hidden');
            } else {
                unsavedIndicator.classList.add('hidden');
            }
        }
    }

    addConfigItem() {
        // 在线模式下不允许添加配置项
        if (!this.isLocalEnv) {
            return;
        }
        
        this.currentConfigData.push(['new_key', 'new_value']);
        this.updateTable();
        // 滚动到最后一行
        document.getElementById('configTable').scrollTop = document.getElementById('configTable').scrollHeight;
        // 设置未保存状态
        this.setUnsavedChanges(true);
    }

    deleteConfigItem(row) {
        // 在线模式下不允许删除配置项
        if (!this.isLocalEnv) {
            return;
        }
        
        if (confirm('确定要删除这个配置项吗？')) {
            this.currentConfigData.splice(row, 1);
            this.updateTable();
            // 设置未保存状态
            this.setUnsavedChanges(true);
        }
    }

    async saveConfig() {
        // 在线模式下不允许保存配置
        if (!this.isLocalEnv) {
            this.showMessage('当前为在线模式，不支持修改操作，修改不会生效', '提示');
            return;
        }
        
        try {
            if (this.currentDirectoryHandle && this.currentProjectName && this.currentConfigFile) {
                // 构建配置文件内容
                let content = '';
                this.currentConfigData.forEach(([key, value]) => {
                    if (key && key.trim()) {
                        content += `${key.trim()}=${value.trim()}\n`;
                    }
                });
                
                // 保存到文件
                try {
                    const projectDir = await this.currentDirectoryHandle.getDirectoryHandle(this.currentProjectName, { create: false });
                    const configCacheDir = await projectDir.getDirectoryHandle('config-cache', { create: false });
                    const fileHandle = await configCacheDir.getFileHandle(this.currentConfigFile, { create: false });
                    
                    // 使用File System Access API写入文件
                    const writable = await fileHandle.createWritable();
                    await writable.write(content);
                    await writable.close();
                    
                    // 重置未保存状态
                    this.setUnsavedChanges(false);
                    
                    // 显示成功消息
                    this.showMessage('配置文件保存成功！', '成功');
                    this.closeConfigEditor();
                } catch (err) {
                    console.error('无法保存配置文件:', err);
                    this.showMessage('无法保存配置文件', '错误');
                }
            } else {
                this.showMessage('保存失败：缺少必要的配置信息', '错误');
            }
        } catch (err) {
            console.error('保存配置文件失败:', err);
            this.showMessage('保存配置文件失败', '错误');
        }
    }

    toggleSearch() {
        this.searchVisible = !this.searchVisible;
        const searchBar = document.getElementById('searchBar');
        
        if (this.searchVisible) {
            searchBar.classList.remove('hidden');
            document.getElementById('searchInput').focus();
        } else {
            searchBar.classList.add('hidden');
            document.getElementById('searchInput').value = '';
            this.searchResults = [];
            this.searchIndex = -1;
            this.updateSearchResult();
        }
    }

    onSearchTextChanged(searchText) {
        if (!searchText.trim()) {
            this.searchResults = [];
            this.searchIndex = -1;
            this.updateSearchResult();
            return;
        }
        
        // 搜索配置项
        this.searchResults = [];
        this.currentConfigData.forEach(([key, value], index) => {
            if (key.includes(searchText) || value.includes(searchText)) {
                this.searchResults.push(index);
            }
        });
        
        this.searchIndex = this.searchResults.length > 0 ? 0 : -1;
        this.updateSearchResult();
        this.highlightSearchResult();
    }

    updateSearchResult() {
        const searchResult = document.getElementById('searchResult');
        if (this.searchResults.length > 0) {
            // 显示当前位置和总匹配数，例如：1/3
            const currentPosition = this.searchIndex + 1;
            searchResult.textContent = `${currentPosition}/${this.searchResults.length}`;
        } else {
            searchResult.textContent = `找到 0 个结果`;
        }
    }

    highlightSearchResult() {
        // 清除所有高亮
        const rows = document.querySelectorAll('#configTableBody tr');
        rows.forEach(row => {
            row.classList.remove('search-match', 'search-current');
        });
        
        // 高亮所有匹配行
        this.searchResults.forEach((rowIndex, index) => {
            const row = rows[rowIndex];
            if (row) {
                row.classList.add('search-match');
                // 高亮当前选中的匹配行
                if (index === this.searchIndex) {
                    row.classList.add('search-current');
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        });
    }

    searchPrevious() {
        if (this.searchResults.length === 0) return;
        
        this.searchIndex = (this.searchIndex - 1 + this.searchResults.length) % this.searchResults.length;
        this.highlightSearchResult();
    }

    searchNext() {
        if (this.searchResults.length === 0) return;
        
        this.searchIndex = (this.searchIndex + 1) % this.searchResults.length;
        this.highlightSearchResult();
    }

    async checkEnvironmentConfig() {
        try {
            // 默认设置为在线环境，不自动打开文件选择器
            this.isLocalEnv = false;
            document.getElementById('envLabel').textContent = '在线';
            document.getElementById('envLabel').className = 'env-label online';
        } catch (err) {
            console.error('检查环境配置失败:', err);
            // 异常情况下默认为在线
            this.isLocalEnv = false;
            document.getElementById('envLabel').textContent = '在线';
            document.getElementById('envLabel').className = 'env-label online';
        }
    }

    async toggleEnvironment() {
        const message = this.isLocalEnv 
            ? '确定要切换到在线环境吗？在线时将删除env配置项。' 
            : '确定要切换到本地环境吗？本地环境将设置env=Local。';
        
        const title = this.isLocalEnv ? '切换到在线环境' : '切换到本地环境';
        
        if (confirm(`${title}\n${message}`)) {
            await this.updateEnvironmentConfig();
        }
    }

    async updateEnvironmentConfig() {
        try {
            if (this.isAuthorized && this.optDirectoryHandle) {
                // 使用已授权的opt目录下的settings/server.properties文件
                try {
                    // 获取settings目录
                    const settingsDir = await this.optDirectoryHandle.getDirectoryHandle('settings', { create: true });
                    
                    // 获取server.properties文件
                    const fileHandle = await settingsDir.getFileHandle('server.properties', { create: true });
                    
                    // 读取现有内容
                    const file = await fileHandle.getFile();
                    const content = await file.text();
                    const lines = content.split('\n');
                    
                    // 过滤掉现有的env配置和空行
                    const filteredLines = lines.filter(line => {
                        const trimmedLine = line.trim();
                        return trimmedLine && !trimmedLine.startsWith('env=');
                    });
                    
                    // 切换环境
                    this.isLocalEnv = !this.isLocalEnv;
                    
                    // 如果是本地环境，添加env=Local配置
                    if (this.isLocalEnv) {
                        // 查找[General]部分
                        const generalIndex = filteredLines.findIndex(line => line.trim() === '[General]');
                        if (generalIndex !== -1) {
                            // 在[General]之后插入env=Local
                            filteredLines.splice(generalIndex + 1, 0, 'env=Local');
                        } else {
                            // 如果没有[General]部分，添加到开头
                            filteredLines.unshift('[General]');
                            filteredLines.push('env=Local');
                        }
                    }
                    
                    // 确保文件以[General]开头
                    if (!filteredLines.some(line => line.trim() === '[General]')) {
                        filteredLines.unshift('[General]');
                    }
                    
                    // 写入更新后的内容
                    const writable = await fileHandle.createWritable();
                    await writable.write(filteredLines.join('\n'));
                    await writable.close();
                    
                    // 更新UI
                    this.updateEnvironmentUI();
                    this.showMessage(`成功切换到${this.isLocalEnv ? '本地' : '在线'}环境`, '环境切换');
                } catch (err) {
                    console.error('更新环境配置失败:', err);
                    this.showMessage('无法访问或写入server.properties文件', '错误');
                }
            } else {
                this.showMessage('未授权访问，请重新授权', '错误');
                this.showAuthorizationPrompt();
            }
        } catch (err) {
            console.error('环境切换异常:', err);
            this.showMessage('环境切换失败，请重试', '错误');
        }
    }

    async changeConfigPath() {
        try {
            // 直接重新授权，避免使用可能失效的授权状态
            this.showAuthorizationPrompt();
        } catch (err) {
            console.error('重新授权失败:', err);
            this.showMessage('重新授权失败', '错误');
        }
    }

    showMessage(message, title) {
        alert(`${title || '提示'}\n${message}`);
    }

    async initializeAuthorization() {
        try {
            // 清除可能存在的旧授权状态
            localStorage.removeItem('configViewerAuthorization');
            
            // 根据浏览器安全策略，无法自动恢复File System Access API授权
            // 每次页面刷新都需要重新授权
            this.showAuthorizationPrompt();
            
            // 初始化应用安装提示
            this.initInstallPrompt();
        } catch (err) {
            console.error('初始化授权失败:', err);
            this.showAuthorizationPrompt();
        }
    }
    
    // 通用日志打印函数
    log(message, level = 'info', metadata = {}) {
        const timestamp = new Date().toISOString();
        const logData = {
            timestamp,
            level,
            message,
            ...metadata
        };
        console.log(`%c[ConfigViewer] ${level.toUpperCase()}`, 'color: #4CAF50; font-weight: bold;', logData);
    }
    
    // 解析浏览器信息
    parseBrowserInfo() {
        const userAgent = navigator.userAgent;
        const platform = navigator.platform;
        const vendor = navigator.vendor;
        
        let browserName = 'Unknown';
        let browserVersion = 'Unknown';
        let engineName = 'Unknown';
        let isChromeBased = false;
        
        // 检测浏览器名称和版本
        if (/Edg\/([\d.]+)/i.test(userAgent)) {
            browserName = 'Edge';
            browserVersion = RegExp.$1;
            isChromeBased = true;
        } else if (/Chrome\/([\d.]+)/i.test(userAgent) && !/Edg\//i.test(userAgent)) {
            browserName = 'Chrome';
            browserVersion = RegExp.$1;
            isChromeBased = true;
        } else if (/Firefox\/([\d.]+)/i.test(userAgent)) {
            browserName = 'Firefox';
            browserVersion = RegExp.$1;
            engineName = 'Gecko';
        } else if (/Safari\/([\d.]+)/i.test(userAgent) && !/Chrome\//i.test(userAgent)) {
            browserName = 'Safari';
            browserVersion = RegExp.$1;
            engineName = 'WebKit';
        } else if (/OPR\/([\d.]+)/i.test(userAgent)) {
            browserName = 'Opera';
            browserVersion = RegExp.$1;
            isChromeBased = true;
        } else if (/Brave\/([\d.]+)/i.test(userAgent)) {
            browserName = 'Brave';
            browserVersion = RegExp.$1;
            isChromeBased = true;
        }
        
        // 检测内核类型
        if (isChromeBased) {
            engineName = 'Blink';
        }
        
        return {
            userAgent,
            platform,
            vendor,
            browserName,
            browserVersion,
            engineName,
            isChromeBased
        };
    }
    
    // 检测是否为Chrome内核浏览器
    isChromeBasedBrowser() {
        const browserInfo = this.parseBrowserInfo();
        
        // 打印浏览器详细信息日志
        this.log('浏览器类型检测', 'info', {
            browserInfo: {
                browserName: browserInfo.browserName,
                browserVersion: browserInfo.browserVersion,
                engineName: browserInfo.engineName,
                platform: browserInfo.platform,
                isChromeBased: browserInfo.isChromeBased
            }
        });
        
        return browserInfo.isChromeBased;
    }
    
    // 初始化应用安装提示
    initInstallPrompt() {
        // 检查是否已忽略安装提示
        const hasDismissed = localStorage.getItem('installPromptDismissed') === 'true';
        if (hasDismissed) return;
        
        // 检查是否为Chrome内核浏览器
        if (!this.isChromeBasedBrowser()) return;
        
        // 监听beforeinstallprompt事件，用于PWA安装
        window.addEventListener('beforeinstallprompt', (e) => {
            // 阻止Chrome 67及更早版本自动显示安装提示
            e.preventDefault();
            // 保存事件，以便稍后触发
            this.deferredPrompt = e;
            
            // 等待用户与页面交互后再显示提示
            this.setupUserInteractionListener();
        });
        
        // 监听安装完成事件
        window.addEventListener('appinstalled', () => {
            // 隐藏安装提示
            this.hideInstallPrompt();
            // 清除保存的安装事件
            this.deferredPrompt = null;
            // 清除用户交互监听器
            this.removeUserInteractionListener();
        });
    }
    
    // 设置用户交互监听器
    setupUserInteractionListener() {
        // 定义用户交互事件类型
        const interactionEvents = ['click', 'touchstart', 'keydown', 'scroll', 'wheel'];
        
        // 交互处理函数
        const handleInteraction = () => {
            // 显示自定义安装提示
            this.showInstallPrompt();
            // 移除监听器，避免重复触发
            this.removeUserInteractionListener();
        };
        
        // 添加监听器
        interactionEvents.forEach(event => {
            window.addEventListener(event, handleInteraction, { once: true, passive: true });
        });
        
        // 保存监听器引用
        this.userInteractionHandler = handleInteraction;
    }
    
    // 移除用户交互监听器
    removeUserInteractionListener() {
        if (this.userInteractionHandler) {
            // 定义用户交互事件类型
            const interactionEvents = ['click', 'touchstart', 'keydown', 'scroll', 'wheel'];
            
            // 移除监听器
            interactionEvents.forEach(event => {
                window.removeEventListener(event, this.userInteractionHandler);
            });
            
            // 清除引用
            this.userInteractionHandler = null;
        }
    }
    
    // 显示安装提示
    showInstallPrompt() {
        const installPrompt = document.getElementById('installPrompt');
        if (installPrompt) {
            installPrompt.classList.remove('hidden');
        }
    }
    
    // 隐藏安装提示
    hideInstallPrompt() {
        const installPrompt = document.getElementById('installPrompt');
        if (installPrompt) {
            installPrompt.classList.add('hidden');
        }
    }
    
    // 处理安装事件
    async handleInstall() {
        if (this.deferredPrompt) {
            // 显示浏览器内置的安装提示
            this.deferredPrompt.prompt();
            
            // 等待用户响应
            const { outcome } = await this.deferredPrompt.userChoice;
            console.log(`User ${outcome} the install prompt`);
            
            // 清除保存的安装事件
            this.deferredPrompt = null;
            
            // 隐藏自定义提示
            this.hideInstallPrompt();
        }
    }
    
    // 处理安装提示关闭
    handleDismissInstall() {
        // 隐藏安装提示
        this.hideInstallPrompt();
        // 保存用户已忽略提示的状态
        localStorage.setItem('installPromptDismissed', 'true');
    }

    detectOperatingSystem() {
        // 根据navigator.platform检测操作系统
        const platform = navigator.platform.toLowerCase();
        if (platform.includes('win')) {
            return 'Windows';
        } else if (platform.includes('linux')) {
            return 'Linux';
        } else if (platform.includes('mac')) {
            return 'macOS';
        } else {
            return 'Unknown';
        }
    }

    showAuthorizationPrompt() {
        const configGrid = document.getElementById('configGrid');
        if (configGrid) {
            const optPathDisplay = this.osType === 'Windows' ? 'C:/opt' : '/opt';
            configGrid.innerHTML = `
                <div class="welcome-container">
                    <h2>欢迎使用本地apollo配置编辑器</h2>
                    <p>为了正常使用，请授权访问<strong>${optPathDisplay}</strong>目录</p>
                    <button id="authorizeBtn" class="select-dir-btn">
                        授权访问${optPathDisplay}目录
                    </button>
                </div>
            `;
            
            // 重置为居中样式
            configGrid.style.display = 'flex';
            configGrid.style.alignItems = 'center';
            configGrid.style.justifyContent = 'center';
            
            // 添加授权按钮事件
            const authorizeBtn = document.getElementById('authorizeBtn');
            if (authorizeBtn) {
                authorizeBtn.addEventListener('click', () => {
                    this.authorizeOptDirectory();
                });
            }
        }
    }

    async authorizeOptDirectory() {
        try {
            // 提示用户选择opt目录
            const directoryHandle = await window.showDirectoryPicker({
                mode: 'readwrite',
                startIn: 'desktop',
                id: 'opt-directory-authorization'
            });
            
            // 验证用户选择的是否为opt目录
            if (directoryHandle.name.toLowerCase() === 'opt') {
                this.optDirectoryHandle = directoryHandle;
                this.isAuthorized = true;
                
                // 读取server.properties文件
                await this.readServerProperties();
                
                // 加载配置
                await this.loadConfigs();
            } else {
                const optPathDisplay = this.osType === 'Windows' ? 'C:/opt' : '/opt';
                this.showMessage(`请选择正确的${optPathDisplay}目录`, '错误');
                this.showAuthorizationPrompt();
            }
        } catch (err) {
            console.error('授权失败:', err);
            this.showMessage('授权失败，请重新尝试', '错误');
            this.showAuthorizationPrompt();
        }
    }

    async readServerProperties() {
        try {
            if (this.optDirectoryHandle) {
                // 尝试获取settings目录
                const settingsDir = await this.optDirectoryHandle.getDirectoryHandle('settings', { create: true });
                
                // 尝试获取server.properties文件
                let fileHandle;
                try {
                    fileHandle = await settingsDir.getFileHandle('server.properties', { create: true });
                } catch (err) {
                    // 文件不存在，创建一个默认的
                    fileHandle = await settingsDir.getFileHandle('server.properties', { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write('[General]\n');
                    await writable.close();
                }
                
                // 读取文件内容
                const file = await fileHandle.getFile();
                const content = await file.text();
                
                // 解析env配置
                const lines = content.split('\n');
                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (trimmedLine.startsWith('env=')) {
                        const envValue = trimmedLine.split('=', 2)[1].trim();
                        this.isLocalEnv = envValue === 'Local';
                        break;
                    }
                }
                
                // 更新UI
                this.updateEnvironmentUI();
            }
        } catch (err) {
            console.error('读取server.properties失败:', err);
            // 使用默认值
            this.isLocalEnv = false;
            this.updateEnvironmentUI();
        }
    }

    updateEnvironmentUI() {
        const envLabel = document.getElementById('envLabel');
        const onlineBanner = document.getElementById('onlineModeBanner');
        
        if (this.isLocalEnv) {
            envLabel.textContent = '本地';
            envLabel.className = 'env-label local';
            // 本地模式，隐藏横幅
            if (onlineBanner) {
                onlineBanner.classList.add('hidden');
            }
        } else {
            envLabel.textContent = '在线';
            envLabel.className = 'env-label online';
            // 在线模式，显示横幅
            if (onlineBanner) {
                onlineBanner.classList.remove('hidden');
            }
        }
    }

    initResizableInputs() {
        // 为每个可调整大小的输入框添加事件监听
        const inputs = document.querySelectorAll('.resizable-input');
        inputs.forEach(input => {
            // 设置自动高度
            this.autoResizeTextarea(input);
            
            // 添加输入事件，自动调整高度
            input.addEventListener('input', () => {
                this.autoResizeTextarea(input);
            });
        });
    }

    autoResizeTextarea(textarea) {
        // 重置高度
        textarea.style.height = 'auto';
        // 设置高度为内容高度
        textarea.style.height = textarea.scrollHeight + 'px';
    }

    closeApp() {
        // 简单关闭应用（在浏览器中只是刷新页面或关闭标签页）
        if (confirm('确定要关闭配置查看器吗？')) {
            window.location.reload();
        }
    }
}

// 初始化应用
let configViewer;
window.addEventListener('DOMContentLoaded', () => {
    configViewer = new SimpleConfigViewer();
});
