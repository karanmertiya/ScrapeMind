// popup.js
document.addEventListener('DOMContentLoaded', () => {
    const btnLaunch = document.getElementById('btn-launch');
    const statusDiv = document.getElementById('status');

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        
        // Call your background.js scraper
        chrome.runtime.sendMessage({ action: 'GET_PAGE_INFO', tabId: activeTab.id }, (response) => {
            if (response && response.type === 'yt_playlist') {
                statusDiv.innerText = `Found Playlist: ${response.videoCount} videos`;
                btnLaunch.classList.remove('hidden');
                btnLaunch.disabled = false;
                
                btnLaunch.onclick = () => {
                    chrome.tabs.sendMessage(activeTab.id, { action: 'LAUNCH_OS', videos: response.videos });
                    window.close(); 
                };
            } else if (response && response.videoId) {
                statusDiv.innerText = `Found Single Video`;
                btnLaunch.classList.remove('hidden');
                btnLaunch.disabled = false;
                
                btnLaunch.onclick = () => {
                    chrome.tabs.sendMessage(activeTab.id, { 
                        action: 'LAUNCH_OS', 
                        videos: [{ id: response.videoId, title: response.title || 'Video' }] 
                    });
                    window.close();
                };
            } else {
                statusDiv.innerText = "No YouTube video/playlist detected.";
            }
        });
    });
});