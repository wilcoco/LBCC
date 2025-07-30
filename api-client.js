// API 클라이언트 - 서버와 통신하는 함수들

const API_BASE = window.location.origin + '/api';

class APIClient {
    // 사용자 등록
    static async register(username) {
        try {
            const response = await fetch(`${API_BASE}/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username })
            });
            
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || '등록 실패');
            }
            
            return data;
        } catch (error) {
            console.error('Register error:', error);
            throw error;
        }
    }
    
    // 사용자 로그인
    static async login(username) {
        try {
            const response = await fetch(`${API_BASE}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username })
            });
            
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || '로그인 실패');
            }
            
            return data;
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }
    
    // 모든 컨텐츠 조회
    static async getContents() {
        try {
            const response = await fetch(`${API_BASE}/contents`);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || '컨텐츠 조회 실패');
            }
            
            return data;
        } catch (error) {
            console.error('Get contents error:', error);
            throw error;
        }
    }
    
    // 컨텐츠 생성
    static async createContent(contentData) {
        try {
            const response = await fetch(`${API_BASE}/contents`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(contentData)
            });
            
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || '컨텐츠 생성 실패');
            }
            
            return data;
        } catch (error) {
            console.error('Create content error:', error);
            throw error;
        }
    }
    
    // 투자하기
    static async invest(contentId, amount, username) {
        try {
            const response = await fetch(`${API_BASE}/invest`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ contentId, amount, username })
            });
            
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || '투자 실패');
            }
            
            return data;
        } catch (error) {
            console.error('Investment error:', error);
            throw error;
        }
    }
    
    // 사용자 정보 조회
    static async getUser(username) {
        try {
            const response = await fetch(`${API_BASE}/users/${username}`);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || '사용자 정보 조회 실패');
            }
            
            return data;
        } catch (error) {
            console.error('Get user error:', error);
            throw error;
        }
    }
    
    // 사용자 투자 현황 조회
    static async getUserInvestments(username) {
        try {
            const response = await fetch(`${API_BASE}/users/${username}/investments`);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || '투자 현황 조회 실패');
            }
            
            return data;
        } catch (error) {
            console.error('Get user investments error:', error);
            throw error;
        }
    }
    
    // 🎯 사용자 성과 및 계수 정보 조회
    static async getUserPerformance(username) {
        try {
            const response = await fetch(`${API_BASE}/users/${username}/performance`);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || '성과 정보 조회 실패');
            }
            
            return data;
        } catch (error) {
            console.error('Get user performance error:', error);
            throw error;
        }
    }
    
    // 📊 컨텐츠별 효과적 지분 조회
    static async getContentShares(contentId) {
        try {
            const response = await fetch(`${API_BASE}/contents/${contentId}/shares`);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || '지분 정보 조회 실패');
            }
            
            return data;
        } catch (error) {
            console.error('Get content shares error:', error);
            throw error;
        }
    }
    
    // 🔄 계수 배치 업데이트 (관리자용)
    static async updateCoefficients() {
        try {
            const response = await fetch(`${API_BASE}/admin/update-coefficients`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || '계수 업데이트 실패');
            }
            
            return data;
        } catch (error) {
            console.error('Update coefficients error:', error);
            throw error;
        }
    }
}

// 전역에서 사용할 수 있도록 export
window.APIClient = APIClient;
