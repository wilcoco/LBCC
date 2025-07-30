# 🚀 캠스 업무 일지 - Vercel + MongoDB 배포 가이드

## 배포 환경
- **호스팅**: Vercel (무료 티어)
- **데이터베이스**: MongoDB Atlas (무료 티어 512MB)
- **프레임워크**: Node.js + Express (서버리스 함수)

## 1단계: MongoDB Atlas 설정

### 1.1 MongoDB Atlas 계정 생성
1. [MongoDB Atlas](https://www.mongodb.com/atlas) 접속
2. 무료 계정 생성
3. "Build a Database" 클릭
4. **FREE** 티어 선택 (M0 Sandbox - 512MB)
5. 클라우드 제공업체: **AWS** (기본값)
6. 지역: **Seoul (ap-northeast-2)** 선택
7. 클러스터 이름: `cams-work-journal`

### 1.2 데이터베이스 사용자 생성
1. Database Access 메뉴 이동
2. "Add New Database User" 클릭
3. Authentication Method: **Password**
4. Username: `cams-admin`
5. Password: 강력한 비밀번호 생성 (기록해두기!)
6. Database User Privileges: **Read and write to any database**

### 1.3 네트워크 접근 설정
1. Network Access 메뉴 이동
2. "Add IP Address" 클릭
3. **"Allow access from anywhere"** 선택 (0.0.0.0/0)
4. Comment: `Vercel deployment`

### 1.4 연결 문자열 복사
1. Clusters 메뉴로 돌아가기
2. "Connect" 버튼 클릭
3. "Connect your application" 선택
4. Driver: **Node.js**, Version: **4.1 or later**
5. 연결 문자열 복사:
   ```
   mongodb+srv://cams-admin:<password>@cams-work-journal.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. `<password>` 부분을 실제 비밀번호로 교체

## 2단계: Vercel 배포

### 2.1 GitHub 리포지토리 푸시
```bash
git add .
git commit -m "feat: Vercel + MongoDB 배포 준비 완료"
git push origin master
```

### 2.2 Vercel 계정 생성 및 연결
1. [Vercel](https://vercel.com) 접속
2. GitHub 계정으로 로그인
3. "New Project" 클릭
4. GitHub 리포지토리 선택: `windsurf-project`
5. Import 클릭

### 2.3 환경변수 설정
1. Vercel 프로젝트 설정 페이지에서 "Environment Variables" 탭
2. 새 환경변수 추가:
   - **Name**: `MONGODB_URI`
   - **Value**: MongoDB 연결 문자열 (1.4에서 복사한 것)
   - **Environments**: Production, Preview, Development 모두 체크

### 2.4 배포 실행
1. "Deploy" 버튼 클릭
2. 배포 완료 대기 (약 2-3분)
3. 배포 완료 후 도메인 확인: `https://your-project-name.vercel.app`

## 3단계: 배포 확인

### 3.1 기능 테스트
1. 웹사이트 접속
2. 사용자 등록/로그인 테스트
3. 컨텐츠 생성 테스트
4. 투자 기능 테스트
5. 로컬 체인 기능 확인

### 3.2 MongoDB 데이터 확인
1. MongoDB Atlas 대시보드
2. Collections 탭에서 데이터 확인:
   - `users` 컬렉션
   - `contents` 컬렉션
   - `counters` 컬렉션

## 4단계: 도메인 설정 (선택사항)

### 4.1 커스텀 도메인 연결
1. Vercel 프로젝트 설정에서 "Domains" 탭
2. 원하는 도메인 추가
3. DNS 설정 업데이트

## 🎯 배포 완료!

배포가 완료되면 다음 주소에서 **캠스 업무 일지**를 사용할 수 있습니다:
- **임시 도메인**: `https://cams-work-journal.vercel.app`
- **기능**: 로컬 체인, 투자 시스템, 배당 분배, 사용자 주권

## 🔧 문제 해결

### MongoDB 연결 오류
- 연결 문자열의 비밀번호 확인
- IP 주소 허용 설정 확인
- 사용자 권한 확인

### Vercel 배포 오류
- 환경변수 설정 확인
- 빌드 로그 확인
- API 경로 확인

### 로컬 체인 오류
- 브라우저 콘솔 확인
- localStorage 권한 확인
- JavaScript 파일 로딩 확인
