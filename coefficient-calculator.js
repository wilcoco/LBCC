/**
 * 동적 계수 기반 효율적인 지분 계산기
 * 캐시를 활용하여 계산량을 최소화하는 시스템
 */

class CoefficientCalculator {
    constructor() {
        this.shareCache = new Map(); // 컨텐츠별 지분 캐시
        this.lastCoefficientUpdate = new Map(); // 마지막 계수 업데이트 시간
        this.userCoefficientCache = new Map(); // 사용자 계수 캐시
    }

    /**
     * 사용자의 현재 계수 가져오기 (캐시 활용)
     */
    async getUserCoefficient(username) {
        const cacheKey = `coeff_${username}`;
        const cached = this.userCoefficientCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp) < 60000) { // 1분 캐시로 단축
            return cached.coefficient;
        }

        // 캐시 미스 - DB에서 가져오기
        const { UserModel } = require('./db/postgresql');
        const user = await UserModel.findByUsername(username);
        const coefficient = user ? parseFloat(user.coefficient) : 1.0;
        
        this.userCoefficientCache.set(cacheKey, {
            coefficient,
            timestamp: Date.now()
        });
        
        return coefficient;
    }

    /**
     * 컨텐츠의 효과적 지분 계산 (캐시 활용)
     */
    async getEffectiveShares(contentId) {
        const { ContentModel } = require('./db/postgresql');
        
        // 캐시 키 생성 (컨텐츠 ID + 최근 계수 업데이트 시간)
        const lastUpdate = await this.getLastCoefficientUpdateTime();
        const cacheKey = `shares_${contentId}_${lastUpdate}`;
        
        if (this.shareCache.has(cacheKey)) {
            return this.shareCache.get(cacheKey); // 캐시 히트!
        }

        // 캐시 미스 - 재계산 필요
        const content = await ContentModel.findById(contentId);
        if (!content) {
            return [];
        }

        const investments = await this.getContentInvestments(contentId);
        const effectiveShares = [];
        let totalEffective = 0;

        // 각 투자자의 효과적 지분 계산
        for (const investment of investments) {
            const coefficient = await this.getUserCoefficient(investment.username);
            const effectiveAmount = investment.amount * coefficient;
            
            effectiveShares.push({
                username: investment.username,
                originalAmount: investment.amount,
                coefficient: coefficient,
                effectiveAmount: effectiveAmount,
                investmentDate: investment.created_at,
                share: 0 // 아래에서 계산
            });
            
            totalEffective += effectiveAmount;
        }

        // 지분 비율 계산
        effectiveShares.forEach(share => {
            share.share = totalEffective > 0 ? share.effectiveAmount / totalEffective : 0;
        });

        // 캐시에 저장
        this.shareCache.set(cacheKey, effectiveShares);
        
        return effectiveShares;
    }

    /**
     * 컨텐츠의 투자 내역 가져오기
     */
    async getContentInvestments(contentId) {
        const { getPool } = require('./db/postgresql');
        const client = getPool();
        
        const result = await client.query(`
            SELECT username, amount, created_at
            FROM investments 
            WHERE content_id = $1 
            ORDER BY created_at ASC
        `, [contentId]);
        
        return result.rows;
    }



    /**
     * 투자 후 효과적 지분 업데이트
     */
    async updateInvestmentEffectiveAmount(investmentId, username, amount) {
        const { getPool } = require('./db/postgresql');
        const client = getPool();
        
        const coefficient = await this.getUserCoefficient(username);
        const effectiveAmount = amount * coefficient;
        
        await client.query(`
            UPDATE investments 
            SET effective_amount = $1, coefficient_at_time = $2 
            WHERE id = $3
        `, [effectiveAmount, coefficient, investmentId]);
        
        return effectiveAmount;
    }

    /**
     * 마지막 계수 업데이트 시간 가져오기
     */
    async getLastCoefficientUpdateTime() {
        const { getPool } = require('./db/postgresql');
        const client = getPool();
        
        const result = await client.query(`
            SELECT MAX(coefficient_updated_at) as last_update 
            FROM users
        `);
        
        return result.rows[0]?.last_update?.getTime() || Date.now();
    }

    /**
     * 캐시 무효화 (계수 업데이트 시 호출)
     */
    invalidateCache(username = null) {
        if (username) {
            // 특정 사용자 캐시만 무효화
            this.userCoefficientCache.delete(`coeff_${username}`);
            
            // 해당 사용자가 투자한 컨텐츠의 지분 캐시 무효화
            for (const [key, value] of this.shareCache.entries()) {
                if (key.includes(username)) {
                    this.shareCache.delete(key);
                }
            }
        } else {
            // 전체 캐시 무효화
            this.shareCache.clear();
            this.userCoefficientCache.clear();
        }
    }

    /**
     * 컨텐츠의 모든 투자 기록 조회
     */
    async getContentInvestments(contentId) {
        const { getPool } = require('./db/postgresql');
        const client = getPool();
        
        const result = await client.query(`
            SELECT username, amount, created_at
            FROM investments 
            WHERE content_id = $1
            ORDER BY created_at ASC
        `, [contentId]);
        
        return result.rows;
    }

    /**
     * 사용자 성과 요약 정보 조회
     */
    async getUserPerformanceSummary(username) {
        try {
            const { UserModel } = require('./db/postgresql');
            const { getPool } = require('./db/postgresql');
            const client = getPool();
            
            console.log(`🔍 getUserPerformanceSummary: ${username} 시작`);
            
            const user = await UserModel.findByUsername(username);
            if (!user) {
                console.log(`⚠️ 사용자 없음: ${username}`);
                return null;
            }
            
            console.log(`📊 ${username} 사용자 데이터:`, {
                coefficient: user.coefficient,
                balance: user.balance,
                total_invested: user.total_invested,
                total_dividends: user.total_dividends
            });
            
            // 최근 계수 변동 히스토리 (안전하게 처리)
            let historyResult = { rows: [] };
            try {
                historyResult = await client.query(`
                    SELECT * FROM coefficient_history 
                    WHERE username = $1 
                    ORDER BY created_at DESC 
                    LIMIT 10
                `, [username]);
                console.log(`📈 ${username} 계수 히스토리: ${historyResult.rows.length}건`);
            } catch (historyError) {
                console.warn(`⚠️ ${username} 계수 히스토리 조회 실패:`, historyError.message);
            }
            
            // 현재 총 효과적 지분 계산 (안전하게 처리)
            let totalEffectiveValue = 0;
            try {
                const investmentsResult = await client.query(`
                    SELECT content_id, amount FROM investments 
                    WHERE username = $1
                `, [username]);
                
                console.log(`💰 ${username} 투자 기록: ${investmentsResult.rows.length}건`);
                
                for (const inv of investmentsResult.rows) {
                    try {
                        const shares = await this.getEffectiveShares(inv.content_id);
                        const userShare = shares.find(s => s.username === username);
                        if (userShare) {
                            totalEffectiveValue += userShare.effectiveAmount;
                        }
                    } catch (shareError) {
                        console.warn(`⚠️ 컨텐츠 ${inv.content_id} 지분 계산 실패:`, shareError.message);
                    }
                }
            } catch (investmentError) {
                console.warn(`⚠️ ${username} 투자 기록 조회 실패:`, investmentError.message);
            }
            
            const result = {
                username: user.username,
                currentCoefficient: parseFloat(user.coefficient || 1.0),
                balance: user.balance || 0,
                totalInvested: user.total_invested || 0,
                totalDividends: user.total_dividends || 0,
                totalEffectiveValue: totalEffectiveValue,
                coefficientHistory: historyResult.rows || [],
                lastUpdated: user.coefficient_updated_at || new Date().toISOString()
            };
            
            console.log(`✅ ${username} 성과 요약 완료:`, result);
            return result;
            
        } catch (error) {
            console.error(`❌ getUserPerformanceSummary 오류 (${username}):`, error);
            return null;
        }
    }

    /**
     * Calculate dividend distribution for a new investment
     * @param {string} contentId - Content ID being invested in
     * @param {number} amount - Investment amount
     * @returns {Array} Array of dividend distributions
     */
    async calculateDividendDistribution(contentId, amount) {
        try {
            console.log(`💰 배당 분배 계산 시작: 컨텐츠 ${contentId}, 투자액 ${amount}`);
            
            // Get all existing investors for this content
            const shares = await this.getEffectiveShares(contentId);
            
            if (!shares || shares.length === 0) {
                console.log('📊 기존 투자자 없음 - 배당 분배 없음');
                return [];
            }
            
            // Calculate total effective investment
            const totalEffectiveInvestment = shares.reduce((sum, share) => sum + share.effectiveAmount, 0);
            
            if (totalEffectiveInvestment <= 0) {
                console.log('📊 총 유효 투자액이 0 - 배당 분배 없음');
                return [];
            }
            
            // Calculate dividend distribution (10% of new investment)
            const dividendPool = amount * 0.1;
            console.log(`💰 배당 풀: ${dividendPool} (투자액의 10%)`);
            
            const distributions = [];
            
            for (const share of shares) {
                const dividendRatio = share.effectiveAmount / totalEffectiveInvestment;
                const dividendAmount = Math.floor(dividendPool * dividendRatio);
                
                if (dividendAmount > 0) {
                    distributions.push({
                        username: share.username,
                        amount: dividendAmount,
                        ratio: dividendRatio,
                        effectiveShare: share.effectiveAmount
                    });
                    
                    console.log(`💰 배당 분배: ${share.username} +${dividendAmount} (비율: ${(dividendRatio * 100).toFixed(2)}%)`);
                }
            }
            
            console.log(`✅ 배당 분배 완료: ${distributions.length}명에게 총 ${distributions.reduce((sum, d) => sum + d.amount, 0)} 배당`);
            return distributions;
            
        } catch (error) {
            console.error(`❌ calculateDividendDistribution 오류:`, error);
            return [];
        }
    }
}

// 싱글톤 인스턴스 생성
const coefficientCalculator = new CoefficientCalculator();

module.exports = {
    CoefficientCalculator,
    coefficientCalculator
};
