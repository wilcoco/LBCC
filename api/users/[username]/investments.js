const { UserModel, ContentModel } = require('../../../db/mongodb');

export default async function handler(req, res) {
    // CORS 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    try {
        const { username } = req.query;
        
        // 사용자 찾기
        const user = await UserModel.findByUsername(username);
        if (!user) {
            return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
        }

        // 투자한 컨텐츠 정보와 함께 반환
        const investmentDetails = [];
        if (user.investments && user.investments.length > 0) {
            for (const investment of user.investments) {
                const content = await ContentModel.findById(investment.contentId);
                investmentDetails.push({
                    ...investment,
                    contentTitle: content ? content.title : '삭제된 컨텐츠',
                    contentAuthor: content ? content.author : 'Unknown'
                });
            }
        }

        res.json({
            totalInvested: user.totalInvested || 0,
            totalDividends: user.totalDividends || 0,
            investmentCount: user.investments ? user.investments.length : 0,
            investments: investmentDetails
        });

    } catch (error) {
        console.error('User investments API error:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
}
