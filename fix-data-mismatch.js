// 신규 사용자 데이터 불일치 문제 해결 방안
// 
// 문제 원인:
// 1. 신규 사용자가 투자할 때 로컬 체인에 이전 사용자 데이터가 남아있음
// 2. 투자 후 서버 동기화 타이밍 문제
//
// 해결 방안:

// 1. script.js의 register() 함수 수정 (라인 149 이후에 추가)
/*
localStorage.setItem('currentUser', username.trim());

// 새 사용자를 위한 로컬 체인 초기화
if (typeof this.initializeLocalChain === 'function') {
    this.initializeLocalChain();
}

// 컨텐츠 목록 새로고침
*/

// 2. script.js의 login() 함수 수정 (라인 175 이후에 추가)
/*
localStorage.setItem('currentUser', username.trim());

// 새 사용자를 위한 로컬 체인 초기화  
if (typeof this.initializeLocalChain === 'function') {
    this.initializeLocalChain();
}

// 컨텐츠 목록 새로고침
*/

// 3. local-chain-integration.js의 투자 검증 로직 수정
// 현재 코드에서 setTimeout을 1000ms로 늘리거나 검증 조건을 완화

// 4. 임시 해결책: 로컬 체인 수동 초기화 함수
function clearLocalChainForNewUser(username) {
    const storageKey = `localChain_${username}`;
    localStorage.removeItem(storageKey);
    console.log(`🔄 ${username} 로컬 체인 초기화 완료`);
    
    // 페이지 새로고침으로 완전 초기화
    if (confirm('로컬 체인을 완전히 초기화하려면 페이지를 새로고침합니다. 계속하시겠습니까?')) {
        window.location.reload();
    }
}

// 5. 브라우저 콘솔에서 실행할 수 있는 긴급 수정 함수
window.fixDataMismatch = function() {
    if (window.laborValueSystem && window.laborValueSystem.currentUser) {
        const username = window.laborValueSystem.currentUser;
        clearLocalChainForNewUser(username);
    } else {
        alert('현재 로그인된 사용자가 없습니다.');
    }
};

console.log('🔧 데이터 불일치 수정 도구 로드됨');
console.log('브라우저 콘솔에서 fixDataMismatch() 함수를 실행하여 긴급 수정 가능');
