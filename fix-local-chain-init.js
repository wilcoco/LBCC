// 로컬 체인 초기화 수정 스크립트
// 이 코드를 script.js의 register() 및 login() 함수에 추가해야 합니다.

// 회원가입 함수 (라인 149 이후에 추가)
/*
            localStorage.setItem('currentUser', username.trim());
            
            // 새 사용자를 위한 로컬 체인 초기화
            if (typeof this.initializeLocalChain === 'function') {
                this.initializeLocalChain();
            }
            
            // 컨텐츠 목록 새로고침
*/

// 로그인 함수 (라인 175 이후에 추가)
/*
            localStorage.setItem('currentUser', username.trim());
            
            // 새 사용자를 위한 로컬 체인 초기화
            if (typeof this.initializeLocalChain === 'function') {
                this.initializeLocalChain();
            }
            
            // 컨텐츠 목록 새로고침
*/

console.log('로컬 체인 초기화 수정 가이드:');
console.log('1. script.js 파일의 register() 함수 (라인 149 이후)');
console.log('2. script.js 파일의 login() 함수 (라인 175 이후)');
console.log('위 두 곳에 로컬 체인 초기화 코드를 추가하세요.');
