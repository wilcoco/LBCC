const { MongoClient } = require('mongodb');

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
    if (cachedClient && cachedDb) {
        return { client: cachedClient, db: cachedDb };
    }

    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('MONGODB_URI 환경변수가 설정되지 않았습니다.');
    }

    const client = new MongoClient(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });

    await client.connect();
    const db = client.db('cams-work-journal');

    cachedClient = client;
    cachedDb = db;

    return { client, db };
}

// 사용자 컬렉션 관리
class UserModel {
    static async create(userData) {
        const { db } = await connectToDatabase();
        const result = await db.collection('users').insertOne({
            ...userData,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        return result;
    }

    static async findByUsername(username) {
        const { db } = await connectToDatabase();
        return await db.collection('users').findOne({ username });
    }

    static async updateBalance(username, newBalance) {
        const { db } = await connectToDatabase();
        return await db.collection('users').updateOne(
            { username },
            { 
                $set: { balance: newBalance, updatedAt: new Date() }
            }
        );
    }

    static async addInvestment(username, investment) {
        const { db } = await connectToDatabase();
        return await db.collection('users').updateOne(
            { username },
            { 
                $push: { investments: investment },
                $inc: { totalInvested: investment.amount },
                $set: { updatedAt: new Date() }
            }
        );
    }

    static async addDividend(username, amount) {
        const { db } = await connectToDatabase();
        return await db.collection('users').updateOne(
            { username },
            { 
                $inc: { 
                    balance: amount,
                    totalDividends: amount 
                },
                $set: { updatedAt: new Date() }
            }
        );
    }
}

// 컨텐츠 컬렉션 관리
class ContentModel {
    static async create(contentData) {
        const { db } = await connectToDatabase();
        const result = await db.collection('contents').insertOne({
            ...contentData,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        return result;
    }

    static async findAll() {
        const { db } = await connectToDatabase();
        return await db.collection('contents').find({}).sort({ createdAt: -1 }).toArray();
    }

    static async findById(id) {
        const { db } = await connectToDatabase();
        return await db.collection('contents').findOne({ id: parseInt(id) });
    }

    static async updateInvestment(contentId, investorData, newTotalInvestment) {
        const { db } = await connectToDatabase();
        return await db.collection('contents').updateOne(
            { id: parseInt(contentId) },
            { 
                $set: {
                    [`investors.${investorData.investor}`]: investorData.amount,
                    totalInvestment: newTotalInvestment,
                    updatedAt: new Date()
                },
                $push: {
                    investmentHistory: {
                        investor: investorData.investor,
                        amount: investorData.amount,
                        timestamp: new Date().toISOString(),
                        totalInvestmentAfter: newTotalInvestment
                    }
                }
            }
        );
    }

    static async getNextId() {
        const { db } = await connectToDatabase();
        const counter = await db.collection('counters').findOneAndUpdate(
            { _id: 'contentId' },
            { $inc: { seq: 1 } },
            { upsert: true, returnDocument: 'after' }
        );
        return counter.value.seq;
    }
}

module.exports = {
    connectToDatabase,
    UserModel,
    ContentModel
};
