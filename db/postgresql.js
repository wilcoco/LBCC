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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (content_id) REFERENCES contents(id)
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
