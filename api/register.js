const { UserModel } = require('../db/mongodb');

export default async function handler(req, res) {
    // CORS 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    try {
        const { username } = req.body;
        
        if (!username || username.trim() === '') {
            return res.status(400).json({ success: false, message: '사용자명을 입력해주세요.' });
        }

        // 기존 사용자 확인
        const existingUser = await UserModel.findByUsername(username.trim());
        if (existingUser) {
            return res.status(400).json({ success: false, message: '이미 존재하는 사용자명입니다.' });
        }

        // 새 사용자 생성
        const newUser = {
            username: username.trim(),
            balance: 10000,
            investments: [],
            totalInvested: 0,
            totalDividends: 0
        };

        await UserModel.create(newUser);

        res.json({ 
            success: true, 
            message: `환영합니다, ${username}님! 10,000 코인이 지급되었습니다.`,
            user: newUser
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
}
