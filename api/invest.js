const { UserModel, ContentModel } = require('../db/mongodb');

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
        const { contentId, amount, investor } = req.body;
        
        // 컨텐츠 찾기
        const content = await ContentModel.findById(contentId);
        if (!content) {
            return res.status(404).json({ success: false, message: '컨텐츠를 찾을 수 없습니다.' });
        }
        
        // 사용자 찾기
        const user = await UserModel.findByUsername(investor);
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
        const totalInvestmentBefore = content.totalInvestment || 0;
        if (totalInvestmentBefore > 0 && content.investors) {
            for (const [investorName, investorAmount] of Object.entries(content.investors)) {
                const share = investorAmount / totalInvestmentBefore;
                const dividend = Math.floor(investAmount * share);
                
                if (dividend > 0) {
                    await UserModel.addDividend(investorName, dividend);
                }
            }
        }
        
        // 투자자 잔액 업데이트
        const newBalance = user.balance - investAmount;
        await UserModel.updateBalance(investor, newBalance);
        
        // 투자 기록 추가
        const investment = {
            contentId: contentId,
            amount: investAmount,
            timestamp: new Date().toISOString()
        };
        await UserModel.addInvestment(investor, investment);
        
        // 컨텐츠 투자 정보 업데이트
        const newTotalInvestment = totalInvestmentBefore + investAmount;
        const currentInvestorAmount = content.investors?.[investor] || 0;
        const newInvestorAmount = currentInvestorAmount + investAmount;
        
        await ContentModel.updateInvestment(contentId, {
            investor: investor,
            amount: newInvestorAmount
        }, newTotalInvestment);
        
        // 업데이트된 컨텐츠 정보 가져오기
        const updatedContent = await ContentModel.findById(contentId);
        
        res.json({ 
            success: true, 
            message: `${investAmount} 코인을 투자했습니다.`,
            newBalance: newBalance,
            content: updatedContent
        });

    } catch (error) {
        console.error('Investment error:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
}
