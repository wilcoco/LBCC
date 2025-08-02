// 투자신용도 계수 업데이트 문제 해결 방안
//
// 현재 문제점:
// 1. 신규 사용자는 투자 기록이 없어서 항상 1.0 계수
// 2. 후속 투자가 없으면 계수 변화 없음
// 3. 캐시로 인한 즉시 반영 안됨
//
// 해결 방안:

// 1. db/postgresql.js의 calculateUserPerformance 함수 수정
// 기존 코드를 다음과 같이 개선:

/*
static async calculateUserPerformance(username, daysPeriod = 30) {
    const client = getPool();
    
    console.log(`🔍 ${username} 성과 계산 시작 (기간: ${daysPeriod}일)`);
    
    // 최근 N일간 투자 성과 계산
    const result = await client.query(`
        SELECT 
            i.content_id,
            i.amount,
            i.created_at,
            (
                SELECT COALESCE(SUM(i2.amount), 0)
                FROM investments i2 
                WHERE i2.content_id = i.content_id 
                AND i2.created_at > i.created_at
            ) as subsequent_investments
        FROM investments i
        WHERE i.username = $1 
        AND i.created_at > NOW() - INTERVAL '$2 days'
        ORDER BY i.created_at DESC
    `, [username, daysPeriod]);
    
    console.log(`📊 ${username} 투자 기록: ${result.rows.length}건`);
    
    // 신규 사용자 또는 투자 기록이 적은 경우 개선된 로직
    if (result.rows.length === 0) {
        console.log(`⚠️ ${username} 투자 기록 없음 - 신규 사용자 계수 1.0 반환`);
        return 1.0;
    }
    
    if (result.rows.length < 3) {
        // 투자 횟수가 적은 경우 보너스 적용
        console.log(`🆕 ${username} 신규 투자자 - 학습 보너스 적용`);
        return 1.1; // 신규 투자자 보너스
    }
    
    // 기존 로직 유지하되, 최소 계수 보장
    let totalScore = 0;
    let totalWeight = 0;
    let goodInvestments = 0;
    let totalInvestments = result.rows.length;
    
    result.rows.forEach((investment, index) => {
        const attractionRate = investment.subsequent_investments / investment.amount;
        const daysSince = (Date.now() - new Date(investment.created_at).getTime()) / (24 * 60 * 60 * 1000);
        const timeWeight = Math.exp(-daysSince / 7);
        
        console.log(`  📈 투자 ${index + 1}: ${investment.amount}코인 → +${investment.subsequent_investments}코인 (비율: ${attractionRate.toFixed(2)})`);
        
        if (attractionRate >= 0.3) { // 기준을 50%에서 30%로 완화
            goodInvestments++;
        }
        
        totalScore += attractionRate * timeWeight;
        totalWeight += timeWeight;
    });
    
    const averagePerformance = totalWeight > 0 ? totalScore / totalWeight : 0;
    const successRate = goodInvestments / totalInvestments;
    
    console.log(`📊 ${username} 성과 분석:`);
    console.log(`  - 평균 매력도: ${averagePerformance.toFixed(4)}`);
    console.log(`  - 성공률: ${(successRate * 100).toFixed(1)}% (${goodInvestments}/${totalInvestments})`);
    
    // 개선된 계수 계산
    let baseCoefficient = 0.9 + (averagePerformance * 0.3); // 0.9 ~ 1.2 기본 범위
    let successBonus = successRate * 0.4; // 최대 0.4 보너스
    let activityBonus = Math.min(totalInvestments / 10, 0.2); // 활동성 보너스 (최대 0.2)
    
    let finalCoefficient = baseCoefficient + successBonus + activityBonus;
    
    // 계수 범위 제한 (0.5 ~ 3.0으로 조정)
    finalCoefficient = Math.max(0.5, Math.min(3.0, finalCoefficient));
    
    console.log(`🎯 ${username} 최종 계수: ${finalCoefficient.toFixed(4)} (기본: ${baseCoefficient.toFixed(4)} + 성공: ${successBonus.toFixed(4)} + 활동: ${activityBonus.toFixed(4)})`);
    
    return finalCoefficient;
}
*/

// 2. coefficient-calculator.js의 캐시 시간 단축
// getUserCoefficient 함수에서 캐시 시간을 5분에서 1분으로 단축:

/*
if (cached && (Date.now() - cached.timestamp) < 60000) { // 1분 캐시로 단축
    return cached.coefficient;
}
*/

// 3. 브라우저 콘솔에서 즉시 테스트할 수 있는 함수
window.testCoefficientUpdate = async function(username) {
    if (!username) {
        username = laborValueSystem.currentUser;
    }
    
    if (!username) {
        console.log('❌ 사용자명이 필요합니다.');
        return;
    }
    
    try {
        console.log(`🔍 ${username} 계수 업데이트 테스트 시작...`);
        
        // 서버에 계수 업데이트 요청
        const response = await fetch('/api/admin/update-coefficients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ 계수 업데이트 완료:', result);
            
            // UI 새로고침
            if (laborValueSystem && typeof laborValueSystem.updateCoefficientDisplay === 'function') {
                await laborValueSystem.updateCoefficientDisplay();
            }
        } else {
            console.log('⚠️ 계수 업데이트 실패:', response.status);
        }
        
    } catch (error) {
        console.error('❌ 계수 업데이트 오류:', error);
    }
};

// 4. 투자 후 즉시 계수 업데이트 강제 실행
window.forceRefreshCoefficient = function() {
    if (laborValueSystem && laborValueSystem.currentUser) {
        // 캐시 클리어
        const cacheKey = `coeff_${laborValueSystem.currentUser}`;
        if (window.coefficientCache) {
            delete window.coefficientCache[cacheKey];
        }
        
        // UI 새로고침
        if (typeof laborValueSystem.updateCoefficientDisplay === 'function') {
            laborValueSystem.updateCoefficientDisplay();
        }
        
        console.log('🔄 계수 정보 강제 새로고침 완료');
    }
};

console.log('🔧 계수 업데이트 수정 도구 로드됨');
console.log('브라우저 콘솔에서 다음 함수들을 사용할 수 있습니다:');
console.log('- testCoefficientUpdate(): 계수 업데이트 테스트');
console.log('- forceRefreshCoefficient(): 계수 정보 강제 새로고침');
