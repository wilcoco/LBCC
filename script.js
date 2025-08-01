// 노동 가치 코인 시스템 JavaScript - 서버 기반

class LaborValueCoinSystem {
    constructor() {
        // 서버 기반 시스템으로 변경 - localStorage 대신 API 사용
        this.currentUser = localStorage.getItem('currentUser') || null;
        this.currentUserData = null;
        this.contents = [];
        this.localChain = null; // 로컬 체인 인스턴스
        
        this.initializeEventListeners();
        this.loadInitialData();
        this.setupLocalChainEvents();
        
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
                
                // 로컬 체인 초기화
                this.initializeLocalChain();
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
            
            // 🎯 UI 업데이트 (계수 정보 포함)
            await this.updateUI();
            
            // 투자 현황도 새로고침
            if (this.currentUser && this.currentUserData) {
                this.updateInvestmentsList();
            }
        
        // 로컬 체인에 투자 블록 추가
        if (this.localChain) {
            const blockData = {
                contentId: contentId,
                amount: amount,
                newBalance: result.newBalance,
                timestamp: new Date().toISOString(),
                serverResponse: {
                    success: result.success,
                    message: result.message
                }
            };
            
            this.localChain.addBlock('invest', blockData);
            
            // 서버 데이터와 비교 검증 (1초 후)
            setTimeout(() => {
                this.verifyServerData();
            }, 1000);
        }
        
            alert(result.message);
            
            // 투자 모달 닫기
            document.getElementById('invest-modal').style.display = 'none';
            document.getElementById('invest-amount').value = '';
        } catch (error) {
            alert(error.message || '투자 실패');
        }
    }

    async updateUI() {
        // 사용자 정보 업데이트
        if (this.currentUser && this.currentUserData) {
            document.getElementById('current-user').textContent = `사용자: ${this.currentUser}`;
            document.getElementById('user-balance').textContent = `잔액: ${this.currentUserData.balance.toLocaleString()}`;
            
            // 🎯 계수 정보 표시
            await this.updateCoefficientDisplay();
            
            document.getElementById('login-btn').style.display = 'none';
            document.getElementById('register-btn').style.display = 'none';
            document.getElementById('logout-btn').style.display = 'inline-block';
            document.querySelector('.my-investments').style.display = 'block';
            
            // 🎯 계수 및 성과 정보 표시 활성화
            document.getElementById('user-coefficient').style.display = 'block';
            document.getElementById('performance-summary').style.display = 'block';
            
            // 로컬 체인 초기화 확인 (로그인 상태에서만)
            if (!this.localChain) {
                this.initializeLocalChain();
            }
        } else {
            document.getElementById('current-user').textContent = '사용자: 게스트';
            document.getElementById('user-balance').textContent = '잔액: 0';
            document.getElementById('login-btn').style.display = 'inline-block';
            document.getElementById('register-btn').style.display = 'inline-block';
            document.getElementById('logout-btn').style.display = 'none';
            document.querySelector('.my-investments').style.display = 'none';
            
            // 🎯 계수 및 성과 정보 숨기기
            document.getElementById('user-coefficient').style.display = 'none';
            document.getElementById('performance-summary').style.display = 'none';
        }

        // 컨텐츠 목록 업데이트
        this.updateContentsList();
        
        // 투자 현황 업데이트
        if (this.currentUser && this.currentUserData) {
            this.updateInvestmentsList();
        }
    }
    
    // 🎯 계수 정보 표시 메서드
    async updateCoefficientDisplay() {
        if (!this.currentUser) {
            console.log('⚠️ 계수 업데이트 스킵: 사용자 로그인 안됨');
            return;
        }
        
        try {
            console.log(`🔍 ${this.currentUser} 계수 정보 로드 시도...`);
            const performance = await APIClient.getUserPerformance(this.currentUser);
            
            if (!performance) {
                throw new Error('성과 데이터가 비어있습니다.');
            }
            
            console.log(`✅ ${this.currentUser} 성과 데이터 로드 성공:`, performance);
            
            // 계수 정보 표시 업데이트
            const coefficientElement = document.getElementById('user-coefficient');
            if (coefficientElement) {
                const coefficient = performance.currentCoefficient || 1.0;
                const trend = this.getCoefficientTrend(performance.coefficientHistory || []);
                
                coefficientElement.innerHTML = `
                    <div class="coefficient-display">
                        <span class="coefficient-label">투자 신용도:</span>
                        <span class="coefficient-value">×${coefficient.toFixed(4)}</span>
                        <span class="coefficient-trend">${trend.icon} ${trend.change}</span>
                    </div>
                    <div class="coefficient-explanation">
                        투자 1코인 = 실제 지분 ${coefficient.toFixed(2)}코인 상당
                    </div>
                `;
            }
            
            // 성과 요약 정보 업데이트
            this.updatePerformanceSummary(performance);
            
        } catch (error) {
            console.error(`❌ ${this.currentUser} 계수 정보 로드 실패:`, error);
            
            // API 오류 상세 로깅
            if (error.message && error.message.includes('<!DOCTYPE')) {
                console.error('🚨 API 엔드포인트가 HTML 페이지를 반환하고 있습니다. 서버 라우트 문제일 가능성이 높습니다.');
            }
            
            // 기본 계수 표시 (오류 상황에서도 UI 유지)
            const coefficientElement = document.getElementById('user-coefficient');
            if (coefficientElement) {
                coefficientElement.innerHTML = `
                    <div class="coefficient-display">
                        <span class="coefficient-label">투자 신용도:</span>
                        <span class="coefficient-value">×1.0000</span>
                        <span class="coefficient-trend">⚠️ 로드 실패</span>
                    </div>
                    <div class="coefficient-explanation">
                        서버 연결 오류 - 기본값 표시 중
                    </div>
                `;
            }
            
            // 기본 성과 요약 표시
            this.updatePerformanceSummary({
                totalInvested: 0,
                totalDividends: 0,
                totalEffectiveValue: 0
            });
        }
    }
    
    // 계수 변동 추세 계산
    getCoefficientTrend(history) {
        if (!history || history.length < 2) {
            return { icon: '🟡', change: '신규' };
        }
        
        const latest = history[0];
        const previous = history[1];
        const change = latest.new_coefficient - previous.new_coefficient;
        
        if (change > 0.01) {
            return { icon: '↗️', change: `+${change.toFixed(4)}` };
        } else if (change < -0.01) {
            return { icon: '↘️', change: change.toFixed(4) };
        } else {
            return { icon: '➡️', change: '안정' };
        }
    }
    
    // 성과 요약 정보 업데이트
    updatePerformanceSummary(performance) {
        const summaryElement = document.getElementById('performance-summary');
        if (summaryElement && performance) {
            // Null 체크와 기본값 설정
            const totalInvested = (performance.totalInvested || 0);
            const totalDividends = (performance.totalDividends || 0);
            const totalEffectiveValue = (performance.totalEffectiveValue || 0);
            
            summaryElement.innerHTML = `
                <div class="performance-stats">
                    <div class="stat-item">
                        <span class="stat-label">총 투자:</span>
                        <span class="stat-value">${totalInvested.toLocaleString()}코인</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">총 배당:</span>
                        <span class="stat-value">${totalDividends.toLocaleString()}코인</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">효과적 가치:</span>
                        <span class="stat-value">${totalEffectiveValue.toLocaleString()}코인</span>
                    </div>
                </div>
            `;
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
            
            // 각 투자 내역 표시 (배열 체크 추가)
            const investments = investmentData.investments || [];
            if (Array.isArray(investments) && investments.length > 0) {
                investments.forEach(investment => {
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
                    <div class="investment-title">${investment.contentTitle || '제목 없음'}</div>
                    <div class="investment-author">작성자: ${investment.contentAuthor || '알 수 없음'}</div>
                    <div class="investment-details">
                        <span>내 투자액: ${(investment.totalInvested || 0).toLocaleString()} 코인</span>
                        <span style="color: #38a169;">받은 배당: ${(investment.totalDividends || 0).toLocaleString()} 코인</span>
                        <span>현재 지분: ${investment.currentShare || '0'}%</span>
                        <span>컨텐츠 총 투자: ${(investment.totalContentInvestment || 0).toLocaleString()} 코인</span>
                    </div>
                    ${dividendHistoryHtml}
                `;
                    container.appendChild(investmentElement);
                });
            } else {
                // 투자 내역이 없거나 잘못된 형식일 때
                const noInvestmentElement = document.createElement('div');
                noInvestmentElement.style.cssText = 'text-align: center; padding: 30px; color: #4a5568;';
                noInvestmentElement.innerHTML = `
                    <div style="font-size: 48px; margin-bottom: 16px;">💰</div>
                    <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px; color: #2d3748;">아직 투자 내역이 없습니다</div>
                    <div style="font-size: 14px; color: #718096; line-height: 1.5;">
                        마음에 드는 컨텐츠에 투자해보세요!<br/>
                        좋은 컨텐츠를 먼저 발견하면 더 많은 배당을 받을 수 있습니다.
                    </div>
                `;
                container.appendChild(noInvestmentElement);
            }
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

    // ===== 로컬 체인 기능 =====
    
    // 로컬 체인 이벤트 설정
    setupLocalChainEvents() {
        // 블록 생성 이벤트 리스너
        window.addEventListener('blockCreated', (event) => {
            const { block, username } = event.detail;
            console.log(`🧩 새 블록 생성됨:`, block);
            
            // 블록 생성 애니메이션 표시
            this.showBlockCreationAnimation(block);
            
            // 로컬 체인 상태 업데이트
            this.displayLocalChainStatus();
        });
    }
    
    // 로컬 체인 초기화 (서버 데이터 동기화 포함)
    async initializeLocalChain() {
        if (this.currentUser && typeof LocalChain !== 'undefined') {
            this.localChain = new LocalChain(this.currentUser);
            console.log(`🔗 로컬 체인 초기화 시작: ${this.currentUser}`);
            
            // 서버에서 기존 투자 데이터 가져와서 로컬 체인에 동기화
            try {
                const serverData = await APIClient.getUserInvestments(this.currentUser);
                await this.syncLocalChainWithServer(serverData);
                console.log(`🔄 서버 데이터 동기화 완료`);
            } catch (error) {
                console.warn('서버 데이터 동기화 실패:', error.message);
            }
            
            console.log(`🔗 로컬 체인 초기화 완료: ${this.currentUser}`);
            console.log('체인 정보:', this.localChain.getChainInfo());
            this.displayLocalChainStatus();
        } else {
            console.warn('로컬 체인을 초기화할 수 없습니다. LocalChain 클래스가 로드되지 않았습니다.');
        }
    }
    
    // 서버 데이터와 로컬 체인 동기화
    async syncLocalChainWithServer(serverData) {
        if (!this.localChain || !serverData.investments) {
            return;
        }
        
        console.log('🔄 서버 데이터와 로컬 체인 동기화 시작...');
        
        // 서버에서 가져온 투자 데이터를 로컬 체인에 추가
        for (const investment of serverData.investments) {
            const blockData = {
                contentId: investment.contentId,
                amount: investment.amount,
                timestamp: investment.timestamp,
                serverSync: true // 서버에서 동기화된 데이터임을 표시
            };
            
            // 로컬 체인에 블록 추가 (이벤트 발생 없이)
            this.localChain.addBlockSilent('invest', blockData);
        }
        
        console.log(`🔄 ${serverData.investments.length}개 투자 블록 동기화 완료`);
    }
    
    // 로컬 체인 상태 표시
    displayLocalChainStatus() {
        if (!this.localChain) return;
        
        const chainInfo = this.localChain.getChainInfo();
        let statusContainer = document.getElementById('local-chain-status');
        
        if (!statusContainer) {
            statusContainer = document.createElement('div');
            statusContainer.id = 'local-chain-status';
            statusContainer.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 20px;
                background: #1a202c;
                color: #e2e8f0;
                padding: 12px;
                border-radius: 8px;
                font-size: 12px;
                z-index: 999;
                max-width: 300px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                border: 1px solid #4a5568;
            `;
            document.body.appendChild(statusContainer);
        }
        
        statusContainer.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 8px; color: #63b3ed;">🔗 로컬 체인 상태</div>
            <div style="margin-bottom: 2px;">사용자: <span style="color: #68d391;">${chainInfo.username}</span></div>
            <div style="margin-bottom: 2px;">블록 수: <span style="color: #fbb6ce;">${chainInfo.blockCount}</span></div>
            <div style="margin-bottom: 2px;">머클 루트: <span style="color: #fbd38d;">${chainInfo.merkleRoot ? chainInfo.merkleRoot.substring(0, 10) + '...' : 'N/A'}</span></div>
            <div style="margin-bottom: 8px;">검증: ${chainInfo.validation.valid ? '<span style="color: #68d391;">✅</span>' : '<span style="color: #fc8181;">❌</span>'}</div>
            <div>
                <button onclick="system.showLocalChainVisualization()" style="background: #4299e1; color: white; border: none; padding: 6px 10px; border-radius: 4px; font-size: 10px; margin-right: 5px; cursor: pointer;">체인 보기</button>
                <button onclick="system.verifyServerData()" style="background: #38a169; color: white; border: none; padding: 6px 10px; border-radius: 4px; font-size: 10px; cursor: pointer;">검증</button>
            </div>
        `;
    }
    
    // 블록 생성 애니메이션
    showBlockCreationAnimation(block) {
        const animationDiv = document.createElement('div');
        animationDiv.className = 'block-creation-animation';
        animationDiv.innerHTML = `
            <div style="position: fixed; top: 20px; right: 20px; background: #e6fffa; border: 2px solid #38b2ac; border-radius: 8px; padding: 15px; z-index: 1000; animation: slideIn 0.5s ease-out; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                <div style="font-weight: bold; color: #2c7a7b; margin-bottom: 5px;">🧱 새 블록 생성됨!</div>
                <div style="font-size: 12px; color: #4a5568;">
                    <div>액션: ${block.action}</div>
                    <div>해시: ${block.hash}</div>
                    <div>시간: ${new Date(block.timestamp).toLocaleTimeString()}</div>
                    ${block.data && block.data.amount ? `<div style="color: #38a169; font-weight: bold;">💰 ${block.data.amount} 코인</div>` : ''}
                </div>
            </div>
        `;
        
        // CSS 애니메이션 추가
        if (!document.getElementById('block-animation-styles')) {
            const style = document.createElement('style');
            style.id = 'block-animation-styles';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(animationDiv);
        
        // 3초 후 슬라이드 아웃 애니메이션과 함께 제거
        setTimeout(() => {
            if (animationDiv.parentNode) {
                animationDiv.style.animation = 'slideOut 0.5s ease-in';
                setTimeout(() => {
                    if (animationDiv.parentNode) {
                        animationDiv.remove();
                    }
                }, 500);
            }
        }, 3000);
    }
    
    // 로컬 체인 시각화 표시
    showLocalChainVisualization() {
        if (!this.localChain) return;
        
        const visualizationData = this.localChain.getVisualizationData();
        
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            z-index: 2000;
            display: flex;
            justify-content: center;
            align-items: center;
        `;
        
        const content = document.createElement('div');
        content.style.cssText = `
            background: white;
            padding: 20px;
            border-radius: 12px;
            max-width: 80%;
            max-height: 80%;
            overflow-y: auto;
        `;
        
        content.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="margin: 0; color: #2d3748;">🔗 내 로컬 체인</h3>
                <button onclick="this.parentElement.parentElement.parentElement.remove()" style="background: #e53e3e; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer;">닫기</button>
            </div>
            <div class="chain-visualization">
                ${visualizationData.map((block, index) => `
                    <div style="display: flex; align-items: center; margin-bottom: 15px;">
                        <div style="
                            background: ${block.isGenesis ? '#4299e1' : block.action === 'invest' ? '#38a169' : '#a0aec0'};
                            color: white;
                            padding: 12px;
                            border-radius: 8px;
                            min-width: 250px;
                            margin-right: 10px;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                        ">
                            <div style="font-weight: bold; margin-bottom: 4px;">${block.isGenesis ? '🏁 제네시스' : '🧱 블록 #' + block.id}</div>
                            <div style="font-size: 12px; opacity: 0.9; margin-bottom: 2px;">액션: ${block.action}</div>
                            <div style="font-size: 10px; opacity: 0.7; margin-bottom: 2px;">해시: ${block.hash}</div>
                            <div style="font-size: 10px; opacity: 0.7; margin-bottom: 4px;">${new Date(block.timestamp).toLocaleString()}</div>
                            ${block.data && block.data.amount ? `<div style="font-size: 12px; background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 4px;">💰 ${block.data.amount} 코인</div>` : ''}
                        </div>
                        ${index < visualizationData.length - 1 ? '<div style="font-size: 20px; color: #a0aec0;">⬇️</div>' : ''}
                    </div>
                `).join('')}
            </div>
        `;
        
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        // 모달 외부 클릭 시 닫기
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }
    
    // 서버 데이터와 로컬 체인 비교
    async verifyServerData() {
        if (!this.localChain || !this.currentUser) {
            console.log('로컬 체인 또는 사용자 정보가 없습니다.');
            return;
        }
        
        try {
            // 서버에서 사용자 투자 현황 가져오기
            const serverData = await APIClient.getUserInvestments(this.currentUser);
            
            // 로컬 체인과 비교
            const verification = this.localChain.verifyWithServer(serverData);
            
            if (!verification.verified) {
                this.showDataDiscrepancyWarning(verification.discrepancies);
            } else {
                console.log('✅ 서버 데이터와 로컬 체인 일치 확인');
                alert('✅ 데이터 검증 완료: 서버와 로컬 체인이 일치합니다!');
            }
            
            return verification;
        } catch (error) {
            console.error('서버 데이터 검증 실패:', error);
            alert('❌ 데이터 검증 실패: ' + error.message);
            return { verified: false, error: error.message };
        }
    }
    
    // 데이터 불일치 경고 표시
    showDataDiscrepancyWarning(discrepancies) {
        // 기존 경고 제거
        const existingWarning = document.querySelector('.data-discrepancy-warning');
        if (existingWarning) {
            existingWarning.remove();
        }

        const warningDiv = document.createElement('div');
        warningDiv.className = 'data-discrepancy-warning';
        warningDiv.innerHTML = `
            <div style="background: #fed7d7; border: 2px solid #f56565; border-radius: 8px; padding: 15px; margin: 10px 0; color: #c53030;">
                <h4 style="margin: 0 0 10px 0;">⚠️ 데이터 불일치 감지</h4>
                <p style="margin: 0 0 10px 0;">로컬 체인과 서버 데이터가 일치하지 않습니다:</p>
                <ul style="margin: 0; padding-left: 20px;">
                    ${discrepancies.map(d => `
                        <li>로컬: ${d.local}, 서버: ${d.server} (${d.type})</li>
                    `).join('')}
                </ul>
                <div style="margin-top: 10px;">
                    <button onclick="system.recoverFromLocalChain()" style="background: #38a169; color: white; border: none; padding: 8px 16px; border-radius: 4px; margin-right: 10px; cursor: pointer;">로컬 체인으로 복구</button>
                    <button onclick="this.parentElement.parentElement.remove()" style="background: #a0aec0; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">무시</button>
                </div>
            </div>
        `;
        
        // 메인 컨테이너 상단에 경고 표시
        const mainContainer = document.querySelector('.container');
        if (mainContainer) {
            mainContainer.insertBefore(warningDiv, mainContainer.firstChild);
        }
    }
    
    // 로컬 체인으로부터 복구
    recoverFromLocalChain() {
        if (!this.localChain) {
            alert('로컬 체인이 초기화되지 않았습니다.');
            return;
        }
        
        const chainInfo = this.localChain.getChainInfo();
        const summary = chainInfo.summary;
        
        const recoveryData = {
            username: this.currentUser,
            localChainData: {
                totalInvested: summary.totalInvested,
                investmentCount: summary.investmentCount,
                merkleRoot: chainInfo.merkleRoot,
                blocks: this.localChain.getVisualizationData()
            }
        };
        
        console.log('복구 데이터:', recoveryData);
        
        alert(`로컬 체인 데이터:
총 투자액: ${summary.totalInvested} 코인
투자 건수: ${summary.investmentCount}건
블록 수: ${chainInfo.blockCount}개

실제 구현에서는 이 데이터를 서버에 전송하여 복구를 요청할 수 있습니다.`);
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
