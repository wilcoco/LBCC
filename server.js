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

// Get user investments
app.get('/api/users/:username/investments', async (req, res) => {
    try {
        const { username } = req.params;
        console.log(`📊 사용자 투자 현황 조회: ${username}`);
        
        // 사용자 존재 확인
        const user = await UserModel.findByUsername(username);
        if (!user) {
            return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
        }
        
        // 사용자 투자 현황 조회
        const investments = await UserModel.getUserInvestments(username);
        console.log(`✅ ${username} 투자 현황 조회 완료: ${investments.length}건`);
        
        // 로컬 체인 검증을 위한 데이터 구조로 반환
        const response = {
            totalInvested: user.total_invested || 0,
            totalDividends: user.total_dividends || 0,
            investmentCount: investments.length,
            investments: investments
        };
        
        res.json(response);
        
    } catch (error) {
        console.error(`❌ 사용자 투자 현황 조회 오류 (${req.params.username}):`, error);
        res.status(500).json({ 
            error: '투자 현황 조회에 실패했습니다.',
            details: error.message
        });
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

// 투자하기 (간단한 버전 - 502 에러 해결용)
app.post('/api/invest', async (req, res) => {
    try {
        const { contentId, amount, username } = req.body;
        
        console.log(`🔍 투자 요청: ${username} -> 컨텐츠 ${contentId}, 금액: ${amount}`);
        
        if (!contentId || !amount || !username || amount <= 0) {
            return res.status(400).json({ error: '유효하지 않은 투자 정보입니다.' });
        }
        
        // 사용자 확인
        console.log(`🔍 사용자 확인: ${username}`);
        const user = await UserModel.findByUsername(username);
        if (!user) {
            return res.status(400).json({ error: '존재하지 않는 사용자입니다.' });
        }
        
        if (user.balance < amount) {
            return res.status(400).json({ error: '잔액이 부족합니다.' });
        }
        
        // 컨텐츠 확인
        console.log(`🔍 컨텐츠 확인: ${contentId}`);
        const content = await ContentModel.findById(contentId);
        if (!content) {
            return res.status(400).json({ error: '존재하지 않는 컨텐츠입니다.' });
        }
        
        // 안전한 투자 처리 (계수 계산 시스템 포함)
        console.log('💰 고급 투자 처리 시작...');
        
        // 1단계: 배당 분배 계산 (안전한 버전)
        let dividendDistribution = [];
        let dividendError = null;
        
        try {
            console.log('💰 배당 분배 계산 시작...');
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('배당 계산 타임아웃')), 5000)
            );
            
            const dividendPromise = coefficientCalculator.calculateDividendDistribution(contentId, amount);
            dividendDistribution = await Promise.race([dividendPromise, timeoutPromise]);
            
            console.log(`💰 배당 분배 계산 완료: ${dividendDistribution.length}명`);
            
            // 배당 지급 (각각 안전하게 처리)
            for (const dividend of dividendDistribution) {
                try {
                    await UserModel.addDividend(dividend.username, dividend.amount);
                    console.log(`💰 배당 지급: ${dividend.username} +${dividend.amount}`);
                } catch (dividendPayError) {
                    console.error(`⚠️ 배당 지급 실패 (${dividend.username}):`, dividendPayError.message);
                }
            }
            
        } catch (error) {
            dividendError = error.message;
            console.error('⚠️ 배당 분배 실패, 기본 투자 진행:', error.message);
            dividendDistribution = [];
        }
        
        // 2단계: 투자 기록 추가
        console.log('📝 투자 기록 추가...');
        const investment = await ContentModel.addInvestment(contentId, {
            username,
            amount
        });
        console.log(`✅ 투자 기록 추가 완료: ID ${investment.id}`);
        
        // 3단계: 사용자 잔액 업데이트
        console.log('💳 사용자 잔액 업데이트...');
        await UserModel.updateBalance(username, user.balance - amount);
        await UserModel.addInvestment(username, { contentId, amount });
        console.log('✅ 사용자 잔액 업데이트 완료');
        
        // 4단계: 계수 기반 효과적 지분 계산 (안전한 버전)
        let userCoefficient = 1.0;
        let finalCoefficient = 1.0;
        let effectiveAmount = amount;
        let coefficientUpdated = false;
        
        try {
            console.log('🔄 계수 기반 지분 계산 시작...');
            const coeffTimeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('계수 계산 타임아웃')), 3000)
            );
            
            // 사용자 계수 조회
            const coeffPromise = coefficientCalculator.getUserCoefficient(username);
            userCoefficient = await Promise.race([coeffPromise, coeffTimeoutPromise]);
            
            // 효과적 투자 금액 업데이트
            await coefficientCalculator.updateInvestmentEffectiveAmount(investment.id, username, amount);
            effectiveAmount = amount * userCoefficient;
            
            console.log(`🔄 ${username} 계수: ${userCoefficient.toFixed(4)}, 효과적 금액: ${effectiveAmount.toFixed(2)}`);
            
            // 투자자 성과 업데이트 (제한적으로)
            try {
                const newInvestorPerformance = await UserModel.calculateUserPerformance(username);
                await UserModel.updateCoefficient(username, newInvestorPerformance, 'investment_made');
                console.log(`🔄 투자자 ${username} 계수 업데이트: ${newInvestorPerformance.toFixed(4)}`);
                
                finalCoefficient = newInvestorPerformance;
                coefficientUpdated = true;
                
            } catch (perfError) {
                console.error('⚠️ 성과 계수 업데이트 실패:', perfError.message);
                finalCoefficient = userCoefficient;
            }
            
            // 캐시 무효화
            coefficientCalculator.invalidateCache(username);
            console.log('✅ 계수 계산 완료!');
            
        } catch (coeffError) {
            console.error('⚠️ 계수 계산 실패, 기본값 사용:', coeffError.message);
            userCoefficient = 1.0;
            finalCoefficient = 1.0;
            effectiveAmount = amount;
        }
        
        // 5단계: 최종 사용자 정보 조회
        const updatedUser = await UserModel.findByUsername(username);
        
        console.log(`✅ 고급 투자 완료: ${username} -> 컨텐츠 ${contentId}, 금액: ${amount}, 효과적: ${effectiveAmount.toFixed(2)}`);
        
        res.json({ 
            success: true, 
            investment,
            newBalance: updatedUser.balance,
            userCoefficient: finalCoefficient,
            effectiveAmount: effectiveAmount,
            dividendsDistributed: dividendDistribution,
            coefficientUpdated: coefficientUpdated,
            dividendError: dividendError,
            message: `${amount} 코인 투자 완료! (효과적 지분: ${effectiveAmount.toFixed(2)}, 계수: ×${finalCoefficient.toFixed(4)}) 새 잔액: ${updatedUser.balance}`
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
