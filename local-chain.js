/**
 * 로컬 체인 관리 모듈
 * 사용자의 모든 노동(투자/평가)을 블록 형태로 로컬에 저장하고 관리
 */

class LocalChain {
    constructor(username) {
        this.username = username;
        this.storageKey = `localChain_${username}`;
        this.chain = this.loadChain();
        this.initializeGenesis();
    }

    /**
     * 로컬 스토리지에서 체인 로드
     */
    loadChain() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            return stored ? JSON.parse(stored) : { blocks: [], merkleRoot: null };
        } catch (error) {
            console.error('로컬 체인 로드 실패:', error);
            return { blocks: [], merkleRoot: null };
        }
    }

    /**
     * 제네시스 블록 초기화
     */
    initializeGenesis() {
        if (this.chain.blocks.length === 0) {
            const genesisBlock = {
                id: 0,
                timestamp: new Date().toISOString(),
                action: 'genesis',
                data: {
                    username: this.username,
                    message: '노동 가치 체인 시작'
                },
                previousHash: '0x000000',
                hash: this.calculateHash({
                    id: 0,
                    timestamp: new Date().toISOString(),
                    action: 'genesis',
                    previousHash: '0x000000'
                }),
                signature: this.generateSignature('genesis')
            };
            
            this.chain.blocks.push(genesisBlock);
            this.saveChain();
        }
    }

    /**
     * 새로운 블록 추가 (투자/평가 행동)
     */
    addBlock(action, data) {
        const previousBlock = this.getLastBlock();
        const newBlock = {
            id: this.chain.blocks.length,
            timestamp: new Date().toISOString(),
            action: action, // 'invest', 'evaluate', 'create_content' 등
            data: data,
            previousHash: previousBlock.hash,
            hash: null,
            signature: null
        };

        // 해시 계산
        newBlock.hash = this.calculateHash(newBlock);
        newBlock.signature = this.generateSignature(newBlock);

        // 체인에 추가
        this.chain.blocks.push(newBlock);
        this.updateMerkleRoot();
        this.saveChain();

        // 블록 생성 이벤트 발생
        this.dispatchBlockEvent(newBlock);

        console.log(`🧱 새 블록 생성: ${action}`, newBlock);
        return newBlock;
    }

    /**
     * 해시 계산 (간단한 SHA-256 시뮬레이션)
     */
    calculateHash(block) {
        const data = `${block.id}${block.timestamp}${block.action}${JSON.stringify(block.data)}${block.previousHash}`;
        return this.simpleHash(data);
    }

    /**
     * 간단한 해시 함수 (실제 프로덕션에서는 crypto.subtle.digest 사용)
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 32비트 정수로 변환
        }
        return '0x' + Math.abs(hash).toString(16).padStart(8, '0');
    }

    /**
     * 디지털 서명 생성 (간단한 시뮬레이션)
     */
    generateSignature(block) {
        const data = typeof block === 'string' ? block : JSON.stringify(block);
        return `sig_${this.username}_${this.simpleHash(data)}`;
    }

    /**
     * 머클 루트 업데이트
     */
    updateMerkleRoot() {
        const hashes = this.chain.blocks.map(block => block.hash);
        this.chain.merkleRoot = this.calculateMerkleRoot(hashes);
    }

    /**
     * 머클 루트 계산
     */
    calculateMerkleRoot(hashes) {
        if (hashes.length === 0) return null;
        if (hashes.length === 1) return hashes[0];

        const newLevel = [];
        for (let i = 0; i < hashes.length; i += 2) {
            const left = hashes[i];
            const right = hashes[i + 1] || left;
            newLevel.push(this.simpleHash(left + right));
        }

        return this.calculateMerkleRoot(newLevel);
    }

    /**
     * 체인 유효성 검증
     */
    validateChain() {
        for (let i = 1; i < this.chain.blocks.length; i++) {
            const currentBlock = this.chain.blocks[i];
            const previousBlock = this.chain.blocks[i - 1];

            // 해시 검증
            if (currentBlock.hash !== this.calculateHash(currentBlock)) {
                return { valid: false, error: `블록 ${i} 해시 불일치` };
            }

            // 이전 블록 연결 검증
            if (currentBlock.previousHash !== previousBlock.hash) {
                return { valid: false, error: `블록 ${i} 체인 연결 오류` };
            }
        }

        return { valid: true };
    }

    /**
     * 서버 상태와 비교 검증
     */
    verifyWithServer(serverData) {
        // 서버에서 받은 사용자 데이터와 로컬 체인 비교
        const localActions = this.getActionSummary();
        const serverActions = this.extractServerActions(serverData);

        const discrepancies = [];

        // 투자 내역 비교
        if (localActions.totalInvested !== serverActions.totalInvested) {
            discrepancies.push({
                type: 'investment_mismatch',
                local: localActions.totalInvested,
                server: serverActions.totalInvested
            });
        }

        // 투자 건수 비교
        if (localActions.investmentCount !== serverActions.investmentCount) {
            discrepancies.push({
                type: 'count_mismatch',
                local: localActions.investmentCount,
                server: serverActions.investmentCount
            });
        }

        return {
            verified: discrepancies.length === 0,
            discrepancies: discrepancies
        };
    }

    /**
     * 로컬 체인에서 행동 요약 추출
     */
    getActionSummary() {
        const investBlocks = this.chain.blocks.filter(block => block.action === 'invest');
        const totalInvested = investBlocks.reduce((sum, block) => sum + (block.data.amount || 0), 0);

        return {
            totalInvested: totalInvested,
            investmentCount: investBlocks.length,
            totalBlocks: this.chain.blocks.length,
            merkleRoot: this.chain.merkleRoot
        };
    }

    /**
     * 서버 데이터에서 행동 요약 추출
     */
    extractServerActions(serverData) {
        return {
            totalInvested: serverData.totalInvested || 0,
            investmentCount: serverData.investmentCount || 0,
            totalDividends: serverData.totalDividends || 0
        };
    }

    /**
     * 마지막 블록 가져오기
     */
    getLastBlock() {
        return this.chain.blocks[this.chain.blocks.length - 1];
    }

    /**
     * 체인을 로컬 스토리지에 저장
     */
    saveChain() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.chain));
        } catch (error) {
            console.error('로컬 체인 저장 실패:', error);
        }
    }

    /**
     * 블록 생성 이벤트 발생
     */
    dispatchBlockEvent(block) {
        const event = new CustomEvent('blockCreated', {
            detail: {
                block: block,
                chain: this.chain,
                username: this.username
            }
        });
        window.dispatchEvent(event);
    }

    /**
     * 체인 정보 가져오기
     */
    getChainInfo() {
        return {
            username: this.username,
            blockCount: this.chain.blocks.length,
            merkleRoot: this.chain.merkleRoot,
            lastBlock: this.getLastBlock(),
            validation: this.validateChain(),
            summary: this.getActionSummary()
        };
    }

    /**
     * 체인 시각화용 데이터
     */
    getVisualizationData() {
        return this.chain.blocks.map((block, index) => ({
            id: block.id,
            timestamp: block.timestamp,
            action: block.action,
            hash: block.hash,
            data: block.data,
            isGenesis: index === 0,
            isLatest: index === this.chain.blocks.length - 1
        }));
    }

    /**
     * 체인 초기화 (개발/테스트용)
     */
    resetChain() {
        localStorage.removeItem(this.storageKey);
        this.chain = { blocks: [], merkleRoot: null };
        this.initializeGenesis();
    }
}

// 전역 사용을 위한 export
window.LocalChain = LocalChain;
