// background.js

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'GET_PAGE_INFO') {
    getPageInfo(msg.tabId).then(sendResponse);
    return true; // Keep the message channel open for the async response
  }
});

async function getPageInfo(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const url = new URL(tab.url);
  
  if (url.hostname.includes('youtube.com')) {
    const vId = url.searchParams.get('v');
    const lId = url.searchParams.get('list');
    
    // If it's a playlist, inject a script to scrape all video titles and IDs
    if (lId) {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Grab the actual video title elements in the playlist
          const items = Array.from(document.querySelectorAll('ytd-playlist-video-renderer #video-title'));
          const videos = items.map(a => {
            const urlObj = new URL(a.href, window.location.origin);
            return { 
              id: urlObj.searchParams.get('v'), 
              title: a.title || a.textContent.trim() 
            };
          }).filter(v => v.id && v.id.length === 11);
          
          // Remove duplicates
          const uniqueVideos = [];
          const seen = new Set();
          for (const v of videos) { 
            if (!seen.has(v.id)) { 
              seen.add(v.id); 
              uniqueVideos.push(v); 
            } 
          }
          
          return { 
            videoCount: uniqueVideos.length, 
            videos: uniqueVideos, 
            title: document.title.replace(' - YouTube', '') 
          };
        }
      });
      return { type: 'yt_playlist', listId: lId, videoId: vId, ...(res?.result || {}) };
    } 
    
    // If it's just a single video (no list ID), return just that video's info
    if (vId) {
       return { 
         type: 'yt_single', 
         videoId: vId, 
         title: tab.title.replace(' - YouTube', '') 
       };
    }
  }
  
  return { type: 'unknown' };
}