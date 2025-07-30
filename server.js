const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase, UserModel, ContentModel } = require('./db/postgresql');
const { coefficientCalculator } = require('./coefficient-calculator');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;

// 미들웨어 설정
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// 데이터베이스 초기화
initializeDatabase();

// 이제 모든 데이터는 PostgreSQL 데이터베이스에 저장됩니다.
// 메모리 기반 저장소는 더 이상 사용하지 않습니다.

// API 라우트

// 사용자 등록 (데이터베이스 기반)
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || username.trim() === '') {
            return res.status(400).json({ error: '사용자명을 입력해주세요.' });
        }
        
        console.log(`🔐 새 사용자 등록 시도: ${username}`);
        
        // 사용자 중복 확인
        const existingUser = await UserModel.findByUsername(username);
        if (existingUser) {
            return res.status(400).json({ error: '이미 존재하는 사용자명입니다.' });
        }
        
        // 데이터베이스에 사용자 생성
        const user = await UserModel.create({
            username: username.trim(),
            password: password || 'default123', // 기본 비밀번호
            balance: 10000
        });
        
        console.log(`✅ 사용자 등록 성공: ${username} (ID: ${user.id})`);
        
        // 비밀번호 제외하고 반환
        const { password: _, ...userInfo } = user;
        
        res.json({ 
            success: true, 
            user: userInfo,
            message: `${username}님, 환영합니다! 10,000 코인이 지급되었습니다.`
        });
        
    } catch (error) {
        console.error('❌ 사용자 등록 오류:', error);
        res.status(500).json({ 
            error: '사용자 등록 중 오류가 발생했습니다.',
            details: error.message
        });
    }
});

// 사용자 로그인 (데이터베이스 기반)
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || username.trim() === '') {
            return res.status(400).json({ error: '사용자명을 입력해주세요.' });
        }
        
        console.log(`🔑 로그인 시도: ${username}`);
        
        // 데이터베이스에서 사용자 조회
        const user = await UserModel.findByUsername(username);
        if (!user) {
            return res.status(400).json({ error: '존재하지 않는 사용자입니다.' });
        }
        
        console.log(`✅ 로그인 성공: ${username}`);
        
        // 비밀번호 제외하고 반환
        const { password: _, ...userInfo } = user;
        
        res.json({ 
            success: true, 
            user: userInfo,
            message: `${username}님, 환영합니다!`
        });
        
    } catch (error) {
        console.error('❌ 로그인 오류:', error);
        res.status(500).json({ 
            error: '로그인 중 오류가 발생했습니다.',
            details: error.message
        });
    }
});

// 모든 컨텐츠 조회 (데이터베이스 기반)
app.get('/api/contents', async (req, res) => {
    try {
        console.log('📜 컨텐츠 목록 요청');
        
        // 데이터베이스에서 모든 컨텐츠 조회 (최신순)
        const contents = await ContentModel.findAll();
        
        console.log(`✅ 컨텐츠 ${contents.length}건 조회 완료`);
        
        // 각 컨텐츠에 투자 정보 추가
        const contentsWithInvestments = await Promise.all(contents.map(async (content) => {
            try {
                // 해당 컨텐츠의 모든 투자 조회
                const { getPool } = require('./db/postgresql');
                const client = getPool();
                const investmentsResult = await client.query(
                    'SELECT username, amount FROM investments WHERE content_id = $1',
                    [content.id]
                );
                
                const contentInvestments = investmentsResult.rows;
                const totalInvestment = contentInvestments.reduce((sum, inv) => sum + inv.amount, 0);
                const investorCount = new Set(contentInvestments.map(inv => inv.username)).size;
                
                // 투자자별 총 투자액 계산
                const investorSummary = {};
                contentInvestments.forEach(inv => {
                    investorSummary[inv.username] = (investorSummary[inv.username] || 0) + inv.amount;
                });
                
                // 상위 투자자 3명
                const topInvestors = Object.entries(investorSummary)
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 3)
                    .map(([username, amount]) => ({ username, amount }));
                
                return {
                    ...content,
                    totalInvestment,
                    investorCount,
                    topInvestors
                };
            } catch (error) {
                console.warn(`⚠️ 컨텐츠 ${content.id} 투자 정보 조회 실패:`, error.message);
                return {
                    ...content,
                    totalInvestment: 0,
                    investorCount: 0,
                    topInvestors: []
                };
            }
        }));
        
        res.json(contentsWithInvestments);
        
    } catch (error) {
        console.error('❌ 컨텐츠 조회 오류:', error);
        res.status(500).json({ 
            error: '컨텐츠 조회 중 오류가 발생했습니다.',
            details: error.message
        });
    }
});

// 컨텐츠 생성 (데이터베이스 기반)
app.post('/api/contents', async (req, res) => {
    try {
        const { title, richContent, url, tags, files, author } = req.body;
        
        // 필수 정보 검증
        if (!title || !author) {
            return res.status(400).json({ error: '제목과 작성자는 필수 입니다.' });
        }
        
        // 사용자 존재 확인 (데이터베이스에서)
        const user = await UserModel.findByUsername(author);
        if (!user) {
            return res.status(400).json({ error: '존재하지 않는 사용자입니다.' });
        }
        
        // 컨텐츠 데이터 준비
        const contentData = {
            title: title.trim(),
            content: richContent || '',
            url: url || '',
            tags: tags || [],
            files: files || [],
            author
        };
        
        console.log(`📝 ${author}가 새 컨텐츠 생성: "${title}"`);
        
        // 데이터베이스에 컨텐츠 저장
        const content = await ContentModel.create(contentData);
        
        console.log(`✅ 컨텐츠 생성 완료: ID ${content.id}`);
        
        res.json({ 
            success: true, 
            content,
            message: '컨텐츠가 성공적으로 생성되었습니다!'
        });
        
    } catch (error) {
        console.error('❌ 컨텐츠 생성 오류:', error);
        res.status(500).json({ 
            error: '컨텐츠 생성 중 오류가 발생했습니다.',
            details: error.message
        });
    }
});

// 투자하기 (계수 시스템 통합)
app.post('/api/invest', async (req, res) => {
    try {
        const { contentId, amount, username } = req.body;
        
        if (!contentId || !amount || !username || amount <= 0) {
            return res.status(400).json({ error: '잘못된 투자 정보입니다.' });
        }
        
        // 사용자 확인
        const user = await UserModel.findByUsername(username);
        if (!user) {
            return res.status(400).json({ error: '존재하지 않는 사용자입니다.' });
        }
        
        if (user.balance < amount) {
            return res.status(400).json({ error: '잔액이 부족합니다.' });
        }
        
        // 컨텐츠 확인
        const content = await ContentModel.findById(contentId);
        if (!content) {
            return res.status(400).json({ error: '존재하지 않는 컨텐츠입니다.' });
        }
        
        // 🚀 계수 기반 배당 분배 계산
        const dividendDistribution = await coefficientCalculator.calculateDividendDistribution(contentId, amount);
        
        // 배당 지급 (addDividend 메서드 사용)
        for (const dividend of dividendDistribution) {
            await UserModel.addDividend(dividend.username, dividend.amount);
            console.log(`💰 배당 지급: ${dividend.username} +${dividend.amount} (계수: ${dividend.coefficient.toFixed(4)}, 지분: ${(dividend.share * 100).toFixed(2)}%)`);
        }
        
        // 새 투자 기록 (investments 테이블에 추가)
        const investment = await ContentModel.addInvestment(contentId, {
            username,
            amount
        });
        
        // 투자자 처리: 잔액 차감 + 총 투자액 업데이트
        await UserModel.updateBalance(username, user.balance - amount);
        await UserModel.addInvestment(username, { contentId, amount });
        
        // 🎯 투자 후 효과적 지분 업데이트
        const userCoefficient = await coefficientCalculator.getUserCoefficient(username);
        await coefficientCalculator.updateInvestmentEffectiveAmount(investment.id, username, amount);
        
        // 🚀 실시간 계수 업데이트: 투자자 + 기존 투자자들
        console.log('📊 실시간 계수 업데이트 시작...');
        
        // 1. 현재 투자자 계수 업데이트
        const newInvestorPerformance = await UserModel.calculateUserPerformance(username);
        await UserModel.updateCoefficient(username, newInvestorPerformance, 'investment_made');
        console.log(`🎯 투자자 ${username} 계수 업데이트: ${newInvestorPerformance.toFixed(4)}`);
        
        // 2. 해당 컨텐츠의 기존 투자자들 계수 업데이트 (후속 투자 유입으로 성과 향상)
        const contentInvestments = await coefficientCalculator.getContentInvestments(contentId);
        const uniqueInvestors = [...new Set(contentInvestments.map(inv => inv.username).filter(u => u !== username))];
        
        for (const investorUsername of uniqueInvestors) {
            const investorPerformance = await UserModel.calculateUserPerformance(investorUsername);
            await UserModel.updateCoefficient(investorUsername, investorPerformance, 'attracted_investment');
            console.log(`📈 기존 투자자 ${investorUsername} 계수 업데이트: ${investorPerformance.toFixed(4)}`);
        }
        
        // 캐시 무효화 (계수 변경으로 인한)
        coefficientCalculator.invalidateCache();
        console.log('✅ 실시간 계수 업데이트 완료!');
        
        // 업데이트된 사용자 정보
        const updatedUser = await UserModel.findByUsername(username);
        const finalCoefficient = await coefficientCalculator.getUserCoefficient(username);
        
        res.json({ 
            success: true, 
            investment,
            newBalance: updatedUser.balance,
            userCoefficient: finalCoefficient,
            effectiveAmount: amount * finalCoefficient,
            dividendsDistributed: dividendDistribution,
            coefficientUpdated: true,
            message: `${amount} 코인 투자 완료! (효과적 지분: ${(amount * finalCoefficient).toFixed(2)}, 계수: ×${finalCoefficient.toFixed(4)})`
        });
        
    } catch (error) {
        console.error('투자 처리 오류:', error);
        res.status(500).json({ error: '투자 처리 중 오류가 발생했습니다.' });
    }
});

// 사용자 정보 조회 (데이터베이스 기반)
app.get('/api/users/:username', async (req, res) => {
    try {
        const { username } = req.params;
        
        console.log(`🔍 사용자 정보 요청: ${username}`);
        
        // 데이터베이스에서 사용자 조회
        const user = await UserModel.findByUsername(username);
        if (!user) {
            console.log(`⚠️ 사용자 없음: ${username}`);
            return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
        }
        
        console.log(`✅ 사용자 정보 조회 성공: ${username}`);
        
        // 사용자 정보 반환 (비밀번호 제외)
        const { password, ...userInfo } = user;
        res.json(userInfo);
        
    } catch (error) {
        console.error(`❌ 사용자 정보 조회 오류 (${req.params.username}):`, error);
        res.status(500).json({ 
            error: '사용자 정보 조회 중 오류가 발생했습니다.',
            details: error.message
        });
    }
});

// 🎯 사용자 계수 및 성과 정보 조회
app.get('/api/users/:username/performance', async (req, res) => {
    try {
        const { username } = req.params;
        console.log(`🔍 성과 정보 요청: ${username}`);
        
        // 사용자 존재 확인
        const { UserModel } = require('./db/postgresql');
        const user = await UserModel.findByUsername(username);
        if (!user) {
            console.log(`⚠️ 사용자 없음: ${username}`);
            return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
        }
        
        console.log(`📊 ${username} 성과 요약 계산 시작...`);
        const performanceSummary = await coefficientCalculator.getUserPerformanceSummary(username);
        
        if (!performanceSummary) {
            console.log(`⚠️ ${username} 성과 요약 없음`);
            return res.status(404).json({ error: '성과 정보를 찾을 수 없습니다.' });
        }
        
        console.log(`✅ ${username} 성과 요약 완료:`, {
            coefficient: performanceSummary.currentCoefficient,
            totalInvested: performanceSummary.totalInvested,
            totalDividends: performanceSummary.totalDividends
        });
        
        res.json(performanceSummary);
    } catch (error) {
        console.error(`❌ ${req.params.username} 성과 정보 조회 오류:`, error);
        res.status(500).json({ 
            error: '성과 정보 조회 중 오류가 발생했습니다.',
            details: error.message 
        });
    }
});

// 🔄 계수 배치 업데이트 (관리자용)
app.post('/api/admin/update-coefficients', async (req, res) => {
    try {
        await UserModel.batchUpdateCoefficients();
        coefficientCalculator.invalidateCache(); // 캐시 무효화
        
        res.json({ 
            success: true, 
            message: '모든 사용자 계수가 업데이트되었습니다.' 
        });
    } catch (error) {
        console.error('계수 배치 업데이트 오류:', error);
        res.status(500).json({ error: '계수 업데이트 중 오류가 발생했습니다.' });
    }
});

// 📊 컨텐츠별 효과적 지분 조회
app.get('/api/contents/:contentId/shares', async (req, res) => {
    try {
        const { contentId } = req.params;
        
        const effectiveShares = await coefficientCalculator.getEffectiveShares(contentId);
        
        res.json({
            contentId: parseInt(contentId),
            shares: effectiveShares,
            totalShares: effectiveShares.length,
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        console.error('지분 조회 오류:', error);
        res.status(500).json({ error: '지분 조회 중 오류가 발생했습니다.' });
    }
});

// 사용자 투자 현황 조회
app.get('/api/users/:username/investments', async (req, res) => {
    try {
        const { username } = req.params;
    
    console.log(`투자 현황 요청: ${username}`);
    console.log(`전체 사용자:`, Object.keys(users));
    console.log(`전체 투자 내역 수:`, investments.length);
    
    if (!users[username]) {
        console.log(`사용자 찾을 수 없음: ${username}`);
        return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }
    
    // 사용자의 투자 내역 조회
    const userInvestments = investments.filter(inv => inv.username === username);
    console.log(`${username}의 투자 내역:`, userInvestments.length, '건');
    
    // 투자 내역이 없는 경우 빠른 응답
    if (userInvestments.length === 0) {
        console.log(`${username} - 투자 내역 없음`);
        return res.json({
            username,
            totalInvested: 0,
            investmentCount: 0,
            investments: []
        });
    }
    
    // 컨텐츠별로 투자 내역 그룹화
    const investmentsByContent = {};
    userInvestments.forEach(inv => {
        if (!investmentsByContent[inv.contentId]) {
            investmentsByContent[inv.contentId] = {
                contentId: inv.contentId,
                totalInvested: 0,
                investments: []
            };
        }
        investmentsByContent[inv.contentId].totalInvested += inv.amount;
        investmentsByContent[inv.contentId].investments.push(inv);
    });
    
    // 컨텐츠 정보와 현재 지분 계산
    const investmentSummary = Object.values(investmentsByContent).map(investment => {
        const content = contents.find(c => c.id === investment.contentId);
        if (!content) return null;
        
        // 해당 컨텐츠의 총 투자액 계산
        const contentInvestments = investments.filter(inv => inv.contentId === investment.contentId);
        const totalContentInvestment = contentInvestments.reduce((sum, inv) => sum + inv.amount, 0);
        
        // 현재 지분 계산
        const currentShare = totalContentInvestment > 0 ? 
            (investment.totalInvested / totalContentInvestment * 100) : 0;
        
        // 해당 컨텐츠에서 받은 배당 계산
        const contentDividends = dividends.filter(div => 
            div.recipientUsername === username && div.contentId === investment.contentId
        );
        const totalDividends = contentDividends.reduce((sum, div) => sum + div.amount, 0);
        
        return {
            contentId: investment.contentId,
            contentTitle: content.title,
            contentAuthor: content.author,
            totalInvested: investment.totalInvested,
            totalDividends: totalDividends,
            dividendHistory: contentDividends.map(div => ({
                amount: div.amount,
                fromUsername: div.fromUsername,
                timestamp: div.timestamp,
                newInvestmentAmount: div.newInvestmentAmount
            })),
            currentShare: parseFloat(currentShare.toFixed(2)),
            totalContentInvestment,
            createdAt: content.createdAt
        };
    }).filter(item => item !== null);
    
    // 총 투자액과 총 배당 계산
    const totalInvested = investmentSummary.reduce((sum, inv) => sum + inv.totalInvested, 0);
    const totalDividends = investmentSummary.reduce((sum, inv) => sum + inv.totalDividends, 0);
    
        res.json({
            username,
            totalInvested,
            totalDividends,
            investmentCount: investmentSummary.length,
            investments: investmentSummary.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        });
    } catch (error) {
        console.error('투자 현황 조회 오류:', error);
        res.status(500).json({ error: '투자 현황 조회 중 오류가 발생했습니다.' });
    }
});

// 🔍 디버깅: 모든 사용자 계수 조회
app.get('/api/debug/coefficients', async (req, res) => {
    try {
        const { getPool } = require('./db/postgresql');
        const client = getPool();
        
        const result = await client.query(`
            SELECT username, coefficient, coefficient_updated_at, balance, total_invested, total_dividends
            FROM users 
            ORDER BY coefficient DESC
        `);
        
        res.json({
            success: true,
            users: result.rows,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('계수 조회 오류:', error);
        res.status(500).json({ error: '계수 조회 중 오류가 발생했습니다.' });
    }
});

// 디버그 엔드포인트: 사용자 계수 수동 업데이트
app.post('/api/debug/update-coefficient/:username', async (req, res) => {
    try {
        const { username } = req.params;
        
        console.log(`${username} 계수 수동 업데이트 요청`);
        
        // 성과 계산 및 계수 업데이트
        const performance = await UserModel.calculateUserPerformance(username);
        await UserModel.updateCoefficient(
            username, 
            performance, 
            'Manual debug update', 
            performance
        );
        
        console.log(`${username} 계수 업데이트 완료: ${performance.toFixed(4)}`);
        
        res.json({
            success: true,
            username,
            newCoefficient: performance,
            message: '계수 업데이트 완료'
        });
        
    } catch (error) {
        console.error('계수 수동 업데이트 오류:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 관리자 엔드포인트: 데이터베이스 완전 초기화
app.post('/api/admin/reset-database', async (req, res) => {
    try {
        console.log('데이터베이스 완전 초기화 시작...');
        
        const { getPool } = require('./db/postgresql');
        const client = getPool();
        
        // 모든 테이블의 데이터 삭제 (순서 중요 - 외래키 제약 고려)
        await client.query('DELETE FROM coefficient_history');
        console.log('coefficient_history 테이블 초기화 완료');
        
        await client.query('DELETE FROM investments');
        console.log('investments 테이블 초기화 완료');
        
        await client.query('DELETE FROM content');
        console.log('content 테이블 초기화 완료');
        
        await client.query('DELETE FROM users');
        console.log('users 테이블 초기화 완료');
        
        // 시퀀스 초기화 (ID 카운터 리셋)
        try {
            await client.query('ALTER SEQUENCE users_id_seq RESTART WITH 1');
            await client.query('ALTER SEQUENCE content_id_seq RESTART WITH 1');
            await client.query('ALTER SEQUENCE investments_id_seq RESTART WITH 1');
            await client.query('ALTER SEQUENCE coefficient_history_id_seq RESTART WITH 1');
            console.log('모든 시퀀스 초기화 완료');
        } catch (seqError) {
            console.warn('시퀀스 초기화 경고:', seqError.message);
        }
        
        console.log('데이터베이스 초기화 완료! 모든 사용자 및 데이터가 삭제되었습니다.');
        
        res.json({
            success: true,
            message: '데이터베이스가 완전히 초기화되었습니다.',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('데이터베이스 초기화 실패:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: '데이터베이스 초기화 실패'
        });
    }
});

// 정적 파일 서빙 (index.html 등)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 서버 시작
app.listen(PORT, () => {
    console.log(`🚀 캠스 업무 일지 서버가 포트 ${PORT}에서 실행 중입니다!`);
    console.log(`📱 브라우저에서 http://localhost:${PORT} 접속하세요`);
    console.log(`🎯 API 엔드포인트: http://localhost:${PORT}/api/`);
});

// 종료 시 정리
process.on('SIGINT', () => {
    console.log('\n👋 서버를 종료합니다...');
    process.exit(0);
});
