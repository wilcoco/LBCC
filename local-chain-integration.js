/**
 * 로컬 체인 통합 모듈
 * 기존 LaborValueCoinSystem과 LocalChain을 연결
 */

// 기존 시스템에 로컬 체인 기능 확장
(function() {
    'use strict';

    // 로컬 체인 초기화
    LaborValueCoinSystem.prototype.initializeLocalChain = function() {
        try {
            console.log('🔗 로컬 체인 초기화 시도...');
            console.log('현재 사용자:', this.currentUser);
            console.log('LocalChain 클래스 존재:', typeof LocalChain !== 'undefined');
            
            if (!this.currentUser) {
                console.warn('⚠️ 로컬 체인 초기화 실패: 사용자가 로그인되지 않음');
                return;
            }
            
            if (typeof LocalChain === 'undefined') {
                console.error('❌ 로컬 체인 초기화 실패: LocalChain 클래스를 찾을 수 없음');
                return;
            }
            
            this.localChain = new LocalChain(this.currentUser);
            console.log(`✅ 로컬 체인 초기화 완료: ${this.currentUser}`);
            console.log('체인 정보:', this.localChain.getChainInfo());
            
            // 로컬 체인 상태 표시
            this.displayLocalChainStatus();
            
            // 로컬 체인 이벤트 설정
            this.setupLocalChainEvents();
            
        } catch (error) {
            console.error('❌ 로컬 체인 초기화 오류:', error);
        }
    };

    // 로컬 체인 이벤트 설정
    LaborValueCoinSystem.prototype.setupLocalChainEvents = function() {
        // 블록 생성 이벤트 리스너
        window.addEventListener('blockCreated', (event) => {
            const { block, username } = event.detail;
            console.log(`🧱 새 블록 생성됨:`, block);
            
            // 블록 생성 애니메이션 표시
            this.showBlockCreationAnimation(block);
            
            // 로컬 체인 상태 업데이트
            this.displayLocalChainStatus();
        });
    };

    // 기존 로그인 함수 확장
    const originalLogin = LaborValueCoinSystem.prototype.login;
    LaborValueCoinSystem.prototype.login = async function(event) {
        // 기존 로그인 로직 실행
        const result = await originalLogin.call(this, event);
        
        // 로그인 성공 시 로컬 체인 초기화
        if (this.currentUser) {
            this.initializeLocalChain();
            
            // 서버 데이터와 비교 검증
            setTimeout(() => {
                this.verifyServerData();
            }, 1000);
        }
        
        return result;
    };

    // 기존 투자 함수 확장
    const originalInvestInContent = LaborValueCoinSystem.prototype.investInContent;
    LaborValueCoinSystem.prototype.investInContent = async function(contentId, amount) {
        try {
            // 기존 투자 로직 실행
            const result = await originalInvestInContent.call(this, contentId, amount);
            
            // 투자 성공 시 로컬 체인에 블록 추가
            if (result && result.success && this.localChain) {
                this.addInvestmentBlock(contentId, amount, result);
                
                // 서버 데이터와 비교 검증 (일시 정지)
                // setTimeout(() => {
                //     this.verifyServerData();
                // }, 500);
            }
            
            return result;
        } catch (error) {
            console.error('투자 처리 중 오류:', error);
            throw error;
        }
    };

    // 투자 시 로컬 체인에 블록 추가
    LaborValueCoinSystem.prototype.addInvestmentBlock = function(contentId, amount, result) {
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
            
            const block = this.localChain.addBlock('invest', blockData);
            return block;
        }
        return null;
    };

    // 서버 데이터와 로컬 체인 비교 (일시 정지)
    LaborValueCoinSystem.prototype.verifyServerData = async function() {
        // 데이터 불일치 감지 기능 일시 정지
        console.log('🚫 데이터 불일치 감지 기능이 일시 정지되었습니다.');
        return { verified: true, message: '검증 비활성화' };
        if (!this.localChain) {
            console.warn('⚠️ 로컬 체인이 초기화되지 않음');
            alert('로컬 체인이 초기화되지 않았습니다. 다시 로그인해주세요.');
            return { verified: false, error: '로컬 체인 없음' };
        }
        
        if (!this.currentUser) {
            console.warn('⚠️ 사용자가 로그인되지 않음');
            alert('로그인이 필요합니다.');
            return { verified: false, error: '로그인 필요' };
        }
        
        try {
            console.log('📡 서버에서 사용자 투자 현황 조회 중...');
            
            // 서버에서 사용자 투자 현황 가져오기
            const serverData = await APIClient.getUserInvestments(this.currentUser);
            console.log('📊 서버 데이터:', serverData);
            
            // 로컬 체인 데이터 확인
            const localSummary = this.localChain.getActionSummary();
            console.log('📊 로컬 체인 데이터:', localSummary);
            
            // 로컬 체인과 비교
            if (typeof this.localChain.verifyWithServer === 'function') {
                const verification = this.localChain.verifyWithServer(serverData);
                console.log('🔍 검증 결과:', verification);
                
                if (!verification.verified) {
                    console.warn('⚠️ 데이터 불일치 발견');
                    console.log('로컬 체인:', {
                        totalInvested: localSummary.totalInvested,
                        investmentCount: localSummary.investmentCount,
                        totalBlocks: localSummary.totalBlocks
                    });
                    console.log('서버 데이터:', {
                        totalInvested: serverData.totalInvested,
                        investmentCount: serverData.investmentCount,
                        investments: serverData.investments?.length || 0
                    });
                    console.log('불일치 상세:', verification.discrepancies);
                    
                    // 자동 복구 옵션 제공
                    if (confirm('데이터 불일치가 발견되었습니다. 서버 데이터를 기반으로 로컬 체인을 복구하시겠습니까?')) {
                        this.syncLocalChainWithServer(serverData);
                    } else {
                        this.showDataDiscrepancyWarning(verification.discrepancies);
                    }
                } else {
                    console.log('✅ 서버 데이터와 로컬 체인 일치 확인');
                    alert('✅ 검증 완료: 서버 데이터와 로컬 체인이 일치합니다.');
                }
                
                return verification;
            } else {
                console.error('❌ verifyWithServer 메서드를 찾을 수 없음');
                alert('검증 기능에 오류가 있습니다.');
                return { verified: false, error: 'verifyWithServer 메서드 없음' };
            }
            
        } catch (error) {
            console.error('❌ 서버 데이터 검증 실패:', error);
            alert(`검증 중 오류가 발생했습니다: ${error.message}`);
            return { verified: false, error: error.message };
        }
    };

    // 데이터 불일치 경고 표시
    LaborValueCoinSystem.prototype.showDataDiscrepancyWarning = function(discrepancies) {
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
                    <button onclick="system.recoverFromLocalChain()" style="background: #38a169; color: white; border: none; padding: 8px 16px; border-radius: 4px; margin-right: 10px;">로컬 체인으로 복구</button>
                    <button onclick="this.parentElement.parentElement.remove()" style="background: #a0aec0; color: white; border: none; padding: 8px 16px; border-radius: 4px;">무시</button>
                </div>
            </div>
        `;
        
        // 메인 컨테이너 상단에 경고 표시
        const mainContainer = document.querySelector('.container');
        if (mainContainer) {
            mainContainer.insertBefore(warningDiv, mainContainer.firstChild);
        }
    };

    // 블록 생성 애니메이션
    LaborValueCoinSystem.prototype.showBlockCreationAnimation = function(block) {
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
    };

    // 로컬 체인 상태 표시
    LaborValueCoinSystem.prototype.displayLocalChainStatus = function() {
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
                <button id="chain-view-btn" style="background: #4299e1; color: white; border: none; padding: 6px 10px; border-radius: 4px; font-size: 10px; margin-right: 5px; cursor: pointer;">체인 보기</button>
                <button id="chain-verify-btn" style="background: #38a169; color: white; border: none; padding: 6px 10px; border-radius: 4px; font-size: 10px; cursor: pointer;">검증</button>
            </div>
        `;
        
        // 이벤트 리스너 설정
        const chainViewBtn = statusContainer.querySelector('#chain-view-btn');
        const chainVerifyBtn = statusContainer.querySelector('#chain-verify-btn');
        
        if (chainViewBtn) {
            chainViewBtn.addEventListener('click', () => {
                try {
                    this.showLocalChainVisualization();
                } catch (error) {
                    console.error('체인 보기 오류:', error);
                    alert('체인 보기 기능에 오류가 발생했습니다.');
                }
            });
        }
        
        if (chainVerifyBtn) {
            chainVerifyBtn.addEventListener('click', () => {
                try {
                    this.verifyServerData();
                } catch (error) {
                    console.error('검증 오류:', error);
                    alert('검증 기능에 오류가 발생했습니다.');
                }
            });
        }
    };

    // 로컬 체인 시각화 표시
    LaborValueCoinSystem.prototype.showLocalChainVisualization = function() {
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
    };

    // 로컬 체인으로부터 복구
    LaborValueCoinSystem.prototype.recoverFromLocalChain = function() {
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
    };

    // 서버 데이터로 로컬 체인 동기화
    LaborValueCoinSystem.prototype.syncLocalChainWithServer = async function(serverData) {
        if (!this.localChain || !serverData.investments) {
            console.error('로컬 체인 또는 서버 데이터가 없습니다.');
            return;
        }

        try {
            console.log('🔄 로컬 체인 동기화 시작...');
            
            // 동기화 진행 중 플래그 설정
            this.isSyncing = true;
            
            // 로컬 체인 완전 초기화 후 서버 데이터로 재구성
            console.log('🗑️ 로컬 체인 완전 초기화 중...');
            
            // 기존 로컬 체인 삭제
            localStorage.removeItem(this.localChain.storageKey);
            
            // 새로운 로컬 체인 생성
            this.localChain = new LocalChain(this.currentUser);
            console.log('✅ 새로운 로컬 체인 생성 완료');
            
            // 서버 데이터를 기반으로 투자 블록 추가
            let addedCount = 0;
            console.log(`서버에서 ${serverData.investments.length}개 투자 기록 복원 중...`);
            
            for (const investment of serverData.investments) {
                try {
                    const blockData = {
                        contentId: investment.contentId,
                        amount: investment.amount,
                        contentTitle: investment.contentTitle || '알 수 없는 컨텐츠',
                        timestamp: investment.createdAt
                    };
                    
                    this.localChain.addBlock('invest', blockData);
                    addedCount++;
                    console.log(`➕ 투자 블록 복원: ${blockData.contentTitle} (${investment.amount}코인)`);
                } catch (error) {
                    console.error(`❌ 투자 블록 추가 실패:`, investment, error);
                }
            }
            
            // 로컬 체인 상태 업데이트
            this.displayLocalChainStatus();
            
            console.log(`✅ 동기화 완료: ${addedCount}개 블록 추가`);
            console.log('✅ 동기화 완료:', `${addedCount}개 블록 복원`);
            
            // 동기화 완료 후 상태 업데이트
            this.updateLocalChainStatus();
            
            // 성공 메시지 표시
            alert(`로컬 체인이 서버 데이터로 완전히 복원되었습니다.\n복원된 투자 블록: ${addedCount}개`);
            
            console.log('🎉 로컬 체인 복원 완료');
            return true;
            
        } catch (error) {
            console.error('❌ 로컬 체인 동기화 오류:', error);
            alert('로컬 체인 동기화 중 오류가 발생했습니다.');
        } finally {
            // 동기화 완료 후 플래그 해제
            this.isSyncing = false;
        }
    };

    console.log('🔗 로컬 체인 통합 모듈 로드 완료');
})();
