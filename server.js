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

// 메모리 기반 데이터 저장소 (실제 운영에서는 데이터베이스 사용)
let users = {};
let contents = [];
let investments = [];
let dividends = []; // 배당 내역 추적
let nextContentId = 1;

// API 라우트

// 사용자 등록
app.post('/api/register', (req, res) => {
    const { username } = req.body;
    
    if (!username || username.trim() === '') {
        return res.status(400).json({ error: '사용자명을 입력해주세요.' });
    }
    
    if (users[username]) {
        return res.status(400).json({ error: '이미 존재하는 사용자명입니다.' });
    }
    
    users[username] = {
        username,
        balance: 10000,
        createdAt: new Date().toISOString()
    };
    
    res.json({ 
        success: true, 
        user: users[username],
        message: `${username}님, 환영합니다! 10,000 코인이 지급되었습니다.`
    });
});

// 사용자 로그인
app.post('/api/login', (req, res) => {
    const { username } = req.body;
    
    if (!username || !users[username]) {
        return res.status(400).json({ error: '존재하지 않는 사용자입니다.' });
    }
    
    res.json({ 
        success: true, 
        user: users[username],
        message: `${username}님, 환영합니다!`
    });
});

// 모든 컨텐츠 조회
app.get('/api/contents', (req, res) => {
    // 최신순으로 정렬
    const sortedContents = [...contents].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // 각 컨텐츠에 투자 정보 추가
    const contentsWithInvestments = sortedContents.map(content => {
        const contentInvestments = investments.filter(inv => inv.contentId === content.id);
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
    });
    
    res.json(contentsWithInvestments);
});

// 컨텐츠 생성
app.post('/api/contents', (req, res) => {
    const { title, richContent, url, tags, files, author } = req.body;
    
    if (!title || !author || !users[author]) {
        return res.status(400).json({ error: '필수 정보가 누락되었습니다.' });
    }
    
    const content = {
        id: nextContentId++,
        title: title.trim(),
        richContent: richContent || '',
        url: url || '',
        tags: tags || [],
        files: files || [],
        author,
        createdAt: new Date().toISOString()
    };
    
    contents.push(content);
    
    res.json({ 
        success: true, 
        content,
        message: '컨텐츠가 성공적으로 생성되었습니다!'
    });
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
        
        // 배당 지급
        for (const dividend of dividendDistribution) {
            await UserModel.updateBalance(
                dividend.username, 
                (await UserModel.findByUsername(dividend.username)).balance + dividend.amount
            );
            
            console.log(`💰 배당 지급: ${dividend.username} +${dividend.amount} (계수: ${dividend.coefficient.toFixed(4)}, 지분: ${(dividend.share * 100).toFixed(2)}%)`);
        }
        
        // 새 투자 기록
        const investment = await ContentModel.addInvestment(contentId, {
            username,
            amount,
            timestamp: new Date().toISOString()
        });
        
        // 투자자 잔액 차감
        await UserModel.updateBalance(username, user.balance - amount);
        
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

// 사용자 정보 조회
app.get('/api/users/:username', (req, res) => {
    const { username } = req.params;
    
    if (!users[username]) {
        return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }
    
    res.json(users[username]);
});

// 🎯 사용자 계수 및 성과 정보 조회
app.get('/api/users/:username/performance', async (req, res) => {
    try {
        const { username } = req.params;
        
        const performanceSummary = await coefficientCalculator.getUserPerformanceSummary(username);
        if (!performanceSummary) {
            return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
        }
        
        res.json(performanceSummary);
    } catch (error) {
        console.error('성과 정보 조회 오류:', error);
        res.status(500).json({ error: '성과 정보 조회 중 오류가 발생했습니다.' });
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
