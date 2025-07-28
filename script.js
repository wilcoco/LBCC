// 노동 가치 코인 시스템 JavaScript - 서버 기반

class LaborValueCoinSystem {
    constructor() {
        // 서버 기반 시스템으로 변경 - localStorage 대신 API 사용
        this.currentUser = localStorage.getItem('currentUser') || null;
        this.currentUserData = null;
        this.contents = [];
        
        this.initializeEventListeners();
        this.loadInitialData();
        
        // Initialize drag and drop after DOM is ready
        setTimeout(() => {
            initializeDragAndDrop();
        }, 100);
    }
    
    // 초기 데이터 로드
    async loadInitialData() {
        try {
            // 현재 사용자 정보 로드
            if (this.currentUser) {
                this.currentUserData = await APIClient.getUser(this.currentUser);
            }
            
            // 모든 컨텐츠 로드
            this.contents = await APIClient.getContents();
            this.updateUI();
        } catch (error) {
            console.error('초기 데이터 로드 실패:', error);
            this.updateUI();
        }
    }

    initializeEventListeners() {
        // 모달 관련
        document.querySelectorAll('.close').forEach(closeBtn => {
            closeBtn.addEventListener('click', (e) => {
                e.target.closest('.modal').style.display = 'none';
            });
        });

        // 모달 외부 클릭시 닫기
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.style.display = 'none';
            }
        });

        // 네비게이션 버튼들
        document.getElementById('login-btn').addEventListener('click', () => {
            document.getElementById('login-modal').style.display = 'block';
        });

        document.getElementById('register-btn').addEventListener('click', () => {
            document.getElementById('register-modal').style.display = 'block';
        });

        document.getElementById('create-content-btn').addEventListener('click', () => {
            if (!this.currentUser) {
                alert('로그인이 필요합니다.');
                return;
            }
            document.getElementById('content-modal').style.display = 'block';
        });

        document.getElementById('logout-btn').addEventListener('click', () => {
            this.logout();
        });

        // 로그인
        document.getElementById('login-submit').addEventListener('click', () => {
            const username = document.getElementById('login-username').value.trim();
            if (username) {
                this.login(username);
            }
        });

        // 회원가입
        document.getElementById('register-submit').addEventListener('click', () => {
            const username = document.getElementById('register-username').value.trim();
            if (username) {
                this.register(username);
            }
        });

        // 컨텐츠 생성
        document.getElementById('content-submit').addEventListener('click', () => {
            const title = document.getElementById('content-title').value.trim();
            const richContent = document.getElementById('rich-editor').innerHTML;
            const url = document.getElementById('content-url').value.trim();
            const tags = document.getElementById('content-tags').value.trim();
            const files = this.getUploadedFiles();
            
            if (title && (richContent.trim() || files.length > 0)) {
                this.createContent(title, richContent, url, tags, files);
            } else {
                alert('제목과 내용을 입력해주세요.');
            }
        });
        
        // 파일 업로드 처리
        document.getElementById('file-upload').addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files);
        });

        // 투자
        document.getElementById('invest-submit').addEventListener('click', () => {
            const amount = parseInt(document.getElementById('invest-amount').value);
            const contentId = parseInt(document.getElementById('invest-modal').dataset.contentId);
            
            if (amount > 0) {
                this.investInContent(contentId, amount);
            }
        });
    }

    async register(username) {
        if (!username || username.trim() === '') {
            alert('사용자명을 입력해주세요.');
            return;
        }
        
        try {
            const result = await APIClient.register(username.trim());
            
            this.currentUser = username.trim();
            this.currentUserData = result.user;
            localStorage.setItem('currentUser', username.trim());
            
            // 컨텐츠 목록 새로고침
            this.contents = await APIClient.getContents();
            
            this.updateUI();
            alert(result.message);
            
            // Close modal
            document.getElementById('register-modal').style.display = 'none';
        } catch (error) {
            alert(error.message || '등록 실패');
        }
    }

    async login(username) {
        if (!username || username.trim() === '') {
            alert('사용자명을 입력해주세요.');
            return;
        }
        
        try {
            const result = await APIClient.login(username.trim());
            
            this.currentUser = username.trim();
            this.currentUserData = result.user;
            localStorage.setItem('currentUser', username.trim());
            
            // 컨텐츠 목록 새로고침
            this.contents = await APIClient.getContents();
            
            this.updateUI();
            alert(result.message);
            
            // Close modal
            document.getElementById('login-modal').style.display = 'none';
        } catch (error) {
            alert(error.message || '로그인 실패');
        }
    }

    logout() {
        this.currentUser = null;
        this.currentUserData = null;
        localStorage.removeItem('currentUser');
        this.updateUI();
    }

    async createContent(title, richContent, url, tags, files) {
        if (!this.currentUser) {
            alert('로그인이 필요합니다.');
            return;
        }
        
        try {
            const contentData = {
                title,
                richContent,
                url,
                tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
                files: files || [],
                author: this.currentUser
            };
            
            const result = await APIClient.createContent(contentData);
            
            // 컨텐츠 목록 새로고침
            this.contents = await APIClient.getContents();
            
            document.getElementById('content-modal').style.display = 'none';
            this.clearContentForm();
            this.updateUI();
            alert(result.message);
        } catch (error) {
            alert(error.message || '컨텐츠 생성 실패');
        }
    }

    async investInContent(contentId, amount) {
        if (!this.currentUser || !this.currentUserData) {
            alert('로그인이 필요합니다.');
            return;
        }
        
        try {
            const result = await APIClient.invest(contentId, amount, this.currentUser);
            
            // 사용자 정보 업데이트
            if (this.currentUserData) {
                this.currentUserData.balance = result.newBalance;
            }
            
            // 컨텐츠 목록 새로고침
            this.contents = await APIClient.getContents();
            
            this.updateUI();
            
            // 투자 현황도 새로고침
            if (this.currentUser && this.currentUserData) {
                this.updateInvestmentsList();
            }
            
            alert(result.message);
            
            // 투자 모달 닫기
            document.getElementById('invest-modal').style.display = 'none';
        } catch (error) {
            alert(error.message || '투자 실패');
        }

        // 투자 히스토리 기록
        content.investmentHistory.push({
            investor: this.currentUser,
            amount: amount,
            timestamp: new Date().toISOString(),
            totalInvestmentAfter: content.totalInvestment
        });

        this.saveData();
        document.getElementById('invest-modal').style.display = 'none';
        document.getElementById('invest-amount').value = '';
        this.updateUI();
        alert(`${amount} 코인을 투자했습니다.`);
    }

    updateUI() {
        // 사용자 정보 업데이트
        if (this.currentUser && this.currentUserData) {
            document.getElementById('current-user').textContent = `사용자: ${this.currentUser}`;
            document.getElementById('user-balance').textContent = `잔액: ${this.currentUserData.balance.toLocaleString()}`;
            document.getElementById('login-btn').style.display = 'none';
            document.getElementById('register-btn').style.display = 'none';
            document.getElementById('logout-btn').style.display = 'inline-block';
            document.querySelector('.my-investments').style.display = 'block';
        } else {
            document.getElementById('current-user').textContent = '사용자: 게스트';
            document.getElementById('user-balance').textContent = '잔액: 0';
            document.getElementById('login-btn').style.display = 'inline-block';
            document.getElementById('register-btn').style.display = 'inline-block';
            document.getElementById('logout-btn').style.display = 'none';
            document.querySelector('.my-investments').style.display = 'none';
        }

        // 컨텐츠 목록 업데이트
        this.updateContentsList();
        
        // 투자 현황 업데이트
        if (this.currentUser && this.currentUserData) {
            this.updateInvestmentsList();
        }
    }

    updateContentsList() {
        const container = document.getElementById('contents-container');
        container.innerHTML = '';

        if (this.contents.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #718096;">아직 생성된 컨텐츠가 없습니다.</p>';
            return;
        }

        // 최신순으로 정렬
        const sortedContents = [...this.contents].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        sortedContents.forEach(content => {
            const contentElement = this.createContentElement(content);
            container.appendChild(contentElement);
        });
    }

    createContentElement(content) {
        const div = document.createElement('div');
        div.className = 'content-item';

        // 서버 응답 구조에 맞게 수정
        const investorCount = content.investorCount || 0;
        const totalInvestment = content.totalInvestment || 0;
        const averageInvestment = totalInvestment > 0 && investorCount > 0 ? Math.floor(totalInvestment / investorCount) : 0;

        div.innerHTML = `
            <div class="content-header">
                <div>
                    <div class="content-title">${content.title}</div>
                    <div class="content-author">작성자: ${content.author}</div>
                </div>
            </div>
            <div class="content-description">${content.richContent || content.description || ''}</div>
            ${this.renderContentMedia(content)}
            ${content.url ? `<div style="margin-bottom: 15px;"><a href="${content.url}" target="_blank" style="color: #4299e1;">링크 보기</a></div>` : ''}
            ${this.renderContentTags(content)}
            <div class="content-stats">
                <div class="stat-item">
                    <div class="stat-value">${totalInvestment.toLocaleString()}</div>
                    <div class="stat-label">총 투자액</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${investorCount}</div>
                    <div class="stat-label">투자자 수</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${averageInvestment.toLocaleString()}</div>
                    <div class="stat-label">평균 투자액</div>
                </div>
            </div>
            <button class="invest-btn" onclick="system.openInvestModal(${content.id})" 
                    ${!this.currentUser ? 'disabled' : ''}>
                ${!this.currentUser ? '로그인 필요' : '투자하기'}
            </button>
            ${this.createInvestorsList(content)}
        `;

        return div;
    }

    createInvestorsList(content) {
        // 서버 응답에서 topInvestors 사용
        if (!content.topInvestors || content.topInvestors.length === 0) {
            return '';
        }

        const totalInvestment = content.totalInvestment || 0;
        const investorsHtml = content.topInvestors.map(investor => {
            const share = totalInvestment > 0 ? ((investor.amount / totalInvestment) * 100).toFixed(1) : '0.0';
            return `<div class="investor-item">
                <span>${investor.username}</span>
                <span>${investor.amount.toLocaleString()} (${share}%)</span>
            </div>`;
        }).join('');

        return `
            <div class="investors-list">
                <div class="investors-title">주요 투자자</div>
                ${investorsHtml}
            </div>
        `;
    }

    async updateInvestmentsList() {
        const container = document.getElementById('investments-container');
        
        if (!this.currentUser) {
            container.innerHTML = '<p style="text-align: center; color: #718096;">로그인이 필요합니다.</p>';
            return;
        }
        
        try {
            console.log('투자 현황 로드 시도:', this.currentUser);
            const investmentData = await APIClient.getUserInvestments(this.currentUser);
            console.log('투자 현황 데이터:', investmentData);
            
            if (!investmentData || !investmentData.investments || investmentData.investments.length === 0) {
                container.innerHTML = '<p style="text-align: center; color: #718096;">아직 투자한 컨텐츠가 없습니다.</p>';
                return;
            }
            
            // 투자 요약 정보
            container.innerHTML = `
                <div style="margin-bottom: 20px; padding: 15px; background: #e6fffa; border-radius: 8px; border-left: 4px solid #38b2ac;">
                    <div style="font-weight: 600; color: #2d3748; margin-bottom: 8px;">투자 요약</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; font-size: 14px; color: #4a5568;">
                        <span>총 투자액: ${investmentData.totalInvested.toLocaleString()} 코인</span>
                        <span style="color: #38a169;">총 배당: ${(investmentData.totalDividends || 0).toLocaleString()} 코인</span>
                        <span>투자 컨텐츠: ${investmentData.investmentCount}개</span>
                    </div>
                </div>
            `;
            
            // 각 투자 내역 표시
            investmentData.investments.forEach(investment => {
                const investmentElement = document.createElement('div');
                investmentElement.className = 'investment-item';
                
                // 배당 내역 HTML 생성
                let dividendHistoryHtml = '';
                if (investment.dividendHistory && investment.dividendHistory.length > 0) {
                    dividendHistoryHtml = `
                        <div class="dividend-history" style="margin-top: 10px; padding: 10px; background: #f0fff4; border-radius: 6px; border-left: 3px solid #38a169;">
                            <div style="font-size: 12px; font-weight: 600; color: #2f855a; margin-bottom: 5px;">배당 내역 (${investment.dividendHistory.length}건)</div>
                            ${investment.dividendHistory.slice(0, 3).map(dividend => `
                                <div style="font-size: 11px; color: #4a5568; margin-bottom: 3px;">
                                    <span style="color: #38a169; font-weight: 600;">${dividend.amount.toLocaleString()}코인</span> 
                                    배당 (${dividend.fromUsername}님 투자 ${dividend.newInvestmentAmount.toLocaleString()}코인)
                                    <span style="color: #a0aec0; margin-left: 5px;">${new Date(dividend.timestamp).toLocaleDateString()}</span>
                                </div>
                            `).join('')}
                            ${investment.dividendHistory.length > 3 ? `<div style="font-size: 11px; color: #a0aec0; text-align: center; margin-top: 5px;">... 외 ${investment.dividendHistory.length - 3}건 더</div>` : ''}
                        </div>
                    `;
                }
                
                investmentElement.innerHTML = `
                    <div class="investment-title">${investment.contentTitle}</div>
                    <div class="investment-author">작성자: ${investment.contentAuthor}</div>
                    <div class="investment-details">
                        <span>내 투자액: ${investment.totalInvested.toLocaleString()} 코인</span>
                        <span style="color: #38a169;">받은 배당: ${(investment.totalDividends || 0).toLocaleString()} 코인</span>
                        <span>현재 지분: ${investment.currentShare}%</span>
                        <span>컨텐츠 총 투자: ${investment.totalContentInvestment.toLocaleString()} 코인</span>
                    </div>
                    ${dividendHistoryHtml}
                `;
                container.appendChild(investmentElement);
            });
            
        } catch (error) {
            console.error('투자 현황 로드 실패:', error);
            // 오류 대신 친절한 메시지 표시
            container.innerHTML = `
                <div style="text-align: center; padding: 30px; color: #4a5568;">
                    <div style="font-size: 48px; margin-bottom: 16px;">💰</div>
                    <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px; color: #2d3748;">아직 투자 내역이 없습니다</div>
                    <div style="font-size: 14px; color: #718096; line-height: 1.5;">
                        마음에 드는 컨텐츠에 투자해보세요!<br>
                        좋은 컨텐츠를 먼저 발견하면 더 많은 배당을 받을 수 있습니다.
                    </div>
                </div>
            `;
        }
    }

    openInvestModal(contentId) {
        const content = this.contents.find(c => c.id === contentId);
        if (!content) return;

        document.getElementById('invest-content-title').textContent = `"${content.title}"에 투자`;
        document.getElementById('invest-modal').dataset.contentId = contentId;
        document.getElementById('invest-modal').style.display = 'block';
    }

    handleFileUpload(files) {
        const preview = document.getElementById('file-preview');
        
        Array.from(files).forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.dataset.fileName = file.name;
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-file';
            removeBtn.innerHTML = '×';
            removeBtn.onclick = () => fileItem.remove();
            
            const fileName = document.createElement('div');
            fileName.className = 'file-name';
            fileName.textContent = file.name;
            
            if (file.type.startsWith('image/')) {
                const img = document.createElement('img');
                img.src = URL.createObjectURL(file);
                fileItem.appendChild(img);
            } else if (file.type.startsWith('video/')) {
                const video = document.createElement('video');
                video.src = URL.createObjectURL(file);
                video.controls = true;
                fileItem.appendChild(video);
            } else if (file.type.startsWith('audio/')) {
                const audio = document.createElement('audio');
                audio.src = URL.createObjectURL(file);
                audio.controls = true;
                fileItem.appendChild(audio);
            } else {
                const fileIcon = document.createElement('div');
                fileIcon.innerHTML = '📄';
                fileIcon.style.fontSize = '40px';
                fileItem.appendChild(fileIcon);
            }
            
            fileItem.appendChild(fileName);
            fileItem.appendChild(removeBtn);
            preview.appendChild(fileItem);
        });
    }
    
    getUploadedFiles() {
        const preview = document.getElementById('file-preview');
        const fileItems = preview.querySelectorAll('.file-item');
        return Array.from(fileItems).map(item => ({
            name: item.dataset.fileName,
            type: 'uploaded',
            element: item.cloneNode(true)
        }));
    }

    clearContentForm() {
        document.getElementById('content-title').value = '';
        document.getElementById('rich-editor').innerHTML = '';
        document.getElementById('content-url').value = '';
        document.getElementById('content-tags').value = '';
        document.getElementById('file-preview').innerHTML = '';
        document.getElementById('file-upload').value = '';
    }

    renderContentMedia(content) {
        if (!content.files || content.files.length === 0) {
            return '';
        }
        
        const mediaHtml = content.files.map(file => {
            const element = file.element;
            if (element) {
                const cloned = element.cloneNode(true);
                // Remove the remove button from display
                const removeBtn = cloned.querySelector('.remove-file');
                if (removeBtn) removeBtn.remove();
                return `<div class="content-media">${cloned.innerHTML}</div>`;
            }
            return '';
        }).join('');
        
        return mediaHtml ? `<div class="content-media-container">${mediaHtml}</div>` : '';
    }
    
    renderContentTags(content) {
        if (!content.tags || content.tags.length === 0) {
            return '';
        }
        
        const tagsHtml = content.tags.map(tag => 
            `<span class="tag">${tag}</span>`
        ).join('');
        
        return `<div class="content-tags">${tagsHtml}</div>`;
    }

    saveData() {
        localStorage.setItem('users', JSON.stringify(this.users));
        localStorage.setItem('contents', JSON.stringify(this.contents));
        localStorage.setItem('nextContentId', this.nextContentId.toString());
    }
}

// Rich Text Editor Functions
function formatText(command) {
    document.execCommand(command, false, null);
    document.getElementById('rich-editor').focus();
}

function insertLink() {
    const url = prompt('링크 URL을 입력하세요:');
    if (url) {
        document.execCommand('createLink', false, url);
        document.getElementById('rich-editor').focus();
    }
}

function insertImageDialog() {
    const url = prompt('이미지 URL을 입력하세요 (또는 파일 업로드 버튼 사용):');
    if (url) {
        insertImageAtCursor(url);
    }
}

function insertVideoDialog() {
    const url = prompt('동영상 URL을 입력하세요:');
    if (url) {
        insertVideoAtCursor(url);
    }
}

function insertAudioDialog() {
    const url = prompt('음악 URL을 입력하세요:');
    if (url) {
        insertAudioAtCursor(url);
    }
}

function insertFileInline(input) {
    const file = input.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const url = e.target.result;
        
        if (file.type.startsWith('image/')) {
            insertImageAtCursor(url, file.name);
        } else if (file.type.startsWith('video/')) {
            insertVideoAtCursor(url, file.name);
        } else if (file.type.startsWith('audio/')) {
            insertAudioAtCursor(url, file.name);
        }
    };
    reader.readAsDataURL(file);
    
    // Clear the input
    input.value = '';
}

function insertImageAtCursor(src, alt = '') {
    const editor = document.getElementById('rich-editor');
    const img = document.createElement('img');
    img.src = src;
    img.alt = alt;
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.margin = '10px 0';
    img.style.borderRadius = '8px';
    img.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
    img.classList.add('inline-media');
    
    insertElementAtCursor(img);
}

function insertVideoAtCursor(src, title = '') {
    const editor = document.getElementById('rich-editor');
    const video = document.createElement('video');
    video.src = src;
    video.controls = true;
    video.style.width = '100%';
    video.style.maxWidth = '600px';
    video.style.height = 'auto';
    video.style.margin = '10px 0';
    video.style.borderRadius = '8px';
    video.classList.add('inline-media');
    if (title) video.title = title;
    
    insertElementAtCursor(video);
}

function insertAudioAtCursor(src, title = '') {
    const editor = document.getElementById('rich-editor');
    const audio = document.createElement('audio');
    audio.src = src;
    audio.controls = true;
    audio.style.width = '100%';
    audio.style.margin = '10px 0';
    audio.classList.add('inline-media');
    if (title) audio.title = title;
    
    insertElementAtCursor(audio);
}

function insertElementAtCursor(element) {
    const editor = document.getElementById('rich-editor');
    const selection = window.getSelection();
    
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        
        // Add line breaks around the element for better formatting
        const br1 = document.createElement('br');
        const br2 = document.createElement('br');
        
        range.insertNode(br2);
        range.insertNode(element);
        range.insertNode(br1);
        
        // Move cursor after the inserted element
        range.setStartAfter(br2);
        range.setEndAfter(br2);
        selection.removeAllRanges();
        selection.addRange(range);
    } else {
        // If no selection, append to the end
        editor.appendChild(document.createElement('br'));
        editor.appendChild(element);
        editor.appendChild(document.createElement('br'));
    }
    
    editor.focus();
}

// Drag and Drop Support
function initializeDragAndDrop() {
    const editor = document.getElementById('rich-editor');
    
    editor.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        editor.style.backgroundColor = '#f0f8ff';
        editor.style.border = '2px dashed #4299e1';
    });
    
    editor.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        editor.style.backgroundColor = '';
        editor.style.border = '';
    });
    
    editor.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        editor.style.backgroundColor = '';
        editor.style.border = '';
        
        const files = Array.from(e.dataTransfer.files);
        
        files.forEach(file => {
            if (file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/')) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    const url = event.target.result;
                    
                    if (file.type.startsWith('image/')) {
                        insertImageAtCursor(url, file.name);
                    } else if (file.type.startsWith('video/')) {
                        insertVideoAtCursor(url, file.name);
                    } else if (file.type.startsWith('audio/')) {
                        insertAudioAtCursor(url, file.name);
                    }
                };
                reader.readAsDataURL(file);
            }
        });
    });
}

// Rich Text Editor Functions
function formatText(command) {
    document.execCommand(command, false, null);
    document.getElementById('rich-editor').focus();
}

function insertLink() {
    const url = prompt('링크 URL을 입력하세요:');
    if (url) {
        document.execCommand('createLink', false, url);
        document.getElementById('rich-editor').focus();
    }
}

function insertImageDialog() {
    const url = prompt('이미지 URL을 입력하세요 (또는 파일 업로드 버튼 사용):');
    if (url) {
        insertImageAtCursor(url);
    }
}

function insertVideoDialog() {
    const url = prompt('동영상 URL을 입력하세요:');
    if (url) {
        insertVideoAtCursor(url);
    }
}

function insertAudioDialog() {
    const url = prompt('음악 URL을 입력하세요:');
    if (url) {
        insertAudioAtCursor(url);
    }
}

function insertFileInline(input) {
    const file = input.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const url = e.target.result;
        
        if (file.type.startsWith('image/')) {
            insertImageAtCursor(url, file.name);
        } else if (file.type.startsWith('video/')) {
            insertVideoAtCursor(url, file.name);
        } else if (file.type.startsWith('audio/')) {
            insertAudioAtCursor(url, file.name);
        }
    };
    reader.readAsDataURL(file);
    
    // Clear the input
    input.value = '';
}

function insertImageAtCursor(src, alt = '') {
    const editor = document.getElementById('rich-editor');
    const img = document.createElement('img');
    img.src = src;
    img.alt = alt;
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.margin = '10px 0';
    img.style.borderRadius = '8px';
    img.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
    img.classList.add('inline-media');
    
    insertElementAtCursor(img);
}

function insertVideoAtCursor(src, title = '') {
    const editor = document.getElementById('rich-editor');
    const video = document.createElement('video');
    video.src = src;
    video.controls = true;
    video.style.width = '100%';
    video.style.maxWidth = '600px';
    video.style.height = 'auto';
    video.style.margin = '10px 0';
    video.style.borderRadius = '8px';
    video.classList.add('inline-media');
    if (title) video.title = title;
    
    insertElementAtCursor(video);
}

function insertAudioAtCursor(src, title = '') {
    const editor = document.getElementById('rich-editor');
    const audio = document.createElement('audio');
    audio.src = src;
    audio.controls = true;
    audio.style.width = '100%';
    audio.style.margin = '10px 0';
    audio.classList.add('inline-media');
    if (title) audio.title = title;
    
    insertElementAtCursor(audio);
}

function insertElementAtCursor(element) {
    const editor = document.getElementById('rich-editor');
    const selection = window.getSelection();
    
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        
        // Add line breaks around the element for better formatting
        const br1 = document.createElement('br');
        const br2 = document.createElement('br');
        
        range.insertNode(br2);
        range.insertNode(element);
        range.insertNode(br1);
        
        // Move cursor after the inserted element
        range.setStartAfter(br2);
        range.setEndAfter(br2);
        selection.removeAllRanges();
        selection.addRange(range);
    } else {
        // If no selection, append to the end
        editor.appendChild(document.createElement('br'));
        editor.appendChild(element);
        editor.appendChild(document.createElement('br'));
    }
    
    editor.focus();
}

// Drag and Drop Support
function initializeDragAndDrop() {
    const editor = document.getElementById('rich-editor');
    
    if (!editor) {
        console.log('Rich editor not found, retrying in 500ms...');
        setTimeout(initializeDragAndDrop, 500);
        return;
    }
    
    editor.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        editor.style.backgroundColor = '#f0f8ff';
        editor.style.border = '2px dashed #4299e1';
    });
    
    editor.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        editor.style.backgroundColor = '';
        editor.style.border = '';
    });
    
    editor.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        editor.style.backgroundColor = '';
        editor.style.border = '';
        
        const files = Array.from(e.dataTransfer.files);
        
        files.forEach(file => {
            if (file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/')) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    const url = event.target.result;
                    
                    if (file.type.startsWith('image/')) {
                        insertImageAtCursor(url, file.name);
                    } else if (file.type.startsWith('video/')) {
                        insertVideoAtCursor(url, file.name);
                    } else if (file.type.startsWith('audio/')) {
                        insertAudioAtCursor(url, file.name);
                    }
                };
                reader.readAsDataURL(file);
            }
        });
    });
}

// YouTube 지원 함수
function extractYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// 개선된 동영상 삽입 함수 (YouTube 지원)
function insertVideoAtCursorImproved(src, title = '') {
    const editor = document.getElementById('rich-editor');
    
    // YouTube URL 처리
    if (src.includes('youtube.com/watch') || src.includes('youtu.be/')) {
        const videoId = extractYouTubeId(src);
        if (videoId) {
            const iframe = document.createElement('iframe');
            iframe.src = `https://www.youtube.com/embed/${videoId}`;
            iframe.width = '100%';
            iframe.height = '315';
            iframe.style.maxWidth = '600px';
            iframe.style.margin = '10px 0';
            iframe.style.borderRadius = '8px';
            iframe.frameBorder = '0';
            iframe.allowFullscreen = true;
            iframe.classList.add('inline-media');
            insertElementAtCursor(iframe);
            return;
        }
    }
    
    // 일반 동영상 파일 처리
    const video = document.createElement('video');
    video.src = src;
    video.controls = true;
    video.style.width = '100%';
    video.style.maxWidth = '600px';
    video.style.height = 'auto';
    video.style.margin = '10px 0';
    video.style.borderRadius = '8px';
    video.classList.add('inline-media');
    if (title) video.title = title;
    
    // 오류 처리
    video.onerror = function() {
        const errorMsg = document.createElement('div');
        errorMsg.innerHTML = `
            <div style="background: #fee2e2; border: 1px solid #fca5a5; padding: 15px; border-radius: 8px; margin: 10px 0; color: #991b1b;">
                <strong>⚠️ 동영상을 재생할 수 없습니다</strong><br>
                <small>지원되는 형식: MP4, WebM, OGG<br>
                또는 YouTube 링크를 사용해보세요.</small><br>
                <a href="${src}" target="_blank" style="color: #2563eb; text-decoration: underline;">원본 링크 보기</a>
            </div>
        `;
        video.parentNode.replaceChild(errorMsg, video);
    };
    
    insertElementAtCursor(video);
}

// 전역 시스템 인스턴스
const system = new LaborValueCoinSystem();
