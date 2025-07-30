const { ContentModel } = require('../db/mongodb');

export default async function handler(req, res) {
    // CORS 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        if (req.method === 'GET') {
            // 컨텐츠 목록 조회
            const contents = await ContentModel.findAll();
            
            // 투자자 정보 계산
            const processedContents = contents.map(content => {
                const investors = content.investors || {};
                const investorEntries = Object.entries(investors);
                
                return {
                    ...content,
                    investorCount: investorEntries.length,
                    topInvestors: investorEntries
                        .map(([name, amount]) => ({ name, amount }))
                        .sort((a, b) => b.amount - a.amount)
                        .slice(0, 5)
                };
            });

            res.json(processedContents);

        } else if (req.method === 'POST') {
            // 컨텐츠 생성
            const { title, content, url, tags, files, author } = req.body;
            
            if (!title || title.trim() === '') {
                return res.status(400).json({ success: false, message: '제목을 입력해주세요.' });
            }
            
            if (!author) {
                return res.status(400).json({ success: false, message: '작성자 정보가 필요합니다.' });
            }

            const nextId = await ContentModel.getNextId();
            
            const newContent = {
                id: nextId,
                title: title.trim(),
                content: content || '',
                url: url || '',
                tags: tags || [],
                files: files || [],
                author: author,
                totalInvestment: 0,
                investors: {},
                investorCount: 0,
                topInvestors: [],
                investmentHistory: []
            };
            
            await ContentModel.create(newContent);
            
            res.json({ 
                success: true, 
                message: '컨텐츠가 성공적으로 생성되었습니다.',
                content: newContent
            });

        } else {
            res.status(405).json({ success: false, message: 'Method not allowed' });
        }

    } catch (error) {
        console.error('Contents API error:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
}
