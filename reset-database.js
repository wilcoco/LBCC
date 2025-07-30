const { getPool } = require('./db/postgresql');

async function resetDatabase() {
    const client = getPool();
    
    try {
        console.log('🗑️ 데이터베이스 초기화 시작...');
        
        // 모든 테이블의 데이터 삭제 (순서 중요 - 외래키 제약 고려)
        await client.query('DELETE FROM coefficient_history');
        console.log('✅ coefficient_history 테이블 초기화 완료');
        
        await client.query('DELETE FROM investments');
        console.log('✅ investments 테이블 초기화 완료');
        
        await client.query('DELETE FROM content');
        console.log('✅ content 테이블 초기화 완료');
        
        await client.query('DELETE FROM users');
        console.log('✅ users 테이블 초기화 완료');
        
        // 시퀀스 초기화 (ID 카운터 리셋)
        await client.query('ALTER SEQUENCE users_id_seq RESTART WITH 1');
        await client.query('ALTER SEQUENCE content_id_seq RESTART WITH 1');
        await client.query('ALTER SEQUENCE investments_id_seq RESTART WITH 1');
        await client.query('ALTER SEQUENCE coefficient_history_id_seq RESTART WITH 1');
        console.log('✅ 모든 시퀀스 초기화 완료');
        
        console.log('🎉 데이터베이스 초기화 완료! 모든 사용자 및 데이터가 삭제되었습니다.');
        
    } catch (error) {
        console.error('❌ 데이터베이스 초기화 실패:', error);
        throw error;
    }
}

// 스크립트 직접 실행 시
if (require.main === module) {
    resetDatabase()
        .then(() => {
            console.log('✅ 초기화 완료 - 서버를 재시작하세요!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ 초기화 실패:', error);
            process.exit(1);
        });
}

module.exports = { resetDatabase };
