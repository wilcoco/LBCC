// 간단한 미디어 삽입 함수들 - 링크 입력만

function insertImageDialog() {
    const url = prompt('이미지 URL을 입력하세요:');
    if (url) {
        insertImageAtCursor(url);
    }
}

function insertVideoDialog() {
    const url = prompt('동영상 URL을 입력하세요:\n\n지원 형식:\n- YouTube: https://www.youtube.com/watch?v=...\n- 직접 링크: .mp4, .webm, .ogg 파일');
    if (url) {
        insertVideoAtCursorImproved(url);
    }
}

// 개선된 동영상 삽입 함수
function insertVideoAtCursor(src, title = '') {
    const editor = document.getElementById('rich-editor');
    
    // YouTube URL 처리
    if (src.includes('youtube.com/watch') || src.includes('youtu.be/')) {
        const videoId = extractYouTubeId(src);
        if (videoId) {
            const iframe = document.createElement('iframe');
            iframe.src = `https://www.youtube.com/embed/${videoId}`;
            iframe.width = '100%';
            iframe.height = '315';
            iframe.style.maxWidth = '600px';
            iframe.style.margin = '10px 0';
            iframe.style.borderRadius = '8px';
            iframe.frameBorder = '0';
            iframe.allowFullscreen = true;
            iframe.classList.add('inline-media');
            insertElementAtCursor(iframe);
            return;
        }
    }
    
    // Vimeo URL 처리
    if (src.includes('vimeo.com/')) {
        const videoId = extractVimeoId(src);
        if (videoId) {
            const iframe = document.createElement('iframe');
            iframe.src = `https://player.vimeo.com/video/${videoId}`;
            iframe.width = '100%';
            iframe.height = '315';
            iframe.style.maxWidth = '600px';
            iframe.style.margin = '10px 0';
            iframe.style.borderRadius = '8px';
            iframe.frameBorder = '0';
            iframe.allowFullscreen = true;
            iframe.classList.add('inline-media');
            insertElementAtCursor(iframe);
            return;
        }
    }
    
    // 일반 동영상 파일 처리
    const video = document.createElement('video');
    video.controls = true;
    video.style.width = '100%';
    video.style.maxWidth = '600px';
    video.style.height = 'auto';
    video.style.margin = '10px 0';
    video.style.borderRadius = '8px';
    video.classList.add('inline-media');
    if (title) video.title = title;
    
    // 다양한 형식 지원을 위한 source 태그
    const source = document.createElement('source');
    source.src = src;
    
    // 파일 확장자에 따른 MIME 타입 설정
    const ext = src.split('.').pop().toLowerCase();
    switch(ext) {
        case 'mp4':
            source.type = 'video/mp4';
            break;
        case 'webm':
            source.type = 'video/webm';
            break;
        case 'ogg':
        case 'ogv':
            source.type = 'video/ogg';
            break;
        case 'mov':
            source.type = 'video/quicktime';
            break;
        case 'avi':
            source.type = 'video/x-msvideo';
            break;
        default:
            source.type = 'video/mp4';
    }
    
    video.appendChild(source);
    
    // 오류 처리
    video.onerror = function() {
        const errorMsg = document.createElement('div');
        errorMsg.innerHTML = `
            <div style="background: #fee2e2; border: 1px solid #fca5a5; padding: 15px; border-radius: 8px; margin: 10px 0; color: #991b1b;">
                <strong>⚠️ 동영상을 재생할 수 없습니다</strong><br>
                <small>지원되는 형식: MP4, WebM, OGG<br>
                또는 YouTube, Vimeo 링크를 사용해보세요.</small><br>
                <a href="${src}" target="_blank" style="color: #2563eb; text-decoration: underline;">원본 링크 보기</a>
            </div>
        `;
        video.parentNode.replaceChild(errorMsg, video);
    };
    
    insertElementAtCursor(video);
}

// YouTube ID 추출 함수
function extractYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// Vimeo ID 추출 함수
function extractVimeoId(url) {
    const regExp = /vimeo.com\/(\d+)/;
    const match = url.match(regExp);
    return match ? match[1] : null;
}

function insertAudioDialog() {
    const url = prompt('음악 URL을 입력하세요:');
    if (url) {
        insertAudioAtCursor(url);
    }
}
