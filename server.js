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

// Initialize database
initializeDatabaseWithRetry();

// API Routes

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

// Investment endpoint
app.post('/api/invest', async (req, res) => {
    try {
        const { contentId, amount, username } = req.body;
        
        if (!contentId || !amount || !username || amount <= 0) {
            return res.status(400).json({ error: 'Invalid investment data.' });
        }
        
        // Check user exists
        const user = await UserModel.findByUsername(username);
        if (!user) {
            return res.status(400).json({ error: 'User not found.' });
        }
        
        if (user.balance < amount) {
            return res.status(400).json({ error: 'Insufficient balance.' });
        }
        
        // Check content exists
        const content = await ContentModel.findById(contentId);
        if (!content) {
            return res.status(400).json({ error: 'Content not found.' });
        }
        
        // Calculate dividend distribution
        const dividendDistribution = await coefficientCalculator.calculateDividendDistribution(contentId, amount);
        
        // Distribute dividends
        for (const dividend of dividendDistribution) {
            await UserModel.addDividend(dividend.username, dividend.amount);
            console.log(`💰 Dividend paid: ${dividend.username} +${dividend.amount}`);
        }
        
        // Record investment
        const investment = await ContentModel.addInvestment(contentId, {
            username,
            amount
        });
        
        // Update investor balance
        await UserModel.updateBalance(username, user.balance - amount);
        await UserModel.addInvestment(username, { contentId, amount });
        
        // Update coefficient
        const userCoefficient = await coefficientCalculator.getUserCoefficient(username);
        
        // Get updated user info
        const updatedUser = await UserModel.findByUsername(username);
        const finalCoefficient = await coefficientCalculator.getUserCoefficient(username);
        
        res.json({ 
            success: true, 
            investment,
            newBalance: updatedUser.balance,
            userCoefficient: finalCoefficient,
            effectiveAmount: amount * finalCoefficient,
            dividendsDistributed: dividendDistribution,
            message: `${amount} coins invested successfully!`
        });
        
    } catch (error) {
        console.error('❌ Investment error:', error);
        console.error('Error stack:', error.stack);
        console.error('Request data:', { contentId, amount, username });
        
        res.status(500).json({ 
            error: 'Investment failed.',
            details: error.message,
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
