const express = require('express');
const serverless = require('serverless-http');

const app = express();

// CORS 설정
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

app.use(express.json());

// 메모리 내 데이터 저장 (실제 배포에서는 데이터베이스 사용 권장)
let users = {};
let contents = [];
let nextContentId = 1;

// 사용자 등록
app.post('/api/register', (req, res) => {
    const { username } = req.body;
    
    if (!username || username.trim() === '') {
        return res.status(400).json({ success: false, message: '사용자명을 입력해주세요.' });
    }
    
    if (users[username]) {
        return res.status(400).json({ success: false, message: '이미 존재하는 사용자명입니다.' });
    }
    
    users[username] = {
        username: username,
        balance: 10000,
        joinDate: new Date().toISOString(),
        investments: [],
        totalInvested: 0,
        totalDividends: 0
    };
    
    res.json({ 
        success: true, 
        message: `환영합니다, ${username}님! 10,000 코인이 지급되었습니다.`,
        user: users[username]
    });
});

// 사용자 로그인
app.post('/api/login', (req, res) => {
    const { username } = req.body;
    
    if (!username || username.trim() === '') {
        return res.status(400).json({ success: false, message: '사용자명을 입력해주세요.' });
    }
    
    if (!users[username]) {
        return res.status(404).json({ success: false, message: '존재하지 않는 사용자입니다.' });
    }
    
    res.json({ 
        success: true, 
        message: `${username}님, 환영합니다!`,
        user: users[username]
    });
});

// 컨텐츠 생성
app.post('/api/contents', (req, res) => {
    const { title, content, url, tags, files, author } = req.body;
    
    if (!title || title.trim() === '') {
        return res.status(400).json({ success: false, message: '제목을 입력해주세요.' });
    }
    
    if (!author || !users[author]) {
        return res.status(400).json({ success: false, message: '유효하지 않은 사용자입니다.' });
    }
    
    const newContent = {
        id: nextContentId++,
        title: title.trim(),
        content: content || '',
        url: url || '',
        tags: tags || [],
        files: files || [],
        author: author,
        createdAt: new Date().toISOString(),
        totalInvestment: 0,
        investors: {},
        investorCount: 0,
        topInvestors: [],
        investmentHistory: []
    };
    
    contents.push(newContent);
    
    res.json({ 
        success: true, 
        message: '컨텐츠가 성공적으로 생성되었습니다.',
        content: newContent
    });
});

// 컨텐츠 목록 조회
app.get('/api/contents', (req, res) => {
    res.json(contents);
});

// 투자하기
app.post('/api/invest', (req, res) => {
    const { contentId, amount, investor } = req.body;
    
    const content = contents.find(c => c.id === parseInt(contentId));
    if (!content) {
        return res.status(404).json({ success: false, message: '컨텐츠를 찾을 수 없습니다.' });
    }
    
    const user = users[investor];
    if (!user) {
        return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }
    
    const investAmount = parseInt(amount);
    if (isNaN(investAmount) || investAmount <= 0) {
        return res.status(400).json({ success: false, message: '올바른 투자 금액을 입력해주세요.' });
    }
    
    if (user.balance < investAmount) {
        return res.status(400).json({ success: false, message: '잔액이 부족합니다.' });
    }
    
    // 기존 투자자들에게 배당 지급
    const totalInvestmentBefore = content.totalInvestment;
    if (totalInvestmentBefore > 0) {
        for (const [investorName, investorAmount] of Object.entries(content.investors)) {
            const share = investorAmount / totalInvestmentBefore;
            const dividend = Math.floor(investAmount * share);
            
            if (users[investorName]) {
                users[investorName].balance += dividend;
                users[investorName].totalDividends += dividend;
            }
        }
    }
    
    // 투자 처리
    user.balance -= investAmount;
    user.totalInvested += investAmount;
    
    // 투자 기록
    const investment = {
        contentId: contentId,
        amount: investAmount,
        timestamp: new Date().toISOString()
    };
    user.investments.push(investment);
    
    // 컨텐츠 투자 정보 업데이트
    content.totalInvestment += investAmount;
    content.investors[investor] = (content.investors[investor] || 0) + investAmount;
    content.investorCount = Object.keys(content.investors).length;
    
    // 상위 투자자 업데이트
    content.topInvestors = Object.entries(content.investors)
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);
    
    // 투자 히스토리 기록
    content.investmentHistory.push({
        investor: investor,
        amount: investAmount,
        timestamp: new Date().toISOString(),
        totalInvestmentAfter: content.totalInvestment
    });
    
    res.json({ 
        success: true, 
        message: `${investAmount} 코인을 투자했습니다.`,
        newBalance: user.balance,
        content: content
    });
});

// 사용자 투자 현황 조회
app.get('/api/users/:username/investments', (req, res) => {
    const { username } = req.params;
    const user = users[username];
    
    if (!user) {
        return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }
    
    // 투자한 컨텐츠 정보와 함께 반환
    const investmentDetails = user.investments.map(investment => {
        const content = contents.find(c => c.id === parseInt(investment.contentId));
        return {
            ...investment,
            contentTitle: content ? content.title : '삭제된 컨텐츠',
            contentAuthor: content ? content.author : 'Unknown'
        };
    });
    
    res.json({
        totalInvested: user.totalInvested,
        totalDividends: user.totalDividends,
        investmentCount: user.investments.length,
        investments: investmentDetails
    });
});

// 기본 라우트
app.get('/api', (req, res) => {
    res.json({ 
        message: '🚀 캠스 업무 일지 API 서버가 실행 중입니다!',
        version: '1.0.0',
        features: ['로컬 체인', '투자 시스템', '배당 분배', '사용자 주권']
    });
});

module.exports.handler = serverless(app);
