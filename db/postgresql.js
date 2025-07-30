const { Pool } = require('pg');

// PostgreSQL 연결 풀
let pool = null;

function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });
    }
    return pool;
}

// 데이터베이스 테이블 초기화
async function initializeDatabase() {
    const client = getPool();
    
    try {
        // 사용자 테이블 생성
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                balance INTEGER DEFAULT 10000,
                coefficient DECIMAL(10,4) DEFAULT 1.0000,
                coefficient_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                total_invested INTEGER DEFAULT 0,
                total_dividends INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 컨텐츠 테이블 생성
        await client.query(`
            CREATE TABLE IF NOT EXISTS contents (
                id SERIAL PRIMARY KEY,
                title VARCHAR(500) NOT NULL,
                content TEXT,
                url VARCHAR(1000),
                tags JSONB DEFAULT '[]',
                files JSONB DEFAULT '[]',
                author VARCHAR(255) NOT NULL,
                total_investment INTEGER DEFAULT 0,
                investors JSONB DEFAULT '{}',
                investment_history JSONB DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 투자 테이블 생성
        await client.query(`
            CREATE TABLE IF NOT EXISTS investments (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) NOT NULL,
                content_id INTEGER NOT NULL,
                amount INTEGER NOT NULL,
                effective_amount DECIMAL(15,4),
                coefficient_at_time DECIMAL(10,4) DEFAULT 1.0000,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (content_id) REFERENCES contents(id)
            )
        `);

        // 계수 변동 히스토리 테이블 생성
        await client.query(`
            CREATE TABLE IF NOT EXISTS coefficient_history (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) NOT NULL,
                old_coefficient DECIMAL(10,4),
                new_coefficient DECIMAL(10,4),
                reason TEXT,
                performance_score DECIMAL(10,4),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ 데이터베이스 테이블 초기화 완료');
    } catch (error) {
        console.error('❌ 데이터베이스 초기화 오류:', error);
    }
}

// 사용자 관련 함수들
class UserModel {
    static async create(userData) {
        const client = getPool();
        const { username } = userData;
        
        const result = await client.query(
            'INSERT INTO users (username) VALUES ($1) RETURNING *',
            [username]
        );
        return result.rows[0];
    }

    static async findByUsername(username) {
        const client = getPool();
        const result = await client.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );
        return result.rows[0];
    }

    static async updateBalance(username, newBalance) {
        const client = getPool();
        await client.query(
            'UPDATE users SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE username = $2',
            [newBalance, username]
        );
    }

    static async addInvestment(username, investment) {
        const client = getPool();
        
        // 투자 기록 추가
        await client.query(
            'INSERT INTO investments (username, content_id, amount) VALUES ($1, $2, $3)',
            [username, investment.contentId, investment.amount]
        );

        // 사용자 총 투자액 업데이트
        await client.query(
            'UPDATE users SET total_invested = total_invested + $1, updated_at = CURRENT_TIMESTAMP WHERE username = $2',
            [investment.amount, username]
        );
    }

    static async addDividend(username, amount) {
        const client = getPool();
        await client.query(
            'UPDATE users SET balance = balance + $1, total_dividends = total_dividends + $1, updated_at = CURRENT_TIMESTAMP WHERE username = $2',
            [amount, username]
        );
    }

    static async getUserInvestments(username) {
        const client = getPool();
        
        // 사용자 정보 가져오기
        const userResult = await client.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );
        
        if (userResult.rows.length === 0) {
            throw new Error('사용자를 찾을 수 없습니다.');
        }
        
        const user = userResult.rows[0];
        
        // 투자 내역 가져오기
        const investmentsResult = await client.query(`
            SELECT i.*, c.title as content_title, c.author as content_author
            FROM investments i
            LEFT JOIN contents c ON i.content_id = c.id
            WHERE i.username = $1
            ORDER BY i.created_at DESC
        `, [username]);
        
        return {
            totalInvested: user.total_invested,
            totalDividends: user.total_dividends,
            investmentCount: investmentsResult.rows.length,
            investments: investmentsResult.rows.map(row => ({
                contentId: row.content_id,
                amount: row.amount,
                timestamp: row.created_at.toISOString(),
                contentTitle: row.content_title || '삭제된 컨텐츠',
                contentAuthor: row.content_author || 'Unknown'
            }))
        };
    }

    // 계수 관리 메서드들
    static async updateCoefficient(username, newCoefficient, reason, performanceScore) {
        const client = getPool();
        
        // 현재 계수 가져오기
        const currentUser = await this.findByUsername(username);
        const oldCoefficient = currentUser ? currentUser.coefficient : 1.0;
        
        // 계수 범위 제한 (0.01 ~ 100)
        const boundedCoefficient = Math.max(0.01, Math.min(100, newCoefficient));
        
        // 계수 업데이트
        await client.query(
            'UPDATE users SET coefficient = $1, coefficient_updated_at = CURRENT_TIMESTAMP WHERE username = $2',
            [boundedCoefficient, username]
        );
        
        // 히스토리 기록
        await client.query(
            'INSERT INTO coefficient_history (username, old_coefficient, new_coefficient, reason, performance_score) VALUES ($1, $2, $3, $4, $5)',
            [username, oldCoefficient, boundedCoefficient, reason, performanceScore]
        );
        
        return boundedCoefficient;
    }
    
    static async calculateUserPerformance(username, daysPeriod = 30) {
        const client = getPool();
        
        // 최근 N일간 투자 성과 계산
        const result = await client.query(`
            SELECT 
                i.content_id,
                i.amount,
                i.created_at,
                (
                    SELECT COALESCE(SUM(i2.amount), 0)
                    FROM investments i2 
                    WHERE i2.content_id = i.content_id 
                    AND i2.created_at > i.created_at
                ) as subsequent_investments
            FROM investments i
            WHERE i.username = $1 
            AND i.created_at > NOW() - INTERVAL '$2 days'
            ORDER BY i.created_at DESC
        `, [username, daysPeriod]);
        
        if (result.rows.length === 0) {
            return 1.0; // 기본 계수
        }
        
        // 투자 매력도 지수 계산
        let totalScore = 0;
        let totalWeight = 0;
        
        result.rows.forEach(investment => {
            const attractionRate = investment.subsequent_investments / investment.amount;
            const daysSince = (Date.now() - new Date(investment.created_at).getTime()) / (24 * 60 * 60 * 1000);
            const timeWeight = Math.exp(-daysSince / 7); // 7일 반감기
            
            totalScore += attractionRate * timeWeight;
            totalWeight += timeWeight;
        });
        
        const averagePerformance = totalWeight > 0 ? totalScore / totalWeight : 0;
        
        // 성과를 계수로 변환 (0.5 ~ 2.0 범위)
        return Math.max(0.5, Math.min(2.0, 0.5 + averagePerformance));
    }
    
    static async batchUpdateCoefficients() {
        const client = getPool();
        
        // 모든 사용자 가져오기
        const usersResult = await client.query('SELECT username, coefficient FROM users');
        
        for (const user of usersResult.rows) {
            try {
                const performance = await this.calculateUserPerformance(user.username);
                
                // 지수적 이동평균으로 부드러운 변화
                const newCoefficient = user.coefficient * 0.9 + performance * 0.1;
                
                await this.updateCoefficient(
                    user.username, 
                    newCoefficient, 
                    'Batch performance update', 
                    performance
                );
                
                console.log(`✅ ${user.username}: ${user.coefficient.toFixed(4)} → ${newCoefficient.toFixed(4)}`);
            } catch (error) {
                console.error(`❌ ${user.username} 계수 업데이트 오류:`, error);
            }
        }
    }
}

// 컨텐츠 관련 함수들
class ContentModel {
    static async create(contentData) {
        const client = getPool();
        const { title, content, url, tags, files, author } = contentData;
        
        const result = await client.query(`
            INSERT INTO contents (title, content, url, tags, files, author)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [title, content, url, JSON.stringify(tags), JSON.stringify(files), author]);
        
        return result.rows[0];
    }

    static async findAll() {
        const client = getPool();
        const result = await client.query(
            'SELECT * FROM contents ORDER BY created_at DESC'
        );
        
        return result.rows.map(row => ({
            ...row,
            tags: row.tags || [],
            files: row.files || [],
            investors: row.investors || {},
            investmentHistory: row.investment_history || []
        }));
    }

    static async findById(id) {
        const client = getPool();
        const result = await client.query(
            'SELECT * FROM contents WHERE id = $1',
            [id]
        );
        
        if (result.rows.length === 0) return null;
        
        const row = result.rows[0];
        return {
            ...row,
            tags: row.tags || [],
            files: row.files || [],
            investors: row.investors || {},
            investmentHistory: row.investment_history || []
        };
    }

    static async updateInvestment(contentId, investorData, newTotalInvestment) {
        const client = getPool();
        
        // 현재 컨텐츠 정보 가져오기
        const content = await this.findById(contentId);
        if (!content) throw new Error('컨텐츠를 찾을 수 없습니다.');
        
        // 투자자 정보 업데이트
        const updatedInvestors = { ...content.investors };
        updatedInvestors[investorData.investor] = investorData.amount;
        
        // 투자 히스토리 업데이트
        const updatedHistory = [...content.investmentHistory, {
            investor: investorData.investor,
            amount: investorData.amount,
            timestamp: new Date().toISOString(),
            totalInvestmentAfter: newTotalInvestment
        }];
        
        await client.query(`
            UPDATE contents 
            SET total_investment = $1, 
                investors = $2, 
                investment_history = $3,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $4
        `, [newTotalInvestment, JSON.stringify(updatedInvestors), JSON.stringify(updatedHistory), contentId]);
    }
}

module.exports = {
    initializeDatabase,
    UserModel,
    ContentModel
};
