const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase, UserModel, ContentModel } = require('./db/postgresql');
const { coefficientCalculator } = require('./coefficient-calculator');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware setup
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// Database initialization with retry
console.log('🚀 Server starting - Database initialization...');

async function initializeDatabaseWithRetry() {
    const maxRetries = 5;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
        try {
            console.log(`🔄 Database initialization attempt ${retryCount + 1}/${maxRetries}...`);
            await initializeDatabase();
            console.log('✅ Database initialization complete!');
            return;
        } catch (error) {
            retryCount++;
            console.error(`❌ Database initialization failed (attempt ${retryCount}/${maxRetries}):`, error.message);
            
            if (retryCount < maxRetries) {
                const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
                console.log(`⏳ ${delay}ms retry delay...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.error('💥 Database initialization final failure - Server continues but DB functions unavailable');
            }
        }
    }
}

// Initialize database (non-blocking)
initializeDatabaseWithRetry().catch(error => {
    console.error('❌ Database initialization completely failed, but server will continue:', error.message);
});

// API Routes

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        railway: !!process.env.RAILWAY_ENVIRONMENT
    });
});

// User registration
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || username.trim() === '') {
            return res.status(400).json({ error: 'Username is required.' });
        }
        
        console.log(`🔍 User registration attempt: ${username}`);
        
        // Check if user already exists
        const existingUser = await UserModel.findByUsername(username);
        if (existingUser) {
            return res.status(400).json({ error: 'Username already exists.' });
        }
        
        // Create user in database
        const user = await UserModel.create({
            username: username.trim(),
            password: password || 'default123',
            balance: 10000
        });
        
        console.log(`✅ User registration successful: ${username} (ID: ${user.id})`);
        
        // Return user info without password
        const { password: _, ...userInfo } = user;
        
        res.json({ 
            success: true, 
            user: userInfo,
            message: `Welcome ${username}! You have been given 10,000 coins.`
        });
        
    } catch (error) {
        console.error('❌ User registration error:', error);
        res.status(500).json({ 
            error: 'Registration failed.',
            details: error.message
        });
    }
});

// User login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || username.trim() === '') {
            return res.status(400).json({ error: 'Username is required.' });
        }
        
        console.log(`🔑 Login attempt: ${username}`);
        
        // Find user in database
        const user = await UserModel.findByUsername(username);
        if (!user) {
            return res.status(400).json({ error: 'User not found.' });
        }
        
        console.log(`✅ Login successful: ${username}`);
        
        // Return user info without password
        const { password: _, ...userInfo } = user;
        
        res.json({ 
            success: true, 
            user: userInfo,
            message: `Welcome back ${username}!`
        });
        
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ 
            error: 'Login failed.',
            details: error.message
        });
    }
});

// Get all contents
app.get('/api/contents', async (req, res) => {
    try {
        console.log('📜 Contents list request');
        
        let contents = [];
        try {
            contents = await ContentModel.findAll();
            console.log(`✅ Found ${contents.length} contents`);
        } catch (dbError) {
            console.warn('⚠️ Database query failed, returning empty list:', dbError.message);
            return res.json([]);
        }
        
        if (!contents || contents.length === 0) {
            return res.json([]);
        }
        
        res.json(contents);
        
    } catch (error) {
        console.error('❌ Contents query error:', error);
        res.json([]);
    }
});

// Create content
app.post('/api/contents', async (req, res) => {
    try {
        const { title, richContent, url, tags, files, author } = req.body;
        
        if (!title || !author) {
            return res.status(400).json({ error: 'Title and author are required.' });
        }
        
        // Check if user exists
        const user = await UserModel.findByUsername(author);
        if (!user) {
            return res.status(400).json({ error: 'User not found.' });
        }
        
        const contentData = {
            title: title.trim(),
            content: richContent || '',
            url: url || '',
            tags: tags || [],
            files: files || [],
            author
        };
        
        console.log(`📝 ${author} creating content: "${title}"`);
        
        const content = await ContentModel.create(contentData);
        
        console.log(`✅ Content created: ID ${content.id}`);
        
        res.json({ 
            success: true, 
            content,
            message: 'Content created successfully!'
        });
        
    } catch (error) {
        console.error('❌ Content creation error:', error);
        res.status(500).json({ 
            error: 'Content creation failed.',
            details: error.message
        });
    }
});

// 투자하기 (계수 시스템 통합)
app.post('/api/invest', async (req, res) => {
    try {
        const { contentId, amount, username } = req.body;
        
        if (!contentId || !amount || !username || amount <= 0) {
            return res.status(400).json({ error: '유효하지 않은 투자 정보입니다.' });
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
        
        // 현재 계수 기반 배당 분배 계산
        const dividendDistribution = await coefficientCalculator.calculateDividendDistribution(contentId, amount);
        
        // 배당 지급 (addDividend 메서드 사용)
        for (const dividend of dividendDistribution) {
            await UserModel.addDividend(dividend.username, dividend.amount);
            console.log(`💰 배당 지급: ${dividend.username} +${dividend.amount} (계수: ${dividend.coefficient.toFixed(4)}, 지분: ${(dividend.share * 100).toFixed(2)}%)`);
        }
        
        // 새로운 투자 기록 (investments 테이블에 추가)
        const investment = await ContentModel.addInvestment(contentId, {
            username,
            amount
        });
        
        // 투자자 처리: 잔액 차감 + 총 투자액 업데이트
        await UserModel.updateBalance(username, user.balance - amount);
        await UserModel.addInvestment(username, { contentId, amount });
        
        // 현재 투자 후 효과적 지분 업데이트
        const userCoefficient = await coefficientCalculator.getUserCoefficient(username);
        await coefficientCalculator.updateInvestmentEffectiveAmount(investment.id, username, amount);
        
        // 🔄 실시간 계수 업데이트: 투자자 + 기존 투자자들
        console.log('🔄 실시간 계수 업데이트 시작...');
        
        // 1. 현재 투자자 계수 업데이트
        const newInvestorPerformance = await UserModel.calculateUserPerformance(username);
        await UserModel.updateCoefficient(username, newInvestorPerformance, 'investment_made');
        console.log(`🔄 투자자 ${username} 계수 업데이트: ${newInvestorPerformance.toFixed(4)}`);
        
        // 2. 해당 컨텐츠의 기존 투자자들 계수 업데이트 (연속 투자 유입으로 성과 상승)
        const contentInvestments = await coefficientCalculator.getContentInvestments(contentId);
        const uniqueInvestors = [...new Set(contentInvestments.map(inv => inv.username).filter(u => u !== username))];
        
        for (const investorUsername of uniqueInvestors) {
            const investorPerformance = await UserModel.calculateUserPerformance(investorUsername);
            await UserModel.updateCoefficient(investorUsername, investorPerformance, 'attracted_investment');
            console.log(`🔄 기존 투자자 ${investorUsername} 계수 업데이트: ${investorPerformance.toFixed(4)}`);
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
        console.error('❌ 투자 처리 오류:', error);
        console.error('❌ 오류 스택:', error.stack);
        console.error('❌ 요청 데이터:', { contentId, amount, username });
        console.error('❌ 오류 세부사항:', {
            message: error.message,
            code: error.code,
            detail: error.detail,
            hint: error.hint,
            position: error.position,
            internalPosition: error.internalPosition,
            internalQuery: error.internalQuery,
            where: error.where,
            schema: error.schema,
            table: error.table,
            column: error.column,
            dataType: error.dataType,
            constraint: error.constraint,
            file: error.file,
            line: error.line,
            routine: error.routine
        });
        
        res.status(500).json({ 
            error: '투자 처리 중 오류가 발생했습니다.',
            details: error.message,
            code: error.code,
            timestamp: new Date().toISOString()
        });
    }
});

// Get user info
app.get('/api/users/:username', async (req, res) => {
    try {
        const { username } = req.params;
        
        console.log(`🔍 User info request: ${username}`);
        
        const user = await UserModel.findByUsername(username);
        if (!user) {
            console.log(`⚠️ User not found: ${username}`);
            return res.status(404).json({ error: 'User not found.' });
        }
        
        console.log(`✅ User info retrieved: ${username}`);
        
        const { password, ...userInfo } = user;
        res.json(userInfo);
        
    } catch (error) {
        console.error(`❌ User info error (${req.params.username}):`, error);
        res.status(500).json({ 
            error: 'Failed to retrieve user info.',
            details: error.message
        });
    }
});

// Get user performance
app.get('/api/users/:username/performance', async (req, res) => {
    try {
        const { username } = req.params;
        console.log(`🔍 Performance info request: ${username}`);
        
        const user = await UserModel.findByUsername(username);
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }
        
        const coefficient = await coefficientCalculator.getUserCoefficient(username);
        
        res.json({
            username: user.username,
            currentCoefficient: coefficient,
            balance: user.balance,
            totalInvested: user.total_invested || 0,
            totalDividends: user.total_dividends || 0
        });
        
    } catch (error) {
        console.error(`❌ Performance info error (${req.params.username}):`, error);
        res.status(500).json({ 
            error: 'Failed to retrieve performance info.',
            details: error.message
        });
    }
});

// Get user investments
app.get('/api/users/:username/investments', async (req, res) => {
    try {
        const { username } = req.params;
        console.log(`📊 Investment history request: ${username}`);
        
        const user = await UserModel.findByUsername(username);
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }
        
        const investments = await UserModel.getUserInvestments(username);
        
        res.json({
            username,
            totalInvested: user.total_invested || 0,
            totalDividends: user.total_dividends || 0,
            investmentCount: investments.length,
            investments
        });
        
    } catch (error) {
        console.error(`❌ Investment history error (${username}):`, error);
        res.status(500).json({ 
            error: 'Failed to retrieve investment history.',
            details: error.message
        });
    }
});

// Database reset API (for development/debugging)
app.post('/api/reset-database', async (req, res) => {
    try {
        console.log('🗑️ Database reset requested...');
        
        const { resetDatabase } = require('./reset-database');
        await resetDatabase();
        
        console.log('✅ Database reset completed successfully');
        res.json({ 
            success: true, 
            message: '데이터베이스가 성공적으로 초기화되었습니다.',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Database reset failed:', error);
        res.status(500).json({ 
            error: '데이터베이스 초기화 중 오류가 발생했습니다.',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Server startup
try {
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📱 Access at http://localhost:${PORT}`);
        console.log(`🎯 API endpoints: http://localhost:${PORT}/api/`);
        console.log(`🌍 Railway environment: ${process.env.RAILWAY_ENVIRONMENT || 'local'}`);
    });
    
    server.on('error', (error) => {
        console.error('❌ Server startup error:', error);
        if (error.code === 'EADDRINUSE') {
            console.error(`Port ${PORT} is already in use.`);
        }
    });
    
} catch (error) {
    console.error('❌ Server initialization failed:', error);
    process.exit(1);
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down server...');
    process.exit(0);
});
