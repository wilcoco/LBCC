const { Pool } = require('pg');

// PostgreSQL 연결 풀
let pool = null;

function getPool() {
    if (!pool) {
        // 환경변수 확인 및 로깅
        console.log('🔍 데이터베이스 연결 설정 확인:');
        console.log('NODE_ENV:', process.env.NODE_ENV);
        console.log('DATABASE_URL 존재:', !!process.env.DATABASE_URL);
        
        // Railway 자동 환경변수 탐지 및 대체 연결 방법
        let databaseUrl = process.env.DATABASE_URL;
        
        if (!databaseUrl) {
            console.log('🔍 DATABASE_URL 없음, Railway 자동 환경변수 탐지 시도...');
            
            // Railway PostgreSQL 자동 환경변수 탐지
            const railwayVars = [
                'POSTGRES_URL',
                'POSTGRESQL_URL', 
                'DATABASE_PRIVATE_URL',
                'DATABASE_PUBLIC_URL',
                'PGDATABASE_URL'
            ];
            
            for (const varName of railwayVars) {
                if (process.env[varName]) {
                    databaseUrl = process.env[varName];
                    console.log(`✅ Railway 환경변수 발견: ${varName}`);
                    break;
                }
            }
        }
        
        if (!databaseUrl) {
            console.error('❌ 데이터베이스 연결 URL을 찾을 수 없습니다!');
            console.log('📝 사용 가능한 환경변수:');
            Object.keys(process.env)
                .filter(key => key.toLowerCase().includes('database') || key.toLowerCase().includes('postgres'))
                .forEach(key => console.log(`  - ${key}: ${process.env[key] ? '[설정됨]' : '[비어있음]'}`));
            
            console.warn('⚠️ 데이터베이스 URL 없음 - 더미 모드로 실행');
            // 더미 pool 반환 (서버 크래시 방지)
            return {
                query: async () => ({ rows: [] }),
                connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} })
            };
        }
        
        // 데이터베이스 URL의 일부만 로깅 (보안상 전체 URL은 노출하지 않음)
        const dbUrl = databaseUrl;
        const urlParts = dbUrl.match(/^(postgres:\/\/[^:]+):[^@]+@([^:]+):(\d+)\/(.+)$/);
        if (urlParts) {
            console.log('📊 DB 연결 정보:', {
                protocol: urlParts[1].split('://')[0],
                host: urlParts[2],
                port: urlParts[3],
                database: urlParts[4]
            });
        }
        
        try {
            pool = new Pool({
                connectionString: databaseUrl,
                ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
                // 연결 타임아웃 및 재시도 설정
                connectionTimeoutMillis: 10000,
                idleTimeoutMillis: 30000,
                max: 10
            });
            
            console.log('✅ PostgreSQL 연결 풀 생성 완료');
            
            // 연결 테스트
            pool.on('connect', () => {
                console.log('🔗 PostgreSQL 데이터베이스 연결 성공');
            });
            
            pool.on('error', (err) => {
                console.error('❌ PostgreSQL 연결 오류:', err);
            });
            
        } catch (error) {
            console.error('❌ PostgreSQL 연결 풀 생성 실패:', error);
            throw error;
        }
    }
    return pool;
}

// 데이터베이스 테이블 초기화
async function initializeDatabase() {
    const client = getPool();
    
    // 더미 모드 체크
    if (!client || typeof client.query !== 'function') {
        console.log('⚠️ 데이터베이스 연결 없음 - 초기화 건너뛰기');
        return;
    }
    
    try {
        // 사용자 테이블 생성
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) DEFAULT 'default123',
                balance INTEGER DEFAULT 10000,
                coefficient DECIMAL(10,4) DEFAULT 1.0000,
                coefficient_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                total_invested INTEGER DEFAULT 0,
                total_dividends INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 기존 테이블에 password 컨럼 추가 (없는 경우에만)
        try {
            await client.query(`
                ALTER TABLE users 
                ADD COLUMN IF NOT EXISTS password VARCHAR(255) DEFAULT 'default123'
            `);
            console.log('✅ users 테이블에 password 컨럼 추가 완료');
        } catch (alterError) {
            console.log('📝 password 컨럼 이미 존재하거나 추가 실패:', alterError.message);
        }

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
                investor_count INTEGER DEFAULT 0,
                average_investment DECIMAL(15,4) DEFAULT 0,
                investors JSONB DEFAULT '{}',
                investment_history JSONB DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 기존 contents 테이블에 새 컬럼 추가 (없는 경우에만)
        try {
            await client.query(`
                ALTER TABLE contents 
                ADD COLUMN IF NOT EXISTS investor_count INTEGER DEFAULT 0
            `);
            await client.query(`
                ALTER TABLE contents 
                ADD COLUMN IF NOT EXISTS average_investment DECIMAL(15,4) DEFAULT 0
            `);
            console.log('✅ contents 테이블에 통계 컬럼 추가 완료');
        } catch (alterError) {
            console.log('📝 contents 통계 컬럼 이미 존재하거나 추가 실패:', alterError.message);
        }

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
        const { username, password, balance } = userData;
        
        console.log(`🔧 UserModel.create 호출:`, { username, password: password ? '[설정됨]' : '[없음]', balance });
        
        // 기본값 설정
        const finalPassword = password || 'default123';
        const finalBalance = balance !== undefined ? balance : 10000;
        
        console.log(`💾 데이터베이스에 사용자 생성: ${username} (잔액: ${finalBalance})`);
        
        const result = await client.query(
            'INSERT INTO users (username, password, balance) VALUES ($1, $2, $3) RETURNING *',
            [username, finalPassword, finalBalance]
        );
        
        console.log(`✅ 사용자 생성 완료:`, result.rows[0]);
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
        
        // 사용자 총 투자액만 업데이트 (투자 기록은 ContentModel.addInvestment에서 처리)
        await client.query(
            'UPDATE users SET total_invested = total_invested + $1, updated_at = CURRENT_TIMESTAMP WHERE username = $2',
            [investment.amount, username]
        );
        
        console.log(`📊 사용자 ${username} 총 투자액 업데이트: +${investment.amount}`);
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
        const updateResult = await client.query(
            'UPDATE users SET coefficient = $1, coefficient_updated_at = CURRENT_TIMESTAMP WHERE username = $2',
            [boundedCoefficient, username]
        );
        
        console.log(`🔄 DB 계수 업데이트 결과: ${username} - 영향받은 행: ${updateResult.rowCount}`);
        
        // 히스토리 기록
        const historyResult = await client.query(
            'INSERT INTO coefficient_history (username, old_coefficient, new_coefficient, reason, performance_score) VALUES ($1, $2, $3, $4, $5)',
            [username, oldCoefficient, boundedCoefficient, reason, performanceScore]
        );
        
        console.log(`📜 계수 히스토리 기록 완료: ${username} ${oldCoefficient} → ${boundedCoefficient}`);
        
        return boundedCoefficient;
    }
    
    static async calculateUserPerformance(username, daysPeriod = 30) {
    const client = getPool();
    
    console.log(`🔍 ${username} 성과 계산 시작 (기간: ${daysPeriod}일)`);
    
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
    
    console.log(`📊 ${username} 투자 기록: ${result.rows.length}건`);
    
    if (result.rows.length === 0) {
        console.log(`⚠️ ${username} 투자 기록 없음 - 신규 사용자 계수 1.0 반환`);
        return 1.0; // 기본 계수
    }
    
    // 신규 투자자 보너스 (투자 횟수가 적은 경우)
    if (result.rows.length < 3) {
        console.log(`🆕 ${username} 신규 투자자 - 학습 보너스 적용`);
        return 1.1; // 신규 투자자 보너스
    }
    
    // 투자 매력도 지수 계산
    let totalScore = 0;
    let totalWeight = 0;
    let goodInvestments = 0;
    let totalInvestments = result.rows.length;
    
    result.rows.forEach((investment, index) => {
        const attractionRate = investment.subsequent_investments / investment.amount;
        const daysSince = (Date.now() - new Date(investment.created_at).getTime()) / (24 * 60 * 60 * 1000);
        const timeWeight = Math.exp(-daysSince / 7); // 7일 반감기
        
        console.log(`  📈 투자 ${index + 1}: ${investment.amount}코인 → +${investment.subsequent_investments}코인 (비율: ${attractionRate.toFixed(2)})`);
        
        // 좋은 투자 카운트 (후속 투자가 원래 투자의 30% 이상으로 완화)
        if (attractionRate >= 0.3) {
            goodInvestments++;
        }
        
        totalScore += attractionRate * timeWeight;
        totalWeight += timeWeight;
    });
    
    const averagePerformance = totalWeight > 0 ? totalScore / totalWeight : 0;
    const successRate = goodInvestments / totalInvestments;
    
    console.log(`📊 ${username} 성과 분석:`);
    console.log(`  - 평균 매력도: ${averagePerformance.toFixed(4)}`);
    console.log(`  - 성공률: ${(successRate * 100).toFixed(1)}% (${goodInvestments}/${totalInvestments})`);
    
    // 개선된 계수 계산: 평균 성과 + 성공률 보너스 + 활동성 보너스
    let baseCoefficient = 0.9 + (averagePerformance * 0.3); // 0.9 ~ 1.2 기본 범위
    let successBonus = successRate * 0.4; // 최대 0.4 보너스
    let activityBonus = Math.min(totalInvestments / 10, 0.2); // 활동성 보너스 (최대 0.2)
    
    let finalCoefficient = baseCoefficient + successBonus + activityBonus;
    
    // 계수 범위 제한 (0.5 ~ 3.0으로 조정)
    finalCoefficient = Math.max(0.5, Math.min(3.0, finalCoefficient));
    
    console.log(`🎯 ${username} 최종 계수: ${finalCoefficient.toFixed(4)} (기본: ${baseCoefficient.toFixed(4)} + 성공: ${successBonus.toFixed(4)} + 활동: ${activityBonus.toFixed(4)})`);
    
    return finalCoefficient;
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

    static async getUserInvestments(username) {
        const client = getPool();
        
        try {
            console.log(`📊 ${username} 투자 내역 조회 시작...`);
            
            // 사용자의 모든 투자 내역 조회
            const investmentsResult = await client.query(`
                SELECT 
                    i.id,
                    i.content_id,
                    i.amount,
                    i.effective_amount,
                    i.coefficient_at_time,
                    i.created_at,
                    c.title as content_title,
                    c.author as content_author,
                    c.total_investment as total_content_investment
                FROM investments i
                JOIN contents c ON i.content_id = c.id
                WHERE i.username = $1
                ORDER BY i.created_at DESC
            `, [username]);
            
            const investments = [];
            
            for (const investment of investmentsResult.rows) {
                // 각 투자에 대한 배당 내역 조회 (예시용)
                const dividendHistory = [];
                
                // 지분율 계산 (사용자 투자액 / 컨텐츠 총 투자액 * 100)
                const totalContentInvestment = investment.total_content_investment || 0;
                const userInvestmentAmount = investment.amount || 0;
                const currentShare = totalContentInvestment > 0 ? 
                    (userInvestmentAmount / totalContentInvestment * 100) : 0;
                
                // 투자 정보 구성
                const investmentData = {
                    id: investment.id,
                    contentId: investment.content_id,
                    contentTitle: investment.content_title,
                    contentAuthor: investment.content_author,
                    amount: investment.amount,
                    effectiveAmount: investment.effective_amount || investment.amount,
                    coefficientAtTime: investment.coefficient_at_time || 1.0,
                    totalInvested: investment.amount,
                    totalDividends: 0, // 배당 내역이 있다면 계산
                    currentShare: Math.round(currentShare * 100) / 100, // 소수점 2자리까지
                    totalContentInvestment: totalContentInvestment,
                    createdAt: investment.created_at,
                    dividendHistory
                };
                
                investments.push(investmentData);
            }
            
            console.log(`✅ ${username} 투자 내역 조회 완료: ${investments.length}건`);
            return investments;
            
        } catch (error) {
            console.error(`❌ getUserInvestments 오류 (${username}):`, error);
            return [];
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
            investmentHistory: row.investment_history || [],
            investorCount: row.investor_count || 0,
            averageInvestment: row.average_investment || 0,
            totalInvestment: row.total_investment || 0
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

    static async addInvestment(contentId, investmentData) {
        const client = getPool();
        
        try {
            // investments 테이블에 새 투자 기록 추가
            const result = await client.query(`
                INSERT INTO investments (content_id, username, amount, created_at)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `, [contentId, investmentData.username, investmentData.amount, new Date()]);
            
            console.log(`💰 새 투자 기록 생성: ${investmentData.username} → 컨텐츠 ${contentId} (${investmentData.amount}코인)`);
            
            // 컨텐츠 통계 업데이트
            await this.updateContentStats(contentId);
            
            return result.rows[0];
            
        } catch (error) {
            console.error('❌ 투자 기록 생성 실패:', error);
            throw error;
        }
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

    static async updateContentStats(contentId) {
        const client = getPool();
        
        try {
            // 해당 컨텐츠의 모든 투자 정보 집계
            const statsResult = await client.query(`
                SELECT 
                    COUNT(DISTINCT username) as investor_count,
                    COALESCE(SUM(amount), 0) as total_investment,
                    COALESCE(AVG(amount), 0) as average_investment
                FROM investments 
                WHERE content_id = $1
            `, [contentId]);
            
            const stats = statsResult.rows[0];
            
            // contents 테이블의 통계 정보 업데이트
            await client.query(`
                UPDATE contents 
                SET 
                    total_investment = $1,
                    investor_count = $2,
                    average_investment = $3,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $4
            `, [
                parseFloat(stats.total_investment),
                parseInt(stats.investor_count),
                parseFloat(stats.average_investment),
                contentId
            ]);
            
            console.log(`📊 컨텐츠 ${contentId} 통계 업데이트: 총투자액=${stats.total_investment}, 투자자수=${stats.investor_count}, 평균투자액=${parseFloat(stats.average_investment).toFixed(2)}`);
            
        } catch (error) {
            console.error(`❌ 컨텐츠 ${contentId} 통계 업데이트 실패:`, error);
            throw error;
        }
    }
}

module.exports = {
    initializeDatabase,
    getPool,
    UserModel,
    ContentModel
};
