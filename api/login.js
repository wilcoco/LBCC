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

        // 사용자 찾기
        const user = await UserModel.findByUsername(username.trim());
        if (!user) {
            return res.status(404).json({ success: false, message: '존재하지 않는 사용자입니다.' });
        }

        res.json({ 
            success: true, 
            message: `${username}님, 환영합니다!`,
            user: user
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
}
