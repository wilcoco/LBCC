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
        
        if (cached && (Date.now() - cached.timestamp) < 300000) { // 5분 캐시
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
     * 배당 분배 계산
     */
    async calculateDividendDistribution(contentId, newInvestmentAmount) {
        const effectiveShares = await this.getEffectiveShares(contentId);
        const dividends = [];
        
        effectiveShares.forEach(share => {
            const dividendAmount = Math.floor(newInvestmentAmount * share.share);
            if (dividendAmount > 0) {
                dividends.push({
                    username: share.username,
                    amount: dividendAmount,
                    share: share.share,
                    coefficient: share.coefficient,
                    effectiveAmount: share.effectiveAmount
                });
            }
        });
        
        return dividends;
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
     * 사용자의 투자 성과 요약 정보
     */
    async getUserPerformanceSummary(username) {
        const { UserModel } = require('./db/postgresql');
        const { getPool } = require('./db/postgresql');
        const client = getPool();
        
        const user = await UserModel.findByUsername(username);
        if (!user) return null;
        
        // 최근 계수 변동 히스토리
        const historyResult = await client.query(`
            SELECT * FROM coefficient_history 
            WHERE username = $1 
            ORDER BY created_at DESC 
            LIMIT 10
        `, [username]);
        
        // 현재 총 효과적 지분 계산
        const investmentsResult = await client.query(`
            SELECT content_id, amount FROM investments 
            WHERE username = $1
        `, [username]);
        
        let totalEffectiveValue = 0;
        for (const inv of investmentsResult.rows) {
            const shares = await this.getEffectiveShares(inv.content_id);
            const userShare = shares.find(s => s.username === username);
            if (userShare) {
                totalEffectiveValue += userShare.effectiveAmount;
            }
        }
        
        return {
            username: user.username,
            currentCoefficient: parseFloat(user.coefficient),
            balance: user.balance,
            totalInvested: user.total_invested,
            totalDividends: user.total_dividends,
            totalEffectiveValue: totalEffectiveValue,
            coefficientHistory: historyResult.rows,
            lastUpdated: user.coefficient_updated_at
        };
    }
}

// 싱글톤 인스턴스 생성
const coefficientCalculator = new CoefficientCalculator();

module.exports = {
    CoefficientCalculator,
    coefficientCalculator
};
